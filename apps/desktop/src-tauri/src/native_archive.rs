use std::{
    fs::{self, File, OpenOptions},
    io::{self, Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::native_storage::{
    NativeSession, NativeStorageLayout, NativeStorageService, open_database_connection,
    validate_session_id,
};

pub const NATIVE_ARCHIVE_PROTOCOL_VERSION: u16 = 5;
const MAX_PORTABLE_SAVE_BYTES: u64 = 544 * 1024 * 1024;
const MAX_PORTABLE_SAVE_CHUNK_BYTES: usize = 1024 * 1024;
const PORTABLE_SAVE_LIFETIME: Duration = Duration::from_secs(15 * 60);

const ARCHIVE_MAGIC: [u8; 16] = *b"COREDRILL_DB_V1\0";
const ARCHIVE_FORMAT_VERSION: u16 = 1;
const ARCHIVE_HEADER_BYTES: u64 = 16 + 2 + 4 + 8 + 32;
const MAX_REQUEST_ID_BYTES: usize = 64;
const MAX_ARCHIVE_DATABASE_BYTES: u64 = 64 * 1024 * 1024 * 1024;
const MAX_PORTABLE_ENTRY_BYTES: usize = 256 * 1024 * 1024;
const MAX_PORTABLE_ATTACHMENTS: usize = 10_000;
const MAX_MEDIA_TYPE_BYTES: usize = 255;
const MAX_LOGICAL_NAME_BYTES: usize = 512;
const COPY_BUFFER_BYTES: usize = 1024 * 1024;
const SHA256_BYTES: usize = 32;
const TEMP_ATTEMPTS: u8 = 64;
const MIN_BACKUP_RETENTION: u16 = 1;
const MAX_BACKUP_RETENTION: u16 = 90;
const MAX_MANAGED_BACKUP_ENTRIES: usize = 512;
const BACKUP_FILE_PREFIX: &str = "backup-";
const BACKUP_FILE_SUFFIX: &str = ".coredrill-db";
static NEXT_TEMPORARY_FILE: AtomicU64 = AtomicU64::new(1);
static NEXT_BACKUP_FILE: AtomicU64 = AtomicU64::new(1);

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
    PortableReadBegin {
        session_id: String,
        selection_id: String,
    },
    PortableReadChunk {
        session_id: String,
        selection_id: String,
        offset: u64,
    },
    PortableReadRelease {
        session_id: String,
        selection_id: String,
    },
    PortableSaveBegin {
        session_id: String,
        vault_id: String,
        archive_id: String,
        byte_length: u64,
        sha256: String,
    },
    PortableSaveAppend {
        session_id: String,
        archive_id: String,
        offset: u64,
        #[serde(deserialize_with = "deserialize_portable_save_chunk")]
        bytes: Vec<u8>,
    },
    PortableSaveFinish {
        session_id: String,
        vault_id: String,
        archive_id: String,
        byte_length: u64,
        sha256: String,
    },
    PortableSaveAbort {
        session_id: String,
        archive_id: String,
    },
    Export {
        session_id: String,
    },
    Restore {
        session_id: String,
    },
    AutomaticBackup {
        session_id: String,
        retention_count: u16,
    },
    PortableExport {
        session_id: String,
    },
    PortableInspect {
        session_id: String,
        database: NativePortableDatabase,
        expected_vault_id: String,
    },
    PortableTarget {
        session_id: String,
    },
    AttachmentRead {
        session_id: String,
        content_id: String,
    },
    AttachmentPut {
        session_id: String,
        attachment: NativeAttachmentBytes,
    },
    PortableCommit {
        session_id: String,
        expected_target_fingerprint: String,
        vault_id: String,
        database: NativePortableDatabase,
        attachments: Vec<NativePortableAttachment>,
    },
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
    PortableReadReady {
        selection_id: String,
        byte_length: u64,
        sha256: String,
    },
    PortableReadChunk {
        selection_id: String,
        offset: u64,
        bytes: Vec<u8>,
        complete: bool,
    },
    PortableReadReleased {
        selection_id: String,
    },
    PortableReadCancelled {
        selection_id: String,
    },
    PortableSaveProgress {
        archive_id: String,
        received_bytes: u64,
    },
    PortableSaveAborted {
        archive_id: String,
    },
    PortableSaveCancelled {
        archive_id: String,
    },
    PortableSaved {
        vault_id: String,
        archive_id: String,
        byte_length: u64,
        sha256: String,
    },
    Cancelled {
        operation: NativeArchiveOperationName,
    },
    Exported {
        archive: NativeArchiveMetadata,
    },
    Restored {
        archive: NativeArchiveMetadata,
    },
    BackupCreated {
        backup: NativeAutomaticBackupMetadata,
    },
    PortableDatabase {
        database: NativePortableDatabase,
    },
    PortableInspection {
        integrity: PortableIntegrity,
        schema_version: u32,
        vault_id: String,
    },
    PortableTarget {
        target: NativePortableTarget,
    },
    AttachmentData {
        content_id: String,
        byte_length: u64,
        sha256: String,
        bytes: Vec<u8>,
    },
    AttachmentMissing {
        content_id: String,
    },
    AttachmentStored {
        content_id: String,
        byte_length: u64,
        sha256: String,
    },
    PortableCommitted {
        database_sha256: String,
        attachment_count: usize,
    },
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PortableIntegrity {
    Ok,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativePortableDatabase {
    pub schema_version: u32,
    pub byte_length: u64,
    pub sha256: String,
    pub bytes: Vec<u8>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeAttachmentBytes {
    pub content_id: String,
    pub byte_length: u64,
    pub sha256: String,
    pub bytes: Vec<u8>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativePortableAttachment {
    pub content_id: String,
    pub media_type: String,
    pub logical_name: Option<String>,
    pub byte_length: u64,
    pub sha256: String,
    pub bytes: Vec<u8>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(
    tag = "state",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum NativePortableTarget {
    Empty {
        fingerprint: String,
        attachment_content_ids: Vec<String>,
    },
    Present {
        fingerprint: String,
        vault_id: String,
        schema_version: u32,
        database_sha256: String,
        attachment_content_ids: Vec<String>,
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

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeAutomaticBackupMetadata {
    pub created_at_unix_ms: u64,
    pub retention_count: u16,
    pub known_good_backups: u16,
    pub pruned_backups: u16,
    pub cleanup_pending: bool,
    pub archive: NativeArchiveMetadata,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeArchiveError {
    pub code: String,
    pub message: String,
    pub retryable: bool,
}

/// Ephemeral owned bytes only. Dropping the owning session releases the staging.
pub(crate) struct NativePortableSaveStage {
    vault_id: String,
    archive_id: String,
    byte_length: u64,
    sha256: String,
    bytes: Vec<u8>,
    started_at: Instant,
}

/// Read-only selected handle, never a caller-supplied path or whole-file allocation.
pub(crate) struct NativePortableReadStage {
    selection_id: String,
    file: File,
    byte_length: u64,
    sha256: [u8; SHA256_BYTES],
    streamed_hash: Sha256,
    offset: u64,
    started_at: Instant,
}

fn deserialize_portable_save_chunk<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Vec<u8>, D::Error> {
    struct ChunkVisitor;
    impl<'de> serde::de::Visitor<'de> for ChunkVisitor {
        type Value = Vec<u8>;
        fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            formatter.write_str("a bounded portable archive chunk")
        }
        fn visit_seq<A: serde::de::SeqAccess<'de>>(
            self,
            mut sequence: A,
        ) -> Result<Self::Value, A::Error> {
            let mut bytes = Vec::new();
            bytes
                .try_reserve_exact(MAX_PORTABLE_SAVE_CHUNK_BYTES)
                .map_err(|_| serde::de::Error::custom("portable archive chunk unavailable"))?;
            while let Some(byte) = sequence.next_element::<u8>()? {
                if bytes.len() >= MAX_PORTABLE_SAVE_CHUNK_BYTES {
                    return Err(serde::de::Error::custom(
                        "portable archive chunk exceeds its limit",
                    ));
                }
                bytes.push(byte);
            }
            if bytes.is_empty() {
                return Err(serde::de::Error::custom("portable archive chunk is empty"));
            }
            Ok(bytes)
        }
    }
    deserializer.deserialize_seq(ChunkVisitor)
}

impl NativePortableSaveStage {
    fn verify(&self, archive_id: &str, complete: bool) -> Result<(), NativeArchiveError> {
        if self.archive_id != archive_id
            || self.started_at.elapsed() > PORTABLE_SAVE_LIFETIME
            || (complete
                && (self.bytes.len() as u64 != self.byte_length
                    || !self.bytes.starts_with(b"PK\x03\x04")
                    || digest_hex(&digest_bytes(&self.bytes)) != self.sha256))
        {
            return Err(NativeArchiveError::invalid_request());
        }
        Ok(())
    }
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

    fn backup_failed() -> Self {
        Self::new(
            "backup_failed",
            "The automatic backup could not complete; the active vault and prior backups were preserved.",
            true,
        )
    }

    fn backup_verification_failed() -> Self {
        Self::new(
            "backup_verification_failed",
            "The automatic backup did not pass verification; the active vault and prior backups were preserved.",
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

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
enum BackupFault {
    #[default]
    None,
    BeforePublish,
    CorruptAfterPublish,
    CleanupFailure,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct BackupTimestamp {
    unix_seconds: u64,
    nanoseconds: u32,
}

impl BackupTimestamp {
    fn now() -> Result<Self, NativeArchiveError> {
        let duration = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| NativeArchiveError::backup_failed())?;
        Ok(Self {
            unix_seconds: duration.as_secs(),
            nanoseconds: duration.subsec_nanos(),
        })
    }

    fn unix_milliseconds(self) -> Result<u64, NativeArchiveError> {
        self.unix_seconds
            .checked_mul(1_000)
            .and_then(|milliseconds| {
                milliseconds.checked_add(u64::from(self.nanoseconds / 1_000_000))
            })
            .ok_or_else(NativeArchiveError::backup_failed)
    }
}

fn validate_native_archive_request(
    request: &NativeArchiveRequest,
) -> Result<(), NativeArchiveError> {
    validate_request(request)?;
    let session_id = match &request.operation {
        NativeArchiveOperation::PortableReadBegin { session_id, .. }
        | NativeArchiveOperation::PortableReadChunk { session_id, .. }
        | NativeArchiveOperation::PortableReadRelease { session_id, .. }
        | NativeArchiveOperation::PortableSaveBegin { session_id, .. }
        | NativeArchiveOperation::PortableSaveAppend { session_id, .. }
        | NativeArchiveOperation::PortableSaveFinish { session_id, .. }
        | NativeArchiveOperation::PortableSaveAbort { session_id, .. }
        | NativeArchiveOperation::Export { session_id }
        | NativeArchiveOperation::Restore { session_id }
        | NativeArchiveOperation::AutomaticBackup { session_id, .. }
        | NativeArchiveOperation::PortableExport { session_id }
        | NativeArchiveOperation::PortableInspect { session_id, .. }
        | NativeArchiveOperation::PortableTarget { session_id }
        | NativeArchiveOperation::AttachmentRead { session_id, .. }
        | NativeArchiveOperation::AttachmentPut { session_id, .. }
        | NativeArchiveOperation::PortableCommit { session_id, .. } => session_id,
    };
    validate_archive_session_id(session_id)?;
    match &request.operation {
        NativeArchiveOperation::PortableReadBegin { selection_id, .. }
        | NativeArchiveOperation::PortableReadRelease { selection_id, .. } => {
            validate_sha256_hex(selection_id)?
        }
        NativeArchiveOperation::PortableReadChunk {
            selection_id,
            offset,
            ..
        } => {
            validate_sha256_hex(selection_id)?;
            if *offset > MAX_PORTABLE_SAVE_BYTES {
                return Err(NativeArchiveError::invalid_request());
            }
        }
        NativeArchiveOperation::PortableSaveBegin {
            vault_id,
            archive_id,
            byte_length,
            sha256,
            ..
        }
        | NativeArchiveOperation::PortableSaveFinish {
            vault_id,
            archive_id,
            byte_length,
            sha256,
            ..
        } => {
            validate_vault_id(vault_id)?;
            validate_vault_id(archive_id)?;
            validate_sha256_hex(sha256)?;
            if !(22..=MAX_PORTABLE_SAVE_BYTES).contains(byte_length) {
                return Err(NativeArchiveError::invalid_request());
            }
        }
        NativeArchiveOperation::PortableSaveAppend {
            archive_id,
            offset,
            bytes,
            ..
        } => {
            validate_vault_id(archive_id)?;
            if bytes.is_empty()
                || bytes.len() > MAX_PORTABLE_SAVE_CHUNK_BYTES
                || *offset > MAX_PORTABLE_SAVE_BYTES
            {
                return Err(NativeArchiveError::invalid_request());
            }
        }
        NativeArchiveOperation::PortableSaveAbort { archive_id, .. } => {
            validate_vault_id(archive_id)?
        }
        _ => {}
    }
    if let NativeArchiveOperation::AutomaticBackup {
        retention_count, ..
    } = &request.operation
        && !(MIN_BACKUP_RETENTION..=MAX_BACKUP_RETENTION).contains(retention_count)
    {
        return Err(NativeArchiveError::invalid_request());
    }
    Ok(())
}

impl NativeStorageService {
    pub(crate) fn validate_archive_request(
        &self,
        request: &NativeArchiveRequest,
    ) -> Result<(), NativeArchiveError> {
        validate_native_archive_request(request)?;
        let session_id = match &request.operation {
            NativeArchiveOperation::PortableReadBegin { session_id, .. }
            | NativeArchiveOperation::PortableReadChunk { session_id, .. }
            | NativeArchiveOperation::PortableReadRelease { session_id, .. }
            | NativeArchiveOperation::PortableSaveBegin { session_id, .. }
            | NativeArchiveOperation::PortableSaveAppend { session_id, .. }
            | NativeArchiveOperation::PortableSaveFinish { session_id, .. }
            | NativeArchiveOperation::PortableSaveAbort { session_id, .. }
            | NativeArchiveOperation::Export { session_id }
            | NativeArchiveOperation::Restore { session_id }
            | NativeArchiveOperation::AutomaticBackup { session_id, .. }
            | NativeArchiveOperation::PortableExport { session_id }
            | NativeArchiveOperation::PortableInspect { session_id, .. }
            | NativeArchiveOperation::PortableTarget { session_id }
            | NativeArchiveOperation::AttachmentRead { session_id, .. }
            | NativeArchiveOperation::AttachmentPut { session_id, .. }
            | NativeArchiveOperation::PortableCommit { session_id, .. } => session_id,
        };
        let mut state = self
            .state
            .lock()
            .map_err(|_| NativeArchiveError::archive_io_failure())?;
        retire_expired_portable_stages(&mut state);
        if matches!(
            request.operation,
            NativeArchiveOperation::PortableReadBegin { .. }
        ) && state
            .sessions
            .values()
            .any(|session| session.portable_save.is_some() || session.portable_read.is_some())
        {
            return Err(NativeArchiveError::invalid_request());
        }
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
        if session
            .portable_save
            .as_ref()
            .is_some_and(|stage| stage.started_at.elapsed() > PORTABLE_SAVE_LIFETIME)
        {
            session.portable_save = None;
        }
        if let NativeArchiveOperation::PortableSaveFinish {
            vault_id,
            archive_id,
            byte_length,
            sha256,
            ..
        } = &request.operation
        {
            let stage = session
                .portable_save
                .as_ref()
                .ok_or_else(NativeArchiveError::invalid_request)?;
            stage.verify(archive_id, true)?;
            if stage.vault_id != *vault_id
                || stage.byte_length != *byte_length
                || stage.sha256 != *sha256
                || single_vault_id(&session.connection)?.as_deref() != Some(vault_id)
            {
                return Err(NativeArchiveError::invalid_request());
            }
        }
        Ok(())
    }

    pub fn invoke_archive_with_selected_path(
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
        self.validate_archive_request(&request)?;
        let request_id = request.request_id;
        let data = match (request.operation, selected_path) {
            (
                NativeArchiveOperation::PortableReadBegin {
                    session_id,
                    selection_id,
                },
                path,
            ) => self.begin_portable_read(&session_id, selection_id, path.as_deref())?,
            (
                NativeArchiveOperation::PortableReadChunk {
                    session_id,
                    selection_id,
                    offset,
                },
                None,
            ) => self.read_portable_chunk(&session_id, &selection_id, offset)?,
            (
                NativeArchiveOperation::PortableReadRelease {
                    session_id,
                    selection_id,
                },
                None,
            ) => self.release_portable_read(&session_id, selection_id)?,
            (
                NativeArchiveOperation::PortableSaveBegin {
                    session_id,
                    vault_id,
                    archive_id,
                    byte_length,
                    sha256,
                },
                None,
            ) => {
                self.begin_portable_save(&session_id, vault_id, archive_id, byte_length, sha256)?
            }
            (
                NativeArchiveOperation::PortableSaveAppend {
                    session_id,
                    archive_id,
                    offset,
                    bytes,
                },
                None,
            ) => self.append_portable_save(&session_id, archive_id, offset, bytes)?,
            (
                NativeArchiveOperation::PortableSaveAbort {
                    session_id,
                    archive_id,
                },
                None,
            ) => self.abort_portable_save(&session_id, archive_id)?,
            (
                NativeArchiveOperation::PortableSaveFinish {
                    session_id,
                    vault_id,
                    archive_id,
                    byte_length,
                    sha256,
                },
                path,
            ) => self.finish_portable_save(
                &session_id,
                &vault_id,
                &archive_id,
                byte_length,
                &sha256,
                path.as_deref(),
            )?,
            (NativeArchiveOperation::Export { .. }, None) => NativeArchiveResponseData::Cancelled {
                operation: NativeArchiveOperationName::Export,
            },
            (NativeArchiveOperation::Restore { .. }, None) => {
                NativeArchiveResponseData::Cancelled {
                    operation: NativeArchiveOperationName::Restore,
                }
            }
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
            (NativeArchiveOperation::PortableExport { session_id }, None) => {
                NativeArchiveResponseData::PortableDatabase {
                    database: self.export_portable_database(&session_id)?,
                }
            }
            (
                NativeArchiveOperation::PortableInspect {
                    session_id,
                    database,
                    expected_vault_id,
                },
                None,
            ) => {
                let (schema_version, vault_id) =
                    self.inspect_portable_database(&session_id, &database, &expected_vault_id)?;
                NativeArchiveResponseData::PortableInspection {
                    integrity: PortableIntegrity::Ok,
                    schema_version,
                    vault_id,
                }
            }
            (NativeArchiveOperation::PortableTarget { session_id }, None) => {
                NativeArchiveResponseData::PortableTarget {
                    target: self.inspect_portable_target(&session_id)?,
                }
            }
            (
                NativeArchiveOperation::AttachmentRead {
                    session_id,
                    content_id,
                },
                None,
            ) => match self.read_portable_attachment(&session_id, &content_id)? {
                Some(bytes) => NativeArchiveResponseData::AttachmentData {
                    content_id: content_id.clone(),
                    byte_length: bytes.len() as u64,
                    sha256: content_id,
                    bytes,
                },
                None => NativeArchiveResponseData::AttachmentMissing { content_id },
            },
            (
                NativeArchiveOperation::AttachmentPut {
                    session_id,
                    attachment,
                },
                None,
            ) => {
                self.write_portable_attachment(&session_id, &attachment)?;
                NativeArchiveResponseData::AttachmentStored {
                    content_id: attachment.content_id,
                    byte_length: attachment.byte_length,
                    sha256: attachment.sha256,
                }
            }
            (
                NativeArchiveOperation::PortableCommit {
                    session_id,
                    expected_target_fingerprint,
                    vault_id,
                    database,
                    attachments,
                },
                None,
            ) => {
                let database_sha256 = database.sha256.clone();
                let attachment_count = attachments.len();
                self.commit_portable_restore(
                    &session_id,
                    &expected_target_fingerprint,
                    &vault_id,
                    database,
                    attachments,
                )?;
                NativeArchiveResponseData::PortableCommitted {
                    database_sha256,
                    attachment_count,
                }
            }
            (
                NativeArchiveOperation::AutomaticBackup {
                    session_id,
                    retention_count,
                },
                None,
            ) => NativeArchiveResponseData::BackupCreated {
                backup: self.create_automatic_backup(
                    &session_id,
                    retention_count,
                    BackupTimestamp::now()?,
                    BackupFault::None,
                )?,
            },
            (NativeArchiveOperation::AutomaticBackup { .. }, Some(_)) => {
                return Err(NativeArchiveError::invalid_request());
            }
            (
                NativeArchiveOperation::PortableExport { .. }
                | NativeArchiveOperation::PortableReadChunk { .. }
                | NativeArchiveOperation::PortableReadRelease { .. }
                | NativeArchiveOperation::PortableSaveBegin { .. }
                | NativeArchiveOperation::PortableSaveAppend { .. }
                | NativeArchiveOperation::PortableSaveAbort { .. }
                | NativeArchiveOperation::PortableInspect { .. }
                | NativeArchiveOperation::PortableTarget { .. }
                | NativeArchiveOperation::AttachmentRead { .. }
                | NativeArchiveOperation::AttachmentPut { .. }
                | NativeArchiveOperation::PortableCommit { .. },
                Some(_),
            ) => return Err(NativeArchiveError::invalid_request()),
        };
        Ok(NativeArchiveResponse {
            protocol_version: NATIVE_ARCHIVE_PROTOCOL_VERSION,
            request_id,
            data,
        })
    }

    fn begin_portable_read(
        &self,
        session_id: &str,
        selection_id: String,
        selected: Option<&Path>,
    ) -> Result<NativeArchiveResponseData, NativeArchiveError> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| NativeArchiveError::archive_io_failure())?;
        retire_expired_portable_stages(&mut state);
        if state
            .sessions
            .values()
            .any(|session| session.portable_save.is_some() || session.portable_read.is_some())
        {
            return Err(NativeArchiveError::invalid_request());
        }
        let session = portable_save_session(&mut state, session_id)?;
        let Some(selected) = selected else {
            return Ok(NativeArchiveResponseData::PortableReadCancelled { selection_id });
        };
        let path = canonical_restore_source(selected)?;
        let mut file = File::open(&path).map_err(|_| NativeArchiveError::archive_io_failure())?;
        let metadata = file
            .metadata()
            .map_err(|_| NativeArchiveError::archive_io_failure())?;
        if !metadata.is_file() || !(22..=MAX_PORTABLE_SAVE_BYTES).contains(&metadata.len()) {
            return Err(NativeArchiveError::archive_invalid());
        }
        let byte_length = metadata.len();
        let mut prefix = [0_u8; 4];
        file.read_exact(&mut prefix)
            .map_err(|_| NativeArchiveError::archive_io_failure())?;
        if prefix != *b"PK\x03\x04" {
            return Err(NativeArchiveError::archive_invalid());
        }
        file.seek(SeekFrom::Start(0))
            .map_err(|_| NativeArchiveError::archive_io_failure())?;
        let sha256 = digest_selected_portable_file(&mut file, byte_length)?;
        file.seek(SeekFrom::Start(0))
            .map_err(|_| NativeArchiveError::archive_io_failure())?;
        session.portable_read = Some(NativePortableReadStage {
            selection_id: selection_id.clone(),
            file,
            byte_length,
            sha256,
            streamed_hash: Sha256::new(),
            offset: 0,
            started_at: Instant::now(),
        });
        Ok(NativeArchiveResponseData::PortableReadReady {
            selection_id,
            byte_length,
            sha256: digest_hex(&sha256),
        })
    }

    fn read_portable_chunk(
        &self,
        session_id: &str,
        selection_id: &str,
        offset: u64,
    ) -> Result<NativeArchiveResponseData, NativeArchiveError> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| NativeArchiveError::archive_io_failure())?;
        let session = portable_save_session(&mut state, session_id)?;
        let stage = session
            .portable_read
            .as_ref()
            .ok_or_else(NativeArchiveError::invalid_request)?;
        if stage.selection_id != selection_id
            || stage.offset != offset
            || offset >= stage.byte_length
            || stage.started_at.elapsed() > PORTABLE_SAVE_LIFETIME
        {
            return Err(NativeArchiveError::invalid_request());
        }
        let mut stage = session
            .portable_read
            .take()
            .ok_or_else(NativeArchiveError::invalid_request)?;
        let length =
            (stage.byte_length - offset).min(MAX_PORTABLE_SAVE_CHUNK_BYTES as u64) as usize;
        let mut bytes = Vec::new();
        bytes
            .try_reserve_exact(length)
            .map_err(|_| NativeArchiveError::archive_io_failure())?;
        bytes.resize(length, 0);
        stage
            .file
            .read_exact(&mut bytes)
            .map_err(|_| NativeArchiveError::archive_io_failure())?;
        stage.streamed_hash.update(&bytes);
        stage.offset += length as u64;
        let complete = stage.offset == stage.byte_length;
        if complete {
            let mut extra = [0_u8; 1];
            if stage
                .file
                .read(&mut extra)
                .map_err(|_| NativeArchiveError::archive_io_failure())?
                != 0
                || <[u8; SHA256_BYTES]>::from(stage.streamed_hash.finalize()) != stage.sha256
            {
                return Err(NativeArchiveError::archive_invalid());
            }
        } else {
            session.portable_read = Some(stage);
        }
        Ok(NativeArchiveResponseData::PortableReadChunk {
            selection_id: selection_id.to_owned(),
            offset,
            bytes,
            complete,
        })
    }

    fn release_portable_read(
        &self,
        session_id: &str,
        selection_id: String,
    ) -> Result<NativeArchiveResponseData, NativeArchiveError> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| NativeArchiveError::archive_io_failure())?;
        let session = portable_save_session(&mut state, session_id)?;
        if session
            .portable_read
            .as_ref()
            .is_some_and(|stage| stage.selection_id != selection_id)
        {
            return Err(NativeArchiveError::invalid_request());
        }
        session.portable_read = None;
        Ok(NativeArchiveResponseData::PortableReadReleased { selection_id })
    }

    fn begin_portable_save(
        &self,
        session_id: &str,
        vault_id: String,
        archive_id: String,
        byte_length: u64,
        sha256: String,
    ) -> Result<NativeArchiveResponseData, NativeArchiveError> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| NativeArchiveError::archive_io_failure())?;
        retire_expired_portable_stages(&mut state);
        if state
            .sessions
            .values()
            .any(|session| session.portable_save.is_some() || session.portable_read.is_some())
        {
            return Err(NativeArchiveError::invalid_request());
        }
        let session = portable_save_session(&mut state, session_id)?;
        if single_vault_id(&session.connection)?.as_deref() != Some(&vault_id) {
            return Err(NativeArchiveError::invalid_request());
        }
        session.portable_save = Some(NativePortableSaveStage {
            vault_id,
            archive_id: archive_id.clone(),
            byte_length,
            sha256,
            bytes: Vec::new(),
            started_at: Instant::now(),
        });
        Ok(NativeArchiveResponseData::PortableSaveProgress {
            archive_id,
            received_bytes: 0,
        })
    }

    fn append_portable_save(
        &self,
        session_id: &str,
        archive_id: String,
        offset: u64,
        bytes: Vec<u8>,
    ) -> Result<NativeArchiveResponseData, NativeArchiveError> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| NativeArchiveError::archive_io_failure())?;
        let session = portable_save_session(&mut state, session_id)?;
        let stage = session
            .portable_save
            .as_mut()
            .ok_or_else(NativeArchiveError::invalid_request)?;
        stage.verify(&archive_id, false)?;
        if offset != stage.bytes.len() as u64
            || offset
                .checked_add(bytes.len() as u64)
                .is_none_or(|end| end > stage.byte_length)
        {
            return Err(NativeArchiveError::invalid_request());
        }
        stage
            .bytes
            .try_reserve_exact(bytes.len())
            .map_err(|_| NativeArchiveError::archive_io_failure())?;
        stage.bytes.extend_from_slice(&bytes);
        Ok(NativeArchiveResponseData::PortableSaveProgress {
            archive_id,
            received_bytes: stage.bytes.len() as u64,
        })
    }

    fn abort_portable_save(
        &self,
        session_id: &str,
        archive_id: String,
    ) -> Result<NativeArchiveResponseData, NativeArchiveError> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| NativeArchiveError::archive_io_failure())?;
        let session = portable_save_session(&mut state, session_id)?;
        if session
            .portable_save
            .as_ref()
            .is_some_and(|stage| stage.archive_id != archive_id)
        {
            return Err(NativeArchiveError::invalid_request());
        }
        session.portable_save = None;
        Ok(NativeArchiveResponseData::PortableSaveAborted { archive_id })
    }

    fn finish_portable_save(
        &self,
        session_id: &str,
        vault_id: &str,
        archive_id: &str,
        byte_length: u64,
        sha256: &str,
        path: Option<&Path>,
    ) -> Result<NativeArchiveResponseData, NativeArchiveError> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| NativeArchiveError::archive_io_failure())?;
        let session = portable_save_session(&mut state, session_id)?;
        let stage = session
            .portable_save
            .as_ref()
            .ok_or_else(NativeArchiveError::invalid_request)?;
        stage.verify(archive_id, true)?;
        if stage.vault_id != vault_id
            || stage.byte_length != byte_length
            || stage.sha256 != sha256
            || single_vault_id(&session.connection)?.as_deref() != Some(vault_id)
        {
            return Err(NativeArchiveError::invalid_request());
        }
        // Consume before any publication attempt: uncertain saves must never auto-replay.
        let stage = session
            .portable_save
            .take()
            .ok_or_else(NativeArchiveError::invalid_request)?;
        let Some(path) = path else {
            return Ok(NativeArchiveResponseData::PortableSaveCancelled {
                archive_id: stage.archive_id,
            });
        };
        let target = canonical_export_target(path)?;
        if target.starts_with(self.layout.app_data_root()) {
            return Err(NativeArchiveError::invalid_request());
        }
        publish_portable_save(&stage, &target, PortableSaveFault::None)?;
        Ok(NativeArchiveResponseData::PortableSaved {
            vault_id: stage.vault_id,
            archive_id: stage.archive_id,
            byte_length: stage.byte_length,
            sha256: stage.sha256,
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

    fn export_portable_database(
        &self,
        session_id: &str,
    ) -> Result<NativePortableDatabase, NativeArchiveError> {
        validate_archive_session_id(session_id)?;
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
        if schema_version == 0 {
            return Err(NativeArchiveError::archive_invalid());
        }
        let snapshot = create_sqlite_snapshot(
            &session.connection,
            self.layout.database_root(),
            "portable-export",
        )?;
        let bytes =
            fs::read(snapshot.path()).map_err(|_| NativeArchiveError::archive_io_failure())?;
        portable_database_from_bytes(schema_version, bytes)
    }

    fn inspect_portable_database(
        &self,
        session_id: &str,
        database: &NativePortableDatabase,
        expected_vault_id: &str,
    ) -> Result<(u32, String), NativeArchiveError> {
        validate_archive_session_id(session_id)?;
        validate_vault_id(expected_vault_id)?;
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
        let (candidate, schema_version, vault_id) =
            prepare_portable_database(database, self.layout.database_root(), expected_vault_id)?;
        drop(candidate);
        Ok((schema_version, vault_id))
    }

    fn inspect_portable_target(
        &self,
        session_id: &str,
    ) -> Result<NativePortableTarget, NativeArchiveError> {
        validate_archive_session_id(session_id)?;
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
        portable_target_for_session(&self.layout, session)
    }

    fn read_portable_attachment(
        &self,
        session_id: &str,
        content_id: &str,
    ) -> Result<Option<Vec<u8>>, NativeArchiveError> {
        validate_archive_session_id(session_id)?;
        validate_sha256_hex(content_id)?;
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
        let path = self
            .layout
            .prepare_attachment_path(content_id)
            .map_err(|_| NativeArchiveError::archive_io_failure())?;
        let bytes = match read_bounded_attachment(&path) {
            Ok(bytes) => bytes,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(_) => return Err(NativeArchiveError::archive_io_failure()),
        };
        if bytes.len() > MAX_PORTABLE_ENTRY_BYTES || digest_hex(&digest_bytes(&bytes)) != content_id
        {
            return Err(NativeArchiveError::archive_invalid());
        }
        Ok(Some(bytes))
    }

    fn write_portable_attachment(
        &self,
        session_id: &str,
        attachment: &NativeAttachmentBytes,
    ) -> Result<(), NativeArchiveError> {
        validate_archive_session_id(session_id)?;
        validate_sha256_hex(&attachment.content_id)?;
        if attachment.sha256 != attachment.content_id
            || attachment.byte_length != attachment.bytes.len() as u64
            || attachment.bytes.len() > MAX_PORTABLE_ENTRY_BYTES
            || digest_hex(&digest_bytes(&attachment.bytes)) != attachment.content_id
        {
            return Err(NativeArchiveError::archive_invalid());
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
        let target = self
            .layout
            .prepare_attachment_path(&attachment.content_id)
            .map_err(|_| NativeArchiveError::archive_io_failure())?;
        match read_bounded_attachment(&target) {
            Ok(existing) if existing == attachment.bytes => return Ok(()),
            Ok(_) => return Err(NativeArchiveError::archive_invalid()),
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(_) => return Err(NativeArchiveError::archive_io_failure()),
        }
        publish_portable_attachment(
            &self.layout,
            &NativePortableAttachment {
                content_id: attachment.content_id.clone(),
                media_type: "application/octet-stream".to_owned(),
                logical_name: None,
                byte_length: attachment.byte_length,
                sha256: attachment.sha256.clone(),
                bytes: attachment.bytes.clone(),
            },
        )
    }

    fn commit_portable_restore(
        &self,
        session_id: &str,
        expected_target_fingerprint: &str,
        vault_id: &str,
        database: NativePortableDatabase,
        attachments: Vec<NativePortableAttachment>,
    ) -> Result<(), NativeArchiveError> {
        validate_archive_session_id(session_id)?;
        validate_sha256_hex(expected_target_fingerprint)?;
        validate_vault_id(vault_id)?;
        if attachments.len() > MAX_PORTABLE_ATTACHMENTS {
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
        let result = self.commit_removed_portable_session(
            session,
            expected_target_fingerprint,
            vault_id,
            database,
            attachments,
        );
        match result {
            RestoreSessionResult::Restored(session, _) => {
                state.sessions.insert(session_id.to_owned(), session);
                Ok(())
            }
            RestoreSessionResult::Preserved(session, error) => {
                state.sessions.insert(session_id.to_owned(), session);
                Err(error)
            }
            RestoreSessionResult::Closed(error) => Err(error),
        }
    }

    fn commit_removed_portable_session(
        &self,
        session: NativeSession,
        expected_target_fingerprint: &str,
        vault_id: &str,
        database: NativePortableDatabase,
        attachments: Vec<NativePortableAttachment>,
    ) -> RestoreSessionResult {
        if session.transaction_active {
            return RestoreSessionResult::Preserved(
                session,
                NativeArchiveError::transaction_state(),
            );
        }
        let target = match portable_target_for_session(&self.layout, &session) {
            Ok(target) => target,
            Err(error) => return RestoreSessionResult::Preserved(session, error),
        };
        if portable_target_fingerprint(&target) != expected_target_fingerprint {
            return RestoreSessionResult::Preserved(session, NativeArchiveError::restore_failed());
        }
        let current_schema = match validate_connection(&session.connection, None) {
            Ok(schema) => schema,
            Err(error) => return RestoreSessionResult::Preserved(session, error),
        };
        let (incoming, incoming_schema, incoming_vault_id) =
            match prepare_portable_database(&database, self.layout.database_root(), vault_id) {
                Ok(prepared) => prepared,
                Err(error) => return RestoreSessionResult::Preserved(session, error),
            };
        if incoming_vault_id != vault_id {
            return RestoreSessionResult::Preserved(session, NativeArchiveError::archive_invalid());
        }
        if let Err(error) =
            validate_and_publish_portable_attachments(&self.layout, incoming.path(), &attachments)
        {
            return RestoreSessionResult::Preserved(session, error);
        }
        let recovery = match create_sqlite_snapshot(
            &session.connection,
            self.layout.database_root(),
            "portable-recovery",
        ) {
            Ok(recovery) => recovery,
            Err(error) => return RestoreSessionResult::Preserved(session, error),
        };
        if validate_sqlite_file(recovery.path(), Some(current_schema)).is_err() {
            return RestoreSessionResult::Preserved(
                session,
                NativeArchiveError::archive_io_failure(),
            );
        }

        let metadata = NativeArchiveMetadata {
            format_version: ARCHIVE_FORMAT_VERSION,
            schema_version: incoming_schema,
            database_bytes: database.byte_length,
            sha256: database.sha256,
        };
        let database_path = session.database_path;
        drop(session.connection);
        if remove_database_sidecars(&database_path).is_err()
            || atomic_replace_and_sync(incoming.path(), &database_path).is_err()
        {
            return recover_session_after_close(database_path, recovery, current_schema);
        }
        match open_and_validate_database(&database_path, incoming_schema) {
            Ok(connection) => RestoreSessionResult::Restored(
                NativeSession {
                    portable_save: None,
                    portable_read: None,
                    connection,
                    database_path,
                    transaction_active: false,
                },
                metadata,
            ),
            Err(_) => {
                if remove_database_sidecars(&database_path).is_err()
                    || atomic_replace_and_sync(recovery.path(), &database_path).is_err()
                {
                    return RestoreSessionResult::Closed(NativeArchiveError::recovery_failed());
                }
                match open_and_validate_database(&database_path, current_schema) {
                    Ok(connection) => RestoreSessionResult::Preserved(
                        NativeSession {
                            portable_save: None,
                            portable_read: None,
                            connection,
                            database_path,
                            transaction_active: false,
                        },
                        NativeArchiveError::restore_failed(),
                    ),
                    Err(_) => RestoreSessionResult::Closed(NativeArchiveError::recovery_failed()),
                }
            }
        }
    }

    fn create_automatic_backup(
        &self,
        session_id: &str,
        retention_count: u16,
        timestamp: BackupTimestamp,
        fault: BackupFault,
    ) -> Result<NativeAutomaticBackupMetadata, NativeArchiveError> {
        validate_archive_session_id(session_id)?;
        if !(MIN_BACKUP_RETENTION..=MAX_BACKUP_RETENTION).contains(&retention_count) {
            return Err(NativeArchiveError::invalid_request());
        }
        let mut state = self
            .state
            .lock()
            .map_err(|_| NativeArchiveError::backup_failed())?;
        let session = state
            .sessions
            .get_mut(session_id)
            .ok_or_else(NativeArchiveError::session_missing)?;
        if session.transaction_active {
            return Err(NativeArchiveError::transaction_state());
        }
        self.layout
            .verify_database_path(&session.database_path)
            .map_err(|_| NativeArchiveError::backup_failed())?;
        let backup_directory = self
            .layout
            .prepare_backup_directory(&session.database_path)
            .map_err(|_| NativeArchiveError::backup_failed())?;
        ensure_backup_capacity(&backup_directory)?;
        let schema_version = validate_connection(&session.connection, None)
            .map_err(|_| NativeArchiveError::backup_verification_failed())?;
        let snapshot = create_sqlite_snapshot(
            &session.connection,
            self.layout.database_root(),
            "automatic-backup",
        )
        .map_err(|_| NativeArchiveError::backup_failed())?;
        validate_sqlite_file(snapshot.path(), Some(schema_version))
            .map_err(|_| NativeArchiveError::backup_verification_failed())?;
        let (database_bytes, digest) =
            digest_file(snapshot.path()).map_err(|_| NativeArchiveError::backup_failed())?;
        if database_bytes > MAX_ARCHIVE_DATABASE_BYTES {
            return Err(NativeArchiveError::backup_verification_failed());
        }
        let archive = NativeArchiveMetadata {
            format_version: ARCHIVE_FORMAT_VERSION,
            schema_version,
            database_bytes,
            sha256: digest_hex(&digest),
        };
        if fault == BackupFault::BeforePublish {
            return Err(NativeArchiveError::backup_failed());
        }

        let backup_path = backup_directory.join(backup_file_name(timestamp));
        reject_link_or_directory(&backup_path).map_err(|_| NativeArchiveError::backup_failed())?;
        write_archive_atomically(snapshot.path(), &backup_path, &archive, digest)
            .map_err(|_| NativeArchiveError::backup_failed())?;
        if fault == BackupFault::CorruptAfterPublish {
            corrupt_final_byte(&backup_path).map_err(|_| NativeArchiveError::backup_failed())?;
        }

        let verified_archive =
            extract_and_validate_archive(&backup_path, self.layout.database_root(), schema_version)
                .map(|(_, metadata)| metadata);
        if !matches!(verified_archive, Ok(ref metadata) if metadata == &archive) {
            let _ = fs::remove_file(&backup_path);
            let _ = sync_parent(&backup_directory);
            return Err(NativeArchiveError::backup_verification_failed());
        }

        let (known_good_backups, pruned_backups, cleanup_pending) = match inspect_managed_backups(
            &backup_directory,
            self.layout.database_root(),
            schema_version,
        ) {
            Ok(inventory) => {
                let rotation = rotate_verified_backups(
                    inventory.known_good,
                    &backup_path,
                    retention_count,
                    fault == BackupFault::CleanupFailure,
                );
                (
                    rotation.known_good_backups,
                    rotation.pruned_backups,
                    inventory.invalid_entries > 0 || rotation.cleanup_pending,
                )
            }
            Err(_) => (1, 0, true),
        };

        Ok(NativeAutomaticBackupMetadata {
            created_at_unix_ms: timestamp.unix_milliseconds()?,
            retention_count,
            known_good_backups,
            pruned_backups,
            cleanup_pending,
            archive,
        })
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
                    portable_save: None,
                    portable_read: None,
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
                            portable_save: None,
                            portable_read: None,
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

fn retire_expired_portable_stages(state: &mut crate::native_storage::NativeStorageState) {
    for session in state.sessions.values_mut() {
        if session
            .portable_save
            .as_ref()
            .is_some_and(|stage| stage.started_at.elapsed() > PORTABLE_SAVE_LIFETIME)
        {
            session.portable_save = None;
        }
        if session
            .portable_read
            .as_ref()
            .is_some_and(|stage| stage.started_at.elapsed() > PORTABLE_SAVE_LIFETIME)
        {
            session.portable_read = None;
        }
    }
}

fn digest_selected_portable_file(
    file: &mut File,
    expected_length: u64,
) -> Result<[u8; SHA256_BYTES], NativeArchiveError> {
    let mut reader = file.take(expected_length + 1);
    let mut hasher = Sha256::new();
    let mut buffer = vec![0_u8; COPY_BUFFER_BYTES];
    let mut length = 0_u64;
    loop {
        let read = reader
            .read(&mut buffer)
            .map_err(|_| NativeArchiveError::archive_io_failure())?;
        if read == 0 {
            break;
        }
        length += read as u64;
        if length > expected_length {
            return Err(NativeArchiveError::archive_invalid());
        }
        hasher.update(&buffer[..read]);
    }
    if length != expected_length {
        return Err(NativeArchiveError::archive_invalid());
    }
    Ok(hasher.finalize().into())
}

fn portable_save_session<'a>(
    state: &'a mut crate::native_storage::NativeStorageState,
    session_id: &str,
) -> Result<&'a mut NativeSession, NativeArchiveError> {
    let session = state
        .sessions
        .get_mut(session_id)
        .ok_or_else(NativeArchiveError::session_missing)?;
    if session.transaction_active {
        return Err(NativeArchiveError::transaction_state());
    }
    Ok(session)
}

#[derive(Clone, Copy)]
enum PortableSaveFault {
    None,
    #[cfg(test)]
    BeforePublish,
    #[cfg(test)]
    AfterPublish,
}

fn publish_portable_save(
    stage: &NativePortableSaveStage,
    target: &Path,
    _fault: PortableSaveFault,
) -> Result<(), NativeArchiveError> {
    let parent = target
        .parent()
        .ok_or_else(NativeArchiveError::invalid_request)?;
    let (temporary, mut output) = TemporaryPath::create(parent, "portable-export")?;
    output
        .write_all(&stage.bytes)
        .and_then(|_| output.flush())
        .and_then(|_| output.sync_all())
        .map_err(|_| NativeArchiveError::archive_io_failure())?;
    drop(output);
    let expected = (stage.byte_length, stage.sha256.as_str());
    let (length, digest) = digest_portable_save_file(temporary.path(), stage.byte_length)?;
    if (length, digest_hex(&digest).as_str()) != expected {
        return Err(NativeArchiveError::archive_io_failure());
    }
    #[cfg(test)]
    if matches!(_fault, PortableSaveFault::BeforePublish) {
        return Err(NativeArchiveError::archive_io_failure());
    }
    reject_link_or_directory(target)?;
    atomic_replace_and_sync(temporary.path(), target)?;
    #[cfg(test)]
    if matches!(_fault, PortableSaveFault::AfterPublish) {
        return Err(NativeArchiveError::archive_io_failure());
    }
    let (length, digest) = digest_portable_save_file(target, stage.byte_length)?;
    if (length, digest_hex(&digest).as_str()) != expected {
        return Err(NativeArchiveError::archive_io_failure());
    }
    Ok(())
}

fn digest_portable_save_file(
    path: &Path,
    expected_length: u64,
) -> Result<(u64, [u8; SHA256_BYTES]), NativeArchiveError> {
    reject_link_or_directory(path)?;
    let file = File::open(path).map_err(|_| NativeArchiveError::archive_io_failure())?;
    let mut reader = file.take(expected_length + 1);
    let mut hasher = Sha256::new();
    let mut buffer = vec![0_u8; COPY_BUFFER_BYTES];
    let mut length = 0_u64;
    loop {
        let read = reader
            .read(&mut buffer)
            .map_err(|_| NativeArchiveError::archive_io_failure())?;
        if read == 0 {
            break;
        }
        length += read as u64;
        if length > expected_length {
            return Err(NativeArchiveError::archive_io_failure());
        }
        hasher.update(&buffer[..read]);
    }
    Ok((length, hasher.finalize().into()))
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

fn digest_bytes(bytes: &[u8]) -> [u8; SHA256_BYTES] {
    Sha256::digest(bytes).into()
}

fn portable_database_from_bytes(
    schema_version: u32,
    bytes: Vec<u8>,
) -> Result<NativePortableDatabase, NativeArchiveError> {
    if schema_version == 0 || bytes.len() > MAX_PORTABLE_ENTRY_BYTES {
        return Err(NativeArchiveError::archive_invalid());
    }
    let digest = digest_bytes(&bytes);
    Ok(NativePortableDatabase {
        schema_version,
        byte_length: bytes.len() as u64,
        sha256: digest_hex(&digest),
        bytes,
    })
}

fn validate_sha256_hex(value: &str) -> Result<(), NativeArchiveError> {
    if value.len() != SHA256_BYTES * 2
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(NativeArchiveError::invalid_request());
    }
    Ok(())
}

fn validate_vault_id(value: &str) -> Result<(), NativeArchiveError> {
    let bytes = value.as_bytes();
    let hyphens = [8_usize, 13, 18, 23];
    if bytes.len() != 36
        || hyphens.iter().any(|index| bytes[*index] != b'-')
        || bytes[14] != b'7'
        || !matches!(bytes[19], b'8' | b'9' | b'a' | b'b')
        || bytes.iter().enumerate().any(|(index, byte)| {
            !hyphens.contains(&index) && !(byte.is_ascii_digit() || (b'a'..=b'f').contains(byte))
        })
    {
        return Err(NativeArchiveError::invalid_request());
    }
    Ok(())
}

fn prepare_portable_database(
    database: &NativePortableDatabase,
    database_root: &Path,
    expected_vault_id: &str,
) -> Result<(TemporaryPath, u32, String), NativeArchiveError> {
    validate_vault_id(expected_vault_id)?;
    validate_sha256_hex(&database.sha256)?;
    if database.schema_version == 0
        || database.bytes.len() > MAX_PORTABLE_ENTRY_BYTES
        || database.byte_length != database.bytes.len() as u64
        || digest_hex(&digest_bytes(&database.bytes)) != database.sha256
    {
        return Err(NativeArchiveError::archive_invalid());
    }
    let (temporary, mut file) = TemporaryPath::create(database_root, "portable-incoming")?;
    file.write_all(&database.bytes)
        .and_then(|_| file.flush())
        .and_then(|_| file.sync_all())
        .map_err(|_| NativeArchiveError::archive_io_failure())?;
    drop(file);
    let schema_version = validate_sqlite_file(temporary.path(), Some(database.schema_version))?;
    let connection = Connection::open_with_flags(
        temporary.path(),
        OpenFlags::SQLITE_OPEN_READ_ONLY
            | OpenFlags::SQLITE_OPEN_NO_MUTEX
            | OpenFlags::SQLITE_OPEN_NOFOLLOW,
    )
    .map_err(|_| NativeArchiveError::archive_invalid())?;
    connection
        .execute_batch("PRAGMA trusted_schema = OFF;")
        .map_err(|_| NativeArchiveError::archive_invalid())?;
    let vault_id = single_vault_id(&connection)?.ok_or_else(NativeArchiveError::archive_invalid)?;
    if vault_id != expected_vault_id {
        return Err(NativeArchiveError::archive_invalid());
    }
    Ok((temporary, schema_version, vault_id))
}

fn single_vault_id(connection: &Connection) -> Result<Option<String>, NativeArchiveError> {
    let has_vault = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'vault')",
            [],
            |row| row.get::<_, u8>(0),
        )
        .map_err(|_| NativeArchiveError::archive_invalid())?
        == 1;
    if !has_vault {
        return Ok(None);
    }
    let mut statement = connection
        .prepare("SELECT id FROM vault ORDER BY id")
        .map_err(|_| NativeArchiveError::archive_invalid())?;
    let ids = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|_| NativeArchiveError::archive_invalid())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| NativeArchiveError::archive_invalid())?;
    if ids.len() > 1 {
        return Err(NativeArchiveError::archive_invalid());
    }
    if let Some(id) = ids.first() {
        validate_vault_id(id)?;
    }
    Ok(ids.into_iter().next())
}

