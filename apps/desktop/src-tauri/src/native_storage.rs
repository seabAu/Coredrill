use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};

use rusqlite::{
    Connection, Error as RusqliteError, ErrorCode, OpenFlags, params_from_iter,
    types::{Value, ValueRef},
};
use serde::{Deserialize, Serialize};

pub const NATIVE_STORAGE_PROTOCOL_VERSION: u16 = 1;

const MAX_REQUEST_ID_BYTES: usize = 64;
const MAX_DATABASE_NAME_BYTES: usize = 72;
const MAX_SQL_BYTES: usize = 256 * 1024;
const MAX_PARAMETERS: usize = 1_024;
const MAX_INTEGER_BYTES: usize = 24;
const MAX_VALUE_BYTES: usize = 8 * 1024 * 1024;
const MAX_RESULT_ROWS: usize = 100_000;
const MAX_RESULT_BYTES: usize = 32 * 1024 * 1024;
const DATABASE_DIRECTORY_NAME: &str = "databases";
const ATTACHMENT_DIRECTORY_NAME: &str = "attachments";
const ATTACHMENT_HASH_DIRECTORY_NAME: &str = "sha256";
const SHA256_HEX_BYTES: usize = 64;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeStorageRequest {
    pub protocol_version: u16,
    pub request_id: String,
    pub operation: NativeStorageOperation,
}

#[derive(Debug, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum NativeStorageOperation {
    Open {
        database_name: String,
    },
    Query {
        session_id: String,
        statement: NativeSqlStatement,
    },
    Execute {
        session_id: String,
        statement: NativeSqlStatement,
    },
    Begin {
        session_id: String,
    },
    Commit {
        session_id: String,
    },
    Rollback {
        session_id: String,
    },
    Diagnostics {
        session_id: String,
    },
    Close {
        session_id: String,
    },
    Delete {
        session_id: String,
    },
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeSqlStatement {
    pub sql: String,
    pub parameters: Vec<NativeSqlValue>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum NativeSqlValue {
    Null,
    Integer { value: String },
    Real { value: f64 },
    Text { value: String },
    Blob { bytes: Vec<u8> },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeStorageResponse {
    pub protocol_version: u16,
    pub request_id: String,
    pub data: NativeStorageResponseData,
}

#[derive(Debug, Serialize)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum NativeStorageResponseData {
    Opened {
        session_id: String,
    },
    Rows {
        columns: Vec<String>,
        rows: Vec<Vec<NativeSqlValue>>,
    },
    Executed {
        rows_affected: u64,
        last_insert_row_id: String,
    },
    TransactionState {
        active: bool,
    },
    Diagnostics {
        sqlite_version: String,
        schema_version: u32,
        foreign_keys_enabled: bool,
    },
    Closed,
    Deleted {
        deleted: bool,
    },
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeStorageError {
    pub code: String,
    pub message: String,
    pub retryable: bool,
}

impl NativeStorageError {
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
            "The native storage request is invalid.",
            false,
        )
    }

    fn storage_unavailable() -> Self {
        Self::new(
            "storage_unavailable",
            "Native storage is unavailable.",
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
            "The native storage transaction state is invalid.",
            false,
        )
    }
}

struct NativeSession {
    connection: Connection,
    database_path: PathBuf,
    transaction_active: bool,
}

struct NativeStorageState {
    next_session: u64,
    sessions: HashMap<String, NativeSession>,
}

pub struct NativeStorageService {
    layout: NativeStorageLayout,
    state: Mutex<NativeStorageState>,
}

#[derive(Clone, Debug)]
pub struct NativeStorageLayout {
    app_data_root: PathBuf,
    database_root: PathBuf,
    attachment_root: PathBuf,
}

