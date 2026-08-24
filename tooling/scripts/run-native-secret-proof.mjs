import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

if (process.platform !== "win32") {
  console.log("NAT005 secure-storage proof skipped: Windows Credential Manager is not available.");
  process.exit(0);
}

const syntheticSecret = `nat005-${randomBytes(48).toString("base64url")}`;
const childEnvironment = {
  ...process.env,
  COREDRILL_SECRET_PROOF_VALUE: syntheticSecret,
};
const result = spawnSync(
  "cargo",
  [
    "test",
    "--manifest-path",
    "apps/desktop/src-tauri/Cargo.toml",
    "--locked",
    "--all-features",
    "--lib",
    "windows_credential_manager_lifecycle_is_redacted",
    "--",
    "--ignored",
    "--nocapture",
  ],
  {
    cwd: repositoryRoot,
    env: childEnvironment,
    encoding: "utf8",
    windowsHide: true,
  },
);
delete childEnvironment.COREDRILL_SECRET_PROOF_VALUE;

const safeOutput = `${result.stdout ?? ""}${result.stderr ?? ""}`;
const secretExposed = safeOutput.includes(syntheticSecret);

if (secretExposed) {
  throw new Error("The native secure-storage proof emitted synthetic secret material.");
}

if (result.error) {
  throw new Error("The native secure-storage proof process could not start.");
}

if (result.status !== 0) {
  process.stdout.write(safeOutput);
  throw new Error("The native secure-storage proof failed.");
}

console.log(
  `NAT005_SECRET_PROOF ${JSON.stringify({
    backend: "windows-credential-manager",
    stored: true,
    retrievedInsideRust: true,
    deleted: true,
    secretExposed: false,
  })}`,
);
