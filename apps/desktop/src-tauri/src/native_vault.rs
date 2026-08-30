use std::{
    collections::{HashMap, HashSet},
    ffi::OsString,
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};

use crate::{
    native_secrets::{NativeSecretError, NativeSecretService},
    native_storage::{
        NativeSession, NativeStorageLayout, NativeStorageService, open_database_connection,
    },
};

pub const NATIVE_VAULT_PROTOCOL_VERSION: u16 = 1;

const MAX_REQUEST_ID_BYTES: usize = 64;
const MAX_CONFIRMATION_BYTES: usize = 520;
const MAX_PROVIDER_IDS: usize = 64;
const MAX_ACTIVE_PREVIEWS: usize = 16;
const PROVIDER_SECRET_REGISTRY_KEY: &str = "provider-secret-registry.v1";
const BACKUP_FILE_PREFIX: &str = "backup-";
const BACKUP_FILE_SUFFIX: &str = ".coredrill-db";
const DELETION_STATE_FILE: &str = "deletion-state";
const STAGING_STATE: &[u8] = b"staging";
const PURGE_APPROVED_STATE: &[u8] = b"purge-approved";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeVaultRequest {
    pub protocol_version: u16,
    pub request_id: String,
    pub operation: NativeVaultOperation,
}

#[derive(Debug, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum NativeVaultOperation {
    PreviewDeletion {
        session_id: String,
        vault_id: String,
        preview_id: String,
    },
    Delete {
        session_id: String,
        vault_id: String,
        preview_id: String,
        deletion_id: String,
        confirmation: String,
    },
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeVaultDeletionInventory {
    pub attachment_files: u32,
    pub managed_backups: u32,
    pub provider_secrets: u32,
    pub shared_attachment_files: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeVaultResponse {
    pub protocol_version: u16,
    pub request_id: String,
    pub data: NativeVaultResponseData,
}

#[derive(Debug, Serialize)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum NativeVaultResponseData {
    DeletionPreview {
        preview_id: String,
        vault_id: String,
        vault_name: String,
        storage_mode: &'static str,
        inventory: NativeVaultDeletionInventory,
        last_successful_portable_export_at: Option<String>,
        required_confirmation: String,
    },
    Deleted {
        deletion_id: String,
        vault_id: String,
        status: &'static str,
        deleted: NativeVaultDeletionInventory,
        external_portable_archives_affected: bool,
    },
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeVaultError {
    pub code: String,
    pub message: String,
    pub retryable: bool,
}

impl NativeVaultError {
    fn new(code: &str, message: &str, retryable: bool) -> Self {
        Self {
            code: code.to_owned(),
            message: message.to_owned(),
            retryable,
        }
    }

    pub fn invalid_request() -> Self {
        Self::new(
            "invalid_request",
            "The native vault request is invalid.",
            false,
        )
    }

    fn not_found() -> Self {
        Self::new("not_found", "The local vault could not be found.", false)
    }

    fn busy() -> Self {
        Self::new(
            "busy",
            "The local vault is busy; close other work and retry.",
            true,
        )
    }

    fn permission_denied() -> Self {
        Self::new(
            "permission_denied",
            "Coredrill cannot remove all local vault data.",
            true,
        )
    }

    fn stale_preview() -> Self {
        Self::new(
            "stale_preview",
            "The vault changed after deletion was reviewed.",
            true,
        )
    }

    fn confirmation_mismatch() -> Self {
        Self::new(
            "confirmation_mismatch",
            "The typed vault deletion phrase does not match.",
            false,
        )
    }

    fn cleanup_failed() -> Self {
        Self::new(
            "cleanup_failed",
            "The vault was restored after local cleanup failed.",
            true,
        )
    }

    fn recovery_failed() -> Self {
        Self::new(
            "recovery_failed",
            "Coredrill could not finish deletion or fully restore the staged vault.",
            false,
        )
    }

    fn invalid_state() -> Self {
        Self::new(
            "invalid_state",
            "The local vault is not in a deletable state.",
            false,
        )
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct DeletionSnapshot {
    session_id: String,
    database_path: PathBuf,
    vault_id: String,
    vault_name: String,
    unshared_attachment_ids: Vec<String>,
    shared_attachment_ids: Vec<String>,
    managed_backups: u32,
    provider_ids: Vec<String>,
    present_provider_secrets: u32,
}

impl DeletionSnapshot {
    fn inventory(&self) -> Result<NativeVaultDeletionInventory, NativeVaultError> {
        Ok(NativeVaultDeletionInventory {
            attachment_files: u32::try_from(self.unshared_attachment_ids.len())
                .map_err(|_| NativeVaultError::invalid_state())?,
            managed_backups: self.managed_backups,
            provider_secrets: self.present_provider_secrets,
            shared_attachment_files: u32::try_from(self.shared_attachment_ids.len())
                .map_err(|_| NativeVaultError::invalid_state())?,
        })
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum DeletionFault {
    None,
    StageAfterFirst,
    Purge,
}

pub struct NativeVaultService {
    storage: Arc<NativeStorageService>,
    secrets: Arc<NativeSecretService>,
    previews: Mutex<HashMap<String, DeletionSnapshot>>,
    fault: DeletionFault,
}

impl NativeVaultService {
    pub fn new(storage: Arc<NativeStorageService>, secrets: Arc<NativeSecretService>) -> Self {
        cleanup_approved_staging(&storage.layout);
        Self {
            storage,
            secrets,
            previews: Mutex::new(HashMap::new()),
            fault: DeletionFault::None,
        }
    }

    #[cfg(test)]
    fn with_fault(
        storage: Arc<NativeStorageService>,
        secrets: Arc<NativeSecretService>,
        fault: DeletionFault,
    ) -> Self {
        Self {
            storage,
            secrets,
            previews: Mutex::new(HashMap::new()),
            fault,
        }
    }

    pub fn invoke(
        &self,
        request: NativeVaultRequest,
    ) -> Result<NativeVaultResponse, NativeVaultError> {
        validate_request(&request)?;
        let request_id = request.request_id;
        let data = match request.operation {
            NativeVaultOperation::PreviewDeletion {
                session_id,
                vault_id,
                preview_id,
            } => self.preview_deletion(session_id, vault_id, preview_id)?,
            NativeVaultOperation::Delete {
                session_id,
                vault_id,
                preview_id,
                deletion_id,
                confirmation,
            } => self.delete(session_id, vault_id, preview_id, deletion_id, confirmation)?,
        };
        Ok(NativeVaultResponse {
            protocol_version: NATIVE_VAULT_PROTOCOL_VERSION,
            request_id,
            data,
        })
    }

    fn preview_deletion(
        &self,
        session_id: String,
        vault_id: String,
        preview_id: String,
    ) -> Result<NativeVaultResponseData, NativeVaultError> {
        let snapshot = {
            let state = self
                .storage
                .state
                .lock()
                .map_err(|_| NativeVaultError::busy())?;
            let session = state
                .sessions
                .get(&session_id)
                .ok_or_else(NativeVaultError::not_found)?;
            if session.transaction_active {
                return Err(NativeVaultError::busy());
            }
            self.inspect_target(&session_id, session, &vault_id)?
        };
        let inventory = snapshot.inventory()?;
        let vault_name = snapshot.vault_name.clone();
        let required_confirmation = format!("DELETE {vault_name}");
        let mut previews = self
            .previews
            .lock()
            .map_err(|_| NativeVaultError::invalid_state())?;
        previews.insert(preview_id.clone(), snapshot);
        while previews.len() > MAX_ACTIVE_PREVIEWS {
            let Some(oldest) = previews.keys().next().cloned() else {
                break;
            };
            previews.remove(&oldest);
        }
        Ok(NativeVaultResponseData::DeletionPreview {
            preview_id,
            vault_id,
            vault_name,
            storage_mode: "desktop",
            inventory,
            last_successful_portable_export_at: None,
            required_confirmation,
        })
    }

    fn delete(
        &self,
        session_id: String,
        vault_id: String,
        preview_id: String,
        deletion_id: String,
        confirmation: String,
    ) -> Result<NativeVaultResponseData, NativeVaultError> {
        let preview = self
            .previews
            .lock()
            .map_err(|_| NativeVaultError::invalid_state())?
            .get(&preview_id)
            .cloned()
            .ok_or_else(NativeVaultError::stale_preview)?;
        if preview.session_id != session_id || preview.vault_id != vault_id {
            self.discard_preview(&preview_id);
            return Err(NativeVaultError::stale_preview());
        }
        if confirmation != format!("DELETE {}", preview.vault_name) {
            return Err(NativeVaultError::confirmation_mismatch());
        }

        let mut state = self
            .storage
            .state
            .lock()
            .map_err(|_| NativeVaultError::busy())?;
        let current = {
            let session = state
                .sessions
                .get(&session_id)
                .ok_or_else(NativeVaultError::stale_preview)?;
            if session.transaction_active {
                return Err(NativeVaultError::busy());
            }
            if state.sessions.iter().any(|(id, candidate)| {
                id != &session_id && candidate.database_path == preview.database_path
            }) {
                return Err(NativeVaultError::busy());
            }
            self.inspect_target(&session_id, session, &vault_id)?
        };
        if current != preview {
            self.discard_preview(&preview_id);
            return Err(NativeVaultError::stale_preview());
        }

        let session = state
            .sessions
            .remove(&session_id)
            .ok_or_else(NativeVaultError::stale_preview)?;
        let database_path = session.database_path.clone();
        drop(session);

        let staging_root = self.staging_root(&deletion_id)?;
        let staged = match self.stage_target(&preview, &staging_root) {
            Ok(staged) => staged,
            Err(error) => {
                let recovered = restore_staged_paths(&staging_root, &error.staged)
                    && restore_session(&mut state, &session_id, &database_path);
                self.discard_preview(&preview_id);
                return Err(if recovered {
                    error.error
                } else {
                    NativeVaultError::recovery_failed()
                });
            }
        };

        for provider_id in &preview.provider_ids {
            if self
                .secrets
                .delete_for_vault(&vault_id, provider_id)
                .is_err()
            {
                let recovered = restore_staged_paths(&staging_root, &staged)
                    && restore_session(&mut state, &session_id, &database_path);
                self.discard_preview(&preview_id);
                return Err(if recovered {
                    NativeVaultError::cleanup_failed()
                } else {
                    NativeVaultError::recovery_failed()
                });
            }
        }

        self.discard_preview(&preview_id);
        let purge_approved =
            fs::write(staging_root.join(DELETION_STATE_FILE), PURGE_APPROVED_STATE).is_ok();
        let status = if !purge_approved
            || self.fault == DeletionFault::Purge
            || fs::remove_dir_all(&staging_root).is_err()
        {
            "cleanup_pending"
        } else {
            "deleted"
        };
        Ok(NativeVaultResponseData::Deleted {
            deletion_id,
            vault_id,
            status,
            deleted: preview.inventory()?,
            external_portable_archives_affected: false,
        })
    }

    fn inspect_target(
        &self,
        session_id: &str,
        session: &NativeSession,
        expected_vault_id: &str,
    ) -> Result<DeletionSnapshot, NativeVaultError> {
        self.storage
            .layout
            .verify_database_path(&session.database_path)
            .map_err(|_| NativeVaultError::invalid_state())?;
        let (vault_id, vault_name) = read_single_vault(&session.connection)?;
        if vault_id != expected_vault_id {
            return Err(NativeVaultError::not_found());
        }
        let attachment_ids = read_attachment_ids(&session.connection, true)?;
        let other_attachment_ids =
            read_other_vault_attachment_ids(&self.storage.layout, &session.database_path)?;
        let mut unshared_attachment_ids = Vec::new();
        let mut shared_attachment_ids = Vec::new();
        for attachment_id in attachment_ids {
            let path = self
                .storage
                .layout
                .prepare_attachment_path(&attachment_id)
                .map_err(|_| NativeVaultError::invalid_state())?;
            require_regular_file(&path)?;
            if other_attachment_ids.contains(&attachment_id) {
                shared_attachment_ids.push(attachment_id);
            } else {
                unshared_attachment_ids.push(attachment_id);
            }
        }
        let managed_backups = inspect_backup_count(&self.storage.layout, &session.database_path)?;
        let provider_ids = read_provider_registry(&session.connection)?;
        let mut present_provider_secrets = 0_u32;
        for provider_id in &provider_ids {
            if self
                .secrets
                .status_for_vault(&vault_id, provider_id)
                .map_err(map_secret_error)?
            {
                present_provider_secrets = present_provider_secrets
                    .checked_add(1)
                    .ok_or_else(NativeVaultError::invalid_state)?;
            }
        }
        Ok(DeletionSnapshot {
            session_id: session_id.to_owned(),
            database_path: session.database_path.clone(),
            vault_id,
            vault_name,
            unshared_attachment_ids,
            shared_attachment_ids,
            managed_backups,
            provider_ids,
            present_provider_secrets,
        })
    }

    fn staging_root(&self, deletion_id: &str) -> Result<PathBuf, NativeVaultError> {
        validate_uuid(deletion_id)?;
        let staging_root = self
            .storage
            .layout
            .app_data_root()
            .join(format!(".vault-deletion-{deletion_id}"));
        if fs::symlink_metadata(&staging_root).is_ok() {
            return Err(NativeVaultError::invalid_state());
        }
        Ok(staging_root)
    }

    fn stage_target(
        &self,
        snapshot: &DeletionSnapshot,
        staging_root: &Path,
    ) -> Result<Vec<StagedPath>, StagingError> {
        fs::create_dir(staging_root).map_err(|_| StagingError::new(Vec::new()))?;
        if fs::write(staging_root.join(DELETION_STATE_FILE), STAGING_STATE).is_err() {
            let _ = fs::remove_dir(staging_root);
            return Err(StagingError::new(Vec::new()));
        }
        let mut staged = Vec::new();
        let database_paths = database_files(&snapshot.database_path);
        for (index, original) in database_paths.iter().enumerate() {
            if !path_exists(original).map_err(|_| StagingError::new(staged.clone()))? {
                continue;
            }
            require_regular_file(original).map_err(|_| StagingError::new(staged.clone()))?;
            let target = staging_root.join(format!("database-{index}"));
            stage_path(original, &target, &mut staged)?;
            if self.fault == DeletionFault::StageAfterFirst {
                return Err(StagingError::new(staged));
            }
        }
        for attachment_id in &snapshot.unshared_attachment_ids {
            let original = self
                .storage
                .layout
                .prepare_attachment_path(attachment_id)
                .map_err(|_| StagingError::new(staged.clone()))?;
            require_regular_file(&original).map_err(|_| StagingError::new(staged.clone()))?;
            let target = staging_root.join(format!("attachment-{attachment_id}"));
            stage_path(&original, &target, &mut staged)?;
        }
        let backup_directory = backup_directory(&self.storage.layout, &snapshot.database_path)
            .map_err(|_| StagingError::new(staged.clone()))?;
        if path_exists(&backup_directory).map_err(|_| StagingError::new(staged.clone()))? {
            inspect_backup_count(&self.storage.layout, &snapshot.database_path)
                .map_err(|_| StagingError::new(staged.clone()))?;
            stage_path(
                &backup_directory,
                &staging_root.join("managed-backups"),
                &mut staged,
            )?;
        }
        Ok(staged)
    }

    fn discard_preview(&self, preview_id: &str) {
        if let Ok(mut previews) = self.previews.lock() {
            previews.remove(preview_id);
        }
    }
}

#[derive(Clone, Debug)]
struct StagedPath {
    original: PathBuf,
    staged: PathBuf,
}

struct StagingError {
    error: NativeVaultError,
    staged: Vec<StagedPath>,
}

impl StagingError {
    fn new(staged: Vec<StagedPath>) -> Self {
        Self {
            error: NativeVaultError::permission_denied(),
            staged,
        }
    }
}

fn stage_path(
    original: &Path,
    target: &Path,
    staged: &mut Vec<StagedPath>,
) -> Result<(), StagingError> {
    fs::rename(original, target).map_err(|_| StagingError::new(staged.clone()))?;
    staged.push(StagedPath {
        original: original.to_path_buf(),
        staged: target.to_path_buf(),
    });
    Ok(())
}

fn restore_staged_paths(staging_root: &Path, staged: &[StagedPath]) -> bool {
    let mut restored = true;
    for path in staged.iter().rev() {
        if fs::rename(&path.staged, &path.original).is_err() {
            restored = false;
        }
    }
    if fs::remove_file(staging_root.join(DELETION_STATE_FILE)).is_err() {
        restored = false;
    }
    if restored && fs::remove_dir(staging_root).is_err() {
        restored = false;
    }
    restored
}

fn cleanup_approved_staging(layout: &NativeStorageLayout) {
    let Ok(entries) = fs::read_dir(layout.app_data_root()) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
            continue;
        };
        let Some(deletion_id) = name.strip_prefix(".vault-deletion-") else {
            continue;
        };
        if validate_uuid(deletion_id).is_err() {
            continue;
        }
        let Ok(metadata) = fs::symlink_metadata(&path) else {
            continue;
        };
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            continue;
        }
        if matches!(
            fs::read(path.join(DELETION_STATE_FILE)),
            Ok(state) if state == PURGE_APPROVED_STATE
        ) {
            let _ = fs::remove_dir_all(path);
        }
    }
}

fn restore_session(
    state: &mut crate::native_storage::NativeStorageState,
    session_id: &str,
    database_path: &Path,
) -> bool {
    let Ok(connection) = open_database_connection(database_path, false) else {
        return false;
    };
    state.sessions.insert(
        session_id.to_owned(),
        NativeSession {
            connection,
            database_path: database_path.to_path_buf(),
            transaction_active: false,
        },
    );
    true
}

fn read_single_vault(connection: &Connection) -> Result<(String, String), NativeVaultError> {
    let mut statement = connection
        .prepare("SELECT id, name FROM vault ORDER BY id")
        .map_err(|_| NativeVaultError::invalid_state())?;
    let mut rows = statement
        .query([])
        .map_err(|_| NativeVaultError::invalid_state())?;
    let first = rows
        .next()
        .map_err(|_| NativeVaultError::invalid_state())?
        .ok_or_else(NativeVaultError::not_found)?;
    let vault_id = first
        .get::<_, String>(0)
        .map_err(|_| NativeVaultError::invalid_state())?;
    let vault_name = first
        .get::<_, String>(1)
        .map_err(|_| NativeVaultError::invalid_state())?;
    if rows
        .next()
        .map_err(|_| NativeVaultError::invalid_state())?
        .is_some()
        || vault_name.trim().is_empty()
        || vault_name.len() > 512
        || vault_name.chars().any(char::is_control)
    {
        return Err(NativeVaultError::invalid_state());
    }
    validate_uuid(&vault_id)?;
    Ok((vault_id, vault_name))
}

fn read_attachment_ids(
    connection: &Connection,
    required: bool,
) -> Result<Vec<String>, NativeVaultError> {
    let exists = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'attachment_manifest')",
            [],
            |row| row.get::<_, bool>(0),
        )
        .map_err(|_| NativeVaultError::invalid_state())?;
    if !exists {
        return if required {
            Err(NativeVaultError::invalid_state())
        } else {
            Ok(Vec::new())
        };
    }
    let mut statement = connection
        .prepare("SELECT content_id FROM attachment_manifest ORDER BY content_id")
        .map_err(|_| NativeVaultError::invalid_state())?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|_| NativeVaultError::invalid_state())?;
    let mut ids = Vec::new();
    for row in rows {
        let id = row.map_err(|_| NativeVaultError::invalid_state())?;
        validate_attachment_id(&id)?;
        ids.push(id);
    }
    Ok(ids)
}

