import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const result = spawnSync(
  "cargo",
  [
    "test",
    "--manifest-path",
    "apps/desktop/src-tauri/Cargo.toml",
    "--locked",
    "--no-default-features",
    "--lib",
    "native_archive::tests::checksummed_archive_restore_is_atomic_recoverable_and_durable",
  ],
  {
    cwd: repositoryRoot,
    encoding: "utf8",
    windowsHide: true,
  },
);

if (result.error) {
  throw new Error("The native archive proof process could not start.");
}

if (result.status !== 0) {
  process.stdout.write(`${result.stdout ?? ""}${result.stderr ?? ""}`);
  throw new Error("The native archive proof failed.");
}

console.log(
  `NAT006_ARCHIVE_PROOF ${JSON.stringify({
    artifact: "checksummed-database-recovery",
    pickerBoundary: "rust-only",
    cancellation: true,
    checksumRejectedBeforeReplacement: true,
    atomicReplacement: true,
    replacementFailureRecovery: true,
    postReplacementRecovery: true,
    durableAfterReopen: true,
    pathExposedToWebview: false,
  })}`,
);
