import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  readlink,
  readdir,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const tauriRoot = path.join(repositoryRoot, "apps", "desktop", "src-tauri");
const fixturePath = path.join(
  repositoryRoot,
  "docs",
  "testing",
  "fixtures",
  "native-package-empty-shell.v1.json",
);

function parseOutputPath() {
  const index = process.argv.indexOf("--output");
  if (index === -1) {
    return path.join(tauriRoot, "target", "nat008", `native-package-${process.platform}.json`);
  }
  const value = process.argv[index + 1];
  if (!value) throw new Error("--output requires a path.");
  return path.resolve(repositoryRoot, value);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    windowsHide: true,
    ...options,
  });
  if (result.error) throw new Error(`${command} could not start.`);
  return result;
}

function requireSuccess(command, args, options = {}) {
  const result = run(command, args, options);
  if (result.status !== 0) {
    throw new Error(`${command} failed with status ${result.status}.`);
  }
  return (result.stdout ?? "").trim();
}

async function sha256File(filePath) {
  return createHash("sha256")
    .update(await readFile(filePath))
    .digest("hex");
}

async function listPackageEntries(root) {
  const packageEntries = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (entry.isFile()) {
        packageEntries.push({ path: entryPath, type: "file" });
      } else if (entry.isSymbolicLink()) {
        const target = await readlink(entryPath);
        const absolute = path.isAbsolute(target);
        if (!absolute) {
          const resolvedTarget = path.resolve(directory, target);
          if (
            resolvedTarget !== path.resolve(root) &&
            !resolvedTarget.startsWith(`${path.resolve(root)}${path.sep}`)
          ) {
            throw new Error(
              "Package proof refuses a relative link that escapes the extracted package.",
            );
          }
        }
        packageEntries.push({ absolute, path: entryPath, target, type: "link" });
      } else {
        throw new Error("Package proof refuses unsupported bundle entries.");
      }
    }
  }
  await visit(root);
  return packageEntries;
}

async function inspectDirectory(root) {
  const packageEntries = await listPackageEntries(root);
  const hash = createHash("sha256");
  let bytes = 0;
  for (const entry of packageEntries) {
    const relativePath = path.relative(root, entry.path).split(path.sep).join("/");
    hash.update(relativePath);
    hash.update("\0");
    hash.update(entry.type);
    hash.update("\0");
    if (entry.type === "file") {
      const contents = await readFile(entry.path);
      bytes += contents.length;
      hash.update(contents);
    } else {
      hash.update(entry.target);
    }
    hash.update("\0");
  }
  return {
    absoluteSymlinkCount: packageEntries.filter((entry) => entry.type === "link" && entry.absolute)
      .length,
    bytes,
    entryCount: packageEntries.length,
    relativeSymlinkCount: packageEntries.filter((entry) => entry.type === "link" && !entry.absolute)
      .length,
    sha256: hash.digest("hex"),
    packageEntries,
  };
}

async function proveFiveSecondLaunch(executablePath, cwd) {
  const resolvedExecutable = await realpath(executablePath);
  const resolvedCwd = await realpath(cwd);
  if (!resolvedExecutable.startsWith(`${resolvedCwd}${path.sep}`)) {
    throw new Error("Refusing to launch an executable outside the inspected package.");
  }

  const child = spawn(resolvedExecutable, ["--coredrill-startup-benchmark"], {
    cwd: resolvedCwd,
    detached: true,
    stdio: "ignore",
  });
  let exit;
  const exited = new Promise((resolve) => {
    child.once("error", (error) => resolve({ error }));
    child.once("exit", (code, signal) => resolve({ code, signal }));
  }).then((value) => {
    exit = value;
    return value;
  });

  await Promise.race([exited, delay(5_000)]);
  if (exit) {
    throw new Error("The packaged Coredrill executable exited during its five-second smoke run.");
  }

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
  await Promise.race([exited, delay(5_000)]);
  if (!exit) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
    await exited;
  }
  return true;
}

function oneMatchingFile(directory, predicate, label) {
  return readdir(directory, { withFileTypes: true }).then((entries) => {
    const matches = entries.filter((entry) => entry.isFile() && predicate(entry.name));
    if (matches.length !== 1) {
      throw new Error(`Expected exactly one ${label}, found ${matches.length}.`);
    }
    return path.join(directory, matches[0].name);
  });
}

async function inspectMacOsPackage() {
  const appRoot = path.join(tauriRoot, "target", "release", "bundle", "macos", "Coredrill.app");
  const packageInspection = await inspectDirectory(appRoot);
  const executablePath = path.join(appRoot, "Contents", "MacOS", "coredrill");
  const infoPlist = path.join(appRoot, "Contents", "Info.plist");
  await stat(executablePath);
  await stat(infoPlist);

  const probeLeak = packageInspection.packageEntries.some((entry) =>
    path.basename(entry.path).includes("coredrill-native-storage-probe"),
  );
  if (probeLeak)
    throw new Error("The contract-only native storage probe leaked into the macOS app.");

  const codeSignVerify = run("codesign", ["--verify", "--deep", "--strict", appRoot]);
  const codeSignDetails = run("codesign", ["-dv", "--verbose=4", appRoot]);
  const codeSignOutput = `${codeSignDetails.stdout ?? ""}${codeSignDetails.stderr ?? ""}`;
  if (codeSignVerify.status !== 0 || !codeSignOutput.includes("Signature=adhoc")) {
    throw new Error("The Phase 0 macOS app must carry a verifiable ad-hoc signature.");
  }

  const bundleIdentifier = requireSuccess("plutil", [
    "-extract",
    "CFBundleIdentifier",
    "raw",
    "-o",
    "-",
    infoPlist,
  ]);
  const bundleVersion = requireSuccess("plutil", [
    "-extract",
    "CFBundleShortVersionString",
    "raw",
    "-o",
    "-",
    infoPlist,
  ]);
  const launchAlive = await proveFiveSecondLaunch(executablePath, appRoot);

  return {
    format: "macos-app",
    artifactPath: path.relative(repositoryRoot, appRoot).split(path.sep).join("/"),
    artifactBytes: packageInspection.bytes,
    artifactEntryCount: packageInspection.entryCount,
    artifactSha256: packageInspection.sha256,
    absoluteSymlinkCount: packageInspection.absoluteSymlinkCount,
    relativeSymlinkCount: packageInspection.relativeSymlinkCount,
    executableBytes: (await stat(executablePath)).size,
    executableSha256: await sha256File(executablePath),
    bundleIdentifier,
    bundleVersion,
    signatureStatus: "ad-hoc-verified",
    nativeStorageProbeExcluded: true,
    fiveSecondLaunchAlive: launchAlive,
  };
}