impl NativeStorageLayout {
    pub fn initialize(app_data_root: PathBuf) -> Result<Self, NativeStorageError> {
        if !app_data_root.is_absolute() {
            return Err(NativeStorageError::storage_unavailable());
        }
        fs::create_dir_all(&app_data_root)
            .map_err(|_| NativeStorageError::storage_unavailable())?;
        let app_data_root = canonical_directory(&app_data_root)?;
        let database_root =
            initialize_managed_directory(&app_data_root, Path::new(DATABASE_DIRECTORY_NAME))?;
        let attachment_container =
            initialize_managed_directory(&app_data_root, Path::new(ATTACHMENT_DIRECTORY_NAME))?;
        let attachment_root = initialize_managed_directory(
            &attachment_container,
            Path::new(ATTACHMENT_HASH_DIRECTORY_NAME),
        )?;

        Ok(Self {
            app_data_root,
            database_root,
            attachment_root,
        })
    }

    pub fn app_data_root(&self) -> &Path {
        &self.app_data_root
    }

    pub fn database_root(&self) -> &Path {
        &self.database_root
    }

    pub fn attachment_root(&self) -> &Path {
        &self.attachment_root
    }

    pub fn prepare_attachment_path(&self, sha256: &str) -> Result<PathBuf, NativeStorageError> {
        validate_sha256(sha256)?;
        verify_managed_directory(
            &self.app_data_root,
            Path::new(ATTACHMENT_DIRECTORY_NAME),
            self.attachment_root
                .parent()
                .ok_or_else(NativeStorageError::storage_unavailable)?,
        )?;
        verify_managed_directory(
            self.attachment_root
                .parent()
                .ok_or_else(NativeStorageError::storage_unavailable)?,
            Path::new(ATTACHMENT_HASH_DIRECTORY_NAME),
            &self.attachment_root,
        )?;

        let first_shard =
            initialize_managed_directory(&self.attachment_root, Path::new(&sha256[0..2]))?;
        let second_shard = initialize_managed_directory(&first_shard, Path::new(&sha256[2..4]))?;
        let attachment_path = second_shard.join(sha256);
        reject_link_or_external_path(&second_shard, &attachment_path)?;
        Ok(attachment_path)
    }

    fn database_path(&self, database_name: &str) -> Result<PathBuf, NativeStorageError> {
        verify_managed_directory(
            &self.app_data_root,
            Path::new(DATABASE_DIRECTORY_NAME),
            &self.database_root,
        )?;
        let database_path = self.database_root.join(database_name);
        reject_link_or_external_path(&self.database_root, &database_path)?;
        Ok(database_path)
    }

    fn verify_database_path(&self, database_path: &Path) -> Result<(), NativeStorageError> {
        let database_name = database_path
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(NativeStorageError::storage_unavailable)?;
        validate_database_name(database_name)?;
        if self.database_path(database_name)? != database_path {
            return Err(NativeStorageError::storage_unavailable());
        }
        Ok(())
    }
}

impl NativeStorageService {
    pub fn new(app_data_root: PathBuf) -> Result<Self, NativeStorageError> {
        Ok(Self {
            layout: NativeStorageLayout::initialize(app_data_root)?,
            state: Mutex::new(NativeStorageState {
                next_session: 1,
                sessions: HashMap::new(),
            }),
        })
    }

    pub fn invoke(
        &self,
        request: NativeStorageRequest,
    ) -> Result<NativeStorageResponse, NativeStorageError> {
        validate_request_envelope(&request)?;
        let request_id = request.request_id;
        let data = match request.operation {
            NativeStorageOperation::Open { database_name } => self.open(database_name)?,
            NativeStorageOperation::Query {
                session_id,
                statement,
            } => self.query(&session_id, statement)?,
            NativeStorageOperation::Execute {
                session_id,
                statement,
            } => self.execute(&session_id, statement)?,
            NativeStorageOperation::Begin { session_id } => self.begin(&session_id)?,
            NativeStorageOperation::Commit { session_id } => self.commit(&session_id)?,
            NativeStorageOperation::Rollback { session_id } => self.rollback(&session_id)?,
            NativeStorageOperation::Diagnostics { session_id } => self.diagnostics(&session_id)?,
            NativeStorageOperation::Close { session_id } => self.close(&session_id)?,
            NativeStorageOperation::Delete { session_id } => self.delete(&session_id)?,
        };
        Ok(NativeStorageResponse {
            protocol_version: NATIVE_STORAGE_PROTOCOL_VERSION,
            request_id,
            data,
        })
    }

