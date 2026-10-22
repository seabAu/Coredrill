import { expect, test } from "@playwright/test";
import { createContactHistoryFixture } from "./contact-history-fixture.mjs";
import { exerciseContactHistory } from "./contact-history-journey.mjs";

const restoreHistoryFixture = async (page, context, testInfo) => {
  const fixture = await createContactHistoryFixture(testInfo);
  await page.goto("/");
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.getByRole("button", { name: /Quick start/u }).click();
  await page
    .getByRole("button", { name: "Restore an existing archive instead", exact: true })
    .click();
  const restore = page.getByRole("region", { name: "Portable vault restore", exact: true });
  await restore.getByLabel("Choose archive to review", { exact: true }).setInputFiles({
    name: "synthetic-contact-history.coredrill.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(fixture.bytes),
  });
  await expect(
    restore.getByRole("heading", { name: "Review exact restore changes", exact: true }),
  ).toBeVisible();
  await restore.getByRole("checkbox").check();
  await restore
    .getByRole("button", { name: "Confirm and restore reviewed archive", exact: true })
    .click();
  await expect(restore.getByRole("status")).toContainText(
    "Restore committed and its acknowledgement validated",
  );
  await restore.getByRole("button", { name: "Reload local vault", exact: true }).click();
  return fixture;
};

test("normal contact history reads explicit links and complete literal summaries offline from a disclosed archive", async ({
  page,
  context,
}, testInfo) => {
  const fixture = await restoreHistoryFixture(page, context, testInfo);
  await exerciseContactHistory(page, testInfo, fixture);
});

for (const mode of ["retry", "retire", "retire-summary"]) {
  test(`contact history ${mode} preserves the viewed owner and exact continuation without leaking failures`, async ({
    page,
    context,
  }, testInfo) => {
    const fixture = await restoreHistoryFixture(page, context, testInfo);
    await page.goto("/network/contacts");
    await page.evaluate(
      ({ target, mode }) => {
        const original = globalThis.coredrillStorageSpike;
        const probe = { inputs: [], release: null, completed: false };
        globalThis.coredrillHistoryProbe = probe;
        globalThis.coredrillStorageSpike = {
          ...original,
          contactHistory: {
            ...original.contactHistory,
            page: async (input) => {
              if (input.contactId === target && input.after !== null && input.after !== undefined) {
                probe.inputs.push(JSON.stringify(input));
                if (probe.inputs.length === 1 && mode !== "retire-summary") {
                  if (mode === "retry") throw new Error("PRIVATE_SYNTHETIC_HISTORY_PATH");
                  const result = await original.contactHistory.page(input);
                  await new Promise((resolve) => {
                    probe.release = resolve;
                  });
                  probe.completed = true;
                  return result;
                }
              }
              return original.contactHistory.page(input);
            },
            summaryPart: async (input) => {
              const result = await original.contactHistory.summaryPart(input);
              if (mode === "retire-summary" && input.reference.contactId === target) {
                await new Promise((resolve) => {
                  probe.release = resolve;
                });
                probe.completed = true;
              }
              return result;
            },
          },
        };
      },
      { target: fixture.contactId, mode },
    );
    const contacts = page.getByRole("list", { name: "Stored contacts on this page", exact: true });
    await contacts
      .getByRole("listitem")
      .filter({ hasText: fixture.contactName })
      .getByRole("button", { name: "View contact details", exact: true })
      .click();
    const history = page.getByRole("region", { name: "Recorded contact history", exact: true });
    const list = history.getByRole("list", {
      name: "Recorded interactions on this page",
      exact: true,
    });
    await expect(list.getByRole("listitem")).toHaveCount(25);
    if (mode === "retire-summary") {
      await history
        .locator(`[data-contact-history-inspect="${fixture.longInteractionId}"]`)
        .click();
    } else {
      await history.getByRole("button", { name: "Next history page", exact: true }).click();
    }
    if (mode === "retry") {
      await expect(history.getByRole("alert")).toContainText("could not be read");
      await expect(history).not.toContainText("PRIVATE_SYNTHETIC");
      await expect(list.getByRole("listitem")).toHaveCount(25);
      await history.getByRole("button", { name: "Retry history page", exact: true }).click();
      await expect(list.getByRole("listitem")).toHaveCount(3);
      const inputs = await page.evaluate(() => globalThis.coredrillHistoryProbe.inputs);
      expect(inputs).toHaveLength(2);
      expect(inputs[1]).toBe(inputs[0]);
    } else {
      await expect
        .poll(() => page.evaluate(() => typeof globalThis.coredrillHistoryProbe.release))
        .toBe("function");
      await contacts
        .getByRole("listitem")
        .filter({ hasText: "Unrelated synthetic history contact" })
        .getByRole("button", { name: "View contact details", exact: true })
        .click();
      await expect(list.getByRole("listitem")).toHaveCount(1);
      await expect(history).toContainText("UNRELATED_CONTACT_ONLY");
      const focus = page.getByRole("button", { name: "Refresh selected contact", exact: true });
      await expect(focus).toBeEnabled();
      await focus.focus();
      await page.evaluate(() => globalThis.coredrillHistoryProbe.release());
      await expect
        .poll(() => page.evaluate(() => globalThis.coredrillHistoryProbe.completed))
        .toBe(true);
      await expect(list.getByRole("listitem")).toHaveCount(1);
      await expect(history).not.toContainText("Future imported history record");
      await expect(
        history.getByRole("region", { name: "Recorded interaction summary", exact: true }),
      ).toHaveCount(0);
      await expect(focus).toBeFocused();
    }
  });
}
