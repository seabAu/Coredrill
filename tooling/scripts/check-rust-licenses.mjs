import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const allowedLicenseTokens = new Set([
  "0BSD",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "BSL-1.0",
  "CC0-1.0",
  "CDLA-Permissive-2.0",
  "ISC",
  "LGPL-2.1-or-later",
  "LLVM-exception",
  "MIT",
  "MIT-0",
  "MPL-2.0",
  "OpenSSL",
  "Unicode-3.0",
  "Unlicense",
  "Zlib",
]);

function isAllowedExpression(value) {
  if (typeof value !== "string" || value.trim() === "") return false;
  const tokens = value
    .replace(/[()]/g, " ")
    .replaceAll("/", " OR ")
    .split(/\s+(?:AND|OR|WITH)\s+|\s+/i)
    .map((token) => token.trim())
    .filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => allowedLicenseTokens.has(token));
}

const repositoryRoot = path.resolve(process.argv[2] ?? process.cwd());
const manifestPath = path.join(repositoryRoot, "apps", "desktop", "src-tauri", "Cargo.toml");
const emitJson = process.argv.includes("--json");

try {
  const metadata = JSON.parse(
    execFileSync(
      "cargo",
      ["metadata", "--locked", "--format-version", "1", "--manifest-path", manifestPath],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: { ...process.env, CARGO_TERM_COLOR: "never" },
        maxBuffer: 64 * 1024 * 1024,
      },
    ),
  );
  const packages = metadata.packages
    .filter(({ source }) => source !== null)
    .map(({ name, version, license, source }) => ({ name, version, license, source }))
    .sort((left, right) =>
      `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`),
    );
  const rejected = packages
    .filter(({ license }) => !isAllowedExpression(license))
    .map(({ name, version, license }) => `${name}@${version}: ${String(license)}`);
  const inventory = JSON.parse(
    readFileSync(
      path.join(repositoryRoot, "docs", "proof", "foundation-dependency-inventory.json"),
      "utf8",
    ),
  );
  if (inventory.cargo?.licenseReview?.resolvedPackageRecords !== packages.length) {
    rejected.push(
      `reviewed Cargo package count ${String(inventory.cargo?.licenseReview?.resolvedPackageRecords)} does not match ${String(packages.length)}`,
    );
  }

  if (emitJson) {
    console.log(JSON.stringify({ schemaVersion: 1, packages }, null, 2));
  } else if (rejected.length > 0) {
    console.error(
      ["Rust dependency license policy failed:", ...rejected.map((item) => `- ${item}`)].join("\n"),
    );
    process.exitCode = 1;
  } else {
    console.log(`Rust dependency license policy passed for ${String(packages.length)} crates.`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