fn read_other_vault_attachment_ids(
    layout: &NativeStorageLayout,
    target_database: &Path,
) -> Result<HashSet<String>, NativeVaultError> {
    let mut ids = HashSet::new();
    let entries = fs::read_dir(layout.database_root()).map_err(|_| NativeVaultError::busy())?;
    for entry in entries {
        let entry = entry.map_err(|_| NativeVaultError::busy())?;
        let path = entry.path();
        if path == target_database {
            continue;
        }
        let metadata = fs::symlink_metadata(&path).map_err(|_| NativeVaultError::busy())?;
        if metadata.file_type().is_symlink() {
            return Err(NativeVaultError::invalid_state());
        }
        if !metadata.is_file()
            || path.extension().and_then(|value| value.to_str()) != Some("sqlite3")
        {
            continue;
        }
        layout
            .verify_database_path(&path)
            .map_err(|_| NativeVaultError::invalid_state())?;
        let connection = Connection::open_with_flags(
            &path,
            OpenFlags::SQLITE_OPEN_READ_ONLY
                | OpenFlags::SQLITE_OPEN_NO_MUTEX
                | OpenFlags::SQLITE_OPEN_NOFOLLOW,
        )
        .map_err(|_| NativeVaultError::busy())?;
        for id in read_attachment_ids(&connection, false)? {
            ids.insert(id);
        }
    }
    Ok(ids)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProviderSecretRegistry {
    version: u16,
    provider_ids: Vec<String>,
}

fn read_provider_registry(connection: &Connection) -> Result<Vec<String>, NativeVaultError> {
    let mut statement = connection
        .prepare("SELECT json_value FROM app_setting WHERE key = ?1")
        .map_err(|_| NativeVaultError::invalid_state())?;
    let mut rows = statement
        .query([PROVIDER_SECRET_REGISTRY_KEY])
        .map_err(|_| NativeVaultError::invalid_state())?;
    let Some(row) = rows.next().map_err(|_| NativeVaultError::invalid_state())? else {
        return Ok(Vec::new());
    };
    let json = row
        .get::<_, String>(0)
        .map_err(|_| NativeVaultError::invalid_state())?;
    if rows
        .next()
        .map_err(|_| NativeVaultError::invalid_state())?
        .is_some()
    {
        return Err(NativeVaultError::invalid_state());
    }
    let registry: ProviderSecretRegistry =
        serde_json::from_str(&json).map_err(|_| NativeVaultError::invalid_state())?;
    if registry.version != 1 || registry.provider_ids.len() > MAX_PROVIDER_IDS {
        return Err(NativeVaultError::invalid_state());
    }
    let mut previous: Option<&str> = None;
    for provider_id in &registry.provider_ids {
        validate_provider_id(provider_id)?;
        if previous.is_some_and(|value| value >= provider_id.as_str()) {
            return Err(NativeVaultError::invalid_state());
        }
        previous = Some(provider_id);
    }
    Ok(registry.provider_ids)
}

fn inspect_backup_count(
    layout: &NativeStorageLayout,
    database_path: &Path,
) -> Result<u32, NativeVaultError> {
    let directory = backup_directory(layout, database_path)?;
    if !path_exists(&directory)? {
        return Ok(0);
    }
    let metadata =
        fs::symlink_metadata(&directory).map_err(|_| NativeVaultError::invalid_state())?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(NativeVaultError::invalid_state());
    }
    let canonical = fs::canonicalize(&directory).map_err(|_| NativeVaultError::invalid_state())?;
    if !canonical.starts_with(layout.backup_root()) || canonical != directory {
        return Err(NativeVaultError::invalid_state());
    }
    let mut count = 0_u32;
    for entry in fs::read_dir(&directory).map_err(|_| NativeVaultError::invalid_state())? {
        let entry = entry.map_err(|_| NativeVaultError::invalid_state())?;
        require_regular_file(&entry.path())?;
        let name = entry
            .file_name()
            .into_string()
            .map_err(|_| NativeVaultError::invalid_state())?;
        if !is_managed_backup_name(&name) {
            return Err(NativeVaultError::invalid_state());
        }
        count = count
            .checked_add(1)
            .ok_or_else(NativeVaultError::invalid_state)?;
    }
    Ok(count)
}

