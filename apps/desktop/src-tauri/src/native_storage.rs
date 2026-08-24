use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};

use rusqlite::{
    Connection, Error as RusqliteError, ErrorCode, params_from_iter,
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
    root: PathBuf,
    state: Mutex<NativeStorageState>,
}

impl NativeStorageService {
    pub fn new(root: PathBuf) -> Result<Self, NativeStorageError> {
        if !root.is_absolute() {
            return Err(NativeStorageError::storage_unavailable());
        }
        fs::create_dir_all(&root).map_err(|_| NativeStorageError::storage_unavailable())?;
        let canonical_root =
            fs::canonicalize(root).map_err(|_| NativeStorageError::storage_unavailable())?;
        Ok(Self {
            root: canonical_root,
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
        let database_path = self.root.join(&database_name);
        reject_external_symlink(&self.root, &database_path)?;

        let connection = Connection::open(&database_path).map_err(map_sqlite_error)?;
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

fn reject_external_symlink(root: &Path, database_path: &Path) -> Result<(), NativeStorageError> {
    if !database_path.exists() {
        return Ok(());
    }
    let canonical =
        fs::canonicalize(database_path).map_err(|_| NativeStorageError::storage_unavailable())?;
    if !canonical.starts_with(root) {
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