fn attachment_manifest_rows(
    connection: &Connection,
) -> Result<Vec<(String, String, u64)>, NativeArchiveError> {
    let has_manifest = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'attachment_manifest')",
            [],
            |row| row.get::<_, u8>(0),
        )
        .map_err(|_| NativeArchiveError::archive_invalid())?
        == 1;
    if !has_manifest {
        return Ok(Vec::new());
    }
    let mut statement = connection
        .prepare(
            "SELECT content_id, media_type, byte_length FROM attachment_manifest ORDER BY content_id",
        )
        .map_err(|_| NativeArchiveError::archive_invalid())?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
            ))
        })
        .map_err(|_| NativeArchiveError::archive_invalid())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| NativeArchiveError::archive_invalid())?;
    let mut result = Vec::with_capacity(rows.len());
    for (content_id, media_type, byte_length) in rows {
        validate_sha256_hex(&content_id)?;
        if media_type.is_empty()
            || media_type.len() > MAX_MEDIA_TYPE_BYTES
            || byte_length < 0
            || byte_length as u64 > MAX_PORTABLE_ENTRY_BYTES as u64
        {
            return Err(NativeArchiveError::archive_invalid());
        }
        result.push((content_id, media_type, byte_length as u64));
    }
    Ok(result)
}

fn portable_target_fingerprint(target: &NativePortableTarget) -> &str {
    match target {
        NativePortableTarget::Empty { fingerprint, .. }
        | NativePortableTarget::Present { fingerprint, .. } => fingerprint,
    }
}

