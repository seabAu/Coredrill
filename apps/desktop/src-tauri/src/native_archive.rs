use std::{
    fs::{self, File, OpenOptions},
    io::{self, Read, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::native_storage::{
    NativeSession, NativeStorageService, open_database_connection, validate_session_id,
};

pub const NATIVE_ARCHIVE_PROTOCOL_VERSION: u16 = 1;

const ARCHIVE_MAGIC: [u8; 16] = *b"COREDRILL_DB_V1\0";
const ARCHIVE_FORMAT_VERSION: u16 = 1;
const ARCHIVE_HEADER_BYTES: u64 = 16 + 2 + 4 + 8 + 32;
const MAX_REQUEST_ID_BYTES: usize = 64;
const MAX_ARCHIVE_DATABASE_BYTES: u64 = 64 * 1024 * 1024 * 1024;
const COPY_BUFFER_BYTES: usize = 1024 * 1024;
const SHA256_BYTES: usize = 32;
const TEMP_ATTEMPTS: u8 = 64;
static NEXT_TEMPORARY_FILE: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeArchiveRequest {
    pub protocol_version: u16,
    pub request_id: String,
    pub operation: NativeArchiveOperation,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum NativeArchiveOperation {
    Export { session_id: String },
    Restore { session_id: String },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeArchiveResponse {
    pub protocol_version: u16,
    pub request_id: String,
    pub data: NativeArchiveResponseData,
}

#[derive(Debug, Serialize)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum NativeArchiveResponseData {
    Cancelled {
        operation: NativeArchiveOperationName,
    },
    Exported {
        archive: NativeArchiveMetadata,
    },
    Restored {
        archive: NativeArchiveMetadata,
    },
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum NativeArchiveOperationName {
    Export,
    Restore,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeArchiveMetadata {
    pub format_version: u16,
    pub schema_version: u32,
    pub database_bytes: u64,
    pub sha256: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeArchiveError {
    pub code: String,
    pub message: String,
    pub retryable: bool,
}

impl NativeArchiveError {
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
            "The native archive request is invalid.",
            false,
        )
    }

    fn session_missing() -> Self {
        Self::new(
            "session_missing",
            "The native storage session is not open.",
            false,
        )
    }

    fn transaction_state() -> Self {
        Self::new(
            "transaction_state",
            "A native archive operation cannot run during a transaction.",
            false,
        )
    }

    fn archive_invalid() -> Self {
        Self::new(
            "archive_invalid",
            "The selected Coredrill recovery archive is invalid.",
            false,
        )
    }

    fn archive_io_failure() -> Self {
        Self::new(
            "archive_io_failure",
            "The native archive operation could not complete.",
            false,
        )
    }

    fn restore_failed() -> Self {
        Self::new(
            "archive_restore_failed",
            "The archive was not restored; the previous database remains active.",
            false,
        )
    }

    fn recovery_failed() -> Self {
        Self::new(
            "archive_recovery_failed",
            "Native database recovery failed and the session was closed.",
            false,
        )
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
enum RestoreFault {
    #[default]
    None,
    BeforeAtomicReplacement,
    AfterAtomicReplacement,
}

impl NativeArchiveOperation {
    fn operation_name(&self) -> NativeArchiveOperationName {
        match self {
            Self::Export { .. } => NativeArchiveOperationName::Export,
            Self::Restore { .. } => NativeArchiveOperationName::Restore,
        }
    }
}

fn validate_native_archive_request(
    request: &NativeArchiveRequest,
) -> Result<(), NativeArchiveError> {
    validate_request(request)?;
    let session_id = match &request.operation {
        NativeArchiveOperation::Export { session_id }
        | NativeArchiveOperation::Restore { session_id } => session_id,
    };
    validate_archive_session_id(session_id)
}

impl NativeStorageService {
    pub(crate) fn validate_archive_picker_request(
        &self,
        request: &NativeArchiveRequest,
    ) -> Result<(), NativeArchiveError> {
        validate_native_archive_request(request)?;
        let session_id = match &request.operation {
            NativeArchiveOperation::Export { session_id }
            | NativeArchiveOperation::Restore { session_id } => session_id,
        };
        let mut state = self
            .state
            .lock()
            .map_err(|_| NativeArchiveError::archive_io_failure())?;
        let session = state
            .sessions
            .get_mut(session_id)
            .ok_or_else(NativeArchiveError::session_missing)?;
        if session.transaction_active {
            return Err(NativeArchiveError::transaction_state());
        }
        self.layout
            .verify_database_path(&session.database_path)
            .map_err(|_| NativeArchiveError::archive_io_failure())
    }

    pub(crate) fn invoke_archive_with_selected_path(
        &self,
        request: NativeArchiveRequest,
        selected_path: Option<PathBuf>,
    ) -> Result<NativeArchiveResponse, NativeArchiveError> {
        self.invoke_archive_with_selected_path_and_fault(request, selected_path, RestoreFault::None)
    }

    fn invoke_archive_with_selected_path_and_fault(
        &self,
        request: NativeArchiveRequest,
        selected_path: Option<PathBuf>,
        restore_fault: RestoreFault,
    ) -> Result<NativeArchiveResponse, NativeArchiveError> {
        self.validate_archive_picker_request(&request)?;
        let operation_name = request.operation.operation_name();
        let request_id = request.request_id;
        let data = match (request.operation, selected_path) {
            (_, None) => NativeArchiveResponseData::Cancelled {
                operation: operation_name,
            },
            (NativeArchiveOperation::Export { session_id }, Some(path)) => {
                NativeArchiveResponseData::Exported {
                    archive: self.export_archive(&session_id, &path)?,
                }
            }
            (NativeArchiveOperation::Restore { session_id }, Some(path)) => {
                NativeArchiveResponseData::Restored {
                    archive: self.restore_archive(&session_id, &path, restore_fault)?,
                }
            }
        };
        Ok(NativeArchiveResponse {
            protocol_version: NATIVE_ARCHIVE_PROTOCOL_VERSION,
            request_id,
            data,
        })
    }

    fn export_archive(
        &self,
        session_id: &str,
        selected_path: &Path,
    ) -> Result<NativeArchiveMetadata, NativeArchiveError> {
        validate_archive_session_id(session_id)?;
        let target = canonical_export_target(selected_path)?;
        if target.starts_with(self.layout.app_data_root()) {
            return Err(NativeArchiveError::invalid_request());
        }
        let mut state = self
            .state
            .lock()
            .map_err(|_| NativeArchiveError::archive_io_failure())?;
        let session = state
            .sessions
            .get_mut(session_id)
            .ok_or_else(NativeArchiveError::session_missing)?;
        if session.transaction_active {
            return Err(NativeArchiveError::transaction_state());
        }
        self.layout
            .verify_database_path(&session.database_path)
            .map_err(|_| NativeArchiveError::archive_io_failure())?;
        let schema_version = validate_connection(&session.connection, None)?;
        let snapshot = create_sqlite_snapshot(
            &session.connection,
            self.layout.database_root(),
            "export-snapshot",
        )?;
        let snapshot_schema = validate_sqlite_file(snapshot.path(), Some(schema_version))?;
        let (database_bytes, digest) = digest_file(snapshot.path())?;
        if database_bytes > MAX_ARCHIVE_DATABASE_BYTES {
            return Err(NativeArchiveError::archive_invalid());
        }
        let metadata = NativeArchiveMetadata {
            format_version: ARCHIVE_FORMAT_VERSION,
            schema_version: snapshot_schema,
            database_bytes,
            sha256: digest_hex(&digest),
        };
        write_archive_atomically(snapshot.path(), &target, &metadata, digest)?;
        Ok(metadata)
    }

    fn restore_archive(
        &self,
        session_id: &str,
        selected_path: &Path,
        restore_fault: RestoreFault,
    ) -> Result<NativeArchiveMetadata, NativeArchiveError> {
        validate_archive_session_id(session_id)?;
        let source = canonical_restore_source(selected_path)?;
        if source.starts_with(self.layout.app_data_root()) {
            return Err(NativeArchiveError::invalid_request());
        }
        let mut state = self
            .state
            .lock()
            .map_err(|_| NativeArchiveError::archive_io_failure())?;
        let session = state
            .sessions
            .remove(session_id)
            .ok_or_else(NativeArchiveError::session_missing)?;
        let result = self.restore_removed_session(session, &source, restore_fault);
        match result {
            RestoreSessionResult::Restored(session, metadata) => {
                state.sessions.insert(session_id.to_owned(), session);
                Ok(metadata)
            }
            RestoreSessionResult::Preserved(session, error) => {
                state.sessions.insert(session_id.to_owned(), session);
                Err(error)
            }
            RestoreSessionResult::Closed(error) => Err(error),
        }
    }

    fn restore_removed_session(
        &self,
        session: NativeSession,
        source: &Path,
        restore_fault: RestoreFault,
    ) -> RestoreSessionResult {
        if session.transaction_active {
            return RestoreSessionResult::Preserved(
                session,
                NativeArchiveError::transaction_state(),
            );
        }
        if self
            .layout
            .verify_database_path(&session.database_path)
            .is_err()
        {
            return RestoreSessionResult::Preserved(
                session,
                NativeArchiveError::archive_io_failure(),
            );
        }
        let expected_schema = match validate_connection(&session.connection, None) {
            Ok(schema) => schema,
            Err(error) => return RestoreSessionResult::Preserved(session, error),
        };
        let (incoming, metadata) = match extract_and_validate_archive(
            source,
            self.layout.database_root(),
            expected_schema,
        ) {
            Ok(prepared) => prepared,
            Err(error) => return RestoreSessionResult::Preserved(session, error),
        };
        let recovery = match create_sqlite_snapshot(
            &session.connection,
            self.layout.database_root(),
            "restore-recovery",
        ) {
            Ok(recovery) => recovery,
            Err(error) => return RestoreSessionResult::Preserved(session, error),
        };
        if validate_sqlite_file(recovery.path(), Some(expected_schema)).is_err() {
            return RestoreSessionResult::Preserved(
                session,
                NativeArchiveError::archive_io_failure(),
            );
        }

        let database_path = session.database_path;
        drop(session.connection);
        if remove_database_sidecars(&database_path).is_err() {
            return recover_session_after_close(database_path, recovery, expected_schema);
        }
        if restore_fault == RestoreFault::BeforeAtomicReplacement
            || atomic_replace_and_sync(incoming.path(), &database_path).is_err()
        {
            return recover_session_after_close(database_path, recovery, expected_schema);
        }

        let replacement = if restore_fault == RestoreFault::AfterAtomicReplacement {
            Err(NativeArchiveError::restore_failed())
        } else {
            open_and_validate_database(&database_path, expected_schema)
                .map_err(|_| NativeArchiveError::restore_failed())
        };
        match replacement {
            Ok(connection) => RestoreSessionResult::Restored(
                NativeSession {
                    connection,
                    database_path,
                    transaction_active: false,
                },
                metadata,
            ),
            Err(error) => {
                if remove_database_sidecars(&database_path).is_err() {
                    return RestoreSessionResult::Closed(NativeArchiveError::recovery_failed());
                }
                if atomic_replace_and_sync(recovery.path(), &database_path).is_err() {
                    return RestoreSessionResult::Closed(NativeArchiveError::recovery_failed());
                }
                match open_and_validate_database(&database_path, expected_schema) {
                    Ok(connection) => RestoreSessionResult::Preserved(
                        NativeSession {
                            connection,
                            database_path,
                            transaction_active: false,
                        },
                        error,
                    ),
                    Err(_) => RestoreSessionResult::Closed(NativeArchiveError::recovery_failed()),
                }
            }
        }
    }
}

enum RestoreSessionResult {
    Restored(NativeSession, NativeArchiveMetadata),
    Preserved(NativeSession, NativeArchiveError),
    Closed(NativeArchiveError),
}

fn validate_request(request: &NativeArchiveRequest) -> Result<(), NativeArchiveError> {
    if request.protocol_version != NATIVE_ARCHIVE_PROTOCOL_VERSION
        || request.request_id.is_empty()
        || request.request_id.len() > MAX_REQUEST_ID_BYTES
        || !request
            .request_id
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
    {
        return Err(NativeArchiveError::invalid_request());
    }
    Ok(())
}

fn validate_archive_session_id(session_id: &str) -> Result<(), NativeArchiveError> {
    validate_session_id(session_id).map_err(|_| NativeArchiveError::invalid_request())
}

fn validate_connection(
    connection: &Connection,
    expected_schema: Option<u32>,
) -> Result<u32, NativeArchiveError> {
    let integrity = connection
        .query_row("PRAGMA integrity_check", [], |row| row.get::<_, String>(0))
        .map_err(|_| NativeArchiveError::archive_invalid())?;
    if integrity != "ok" {
        return Err(NativeArchiveError::archive_invalid());
    }
    let schema_version = connection
        .query_row("PRAGMA user_version", [], |row| row.get::<_, u32>(0))
        .map_err(|_| NativeArchiveError::archive_invalid())?;
    if expected_schema.is_some_and(|expected| expected != schema_version) {
        return Err(NativeArchiveError::archive_invalid());
    }
    Ok(schema_version)
}

fn validate_sqlite_file(
    path: &Path,
    expected_schema: Option<u32>,
) -> Result<u32, NativeArchiveError> {
    let connection = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY
            | OpenFlags::SQLITE_OPEN_NO_MUTEX
            | OpenFlags::SQLITE_OPEN_NOFOLLOW,
    )
    .map_err(|_| NativeArchiveError::archive_invalid())?;
    connection
        .execute_batch("PRAGMA trusted_schema = OFF;")
        .map_err(|_| NativeArchiveError::archive_invalid())?;
    validate_connection(&connection, expected_schema)
}

fn open_and_validate_database(
    path: &Path,
    expected_schema: u32,
) -> Result<Connection, NativeArchiveError> {
    let connection =
        open_database_connection(path, false).map_err(|_| NativeArchiveError::restore_failed())?;
    validate_connection(&connection, Some(expected_schema))?;
    Ok(connection)
}

fn create_sqlite_snapshot(
    source: &Connection,
    parent: &Path,
    label: &str,
) -> Result<TemporaryPath, NativeArchiveError> {
    let (temporary, file) = TemporaryPath::create(parent, label)?;
    drop(file);
    source
        .backup("main", temporary.path(), None)
        .map_err(|_| NativeArchiveError::archive_io_failure())?;
    OpenOptions::new()
        .read(true)
        .write(true)
        .open(temporary.path())
        .and_then(|file| file.sync_all())
        .map_err(|_| NativeArchiveError::archive_io_failure())?;
    Ok(temporary)
}

fn canonical_export_target(selected_path: &Path) -> Result<PathBuf, NativeArchiveError> {
    if !selected_path.is_absolute() {
        return Err(NativeArchiveError::invalid_request());
    }
    let file_name = selected_path
        .file_name()
        .ok_or_else(NativeArchiveError::invalid_request)?;
    let parent = selected_path
        .parent()
        .ok_or_else(NativeArchiveError::invalid_request)?;
    let canonical_parent =
        fs::canonicalize(parent).map_err(|_| NativeArchiveError::archive_io_failure())?;
    if !fs::metadata(&canonical_parent)
        .map_err(|_| NativeArchiveError::archive_io_failure())?
        .is_dir()
    {
        return Err(NativeArchiveError::archive_io_failure());
    }
    let target = canonical_parent.join(file_name);
    reject_link_or_directory(&target)?;
    Ok(target)
}

fn canonical_restore_source(selected_path: &Path) -> Result<PathBuf, NativeArchiveError> {
    if !selected_path.is_absolute() {
        return Err(NativeArchiveError::invalid_request());
    }
    reject_link_or_directory(selected_path)?;
    let canonical =
        fs::canonicalize(selected_path).map_err(|_| NativeArchiveError::archive_io_failure())?;
    if !fs::metadata(&canonical)
        .map_err(|_| NativeArchiveError::archive_io_failure())?
        .is_file()
    {
        return Err(NativeArchiveError::archive_io_failure());
    }
    Ok(canonical)
}

fn reject_link_or_directory(path: &Path) -> Result<(), NativeArchiveError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() || metadata.is_dir() => {
            Err(NativeArchiveError::archive_io_failure())
        }
        Ok(_) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err(NativeArchiveError::archive_io_failure()),
    }
}

fn digest_file(path: &Path) -> Result<(u64, [u8; SHA256_BYTES]), NativeArchiveError> {
    let mut file = File::open(path).map_err(|_| NativeArchiveError::archive_io_failure())?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0_u8; COPY_BUFFER_BYTES];
    let mut bytes = 0_u64;
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|_| NativeArchiveError::archive_io_failure())?;
        if read == 0 {
            break;
        }
        bytes = bytes
            .checked_add(read as u64)
            .ok_or_else(NativeArchiveError::archive_invalid)?;
        hasher.update(&buffer[..read]);
    }
    Ok((bytes, hasher.finalize().into()))
}

