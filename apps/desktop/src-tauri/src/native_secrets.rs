use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use zeroize::Zeroize;

pub const NATIVE_SECRET_PROTOCOL_VERSION: u16 = 1;

const MAX_REQUEST_ID_BYTES: usize = 64;
const MAX_PROVIDER_ID_BYTES: usize = 64;
const MAX_SECRET_BYTES: usize = 2_048;
const SECURE_STORAGE_BACKEND_UNAVAILABLE: &str = "unavailable";
#[cfg(target_os = "linux")]
const SECURE_STORAGE_BACKEND_LINUX: &str = "freedesktop_secret_service";
#[cfg(target_os = "macos")]
const SECURE_STORAGE_BACKEND_MACOS: &str = "macos_keychain";
#[cfg(target_os = "windows")]
const SECURE_STORAGE_BACKEND_WINDOWS: &str = "windows_credential_manager";
#[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
const PROVIDER_SECRET_SERVICE: &str = "app.coredrill.desktop.provider-secrets.v1";

#[derive(Deserialize)]
#[serde(transparent)]
pub struct SecretValue(String);

impl SecretValue {
    fn as_bytes(&self) -> &[u8] {
        self.0.as_bytes()
    }
}

impl Drop for SecretValue {
    fn drop(&mut self) {
        self.0.zeroize();
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeSecretRequest {
    pub protocol_version: u16,
    pub request_id: String,
    pub operation: NativeSecretOperation,
}

#[derive(Deserialize)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum NativeSecretOperation {
    Store {
        provider_id: String,
        secret: SecretValue,
    },
    Status {
        provider_id: String,
    },
    Delete {
        provider_id: String,
    },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeSecretResponse {
    pub protocol_version: u16,
    pub request_id: String,
    pub data: NativeSecretResponseData,
}

#[derive(Debug, Serialize)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum NativeSecretResponseData {
    Stored {
        present: bool,
        backend: &'static str,
    },
    Status {
        present: bool,
        backend: &'static str,
    },
    Deleted {
        deleted: bool,
        backend: &'static str,
    },
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeSecretError {
    pub code: String,
    pub message: String,
    pub retryable: bool,
}

impl NativeSecretError {
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
            "The native secure-storage request is invalid.",
            false,
        )
    }

    fn secure_storage_unavailable() -> Self {
        Self::new(
            "secure_storage_unavailable",
            "Operating-system secure storage is unavailable.",
            true,
        )
    }
}

trait SecretBackend: Send + Sync {
    fn name(&self) -> &'static str;
    fn store(&self, provider_id: &str, secret: &[u8]) -> Result<(), ()>;
    fn status(&self, provider_id: &str) -> Result<bool, ()>;
    fn delete(&self, provider_id: &str) -> Result<bool, ()>;
}

struct UnavailableSecretBackend;

impl SecretBackend for UnavailableSecretBackend {
    fn name(&self) -> &'static str {
        SECURE_STORAGE_BACKEND_UNAVAILABLE
    }

    fn store(&self, _provider_id: &str, _secret: &[u8]) -> Result<(), ()> {
        Err(())
    }

    fn status(&self, _provider_id: &str) -> Result<bool, ()> {
        Err(())
    }

    fn delete(&self, _provider_id: &str) -> Result<bool, ()> {
        Err(())
    }
}

#[cfg(target_os = "macos")]
#[derive(Clone)]
struct MacOsKeychainBackend {
    store: std::sync::Arc<apple_native_keyring_store::keychain::Store>,
}

#[cfg(target_os = "macos")]
impl MacOsKeychainBackend {
    fn new() -> Result<Self, ()> {
        apple_native_keyring_store::keychain::Store::new()
            .map(|store| Self { store })
            .map_err(|_| ())
    }

    fn entry(&self, provider_id: &str) -> Result<keyring_core::Entry, ()> {
        use keyring_core::api::CredentialStoreApi;

        self.store
            .build(PROVIDER_SECRET_SERVICE, provider_id, None)
            .map_err(|_| ())
    }

