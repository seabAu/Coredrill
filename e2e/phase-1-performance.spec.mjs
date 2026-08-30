/* global HTMLButtonElement, document, performance, requestAnimationFrame, setTimeout */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { expect, test } from "@playwright/test";

const fixtureSource = await readFile(
  new URL("../fixtures/storage/benchmark-profile.v1.json", import.meta.url),
  "utf8",
);
const fixture = JSON.parse(fixtureSource);
const referenceProfile = fixture.profiles.find(({ id }) => id === "DATA-REFERENCE");

if (referenceProfile?.records !== 2_000) {
  throw new Error("The accepted DATA-REFERENCE profile must contain exactly 2,000 jobs.");
}

const INTERACTION_WARMUPS = 5;
const INTERACTION_RUNS = 50;
const STARTUP_WARMUPS = 5;
const STARTUP_RUNS = 20;
const UI_BUDGET_MS = 150;
const WARM_START_BUDGET_MS = 2_000;

const roundMilliseconds = (value) => Math.round(value * 1_000) / 1_000;

const percentile = (sorted, ratio) => {
  const index = Math.max(0, Math.ceil(sorted.length * ratio) - 1);
  return sorted[index] ?? 0;
};

const metric = (raw, failures = 0) => {
  const rounded = raw.map(roundMilliseconds);
  const sorted = [...rounded].sort((left, right) => left - right);
  return Object.freeze({
    failures,
    maximumMs: sorted.at(-1) ?? 0,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    rawMs: Object.freeze(rounded),
  });
};

const callStorageBenchmark = (page, input) =>
  page.evaluate(async (value) => {
    const harness = globalThis.coredrillStorageSpike;
    if (harness === undefined) throw new Error("Storage verification harness is unavailable.");
    return harness.runBenchmark(value);
  }, input);

const callJobSearchBenchmark = (page, input) =>
  page.evaluate(async (value) => {
    const harness = globalThis.coredrillStorageSpike;
    if (harness === undefined) throw new Error("Storage verification harness is unavailable.");
    return harness.runJobSearchBenchmark(value);
  }, input);

const measureWarmShellStartup = async (page) => {
  const raw = [];

  for (let run = 0; run < STARTUP_WARMUPS + STARTUP_RUNS; run += 1) {
    await page.goto("/app-shell.html?board=reference&table=large", {
      waitUntil: "domcontentloaded",
    });
    const duration = await page.evaluate(async () => {
      const deadline = performance.now() + 10_000;
      while (
        (globalThis.coredrillAppShell === undefined ||
          document.querySelector('[data-testid="page-title"]') === null) &&
        performance.now() < deadline
      ) {
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
      if (
        globalThis.coredrillAppShell === undefined ||
        document.querySelector('[data-testid="page-title"]') === null
      ) {
        throw new Error("The local shell did not become usable before the startup deadline.");
      }
      await new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      });
      return performance.now();
    });
    if (run >= STARTUP_WARMUPS) raw.push(duration);
  }

  return metric(raw);
};

const measurePipelineProjections = (page) =>
  page.evaluate(
    async ({ runs, warmups }) => {
      const round = (value) => Math.round(value * 1_000) / 1_000;
      const boardRaw = [];
      const tableRaw = [];

      const switchTo = async (target) => {
        const button = document.querySelector(`[data-pipeline-view-option="${target}"]`);
        if (!(button instanceof HTMLButtonElement)) {
          throw new Error(`The ${target} presentation control is unavailable.`);
        }
        const selector = `[data-testid="pipeline-${target}"]`;
        if (document.querySelector(selector) !== null) {
          throw new Error(`The ${target} presentation was already active before measurement.`);
        }

        const started = performance.now();
        button.click();
        const deadline = started + 5_000;
        while (
          (document.querySelector(selector) === null ||
            button.getAttribute("aria-pressed") !== "true") &&
          performance.now() < deadline
        ) {
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
        if (
          document.querySelector(selector) === null ||
          button.getAttribute("aria-pressed") !== "true"
        ) {
          throw new Error(`The ${target} presentation did not render before the deadline.`);
        }
        await new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        });
        return round(performance.now() - started);
      };

      for (let run = 0; run < warmups + runs; run += 1) {
        const boardMs = await switchTo("board");
        if (run >= warmups) boardRaw.push(boardMs);

        const tableMs = await switchTo("table");
        if (run >= warmups) tableRaw.push(tableMs);
      }

      return { boardFailures: 0, boardRaw, tableFailures: 0, tableRaw };
    },
    { runs: INTERACTION_RUNS, warmups: INTERACTION_WARMUPS },
  );

