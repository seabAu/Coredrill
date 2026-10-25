import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

export const installNetworkInteractionsProbe = (page) =>
  page.evaluate(() => {
    const root = globalThis.coredrillStorageSpike,
      actual = root.networkInteractions;
    const probe = {
      pages: [],
      summaries: [],
      failPage: false,
      failSummary: false,
      holdPage: false,
      holdSummary: false,
      release: null,
    };
    globalThis.__networkInteractionsProbe = probe;
    const wrap = (kind) => async (input) => {
      const summary = kind === "summary",
        failKey = summary ? "failSummary" : "failPage",
        holdKey = summary ? "holdSummary" : "holdPage";
      // Capture the decision at request entry; a late earlier request cannot consume the next fault.
      const fail = probe[failKey],
        hold = probe[holdKey];
      probe[failKey] = false;
      probe[holdKey] = false;
      probe[summary ? "summaries" : "pages"].push(JSON.stringify(input));
      const result = await actual[kind](input);
      if (hold)
        await new Promise((resolve) => {
          probe.release = resolve;
        });
      if (fail)
        return {
          ok: false,
          error: { code: "unavailable", retryable: true, message: "PRIVATE Network adapter path" },
        };
      return result;
    };
    globalThis.coredrillStorageSpike = {
      ...root,
      networkInteractions: { page: wrap("page"), summary: wrap("summary") },
    };
  });
const ids = (panel) =>
  panel
    .locator("[data-network-interaction]")
    .evaluateAll((nodes) => nodes.map((node) => node.dataset.networkInteraction));
const release = (page) =>
  page.evaluate(() => {
    globalThis.__networkInteractionsProbe.release();
    globalThis.__networkInteractionsProbe.release = null;
  });
const arm = (page, key) =>
  page.evaluate((name) => {
    globalThis.__networkInteractionsProbe[name] = true;
  }, key);
const waitHeld = (page) =>
  page.waitForFunction(() => typeof globalThis.__networkInteractionsProbe.release === "function");
const sameLastRequests = (page, key) =>
  page.evaluate((name) => {
    const calls = globalThis.__networkInteractionsProbe[name];
    return calls.at(-1) === calls.at(-2);
  }, key);

