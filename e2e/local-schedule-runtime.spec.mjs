import { readdir, readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import fixture from "../fixtures/scheduling/civil-time-v1.json" with { type: "json" };
import {
  inspectLocalScheduleRuntime,
  assertLocalScheduleRuntime,
} from "../tooling/browser-proofs/local-schedule-runtime.mjs";

for (const host of ["UTC", "America/Los_Angeles", "Asia/Tokyo"])
  test.describe(`production local schedule under ${host}`, () => {
    test.use({ timezoneId: host });
    test("runs frozen strict DST scenarios from the actual cached scheduling chunk without global patches", async ({
      page,
    }, testInfo) => {
      const assets = await readdir(new URL("../apps/web/dist/assets/", import.meta.url));
      const chunks = assets.filter((name) => /^local-schedule-[A-Za-z0-9_-]+\.js$/u.test(name));
      expect(chunks).toHaveLength(1);
      const chunk = chunks[0];
      const bytes = await readFile(new URL(`../apps/web/dist/assets/${chunk}`, import.meta.url));
      const serviceWorker = await readFile(
        new URL("../apps/web/dist/service-worker.js", import.meta.url),
        "utf8",
      );
      expect(serviceWorker).toContain(`assets/${chunk}`);
      await page.goto("/");
      const observed = await page.evaluate(inspectLocalScheduleRuntime, {
        moduleUrl: `/assets/${chunk}`,
        cases: fixture.cases,
        invalid: fixture.invalid,
      });
      const proof = assertLocalScheduleRuntime(observed, fixture);
      expect(observed.hostTimeZone).toBe(host);
      await testInfo.attach("production-local-schedule-runtime.json", {
        contentType: "application/json",
        body: JSON.stringify({
          ...proof,
          chunk,
          bytes: bytes.length,
          gzipBytes: gzipSync(bytes).length,
          serviceWorkerPrecached: true,
        }),
      });
    });
  });
