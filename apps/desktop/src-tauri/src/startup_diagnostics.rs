use std::{
    fs, io,
    path::{Path, PathBuf},
};

/// Package launch probes must never open or migrate the user's production vault.
/// Normal launches retain the exact platform-resolved application-data root.
pub(crate) fn storage_root(app_data: PathBuf, diagnostic: bool) -> io::Result<PathBuf> {
    if !diagnostic {
        return Ok(app_data);
    }
    fs::create_dir_all(&app_data)?;
    let base = fs::canonicalize(app_data)?;
    let target = base.join("startup-diagnostics");
    match fs::create_dir(&target) {
        Ok(()) => {}
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
        Err(error) => return Err(error),
    }
    let metadata = fs::symlink_metadata(&target)?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(io::Error::other(
            "startup diagnostic storage is unavailable",
        ));
    }
    let canonical = fs::canonicalize(target)?;
    if canonical.parent() != Some(Path::new(&base)) {
        return Err(io::Error::other(
            "startup diagnostic storage is unavailable",
        ));
    }
    Ok(canonical)
}

#[cfg(test)]
mod tests {
    use super::storage_root;
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn launch_diagnostics_never_reuse_the_production_database_root() {
        let base = std::env::temp_dir().join(format!(
            "coredrill-startup-root-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        assert_eq!(storage_root(base.clone(), false).unwrap(), base);
        assert!(!base.exists());
        fs::create_dir(&base).unwrap();
        fs::create_dir(base.join("databases")).unwrap();
        let production = base.join("databases/coredrill.sqlite3");
        fs::write(&production, b"synthetic production sentinel").unwrap();
        let diagnostic = storage_root(base.clone(), true).unwrap();
        assert_eq!(
            diagnostic.parent().unwrap(),
            fs::canonicalize(&base).unwrap()
        );
        assert_eq!(diagnostic.file_name().unwrap(), "startup-diagnostics");
        assert_eq!(storage_root(base.clone(), true).unwrap(), diagnostic);
        assert_eq!(
            fs::read(production).unwrap(),
            b"synthetic production sentinel"
        );
        assert!(base.starts_with(std::env::temp_dir()));
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn existing_non_directory_diagnostic_target_fails_closed() {
        let base = std::env::temp_dir().join(format!(
            "coredrill-startup-denied-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&base).unwrap();
        fs::write(base.join("startup-diagnostics"), b"preserve").unwrap();
        assert!(storage_root(base.clone(), true).is_err());
        assert_eq!(
            fs::read(base.join("startup-diagnostics")).unwrap(),
            b"preserve"
        );
        assert!(base.starts_with(std::env::temp_dir()));
        fs::remove_dir_all(base).unwrap();
    }
}