fn calculate_target_fingerprint(database_sha256: &str, content_ids: &[String]) -> String {
    let mut preimage = format!("coredrill-restore-target-v1\ndatabase:{database_sha256}\n");
    for content_id in content_ids {
        preimage.push_str(content_id);
        preimage.push('\n');
    }
    digest_hex(&digest_bytes(preimage.as_bytes()))
}

fn portable_target_for_session(
    layout: &NativeStorageLayout,
    session: &NativeSession,
) -> Result<NativePortableTarget, NativeArchiveError> {
    layout
        .verify_database_path(&session.database_path)
        .map_err(|_| NativeArchiveError::archive_io_failure())?;
    let snapshot = create_sqlite_snapshot(
        &session.connection,
        layout.database_root(),
        "portable-target",
    )?;
    let (_, digest) = digest_file(snapshot.path())?;
    let database_sha256 = digest_hex(&digest);
    let vault_id = single_vault_id(&session.connection)?;
    let manifest_rows = attachment_manifest_rows(&session.connection)?;
    if vault_id.is_none() {
        if !manifest_rows.is_empty() {
            return Err(NativeArchiveError::archive_invalid());
        }
        return Ok(NativePortableTarget::Empty {
            fingerprint: calculate_target_fingerprint(&database_sha256, &[]),
            attachment_content_ids: Vec::new(),
        });
    }
    let mut content_ids = Vec::with_capacity(manifest_rows.len());
    for (content_id, _, byte_length) in manifest_rows {
        let path = layout
            .prepare_attachment_path(&content_id)
            .map_err(|_| NativeArchiveError::archive_io_failure())?;
        let bytes = fs::read(path).map_err(|_| NativeArchiveError::archive_invalid())?;
        if bytes.len() as u64 != byte_length || digest_hex(&digest_bytes(&bytes)) != content_id {
            return Err(NativeArchiveError::archive_invalid());
        }
        content_ids.push(content_id);
    }
    let schema_version = validate_connection(&session.connection, None)?;
    let vault_id = vault_id.ok_or_else(NativeArchiveError::archive_invalid)?;
    Ok(NativePortableTarget::Present {
        fingerprint: calculate_target_fingerprint(&database_sha256, &content_ids),
        vault_id,
        schema_version,
        database_sha256,
        attachment_content_ids: content_ids,
    })
}

