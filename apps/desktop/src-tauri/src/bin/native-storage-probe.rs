use std::{
    env,
    io::{self, BufRead, Write},
    path::PathBuf,
};

use coredrill_desktop::native_archive::{
    NativeArchiveError, NativeArchiveRequest, NativeArchiveResponse,
};
use coredrill_desktop::native_storage::{
    NativeStorageError, NativeStorageRequest, NativeStorageResponse, NativeStorageService,
};
use serde::Serialize;
use serde_json::Value;

const MAX_LINE_BYTES: usize = 64 * 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProbeEnvelope {
    ok: bool,
    response: Option<Value>,
    error: Option<Value>,
}

fn envelope<Response: Serialize, Error: Serialize>(
    result: Result<Response, Error>,
) -> ProbeEnvelope {
    match result {
        Ok(response) => ProbeEnvelope {
            ok: true,
            response: serde_json::to_value(response).ok(),
            error: None,
        },
        Err(error) => ProbeEnvelope {
            ok: false,
            response: None,
            error: serde_json::to_value(error).ok(),
        },
    }
}

fn invoke_line(service: &NativeStorageService, line: &str) -> ProbeEnvelope {
    let value = match serde_json::from_str::<Value>(line) {
        Ok(value) => value,
        Err(_) => {
            return envelope::<NativeStorageResponse, NativeStorageError>(Err(
                NativeStorageError::invalid_request(),
            ));
        }
    };
    if let Ok(request) = serde_json::from_value::<NativeStorageRequest>(value.clone()) {
        return envelope(service.invoke(request));
    }
    match serde_json::from_value::<NativeArchiveRequest>(value) {
        Ok(request) => envelope::<NativeArchiveResponse, NativeArchiveError>(
            service.invoke_archive_with_selected_path(request, None),
        ),
        Err(_) => envelope::<NativeStorageResponse, NativeStorageError>(Err(
            NativeStorageError::invalid_request(),
        )),
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
                write_envelope(&mut stdout, &invoke_line(&service, &line))
            }
            _ => write_envelope(
                &mut stdout,
                &envelope::<NativeStorageResponse, NativeStorageError>(Err(
                    NativeStorageError::invalid_request(),
                )),
            ),
        };
        if result.is_err() {
            std::process::exit(3);
        }
    }
}
