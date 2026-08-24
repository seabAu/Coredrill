import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { inspectExtensionBuild } from "./check-extension-build.mjs";
import { scanText } from "./check-secrets.mjs";

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function listFiles(root, current = root) {
  const files = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(root, absolute)));
    else if (entry.isFile()) files.push(path.relative(root, absolute).split(path.sep).join("/"));
  }
  return files.sort(compareText);
}

function runArchiveCommand(command, argumentsList) {
  const result = spawnSync(command, argumentsList, { encoding: "utf8" });
  if (result.error) throw new Error(`Unable to inspect ZIP archive: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`Unable to inspect ZIP archive: ${(result.stderr ?? "").trim()}`);
  }
  return result.stdout;
}

function listArchive(archivePath) {
  return process.platform === "win32"
    ? runArchiveCommand("tar", ["-tf", archivePath])
    : runArchiveCommand("unzip", ["-Z1", archivePath]);
}

function extractArchiveContents(archivePath, destination) {
  if (process.platform === "win32") {
    runArchiveCommand("tar", ["-xf", archivePath, "-C", destination]);
    return;
  }
  runArchiveCommand("unzip", ["-q", archivePath, "-d", destination]);
}

function runPnpm(argumentsList, workingDirectory) {
  const pnpmCli = process.env["npm_execpath"];
  assert(
    typeof pnpmCli === "string" && /pnpm\.(?:cjs|js|mjs)$/iu.test(pnpmCli),
    "Source rebuild must be launched through the pinned pnpm CLI.",
  );
  const result = spawnSync(process.execPath, [pnpmCli, ...argumentsList], {
    cwd: workingDirectory,
    encoding: "utf8",
    env: { ...process.env, CI: "true" },
  });
  if (result.error) throw new Error(`Unable to rebuild source package: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(
      `Unable to rebuild source package:\n${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim(),
    );
  }
}

function normalizeArchiveEntry(input) {
  const entry = input.trim().replaceAll("\\", "/").replace(/^\.\//u, "");
  assert(entry.length > 0, "ZIP archive contains an empty path.");
  assert(!path.posix.isAbsolute(entry), `ZIP archive contains an absolute path: ${entry}`);
  assert(!/^[A-Za-z]:/u.test(entry), `ZIP archive contains a drive path: ${entry}`);
  assert(
    entry.split("/").every((segment) => segment !== "" && segment !== "." && segment !== ".."),
    `ZIP archive contains an unsafe path: ${entry}`,
  );
  return entry;
}

function archiveEntries(archivePath) {
  const entries = listArchive(archivePath)
    .split(/\r?\n/u)
    .filter(Boolean)
    .map(normalizeArchiveEntry)
    .sort(compareText);
  assert(new Set(entries).size === entries.length, "ZIP archive contains duplicate paths.");
  return entries;
}

function assertExactFiles(actual, expected, label) {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${label} file set differs from the reviewed allowlist.`,
  );
}

async function archiveRecord(repositoryRoot, archivePath) {
  const contents = await readFile(archivePath);
  const metadata = await stat(archivePath);
  return {
    path: path.relative(repositoryRoot, archivePath).split(path.sep).join("/"),
    bytes: metadata.size,
    sha256: createHash("sha256").update(contents).digest("hex"),
  };
}

async function extractArchive(archivePath, label, operation) {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), `coredrill-${label}-`));
  try {
    extractArchiveContents(archivePath, temporaryRoot);
    return await operation(temporaryRoot);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function inspectStorePackage(repositoryRoot, outputRoot, target, archiveName) {
  const buildRoot = path.join(outputRoot, target);
  const archivePath = path.join(outputRoot, archiveName);
  const localInspection = await inspectExtensionBuild(buildRoot, target);
  const expectedFiles = localInspection.files.map(({ path: relativePath }) => relativePath);
  assertExactFiles(archiveEntries(archivePath), expectedFiles, `${target} store package`);

  const packagedInspection = await extractArchive(archivePath, target, (temporaryRoot) =>
    inspectExtensionBuild(temporaryRoot, target),
  );
  assert(
    JSON.stringify(packagedInspection) === JSON.stringify(localInspection),
    `${target} store package is not byte-identical to its inspected production directory.`,
  );
  return {
    target,
    ...(await archiveRecord(repositoryRoot, archivePath)),
    inspection: packagedInspection,
    byteIdenticalToProductionDirectory: true,
  };
}

async function expectedSourceFiles(repositoryRoot) {
  const exactFiles = [
    "LICENSE",
    "README.md",
    "SOURCE_CODE_REVIEW.md",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "tsconfig.json",
    "tooling/typescript/base.json",
    "apps/extension/README.md",
    "apps/extension/package.json",
    "apps/extension/tsconfig.json",
    "apps/extension/wxt.config.ts",
    "packages/contracts/package.json",
    "packages/contracts/tsconfig.json",
    "packages/capture-core/package.json",
    "packages/capture-core/tsconfig.json",
    "packages/extension-bridge/package.json",
    "packages/extension-bridge/tsconfig.json",
  ];
  const sourceDirectories = [
    "apps/extension/entrypoints",
    "apps/extension/src",
    "packages/contracts/schemas",
    "packages/contracts/src",
    "packages/capture-core/src",
    "packages/extension-bridge/src",
  ];
  const discovered = [];
  for (const relativeDirectory of sourceDirectories) {
    discovered.push(
      ...(await listFiles(repositoryRoot, path.join(repositoryRoot, relativeDirectory))),
    );
  }
  return [...exactFiles, ...discovered].sort(compareText);
}

async function inspectSourcePackage(repositoryRoot, outputRoot) {
  const archivePath = path.join(outputRoot, "coredrillextension-0.0.0-sources.zip");
  const expectedFiles = await expectedSourceFiles(repositoryRoot);
  const entries = archiveEntries(archivePath);
  assertExactFiles(entries, expectedFiles, "Firefox source-review package");

  const scan = await extractArchive(archivePath, "firefox-sources", async (temporaryRoot) => {
    const extractedFiles = await listFiles(temporaryRoot);
    assertExactFiles(extractedFiles, expectedFiles, "Extracted Firefox source-review package");
    const findings = [];
    for (const relativePath of extractedFiles) {
      const contents = await readFile(path.join(temporaryRoot, ...relativePath.split("/")));
      if (contents.includes(0)) continue;
      for (const finding of scanText(contents.toString("utf8"))) {
        findings.push({ ...finding, path: relativePath });
      }
    }
    return { scannedFiles: extractedFiles.length, findings };
  });
  assert(scan.findings.length === 0, "Firefox source-review package contains a potential secret.");
  return {
    ...(await archiveRecord(repositoryRoot, archivePath)),
    files: entries.length,
    secretScan: { scannedFiles: scan.scannedFiles, findings: 0 },
    rebuildCommand: "pnpm install --frozen-lockfile && pnpm run package:extension:firefox-source",
  };
}

async function rebuildSourcePackage(repositoryRoot, expectedFirefoxInspection) {
  const archivePath = path.join(
    repositoryRoot,
    "apps",
    "extension",
    ".output",
    "coredrillextension-0.0.0-sources.zip",
  );
  return extractArchive(archivePath, "firefox-source-rebuild", async (temporaryRoot) => {
    runPnpm(["install", "--frozen-lockfile", "--offline"], temporaryRoot);
    runPnpm(["run", "package:extension:firefox-source"], temporaryRoot);
    const outputRoot = path.join(temporaryRoot, "apps", "extension", ".output");
    const rebuiltPackage = await inspectStorePackage(
      temporaryRoot,
      outputRoot,
      "firefox-mv3",
      "coredrillextension-0.0.0-firefox.zip",
    );
    assert(
      JSON.stringify(rebuiltPackage.inspection) === JSON.stringify(expectedFirefoxInspection),
      "Firefox source-review package did not reproduce the inspected production build.",
    );
    const rebuiltSources = await inspectSourcePackage(temporaryRoot, outputRoot);
    return {
      installMode: "frozen-lockfile-offline",
      command: "pnpm run package:extension:firefox-source",
      byteIdenticalToProductionDirectory: true,
      storePackage: rebuiltPackage,
      sourceReviewPackage: rebuiltSources,
    };
  });
}

export async function inspectExtensionPackages(repositoryRoot, options = { rebuildSource: false }) {
  const outputRoot = path.join(repositoryRoot, "apps", "extension", ".output");
  const storePackages = await Promise.all([
    inspectStorePackage(
      repositoryRoot,
      outputRoot,
      "chrome-mv3",
      "coredrillextension-0.0.0-chrome.zip",
    ),
    inspectStorePackage(
      repositoryRoot,
      outputRoot,
      "firefox-mv3",
      "coredrillextension-0.0.0-firefox.zip",
    ),
  ]);
  const sourceReviewPackage = await inspectSourcePackage(repositoryRoot, outputRoot);
  const firefoxPackage = storePackages.find(({ target }) => target === "firefox-mv3");
  assert(firefoxPackage !== undefined, "Firefox store package inspection is missing.");
  return {
    schemaVersion: 1,
    storePackages,
    sourceReviewPackage,
    ...(options.rebuildSource
      ? {
          sourceRebuild: await rebuildSourcePackage(repositoryRoot, firefoxPackage.inspection),
        }
      : {}),
  };
}

async function runCli() {
  const argumentsList = process.argv.slice(2);
  const rebuildSource = argumentsList.includes("--rebuild-source");
  const rootArgument = argumentsList.find((argument) => argument !== "--rebuild-source");
  const repositoryRoot = path.resolve(rootArgument ?? process.cwd());
  console.log(
    JSON.stringify(await inspectExtensionPackages(repositoryRoot, { rebuildSource }), null, 2),
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) await runCli();