fn backup_directory(
    layout: &NativeStorageLayout,
    database_path: &Path,
) -> Result<PathBuf, NativeVaultError> {
    layout
        .verify_database_path(database_path)
        .map_err(|_| NativeVaultError::invalid_state())?;
    let database_name = database_path
        .file_name()
        .ok_or_else(NativeVaultError::invalid_state)?;
    Ok(layout.backup_root().join(database_name))
}

fn is_managed_backup_name(value: &str) -> bool {
    let Some(body) = value
        .strip_prefix(BACKUP_FILE_PREFIX)
        .and_then(|name| name.strip_suffix(BACKUP_FILE_SUFFIX))
    else {
        return false;
    };
    body.len() == 51
        && body.bytes().enumerate().all(|(index, byte)| {
            if matches!(index, 20 | 30) {
                byte == b'-'
            } else {
                byte.is_ascii_digit()
            }
        })
}

fn database_files(database_path: &Path) -> [PathBuf; 3] {
    let mut wal = OsString::from(database_path.as_os_str());
    wal.push("-wal");
    let mut shm = OsString::from(database_path.as_os_str());
    shm.push("-shm");
    [
        database_path.to_path_buf(),
        PathBuf::from(wal),
        PathBuf::from(shm),
    ]
}

fn require_regular_file(path: &Path) -> Result<(), NativeVaultError> {
    let metadata = fs::symlink_metadata(path).map_err(|_| NativeVaultError::invalid_state())?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(NativeVaultError::invalid_state());
    }
    Ok(())
}