    fn open(&self, database_name: String) -> Result<NativeStorageResponseData, NativeStorageError> {
        validate_database_name(&database_name)?;
        let database_path = self.layout.database_path(&database_name)?;

        let connection = Connection::open_with_flags(
            &database_path,
            OpenFlags::SQLITE_OPEN_READ_WRITE
                | OpenFlags::SQLITE_OPEN_CREATE
                | OpenFlags::SQLITE_OPEN_NO_MUTEX
                | OpenFlags::SQLITE_OPEN_NOFOLLOW,
        )
        .map_err(map_sqlite_error)?;
        connection
            .busy_timeout(Duration::from_secs(5))
            .map_err(map_sqlite_error)?;
        connection
            .execute_batch(
                "PRAGMA foreign_keys = ON; PRAGMA trusted_schema = OFF; PRAGMA journal_mode = WAL;",
            )
            .map_err(map_sqlite_error)?;

        let mut state = self
            .state
            .lock()
            .map_err(|_| NativeStorageError::storage_unavailable())?;
        let session_id = format!("native-session-{}", state.next_session);
        state.next_session = state
            .next_session
            .checked_add(1)
            .ok_or_else(NativeStorageError::storage_unavailable)?;
        state.sessions.insert(
            session_id.clone(),
            NativeSession {
                connection,
                database_path,
                transaction_active: false,
            },
        );
        Ok(NativeStorageResponseData::Opened { session_id })
    }

    fn query(
        &self,
        session_id: &str,
        statement: NativeSqlStatement,
    ) -> Result<NativeStorageResponseData, NativeStorageError> {
        validate_statement(&statement)?;
        let parameters = decode_parameters(statement.parameters)?;
        self.with_session(session_id, |session| {
            let mut prepared = session
                .connection
                .prepare(&statement.sql)
                .map_err(map_sqlite_error)?;
            if !prepared.readonly() {
                return Err(NativeStorageError::new(
                    "invalid_statement",
                    "A query operation must be read-only.",
                    false,
                ));
            }
            let columns = prepared
                .column_names()
                .into_iter()
                .map(str::to_owned)
                .collect::<Vec<_>>();
            let column_count = columns.len();
            let mut cursor = prepared
                .query(params_from_iter(parameters.iter()))
                .map_err(map_sqlite_error)?;
            let mut rows = Vec::new();
            let mut result_bytes = 0_usize;
            while let Some(row) = cursor.next().map_err(map_sqlite_error)? {
                if rows.len() >= MAX_RESULT_ROWS {
                    return Err(NativeStorageError::new(
                        "result_too_large",
                        "The native storage result exceeds its row limit.",
                        false,
                    ));
                }
                let mut values = Vec::with_capacity(column_count);
                for index in 0..column_count {
                    let value = encode_result_value(row.get_ref(index).map_err(map_sqlite_error)?)?;
                    result_bytes = result_bytes
                        .checked_add(native_value_size(&value))
                        .filter(|size| *size <= MAX_RESULT_BYTES)
                        .ok_or_else(|| {
                            NativeStorageError::new(
                                "result_too_large",
                                "The native storage result exceeds its byte limit.",
                                false,
                            )
                        })?;
                    values.push(value);
                }
                rows.push(values);
            }
            Ok(NativeStorageResponseData::Rows { columns, rows })
        })
    }

    fn execute(
        &self,
        session_id: &str,
        statement: NativeSqlStatement,
    ) -> Result<NativeStorageResponseData, NativeStorageError> {
        validate_statement(&statement)?;
        let parameters = decode_parameters(statement.parameters)?;
        self.with_session(session_id, |session| {
            let rows_affected = {
                let mut prepared = session
                    .connection
                    .prepare(&statement.sql)
                    .map_err(map_sqlite_error)?;
                if prepared.readonly() {
                    return Err(NativeStorageError::new(
                        "invalid_statement",
                        "An execute operation cannot return rows.",
                        false,
                    ));
                }
                prepared
                    .execute(params_from_iter(parameters.iter()))
                    .map_err(map_sqlite_error)? as u64
            };
            Ok(NativeStorageResponseData::Executed {
                rows_affected,
                last_insert_row_id: session.connection.last_insert_rowid().to_string(),
            })
        })
    }