fn write_archive_atomically(
    database_path: &Path,
    target: &Path,
    metadata: &NativeArchiveMetadata,
    digest: [u8; SHA256_BYTES],
) -> Result<(), NativeArchiveError> {
    let parent = target
        .parent()
        .ok_or_else(NativeArchiveError::invalid_request)?;
    let (temporary, mut output) = TemporaryPath::create(parent, "archive-export")?;
    output
        .write_all(&ARCHIVE_MAGIC)
        .and_then(|_| output.write_all(&ARCHIVE_FORMAT_VERSION.to_le_bytes()))
        .and_then(|_| output.write_all(&metadata.schema_version.to_le_bytes()))
        .and_then(|_| output.write_all(&metadata.database_bytes.to_le_bytes()))
        .and_then(|_| output.write_all(&digest))
        .map_err(|_| NativeArchiveError::archive_io_failure())?;
    let mut database =
        File::open(database_path).map_err(|_| NativeArchiveError::archive_io_failure())?;
    let copied = io::copy(&mut database, &mut output)
        .map_err(|_| NativeArchiveError::archive_io_failure())?;
    if copied != metadata.database_bytes {
        return Err(NativeArchiveError::archive_io_failure());
    }
    output
        .flush()
        .and_then(|_| output.sync_all())
        .map_err(|_| NativeArchiveError::archive_io_failure())?;
    drop(output);
    reject_link_or_directory(target)?;
    atomic_replace_and_sync(temporary.path(), target)?;
    Ok(())
}