/** Browser and actual-Rust runtime share the same normal controls and real database results. */
export const exerciseNetworkInteractions = async (page, fixture, testInfo) => {
  const primary = page.getByRole("navigation", { name: "Primary", exact: true });
  await primary.getByRole("link", { name: "Network", exact: true }).click();
  await installNetworkInteractionsProbe(page);
  const network = page.getByRole("region", { name: "Stored Network", exact: true });
  await arm(page, "holdPage");
  await network.getByRole("button", { name: "Interactions", exact: true }).click();
  const panel = page.getByRole("region", {
    name: "Stored Network interaction history",
    exact: true,
  });
  await waitHeld(page);
  await expect(panel).toContainText("Reading recorded Network history");
  await expect(panel).not.toContainText("No recorded interactions for jobs");
  await expect(
    panel.getByRole("button", { name: "First Network interactions", exact: true }),
  ).toBeDisabled();
  await release(page);
  await expect.poll(() => ids(panel)).toEqual(fixture.networkFirstIds);
  await expect(panel).toContainText("Current job: Synthetic Network history job 700");
  await expect(panel).toContainText("Synthetic Network history company (company record archived)");
  await expect(panel).not.toContainText("PRIVATE");
  expect(await page.evaluate(() => globalThis.__networkInteractionsProbe.summaries.length)).toBe(0);
  const before = await page.evaluate(
    async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
  );
  await arm(page, "failPage");
  await panel.getByRole("button", { name: "Next Network interactions", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("could not be read");
  await expect.poll(() => ids(panel)).toEqual(fixture.networkFirstIds);
  await expect(panel.getByRole("button", { name: /^Read summary for/u }).first()).toBeDisabled();
  await panel.getByRole("button", { name: "Retry Network history page", exact: true }).click();
  await expect.poll(() => ids(panel)).toEqual(fixture.networkSecondIds);
  expect(await sameLastRequests(page, "pages")).toBe(true);
  await panel.getByRole("button", { name: "First Network interactions", exact: true }).click();
  await expect.poll(() => ids(panel)).toEqual(fixture.networkFirstIds);
  const open = panel.locator(`[data-network-summary-open="${fixture.networkFirstIds[0]}"]`);
  await arm(page, "holdSummary");
  await open.focus();
  await open.press("Enter");
  await waitHeld(page);
  await expect(open).toBeDisabled();
  await expect(
    panel.getByRole("button", { name: "Close Network summary", exact: true }),
  ).toBeDisabled();
  expect(await page.evaluate(() => globalThis.__networkInteractionsProbe.summaries.length)).toBe(1);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await release(page);
  const summary = panel.getByRole("region", {
    name: "Selected Network interaction summary",
    exact: true,
  });
  await expect(
    summary.getByRole("heading", { name: "Selected recorded summary", exact: true }),
  ).toBeFocused();
  await expect(summary).toContainText("Partial retained summary");
  const prefix = await summary.locator("p.cd-company-literal").textContent();
  await arm(page, "failSummary");
  await summary.getByRole("button", { name: "Next Network summary part", exact: true }).click();
  await expect(summary.getByRole("alert")).toContainText("could not be confirmed");
  expect(await summary.locator("p.cd-company-literal").textContent()).toBe(prefix);
  await summary.getByRole("button", { name: "Retry Network summary part", exact: true }).click();
  await expect(summary).toContainText("Complete retained summary read.");
  expect(await sameLastRequests(page, "summaries")).toBe(true);
  expect(await summary.locator("p.cd-company-literal").textContent()).toBe(fixture.networkSummary);
  const body = summary.getByRole("region", { name: "Network summary body", exact: true });
  await body.focus();
  await body.press("End");
  await expect.poll(() => body.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  expect((await body.boundingBox()).height).toBeLessThanOrEqual(384);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
  expect(
    (
      await new AxeBuilder({ page })
        .include('[aria-label="Stored Network interaction history"]')
        .analyze()
    ).violations,
  ).toEqual([]);
  await panel.screenshot({ path: testInfo.outputPath("network-interactions-320.png") });
  await summary.screenshot({ path: testInfo.outputPath("network-summary-320.png") });
  await summary.getByRole("button", { name: "Close Network summary", exact: true }).click();
  // Reflow resolves the original record's current owned opener by identity.
  await expect(open).toBeFocused();
  await panel.locator(`[data-network-summary-open="${fixture.networkFirstIds[1]}"]`).click();
  await expect(summary).toContainText("Retained empty summary.");
  await summary.getByRole("button", { name: "Close Network summary", exact: true }).click();
  await panel.getByLabel("Include interactions for archived jobs", { exact: true }).check();
  await expect.poll(() => ids(panel)).toEqual(fixture.networkFirstIds);
  await panel.getByRole("button", { name: "Next Network interactions", exact: true }).click();
  await expect.poll(() => ids(panel)).toEqual(fixture.networkSecondIds);
  await panel.getByRole("button", { name: "Next Network interactions", exact: true }).click();
  await expect(
    panel.locator(`[data-network-interaction="${fixture.networkArchivedId}"]`),
  ).toBeVisible();
  await expect(
    panel.locator(`[data-network-interaction="${fixture.networkUnknownCompanyId}"]`),
  ).toContainText("no current company link recorded");
  expect(
    await page.evaluate(
      async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
    ),
  ).toBe(before);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ forcedColors: "none", reducedMotion: "no-preference" });
  await page.reload();
  await expect.poll(() => ids(panel)).toEqual(fixture.networkFirstIds);
  await expect(
    panel.getByLabel("Include interactions for archived jobs", { exact: true }),
  ).not.toBeChecked();
  // A late original summary must not publish or move focus into a retired tab.
  await network.getByRole("button", { name: "Companies", exact: true }).click();
  await installNetworkInteractionsProbe(page);
  await network.getByRole("button", { name: "Interactions", exact: true }).click();
  await expect.poll(() => ids(panel)).toEqual(fixture.networkFirstIds);
  await arm(page, "holdSummary");
  await open.click();
  await waitHeld(page);
  await network.getByRole("button", { name: "Companies", exact: true }).click();
  const deliberate = network.getByRole("button", { name: "Companies", exact: true });
  await deliberate.focus();
  await release(page);
  await expect(panel).toHaveCount(0);
  await expect(deliberate).toBeFocused();
  // Visit an explicitly selected contact first; the Network entry must not infer that contact.
  await network.getByRole("button", { name: "Contacts", exact: true }).click();
  await network.getByRole("button", { name: "View contact details", exact: true }).first().click();
  await network.getByRole("button", { name: "Interactions", exact: true }).click();
  const entry = page.getByRole("region", { name: "Record local interaction", exact: true });
  await expect(entry.getByRole("button", { name: "New interaction", exact: true })).toBeDisabled();
  const job = await page.evaluate(async () => {
    const result = await globalThis.coredrillStorageSpike.pipeline.page({ limit: 1 });
    if (!result.ok) throw Error("No stored job");
    return result.value.items[0];
  });
  await entry.getByLabel("Linked stored job", { exact: true }).selectOption(job.id);
  await entry.getByRole("button", { name: "New interaction", exact: true }).click();
  await expect(entry.getByLabel("Interaction summary", { exact: true })).toBeFocused();
  const literal = "\uFEFFNetwork UI <script>inert()</script> 🧭\nKeep spacing.  ";
  await entry.getByLabel("Interaction type", { exact: true }).selectOption("call");
  await entry.getByLabel("Interaction summary", { exact: true }).fill(literal);
  await network.getByRole("button", { name: "Contacts", exact: true }).click();
  await expect(entry.getByLabel("Interaction summary", { exact: true })).toHaveCount(0);
  expect(await page.locator("body").innerText()).not.toContain("Network UI <script>");
  await network.getByRole("button", { name: "Interactions", exact: true }).click();
  await expect(entry.getByLabel("Interaction summary", { exact: true })).toHaveValue(literal);
  await entry.getByRole("button", { name: "Record interaction", exact: true }).click();
  await expect(entry.getByRole("status")).toContainText("Interaction save acknowledged");
  await entry.getByRole("button", { name: "Close recorded interaction", exact: true }).click();
  await expect(panel).toContainText("Network UI <script>inert()</script>");
  const saved = await page.evaluate(async () => {
    const api = globalThis.coredrillStorageSpike,
      vault = await api.vault.inspect();
    if (!vault.ok || !vault.value.vault) throw Error("Vault unavailable");
    const result = await api.networkInteractions.page({
      specVersion: 1,
      expectedVaultId: vault.value.vault.id,
    });
    if (!result.ok) throw Error("History unavailable");
    return result.value.items[0];
  });
  expect(saved).toMatchObject({
    contactId: null,
    type: "call",
    currentJob: { id: job.id },
    summaryPreview: literal,
  });
  await page.reload();
  await expect(panel).toContainText("Network UI <script>inert()</script>");
  // Lose a real committed acknowledgement at the Worker/native boundary, never replay it.
  await page.evaluate(() => {
    const root = globalThis.coredrillStorageSpike,
      original = root.interactionRecording;
    const probe = { saves: 0, checks: 0, loseCommit: true, lostCommits: 0, interactionId: null };
    globalThis.interactionEntryProbe = probe;
    globalThis.coredrillStorageSpike = {
      ...root,
      interactionRecording: {
        ...original,
        beginRecording: (scope) => {
          const recording = original.beginRecording(scope);
          probe.interactionId = recording.interactionId;
          return {
            ...recording,
            save: async (fields) => {
              probe.saves += 1;
              if (
                probe.loseCommit &&
                typeof globalThis.coredrillArmInteractionAckLoss === "function"
              ) {
                await globalThis.coredrillArmInteractionAckLoss(recording.interactionId);
                probe.loseCommit = false;
              }
              return recording.save(fields);
            },
            check: async () => {
              probe.checks += 1;
              return recording.check();
            },
          };
        },
      },
    };
  });
  await entry.getByLabel("Linked stored job", { exact: true }).selectOption(job.id);
  await entry.getByRole("button", { name: "New interaction", exact: true }).click();
  await entry
    .getByLabel("Interaction summary", { exact: true })
    .fill("Synthetic Network uncertain acknowledgement");
  await entry.getByRole("button", { name: "Record interaction", exact: true }).click();
  await expect(entry.getByRole("status")).toContainText("Save acknowledgement uncertain");
  await expect(entry.getByRole("button", { name: "Record interaction", exact: true })).toHaveCount(
    0,
  );
  const committed = await page.evaluate(
    async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
  );
  await entry.getByRole("button", { name: "Check original acknowledgement", exact: true }).click();
  await expect(entry.getByRole("status")).toContainText(
    "Original interaction found by a read-only check",
  );
  expect(
    await page.evaluate(
      async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
    ),
  ).toBe(committed);
  expect(
    await page.evaluate(() => ({
      saves: globalThis.interactionEntryProbe.saves,
      checks: globalThis.interactionEntryProbe.checks,
    })),
  ).toEqual({ saves: 1, checks: 1 });
  const originals = await page.evaluate(async () => {
    const api = globalThis.coredrillStorageSpike,
      identity = await api.vault.inspect();
    const result = await api.networkInteractions.page({
      specVersion: 1,
      expectedVaultId: identity.value.vault.id,
    });
    if (!result.ok) throw Error("Original history unavailable");
    return result.value.items.filter(
      (item) => item.id === globalThis.interactionEntryProbe.interactionId,
    );
  });
  expect(originals).toHaveLength(1);
  expect(originals[0]).toMatchObject({
    contactId: null,
    currentJob: { id: job.id },
    summaryPreview: "Synthetic Network uncertain acknowledgement",
  });
  await entry.getByRole("button", { name: "Close recorded interaction", exact: true }).click();
  return {
    originalArchiveUnchanged: fixture.originalRecoveryFixtureUnchanged,
    realPagesAndBoundedBodies: true,
    readSegmentWrites: 0,
    exactRetries: true,
    retiredTabNoPublicationOrFocusTheft: true,
    reflowKeyboardAxe: true,
    explicitJobEntryNoInferredContact: true,
    normalUiWrites: 2,
    lostCommitReadOnlyReconciliationNoReplay: true,
    reload: true,
  };
};