    fn begin(&self, session_id: &str) -> Result<NativeStorageResponseData, NativeStorageError> {
        self.with_session(session_id, |session| {
            if session.transaction_active {
                return Err(NativeStorageError::transaction_state());
            }
            session
                .connection
                .execute_batch("BEGIN IMMEDIATE")
                .map_err(map_sqlite_error)?;
            session.transaction_active = true;
            Ok(NativeStorageResponseData::TransactionState { active: true })
        })
    }

    fn commit(&self, session_id: &str) -> Result<NativeStorageResponseData, NativeStorageError> {
        self.with_session(session_id, |session| {
            if !session.transaction_active {
                return Err(NativeStorageError::transaction_state());
            }
            session
                .connection
                .execute_batch("COMMIT")
                .map_err(map_sqlite_error)?;
            session.transaction_active = false;
            Ok(NativeStorageResponseData::TransactionState { active: false })
        })
    }

    fn rollback(&self, session_id: &str) -> Result<NativeStorageResponseData, NativeStorageError> {
        self.with_session(session_id, |session| {
            if !session.transaction_active {
                return Err(NativeStorageError::transaction_state());
            }
            session
                .connection
                .execute_batch("ROLLBACK")
                .map_err(map_sqlite_error)?;
            session.transaction_active = false;
            Ok(NativeStorageResponseData::TransactionState { active: false })
        })
    }

    fn diagnostics(
        &self,
        session_id: &str,
    ) -> Result<NativeStorageResponseData, NativeStorageError> {
        self.with_session(session_id, |session| {
            let sqlite_version = session
                .connection
                .query_row("SELECT sqlite_version()", [], |row| row.get::<_, String>(0))
                .map_err(map_sqlite_error)?;
            let schema_version = session
                .connection
                .query_row("PRAGMA user_version", [], |row| row.get::<_, u32>(0))
                .map_err(map_sqlite_error)?;
            let foreign_keys_enabled = session
                .connection
                .query_row("PRAGMA foreign_keys", [], |row| row.get::<_, u8>(0))
                .map_err(map_sqlite_error)?
                == 1;
            Ok(NativeStorageResponseData::Diagnostics {
                sqlite_version,
                schema_version,
                foreign_keys_enabled,
            })
        })
    }

    fn close(&self, session_id: &str) -> Result<NativeStorageResponseData, NativeStorageError> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| NativeStorageError::storage_unavailable())?;
        let mut session = state
            .sessions
            .remove(session_id)
            .ok_or_else(NativeStorageError::session_missing)?;
        if session.transaction_active {
            session
                .connection
                .execute_batch("ROLLBACK")
                .map_err(map_sqlite_error)?;
            session.transaction_active = false;
        }
        drop(session);
        Ok(NativeStorageResponseData::Closed)
    }

    fn delete(&self, session_id: &str) -> Result<NativeStorageResponseData, NativeStorageError> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| NativeStorageError::storage_unavailable())?;
        let mut session = state
            .sessions
            .remove(session_id)
            .ok_or_else(NativeStorageError::session_missing)?;
        if session.transaction_active {
            session
                .connection
                .execute_batch("ROLLBACK")
                .map_err(map_sqlite_error)?;
            session.transaction_active = false;
        }
        let database_path = session.database_path.clone();
        self.layout.verify_database_path(&database_path)?;
        drop(session);
        let deleted = remove_database_files(&database_path)?;
        Ok(NativeStorageResponseData::Deleted { deleted })
    }

    fn with_session<Output>(
        &self,
        session_id: &str,
        work: impl FnOnce(&mut NativeSession) -> Result<Output, NativeStorageError>,
    ) -> Result<Output, NativeStorageError> {
        validate_session_id(session_id)?;
        let mut state = self
            .state
            .lock()
            .map_err(|_| NativeStorageError::storage_unavailable())?;
        let session = state
            .sessions
            .get_mut(session_id)
            .ok_or_else(NativeStorageError::session_missing)?;
        work(session)
    }
}