    #[cfg(test)]
    fn read_for_proof(&self, provider_id: &str) -> Result<Vec<u8>, ()> {
        self.entry(provider_id)?.get_secret().map_err(|_| ())
    }
}

#[cfg(target_os = "macos")]
impl SecretBackend for MacOsKeychainBackend {
    fn name(&self) -> &'static str {
        SECURE_STORAGE_BACKEND_MACOS
    }

    fn store(&self, provider_id: &str, secret: &[u8]) -> Result<(), ()> {
        self.entry(provider_id)?.set_secret(secret).map_err(|_| ())
    }

    fn status(&self, provider_id: &str) -> Result<bool, ()> {
        match self.entry(provider_id)?.get_secret() {
            Ok(mut secret) => {
                secret.zeroize();
                Ok(true)
            }
            Err(keyring_core::Error::NoEntry) => Ok(false),
            Err(_) => Err(()),
        }
    }

    fn delete(&self, provider_id: &str) -> Result<bool, ()> {
        match self.entry(provider_id)?.delete_credential() {
            Ok(()) => Ok(true),
            Err(keyring_core::Error::NoEntry) => Ok(false),
            Err(_) => Err(()),
        }
    }
}

#[cfg(target_os = "linux")]
#[derive(Clone)]
struct LinuxSecretServiceBackend {
    store: std::sync::Arc<zbus_secret_service_keyring_store::Store>,
}

#[cfg(target_os = "linux")]
impl LinuxSecretServiceBackend {
    fn new() -> Result<Self, ()> {
        zbus_secret_service_keyring_store::Store::new()
            .map(|store| Self { store })
            .map_err(|_| ())
    }

    fn entry(&self, provider_id: &str) -> Result<keyring_core::Entry, ()> {
        use keyring_core::api::CredentialStoreApi;

        self.store
            .build(PROVIDER_SECRET_SERVICE, provider_id, None)
            .map_err(|_| ())
    }

    #[cfg(test)]
    fn read_for_proof(&self, provider_id: &str) -> Result<Vec<u8>, ()> {
        self.entry(provider_id)?.get_secret().map_err(|_| ())
    }
}

#[cfg(target_os = "linux")]
impl SecretBackend for LinuxSecretServiceBackend {
    fn name(&self) -> &'static str {
        SECURE_STORAGE_BACKEND_LINUX
    }

    fn store(&self, provider_id: &str, secret: &[u8]) -> Result<(), ()> {
        self.entry(provider_id)?.set_secret(secret).map_err(|_| ())
    }

    fn status(&self, provider_id: &str) -> Result<bool, ()> {
        match self.entry(provider_id)?.get_secret() {
            Ok(mut secret) => {
                secret.zeroize();
                Ok(true)
            }
            Err(keyring_core::Error::NoEntry) => Ok(false),
            Err(_) => Err(()),
        }
    }

    fn delete(&self, provider_id: &str) -> Result<bool, ()> {
        match self.entry(provider_id)?.delete_credential() {
            Ok(()) => Ok(true),
            Err(keyring_core::Error::NoEntry) => Ok(false),
            Err(_) => Err(()),
        }
    }
}

#[cfg(target_os = "windows")]
#[derive(Clone)]
struct WindowsCredentialBackend {
    store: std::sync::Arc<windows_native_keyring_store::Store>,
}

#[cfg(target_os = "windows")]
impl WindowsCredentialBackend {
    fn new() -> Result<Self, ()> {
        windows_native_keyring_store::Store::new()
            .map(|store| Self { store })
            .map_err(|_| ())
    }

    fn entry(&self, provider_id: &str) -> Result<keyring_core::Entry, ()> {
        use keyring_core::api::CredentialStoreApi;

        self.store
            .build(PROVIDER_SECRET_SERVICE, provider_id, None)
            .map_err(|_| ())
    }

    #[cfg(test)]
    fn read_for_proof(&self, provider_id: &str) -> Result<Vec<u8>, ()> {
        self.entry(provider_id)?.get_secret().map_err(|_| ())
    }
}