fn path_exists(path: &Path) -> Result<bool, NativeVaultError> {
    match fs::symlink_metadata(path) {
        Ok(_) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(_) => Err(NativeVaultError::permission_denied()),
    }
}

fn validate_request(request: &NativeVaultRequest) -> Result<(), NativeVaultError> {
    if request.protocol_version != NATIVE_VAULT_PROTOCOL_VERSION
        || request.request_id.is_empty()
        || request.request_id.len() > MAX_REQUEST_ID_BYTES
        || !request
            .request_id
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
    {
        return Err(NativeVaultError::invalid_request());
    }
    match &request.operation {
        NativeVaultOperation::PreviewDeletion {
            session_id,
            vault_id,
            preview_id,
        } => {
            validate_session_id(session_id)?;
            validate_uuid(vault_id)?;
            validate_uuid(preview_id)?;
        }
        NativeVaultOperation::Delete {
            session_id,
            vault_id,
            preview_id,
            deletion_id,
            confirmation,
        } => {
            validate_session_id(session_id)?;
            validate_uuid(vault_id)?;
            validate_uuid(preview_id)?;
            validate_uuid(deletion_id)?;
            if confirmation.is_empty()
                || confirmation.len() > MAX_CONFIRMATION_BYTES
                || confirmation.chars().any(char::is_control)
            {
                return Err(NativeVaultError::invalid_request());
            }
        }
    }
    Ok(())
}