fn validate_request_envelope(request: &NativeStorageRequest) -> Result<(), NativeStorageError> {
    if request.protocol_version != NATIVE_STORAGE_PROTOCOL_VERSION
        || request.request_id.is_empty()
        || request.request_id.len() > MAX_REQUEST_ID_BYTES
        || !request
            .request_id
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
    {
        return Err(NativeStorageError::invalid_request());
    }
    Ok(())
}

fn validate_database_name(database_name: &str) -> Result<(), NativeStorageError> {
    if database_name.is_empty()
        || database_name.len() > MAX_DATABASE_NAME_BYTES
        || !database_name.ends_with(".sqlite3")
        || !database_name.bytes().all(|byte| {
            byte.is_ascii_lowercase()
                || byte.is_ascii_digit()
                || byte == b'-'
                || byte == b'_'
                || byte == b'.'
        })
    {
        return Err(NativeStorageError::invalid_request());
    }
    Ok(())
}

fn validate_sha256(sha256: &str) -> Result<(), NativeStorageError> {
    if sha256.len() != SHA256_HEX_BYTES
        || !sha256
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(NativeStorageError::invalid_request());
    }
    Ok(())
}

fn validate_session_id(session_id: &str) -> Result<(), NativeStorageError> {
    let suffix = session_id.strip_prefix("native-session-");
    if suffix.is_none_or(str::is_empty)
        || !suffix
            .unwrap_or_default()
            .bytes()
            .all(|byte| byte.is_ascii_digit())
    {
        return Err(NativeStorageError::invalid_request());
    }
    Ok(())
}

fn validate_statement(statement: &NativeSqlStatement) -> Result<(), NativeStorageError> {
    if statement.sql.trim().is_empty()
        || statement.sql.len() > MAX_SQL_BYTES
        || statement.sql.contains('\0')
        || statement.parameters.len() > MAX_PARAMETERS
    {
        return Err(NativeStorageError::new(
            "invalid_statement",
            "The SQL statement is invalid.",
            false,
        ));
    }
    for value in &statement.parameters {
        match value {
            NativeSqlValue::Integer { value } if value.len() > MAX_INTEGER_BYTES => {
                return Err(NativeStorageError::new(
                    "invalid_value",
                    "A native storage integer is out of range.",
                    false,
                ));
            }
            NativeSqlValue::Text { value } if value.len() > MAX_VALUE_BYTES => {
                return Err(NativeStorageError::new(
                    "value_too_large",
                    "A native storage value exceeds its size limit.",
                    false,
                ));
            }
            NativeSqlValue::Blob { bytes } if bytes.len() > MAX_VALUE_BYTES => {
                return Err(NativeStorageError::new(
                    "value_too_large",
                    "A native storage value exceeds its size limit.",
                    false,
                ));
            }
            NativeSqlValue::Real { value } if !value.is_finite() => {
                return Err(NativeStorageError::new(
                    "invalid_value",
                    "A native storage number is invalid.",
                    false,
                ));
            }
            _ => {}
        }
    }
    Ok(())
}

fn decode_parameters(parameters: Vec<NativeSqlValue>) -> Result<Vec<Value>, NativeStorageError> {
    parameters
        .into_iter()
        .map(|value| match value {
            NativeSqlValue::Null => Ok(Value::Null),
            NativeSqlValue::Integer { value } => {
                value.parse::<i64>().map(Value::Integer).map_err(|_| {
                    NativeStorageError::new(
                        "invalid_value",
                        "A native storage integer is out of range.",
                        false,
                    )
                })
            }
            NativeSqlValue::Real { value } if value.is_finite() => Ok(Value::Real(value)),
            NativeSqlValue::Real { .. } => Err(NativeStorageError::new(
                "invalid_value",
                "A native storage number is invalid.",
                false,
            )),
            NativeSqlValue::Text { value } => Ok(Value::Text(value)),
            NativeSqlValue::Blob { bytes } => Ok(Value::Blob(bytes)),
        })
        .collect()
}

