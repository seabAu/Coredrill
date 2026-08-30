#[cfg(any(feature = "desktop-shell", test))]
pub mod native_archive;
pub mod native_secrets;
pub mod native_storage;
pub mod native_vault;

#[cfg(feature = "desktop-shell")]
use std::sync::Arc;

#[cfg(feature = "desktop-shell")]
use native_archive::{
    NativeArchiveError, NativeArchiveOperation, NativeArchiveRequest, NativeArchiveResponse,
};
#[cfg(feature = "desktop-shell")]
use native_secrets::{
    NativeSecretError, NativeSecretRequest, NativeSecretResponse, NativeSecretService,
};
#[cfg(feature = "desktop-shell")]
use native_storage::{
    NativeStorageError, NativeStorageRequest, NativeStorageResponse, NativeStorageService,
};
#[cfg(feature = "desktop-shell")]
use native_vault::{NativeVaultError, NativeVaultRequest, NativeVaultResponse, NativeVaultService};
#[cfg(feature = "desktop-shell")]
use tauri::webview::PageLoadEvent;
#[cfg(feature = "desktop-shell")]
use tauri::{Manager, Runtime};
#[cfg(feature = "desktop-shell")]
use tauri_plugin_dialog::DialogExt;

#[cfg(feature = "desktop-shell")]
struct NativeStorageState(Arc<NativeStorageService>);

#[cfg(feature = "desktop-shell")]
struct NativeSecretState(Arc<NativeSecretService>);

#[cfg(feature = "desktop-shell")]
struct NativeVaultState(Arc<NativeVaultService>);

#[cfg(feature = "desktop-shell")]
#[tauri::command]
async fn native_archive_invoke(
    app: tauri::AppHandle,
    state: tauri::State<'_, NativeStorageState>,
    request: NativeArchiveRequest,
) -> Result<NativeArchiveResponse, NativeArchiveError> {
    let service = Arc::clone(&state.0);
    tauri::async_runtime::spawn_blocking(move || {
        service.validate_archive_request(&request)?;
        let picker = app
            .dialog()
            .file()
            .add_filter("Coredrill database recovery", &["coredrill-db"]);
        let selected = match &request.operation {
            NativeArchiveOperation::Export { .. } => picker
                .set_file_name("coredrill-recovery.coredrill-db")
                .blocking_save_file(),
            NativeArchiveOperation::Restore { .. } => picker.blocking_pick_file(),
            NativeArchiveOperation::AutomaticBackup { .. } => None,
        };
        let selected_path = selected
            .map(|path| path.into_path())
            .transpose()
            .map_err(|_| NativeArchiveError::invalid_request())?;
        service.invoke_archive_with_selected_path(request, selected_path)
    })
    .await
    .map_err(|_| NativeArchiveError::invalid_request())?
}

#[cfg(feature = "desktop-shell")]
#[tauri::command]
async fn native_secret_invoke(
    state: tauri::State<'_, NativeSecretState>,
    request: NativeSecretRequest,
) -> Result<NativeSecretResponse, NativeSecretError> {
    let service = Arc::clone(&state.0);
    tauri::async_runtime::spawn_blocking(move || service.invoke(request))
        .await
        .map_err(|_| NativeSecretError::invalid_request())?
}

#[cfg(feature = "desktop-shell")]
#[tauri::command]
async fn native_storage_invoke(
    state: tauri::State<'_, NativeStorageState>,
    request: NativeStorageRequest,
) -> Result<NativeStorageResponse, NativeStorageError> {
    let service = Arc::clone(&state.0);
    tauri::async_runtime::spawn_blocking(move || service.invoke(request))
        .await
        .map_err(|_| NativeStorageError::invalid_request())?
}

#[cfg(feature = "desktop-shell")]
#[tauri::command]
async fn native_vault_invoke(
    state: tauri::State<'_, NativeVaultState>,
    request: NativeVaultRequest,
) -> Result<NativeVaultResponse, NativeVaultError> {
    let service = Arc::clone(&state.0);
    tauri::async_runtime::spawn_blocking(move || service.invoke(request))
        .await
        .map_err(|_| NativeVaultError::invalid_request())?
}

#[cfg(feature = "desktop-shell")]
fn native_storage_app_data_root<R: Runtime>(
    app: &tauri::App<R>,
) -> tauri::Result<std::path::PathBuf> {
    app.path().app_data_dir()
}

#[cfg(feature = "desktop-shell")]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let startup_benchmark = std::env::args_os()
        .any(|argument| argument == std::ffi::OsStr::new("--coredrill-startup-benchmark"));
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .on_page_load(move |webview, payload| {
            if webview.label() == "main" && matches!(payload.event(), PageLoadEvent::Finished) {
                let window = webview.window();
                window
                    .set_title("Coredrill")
                    .expect("Coredrill main window title must become ready");
                if !startup_benchmark {
                    window
                        .show()
                        .expect("Coredrill main window must show after page load");
                }
            }
        })
        .setup(|app| {
            let storage_root = native_storage_app_data_root(app)?;
            let storage = Arc::new(
                NativeStorageService::new(storage_root)
                    .map_err(|_| std::io::Error::other("native storage initialization failed"))?,
            );
            let secrets = Arc::new(NativeSecretService::new());
            let vault = Arc::new(NativeVaultService::new(
                Arc::clone(&storage),
                Arc::clone(&secrets),
            ));
            app.manage(NativeStorageState(storage));
            app.manage(NativeSecretState(secrets));
            app.manage(NativeVaultState(vault));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            native_storage_invoke,
            native_secret_invoke,
            native_archive_invoke,
            native_vault_invoke
        ])
        .run(tauri::generate_context!())
        .expect("Coredrill desktop runtime failed");
}

#[cfg(all(test, feature = "desktop-shell"))]
mod tests {
    use serde_json::Value;
    use tauri::{Manager, test};

    use super::native_storage_app_data_root;

    #[test]
    fn tauri_app_data_path_uses_the_configured_identifier_on_this_platform() {
        let config: Value = serde_json::from_str(include_str!("../tauri.conf.json"))
            .expect("the reviewed Tauri configuration must be valid JSON");
        let identifier = config
            .get("identifier")
            .and_then(Value::as_str)
            .expect("the Tauri configuration must contain an identifier");
        let mut context = test::mock_context(test::noop_assets());
        context.config_mut().identifier = identifier.to_owned();
        let app = test::mock_builder()
            .build(context)
            .expect("the mock Tauri application must build");

        let data_root = app
            .path()
            .data_dir()
            .expect("the platform data directory must resolve");
        let app_data_root = native_storage_app_data_root(&app)
            .expect("the Tauri application-data directory must resolve");

        assert!(app_data_root.is_absolute());
        assert_eq!(app_data_root, data_root.join(identifier));
    }
}
