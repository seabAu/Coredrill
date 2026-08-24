use std::{
    env,
    io::{self, BufRead, Write},
    path::PathBuf,
};

use coredrill_desktop::native_storage::{
    NativeStorageError, NativeStorageRequest, NativeStorageResponse, NativeStorageService,
};
use serde::Serialize;

const MAX_LINE_BYTES: usize = 12 * 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProbeEnvelope {
    ok: bool,
    response: Option<NativeStorageResponse>,
    error: Option<NativeStorageError>,
}

fn envelope(result: Result<NativeStorageResponse, NativeStorageError>) -> ProbeEnvelope {
    match result {
        Ok(response) => ProbeEnvelope {
            ok: true,
            response: Some(response),
            error: None,
        },
        Err(error) => ProbeEnvelope {
            ok: false,
            response: None,
            error: Some(error),
        },
    }
}

fn write_envelope(output: &mut impl Write, value: &ProbeEnvelope) -> io::Result<()> {
    serde_json::to_writer(&mut *output, value)?;
    output.write_all(b"\n")?;
    output.flush()
}

fn main() {
    let Some(root) = env::args_os().nth(1).map(PathBuf::from) else {
        std::process::exit(2);
    };
    let service = match NativeStorageService::new(root) {
        Ok(service) => service,
        Err(_) => std::process::exit(2),
    };

    let stdin = io::stdin();
    let mut stdout = io::stdout().lock();
    for line in stdin.lock().lines() {
        let result = match line {
            Ok(line) if line.len() <= MAX_LINE_BYTES => {
                serde_json::from_str::<NativeStorageRequest>(&line)
                    .map_err(|_| NativeStorageError::invalid_request())
                    .and_then(|request| service.invoke(request))
            }
            _ => Err(NativeStorageError::invalid_request()),
        };
        if write_envelope(&mut stdout, &envelope(result)).is_err() {
            std::process::exit(3);
        }
    }
}
