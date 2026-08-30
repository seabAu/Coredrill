/* global AbortSignal, fetch, setTimeout */

import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";

const firefoxPath = process.env["COREDRILL_FIREFOX_PATH"];
const expectedVersion = process.env["COREDRILL_EXPECTED_BROWSER_VERSION"];
const geckodriverPath = process.env["COREDRILL_GECKODRIVER_PATH"] ?? "geckodriver";
const appUrl = "http://127.0.0.1:4175";
const webdriverUrl = "http://127.0.0.1:4445";
const migrationVersions = (await readdir(new URL("../../migrations/", import.meta.url)))
  .map((fileName) => /^(\d{4})_[a-z0-9_]+\.sql$/u.exec(fileName)?.[1])
  .filter((value) => value !== undefined)
  .map(Number)
  .sort((left, right) => left - right);
if (
  migrationVersions.length === 0 ||
  migrationVersions.some((version, index) => version !== index + 1)
) {
  throw new Error("Reviewed SQL migration filenames must be a contiguous positive sequence.");
}
const expectedSchemaVersion = migrationVersions.at(-1);
if (expectedSchemaVersion === undefined) throw new Error("No reviewed SQL migrations were found.");

if (firefoxPath === undefined || firefoxPath.trim().length === 0) {
  throw new Error("COREDRILL_FIREFOX_PATH must name the reviewed Firefox binary.");
}