fn validate_and_publish_portable_attachments(
    layout: &NativeStorageLayout,
    database_path: &Path,
    attachments: &[NativePortableAttachment],
) -> Result<(), NativeArchiveError> {
    let connection = Connection::open_with_flags(
        database_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY
            | OpenFlags::SQLITE_OPEN_NO_MUTEX
            | OpenFlags::SQLITE_OPEN_NOFOLLOW,
    )
    .map_err(|_| NativeArchiveError::archive_invalid())?;
    connection
        .execute_batch("PRAGMA trusted_schema = OFF;")
        .map_err(|_| NativeArchiveError::archive_invalid())?;
    let manifest_rows = attachment_manifest_rows(&connection)?;
    if manifest_rows.len() != attachments.len() {
        return Err(NativeArchiveError::archive_invalid());
    }
    for ((expected_id, expected_media_type, expected_length), attachment) in
        manifest_rows.iter().zip(attachments)
    {
        validate_sha256_hex(&attachment.content_id)?;
        validate_sha256_hex(&attachment.sha256)?;
        if attachment.content_id != *expected_id
            || attachment.sha256 != attachment.content_id
            || attachment.media_type != *expected_media_type
            || attachment.media_type.is_empty()
            || attachment.media_type.len() > MAX_MEDIA_TYPE_BYTES
            || attachment.byte_length != *expected_length
            || attachment.byte_length != attachment.bytes.len() as u64
            || attachment.bytes.len() > MAX_PORTABLE_ENTRY_BYTES
            || digest_hex(&digest_bytes(&attachment.bytes)) != attachment.content_id
            || attachment
                .logical_name
                .as_ref()
                .is_some_and(|logical_name| {
                    logical_name.trim().is_empty() || logical_name.len() > MAX_LOGICAL_NAME_BYTES
                })
        {
            return Err(NativeArchiveError::archive_invalid());
        }
        publish_portable_attachment(layout, attachment)?;
    }
    Ok(())
}

