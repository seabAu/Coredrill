import { expect, test } from "@playwright/test";
import { createContactEvidenceFixture } from "./contact-evidence-fixture.mjs";
import { exerciseContactEvidence } from "./contact-evidence-journey.mjs";

const restoreFixture = async (page, context, testInfo) => {
  const fixture = await createContactEvidenceFixture(testInfo);
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
    name: "synthetic-contact-evidence.coredrill.zip",
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

test("normal offline contact evidence inspects literal historical sources without granting field use", async ({
  page,
  context,
}, testInfo) => {
  const external = [];
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => {
    if (route.request().url().startsWith("http://127.0.0.1:4181/")) return route.continue();
    external.push(route.request().url());
    return route.abort("blockedbyclient");
  });
  const fixture = await restoreFixture(page, context, testInfo);
  await exerciseContactEvidence(page, testInfo, fixture);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

for (const mode of [
  "retry",
  "contact",
  "field",
  "archive",
  "close",
  "restore",
  "reflow",
  "foreign",
]) {
  test(`contact evidence ${mode} preserves exact read ownership, privacy and deliberate focus`, async ({
    page,
    context,
  }, testInfo) => {
    const fixture = await restoreFixture(page, context, testInfo);
    await page.goto("/network/contacts");
    await page.evaluate(
      ({ target, mode }) => {
        const original = globalThis.coredrillStorageSpike;
        const probe = { inputs: [], release: null, completed: false };
        globalThis.coredrillEvidenceProbe = probe;
        globalThis.coredrillStorageSpike = {
          ...original,
          contactFieldEvidence: {
            ...original.contactFieldEvidence,
            page: async (input) => {
              if (input.contactId === target && input.after !== null && input.after !== undefined) {
                probe.inputs.push(JSON.stringify(input));
                if (probe.inputs.length === 1) {
                  if (mode === "retry") throw new Error("PRIVATE_SYNTHETIC_EVIDENCE_PATH");
                  const result = await original.contactFieldEvidence.page(input);
                  if (mode === "foreign" && result.ok)
                    return {
                      ok: true,
                      value: { ...result.value, vaultId: "0198e112-0000-7000-8000-000000000099" },
                    };
                  await new Promise((resolve) => {
                    probe.release = resolve;
                  });
                  probe.completed = true;
                  return result;
                }
              }
              return original.contactFieldEvidence.page(input);
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
    const evidence = page.getByRole("region", {
      name: "Contact field source evidence",
      exact: true,
    });
    const list = evidence.getByRole("list", {
      name: "Retained field evidence on this page",
      exact: true,
    });
    await evidence.getByRole("button", { name: "Inspect Email evidence", exact: true }).click();
    await expect(list.getByRole("listitem")).toHaveCount(5);
    await evidence.getByRole("button", { name: "Next evidence page", exact: true }).click();
    if (mode === "retry" || mode === "foreign") {
      await expect(evidence.getByRole("alert")).toContainText(
        mode === "retry" ? "could not be read" : "could not be validated",
      );
      await expect(evidence).not.toContainText("PRIVATE_SYNTHETIC");
      await expect(list.getByRole("listitem")).toHaveCount(5);
      await expect(evidence).toContainText("may be stale");
      if (mode === "retry") {
        await evidence.getByRole("button", { name: "Retry evidence page", exact: true }).click();
        await expect(list.getByRole("listitem")).toHaveCount(3);
        const inputs = await page.evaluate(() => globalThis.coredrillEvidenceProbe.inputs);
        expect(inputs).toHaveLength(2);
        expect(inputs[1]).toBe(inputs[0]);
      } else {
        await expect(
          evidence.getByRole("button", { name: "Retry evidence page", exact: true }),
        ).toHaveCount(0);
        await expect(
          evidence.getByRole("button", { name: "Next evidence page", exact: true }),
        ).toBeDisabled();
      }
      return;
    }
    await expect
      .poll(() => page.evaluate(() => typeof globalThis.coredrillEvidenceProbe.release))
      .toBe("function");
    if (mode === "contact") {
      await contacts
        .getByRole("listitem")
        .filter({ hasText: "Other synthetic evidence contact" })
        .getByRole("button", { name: "View contact details", exact: true })
        .click();
      await expect(evidence.getByRole("status")).toContainText("Choose a field");
      await evidence.getByRole("button", { name: "Inspect Email evidence", exact: true }).click();
      await expect(list.getByRole("listitem")).toHaveCount(1);
      await expect(evidence).toContainText("OTHER_CONTACT_EVIDENCE_ONLY");
    } else if (mode === "field") {
      await evidence.getByRole("button", { name: "Inspect Phone evidence", exact: true }).click();
      await expect(evidence).toContainText("No retained source links were found");
    } else if (mode === "archive") {
      await evidence.getByRole("checkbox").check();
      await expect(list.getByRole("listitem")).toHaveCount(5);
    } else if (mode === "close") {
      await evidence
        .getByRole("button", { name: "Close evidence inspection", exact: true })
        .click();
      await expect(evidence.getByRole("status")).toContainText("Choose a field");
      await expect(
        evidence.getByRole("button", { name: "Inspect Email evidence", exact: true }),
      ).toBeFocused();
    } else if (mode === "restore") {
      await page.getByRole("link", { name: "Settings", exact: true }).click();
      const restore = page.getByRole("region", { name: "Portable vault restore", exact: true });
      await restore.getByLabel("Choose archive to review", { exact: true }).setInputFiles({
        name: "synthetic-contact-evidence.coredrill.zip",
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
      await page.goBack();
      await expect(
        page.getByRole("heading", { name: "Reopen local vault after restore", exact: true }),
      ).toBeVisible();
      await expect(evidence).toHaveCount(0);
    } else {
      await page.setViewportSize({ width: 320, height: 900 });
      await expect(evidence.getByRole("status")).toContainText("Reading retained Email evidence");
    }
    const focus =
      mode === "restore"
        ? page.getByRole("button", { name: "Reload local vault", exact: true })
        : evidence.getByRole("button", { name: "Inspect Phone evidence", exact: true });
    await focus.focus();
    await page.evaluate(() => globalThis.coredrillEvidenceProbe.release());
    await expect
      .poll(() => page.evaluate(() => globalThis.coredrillEvidenceProbe.completed))
      .toBe(true);
    if (mode === "restore") {
      await expect(evidence).toHaveCount(0);
      await expect(
        page.getByRole("heading", { name: "Reopen local vault after restore", exact: true }),
      ).toBeVisible();
      await expect(focus).toBeFocused();
      return;
    }
    if (mode === "reflow") await expect(list.getByRole("listitem")).toHaveCount(3);
    else {
      await expect(evidence).not.toContainText("ACTIVE_EVIDENCE_106");
      if (mode === "archive") await expect(list.getByRole("listitem")).toHaveCount(5);
      if (mode === "close")
        await expect(evidence.getByRole("status")).toContainText("Choose a field");
    }
    await expect(focus).toBeFocused();
  });
}
