import { createHash } from "node:crypto";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const dependencySections = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];
const exactVersionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const semanticVersionPattern = /^\d+\.\d+\.\d+$/;
const hashPattern = /^[0-9a-f]{64}$/;
const selectionStatuses = new Set([
  "current",
  "current-selected-channel",
  "latest-compatible",
  "release-age-approved",
]);
const availabilityStatuses = new Set([
  "available",
  "available-diagnostic",
  "planned",
  "unavailable",
]);
const verificationStatuses = new Set(["not-executed", "passed", "failed"]);
const priorityStatuses = new Set(["required", "supplemental", "diagnostic"]);

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizePath(value) {
  return value.split(path.sep).join("/");
}

function isNonEmptyText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isHttpsUrl(value) {
  if (!isNonEmptyText(value)) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isValidDate(value) {
  return isNonEmptyText(value) && !Number.isNaN(Date.parse(value));
}

function addError(errors, condition, message) {
  if (!condition) errors.push(message);
}

function dependencyKey(entry) {
  return `${entry.manifest}\0${entry.dependencyType}\0${entry.name}\0${entry.version}`;
}

function sortedDependencyKeys(entries) {
  return entries.map(dependencyKey).sort(compareText);
}

function parseCargoDirectDependencies(contents) {
  const dependencies = [];
  let dependencyType;
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    const section = line.match(/^\[(build-dependencies|dependencies)\]$/);
    if (section) {
      dependencyType = section[1];
      continue;
    }
    if (line.startsWith("[") || line === "") {
      if (line.startsWith("[")) dependencyType = undefined;
      continue;
    }
    if (!dependencyType) continue;
    const dependency = line.match(
      /^([0-9A-Za-z_-]+)\s*=\s*(?:"=([^"]+)"|\{[^}]*\bversion\s*=\s*"=([^"]+)"[^}]*\})$/,
    );
    if (!dependency) continue;
    dependencies.push({
      manifest: "apps/desktop/src-tauri/Cargo.toml",
      dependencyType,
      name: dependency[1],
      version: dependency[2] ?? dependency[3],
    });
  }
  return dependencies.sort((left, right) => compareText(dependencyKey(left), dependencyKey(right)));
}

function uniqueIds(errors, entries, label) {
  const ids = entries.map((entry) => entry.id);
  addError(errors, ids.every(isNonEmptyText), `${label} entries require non-empty IDs.`);
  addError(errors, new Set(ids).size === ids.length, `${label} IDs must be unique.`);
}

function requireIds(errors, entries, requiredIds, label) {
  const actual = new Set(entries.map((entry) => entry.id));
  for (const id of requiredIds) {
    addError(errors, actual.has(id), `${label} is missing required ID ${id}.`);
  }
}

