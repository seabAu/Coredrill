pub mod native_storage;

#[cfg(feature = "desktop-shell")]
use std::sync::Arc;

#[cfg(feature = "desktop-shell")]
use native_storage::{
    NativeStorageError, NativeStorageRequest, NativeStorageResponse, NativeStorageService,
};
#[cfg(feature = "desktop-shell")]
use tauri::Manager;

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
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let storage_root = app.path().app_data_dir()?.join("vaults");
            let service = NativeStorageService::new(storage_root)
                .map_err(|_| std::io::Error::other("native storage initialization failed"))?;
            app.manage(NativeStorageState(Arc::new(service)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![native_storage_invoke])
        .run(tauri::generate_context!())
        .expect("Coredrill desktop runtime failed");
}