fn read_bounded_attachment(path: &Path) -> io::Result<Vec<u8>> {
    let file = File::open(path)?;
    let metadata = file.metadata()?;
    if !metadata.is_file() || metadata.len() > MAX_PORTABLE_ENTRY_BYTES as u64 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Invalid attachment.",
        ));
    }
    let mut bytes = Vec::new();
    file.take(MAX_PORTABLE_ENTRY_BYTES as u64 + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() > MAX_PORTABLE_ENTRY_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Invalid attachment.",
        ));
    }
    Ok(bytes)
}

fn publish_portable_attachment(
    layout: &NativeStorageLayout,
    attachment: &NativePortableAttachment,
) -> Result<(), NativeArchiveError> {
    let target = layout
        .prepare_attachment_path(&attachment.content_id)
        .map_err(|_| NativeArchiveError::archive_io_failure())?;
    match read_bounded_attachment(&target) {
        Ok(existing)
            if existing.len() == attachment.bytes.len()
                && digest_hex(&digest_bytes(&existing)) == attachment.content_id =>
        {
            return Ok(());
        }
        Ok(_) => {}
        // Explicit archive restore may repair a corrupt oversized payload without reading it.
        Err(error) if error.kind() == io::ErrorKind::InvalidData => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(_) => return Err(NativeArchiveError::archive_io_failure()),
    }
    let parent = target
        .parent()
        .ok_or_else(NativeArchiveError::archive_io_failure)?;
    let (temporary, mut output) = TemporaryPath::create(parent, "portable-attachment")?;
    output
        .write_all(&attachment.bytes)
        .and_then(|_| output.flush())
        .and_then(|_| output.sync_all())
        .map_err(|_| NativeArchiveError::archive_io_failure())?;
    drop(output);
    atomic_replace_and_sync(temporary.path(), &target)?;
    let stored = fs::read(&target).map_err(|_| NativeArchiveError::archive_io_failure())?;
    if stored.len() != attachment.bytes.len()
        || digest_hex(&digest_bytes(&stored)) != attachment.content_id
    {
        return Err(NativeArchiveError::archive_io_failure());
    }
    Ok(())
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
                portable_save: None,
                portable_read: None,
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

fn backup_file_name(timestamp: BackupTimestamp) -> String {
    let sequence = NEXT_BACKUP_FILE.fetch_add(1, Ordering::Relaxed);
    format!(
        "{BACKUP_FILE_PREFIX}{:020}-{:09}-{:020}{BACKUP_FILE_SUFFIX}",
        timestamp.unix_seconds, timestamp.nanoseconds, sequence
    )
}

fn is_managed_backup_file_name(name: &str) -> bool {
    let Some(body) = name
        .strip_prefix(BACKUP_FILE_PREFIX)
        .and_then(|value| value.strip_suffix(BACKUP_FILE_SUFFIX))
    else {
        return false;
    };
    let mut components = body.split('-');
    matches!(
        (
            components.next(),
            components.next(),
            components.next(),
            components.next(),
        ),
        (Some(seconds), Some(nanos), Some(sequence), None)
            if seconds.len() == 20
                && nanos.len() == 9
                && sequence.len() == 20
                && seconds.bytes().all(|byte| byte.is_ascii_digit())
                && nanos.bytes().all(|byte| byte.is_ascii_digit())
                && sequence.bytes().all(|byte| byte.is_ascii_digit())
    )
}

fn corrupt_final_byte(path: &Path) -> Result<(), NativeArchiveError> {
    let mut file = OpenOptions::new()
        .read(true)
        .write(true)
        .open(path)
        .map_err(|_| NativeArchiveError::backup_failed())?;
    let length = file
        .metadata()
        .map_err(|_| NativeArchiveError::backup_failed())?
        .len();
    if length == 0 {
        return Err(NativeArchiveError::backup_failed());
    }
    file.seek(SeekFrom::Start(length - 1))
        .map_err(|_| NativeArchiveError::backup_failed())?;
    let mut byte = [0_u8; 1];
    file.read_exact(&mut byte)
        .map_err(|_| NativeArchiveError::backup_failed())?;
    byte[0] ^= 0xff;
    file.seek(SeekFrom::Start(length - 1))
        .and_then(|_| file.write_all(&byte))
        .and_then(|_| file.flush())
        .and_then(|_| file.sync_all())
        .map_err(|_| NativeArchiveError::backup_failed())
}

struct ManagedBackupInventory {
    known_good: Vec<PathBuf>,
    invalid_entries: usize,
}

fn inspect_managed_backups(
    backup_directory: &Path,
    database_root: &Path,
    expected_schema: u32,
) -> Result<ManagedBackupInventory, NativeArchiveError> {
    let mut entries = fs::read_dir(backup_directory)
        .map_err(|_| NativeArchiveError::backup_failed())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| NativeArchiveError::backup_failed())?;
    if entries.len() > MAX_MANAGED_BACKUP_ENTRIES {
        return Err(NativeArchiveError::backup_failed());
    }
    entries.sort_by_key(|entry| entry.file_name());
    let mut known_good = Vec::new();
    let mut invalid_entries = 0_usize;
    for entry in entries {
        let path = entry.path();
        let name_is_valid = entry
            .file_name()
            .to_str()
            .is_some_and(is_managed_backup_file_name);
        let file_type = entry
            .file_type()
            .map_err(|_| NativeArchiveError::backup_failed())?;
        if !name_is_valid || !file_type.is_file() || file_type.is_symlink() {
            invalid_entries += 1;
            continue;
        }
        let canonical = match fs::canonicalize(&path) {
            Ok(canonical) => canonical,
            Err(_) => {
                invalid_entries += 1;
                continue;
            }
        };
        if canonical.parent() != Some(backup_directory) {
            invalid_entries += 1;
            continue;
        }
        match extract_and_validate_archive(&canonical, database_root, expected_schema) {
            Ok(_) => known_good.push(canonical),
            Err(_) => invalid_entries += 1,
        }
    }
    Ok(ManagedBackupInventory {
        known_good,
        invalid_entries,
    })
}

fn ensure_backup_capacity(backup_directory: &Path) -> Result<(), NativeArchiveError> {
    let entries =
        fs::read_dir(backup_directory).map_err(|_| NativeArchiveError::backup_failed())?;
    let mut count = 0_usize;
    for entry in entries {
        entry.map_err(|_| NativeArchiveError::backup_failed())?;
        count += 1;
        if count >= MAX_MANAGED_BACKUP_ENTRIES {
            return Err(NativeArchiveError::backup_failed());
        }
    }
    Ok(())
}

struct BackupRotationResult {
    known_good_backups: u16,
    pruned_backups: u16,
    cleanup_pending: bool,
}

