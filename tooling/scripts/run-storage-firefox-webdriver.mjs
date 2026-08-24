/* global AbortSignal, fetch, setTimeout */

import { spawn } from "node:child_process";

const firefoxPath = process.env["COREDRILL_FIREFOX_PATH"];
const expectedVersion = process.env["COREDRILL_EXPECTED_BROWSER_VERSION"];
const geckodriverPath = process.env["COREDRILL_GECKODRIVER_PATH"] ?? "geckodriver";
const appUrl = "http://127.0.0.1:4175";
const webdriverUrl = "http://127.0.0.1:4445";

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
  await executeHarness("writeVault", {
    id: "0198d9d2-c2fd-7d5c-8a0f-485258c1eb9e",
    name: "Firefox compatibility vault",
    createdAt: "2026-08-24T09:20:00.000Z",
    lastOpenedAt: "2026-08-24T09:20:00.000Z",
  });
  await executeHarness("close");
  const reopened = await executeHarness("openAndMigrate", { expectedExisting: true });
  const rows = await executeHarness("listVaults");
  const portable = await executeHarness("exportPortable");
  await executeHarness("delete");
  await executeHarness("restorePortable", portable);
  const restored = await executeHarness("listVaults");
  await executeHarness("delete");

  const proof = {
    appliedVersions: opened.appliedVersions,
    browserStoragePersistence: opened.diagnostics.persistence,
    reopenedVersions: reopened.appliedVersions,
    restoredRows: restored.length,
    rows: rows.length,
    schemaVersion: portable.schemaVersion,
    sha256: portable.sha256,
    sqlite: opened.diagnostics.details.find((detail) => detail.startsWith("sqlite-version:")),
    vfs: opened.diagnostics.details.includes("vfs:opfs-sahpool"),
    worker: opened.diagnostics.details.includes("thread:dedicated-worker"),
  };
  if (
    proof?.rows !== 1 ||
    proof.restoredRows !== 1 ||
    proof.schemaVersion !== 2 ||
    proof.vfs !== true ||
    proof.worker !== true ||
    !Array.isArray(proof.appliedVersions) ||
    proof.appliedVersions.length !== 2 ||
    proof.appliedVersions[0] !== 1 ||
    proof.appliedVersions[1] !== 2 ||
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