async function inspectLinuxPackage() {
  const appImageDirectory = path.join(tauriRoot, "target", "release", "bundle", "appimage");
  const appImagePath = await oneMatchingFile(
    appImageDirectory,
    (name) => name.endsWith(".AppImage"),
    "AppImage",
  );
  await chmod(appImagePath, 0o755);
  const extractionBase = await realpath(os.tmpdir());
  const extractionPrefix = path.join(extractionBase, "coredrill-nat008-appimage-");
  const extractionRoot = await mkdtemp(extractionPrefix);
  if (!extractionRoot.startsWith(extractionPrefix)) {
    throw new Error(
      "Refusing to extract the AppImage outside the operating-system temp directory.",
    );
  }
  try {
    requireSuccess(appImagePath, ["--appimage-extract"], { cwd: extractionRoot });
    const appDir = path.join(extractionRoot, "squashfs-root");
    const packageInspection = await inspectDirectory(appDir);
    const probeLeak = packageInspection.packageEntries.some((entry) =>
      path.basename(entry.path).includes("coredrill-native-storage-probe"),
    );
    if (probeLeak) {
      throw new Error("The contract-only native storage probe leaked into the Linux AppImage.");
    }
    const appRun = path.join(appDir, "AppRun");
    const launchAlive = await proveFiveSecondLaunch(appRun, appDir);
    return {
      format: "linux-appimage",
      artifactPath: path.relative(repositoryRoot, appImagePath).split(path.sep).join("/"),
      artifactBytes: (await stat(appImagePath)).size,
      artifactSha256: await sha256File(appImagePath),
      extractedBytes: packageInspection.bytes,
      extractedEntryCount: packageInspection.entryCount,
      extractedTreeSha256: packageInspection.sha256,
      absoluteSymlinkCount: packageInspection.absoluteSymlinkCount,
      relativeSymlinkCount: packageInspection.relativeSymlinkCount,
      relativeSymlinksConfined: true,
      nativeStorageProbeExcluded: true,
      fiveSecondLaunchAlive: launchAlive,
    };
  } finally {
    if (extractionRoot.startsWith(extractionPrefix)) {
      await rm(extractionRoot, { recursive: true, force: true });
    }
  }
}

async function main() {
  if (!new Set(["darwin", "linux"]).has(process.platform)) {
    throw new Error("NAT008 platform package proof requires macOS or Linux.");
  }
  const outputPath = parseOutputPath();
  const commitSha = requireSuccess("git", ["rev-parse", "HEAD"]);
  const workingTreeStatus = requireSuccess("git", [
    "status",
    "--porcelain",
    "--untracked-files=all",
  ]);
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  const packageResult =
    process.platform === "darwin" ? await inspectMacOsPackage() : await inspectLinuxPackage();
  const uname = requireSuccess("uname", ["-srm"]);
  const platformDetails =
    process.platform === "darwin"
      ? requireSuccess("sw_vers", [])
      : (await readFile("/etc/os-release", "utf8")).trim();

  const manifest = {
    schemaVersion: 1,
    proofId: "NAT008-CROSS-PLATFORM-PACKAGE",
    matrixId: "JW-TM-001",
    matrixVersion: "1.2.0",
    executionTargetId: process.platform === "darwin" ? "DESK-MAC" : "DESK-LINUX",
    targetConformant: false,
    targetLimitation:
      "Hosted package evidence is not signing/notarization or reference-hardware release acceptance.",
    commitSha,
    dirtyWorktreeAtStart: workingTreeStatus.length > 0,
    fixture: {
      id: fixture.fixtureId,
      version: fixture.version,
      seed: fixture.seed,
      sha256: await sha256File(fixturePath),
      containsUserData: fixture.containsUserData,
    },
    environment: {
      platform: process.platform,
      architecture: process.arch,
      uname,
      platformDetails,
    },
    package: packageResult,
    completedAt: new Date().toISOString(),
    reviewer: "automated-phase-0-cross-platform-diagnostic",
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(
    `NAT008_PACKAGE_PROOF ${JSON.stringify({
      platform: process.platform,
      format: packageResult.format,
      artifactBytes: packageResult.artifactBytes,
      nativeStorageProbeExcluded: packageResult.nativeStorageProbeExcluded,
      fiveSecondLaunchAlive: packageResult.fiveSecondLaunchAlive,
      targetConformant: manifest.targetConformant,
    })}`,
  );
}

await main();