fn validate_uuid(value: &str) -> Result<(), NativeVaultError> {
    if value.len() != 36
        || !value.bytes().enumerate().all(|(index, byte)| {
            if matches!(index, 8 | 13 | 18 | 23) {
                byte == b'-'
            } else {
                byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte)
            }
        })
    {
        return Err(NativeVaultError::invalid_request());
    }
    Ok(())
}

fn validate_session_id(value: &str) -> Result<(), NativeVaultError> {
    let Some(suffix) = value.strip_prefix("native-session-") else {
        return Err(NativeVaultError::invalid_request());
    };
    if suffix.is_empty() || !suffix.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(NativeVaultError::invalid_request());
    }
    Ok(())
}

fn validate_attachment_id(value: &str) -> Result<(), NativeVaultError> {
    if value.len() != 64
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(NativeVaultError::invalid_state());
    }
    Ok(())
}

fn validate_provider_id(value: &str) -> Result<(), NativeVaultError> {
    if value.is_empty()
        || value.len() > 64
        || !value.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || matches!(byte, b'-' | b'_')
        })
    {
        return Err(NativeVaultError::invalid_state());
    }
    Ok(())
}

fn map_secret_error(error: NativeSecretError) -> NativeVaultError {
    if error.code == "secure_storage_unavailable" {
        NativeVaultError::permission_denied()
    } else {
        NativeVaultError::invalid_state()
    }
}

#[cfg(test)]
mod tests {
    use std::{
        collections::HashMap,
        fs,
        path::{Path, PathBuf},
        process,
        sync::Mutex,
        time::{SystemTime, UNIX_EPOCH},
    };

    use zeroize::Zeroize;

    use super::{
        DeletionFault, NATIVE_VAULT_PROTOCOL_VERSION, NativeVaultDeletionInventory,
        NativeVaultOperation, NativeVaultRequest, NativeVaultResponseData, NativeVaultService,
    };
    use crate::{
        native_secrets::{
            NATIVE_SECRET_PROTOCOL_VERSION, NativeSecretOperation, NativeSecretRequest,
            NativeSecretResponseData, NativeSecretService, SecretBackend, SecretValue,
            scoped_provider_account,
        },
        native_storage::{
            NATIVE_STORAGE_PROTOCOL_VERSION, NativeSqlStatement, NativeSqlValue,
            NativeStorageOperation, NativeStorageRequest, NativeStorageResponseData,
            NativeStorageService,
        },
    };
    use std::sync::Arc;