fn encode_result_value(value: ValueRef<'_>) -> Result<NativeSqlValue, NativeStorageError> {
    match value {
        ValueRef::Null => Ok(NativeSqlValue::Null),
        ValueRef::Integer(value) => Ok(NativeSqlValue::Integer {
            value: value.to_string(),
        }),
        ValueRef::Real(value) if value.is_finite() => Ok(NativeSqlValue::Real { value }),
        ValueRef::Real(_) => Err(NativeStorageError::new(
            "invalid_value",
            "SQLite returned a non-finite number.",
            false,
        )),
        ValueRef::Text(value) if value.len() <= MAX_VALUE_BYTES => std::str::from_utf8(value)
            .map(|value| NativeSqlValue::Text {
                value: value.to_owned(),
            })
            .map_err(|_| {
                NativeStorageError::new("invalid_value", "SQLite returned invalid text.", false)
            }),
        ValueRef::Text(_) => Err(NativeStorageError::new(
            "result_too_large",
            "SQLite returned a value that exceeds the result limit.",
            false,
        )),
        ValueRef::Blob(bytes) if bytes.len() <= MAX_VALUE_BYTES => Ok(NativeSqlValue::Blob {
            bytes: bytes.to_vec(),
        }),
        ValueRef::Blob(_) => Err(NativeStorageError::new(
            "result_too_large",
            "SQLite returned a value that exceeds the result limit.",
            false,
        )),
    }
}

fn native_value_size(value: &NativeSqlValue) -> usize {
    match value {
        NativeSqlValue::Null => 0,
        NativeSqlValue::Integer { value } | NativeSqlValue::Text { value } => value.len(),
        NativeSqlValue::Real { .. } => std::mem::size_of::<f64>(),
        NativeSqlValue::Blob { bytes } => bytes.len(),
    }
}

fn canonical_directory(path: &Path) -> Result<PathBuf, NativeStorageError> {
    let canonical =
        fs::canonicalize(path).map_err(|_| NativeStorageError::storage_unavailable())?;
    if !fs::metadata(&canonical)
        .map_err(|_| NativeStorageError::storage_unavailable())?
        .is_dir()
    {
        return Err(NativeStorageError::storage_unavailable());
    }
    Ok(canonical)
}

fn initialize_managed_directory(
    canonical_parent: &Path,
    relative_path: &Path,
) -> Result<PathBuf, NativeStorageError> {
    if relative_path.components().count() != 1 {
        return Err(NativeStorageError::storage_unavailable());
    }
    let path = canonical_parent.join(relative_path);
    fs::create_dir_all(&path).map_err(|_| NativeStorageError::storage_unavailable())?;
    let canonical = canonical_directory(&path)?;
    if !canonical.starts_with(canonical_parent) {
        return Err(NativeStorageError::storage_unavailable());
    }
    Ok(canonical)
}

fn verify_managed_directory(
    canonical_parent: &Path,
    relative_path: &Path,
    expected_canonical: &Path,
) -> Result<(), NativeStorageError> {
    if relative_path.components().count() != 1 {
        return Err(NativeStorageError::storage_unavailable());
    }
    let canonical = canonical_directory(&canonical_parent.join(relative_path))?;
    if canonical != expected_canonical || !canonical.starts_with(canonical_parent) {
        return Err(NativeStorageError::storage_unavailable());
    }
    Ok(())
}

fn reject_link_or_external_path(
    canonical_parent: &Path,
    candidate: &Path,
) -> Result<(), NativeStorageError> {
    let metadata = match fs::symlink_metadata(candidate) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(_) => return Err(NativeStorageError::storage_unavailable()),
    };
    if metadata.file_type().is_symlink() {
        return Err(NativeStorageError::storage_unavailable());
    }
    let canonical =
        fs::canonicalize(candidate).map_err(|_| NativeStorageError::storage_unavailable())?;
    if !canonical.starts_with(canonical_parent) || canonical != candidate {
        return Err(NativeStorageError::storage_unavailable());
    }
    Ok(())
}

fn remove_database_files(database_path: &Path) -> Result<bool, NativeStorageError> {
    let mut deleted = false;
    for path in [
        database_path.to_path_buf(),
        PathBuf::from(format!("{}-wal", database_path.display())),
        PathBuf::from(format!("{}-shm", database_path.display())),
    ] {
        match fs::remove_file(path) {
            Ok(()) => deleted = true,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err(NativeStorageError::storage_unavailable()),
        }
    }
    Ok(deleted)
}