const boundValue = (name, fallback) => process.env[name] ?? fallback;

test("records Phase 1 reference-data startup, query, board, and table performance", async ({
  browser,
  page,
}, testInfo) => {
  test.setTimeout(300_000);
  const benchmarkInput = {
    descriptionBytesPerRecord: fixture.descriptionBytesPerRecord,
    fixtureId: fixture.fixtureId,
    profileId: referenceProfile.id,
    records: referenceProfile.records,
    seed: fixture.seed,
  };

  await page.goto("/");
  await page.waitForFunction(() => globalThis.coredrillStorageSpike !== undefined);
  const storage = await callStorageBenchmark(page, benchmarkInput);
  const query = await callJobSearchBenchmark(page, benchmarkInput);

  expect(storage.metrics.startup.rawMs).toHaveLength(STARTUP_RUNS);
  expect(query.metrics.ftsSearch.rawMs).toHaveLength(INTERACTION_RUNS);
  expect(storage.fixtureSha256).toBe(query.fixtureSha256);

  const shellWarmStart = await measureWarmShellStartup(page);
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Pipeline" })
    .click();

  const table = page.getByTestId("pipeline-table");
  await expect(
    table.getByRole("region", { name: "Pipeline Table for Active search" }),
  ).toHaveAttribute("data-table-total", "2000");

  const projectionRaw = await measurePipelineProjections(page);
  const boardProjection = metric(projectionRaw.boardRaw, projectionRaw.boardFailures);
  const tableProjection = metric(projectionRaw.tableRaw, projectionRaw.tableFailures);

  expect(boardProjection.rawMs).toHaveLength(INTERACTION_RUNS);
  expect(tableProjection.rawMs).toHaveLength(INTERACTION_RUNS);
  expect(shellWarmStart.rawMs).toHaveLength(STARTUP_RUNS);
  expect(
    Object.values({ boardProjection, shellWarmStart, tableProjection }).every(
      ({ failures }) => failures === 0,
    ),
  ).toBe(true);

  await page.getByRole("button", { name: "Board", exact: true }).click();
  await expect(page.getByTestId("pipeline-board")).toBeVisible();
  const boardTotal = await page.getByTestId("pipeline-board").getAttribute("data-board-total");
  expect(boardTotal).toBe("2000");
  await page.getByRole("button", { name: "Table", exact: true }).click();
  await expect(page.getByTestId("pipeline-table")).toBeVisible();

  const targetConformant = process.env["COREDRILL_PERFORMANCE_TARGET_CONFORMANT"] === "true";
  const metrics = Object.freeze({
    boardProjection,
    durableStorageStartup: storage.metrics.startup,
    productionQuery: query.metrics.ftsSearch,
    shellWarmStart,
    tableProjection,
  });
  const budgetComparisons = Object.freeze([
    Object.freeze({
      budgetId: "PERF-WARM",
      measurement: "shellWarmStart",
      operator: "<",
      passed: shellWarmStart.p95Ms < WARM_START_BUDGET_MS,
      p95Ms: shellWarmStart.p95Ms,
      targetMs: WARM_START_BUDGET_MS,
    }),
    ...["productionQuery", "boardProjection", "tableProjection"].map((measurement) =>
      Object.freeze({
        budgetId: "PERF-UI",
        measurement,
        operator: "<",
        passed: metrics[measurement].p95Ms < UI_BUDGET_MS,
        p95Ms: metrics[measurement].p95Ms,
        targetMs: UI_BUDGET_MS,
      }),
    ),
  ]);
  const acceptedBudgetsPass = budgetComparisons.every(({ passed }) => passed);
  const targetLimitation = boundValue(
    "COREDRILL_PERFORMANCE_TARGET_LIMITATION",
    "Automated diagnostic execution is not the required HW-WIN-REF and OS-WIN11-25H2 release target.",
  );
  const report = {
    schemaVersion: 1,
    proofId: "Q1-001-PHASE-1-PERFORMANCE",
    matrixId: "JW-TM-001",
    matrixVersion: "1.2.0",
    commitSha: boundValue("COREDRILL_COMMIT_SHA", "unbound-local-run"),
    dirtyWorktree: process.env["COREDRILL_DIRTY_WORKTREE"] === "true",
    lockfileSha256: boundValue("COREDRILL_LOCKFILE_SHA256", "unbound-local-run"),
    hardwareTargetId: boundValue("COREDRILL_HARDWARE_TARGET_ID", "unbound-local-run"),
    operatingSystemTargetId: boundValue(
      "COREDRILL_OPERATING_SYSTEM_TARGET_ID",
      "unbound-local-run",
    ),
    reviewer: boundValue("COREDRILL_BENCHMARK_REVIEWER", "automated-unreviewed"),
    targetConformant,
    targetLimitation: targetConformant ? null : targetLimitation,
    result: targetConformant ? (acceptedBudgetsPass ? "passed" : "failed") : "diagnostic-only",
    browser: browser.version(),
    engine: browser.browserType().name(),
    headless: true,
    productionBuild: true,
    viewport: { height: 900, width: 1440 },
    fixture: {
      ...benchmarkInput,
      definitionSha256: createHash("sha256").update(fixtureSource).digest("hex"),
      contentSha256: storage.fixtureSha256,
      boardJobs: 2_000,
      tableJobs: 2_000,
    },
    protocol: {
      interactionRuns: INTERACTION_RUNS,
      interactionWarmupsDiscarded: INTERACTION_WARMUPS,
      startupRuns: STARTUP_RUNS,
      startupWarmupsDiscarded: STARTUP_WARMUPS,
      projectionReadyPoint: "active presentation committed plus two animation frames",
      startupReadyPoint: "local shell catalog and page title committed plus two animation frames",
    },
    metrics,
    budgetComparisons,
  };
  const json = `${JSON.stringify(report, null, 2)}\n`;

  await testInfo.attach("phase-1-performance", {
    body: Buffer.from(json),
    contentType: "application/json",
  });

  const output = process.env["COREDRILL_PERFORMANCE_OUTPUT"];
  if (output !== undefined) {
    const requiredBindings = [
      report.commitSha,
      report.lockfileSha256,
      report.hardwareTargetId,
      report.operatingSystemTargetId,
      report.reviewer,
    ];
    if (
      requiredBindings.some((value) => value.includes("unbound") || value.includes("unreviewed")) ||
      report.dirtyWorktree
    ) {
      throw new Error(
        "A persisted performance report requires a clean commit plus lockfile, target, OS, and reviewer bindings.",
      );
    }
    if (
      targetConformant &&
      (report.hardwareTargetId !== "HW-WIN-REF" ||
        report.operatingSystemTargetId !== "OS-WIN11-25H2")
    ) {
      throw new Error(
        "A conformant report must run on the accepted HW-WIN-REF and OS-WIN11-25H2 targets.",
      );
    }
    const target = resolve(output);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, json, "utf8");
  }

  console.info(
    `Q1_PERFORMANCE_PROOF ${JSON.stringify({
      boardP95Ms: boardProjection.p95Ms,
      browser: report.browser,
      productionQueryP95Ms: query.metrics.ftsSearch.p95Ms,
      result: report.result,
      shellWarmStartP95Ms: shellWarmStart.p95Ms,
      tableP95Ms: tableProjection.p95Ms,
    })}`,
  );

  if (targetConformant) expect(acceptedBudgetsPass).toBe(true);
});