fn extract_and_validate_archive(
    source: &Path,
    database_root: &Path,
    expected_schema: u32,
) -> Result<(TemporaryPath, NativeArchiveMetadata), NativeArchiveError> {
    let mut input = File::open(source).map_err(|_| NativeArchiveError::archive_io_failure())?;
    let total_bytes = input
        .metadata()
        .map_err(|_| NativeArchiveError::archive_io_failure())?
        .len();
    let mut magic = [0_u8; 16];
    let mut format_bytes = [0_u8; 2];
    let mut schema_bytes = [0_u8; 4];
    let mut length_bytes = [0_u8; 8];
    let mut expected_digest = [0_u8; SHA256_BYTES];
    input
        .read_exact(&mut magic)
        .and_then(|_| input.read_exact(&mut format_bytes))
        .and_then(|_| input.read_exact(&mut schema_bytes))
        .and_then(|_| input.read_exact(&mut length_bytes))
        .and_then(|_| input.read_exact(&mut expected_digest))
        .map_err(|_| NativeArchiveError::archive_invalid())?;
    let format_version = u16::from_le_bytes(format_bytes);
    let schema_version = u32::from_le_bytes(schema_bytes);
    let database_bytes = u64::from_le_bytes(length_bytes);
    if magic != ARCHIVE_MAGIC
        || format_version != ARCHIVE_FORMAT_VERSION
        || schema_version != expected_schema
        || database_bytes > MAX_ARCHIVE_DATABASE_BYTES
        || total_bytes != ARCHIVE_HEADER_BYTES.saturating_add(database_bytes)
    {
        return Err(NativeArchiveError::archive_invalid());
    }

    let (temporary, mut output) = TemporaryPath::create(database_root, "restore-incoming")?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0_u8; COPY_BUFFER_BYTES];
    let mut copied = 0_u64;
    while copied < database_bytes {
        let remaining = database_bytes - copied;
        let capacity = usize::try_from(remaining.min(COPY_BUFFER_BYTES as u64))
            .map_err(|_| NativeArchiveError::archive_invalid())?;
        let read = input
            .read(&mut buffer[..capacity])
            .map_err(|_| NativeArchiveError::archive_invalid())?;
        if read == 0 {
            return Err(NativeArchiveError::archive_invalid());
        }
        output
            .write_all(&buffer[..read])
            .map_err(|_| NativeArchiveError::archive_io_failure())?;
        hasher.update(&buffer[..read]);
        copied += read as u64;
    }
    output
        .flush()
        .and_then(|_| output.sync_all())
        .map_err(|_| NativeArchiveError::archive_io_failure())?;
    drop(output);
    let actual_digest: [u8; SHA256_BYTES] = hasher.finalize().into();
    if actual_digest != expected_digest {
        return Err(NativeArchiveError::archive_invalid());
    }
    validate_sqlite_file(temporary.path(), Some(expected_schema))?;
    Ok((
        temporary,
        NativeArchiveMetadata {
            format_version,
            schema_version,
            database_bytes,
            sha256: digest_hex(&actual_digest),
        },
    ))
}

