import { expect, test } from "@playwright/test";
import { initializeDefaultWorkspace } from "./production-workspace.mjs";

test("normal contact directory pages 26 UI-created contacts and retires old archive owners", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await initializeDefaultWorkspace(page);
  await page.evaluate(() => {
    const root = globalThis.coredrillStorageSpike;
    const probe = { mode: "success", calls: [], release: null, completed: 0 };
    globalThis.coredrillContactPageProbe = probe;
    globalThis.coredrillStorageSpike = {
      ...root,
      contactDirectory: {
        page: async (input) => {
          probe.calls.push(globalThis.structuredClone(input));
          if (probe.mode === "failure") throw new Error("PRIVATE_CONTACT_DIRECTORY_SENTINEL");
          if (probe.mode === "hold") {
            probe.mode = "success";
            await new Promise((resolve) => {
              probe.release = resolve;
            });
          }
          const result = await root.contactDirectory.page(input);
          probe.completed += 1;
          return result;
        },
      },
    };
  });
  await page
    .getByRole("navigation", { name: "Primary", exact: true })
    .getByRole("link", { name: "Network", exact: true })
    .click();
  const network = page.getByRole("region", { name: "Stored Network", exact: true });
  await network.getByRole("button", { name: "Contacts", exact: true }).click();
  await expect(network).toContainText(
    "No contacts were found in this vault, archive and company scope",
  );
  const create = network.getByRole("form", { name: "Create local contact", exact: true });
  for (let index = 0; index < 26; index += 1) {
    await network.getByRole("button", { name: "Create local contact", exact: true }).click();
    await create
      .getByLabel("Contact name", { exact: true })
      .fill(`Synthetic contact page ${String(index).padStart(2, "0")}`);
    await create.getByRole("button", { name: "Save local contact", exact: true }).click();
    await expect(create).toContainText("Local save acknowledged");
    await create.getByRole("button", { name: "Close saved contact draft", exact: true }).click();
  }
  const list = network.getByRole("list", { name: "Stored contacts on this page", exact: true });
  await expect(list.getByRole("listitem")).toHaveCount(25);
  const firstNames = await list.getByRole("heading").allTextContents();
  const next = network.getByRole("button", { name: "Next contact page", exact: true });
  await page.evaluate(() => {
    globalThis.coredrillContactPageProbe.mode = "failure";
  });
  await next.click();
  await expect(network.getByRole("alert")).toContainText("could not be read");
  await expect(network).toContainText("may be stale");
  await expect(list.getByRole("listitem")).toHaveCount(25);
  const failedScope = await page.evaluate(() => globalThis.coredrillContactPageProbe.calls.at(-1));
  await page.evaluate(() => {
    globalThis.coredrillContactPageProbe.mode = "success";
  });
  await network.getByRole("button", { name: "Retry contact page", exact: true }).click();
  await expect(list.getByRole("listitem")).toHaveCount(1);
  expect(await page.evaluate(() => globalThis.coredrillContactPageProbe.calls.at(-1))).toEqual(
    failedScope,
  );
  const lastNames = await list.getByRole("heading").allTextContents();
  expect(new Set([...firstNames, ...lastNames]).size).toBe(26);
  await expect(next).toBeDisabled();
  const first = network.getByRole("button", { name: "Load first contact page", exact: true });
  await expect(first).toBeFocused();
  await page.evaluate(() => {
    globalThis.coredrillContactPageProbe.mode = "hold";
  });
  await first.click();
  await page.waitForFunction(() => globalThis.coredrillContactPageProbe.release !== null);
  await expect(first).toBeDisabled();
  const calls = await page.evaluate(() => globalThis.coredrillContactPageProbe.calls.length);
  await page.setViewportSize({ width: 320, height: 900 });
  expect(await page.evaluate(() => globalThis.coredrillContactPageProbe.calls.length)).toBe(calls);
  await network.getByRole("checkbox", { name: "Include archived contacts", exact: true }).check();
  await expect(first).toBeEnabled();
  await expect(list.getByRole("listitem")).toHaveCount(25);
  const completed = await page.evaluate(() => globalThis.coredrillContactPageProbe.completed);
  const deliberate = network.getByRole("button", { name: "Contacts", exact: true });
  await deliberate.focus();
  await page.evaluate(() => globalThis.coredrillContactPageProbe.release());
  await expect
    .poll(() => page.evaluate(() => globalThis.coredrillContactPageProbe.completed))
    .toBe(completed + 1);
  await expect(list.getByRole("listitem")).toHaveCount(25);
  await expect(
    network.getByRole("checkbox", { name: "Include archived contacts", exact: true }),
  ).toBeChecked();
  await expect(deliberate).toBeFocused();
  await expect(network.getByRole("alert")).toHaveCount(0);
  await expect(network).not.toContainText("PRIVATE_CONTACT_DIRECTORY_SENTINEL");
  await testInfo.attach("normal-contact-directory.json", {
    body: JSON.stringify({
      all26CreatedThroughUi: true,
      bounded25Plus1: true,
      exactFailedCursorRetried: true,
      noDuplicateOrSkippedIdentities: true,
      stalePageRetained: true,
      retiredArchiveReadIgnored: true,
      reflowSingleFlight: true,
      deliberateFocusPreserved: true,
    }),
    contentType: "application/json",
  });
});