async function existingManifestPaths(repositoryRoot) {
  const manifestPaths = [path.join(repositoryRoot, "package.json")];
  for (const parent of ["apps", "packages"]) {
    const parentPath = path.join(repositoryRoot, parent);
    for (const entry of await readdir(parentPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(parentPath, entry.name, "package.json");
      try {
        await access(manifestPath);
        manifestPaths.push(manifestPath);
      } catch {
        // Reserved application roots have no manifest until their platform spike begins.
      }
    }
  }
  return manifestPaths;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function parseToolVersions(contents) {
  return Object.fromEntries(
    contents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split(/\s+/, 2)),
  );
}

export async function readFoundationState(repositoryRoot) {
  const manifestPaths = await existingManifestPaths(repositoryRoot);
  const manifests = await Promise.all(
    manifestPaths.map(async (manifestPath) => ({
      manifestPath: normalizePath(path.relative(repositoryRoot, manifestPath)),
      value: await readJson(manifestPath),
    })),
  );
  const directDependencies = [];
  for (const { manifestPath, value } of manifests) {
    for (const dependencyType of dependencySections) {
      for (const [name, version] of Object.entries(value[dependencyType] ?? {})) {
        if (typeof version === "string" && version.startsWith("workspace:")) continue;
        directDependencies.push({ manifest: manifestPath, dependencyType, name, version });
      }
    }
  }
  directDependencies.sort((left, right) => compareText(dependencyKey(left), dependencyKey(right)));

  const lockfile = await readFile(path.join(repositoryRoot, "pnpm-lock.yaml"));
  const cargoManifest = await readFile(
    path.join(repositoryRoot, "apps", "desktop", "src-tauri", "Cargo.toml"),
    "utf8",
  );
  const cargoLockfile = await readFile(
    path.join(repositoryRoot, "apps", "desktop", "src-tauri", "Cargo.lock"),
  );
  const cargoLockText = cargoLockfile.toString("utf8");
  const rootPackage = manifests.find(({ manifestPath }) => manifestPath === "package.json")?.value;
  if (!rootPackage) throw new Error("Root package.json was not found.");

  return {
    directDependencies,
    cargoDirectDependencies: parseCargoDirectDependencies(cargoManifest),
    cargoLockSha256: createHash("sha256").update(cargoLockfile).digest("hex"),
    cargoPackageCount: (cargoLockText.match(/^\[\[package\]\]$/gm) ?? []).length,
    cargoRegistryPackageCount: (cargoLockText.match(/^source = /gm) ?? []).length,
    lockfileSha256: createHash("sha256").update(lockfile).digest("hex"),
    nodeVersion: (await readFile(path.join(repositoryRoot, ".node-version"), "utf8")).trim(),
    rootPackage,
    rustToolchain: await readFile(path.join(repositoryRoot, "rust-toolchain.toml"), "utf8"),
    toolVersions: parseToolVersions(
      await readFile(path.join(repositoryRoot, ".tool-versions"), "utf8"),
    ),
    workflow: await readFile(
      path.join(repositoryRoot, ".github", "workflows", "foundation.yml"),
      "utf8",
    ),
    workspaceSettings: await readFile(path.join(repositoryRoot, "pnpm-workspace.yaml"), "utf8"),
  };
}

export function validateDependencyInventory(record, state) {
  const errors = [];
  addError(errors, state.rootPackage.name === "coredrill", "Root package name must be coredrill.");
  addError(
    errors,
    state.rootPackage.license === "Apache-2.0",
    "Root package license must be Apache-2.0.",
  );
  addError(errors, record.schemaVersion === 1, "Dependency inventory schemaVersion must be 1.");
  addError(
    errors,
    record.inventoryId === "JW-DI-001",
    "Dependency inventory ID must be JW-DI-001.",
  );
  addError(
    errors,
    semanticVersionPattern.test(record.version ?? ""),
    "Dependency inventory version must be SemVer.",
  );
  addError(
    errors,
    isValidDate(record.reviewedAt),
    "Dependency inventory needs a valid reviewedAt.",
  );
  addError(
    errors,
    hashPattern.test(record.lockfile?.sha256 ?? ""),
    "Dependency inventory requires a lowercase SHA-256 lockfile hash.",
  );
  addError(
    errors,
    record.lockfile?.sha256 === state.lockfileSha256,
    "Dependency inventory lockfile hash does not match pnpm-lock.yaml.",
  );

  const recordedDependencies = Array.isArray(record.packages) ? record.packages : [];
  addError(
    errors,
    JSON.stringify(sortedDependencyKeys(recordedDependencies)) ===
      JSON.stringify(sortedDependencyKeys(state.directDependencies)),
    "Dependency inventory must exactly match every non-workspace direct manifest dependency.",
  );
  addError(
    errors,
    JSON.stringify(recordedDependencies.map(dependencyKey)) ===
      JSON.stringify(sortedDependencyKeys(recordedDependencies)),
    "Dependency inventory packages must be in stable manifest/type/name/version order.",
  );
  for (const dependency of recordedDependencies) {
    const label = `${dependency.name ?? "unknown dependency"}@${dependency.version ?? "?"}`;
    addError(
      errors,
      exactVersionPattern.test(dependency.version ?? ""),
      `${label} is not exact SemVer.`,
    );
    addError(
      errors,
      exactVersionPattern.test(dependency.upstreamLatest ?? ""),
      `${label} needs an exact upstreamLatest version.`,
    );
    addError(
      errors,
      selectionStatuses.has(dependency.selectionStatus),
      `${label} has an invalid selectionStatus.`,
    );
    addError(errors, isNonEmptyText(dependency.license), `${label} needs a license.`);
    addError(
      errors,
      Array.isArray(dependency.maintainers) && dependency.maintainers.length > 0,
      `${label} needs registry maintainer handles.`,
    );
    addError(errors, isHttpsUrl(dependency.repository), `${label} needs an HTTPS repository.`);
    addError(
      errors,
      isHttpsUrl(dependency.metadataSource),
      `${label} needs an HTTPS metadata source.`,
    );
    addError(
      errors,
      Array.isArray(dependency.knownAdvisories),
      `${label} needs an explicit knownAdvisories array.`,
    );
  }

  const toolchains = Array.isArray(record.toolchains) ? record.toolchains : [];
  const byTool = new Map(toolchains.map((entry) => [entry.name, entry]));
  for (const name of ["node", "pnpm", "rust"]) {
    const entry = byTool.get(name);
    addError(errors, Boolean(entry), `Dependency inventory is missing the ${name} toolchain.`);
    if (!entry) continue;
    addError(errors, exactVersionPattern.test(entry.version ?? ""), `${name} needs exact SemVer.`);
    addError(errors, isNonEmptyText(entry.license), `${name} needs a license.`);
    addError(
      errors,
      Array.isArray(entry.maintainers) && entry.maintainers.length > 0,
      `${name} needs maintainers.`,
    );
    addError(
      errors,
      Array.isArray(entry.sources) && entry.sources.length > 0 && entry.sources.every(isHttpsUrl),
      `${name} needs official HTTPS sources.`,
    );
  }
  const node = byTool.get("node");
  const pnpm = byTool.get("pnpm");
  const rust = byTool.get("rust");
  if (node) {
    addError(
      errors,
      node.version === state.nodeVersion,
      "Node inventory and .node-version differ.",
    );
    addError(
      errors,
      node.version === state.toolVersions.nodejs,
      "Node inventory and .tool-versions differ.",
    );
    addError(
      errors,
      state.rootPackage.engines?.node === `>=${node.version} <25`,
      "Node inventory and package.json engine range differ.",
    );
  }
  if (pnpm) {
    addError(
      errors,
      pnpm.version === state.toolVersions.pnpm,
      "pnpm inventory and .tool-versions differ.",
    );
    addError(
      errors,
      state.rootPackage.packageManager === `pnpm@${pnpm.version}`,
      "pnpm inventory and packageManager differ.",
    );
    addError(
      errors,
      state.rootPackage.engines?.pnpm === pnpm.version,
      "pnpm inventory and package.json engine differ.",
    );
    addError(
      errors,
      state.workflow.includes(`pnpm@${pnpm.version}`),
      "pnpm inventory and Foundation CI pin differ.",
    );
  }
  if (rust) {
    addError(
      errors,
      rust.version === state.toolVersions.rust,
      "Rust inventory and .tool-versions differ.",
    );
    addError(
      errors,
      new RegExp(`channel\\s*=\\s*["']${rust.version.replaceAll(".", "\\.")}["']`).test(
        state.rustToolchain,
      ),
      "Rust inventory and rust-toolchain.toml differ.",
    );
  }

  for (const [setting, value] of [
    ["autoInstallPeers", "false"],
    ["engineStrict", "true"],
    ["minimumReleaseAge", "1440"],
    ["savePrefix", '""'],
    ["strictDepBuilds", "true"],
    ["strictPeerDependencies", "true"],
  ]) {
    addError(
      errors,
      new RegExp(`^${setting}:\\s*${value}\\s*$`, "m").test(state.workspaceSettings),
      `pnpm-workspace.yaml must enforce ${setting}: ${value}.`,
    );
  }

  const advisory = record.advisoryReview ?? {};
  addError(errors, isValidDate(advisory.reviewedAt), "Advisory review needs a valid timestamp.");
  addError(
    errors,
    advisory.lockfileSha256 === state.lockfileSha256,
    "Advisory review is not bound to the current lockfile.",
  );
  addError(errors, isHttpsUrl(advisory.source), "Advisory review needs an official HTTPS source.");
  const vulnerabilityCounts = Object.values(advisory.vulnerabilities ?? {});
  addError(
    errors,
    vulnerabilityCounts.length === 5 &&
      vulnerabilityCounts.every((value) => Number.isInteger(value) && value === 0),
    "Current foundation advisory baseline must document zero findings at every severity.",
  );

  const license = record.licenseReview ?? {};
  addError(
    errors,
    license.lockfileSha256 === state.lockfileSha256,
    "License review is not bound to the current lockfile.",
  );
  addError(errors, license.result === "pass", "License review must record a passing result.");
  addError(
    errors,
    Number.isInteger(license.resolvedPackageRecords) && license.resolvedPackageRecords > 0,
    "License review needs a positive resolved package count.",
  );

  const cargo = record.cargo ?? {};
  addError(errors, cargo.schemaVersion === 1, "Cargo inventory schemaVersion must be 1.");
  addError(
    errors,
    cargo.lockfile?.sha256 === state.cargoLockSha256,
    "Cargo inventory lockfile hash does not match Cargo.lock.",
  );
  const recordedCargoDependencies = Array.isArray(cargo.directDependencies)
    ? cargo.directDependencies
    : [];
  addError(
    errors,
    JSON.stringify(sortedDependencyKeys(recordedCargoDependencies)) ===
      JSON.stringify(sortedDependencyKeys(state.cargoDirectDependencies)),
    "Cargo inventory must exactly match every direct Cargo dependency.",
  );
  addError(
    errors,
    JSON.stringify(recordedCargoDependencies.map(dependencyKey)) ===
      JSON.stringify(sortedDependencyKeys(recordedCargoDependencies)),
    "Cargo inventory direct dependencies must be in stable manifest/type/name/version order.",
  );
  for (const dependency of recordedCargoDependencies) {
    const label = `${dependency.name ?? "unknown crate"}@${dependency.version ?? "?"}`;
    addError(
      errors,
      exactVersionPattern.test(dependency.version ?? ""),
      `${label} is not exact SemVer.`,
    );
    addError(
      errors,
      exactVersionPattern.test(dependency.upstreamLatest ?? ""),
      `${label} needs an exact upstreamLatest version.`,
    );
    addError(
      errors,
      selectionStatuses.has(dependency.selectionStatus),
      `${label} has an invalid selectionStatus.`,
    );
    addError(errors, isNonEmptyText(dependency.license), `${label} needs a license.`);
    addError(
      errors,
      Array.isArray(dependency.maintainers) && dependency.maintainers.length > 0,
      `${label} needs crate maintainers.`,
    );
    addError(errors, isHttpsUrl(dependency.repository), `${label} needs an HTTPS repository.`);
    addError(
      errors,
      isHttpsUrl(dependency.metadataSource),
      `${label} needs an HTTPS metadata source.`,
    );
    addError(
      errors,
      Array.isArray(dependency.knownAdvisories),
      `${label} needs an explicit knownAdvisories array.`,
    );
  }
  const cargoAdvisory = cargo.advisoryReview ?? {};
  addError(
    errors,
    cargoAdvisory.lockfileSha256 === state.cargoLockSha256,
    "Cargo advisory review is not bound to the current lockfile.",
  );
  addError(
    errors,
    cargoAdvisory.dependencyCount === state.cargoPackageCount,
    "Cargo advisory dependency count does not match Cargo.lock.",
  );
  addError(
    errors,
    cargoAdvisory.vulnerabilities === 0,
    "Cargo advisory review must report zero vulnerabilities.",
  );
  addError(
    errors,
    Number.isInteger(cargoAdvisory.unmaintainedWarnings) &&
      Number.isInteger(cargoAdvisory.unsoundWarnings),
    "Cargo advisory review must record its informational warning counts.",
  );
  const cargoLicense = cargo.licenseReview ?? {};
  addError(
    errors,
    cargoLicense.lockfileSha256 === state.cargoLockSha256,
    "Cargo license review is not bound to the current lockfile.",
  );
  addError(
    errors,
    cargoLicense.resolvedPackageRecords === state.cargoRegistryPackageCount,
    "Cargo license package count does not match Cargo.lock.",
  );
  addError(errors, cargoLicense.result === "pass", "Cargo license review must record a pass.");
  return errors;
}

export function validateReferenceMatrix(record) {
  const errors = [];
  addError(errors, record.schemaVersion === 1, "Reference matrix schemaVersion must be 1.");
  addError(errors, record.matrixId === "JW-TM-001", "Reference matrix ID must be JW-TM-001.");
  addError(
    errors,
    semanticVersionPattern.test(record.version ?? ""),
    "Reference matrix version must be SemVer.",
  );
  addError(errors, isValidDate(record.effectiveDate), "Reference matrix needs an effective date.");
  addError(
    errors,
    record.supportPolicy?.status === "test-targets-not-support-commitment",
    "Reference matrix must not claim unproven support.",
  );
  addError(
    errors,
    isNonEmptyText(record.statusDefinitions?.availability?.available),
    "Reference matrix must define the conforming available lifecycle state.",
  );

  const hardware = Array.isArray(record.hardware) ? record.hardware : [];
  const operatingSystems = Array.isArray(record.operatingSystems) ? record.operatingSystems : [];
  const executionTargets = Array.isArray(record.executionTargets) ? record.executionTargets : [];
  uniqueIds(errors, hardware, "Hardware");
  uniqueIds(errors, operatingSystems, "Operating system");
  uniqueIds(errors, executionTargets, "Execution target");
  requireIds(
    errors,
    hardware,
    ["HW-WIN-REF", "HW-MAC-REF", "HW-IOS-REF", "HW-ANDROID-REF", "HW-STRESS", "HW-LOCAL-DIAG"],
    "Hardware",
  );
  requireIds(
    errors,
    operatingSystems,
    [
      "OS-WIN11-25H2",
      "OS-WIN11-26H1",
      "OS-MAC-TAHOE",
      "OS-MAC-SEQUOIA",
      "OS-MAC-SONOMA-18",
      "OS-IOS-26",
      "OS-ANDROID-17",
      "OS-UBUNTU-26",
      "OS-UBUNTU-24",
      "OS-WIN10-LOCAL",
    ],
    "Operating system",
  );
  requireIds(
    errors,
    executionTargets,
    [
      "WEB-CHR-N",
      "WEB-CHR-N1",
      "WEB-EDGE-N",
      "WEB-EDGE-N1",
      "WEB-FF-N",
      "WEB-FF-N1",
      "WEB-SAF-N",
      "WEB-SAF-N1",
      "MOBILE-IOS-PWA",
      "MOBILE-ANDROID-PWA",
      "DESK-WIN",
      "DESK-MAC",
      "EXT-CHR",
      "EXT-FF",
    ],
    "Execution target",
  );
  for (const entry of [...hardware, ...operatingSystems, ...executionTargets]) {
    addError(
      errors,
      priorityStatuses.has(entry.targetPriority),
      `${entry.id ?? "Unknown target"} has an invalid targetPriority.`,
    );
    addError(
      errors,
      availabilityStatuses.has(entry.availability),
      `${entry.id ?? "Unknown target"} has an invalid availability.`,
    );
    addError(
      errors,
      verificationStatuses.has(entry.verification),
      `${entry.id ?? "Unknown target"} has an invalid verification state.`,
    );
    addError(
      errors,
      entry.verification !== "passed" ||
        entry.availability === "available" ||
        entry.availability === "available-diagnostic",
      `${entry.id ?? "Unknown target"} cannot pass while its environment is not available.`,
    );
    addError(
      errors,
      entry.availability !== "available-diagnostic" || entry.targetPriority === "diagnostic",
      `${entry.id ?? "Unknown target"} can be available-diagnostic only when diagnostic.`,
    );
  }
  const hardwareIds = new Set(hardware.map(({ id }) => id));
  const operatingSystemIds = new Set(operatingSystems.map(({ id }) => id));
  for (const entry of hardware) {
    const singleOsId = entry.specification?.osTargetId;
    const multipleOsIds = entry.specification?.osTargetIds;
    if (singleOsId !== undefined) {
      addError(
        errors,
        operatingSystemIds.has(singleOsId),
        `${entry.id ?? "Unknown hardware"} references unknown operating system ${singleOsId}.`,
      );
    }
    if (multipleOsIds !== undefined) {
      addError(
        errors,
        Array.isArray(multipleOsIds) && multipleOsIds.length > 0,
        `${entry.id ?? "Unknown hardware"} needs non-empty osTargetIds.`,
      );
      for (const osId of Array.isArray(multipleOsIds) ? multipleOsIds : []) {
        addError(
          errors,
          operatingSystemIds.has(osId),
          `${entry.id ?? "Unknown hardware"} references unknown operating system ${osId}.`,
        );
      }
    }
  }
  for (const entry of executionTargets) {
    const hardwareTargetIds = entry.hardwareTargetIds;
    const operatingSystemTargetIds = entry.operatingSystemTargetIds;
    addError(
      errors,
      Array.isArray(hardwareTargetIds),
      `${entry.id ?? "Unknown execution target"} needs hardwareTargetIds.`,
    );
    addError(
      errors,
      Array.isArray(operatingSystemTargetIds) && operatingSystemTargetIds.length > 0,
      `${entry.id ?? "Unknown execution target"} needs operatingSystemTargetIds.`,
    );
    addError(
      errors,
      entry.targetPriority !== "required" ||
        (Array.isArray(hardwareTargetIds) && hardwareTargetIds.length > 0),
      `${entry.id ?? "Unknown execution target"} requires a hardware target.`,
    );
    for (const hardwareId of Array.isArray(hardwareTargetIds) ? hardwareTargetIds : []) {
      addError(
        errors,
        hardwareIds.has(hardwareId),
        `${entry.id ?? "Unknown execution target"} references unknown hardware ${hardwareId}.`,
      );
    }
    for (const osId of Array.isArray(operatingSystemTargetIds) ? operatingSystemTargetIds : []) {
      addError(
        errors,
        operatingSystemIds.has(osId),
        `${entry.id ?? "Unknown execution target"} references unknown operating system ${osId}.`,
      );
    }
  }
  const windowsReference = hardware.find(({ id }) => id === "HW-WIN-REF")?.specification;
  addError(
    errors,
    windowsReference?.cpuModel === "Intel Core i5-12400" &&
      windowsReference?.cpuTopology === "6 cores / 12 threads" &&
      windowsReference?.memory === "8 GiB dual-channel DDR4-3200" &&
      windowsReference?.storage ===
        "Samsung 970 EVO Plus 500 GB NVMe SSD with at least 20 GiB free" &&
      isNonEmptyText(windowsReference?.powerProfile),
    "HW-WIN-REF must retain the reproducible reference configuration.",
  );
  const macReference = hardware.find(({ id }) => id === "HW-MAC-REF")?.specification;
  addError(
    errors,
    macReference?.model === "Mac mini (M1, 2020)" &&
      macReference?.cpuModel === "Apple M1" &&
      macReference?.memory === "8 GiB unified memory" &&
      macReference?.storage === "256 GB internal SSD with at least 20 GiB free" &&
      isNonEmptyText(macReference?.powerProfile),
    "HW-MAC-REF must retain the reproducible reference configuration.",
  );
  const iosReference = hardware.find(({ id }) => id === "HW-IOS-REF")?.specification;
  addError(
    errors,
    iosReference?.model === "iPhone 11 (2019), 64 GB" &&
      iosReference?.cpuModel === "Apple A13 Bionic" &&
      iosReference?.osTargetId === "OS-IOS-26" &&
      isNonEmptyText(iosReference?.powerProfile),
    "HW-IOS-REF must retain the reproducible reference configuration.",
  );
  const androidReference = hardware.find(({ id }) => id === "HW-ANDROID-REF")?.specification;
  addError(
    errors,
    androidReference?.model === "Google Pixel 9, 128 GB" &&
      androidReference?.cpuModel === "Google Tensor G4" &&
      androidReference?.memory === "12 GB RAM" &&
      androidReference?.osTargetId === "OS-ANDROID-17" &&
      isNonEmptyText(androidReference?.powerProfile),
    "HW-ANDROID-REF must retain the reproducible reference configuration.",
  );
  const localHardware = hardware.find(({ id }) => id === "HW-LOCAL-DIAG");
  addError(
    errors,
    localHardware?.targetPriority === "diagnostic" &&
      localHardware?.availability === "available-diagnostic",
    "The Windows 10 local host must remain diagnostic-only.",
  );
  addError(
    errors,
    new Set(executionTargets.map(({ surface }) => surface)).size >= 3,
    "Reference matrix must cover web, desktop, and extension surfaces.",
  );

  const browserVersions = record.browserBaseline?.versions ?? [];
  const expectedBrowserFamilies = ["Chrome/Chromium", "Microsoft Edge", "Firefox", "Safari"];
  const actualBrowserFamilies = new Set(browserVersions.map(({ family }) => family));
  addError(
    errors,
    browserVersions.length === expectedBrowserFamilies.length &&
      actualBrowserFamilies.size === expectedBrowserFamilies.length &&
      expectedBrowserFamilies.every((family) => actualBrowserFamilies.has(family)),
    "Browser baseline must record Chromium, Edge, Firefox, and Safari families.",
  );
  for (const browser of browserVersions) {
    addError(
      errors,
      isNonEmptyText(browser.current),
      `${browser.family ?? "Browser"} needs current.`,
    );
    addError(
      errors,
      isNonEmptyText(browser.previous),
      `${browser.family ?? "Browser"} needs previous.`,
    );
  }
  const safariCurrent = executionTargets.find(({ id }) => id === "WEB-SAF-N");
  addError(
    errors,
    safariCurrent?.environment?.includes("Safari 26.6.1 on OS-MAC-SEQUOIA") &&
      safariCurrent?.hardwareTargetIds?.length === 1 &&
      safariCurrent.hardwareTargetIds[0] === "HW-MAC-REF" &&
      safariCurrent?.operatingSystemTargetIds?.length === 1 &&
      safariCurrent.operatingSystemTargetIds[0] === "OS-MAC-SEQUOIA",
    "WEB-SAF-N must bind Safari 26.6.1 to the Sequoia reference runner.",
  );
  const safariPrevious = executionTargets.find(({ id }) => id === "WEB-SAF-N1");
  addError(
    errors,
    safariPrevious?.environment?.includes("Safari 18.6") &&
      safariPrevious?.operatingSystemTargetIds?.length === 1 &&
      safariPrevious.operatingSystemTargetIds[0] === "OS-MAC-SONOMA-18",
    "WEB-SAF-N1 must bind Safari 18.6 to the historical Sonoma runner.",
  );
  for (const [id, hardwareId, operatingSystemId] of [
    ["MOBILE-IOS-PWA", "HW-IOS-REF", "OS-IOS-26"],
    ["MOBILE-ANDROID-PWA", "HW-ANDROID-REF", "OS-ANDROID-17"],
  ]) {
    const target = executionTargets.find((entry) => entry.id === id);
    addError(
      errors,
      target?.surface === "mobile-pwa" &&
        target?.hardwareTargetIds?.length === 1 &&
        target.hardwareTargetIds[0] === hardwareId &&
        target?.operatingSystemTargetIds?.length === 1 &&
        target.operatingSystemTargetIds[0] === operatingSystemId &&
        Array.isArray(target?.scenarios) &&
        target.scenarios.length >= 5,
      `${id} must retain its physical-device PWA coverage.`,
    );
  }

  const accessibilityCases = record.accessibility?.cases ?? [];
  const viewports = record.accessibility?.viewports ?? [];
  uniqueIds(errors, accessibilityCases, "Accessibility case");
  uniqueIds(errors, viewports, "Viewport");
  requireIds(
    errors,
    accessibilityCases,
    [
      "A11Y-AXE",
      "A11Y-KEYBOARD",
      "A11Y-NVDA-EDGE",
      "A11Y-NVDA-FF",
      "A11Y-VOICEOVER-SAFARI",
      "A11Y-IOS-VOICEOVER",
      "A11Y-ANDROID-TALKBACK",
      "A11Y-DISPLAY",
      "A11Y-REFLOW",
      "A11Y-RESPONSIVE",
    ],
    "Accessibility case",
  );
  const talkBackCase = accessibilityCases.find(({ id }) => id === "A11Y-ANDROID-TALKBACK");
  addError(
    errors,
    talkBackCase?.method?.includes("Android Accessibility Suite/TalkBack version"),
    "Android accessibility evidence must record the exact TalkBack distribution version.",
  );
  addError(
    errors,
    viewports.length === 5,
    "Reference matrix must retain five responsive viewports.",
  );
  addError(
    errors,
    record.accessibility?.automatedChecksNeverEstablishConformance === true,
    "Reference matrix must state that automation alone does not establish conformance.",
  );

  const budgets = record.performance?.budgets ?? [];
  uniqueIds(errors, budgets, "Performance budget");
  requireIds(errors, budgets, ["PERF-UI", "PERF-WARM", "PERF-CAPTURE", "PERF-OFFLINE"], "Budget");
  const budgetById = new Map(budgets.map((entry) => [entry.id, entry]));
  for (const [id, value, unit] of [
    ["PERF-UI", 150, "ms"],
    ["PERF-WARM", 2000, "ms"],
    ["PERF-CAPTURE", 120, "s"],
    ["PERF-OFFLINE", 0, "requests"],
  ]) {
    const budget = budgetById.get(id);
    addError(
      errors,
      budget?.value === value && budget?.unit === unit,
      `${id} does not match the accepted design target.`,
    );
  }
  addError(
    errors,
    record.performance?.measurementProtocol?.interactionMeasuredIterations >= 50,
    "Interaction protocol requires at least 50 measured iterations.",
  );
  addError(
    errors,
    record.performance?.measurementProtocol?.warmStartRuns >= 20,
    "Warm-start protocol requires at least 20 runs.",
  );
  addError(
    errors,
    Array.isArray(record.sources) && record.sources.length > 0 && record.sources.every(isHttpsUrl),
    "Reference matrix needs official HTTPS sources.",
  );
  addError(
    errors,
    Array.isArray(record.resultManifestRequiredFields) &&
      record.resultManifestRequiredFields.length >= 8,
    "Reference matrix needs a complete result-manifest contract.",
  );
  return errors;
}

export async function loadFoundationRecords(repositoryRoot) {
  const [inventory, matrix, state] = await Promise.all([
    readJson(path.join(repositoryRoot, "docs", "proof", "foundation-dependency-inventory.json")),
    readJson(path.join(repositoryRoot, "docs", "testing", "reference-test-matrix.v1.json")),
    readFoundationState(repositoryRoot),
  ]);
  return { inventory, matrix, state };
}

async function runCli() {
  const repositoryRoot = path.resolve(process.argv[2] ?? process.cwd());
  const { inventory, matrix, state } = await loadFoundationRecords(repositoryRoot);
  const errors = [
    ...validateDependencyInventory(inventory, state),
    ...validateReferenceMatrix(matrix),
  ];
  if (errors.length > 0) {
    console.error(
      ["Foundation record validation failed:", ...errors.map((item) => `- ${item}`)].join("\n"),
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    `Foundation records passed for ${inventory.packages.length} direct dependencies, ${inventory.toolchains.length} toolchains, ${matrix.executionTargets.length} execution targets, and ${matrix.accessibility.cases.length} accessibility cases.`,
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) await runCli();