fn recover_session_after_close(
    database_path: PathBuf,
    recovery: TemporaryPath,
    expected_schema: u32,
) -> RestoreSessionResult {
    if remove_database_sidecars(&database_path).is_err() {
        return RestoreSessionResult::Closed(NativeArchiveError::recovery_failed());
    }
    if atomic_replace_and_sync(recovery.path(), &database_path).is_err() {
        return RestoreSessionResult::Closed(NativeArchiveError::recovery_failed());
    }
    match open_and_validate_database(&database_path, expected_schema) {
        Ok(connection) => RestoreSessionResult::Preserved(
            NativeSession {
                connection,
                database_path,
                transaction_active: false,
            },
            NativeArchiveError::archive_io_failure(),
        ),
        Err(_) => RestoreSessionResult::Closed(NativeArchiveError::recovery_failed()),
    }
}

fn remove_database_sidecars(database_path: &Path) -> Result<(), NativeArchiveError> {
    for suffix in ["-wal", "-shm"] {
        let path = PathBuf::from(format!("{}{suffix}", database_path.display()));
        match fs::remove_file(path) {
            Ok(()) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(_) => return Err(NativeArchiveError::archive_io_failure()),
        }
    }
    Ok(())
}

fn digest_hex(digest: &[u8; SHA256_BYTES]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut encoded = String::with_capacity(SHA256_BYTES * 2);
    for byte in digest {
        encoded.push(HEX[(byte >> 4) as usize] as char);
        encoded.push(HEX[(byte & 0x0f) as usize] as char);
    }
    encoded
}

