import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { expect, test } from "@playwright/test";

const fixture = JSON.parse(
  await readFile(new URL("../fixtures/storage/benchmark-profile.v1.json", import.meta.url), "utf8"),
);

const callBenchmark = (page, input) =>
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

test("benchmarks create, migrate, import, search, export, restore, and startup", async ({
  browser,
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  await page.goto("/");
  await page.waitForFunction(() => globalThis.coredrillStorageSpike !== undefined);

  const results = [];
  for (const profile of fixture.profiles) {
    const result = await callBenchmark(page, {
      descriptionBytesPerRecord: fixture.descriptionBytesPerRecord,
      fixtureId: fixture.fixtureId,
      profileId: profile.id,
      records: profile.records,
      seed: fixture.seed,
    });
    expect(result).toMatchObject({
      fixtureId: fixture.fixtureId,
      profileId: profile.id,
      records: profile.records,
    });
    expect(result.fixtureSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.byteLength).toBeGreaterThan(0);
    expect(result.metrics.search.rawMs).toHaveLength(50);
    expect(result.metrics.startup.rawMs).toHaveLength(20);
    expect(Object.values(result.metrics).every((metric) => metric.failures === 0)).toBe(true);
    results.push(result);
  }

  const report = {
    schemaVersion: 1,
    matrixId: "JW-TM-001",
    matrixVersion: "1.2.0",
    commitSha: process.env["COREDRILL_COMMIT_SHA"] ?? "unbound-local-run",
    dirtyWorktree: process.env["COREDRILL_DIRTY_WORKTREE"] === "true",
    lockfileSha256: process.env["COREDRILL_LOCKFILE_SHA256"] ?? "unbound-local-run",
    hardwareTargetId: process.env["COREDRILL_HARDWARE_TARGET_ID"] ?? "unbound-local-run",
    operatingSystemTargetId:
      process.env["COREDRILL_OPERATING_SYSTEM_TARGET_ID"] ?? "unbound-local-run",
    reviewer: process.env["COREDRILL_BENCHMARK_REVIEWER"] ?? "automated-unreviewed",
    browser: browser.version(),
    engine: browser.browserType().name(),
    headless: true,
    appBuild: {
      sqlite: "3.53.0",
      sqlitePackage: "3.53.0-build1",
      vite: "8.2.2",
    },
    fixture,
    results,
  };
  const json = `${JSON.stringify(report, null, 2)}\n`;
  await testInfo.attach("storage-benchmark", {
    body: Buffer.from(json),
    contentType: "application/json",
  });

  const output = process.env["COREDRILL_BENCHMARK_OUTPUT"];
  if (output !== undefined) {
    const requiredBindings = [
      report.commitSha,
      report.lockfileSha256,
      report.hardwareTargetId,
      report.operatingSystemTargetId,
      report.reviewer,
    ];
    if (
      requiredBindings.some((value) => value.includes("unbound") || value.includes("unreviewed"))
    ) {
      throw new Error(
        "A persisted benchmark report requires commit, lockfile, target, and reviewer bindings.",
      );
    }
    const target = resolve(output);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, json, "utf8");
  }

  console.info(
    `STG_BENCHMARK_PROOF ${JSON.stringify({
      browser: report.browser,
      profiles: results.map((result) => ({
        bytes: result.byteLength,
        id: result.profileId,
        records: result.records,
        searchP95Ms: result.metrics.search.p95Ms,
        startupP95Ms: result.metrics.startup.p95Ms,
      })),
    })}`,
  );
});

test("benchmarks production FTS5 and normalized-token job search", async ({
  browser,
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  await page.goto("/");
  await page.waitForFunction(() => globalThis.coredrillStorageSpike !== undefined);

  const results = [];
  for (const profile of fixture.profiles) {
    const result = await callJobSearchBenchmark(page, {
      descriptionBytesPerRecord: fixture.descriptionBytesPerRecord,
      fixtureId: fixture.fixtureId,
      profileId: profile.id,
      records: profile.records,
      seed: fixture.seed,
    });
    expect(result).toMatchObject({
      fixtureId: fixture.fixtureId,
      profileId: profile.id,
      records: profile.records,
      searchModes: ["fts5", "normalized-token"],
    });
    expect(result.fixtureSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.byteLength).toBeGreaterThan(0);
    expect(result.metrics.ftsSearch.rawMs).toHaveLength(50);
    expect(result.metrics.fallbackSearch.rawMs).toHaveLength(50);
    expect(Object.values(result.metrics).every((metric) => metric.failures === 0)).toBe(true);
    results.push(result);
  }

  const report = {
    schemaVersion: 1,
    matrixId: "JW-DB-SEARCH-001",
    matrixVersion: "1.0.0",
    commitSha: process.env["COREDRILL_COMMIT_SHA"] ?? "unbound-local-run",
    dirtyWorktree: process.env["COREDRILL_DIRTY_WORKTREE"] === "true",
    lockfileSha256: process.env["COREDRILL_LOCKFILE_SHA256"] ?? "unbound-local-run",
    hardwareTargetId: process.env["COREDRILL_HARDWARE_TARGET_ID"] ?? "unbound-local-run",
    operatingSystemTargetId:
      process.env["COREDRILL_OPERATING_SYSTEM_TARGET_ID"] ?? "unbound-local-run",
    reviewer: process.env["COREDRILL_BENCHMARK_REVIEWER"] ?? "automated-unreviewed",
    browser: browser.version(),
    engine: browser.browserType().name(),
    headless: true,
    appBuild: {
      schemaVersion: 84,
      sqlite: "3.53.0",
      sqlitePackage: "3.53.0-build1",
      vite: "8.2.2",
    },
    fixture,
    results,
  };
  const json = `${JSON.stringify(report, null, 2)}\n`;
  await testInfo.attach("job-search-benchmark", {
    body: Buffer.from(json),
    contentType: "application/json",
  });

  const output = process.env["COREDRILL_JOB_SEARCH_BENCHMARK_OUTPUT"];
  if (output !== undefined) {
    const requiredBindings = [
      report.commitSha,
      report.lockfileSha256,
      report.hardwareTargetId,
      report.operatingSystemTargetId,
      report.reviewer,
    ];
    if (
      requiredBindings.some((value) => value.includes("unbound") || value.includes("unreviewed"))
    ) {
      throw new Error(
        "A persisted benchmark report requires commit, lockfile, target, and reviewer bindings.",
      );
    }
    const target = resolve(output);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, json, "utf8");
  }

  console.info(
    `DB_SEARCH_BENCHMARK_PROOF ${JSON.stringify({
      browser: report.browser,
      profiles: results.map((result) => ({
        fallbackP95Ms: result.metrics.fallbackSearch.p95Ms,
        ftsInitializeMs: result.metrics.ftsInitialize.p95Ms,
        ftsP95Ms: result.metrics.ftsSearch.p95Ms,
        id: result.profileId,
        records: result.records,
      })),
    })}`,
  );
});