const start = (command, args) =>
  spawn(command, args, {
    detached: process.platform !== "win32",
    env: process.env,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

const forwardOutput = (child, label) => {
  child.stdout.on("data", (chunk) => process.stdout.write(`[${label}] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[${label}] ${chunk}`));
  child.on("error", (error) => console.error(`[${label}] process error:`, error));
};

const stop = (child) => {
  if (child.exitCode !== null || child.pid === undefined) return;
  try {
    if (process.platform === "win32") child.kill();
    else process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill();
  }
};

const waitForHttp = async (url, timeoutMs = 60_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
    } catch {
      // The local process has not started listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}.`);
};

const webdriver = async (path, method = "GET", body) => {
  const response = await fetch(`${webdriverUrl}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(60_000),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json();
  if (!response.ok || payload.value?.error !== undefined) {
    throw new Error(
      `WebDriver ${method} ${path} failed: ${JSON.stringify(payload.value ?? payload)}`,
    );
  }
  return payload.value;
};

const pnpmCli = process.env["npm_execpath"];
if (pnpmCli === undefined) throw new Error("The Firefox proof must be launched through pnpm.");
const vite = start(process.execPath, [
  pnpmCli,
  "--filter",
  "@coredrill/web",
  "dev",
  "--port",
  "4175",
  "--strictPort",
]);
const geckodriver = start(geckodriverPath, ["--host", "127.0.0.1", "--port", "4445"]);
forwardOutput(vite, "vite");
forwardOutput(geckodriver, "geckodriver");

let sessionId;
try {
  await Promise.all([waitForHttp(appUrl), waitForHttp(`${webdriverUrl}/status`)]);
  const session = await webdriver("/session", "POST", {
    capabilities: {
      alwaysMatch: {
        browserName: "firefox",
        "moz:firefoxOptions": {
          args: ["-headless"],
          binary: firefoxPath,
        },
      },
    },
  });
  sessionId = session.sessionId;
  const browserVersion = session.capabilities.browserVersion;
  if (typeof browserVersion !== "string") {
    throw new Error("Firefox WebDriver did not report its browser version.");
  }
  if (expectedVersion !== undefined && browserVersion !== expectedVersion) {
    throw new Error(`Expected Firefox ${expectedVersion}, received ${browserVersion}.`);
  }

  await webdriver(`/session/${sessionId}/url`, "POST", { url: appUrl });
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  await webdriver(`/session/${sessionId}/timeouts`, "POST", { script: 30_000 });
  const executeHarness = async (method, argument) => {
    console.info(`Firefox storage stage: ${method}`);
    const result = await webdriver(`/session/${sessionId}/execute/async`, "POST", {
      args: [method, argument ?? null],
      script: `
        const method = arguments[0];
        const argument = arguments[1];
        const done = arguments[arguments.length - 1];
        (async () => {
          const harness = globalThis.coredrillStorageSpike;
          if (!harness) throw new Error("Storage verification harness is unavailable.");
          return argument === null ? harness[method]() : harness[method](argument);
        })().then(
          (value) => done({ ok: true, value }),
          (error) => done({ ok: false, error: error instanceof Error ? error.message : String(error) })
        );
      `,
    });
    if (result?.ok !== true) {
      throw new Error(`Firefox storage stage ${method} failed: ${result?.error}`);
    }
    return result.value;
  };

  await executeHarness("delete");
  const opened = await executeHarness("openAndMigrate");
  const passiveStorageHealth = await executeHarness("storageHealth");
  const requestedStorageHealth = await executeHarness("requestPersistentStorage");
  const reminderNow = Date.UTC(2026, 7, 29, 12);
  const initialReminder = await executeHarness("getBrowserExportReminder", reminderNow);
  const snoozedReminder = await executeHarness("updateBrowserExportReminder", {
    action: "snooze",
    nowUnixMs: reminderNow,
  });
  await executeHarness("writeVault", {
    id: "0198d9d2-c2fd-7d5c-8a0f-485258c1eb9e",
    name: "Firefox compatibility vault",
    createdAt: "2026-08-24T09:20:00.000Z",
    lastOpenedAt: "2026-08-24T09:20:00.000Z",
  });
  await executeHarness("close");
  const reopened = await executeHarness("openAndMigrate", { expectedExisting: true });
  const persistedReminder = await executeHarness("getBrowserExportReminder", reminderNow);
  const rows = await executeHarness("listVaults");
  const portable = await executeHarness("exportPortable");
  const humanReadable = await executeHarness("exportHumanReadable", {
    generatedAt: "2026-08-29T22:30:00.000Z",
    vaultId: "0198d9d2-c2fd-7d5c-8a0f-485258c1eb9e",
  });
  const archiveRestore = await executeHarness("runPortableArchiveRestoreProof", {
    archiveId: "0198d9d2-c2fd-7d5c-8a0f-485258c1ebff",
    generatedAt: "2026-08-29T23:30:00.000Z",
    vaultId: "0198d9d2-c2fd-7d5c-8a0f-485258c1eb9e",
    previewName: "Firefox preview target",
    staleName: "Firefox stale target",
  });
  await executeHarness("delete");
  await executeHarness("restorePortable", portable);
  const restored = await executeHarness("listVaults");
  await executeHarness("delete");
  const repositoryContracts = await executeHarness("runPhase1RepositoryContracts");
  const archiveWriter = await executeHarness("runPortableArchiveWriterProof");
  const repositoryCases = repositoryContracts.manifest.caseNames;

  const proof = {
    appliedVersions: opened.appliedVersions,
    browserStoragePersistence: opened.diagnostics.persistence,
    browserStoragePersistenceBeforeRequest: passiveStorageHealth.persistence,
    browserStoragePersistenceAfterRequest: requestedStorageHealth.persistence,
    browserStorageQuota: requestedStorageHealth.quota,
    explicitPersistenceRequest: true,
    exportReminderPersisted: JSON.stringify(persistedReminder) === JSON.stringify(snoozedReminder),
    exportReminderState: persistedReminder.reminder.state,
    reopenedVersions: reopened.appliedVersions,
    restoredRows: restored.length,
    rows: rows.length,
    portableArchiveWriterSha256: archiveWriter.sha256,
    humanReadableDataFiles: humanReadable.dataFileCount,
    humanReadableDatasets: humanReadable.datasetCount,
    archiveRestoreConflict: archiveRestore.conflict,
    archiveRestoreCommitted: archiveRestore.committed,
    archiveRestoreCorruptionRejected: archiveRestore.corruptionRejected,
    archiveRestoreStaleRejected: archiveRestore.staleTargetRejected,
    repositoryContractCases: repositoryCases.length,
    repositoryContractSuite: repositoryContracts.run.suiteName,
    repositoryContractVersion: repositoryContracts.manifest.schemaVersion,
    schemaVersion: portable.schemaVersion,
    sha256: portable.sha256,
    sqlite: opened.diagnostics.details.find((detail) => detail.startsWith("sqlite-version:")),
    vfs: opened.diagnostics.details.includes("vfs:opfs-sahpool"),
    worker: opened.diagnostics.details.includes("thread:dedicated-worker"),
  };
  if (
    proof?.rows !== 1 ||
    proof.restoredRows !== 1 ||
    proof.repositoryContractCases !== 18 ||
    proof.humanReadableDataFiles !== 58 ||
    proof.humanReadableDatasets !== 29 ||
    humanReadable.csvFiles !== 29 ||
    humanReadable.jsonFiles !== 29 ||
    humanReadable.rowCount !== 2 ||
    humanReadable.sourceSchemaVersion !== expectedSchemaVersion ||
    archiveRestore.attachmentCount !== 0 ||
    archiveRestore.dataFileCount !== 58 ||
    archiveRestore.corruptionRejected !== true ||
    archiveRestore.corruptionPreservedTarget !== true ||
    archiveRestore.conflict !== "same_vault_replace" ||
    archiveRestore.requiredConfirmation !== "replace_same_vault" ||
    archiveRestore.previewPreservedTarget !== true ||
    archiveRestore.staleTargetRejected !== true ||
    archiveRestore.staleTargetPreserved !== true ||
    archiveRestore.committed !== true ||
    archiveRestore.restoredDatabaseMatchesArchive !== true ||
    archiveRestore.restoredVaultName !== "Firefox compatibility vault" ||
    archiveRestore.restoredDatabaseSha256 !== portable.sha256 ||
    archiveRestore.archiveByteLength <= portable.byteLength ||
    typeof archiveRestore.archiveSha256 !== "string" ||
    !/^[a-f0-9]{64}$/u.test(archiveRestore.archiveSha256) ||
    proof.repositoryContractSuite !== repositoryContracts.manifest.suiteName ||
    proof.repositoryContractVersion !== 3 ||
    proof.portableArchiveWriterSha256 !==
      "47b18f1854ae6a608cffb4753895afc0fead06f3399818326e61142579a5fcde" ||
    !Array.isArray(repositoryContracts.run.completedCases) ||
    repositoryContracts.run.completedCases.length !== repositoryCases.length ||
    repositoryContracts.run.completedCases.some(
      (caseName, index) => caseName !== repositoryCases[index],
    ) ||
    proof.schemaVersion !== expectedSchemaVersion ||
    proof.vfs !== true ||
    proof.worker !== true ||
    proof.explicitPersistenceRequest !== true ||
    initialReminder.reminder?.state !== "due" ||
    initialReminder.reminder?.reason !== "never-exported" ||
    proof.exportReminderPersisted !== true ||
    proof.exportReminderState !== "scheduled" ||
    !["denied", "error", "granted", "unsupported"].includes(
      proof.browserStoragePersistenceBeforeRequest,
    ) ||
    !["denied", "error", "granted", "unsupported"].includes(
      proof.browserStoragePersistenceAfterRequest,
    ) ||
    !["available", "low", "unknown"].includes(proof.browserStorageQuota) ||
    passiveStorageHealth.expectedDatabase !== "not-required" ||
    requestedStorageHealth.expectedDatabase !== "not-required" ||
    !Array.isArray(passiveStorageHealth.warnings) ||
    !Array.isArray(requestedStorageHealth.warnings) ||
    !Array.isArray(proof.appliedVersions) ||
    proof.appliedVersions.length !== expectedSchemaVersion ||
    proof.appliedVersions.some((version, index) => version !== index + 1) ||
    !Array.isArray(proof.reopenedVersions) ||
    proof.reopenedVersions.length !== 0 ||
    typeof proof.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/u.test(proof.sha256)
  ) {
    throw new Error(`Firefox returned an invalid storage proof: ${JSON.stringify(proof)}`);
  }
  console.info(
    `STG_FIREFOX_PROOF ${JSON.stringify({
      browser: browserVersion,
      ...proof,
    })}`,
  );
} finally {
  if (sessionId !== undefined) {
    await webdriver(`/session/${sessionId}`, "DELETE").catch(() => undefined);
  }
  stop(geckodriver);
  stop(vite);
}