fn map_sqlite_error(error: RusqliteError) -> NativeStorageError {
    match error {
        RusqliteError::SqliteFailure(details, _)
            if matches!(
                details.code,
                ErrorCode::DatabaseBusy | ErrorCode::DatabaseLocked
            ) =>
        {
            NativeStorageError::new(
                "sqlite_busy",
                "Native SQLite is busy; retry the operation.",
                true,
            )
        }
        RusqliteError::SqliteFailure(details, _)
            if matches!(details.code, ErrorCode::ConstraintViolation) =>
        {
            NativeStorageError::new(
                "constraint_violation",
                "Native SQLite rejected data that violates a constraint.",
                false,
            )
        }
        _ => NativeStorageError::new(
            "sqlite_failure",
            "Native SQLite could not complete the operation.",
            false,
        ),
    }
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::{Path, PathBuf},
        process,
        time::{SystemTime, UNIX_EPOCH},
    };

    use super::{NativeStorageLayout, NativeStorageService};

    const SYNTHETIC_ATTACHMENT_SHA256: &str =
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    struct TestRoot(PathBuf);

    impl TestRoot {
        fn new(label: &str) -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("the system clock must follow the Unix epoch")
                .as_nanos();
            Self(std::env::temp_dir().join(format!(
                "coredrill-native-path-{label}-{}-{nonce}",
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

    #[test]
    fn initializes_canonical_app_data_layout_and_content_addressed_attachment_path() {
        let test_root = TestRoot::new("layout");
        let requested_root = test_root.path().join("missing").join("app-data");
        let layout = NativeStorageLayout::initialize(requested_root.clone())
            .expect("a missing absolute app-data root must be initialized");

        assert_eq!(
            layout.app_data_root(),
            fs::canonicalize(requested_root)
                .expect("the initialized app-data root must canonicalize")
        );
        assert_eq!(
            layout.database_root(),
            fs::canonicalize(layout.app_data_root().join("databases"))
                .expect("the database directory must canonicalize")
        );
        assert_eq!(
            layout.attachment_root(),
            fs::canonicalize(layout.app_data_root().join("attachments").join("sha256"))
                .expect("the attachment directory must canonicalize")
        );

        let attachment_path = layout
            .prepare_attachment_path(SYNTHETIC_ATTACHMENT_SHA256)
            .expect("a lowercase SHA-256 digest must map to a confined path");
        assert_eq!(
            attachment_path,
            layout
                .attachment_root()
                .join("01")
                .join("23")
                .join(SYNTHETIC_ATTACHMENT_SHA256)
        );
        fs::write(&attachment_path, b"synthetic attachment")
            .expect("the prepared attachment path must be writable");
        assert!(
            fs::canonicalize(&attachment_path)
                .expect("the synthetic attachment must canonicalize")
                .starts_with(layout.attachment_root())
        );
    }

    #[test]
    fn rejects_relative_unusable_and_path_shaped_attachment_inputs() {
        let relative = NativeStorageService::new(PathBuf::from("relative-app-data"))
            .err()
            .expect("a relative app-data root must fail closed");
        assert_eq!(relative.code, "storage_unavailable");

        let test_root = TestRoot::new("unusable");
        fs::create_dir_all(test_root.path()).expect("the test parent must be created");
        let file_root = test_root.path().join("not-a-directory");
        fs::write(&file_root, b"not a directory").expect("the test file must be created");
        let unusable = NativeStorageService::new(file_root)
            .err()
            .expect("an app-data path occupied by a file must fail closed");
        assert_eq!(unusable.code, "storage_unavailable");

        let layout = NativeStorageLayout::initialize(test_root.path().join("valid"))
            .expect("the valid test root must initialize");
        for digest in [
            "../outside",
            "ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789",
            "0123456789abcdef",
        ] {
            let error = layout
                .prepare_attachment_path(digest)
                .expect_err("noncanonical attachment identifiers must fail closed");
            assert_eq!(error.code, "invalid_request");
        }
    }
}
