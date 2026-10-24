import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** Positive writes are normal form actions; canonical reads only inspect saved identities. */
export const exerciseNormalInteractionEntry = async (page, testInfo) => {
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: 1440, height: 900 });
  const primary = page.getByRole("navigation", { name: "Primary", exact: true });
  await primary.getByRole("link", { name: "Network", exact: true }).click();
  const network = page.getByRole("region", { name: "Stored Network", exact: true });
  await network.getByRole("button", { name: "Contacts", exact: true }).click();
  await network.getByRole("button", { name: "Create local contact", exact: true }).click();
  const create = network.getByRole("form", { name: "Create local contact", exact: true });
  await create
    .getByLabel("Contact name", { exact: true })
    .fill("Synthetic interaction entry contact");
  await create.getByRole("button", { name: "Save local contact", exact: true }).click();
  await expect(create).toContainText("Local save acknowledged");
  await create.getByRole("button", { name: "View saved contact", exact: true }).click();
  await create.getByRole("button", { name: "Close saved contact draft", exact: true }).click();
  const contactUrl = page.url();
  const contactId = new URL(contactUrl).pathname.split("/").at(-1);
  const owner = await page.evaluate(async () => {
    const api = globalThis.coredrillStorageSpike;
    const identity = await api.vault.inspect(),
      jobs = await api.pipeline.page({ limit: 1 });
    if (!identity.ok || !identity.value.vault || !jobs.ok || !jobs.value.items[0])
      throw new Error("Read owner unavailable");
    return { vaultId: identity.value.vault.id, job: jobs.value.items[0] };
  });
  const entry = page.getByRole("region", { name: "Record local interaction", exact: true });
  await expect(entry.getByRole("button", { name: "New interaction", exact: true })).toBeDisabled();
  await entry.getByLabel("Linked stored job", { exact: true }).selectOption(owner.job.id);
  const types = ["note", "call", "email_logged", "meeting", "referral", "follow_up"];
  const occurredAt = "2026-08-21T12:34:56.000Z";
  const summary = "\uFEFF  Exact local 🧭 <script>neverExecute()</script>\nKeep spacing.  ";
  for (const type of types) {
    await entry.getByRole("button", { name: "New interaction", exact: true }).click();
    await expect(entry.getByLabel("Interaction summary", { exact: true })).toBeFocused();
    await entry.getByLabel("Interaction type", { exact: true }).selectOption(type);
    await entry.getByLabel("Direction", { exact: true }).selectOption("mutual");
    await entry
      .getByLabel("Occurred at (optional exact UTC instant)", { exact: true })
      .fill(occurredAt);
    await entry.getByLabel("Interaction summary", { exact: true }).fill(`${summary}${type}`);
    if (type === "note") {
      await page.setViewportSize({ width: 320, height: 900 });
      await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
      await expect(entry.getByLabel("Interaction summary", { exact: true })).toHaveValue(
        `${summary}${type}`,
      );
      const timeOrigin = await page.evaluate(() => globalThis.performance.timeOrigin);
      const warning = page.waitForEvent("dialog");
      const reload = page.evaluate(() => globalThis.location.reload()).catch(() => null);
      const dialog = await warning;
      expect(dialog.type()).toBe("beforeunload");
      await dialog.dismiss();
      await reload;
      expect(await page.evaluate(() => globalThis.performance.timeOrigin)).toBe(timeOrigin);
      await expect(entry.getByLabel("Interaction summary", { exact: true })).toHaveValue(
        `${summary}${type}`,
      );
    }
    await entry.getByRole("button", { name: "Record interaction", exact: true }).click();
    await expect(entry.getByRole("status")).toContainText("Interaction save acknowledged");
    await expect(
      entry.getByRole("button", { name: "Record interaction", exact: true }),
    ).toHaveCount(0);
    await expect(entry.getByRole("status")).toBeFocused();
    if (type === "note") {
      expect(
        await page.evaluate(
          () =>
            globalThis.document.documentElement.scrollWidth >
            globalThis.document.documentElement.clientWidth,
        ),
      ).toBe(false);
      expect(
        (
          await new AxeBuilder({ page })
            .include('[aria-label="Record local interaction"]')
            .analyze()
        ).violations,
      ).toEqual([]);
      await entry.screenshot({ path: testInfo.outputPath("normal-interaction-entry-320.png") });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.emulateMedia({ forcedColors: "none", reducedMotion: "no-preference" });
    }
    await entry.getByRole("button", { name: "Close recorded interaction", exact: true }).click();
  }
  const history = await page.evaluate(
    async ({ vaultId, contactId }) => {
      const result = await globalThis.coredrillStorageSpike.contactHistory.page({
        specVersion: 1,
        expectedVaultId: vaultId,
        contactId,
        includeArchived: false,
      });
      if (!result.ok) throw new Error("History unavailable");
      return result.value;
    },
    { vaultId: owner.vaultId, contactId },
  );
  expect(history.items).toHaveLength(6);
  expect(new Set(history.items.map((item) => item.id)).size).toBe(6);
  for (const type of types)
    expect(history.items.find((item) => item.type === type)).toMatchObject({
      direction: "mutual",
      occurredAt,
      summaryPreview: `${summary}${type}`,
      currentJob: { id: owner.job.id },
    });
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Recorded contact history", exact: true }),
  ).toContainText("Exact local");
  // An independent unlinked Job Timeline entry uses the same owned form, not quick-note input.
  await page.goto(`/jobs/${owner.job.id}/timeline`);
  await entry.getByRole("button", { name: "New interaction", exact: true }).click();
  await entry.getByLabel("Interaction type", { exact: true }).selectOption("call");
  await entry
    .getByLabel("Interaction summary", { exact: true })
    .fill("Unlinked normal Timeline call");
  await entry.getByRole("button", { name: "Record interaction", exact: true }).click();
  await expect(entry.getByRole("status")).toContainText("Interaction save acknowledged");
  await page.reload();
  await expect(page.locator("[data-stored-timeline]")).toContainText(
    "Unlinked normal Timeline call",
  );
  await page.goto(contactUrl);
  const afterUnlinked = await page.evaluate(
    async ({ vaultId, contactId }) => {
      const result = await globalThis.coredrillStorageSpike.contactHistory.page({
        specVersion: 1,
        expectedVaultId: vaultId,
        contactId,
        includeArchived: false,
      });
      if (!result.ok) throw new Error("History unavailable");
      return result.value.items.map((item) => item.id);
    },
    { vaultId: owner.vaultId, contactId },
  );
  expect(afterUnlinked.sort()).toEqual(history.items.map((item) => item.id).sort());
  if (viewport !== null) await page.setViewportSize(viewport);
  const proof = {
    normalUiWrites: 7,
    sixActivityKinds: true,
    explicitContactAndJob: true,
    noInferredConversation: true,
    exactLiteralAndInstant: true,
    reload: true,
    normalComposer: true,
  };
  await testInfo.attach("normal-interaction-entry.json", {
    body: JSON.stringify(proof),
    contentType: "application/json",
  });
  return proof;
};