#[cfg(target_os = "windows")]
impl SecretBackend for WindowsCredentialBackend {
    fn name(&self) -> &'static str {
        SECURE_STORAGE_BACKEND_WINDOWS
    }

    fn store(&self, provider_id: &str, secret: &[u8]) -> Result<(), ()> {
        self.entry(provider_id)?.set_secret(secret).map_err(|_| ())
    }

    fn status(&self, provider_id: &str) -> Result<bool, ()> {
        match self.entry(provider_id)?.get_secret() {
            Ok(mut secret) => {
                secret.zeroize();
                Ok(true)
            }
            Err(keyring_core::Error::NoEntry) => Ok(false),
            Err(_) => Err(()),
        }
    }

    fn delete(&self, provider_id: &str) -> Result<bool, ()> {
        match self.entry(provider_id)?.delete_credential() {
            Ok(()) => Ok(true),
            Err(keyring_core::Error::NoEntry) => Ok(false),
            Err(_) => Err(()),
        }
    }
}

fn current_platform_backend() -> Box<dyn SecretBackend> {
    #[cfg(target_os = "linux")]
    {
        LinuxSecretServiceBackend::new()
            .map(|backend| Box::new(backend) as Box<dyn SecretBackend>)
            .unwrap_or_else(|_| Box::new(UnavailableSecretBackend))
    }

    #[cfg(target_os = "macos")]
    {
        MacOsKeychainBackend::new()
            .map(|backend| Box::new(backend) as Box<dyn SecretBackend>)
            .unwrap_or_else(|_| Box::new(UnavailableSecretBackend))
    }

    #[cfg(target_os = "windows")]
    {
        WindowsCredentialBackend::new()
            .map(|backend| Box::new(backend) as Box<dyn SecretBackend>)
            .unwrap_or_else(|_| Box::new(UnavailableSecretBackend))
    }

    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        Box::new(UnavailableSecretBackend)
    }
}

pub struct NativeSecretService {
    backend: Box<dyn SecretBackend>,
    operation_lock: Mutex<()>,
}

impl NativeSecretService {
    pub fn new() -> Self {
        Self {
            backend: current_platform_backend(),
            operation_lock: Mutex::new(()),
        }
    }

    #[cfg(test)]
    fn with_backend(backend: Box<dyn SecretBackend>) -> Self {
        Self {
            backend,
            operation_lock: Mutex::new(()),
        }
    }

    pub fn invoke(
        &self,
        request: NativeSecretRequest,
    ) -> Result<NativeSecretResponse, NativeSecretError> {
        validate_request_envelope(&request)?;
        let request_id = request.request_id;
        let _guard = self
            .operation_lock
            .lock()
            .map_err(|_| NativeSecretError::secure_storage_unavailable())?;
        let backend = self.backend.name();
        let data = match request.operation {
            NativeSecretOperation::Store {
                provider_id,
                secret,
            } => {
                validate_provider_id(&provider_id)?;
                validate_secret(&secret)?;
                self.backend
                    .store(&provider_id, secret.as_bytes())
                    .map_err(|_| NativeSecretError::secure_storage_unavailable())?;
                NativeSecretResponseData::Stored {
                    present: true,
                    backend,
                }
            }
            NativeSecretOperation::Status { provider_id } => {
                validate_provider_id(&provider_id)?;
                let present = self
                    .backend
                    .status(&provider_id)
                    .map_err(|_| NativeSecretError::secure_storage_unavailable())?;
                NativeSecretResponseData::Status { present, backend }
            }
            NativeSecretOperation::Delete { provider_id } => {
                validate_provider_id(&provider_id)?;
                let deleted = self
                    .backend
                    .delete(&provider_id)
                    .map_err(|_| NativeSecretError::secure_storage_unavailable())?;
                NativeSecretResponseData::Deleted { deleted, backend }
            }
        };
        Ok(NativeSecretResponse {
            protocol_version: NATIVE_SECRET_PROTOCOL_VERSION,
            request_id,
            data,
        })
    }
}