    const VAULT_ID: &str = "0198f200-0000-7000-8000-000000000001";
    const PREVIEW_ID: &str = "0198f200-0000-7000-8000-000000000002";
    const DELETION_ID: &str = "0198f200-0000-7000-8000-000000000003";
    const VAULT_NAME: &str = "Career search";
    const SHARED_ATTACHMENT: &str =
        "1111111111111111111111111111111111111111111111111111111111111111";
    const PRIVATE_ATTACHMENT: &str =
        "2222222222222222222222222222222222222222222222222222222222222222";
    const BACKUP_NAME: &str =
        "backup-00000000000000001000-000000001-00000000000000000001.coredrill-db";

    struct TestRoot(PathBuf);

    impl TestRoot {
        fn new(label: &str) -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("the test clock must follow the Unix epoch")
                .as_nanos();
            Self(std::env::temp_dir().join(format!(
                "coredrill-vault-deletion-{label}-{}-{nonce}",
                process::id()
            )))
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TestRoot {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[derive(Default)]
    struct MemorySecretBackend {
        values: Mutex<HashMap<String, Vec<u8>>>,
        fail_delete_account: Option<String>,
    }

    impl SecretBackend for MemorySecretBackend {
        fn name(&self) -> &'static str {
            "test_memory_only"
        }

        fn store(&self, account_id: &str, secret: &[u8]) -> Result<(), ()> {
            let mut values = self.values.lock().map_err(|_| ())?;
            if let Some(mut previous) = values.insert(account_id.to_owned(), secret.to_vec()) {
                previous.zeroize();
            }
            Ok(())
        }

        fn status(&self, account_id: &str) -> Result<bool, ()> {
            Ok(self.values.lock().map_err(|_| ())?.contains_key(account_id))
        }

        fn delete(&self, account_id: &str) -> Result<bool, ()> {
            if self.fail_delete_account.as_deref() == Some(account_id) {
                return Err(());
            }
            let mut values = self.values.lock().map_err(|_| ())?;
            if let Some(mut secret) = values.remove(account_id) {
                secret.zeroize();
                return Ok(true);
            }
            Ok(false)
        }
    }

    struct Fixture {
        _root: TestRoot,
        storage: Arc<NativeStorageService>,
        secrets: Arc<NativeSecretService>,
        session_id: String,
        database_path: PathBuf,
        shared_path: PathBuf,
        private_path: PathBuf,
        backup_directory: PathBuf,
        external_archive: PathBuf,
    }

    fn storage_request(
        request_id: &str,
        operation: NativeStorageOperation,
    ) -> NativeStorageRequest {
        NativeStorageRequest {
            protocol_version: NATIVE_STORAGE_PROTOCOL_VERSION,
            request_id: request_id.to_owned(),
            operation,
        }
    }

    fn vault_request(request_id: &str, operation: NativeVaultOperation) -> NativeVaultRequest {
        NativeVaultRequest {
            protocol_version: NATIVE_VAULT_PROTOCOL_VERSION,
            request_id: request_id.to_owned(),
            operation,
        }
    }

    fn secret_request(request_id: &str, operation: NativeSecretOperation) -> NativeSecretRequest {
        NativeSecretRequest {
            protocol_version: NATIVE_SECRET_PROTOCOL_VERSION,
            request_id: request_id.to_owned(),
            operation,
        }
    }

    fn open(storage: &NativeStorageService, request_id: &str, database_name: &str) -> String {
        let response = storage
            .invoke(storage_request(
                request_id,
                NativeStorageOperation::Open {
                    database_name: database_name.to_owned(),
                },
            ))
            .expect("the synthetic vault database must open");
        match response.data {
            NativeStorageResponseData::Opened { session_id } => session_id,
            _ => panic!("the storage boundary must return an open session"),
        }
    }

    fn execute(
        storage: &NativeStorageService,
        session_id: &str,
        request_id: &str,
        sql: &str,
        parameters: Vec<NativeSqlValue>,
    ) {
        let response = storage
            .invoke(storage_request(
                request_id,
                NativeStorageOperation::Execute {
                    session_id: session_id.to_owned(),
                    statement: NativeSqlStatement {
                        sql: sql.to_owned(),
                        parameters,
                    },
                },
            ))
            .expect("the synthetic vault statement must execute");
        assert!(matches!(
            response.data,
            NativeStorageResponseData::Executed { .. }
        ));
    }

    fn text(value: &str) -> NativeSqlValue {
        NativeSqlValue::Text {
            value: value.to_owned(),
        }
    }

    fn store_secret(secrets: &NativeSecretService, provider_id: &str, request_id: &str) {
        let response = secrets
            .invoke(secret_request(
                request_id,
                NativeSecretOperation::Store {
                    vault_id: VAULT_ID.to_owned(),
                    provider_id: provider_id.to_owned(),
                    secret: SecretValue(format!("synthetic-{provider_id}-secret")),
                },
            ))
            .expect("the synthetic vault-scoped secret must store");
        assert!(matches!(
            response.data,
            NativeSecretResponseData::Stored { present: true, .. }
        ));
    }

    fn secret_present(secrets: &NativeSecretService, provider_id: &str) -> bool {
        let response = secrets
            .invoke(secret_request(
                &format!("status-{provider_id}"),
                NativeSecretOperation::Status {
                    vault_id: VAULT_ID.to_owned(),
                    provider_id: provider_id.to_owned(),
                },
            ))
            .expect("the synthetic vault-scoped status must resolve");
        match response.data {
            NativeSecretResponseData::Status { present, .. } => present,
            _ => panic!("the secret boundary must return status"),
        }
    }