fn rotate_verified_backups(
    mut known_good: Vec<PathBuf>,
    newest_backup: &Path,
    retention_count: u16,
    inject_cleanup_failure: bool,
) -> BackupRotationResult {
    known_good.sort();
    let known_good_count = known_good.len();
    let desired_prune = known_good_count.saturating_sub(usize::from(retention_count));
    if desired_prune == 0 {
        return BackupRotationResult {
            known_good_backups: u16::try_from(known_good_count).unwrap_or(u16::MAX),
            pruned_backups: 0,
            cleanup_pending: false,
        };
    }
    if inject_cleanup_failure {
        return BackupRotationResult {
            known_good_backups: u16::try_from(known_good_count).unwrap_or(u16::MAX),
            pruned_backups: 0,
            cleanup_pending: true,
        };
    }

    let mut pruned = 0_usize;
    let mut cleanup_pending = false;
    for path in known_good
        .iter()
        .filter(|path| path.as_path() != newest_backup)
        .take(desired_prune)
    {
        match fs::remove_file(path) {
            Ok(()) => pruned += 1,
            Err(_) => cleanup_pending = true,
        }
    }
    if pruned > 0 {
        match newest_backup.parent() {
            Some(parent) if sync_parent(parent).is_ok() => {}
            _ => cleanup_pending = true,
        }
    }
    cleanup_pending |= known_good_count.saturating_sub(pruned) > usize::from(retention_count);
    BackupRotationResult {
        known_good_backups: u16::try_from(known_good_count.saturating_sub(pruned))
            .unwrap_or(u16::MAX),
        pruned_backups: u16::try_from(pruned).unwrap_or(u16::MAX),
        cleanup_pending,
    }
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
            let mut options = OpenOptions::new();
            options.write(true).create_new(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                options.mode(0o600);
            }
            match options.open(&path) {
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
        sync::atomic::{AtomicU64, Ordering},
        time::{SystemTime, UNIX_EPOCH},
    };

    use crate::native_storage::{
        NativeSqlStatement, NativeSqlValue, NativeStorageOperation, NativeStorageRequest,
        NativeStorageResponseData,
    };

    use super::{
        BackupFault, BackupTimestamp, NATIVE_ARCHIVE_PROTOCOL_VERSION, NativeArchiveOperation,
        NativeArchiveOperationName, NativeArchiveRequest, NativeArchiveResponseData, RestoreFault,
        extract_and_validate_archive,
    };
    use crate::native_storage::{NATIVE_STORAGE_PROTOCOL_VERSION, NativeStorageService};

    static NEXT_TEST_ROOT: AtomicU64 = AtomicU64::new(1);

    struct TestRoot(PathBuf);

    impl TestRoot {
        fn new() -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("the system clock must follow the Unix epoch")
                .as_nanos();
            let sequence = NEXT_TEST_ROOT.fetch_add(1, Ordering::Relaxed);
            Self(std::env::temp_dir().join(format!(
                "coredrill-native-archive-{}-{nonce}-{sequence}",
                process::id(),
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

    fn read_request(
        session: &str,
        selection: &str,
        kind: &str,
        offset: Option<u64>,
    ) -> NativeArchiveRequest {
        let mut operation =
            serde_json::json!({"type":kind,"sessionId":session,"selectionId":selection});
        if let Some(offset) = offset {
            operation["offset"] = offset.into();
        }
        serde_json::from_value(serde_json::json!({"protocolVersion":super::NATIVE_ARCHIVE_PROTOCOL_VERSION,"requestId":"portable-read-test","operation":operation})).unwrap()
    }

    #[test]
    fn portable_read_is_bounded_ordered_non_mutating_and_released_after_completion() {
        let root = TestRoot::new();
        let service = NativeStorageService::new(root.path().join("managed")).unwrap();
        let session = open_session(&service, "portable-read-open");
        execute(
            &service,
            &session,
            "read-schema",
            "PRAGMA user_version = 160",
        );
        let before = service.export_portable_database(&session).unwrap().bytes;
        let source = root.path().join("selected.coredrill.zip");
        let mut bytes = vec![65_u8; super::MAX_PORTABLE_SAVE_CHUNK_BYTES + 27];
        bytes[..4].copy_from_slice(b"PK\x03\x04");
        fs::write(&source, &bytes).unwrap();
        let id = "a".repeat(64);
        let cancelled = service
            .invoke_archive_with_selected_path(
                read_request(&session, &id, "portable_read_begin", None),
                None,
            )
            .unwrap();
        assert!(matches!(
            cancelled.data,
            NativeArchiveResponseData::PortableReadCancelled { .. }
        ));
        let ready = service
            .invoke_archive_with_selected_path(
                read_request(&session, &id, "portable_read_begin", None),
                Some(source.clone()),
            )
            .unwrap();
        let ready = serde_json::to_value(ready).unwrap();
        assert_eq!(ready["data"]["byteLength"], bytes.len());
        assert_eq!(
            ready["data"]["sha256"],
            super::digest_hex(&super::digest_bytes(&bytes))
        );
        assert!(!ready.to_string().contains("selected.coredrill.zip"));
        assert!(
            service
                .invoke_archive_with_selected_path(
                    read_request(&session, &id, "portable_read_begin", None),
                    Some(source.clone())
                )
                .is_err()
        );
        assert!(
            service
                .invoke_archive_with_selected_path(
                    read_request(&session, &"b".repeat(64), "portable_read_release", None),
                    None
                )
                .is_err()
        );
        assert!(
            service
                .invoke_archive_with_selected_path(
                    read_request(&session, &id, "portable_read_chunk", Some(1)),
                    None
                )
                .is_err()
        );
        let mut received = Vec::new();
        for offset in [0, super::MAX_PORTABLE_SAVE_CHUNK_BYTES as u64] {
            let response = service
                .invoke_archive_with_selected_path(
                    read_request(&session, &id, "portable_read_chunk", Some(offset)),
                    None,
                )
                .unwrap();
            match response.data {
                NativeArchiveResponseData::PortableReadChunk {
                    bytes, complete, ..
                } => {
                    assert!(bytes.len() <= super::MAX_PORTABLE_SAVE_CHUNK_BYTES);
                    assert_eq!(complete, offset > 0);
                    received.extend(bytes);
                }
                _ => panic!("expected a portable read chunk"),
            }
        }
        assert_eq!(received, bytes);
        assert_eq!(fs::read(&source).unwrap(), bytes);
        assert_eq!(
            service.export_portable_database(&session).unwrap().bytes,
            before
        );
        assert!(
            service
                .invoke_archive_with_selected_path(
                    read_request(&session, &id, "portable_read_chunk", Some(0)),
                    None
                )
                .is_err()
        );
        service
            .invoke_archive_with_selected_path(
                read_request(&session, &id, "portable_read_release", None),
                None,
            )
            .unwrap();
        assert!(
            service
                .state
                .lock()
                .unwrap()
                .sessions
                .values()
                .all(|s| s.portable_read.is_none())
        );
    }

    #[test]
    fn portable_read_rejects_source_changes_invalid_files_and_unreviewed_requests() {
        let root = TestRoot::new();
        let service = NativeStorageService::new(root.path().join("managed")).unwrap();
        let session = open_session(&service, "portable-read-open");
        let source = root.path().join("selected.zip");
        let bytes = b"PK\x03\x04synthetic opaque portable ZIP bytes".to_vec();
        let id = "c".repeat(64);
        for replacement in [vec![0_u8; 10], vec![0_u8; 40]] {
            fs::write(&source, replacement).unwrap();
            assert!(
                service
                    .invoke_archive_with_selected_path(
                        read_request(&session, &id, "portable_read_begin", None),
                        Some(source.clone())
                    )
                    .is_err()
            );
        }
        assert!(
            service
                .invoke_archive_with_selected_path(
                    read_request(&session, &id, "portable_read_begin", None),
                    Some(root.path().to_path_buf())
                )
                .is_err()
        );
        assert!(
            service
                .invoke_archive_with_selected_path(
                    read_request(&session, &id, "portable_read_begin", None),
                    Some(PathBuf::from("relative.zip"))
                )
                .is_err()
        );
        for replacement in [
            vec![0_u8; bytes.len()],
            vec![0_u8; bytes.len() - 1],
            vec![0_u8; bytes.len() + 1],
        ] {
            fs::write(&source, &bytes).unwrap();
            service
                .invoke_archive_with_selected_path(
                    read_request(&session, &id, "portable_read_begin", None),
                    Some(source.clone()),
                )
                .unwrap();
            fs::write(&source, replacement).unwrap();
            assert!(
                service
                    .invoke_archive_with_selected_path(
                        read_request(&session, &id, "portable_read_chunk", Some(0)),
                        None
                    )
                    .is_err()
            );
            assert!(
                service.state.lock().unwrap().sessions[&session]
                    .portable_read
                    .is_none()
            );
        }
        fs::write(&source, &bytes).unwrap();
        let oversized = fs::OpenOptions::new().write(true).open(&source).unwrap();
        oversized
            .set_len(super::MAX_PORTABLE_SAVE_BYTES + 1)
            .unwrap();
        assert!(
            service
                .invoke_archive_with_selected_path(
                    read_request(&session, &id, "portable_read_begin", None),
                    Some(source.clone())
                )
                .is_err()
        );
        drop(oversized);
        let valid = serde_json::json!({"protocolVersion":super::NATIVE_ARCHIVE_PROTOCOL_VERSION,"requestId":"read-fields","operation":{"type":"portable_read_begin","sessionId":session,"selectionId":id}});
        serde_json::from_value::<NativeArchiveRequest>(valid.clone()).unwrap();
        let mut invalid = valid.clone();
        invalid["operation"]["path"] = "PRIVATE_PATH".into();
        assert!(serde_json::from_value::<NativeArchiveRequest>(invalid).is_err());
        let mut invalid = valid;
        invalid["protocolVersion"] = 4.into();
        assert!(
            service
                .invoke_archive_with_selected_path(serde_json::from_value(invalid).unwrap(), None)
                .is_err()
        );
        #[cfg(unix)]
        {
            let link = root.path().join("link.zip");
            std::os::unix::fs::symlink(&source, &link).unwrap();
            assert!(
                service
                    .invoke_archive_with_selected_path(
                        read_request(&session, &id, "portable_read_begin", None),
                        Some(link)
                    )
                    .is_err()
            );
        }
    }

    #[test]
    fn portable_read_lifetime_and_global_save_exclusion_are_session_owned() {
        let root = TestRoot::new();
        let service = NativeStorageService::new(root.path().join("managed")).unwrap();
        let first = open_session(&service, "read-lifetime-open");
        let second = match service
            .invoke(storage_request(
                "read-second-open",
                NativeStorageOperation::Open {
                    database_name: "second.sqlite3".to_owned(),
                },
            ))
            .unwrap()
            .data
        {
            NativeStorageResponseData::Opened { session_id } => session_id,
            _ => panic!("expected session"),
        };
        let source = root.path().join("selected.zip");
        fs::write(&source, b"PK\x03\x04synthetic opaque portable ZIP bytes").unwrap();
        let id = "d".repeat(64);
        let other = "e".repeat(64);
        let vault = "0198e102-0000-7000-8000-000000000001";
        execute(
            &service,
            &first,
            "read-vault-schema",
            "CREATE TABLE vault (id TEXT PRIMARY KEY)",
        );
        execute(
            &service,
            &first,
            "read-vault",
            &format!("INSERT INTO vault VALUES ('{vault}')"),
        );
        let save = || NativeArchiveRequest {
            protocol_version: super::NATIVE_ARCHIVE_PROTOCOL_VERSION,
            request_id: "read-save-exclusion".to_owned(),
            operation: NativeArchiveOperation::PortableSaveBegin {
                session_id: first.clone(),
                vault_id: vault.to_owned(),
                archive_id: vault.to_owned(),
                byte_length: 40,
                sha256: "a".repeat(64),
            },
        };
        service
            .invoke_archive_with_selected_path(
                read_request(&first, &id, "portable_read_begin", None),
                Some(source.clone()),
            )
            .unwrap();
        assert!(
            service
                .invoke_archive_with_selected_path(save(), None)
                .is_err()
        );
        assert!(
            service
                .invoke_archive_with_selected_path(
                    read_request(&second, &id, "portable_read_chunk", Some(0)),
                    None
                )
                .is_err()
        );
        service
            .invoke_archive_with_selected_path(
                read_request(&second, &id, "portable_read_release", None),
                None,
            )
            .unwrap();
        assert!(
            service.state.lock().unwrap().sessions[&first]
                .portable_read
                .is_some()
        );
        service
            .invoke(storage_request(
                "read-transaction",
                NativeStorageOperation::Begin {
                    session_id: first.clone(),
                },
            ))
            .unwrap();
        assert!(
            service
                .invoke_archive_with_selected_path(
                    read_request(&first, &id, "portable_read_chunk", Some(0)),
                    None
                )
                .is_err()
        );
        service
            .invoke(storage_request(
                "read-rollback",
                NativeStorageOperation::Rollback {
                    session_id: first.clone(),
                },
            ))
            .unwrap();
        service
            .state
            .lock()
            .unwrap()
            .sessions
            .get_mut(&first)
            .unwrap()
            .portable_read
            .as_mut()
            .unwrap()
            .started_at = std::time::Instant::now()
            - super::PORTABLE_SAVE_LIFETIME
            - std::time::Duration::from_secs(1);
        service
            .invoke_archive_with_selected_path(
                read_request(&second, &other, "portable_read_begin", None),
                Some(source.clone()),
            )
            .unwrap();
        assert!(
            service
                .invoke_archive_with_selected_path(
                    read_request(&first, &id, "portable_read_chunk", Some(0)),
                    None
                )
                .is_err()
        );
        service
            .invoke(storage_request(
                "read-close",
                NativeStorageOperation::Close {
                    session_id: second.clone(),
                },
            ))
            .unwrap();
        assert!(
            service
                .invoke_archive_with_selected_path(
                    read_request(&second, &other, "portable_read_chunk", Some(0)),
                    None
                )
                .is_err()
        );
        service
            .invoke_archive_with_selected_path(save(), None)
            .unwrap();
        assert!(
            service
                .invoke_archive_with_selected_path(
                    read_request(&first, &id, "portable_read_begin", None),
                    Some(source.clone())
                )
                .is_err()
        );
        service
            .abort_portable_save(&first, vault.to_owned())
            .unwrap();
        service
            .invoke_archive_with_selected_path(
                read_request(&first, &id, "portable_read_begin", None),
                Some(source),
            )
            .unwrap();
        service.retire_webview_sessions().unwrap();
        assert!(service.state.lock().unwrap().sessions.is_empty());
        assert!(
            service
                .invoke_archive_with_selected_path(
                    read_request(&first, &id, "portable_read_chunk", Some(0)),
                    None
                )
                .is_err()
        );
    }

    #[test]
    fn portable_save_stages_exact_owned_bytes_and_releases_on_cancel() {
        let root = TestRoot::new();
        let service = NativeStorageService::new(root.path().join("managed")).unwrap();
        let session_id = open_session(&service, "portable-save-open");
        let vault_id = "0198e102-0000-7000-8000-000000000001";
        let archive_id = "0198e102-0000-7000-8000-000000000002";
        execute(
            &service,
            &session_id,
            "portable-save-schema",
            "CREATE TABLE vault (id TEXT PRIMARY KEY)",
        );
        execute(
            &service,
            &session_id,
            "portable-save-vault",
            &format!("INSERT INTO vault VALUES ('{vault_id}')"),
        );
        let bytes = b"PK\x03\x04synthetic opaque portable ZIP bytes";
        let sha256 = super::digest_hex(&super::digest_bytes(bytes));
        let invoke = |operation: serde_json::Value| {
            let request: NativeArchiveRequest = serde_json::from_value(serde_json::json!({
                "protocolVersion": super::NATIVE_ARCHIVE_PROTOCOL_VERSION,
                "requestId": "portable-save-test",
                "operation": operation
            }))
            .expect("portable save operation must be recognized");
            service.invoke_archive_with_selected_path(request, None)
        };
        invoke(serde_json::json!({"type":"portable_save_begin","sessionId":session_id,"vaultId":vault_id,"archiveId":archive_id,"byteLength":bytes.len(),"sha256":sha256})).unwrap();
        invoke(serde_json::json!({"type":"portable_save_append","sessionId":session_id,"archiveId":archive_id,"offset":0,"bytes":bytes.as_slice()})).unwrap();
        let result = invoke(serde_json::json!({"type":"portable_save_finish","sessionId":session_id,"vaultId":vault_id,"archiveId":archive_id,"byteLength":bytes.len(),"sha256":sha256})).unwrap();
        let response = serde_json::to_value(result).unwrap();
        assert_eq!(response["data"]["type"], "portable_save_cancelled");
        assert!(invoke(serde_json::json!({"type":"portable_save_finish","sessionId":session_id,"vaultId":vault_id,"archiveId":archive_id,"byteLength":bytes.len(),"sha256":sha256})).is_err());
    }

    #[test]
    fn portable_save_checks_order_identity_limits_and_exact_external_publication() {
        let root = TestRoot::new();
        fs::create_dir_all(root.path()).unwrap();
        let service = NativeStorageService::new(root.path().join("managed")).unwrap();
        let session = open_session(&service, "save-owned-open");
        let other = open_session(&service, "save-foreign-open");
        let vault = "0198e102-0000-7000-8000-000000000001";
        let archive = "0198e102-0000-7000-8000-000000000002";
        execute(
            &service,
            &session,
            "save-schema",
            "CREATE TABLE vault (id TEXT PRIMARY KEY)",
        );
        execute(
            &service,
            &session,
            "save-vault",
            &format!("INSERT INTO vault VALUES ('{vault}')"),
        );
        let bytes = b"PK\x03\x04synthetic opaque portable ZIP bytes".as_slice();
        let sha = super::digest_hex(&super::digest_bytes(bytes));
        let begin = serde_json::json!({"type":"portable_save_begin","sessionId":session,"vaultId":vault,"archiveId":archive,"byteLength":bytes.len(),"sha256":sha});
        let append = serde_json::json!({"type":"portable_save_append","sessionId":session,"archiveId":archive,"offset":0,"bytes":bytes});
        let finish = serde_json::json!({"type":"portable_save_finish","sessionId":session,"vaultId":vault,"archiveId":archive,"byteLength":bytes.len(),"sha256":sha});
        let invoke = |operation: serde_json::Value, selected: Option<PathBuf>| {
            let request = serde_json::from_value::<NativeArchiveRequest>(serde_json::json!({"protocolVersion":super::NATIVE_ARCHIVE_PROTOCOL_VERSION,"requestId":"save-test","operation":operation})).unwrap();
            service.invoke_archive_with_selected_path(request, selected)
        };
        let mut invalid = begin.clone();
        invalid["vaultId"] = serde_json::json!(archive);
        assert!(invoke(invalid, None).is_err());
        let mut invalid = begin.clone();
        invalid["byteLength"] = serde_json::json!(super::MAX_PORTABLE_SAVE_BYTES + 1);
        assert!(invoke(invalid, None).is_err());
        invoke(begin.clone(), None).unwrap();
        assert!(invoke(begin.clone(), None).is_err());
        let target = root.path().join("selected.coredrill.zip");
        fs::write(&target, b"prior user file").unwrap();
        assert!(invoke(finish.clone(), Some(target.clone())).is_err());
        assert_eq!(fs::read(&target).unwrap(), b"prior user file");
        let mut invalid = append.clone();
        invalid["offset"] = serde_json::json!(1);
        assert!(invoke(invalid, None).is_err());
        let mut invalid = append.clone();
        invalid["sessionId"] = serde_json::json!(other);
        assert!(invoke(invalid, None).is_err());
        invoke(append.clone(), None).unwrap();
        assert!(invoke(append, None).is_err());
        let mut invalid = finish.clone();
        invalid["sha256"] = serde_json::json!("0".repeat(64));
        assert!(invoke(invalid, Some(target.clone())).is_err());
        execute(
            &service,
            &session,
            "save-drift",
            &format!("UPDATE vault SET id = '{archive}'"),
        );
        assert!(invoke(finish.clone(), Some(target.clone())).is_err());
        execute(
            &service,
            &session,
            "save-original",
            &format!("UPDATE vault SET id = '{vault}'"),
        );
        let saved = invoke(finish.clone(), Some(target.clone())).unwrap();
        let saved = serde_json::to_value(saved).unwrap();
        assert_eq!(saved["data"]["type"], "portable_saved");
        assert_eq!(saved["data"]["sha256"], sha);
        assert_eq!(fs::read(&target).unwrap(), bytes);
        assert!(!saved.to_string().contains("path"));
        assert!(invoke(finish, Some(target)).is_err());
        assert!(
            service
                .state
                .lock()
                .unwrap()
                .sessions
                .values()
                .all(|session| session.portable_save.is_none())
        );
    }

    #[test]
    fn portable_save_rejects_corrupt_bytes_and_confined_or_unsafe_targets() {
        let root = TestRoot::new();
        fs::create_dir_all(root.path()).unwrap();
        let managed = root.path().join("managed");
        let service = NativeStorageService::new(managed.clone()).unwrap();
        let session = open_session(&service, "save-confined");
        let vault = "0198e102-0000-7000-8000-000000000001";
        let archive = "0198e102-0000-7000-8000-000000000002";
        execute(
            &service,
            &session,
            "save-schema",
            "CREATE TABLE vault (id TEXT PRIMARY KEY)",
        );
        execute(
            &service,
            &session,
            "save-vault",
            &format!("INSERT INTO vault VALUES ('{vault}')"),
        );
        let bytes = b"PK\x03\x04synthetic opaque portable ZIP bytes".to_vec();
        let sha = super::digest_hex(&super::digest_bytes(&bytes));
        let begin = || {
            archive_request(
                "save-begin",
                NativeArchiveOperation::PortableSaveBegin {
                    session_id: session.clone(),
                    vault_id: vault.to_owned(),
                    archive_id: archive.to_owned(),
                    byte_length: bytes.len() as u64,
                    sha256: sha.clone(),
                },
            )
        };
        let append = |payload| {
            archive_request(
                "save-append",
                NativeArchiveOperation::PortableSaveAppend {
                    session_id: session.clone(),
                    archive_id: archive.to_owned(),
                    offset: 0,
                    bytes: payload,
                },
            )
        };
        let finish = || {
            archive_request(
                "save-finish",
                NativeArchiveOperation::PortableSaveFinish {
                    session_id: session.clone(),
                    vault_id: vault.to_owned(),
                    archive_id: archive.to_owned(),
                    byte_length: bytes.len() as u64,
                    sha256: sha.clone(),
                },
            )
        };
        let original = root.path().join("original.zip");
        fs::write(&original, b"existing private bytes").unwrap();
        service
            .invoke_archive_with_selected_path(begin(), None)
            .unwrap();
        let mut corrupt = bytes.clone();
        corrupt[10] ^= 1;
        service
            .invoke_archive_with_selected_path(append(corrupt), None)
            .unwrap();
        assert!(
            service
                .invoke_archive_with_selected_path(finish(), Some(original.clone()))
                .is_err()
        );
        assert_eq!(fs::read(&original).unwrap(), b"existing private bytes");
        service
            .invoke_archive_with_selected_path(
                archive_request(
                    "save-abort",
                    NativeArchiveOperation::PortableSaveAbort {
                        session_id: session.clone(),
                        archive_id: archive.to_owned(),
                    },
                ),
                None,
            )
            .unwrap();
        let directory = root.path().join("directory");
        fs::create_dir(&directory).unwrap();
        for target in [
            managed.join("forbidden.zip"),
            directory.clone(),
            PathBuf::from("relative.zip"),
        ] {
            service
                .invoke_archive_with_selected_path(begin(), None)
                .unwrap();
            service
                .invoke_archive_with_selected_path(append(bytes.clone()), None)
                .unwrap();
            assert!(
                service
                    .invoke_archive_with_selected_path(finish(), Some(target))
                    .is_err()
            );
            assert!(
                service
                    .state
                    .lock()
                    .unwrap()
                    .sessions
                    .get(&session)
                    .unwrap()
                    .portable_save
                    .is_none()
            );
        }
        assert!(!managed.join("forbidden.zip").exists());
        assert_eq!(fs::read_dir(&directory).unwrap().count(), 0);
        assert_eq!(fs::read(&original).unwrap(), b"existing private bytes");
        #[cfg(unix)]
        {
            let link = root.path().join("symlink.zip");
            std::os::unix::fs::symlink(&original, &link).unwrap();
            service
                .invoke_archive_with_selected_path(begin(), None)
                .unwrap();
            service
                .invoke_archive_with_selected_path(append(bytes.clone()), None)
                .unwrap();
            assert!(
                service
                    .invoke_archive_with_selected_path(finish(), Some(link))
                    .is_err()
            );
            assert_eq!(fs::read(&original).unwrap(), b"existing private bytes");
        }
    }

    #[test]
    fn portable_save_lifetime_and_session_close_release_the_global_staging_limit() {
        let root = TestRoot::new();
        let service = NativeStorageService::new(root.path().join("managed")).unwrap();
        let first = open_session(&service, "save-first");
        let second = open_session(&service, "save-second");
        let vault = "0198e102-0000-7000-8000-000000000001";
        let archive = "0198e102-0000-7000-8000-000000000002";
        execute(
            &service,
            &first,
            "save-schema",
            "CREATE TABLE vault (id TEXT PRIMARY KEY)",
        );
        execute(
            &service,
            &first,
            "save-vault",
            &format!("INSERT INTO vault VALUES ('{vault}')"),
        );
        let begin = |session_id: &str| {
            archive_request(
                "save-begin",
                NativeArchiveOperation::PortableSaveBegin {
                    session_id: session_id.to_owned(),
                    vault_id: vault.to_owned(),
                    archive_id: archive.to_owned(),
                    byte_length: 32,
                    sha256: "0".repeat(64),
                },
            )
        };
        service
            .invoke_archive_with_selected_path(begin(&first), None)
            .unwrap();
        assert!(
            service
                .invoke_archive_with_selected_path(begin(&second), None)
                .is_err()
        );
        service
            .invoke_archive_with_selected_path(
                archive_request(
                    "foreign-abort",
                    NativeArchiveOperation::PortableSaveAbort {
                        session_id: second.clone(),
                        archive_id: archive.to_owned(),
                    },
                ),
                None,
            )
            .unwrap();
        assert!(
            service
                .invoke_archive_with_selected_path(begin(&second), None)
                .is_err()
        );
        service
            .invoke(storage_request(
                "save-close",
                NativeStorageOperation::Close {
                    session_id: first.clone(),
                },
            ))
            .unwrap();
        service
            .invoke_archive_with_selected_path(begin(&second), None)
            .unwrap();
        service
            .state
            .lock()
            .unwrap()
            .sessions
            .get_mut(&second)
            .unwrap()
            .portable_save
            .as_mut()
            .unwrap()
            .started_at = std::time::Instant::now()
            - super::PORTABLE_SAVE_LIFETIME
            - std::time::Duration::from_secs(1);
        service
            .invoke_archive_with_selected_path(begin(&second), None)
            .unwrap();
        service.retire_webview_sessions().unwrap();
        assert!(service.state.lock().unwrap().sessions.is_empty());
        let replacement = open_session(&service, "save-replacement");
        service
            .invoke_archive_with_selected_path(begin(&replacement), None)
            .unwrap();
        service
            .invoke(storage_request(
                "save-transaction",
                NativeStorageOperation::Begin {
                    session_id: replacement.clone(),
                },
            ))
            .unwrap();
        assert!(
            service
                .invoke_archive_with_selected_path(
                    archive_request(
                        "save-abort",
                        NativeArchiveOperation::PortableSaveAbort {
                            session_id: replacement.clone(),
                            archive_id: archive.to_owned()
                        }
                    ),
                    None
                )
                .is_err()
        );
        service
            .invoke(storage_request(
                "save-rollback",
                NativeStorageOperation::Rollback {
                    session_id: replacement.clone(),
                },
            ))
            .unwrap();
        service
            .invoke_archive_with_selected_path(
                archive_request(
                    "save-abort",
                    NativeArchiveOperation::PortableSaveAbort {
                        session_id: replacement,
                        archive_id: archive.to_owned(),
                    },
                ),
                None,
            )
            .unwrap();
    }

    #[test]
    fn portable_save_faults_preserve_prior_files_or_report_uncertain_publication() {
        let root = TestRoot::new();
        fs::create_dir_all(root.path()).unwrap();
        let bytes = b"PK\x03\x04synthetic opaque portable ZIP bytes".to_vec();
        let stage = super::NativePortableSaveStage {
            vault_id: "0198e102-0000-7000-8000-000000000001".to_owned(),
            archive_id: "0198e102-0000-7000-8000-000000000002".to_owned(),
            byte_length: bytes.len() as u64,
            sha256: super::digest_hex(&super::digest_bytes(&bytes)),
            bytes: bytes.clone(),
            started_at: std::time::Instant::now(),
        };
        let target = root.path().join("prior.zip");
        fs::write(&target, b"prior bytes").unwrap();
        assert!(
            super::publish_portable_save(&stage, &target, super::PortableSaveFault::BeforePublish)
                .is_err()
        );
        assert_eq!(fs::read(&target).unwrap(), b"prior bytes");
        assert!(
            super::publish_portable_save(&stage, &target, super::PortableSaveFault::AfterPublish)
                .is_err()
        );
        assert_eq!(fs::read(&target).unwrap(), bytes);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(&target).unwrap().permissions().mode() & 0o077,
                0
            );
        }
        assert_eq!(fs::read_dir(root.path()).unwrap().count(), 1);
        fs::write(
            &target,
            [stage.bytes.as_slice(), b"unexpected growth"].concat(),
        )
        .unwrap();
        assert!(super::digest_portable_save_file(&target, stage.byte_length).is_err());
    }

    #[test]
    fn portable_save_chunk_deserialization_rejects_oversized_empty_and_unknown_fields() {
        let operation = serde_json::json!({"type":"portable_save_append","sessionId":"native-session-1","archiveId":"0198e102-0000-7000-8000-000000000002","offset":0,"bytes":[1]});
        for bytes in [
            serde_json::json!([]),
            serde_json::json!([256]),
            serde_json::json!(vec![0_u8; super::MAX_PORTABLE_SAVE_CHUNK_BYTES + 1]),
        ] {
            let mut invalid = operation.clone();
            invalid["bytes"] = bytes;
            assert!(serde_json::from_value::<NativeArchiveOperation>(invalid).is_err());
        }
        let mut invalid = operation;
        invalid["path"] = serde_json::json!("private-path");
        assert!(serde_json::from_value::<NativeArchiveOperation>(invalid).is_err());
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

    fn backup_paths(service: &NativeStorageService, session_id: &str) -> Vec<PathBuf> {
        let database_path = {
            let state = service
                .state
                .lock()
                .expect("the native storage state must be available");
            state
                .sessions
                .get(session_id)
                .expect("the native storage session must exist")
                .database_path
                .clone()
        };
        let backup_directory = service
            .layout
            .prepare_backup_directory(&database_path)
            .expect("the managed backup directory must resolve");
        let mut paths = fs::read_dir(backup_directory)
            .expect("the managed backup directory must be readable")
            .map(|entry| entry.expect("the backup entry must be readable").path())
            .collect::<Vec<_>>();
        paths.sort();
        paths
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

    #[test]
    fn automatic_backups_verify_before_rotation_and_preserve_last_known_good() {
        let test_root = TestRoot::new();
        let app_data_root = test_root.path().join("app-data");
        let service = NativeStorageService::new(app_data_root)
            .expect("the native backup service must initialize");
        let session_id = open_session(&service, "backup-open");
        execute(
            &service,
            &session_id,
            "backup-schema",
            "CREATE TABLE archive_probe(id INTEGER PRIMARY KEY, value TEXT NOT NULL) STRICT",
        );
        execute(
            &service,
            &session_id,
            "backup-version",
            "PRAGMA user_version = 1",
        );
        execute(
            &service,
            &session_id,
            "backup-first-value",
            "INSERT INTO archive_probe(id, value) VALUES (1, 'first')",
        );

        let first = service
            .create_automatic_backup(
                &session_id,
                2,
                BackupTimestamp {
                    unix_seconds: 1_000,
                    nanoseconds: 1,
                },
                BackupFault::None,
            )
            .expect("the first automatic backup must verify");
        assert_eq!(first.created_at_unix_ms, 1_000_000);
        assert_eq!(first.known_good_backups, 1);
        assert_eq!(first.pruned_backups, 0);
        assert!(!first.cleanup_pending);
        let first_paths = backup_paths(&service, &session_id);
        assert_eq!(first_paths.len(), 1);
        let first_name = first_paths[0]
            .file_name()
            .and_then(|name| name.to_str())
            .expect("the first backup name must be UTF-8");
        assert!(first_name.starts_with("backup-00000000000000001000-000000001-"));

        execute(
            &service,
            &session_id,
            "backup-second-value",
            "UPDATE archive_probe SET value = 'second' WHERE id = 1",
        );
        let second = service
            .create_automatic_backup(
                &session_id,
                2,
                BackupTimestamp {
                    unix_seconds: 2_000,
                    nanoseconds: 2,
                },
                BackupFault::None,
            )
            .expect("the second automatic backup must verify");
        assert_eq!(second.known_good_backups, 2);
        assert_eq!(second.pruned_backups, 0);

        execute(
            &service,
            &session_id,
            "backup-third-value",
            "UPDATE archive_probe SET value = 'third' WHERE id = 1",
        );
        let third = service
            .create_automatic_backup(
                &session_id,
                2,
                BackupTimestamp {
                    unix_seconds: 3_000,
                    nanoseconds: 3,
                },
                BackupFault::None,
            )
            .expect("the third automatic backup must verify before rotation");
        assert_eq!(third.known_good_backups, 2);
        assert_eq!(third.pruned_backups, 1);
        assert!(!third.cleanup_pending);
        let retained_after_rotation = backup_paths(&service, &session_id);
        assert_eq!(retained_after_rotation.len(), 2);
        assert!(!retained_after_rotation.contains(&first_paths[0]));

        let before_failed_publish = retained_after_rotation.clone();
        let failed_publish = service
            .create_automatic_backup(
                &session_id,
                1,
                BackupTimestamp {
                    unix_seconds: 4_000,
                    nanoseconds: 4,
                },
                BackupFault::BeforePublish,
            )
            .expect_err("a pre-publication failure must not rotate prior backups");
        assert_eq!(failed_publish.code, "backup_failed");
        assert_eq!(backup_paths(&service, &session_id), before_failed_publish);

        let failed_verification = service
            .create_automatic_backup(
                &session_id,
                1,
                BackupTimestamp {
                    unix_seconds: 5_000,
                    nanoseconds: 5,
                },
                BackupFault::CorruptAfterPublish,
            )
            .expect_err("a corrupt newly published backup must fail verification");
        assert_eq!(failed_verification.code, "backup_verification_failed");
        assert_eq!(backup_paths(&service, &session_id), before_failed_publish);
        assert_eq!(
            query_value(&service, &session_id, "backup-query-after-failures"),
            "third"
        );

        execute(
            &service,
            &session_id,
            "backup-fourth-value",
            "UPDATE archive_probe SET value = 'fourth' WHERE id = 1",
        );
        let cleanup_deferred = service
            .create_automatic_backup(
                &session_id,
                1,
                BackupTimestamp {
                    unix_seconds: 6_000,
                    nanoseconds: 6,
                },
                BackupFault::CleanupFailure,
            )
            .expect("cleanup failure must not erase successful backup creation");
        assert_eq!(cleanup_deferred.known_good_backups, 3);
        assert_eq!(cleanup_deferred.pruned_backups, 0);
        assert!(cleanup_deferred.cleanup_pending);
        assert_eq!(backup_paths(&service, &session_id).len(), 3);

        let recovered_cleanup = service
            .create_automatic_backup(
                &session_id,
                1,
                BackupTimestamp {
                    unix_seconds: 7_000,
                    nanoseconds: 7,
                },
                BackupFault::None,
            )
            .expect("a later successful backup must finish deferred rotation");
        assert_eq!(recovered_cleanup.known_good_backups, 1);
        assert_eq!(recovered_cleanup.pruned_backups, 3);
        assert!(!recovered_cleanup.cleanup_pending);
        let final_paths = backup_paths(&service, &session_id);
        assert_eq!(final_paths.len(), 1);
        let (verified_database, verified_metadata) =
            extract_and_validate_archive(&final_paths[0], service.layout.database_root(), 1)
                .expect("the final retained backup must remain restorable");
        assert_eq!(verified_metadata, recovered_cleanup.archive);
        drop(verified_database);
        assert_eq!(
            query_value(&service, &session_id, "backup-query-after-rotation"),
            "fourth"
        );

        for retention_count in [0, 91] {
            let invalid = service
                .invoke_archive_with_selected_path(
                    archive_request(
                        "backup-invalid-retention",
                        NativeArchiveOperation::AutomaticBackup {
                            session_id: session_id.clone(),
                            retention_count,
                        },
                    ),
                    None,
                )
                .expect_err("unsafe retention must fail before filesystem mutation");
            assert_eq!(invalid.code, "invalid_request");
        }
        assert_eq!(backup_paths(&service, &session_id), final_paths);
        let public_backup = service
            .invoke_archive_with_selected_path(
                archive_request(
                    "backup-public-operation",
                    NativeArchiveOperation::AutomaticBackup {
                        session_id: session_id.clone(),
                        retention_count: 1,
                    },
                ),
                None,
            )
            .expect("the path-free public automatic-backup operation must succeed");
        match public_backup.data {
            NativeArchiveResponseData::BackupCreated { backup } => {
                assert_eq!(backup.retention_count, 1);
                assert_eq!(backup.known_good_backups, 1);
                assert_eq!(backup.pruned_backups, 1);
                assert!(!backup.cleanup_pending);
            }
            _ => panic!("the automatic-backup operation must return backup metadata"),
        }
        assert_eq!(backup_paths(&service, &session_id).len(), 1);
        assert_eq!(
            query_value(&service, &session_id, "backup-query-after-public-operation"),
            "fourth"
        );
        service
            .invoke(storage_request(
                "backup-delete",
                NativeStorageOperation::Delete { session_id },
            ))
            .expect("the backup test database must be deleted");
    }
}
