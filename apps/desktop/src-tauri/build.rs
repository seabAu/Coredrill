const COMMANDS: &[&str] = &["native_storage_invoke", "native_secret_invoke"];

fn main() {
    if std::env::var_os("CARGO_FEATURE_DESKTOP_SHELL").is_none() {
        return;
    }

    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("Tauri build metadata must be valid");
}