    fn fixture(label: &str, fail_delete_provider: Option<&str>) -> Fixture {
        let root = TestRoot::new(label);
        fs::create_dir_all(root.path()).expect("the synthetic test root must exist");
        let app_data_root = root.path().join("app-data");
        let storage = Arc::new(
            NativeStorageService::new(app_data_root)
                .expect("the synthetic native storage service must initialize"),
        );
        let fail_delete_account = fail_delete_provider.map(|provider_id| {
            scoped_provider_account(VAULT_ID, provider_id)
                .expect("the failing provider account must be vault scoped")
        });
        let secrets = Arc::new(NativeSecretService::with_backend(Box::new(
            MemorySecretBackend {
                values: Mutex::new(HashMap::new()),
                fail_delete_account,
            },
        )));

        let session_id = open(&storage, "open-primary", "primary.sqlite3");
        execute(
            &storage,
            &session_id,
            "schema-vault",
            "CREATE TABLE vault(id TEXT PRIMARY KEY, name TEXT NOT NULL)",
            Vec::new(),
        );
        execute(
            &storage,
            &session_id,
            "schema-attachment",
            "CREATE TABLE attachment_manifest(content_id TEXT PRIMARY KEY)",
            Vec::new(),
        );
        execute(
            &storage,
            &session_id,
            "schema-setting",
            "CREATE TABLE app_setting(key TEXT PRIMARY KEY, json_value TEXT NOT NULL)",
            Vec::new(),
        );
        execute(
            &storage,
            &session_id,
            "insert-vault",
            "INSERT INTO vault(id, name) VALUES (?1, ?2)",
            vec![text(VAULT_ID), text(VAULT_NAME)],
        );
        for (request_id, attachment_id) in [
            ("insert-shared", SHARED_ATTACHMENT),
            ("insert-private", PRIVATE_ATTACHMENT),
        ] {
            execute(
                &storage,
                &session_id,
                request_id,
                "INSERT INTO attachment_manifest(content_id) VALUES (?1)",
                vec![text(attachment_id)],
            );
        }
        execute(
            &storage,
            &session_id,
            "insert-provider-registry",
            "INSERT INTO app_setting(key, json_value) VALUES (?1, ?2)",
            vec![
                text("provider-secret-registry.v1"),
                text(r#"{"version":1,"providerIds":["anthropic","openai"]}"#),
            ],
        );

        let other_session = open(&storage, "open-other", "other.sqlite3");
        execute(
            &storage,
            &other_session,
            "other-schema-attachment",
            "CREATE TABLE attachment_manifest(content_id TEXT PRIMARY KEY)",
            Vec::new(),
        );
        execute(
            &storage,
            &other_session,
            "other-insert-shared",
            "INSERT INTO attachment_manifest(content_id) VALUES (?1)",
            vec![text(SHARED_ATTACHMENT)],
        );
        storage
            .invoke(storage_request(
                "close-other",
                NativeStorageOperation::Close {
                    session_id: other_session,
                },
            ))
            .expect("the other vault must close before inspection");

        let shared_path = storage
            .layout
            .prepare_attachment_path(SHARED_ATTACHMENT)
            .expect("the shared attachment path must resolve");
        let private_path = storage
            .layout
            .prepare_attachment_path(PRIVATE_ATTACHMENT)
            .expect("the private attachment path must resolve");
        fs::write(&shared_path, b"shared attachment")
            .expect("the shared attachment fixture must write");
        fs::write(&private_path, b"private attachment")
            .expect("the private attachment fixture must write");

        let database_path = storage.layout.database_root().join("primary.sqlite3");
        let backup_directory = storage
            .layout
            .prepare_backup_directory(&database_path)
            .expect("the managed backup directory must resolve");
        fs::write(
            backup_directory.join(BACKUP_NAME),
            b"synthetic managed backup",
        )
        .expect("the managed backup fixture must write");
        let external_archive = root.path().join("external-portable.coredrill.zip");
        fs::write(&external_archive, b"external portable archive")
            .expect("the external archive fixture must write");

        store_secret(&secrets, "anthropic", "store-anthropic");
        store_secret(&secrets, "openai", "store-openai");

        Fixture {
            _root: root,
            storage,
            secrets,
            session_id,
            database_path,
            shared_path,
            private_path,
            backup_directory,
            external_archive,
        }
    }

    fn preview(service: &NativeVaultService, session_id: &str) -> NativeVaultResponseData {
        service
            .invoke(vault_request(
                "preview-delete",
                NativeVaultOperation::PreviewDeletion {
                    session_id: session_id.to_owned(),
                    vault_id: VAULT_ID.to_owned(),
                    preview_id: PREVIEW_ID.to_owned(),
                },
            ))
            .expect("the deletion preview must succeed")
            .data
    }

    fn delete(
        service: &NativeVaultService,
        session_id: &str,
        confirmation: &str,
    ) -> Result<NativeVaultResponseData, super::NativeVaultError> {
        service
            .invoke(vault_request(
                "delete-vault",
                NativeVaultOperation::Delete {
                    session_id: session_id.to_owned(),
                    vault_id: VAULT_ID.to_owned(),
                    preview_id: PREVIEW_ID.to_owned(),
                    deletion_id: DELETION_ID.to_owned(),
                    confirmation: confirmation.to_owned(),
                },
            ))
            .map(|response| response.data)
    }

    #[test]
    fn exact_confirmation_deletes_only_vault_owned_local_data() {
        let fixture = fixture("success", None);
        let service =
            NativeVaultService::new(Arc::clone(&fixture.storage), Arc::clone(&fixture.secrets));
        let previewed = preview(&service, &fixture.session_id);
        match previewed {
            NativeVaultResponseData::DeletionPreview {
                vault_name,
                inventory,
                required_confirmation,
                last_successful_portable_export_at,
                ..
            } => {
                assert_eq!(vault_name, VAULT_NAME);
                assert_eq!(required_confirmation, "DELETE Career search");
                assert_eq!(last_successful_portable_export_at, None);
                assert_eq!(
                    inventory,
                    NativeVaultDeletionInventory {
                        attachment_files: 1,
                        managed_backups: 1,
                        provider_secrets: 2,
                        shared_attachment_files: 1,
                    }
                );
            }
            _ => panic!("the vault boundary must return a deletion preview"),
        }

        let mismatch = delete(&service, &fixture.session_id, "DELETE Career search ")
            .expect_err("trailing whitespace must fail exact confirmation");
        assert_eq!(mismatch.code, "confirmation_mismatch");
        assert!(fixture.database_path.exists());
        assert!(fixture.private_path.exists());
        assert!(fixture.backup_directory.exists());
        assert!(secret_present(&fixture.secrets, "anthropic"));

        let deleted = delete(&service, &fixture.session_id, "DELETE Career search")
            .expect("the exact target-bound phrase must delete the vault");
        match deleted {
            NativeVaultResponseData::Deleted {
                status,
                deleted,
                external_portable_archives_affected,
                ..
            } => {
                assert_eq!(status, "deleted");
                assert_eq!(deleted.attachment_files, 1);
                assert_eq!(deleted.managed_backups, 1);
                assert_eq!(deleted.provider_secrets, 2);
                assert_eq!(deleted.shared_attachment_files, 1);
                assert!(!external_portable_archives_affected);
            }
            _ => panic!("the vault boundary must return a deletion result"),
        }
        assert!(!fixture.database_path.exists());
        assert!(!fixture.private_path.exists());
        assert!(!fixture.backup_directory.exists());
        assert!(fixture.shared_path.exists());
        assert!(
            fixture
                .storage
                .layout
                .database_root()
                .join("other.sqlite3")
                .exists()
        );
        assert!(fixture.external_archive.exists());
        assert!(!secret_present(&fixture.secrets, "anthropic"));
        assert!(!secret_present(&fixture.secrets, "openai"));
        assert!(
            !fixture
                .storage
                .layout
                .app_data_root()
                .join(format!(".vault-deletion-{DELETION_ID}"))
                .exists()
        );
    }

    #[test]
    fn secure_store_failure_restores_staged_content_with_content_free_error() {
        let fixture = fixture("secret-failure", Some("openai"));
        let service =
            NativeVaultService::new(Arc::clone(&fixture.storage), Arc::clone(&fixture.secrets));
        let _ = preview(&service, &fixture.session_id);
        let error = delete(&service, &fixture.session_id, "DELETE Career search")
            .expect_err("a secret deletion failure must restore staged content");
        assert_eq!(error.code, "cleanup_failed");
        let serialized = serde_json::to_string(&error).expect("the stable error must serialize");
        assert!(!serialized.contains(VAULT_NAME));
        assert!(!serialized.contains("openai"));
        assert!(fixture.database_path.exists());
        assert!(fixture.private_path.exists());
        assert!(fixture.shared_path.exists());
        assert!(fixture.backup_directory.exists());
        assert!(fixture.external_archive.exists());
        assert!(!secret_present(&fixture.secrets, "anthropic"));
        assert!(secret_present(&fixture.secrets, "openai"));

        let diagnostic = fixture
            .storage
            .invoke(storage_request(
                "diagnostic-restored-session",
                NativeStorageOperation::Diagnostics {
                    session_id: fixture.session_id.clone(),
                },
            ))
            .expect("the restored vault session must remain usable");
        assert!(matches!(
            diagnostic.data,
            NativeStorageResponseData::Diagnostics { .. }
        ));
    }

    #[test]
    fn staging_failure_rolls_back_and_final_purge_failure_is_reported_honestly() {
        let rollback_fixture = fixture("stage-rollback", None);
        let rollback_service = NativeVaultService::with_fault(
            Arc::clone(&rollback_fixture.storage),
            Arc::clone(&rollback_fixture.secrets),
            DeletionFault::StageAfterFirst,
        );
        let _ = preview(&rollback_service, &rollback_fixture.session_id);
        let error = delete(
            &rollback_service,
            &rollback_fixture.session_id,
            "DELETE Career search",
        )
        .expect_err("a staging failure must roll back before secret deletion");
        assert_eq!(error.code, "permission_denied");
        assert!(rollback_fixture.database_path.exists());
        assert!(rollback_fixture.private_path.exists());
        assert!(rollback_fixture.backup_directory.exists());
        assert!(secret_present(&rollback_fixture.secrets, "anthropic"));
        assert!(secret_present(&rollback_fixture.secrets, "openai"));

        let pending_fixture = fixture("cleanup-pending", None);
        let pending_service = NativeVaultService::with_fault(
            Arc::clone(&pending_fixture.storage),
            Arc::clone(&pending_fixture.secrets),
            DeletionFault::Purge,
        );
        let _ = preview(&pending_service, &pending_fixture.session_id);
        let result = delete(
            &pending_service,
            &pending_fixture.session_id,
            "DELETE Career search",
        )
        .expect("a final purge failure must retain an honest cleanup record");
        assert!(matches!(
            result,
            NativeVaultResponseData::Deleted {
                status: "cleanup_pending",
                external_portable_archives_affected: false,
                ..
            }
        ));
        assert!(!pending_fixture.database_path.exists());
        let pending_staging = pending_fixture
            .storage
            .layout
            .app_data_root()
            .join(format!(".vault-deletion-{DELETION_ID}"));
        assert!(pending_staging.exists());
        assert!(pending_fixture.external_archive.exists());

        let _startup_cleanup = NativeVaultService::new(
            Arc::clone(&pending_fixture.storage),
            Arc::clone(&pending_fixture.secrets),
        );
        assert!(!pending_staging.exists());
        assert!(pending_fixture.external_archive.exists());
    }
}