impl Default for NativeSecretService {
    fn default() -> Self {
        Self::new()
    }
}

fn validate_request_envelope(request: &NativeSecretRequest) -> Result<(), NativeSecretError> {
    if request.protocol_version != NATIVE_SECRET_PROTOCOL_VERSION
        || request.request_id.is_empty()
        || request.request_id.len() > MAX_REQUEST_ID_BYTES
        || !request
            .request_id
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
    {
        return Err(NativeSecretError::invalid_request());
    }
    Ok(())
}

fn validate_provider_id(provider_id: &str) -> Result<(), NativeSecretError> {
    if provider_id.is_empty()
        || provider_id.len() > MAX_PROVIDER_ID_BYTES
        || !provider_id.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-' || byte == b'_'
        })
    {
        return Err(NativeSecretError::invalid_request());
    }
    Ok(())
}

fn validate_secret(secret: &SecretValue) -> Result<(), NativeSecretError> {
    if secret.as_bytes().is_empty()
        || secret.as_bytes().len() > MAX_SECRET_BYTES
        || secret.as_bytes().contains(&0)
    {
        return Err(NativeSecretError::invalid_request());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::{collections::HashMap, sync::Mutex};

    #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
    use std::time::{SystemTime, UNIX_EPOCH};

    use zeroize::Zeroize;
    #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
    use zeroize::Zeroizing;

    use super::{
        NATIVE_SECRET_PROTOCOL_VERSION, NativeSecretOperation, NativeSecretRequest,
        NativeSecretResponseData, NativeSecretService, SecretBackend, SecretValue,
    };

    #[derive(Default)]
    struct MemorySecretBackend {
        values: Mutex<HashMap<String, Vec<u8>>>,
        fail: bool,
    }

    impl MemorySecretBackend {
        fn failing() -> Self {
            Self {
                values: Mutex::new(HashMap::new()),
                fail: true,
            }
        }
    }

    impl SecretBackend for MemorySecretBackend {
        fn name(&self) -> &'static str {
            "test_memory_only"
        }

        fn store(&self, provider_id: &str, secret: &[u8]) -> Result<(), ()> {
            if self.fail {
                return Err(());
            }
            let mut values = self.values.lock().map_err(|_| ())?;
            if let Some(mut previous) = values.insert(provider_id.to_owned(), secret.to_vec()) {
                previous.zeroize();
            }
            Ok(())
        }

        fn status(&self, provider_id: &str) -> Result<bool, ()> {
            if self.fail {
                return Err(());
            }
            Ok(self
                .values
                .lock()
                .map_err(|_| ())?
                .contains_key(provider_id))
        }

        fn delete(&self, provider_id: &str) -> Result<bool, ()> {
            if self.fail {
                return Err(());
            }
            let mut values = self.values.lock().map_err(|_| ())?;
            if let Some(mut secret) = values.remove(provider_id) {
                secret.zeroize();
                return Ok(true);
            }
            Ok(false)
        }
    }

    fn request(request_id: &str, operation: NativeSecretOperation) -> NativeSecretRequest {
        NativeSecretRequest {
            protocol_version: NATIVE_SECRET_PROTOCOL_VERSION,
            request_id: request_id.to_owned(),
            operation,
        }
    }

    #[test]
    fn store_status_delete_lifecycle_never_returns_secret_material() {
        let service = NativeSecretService::with_backend(Box::new(MemorySecretBackend::default()));
        let synthetic_secret = "synthetic-nat005-secret-do-not-log";

        let stored = service
            .invoke(request(
                "store-1",
                NativeSecretOperation::Store {
                    provider_id: "test-provider".to_owned(),
                    secret: SecretValue(synthetic_secret.to_owned()),
                },
            ))
            .expect("the synthetic secret must store");
        assert!(matches!(
            stored.data,
            NativeSecretResponseData::Stored {
                present: true,
                backend: "test_memory_only"
            }
        ));
        assert!(
            !serde_json::to_string(&stored)
                .expect("the response must serialize")
                .contains(synthetic_secret)
        );

        let present = service
            .invoke(request(
                "status-1",
                NativeSecretOperation::Status {
                    provider_id: "test-provider".to_owned(),
                },
            ))
            .expect("the stored secret status must resolve");
        assert!(matches!(
            present.data,
            NativeSecretResponseData::Status { present: true, .. }
        ));

        let deleted = service
            .invoke(request(
                "delete-1",
                NativeSecretOperation::Delete {
                    provider_id: "test-provider".to_owned(),
                },
            ))
            .expect("the stored secret must delete");
        assert!(matches!(
            deleted.data,
            NativeSecretResponseData::Deleted { deleted: true, .. }
        ));

        let absent = service
            .invoke(request(
                "status-2",
                NativeSecretOperation::Status {
                    provider_id: "test-provider".to_owned(),
                },
            ))
            .expect("the deleted secret status must resolve");
        assert!(matches!(
            absent.data,
            NativeSecretResponseData::Status { present: false, .. }
        ));
    }

    #[test]
    fn rejects_invalid_envelopes_provider_ids_and_secret_values() {
        let service = NativeSecretService::with_backend(Box::new(MemorySecretBackend::default()));
        let invalid_requests = [
            NativeSecretRequest {
                protocol_version: 2,
                request_id: "wrong-version".to_owned(),
                operation: NativeSecretOperation::Status {
                    provider_id: "provider".to_owned(),
                },
            },
            request(
                "bad-provider",
                NativeSecretOperation::Status {
                    provider_id: "../provider".to_owned(),
                },
            ),
            request(
                "empty-secret",
                NativeSecretOperation::Store {
                    provider_id: "provider".to_owned(),
                    secret: SecretValue(String::new()),
                },
            ),
            request(
                "nul-secret",
                NativeSecretOperation::Store {
                    provider_id: "provider".to_owned(),
                    secret: SecretValue("secret\0suffix".to_owned()),
                },
            ),
        ];

        for invalid in invalid_requests {
            let error = service
                .invoke(invalid)
                .expect_err("invalid secure-storage inputs must fail closed");
            assert_eq!(error.code, "invalid_request");
        }
    }

    #[test]
    fn backend_failures_are_content_free_and_retryable() {
        let service = NativeSecretService::with_backend(Box::new(MemorySecretBackend::failing()));
        let provider_id = "sensitive-provider-identifier";
        let synthetic_secret = "synthetic-secret-material";
        let error = service
            .invoke(request(
                "failure-1",
                NativeSecretOperation::Store {
                    provider_id: provider_id.to_owned(),
                    secret: SecretValue(synthetic_secret.to_owned()),
                },
            ))
            .expect_err("a failed secure store must return a stable error");
        let serialized = serde_json::to_string(&error).expect("the error must serialize");

        assert_eq!(error.code, "secure_storage_unavailable");
        assert!(error.retryable);
        assert!(!serialized.contains(provider_id));
        assert!(!serialized.contains(synthetic_secret));
        assert!(!serialized.contains("test_memory_only"));
    }

    #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
    trait ProofSecretBackend: SecretBackend + Clone {
        fn read_for_proof(&self, provider_id: &str) -> Result<Vec<u8>, ()>;
    }

    #[cfg(target_os = "linux")]
    impl ProofSecretBackend for super::LinuxSecretServiceBackend {
        fn read_for_proof(&self, provider_id: &str) -> Result<Vec<u8>, ()> {
            super::LinuxSecretServiceBackend::read_for_proof(self, provider_id)
        }
    }

    #[cfg(target_os = "macos")]
    impl ProofSecretBackend for super::MacOsKeychainBackend {
        fn read_for_proof(&self, provider_id: &str) -> Result<Vec<u8>, ()> {
            super::MacOsKeychainBackend::read_for_proof(self, provider_id)
        }
    }

    #[cfg(target_os = "windows")]
    impl ProofSecretBackend for super::WindowsCredentialBackend {
        fn read_for_proof(&self, provider_id: &str) -> Result<Vec<u8>, ()> {
            super::WindowsCredentialBackend::read_for_proof(self, provider_id)
        }
    }

    #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
    fn prove_platform_secure_store<B>(backend: B)
    where
        B: ProofSecretBackend + 'static,
    {
        let expected = Zeroizing::new(
            std::env::var("COREDRILL_SECRET_PROOF_VALUE")
                .expect("the redacted proof harness must supply synthetic secret material"),
        );
        assert!(
            !expected.is_empty(),
            "the synthetic proof secret must not be empty"
        );
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("the system clock must follow the Unix epoch")
            .as_nanos();
        let provider_id = format!("nat008-{}-{nonce}", std::process::id());
        let expected_backend = backend.name();
        let service = NativeSecretService::with_backend(Box::new(backend.clone()));

        struct ProofCleanup<B: SecretBackend> {
            backend: B,
            provider_id: String,
        }

        impl<B: SecretBackend> Drop for ProofCleanup<B> {
            fn drop(&mut self) {
                let _ = self.backend.delete(&self.provider_id);
            }
        }

        let _cleanup = ProofCleanup {
            backend: backend.clone(),
            provider_id: provider_id.clone(),
        };

        let _ = service.invoke(request(
            "proof-cleanup-before",
            NativeSecretOperation::Delete {
                provider_id: provider_id.clone(),
            },
        ));

        let stored = service
            .invoke(request(
                "proof-store",
                NativeSecretOperation::Store {
                    provider_id: provider_id.clone(),
                    secret: SecretValue(expected.as_str().to_owned()),
                },
            ))
            .expect("the synthetic proof secret must store in the platform secure store");
        match stored.data {
            NativeSecretResponseData::Stored { present, backend } => {
                assert!(present);
                assert_eq!(backend, expected_backend);
            }
            _ => panic!("the secure store must return the stored response"),
        }

        let mut retrieved = backend
            .read_for_proof(&provider_id)
            .expect("the synthetic proof secret must be retrievable inside Rust");
        let matches_expected = retrieved.as_slice() == expected.as_bytes();
        retrieved.zeroize();
        assert!(matches_expected, "the retrieved proof secret must match");

        let deleted = service
            .invoke(request(
                "proof-delete",
                NativeSecretOperation::Delete {
                    provider_id: provider_id.clone(),
                },
            ))
            .expect("the synthetic proof secret must delete");
        assert!(matches!(
            deleted.data,
            NativeSecretResponseData::Deleted { deleted: true, .. }
        ));

        let absent = service
            .invoke(request(
                "proof-status-after",
                NativeSecretOperation::Status {
                    provider_id: provider_id.clone(),
                },
            ))
            .expect("the deleted proof secret status must resolve");
        assert!(matches!(
            absent.data,
            NativeSecretResponseData::Status { present: false, .. }
        ));

        let second_delete = service
            .invoke(request(
                "proof-delete-again",
                NativeSecretOperation::Delete { provider_id },
            ))
            .expect("deleting an absent proof secret must be idempotent");
        assert!(matches!(
            second_delete.data,
            NativeSecretResponseData::Deleted { deleted: false, .. }
        ));
    }

    #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
    #[test]
    #[ignore = "run only through the redacted native secure-storage proof harness"]
    fn platform_secure_store_lifecycle_is_redacted() {
        #[cfg(target_os = "linux")]
        let backend = super::LinuxSecretServiceBackend::new()
            .expect("FreeDesktop Secret Service must initialize for the native proof");
        #[cfg(target_os = "macos")]
        let backend = super::MacOsKeychainBackend::new()
            .expect("macOS Keychain must initialize for the native proof");
        #[cfg(target_os = "windows")]
        let backend = super::WindowsCredentialBackend::new()
            .expect("Windows Credential Manager must initialize for the native proof");

        prove_platform_secure_store(backend);
    }
}