struct TemporaryPath(PathBuf);

impl TemporaryPath {
    fn create(parent: &Path, label: &str) -> Result<(Self, File), NativeArchiveError> {
        for _ in 0..TEMP_ATTEMPTS {
            let sequence = NEXT_TEMPORARY_FILE.fetch_add(1, Ordering::Relaxed);
            let path = parent.join(format!(
                ".coredrill-{label}-{}-{sequence}.tmp",
                std::process::id()
            ));
            match OpenOptions::new().write(true).create_new(true).open(&path) {
                Ok(file) => return Ok((Self(path), file)),
                Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
                Err(_) => return Err(NativeArchiveError::archive_io_failure()),
            }
        }
        Err(NativeArchiveError::archive_io_failure())
    }

    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for TemporaryPath {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
        let _ = remove_database_sidecars(&self.0);
    }
}

fn atomic_replace_and_sync(source: &Path, destination: &Path) -> Result<(), NativeArchiveError> {
    atomic_replace_file(source, destination)?;
    let parent = destination
        .parent()
        .ok_or_else(NativeArchiveError::archive_io_failure)?;
    sync_parent(parent)
}

#[cfg(target_os = "windows")]
fn atomic_replace_file(source: &Path, destination: &Path) -> Result<(), NativeArchiveError> {
    use std::{iter, os::windows::ffi::OsStrExt};
    use windows_sys::Win32::Storage::FileSystem::{
        MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH, MoveFileExW,
    };

    let source = source
        .as_os_str()
        .encode_wide()
        .chain(iter::once(0))
        .collect::<Vec<_>>();
    let destination = destination
        .as_os_str()
        .encode_wide()
        .chain(iter::once(0))
        .collect::<Vec<_>>();
    let moved = unsafe {
        MoveFileExW(
            source.as_ptr(),
            destination.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if moved == 0 {
        return Err(NativeArchiveError::archive_io_failure());
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn atomic_replace_file(source: &Path, destination: &Path) -> Result<(), NativeArchiveError> {
    fs::rename(source, destination).map_err(|_| NativeArchiveError::archive_io_failure())
}

#[cfg(target_os = "windows")]
fn sync_parent(_parent: &Path) -> Result<(), NativeArchiveError> {
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn sync_parent(parent: &Path) -> Result<(), NativeArchiveError> {
    File::open(parent)
        .and_then(|directory| directory.sync_all())
        .map_err(|_| NativeArchiveError::archive_io_failure())
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::{Path, PathBuf},
        process,
        time::{SystemTime, UNIX_EPOCH},
    };

    use crate::native_storage::{
        NativeSqlStatement, NativeSqlValue, NativeStorageOperation, NativeStorageRequest,
        NativeStorageResponseData,
    };

    use super::{
        NATIVE_ARCHIVE_PROTOCOL_VERSION, NativeArchiveOperation, NativeArchiveOperationName,
        NativeArchiveRequest, NativeArchiveResponseData, RestoreFault,
    };
    use crate::native_storage::{NATIVE_STORAGE_PROTOCOL_VERSION, NativeStorageService};

    struct TestRoot(PathBuf);

    impl TestRoot {
        fn new() -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("the system clock must follow the Unix epoch")
                .as_nanos();
            Self(std::env::temp_dir().join(format!(
                "coredrill-native-archive-{}-{nonce}",
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

    fn archive_request(
        request_id: &str,
        operation: NativeArchiveOperation,
    ) -> NativeArchiveRequest {
        NativeArchiveRequest {
            protocol_version: NATIVE_ARCHIVE_PROTOCOL_VERSION,
            request_id: request_id.to_owned(),
            operation,
        }
    }

    fn statement(sql: &str) -> NativeSqlStatement {
        NativeSqlStatement {
            sql: sql.to_owned(),
            parameters: Vec::new(),
        }
    }

    fn open_session(service: &NativeStorageService, request_id: &str) -> String {
        let response = service
            .invoke(storage_request(
                request_id,
                NativeStorageOperation::Open {
                    database_name: "archive-e2e.sqlite3".to_owned(),
                },
            ))
            .expect("the native archive test database must open");
        match response.data {
            NativeStorageResponseData::Opened { session_id } => session_id,
            _ => panic!("the open operation must return a session"),
        }
    }

    fn execute(service: &NativeStorageService, session_id: &str, request_id: &str, sql: &str) {
        service
            .invoke(storage_request(
                request_id,
                NativeStorageOperation::Execute {
                    session_id: session_id.to_owned(),
                    statement: statement(sql),
                },
            ))
            .expect("the archive test mutation must execute");
    }

    fn query_value(service: &NativeStorageService, session_id: &str, request_id: &str) -> String {
        let response = service
            .invoke(storage_request(
                request_id,
                NativeStorageOperation::Query {
                    session_id: session_id.to_owned(),
                    statement: statement("SELECT value FROM archive_probe WHERE id = 1"),
                },
            ))
            .expect("the archive test value must be queryable");
        match response.data {
            NativeStorageResponseData::Rows { rows, .. } => match rows.as_slice() {
                [row] => match row.as_slice() {
                    [NativeSqlValue::Text { value }] => value.clone(),
                    _ => panic!("the archive test row must contain one text value"),
                },
                _ => panic!("the archive test query must return one row"),
            },
            _ => panic!("the archive test query must return rows"),
        }
    }

    #[test]
    fn checksummed_archive_restore_is_atomic_recoverable_and_durable() {
        let test_root = TestRoot::new();
        let app_data_root = test_root.path().join("app-data");
        let export_root = test_root.path().join("exports");
        fs::create_dir_all(&export_root).expect("the archive export root must be created");
        let service = NativeStorageService::new(app_data_root)
            .expect("the native archive service must initialize");
        let session_id = open_session(&service, "archive-open");
        execute(
            &service,
            &session_id,
            "archive-schema",
            "CREATE TABLE archive_probe(id INTEGER PRIMARY KEY, value TEXT NOT NULL) STRICT",
        );
        execute(
            &service,
            &session_id,
            "archive-version",
            "PRAGMA user_version = 1",
        );
        execute(
            &service,
            &session_id,
            "archive-original",
            "INSERT INTO archive_probe(id, value) VALUES (1, 'original')",
        );

        let managed_target = test_root
            .path()
            .join("app-data")
            .join("blocked.coredrill-db");
        let managed = service
            .invoke_archive_with_selected_path(
                archive_request(
                    "archive-managed-target",
                    NativeArchiveOperation::Export {
                        session_id: session_id.clone(),
                    },
                ),
                Some(managed_target),
            )
            .expect_err("an archive must never replace a managed app-data path");
        assert_eq!(managed.code, "invalid_request");

        let archive_path = export_root.join("vault.coredrill-db");
        for request_id in ["archive-export-first", "archive-export-replace"] {
            let response = service
                .invoke_archive_with_selected_path(
                    archive_request(
                        request_id,
                        NativeArchiveOperation::Export {
                            session_id: session_id.clone(),
                        },
                    ),
                    Some(archive_path.clone()),
                )
                .expect("export must atomically create or replace the selected archive");
            match response.data {
                NativeArchiveResponseData::Exported { archive } => {
                    assert_eq!(archive.format_version, 1);
                    assert_eq!(archive.schema_version, 1);
                    assert!(archive.database_bytes > 0);
                    assert_eq!(archive.sha256.len(), 64);
                }
                _ => panic!("the export operation must return archive metadata"),
            }
        }

        let cancelled_path = export_root.join("cancelled.coredrill-db");
        let cancelled = service
            .invoke_archive_with_selected_path(
                archive_request(
                    "archive-cancel",
                    NativeArchiveOperation::Export {
                        session_id: session_id.clone(),
                    },
                ),
                None,
            )
            .expect("closing the native picker must be a successful cancellation");
        match cancelled.data {
            NativeArchiveResponseData::Cancelled {
                operation: NativeArchiveOperationName::Export,
            } => {}
            _ => panic!("the cancelled export must be explicit"),
        }
        assert!(!cancelled_path.exists());

        execute(
            &service,
            &session_id,
            "archive-mutated",
            "UPDATE archive_probe SET value = 'mutated' WHERE id = 1",
        );
        assert_eq!(
            query_value(&service, &session_id, "archive-query-mutated"),
            "mutated"
        );

        let corrupt_path = export_root.join("corrupt.coredrill-db");
        let mut corrupt_bytes =
            fs::read(&archive_path).expect("the valid archive must be readable");
        let final_byte = corrupt_bytes
            .last_mut()
            .expect("the valid archive must not be empty");
        *final_byte ^= 0xff;
        fs::write(&corrupt_path, corrupt_bytes).expect("the corrupt archive must be written");
        let corrupt = service
            .invoke_archive_with_selected_path(
                archive_request(
                    "archive-restore-corrupt",
                    NativeArchiveOperation::Restore {
                        session_id: session_id.clone(),
                    },
                ),
                Some(corrupt_path),
            )
            .expect_err("a checksum mismatch must fail before replacement");
        assert_eq!(corrupt.code, "archive_invalid");
        assert_eq!(
            query_value(&service, &session_id, "archive-query-after-corrupt"),
            "mutated"
        );

        let pre_replacement = service
            .invoke_archive_with_selected_path_and_fault(
                archive_request(
                    "archive-restore-pre-replace-fault",
                    NativeArchiveOperation::Restore {
                        session_id: session_id.clone(),
                    },
                ),
                Some(archive_path.clone()),
                RestoreFault::BeforeAtomicReplacement,
            )
            .expect_err("a replacement failure after close must restore the recovery snapshot");
        assert_eq!(pre_replacement.code, "archive_io_failure");
        assert_eq!(
            query_value(
                &service,
                &session_id,
                "archive-query-after-pre-replace-recovery"
            ),
            "mutated"
        );

        let injected = service
            .invoke_archive_with_selected_path_and_fault(
                archive_request(
                    "archive-restore-fault",
                    NativeArchiveOperation::Restore {
                        session_id: session_id.clone(),
                    },
                ),
                Some(archive_path.clone()),
                RestoreFault::AfterAtomicReplacement,
            )
            .expect_err("a post-replacement failure must trigger recovery");
        assert_eq!(injected.code, "archive_restore_failed");
        assert_eq!(
            query_value(&service, &session_id, "archive-query-after-recovery"),
            "mutated"
        );

        let restored = service
            .invoke_archive_with_selected_path(
                archive_request(
                    "archive-restore-valid",
                    NativeArchiveOperation::Restore {
                        session_id: session_id.clone(),
                    },
                ),
                Some(archive_path),
            )
            .expect("the valid archive must restore");
        match restored.data {
            NativeArchiveResponseData::Restored { archive } => {
                assert_eq!(archive.schema_version, 1);
                assert!(archive.database_bytes > 0);
            }
            _ => panic!("the restore operation must return archive metadata"),
        }
        assert_eq!(
            query_value(&service, &session_id, "archive-query-restored"),
            "original"
        );

        service
            .invoke(storage_request(
                "archive-close",
                NativeStorageOperation::Close {
                    session_id: session_id.clone(),
                },
            ))
            .expect("the restored session must close");
        let reopened = open_session(&service, "archive-reopen");
        assert_eq!(
            query_value(&service, &reopened, "archive-query-durable"),
            "original"
        );
        service
            .invoke(storage_request(
                "archive-delete",
                NativeStorageOperation::Delete {
                    session_id: reopened,
                },
            ))
            .expect("the restored archive test database must be deleted");
    }
}
