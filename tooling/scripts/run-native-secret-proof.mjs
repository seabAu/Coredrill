import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const backendByPlatform = {
  darwin: "macos-keychain",
  linux: "freedesktop-secret-service",
  win32: "windows-credential-manager",
};
const backend = backendByPlatform[process.platform];

if (!backend) {
  console.log(`Native secure-storage proof skipped: ${process.platform} is not a desktop target.`);
  process.exit(0);
}

if (process.platform === "linux" && process.env.COREDRILL_SECRET_PROOF_REQUIRED !== "true") {
  console.log(
    "Native secure-storage proof skipped: a prepared Secret Service session is required.",
  );
  process.exit(0);
}

const syntheticSecret = `nat008-${randomBytes(48).toString("base64url")}`;
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
    "--no-default-features",
    "--lib",
    "platform_secure_store_lifecycle_is_redacted",
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
  `NAT008_SECRET_PROOF ${JSON.stringify({
    backend,
    stored: true,
    retrievedInsideRust: true,
    deleted: true,
    secretExposed: false,
  })}`,
);
