pub mod native_storage;

#[cfg(feature = "desktop-shell")]
use std::sync::Arc;

#[cfg(feature = "desktop-shell")]
use native_storage::{
    NativeStorageError, NativeStorageRequest, NativeStorageResponse, NativeStorageService,
};
#[cfg(feature = "desktop-shell")]
use tauri::{Manager, Runtime};

#[cfg(feature = "desktop-shell")]
struct NativeStorageState(Arc<NativeStorageService>);

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
fn native_storage_app_data_root<R: Runtime>(
    app: &tauri::App<R>,
) -> tauri::Result<std::path::PathBuf> {
    app.path().app_data_dir()
}

#[cfg(feature = "desktop-shell")]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let storage_root = native_storage_app_data_root(app)?;
            let service = NativeStorageService::new(storage_root)
                .map_err(|_| std::io::Error::other("native storage initialization failed"))?;
            app.manage(NativeStorageState(Arc::new(service)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![native_storage_invoke])
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
