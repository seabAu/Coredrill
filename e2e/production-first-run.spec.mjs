import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { initializeDefaultWorkspace } from "./production-workspace.mjs";

const identity = (page) => page.evaluate(() => globalThis.coredrillStorageSpike.vault.inspect());
const captures = (page) =>
  page.evaluate(() => globalThis.coredrillExtensionInbox.listReviewItems());
const unloadWouldBeCancelled = (page) =>
  page.evaluate(() => !window.dispatchEvent(new Event("beforeunload", { cancelable: true })));
const quickReview = async (page) => {
  await page.getByRole("button", { name: /Quick start/u }).click();
  await page.getByLabel("Vault name", { exact: true }).fill("Synthetic first-run vault");
  await page.getByRole("button", { name: "Continue with local defaults", exact: true }).click();
  await page.getByLabel("Job title", { exact: true }).fill("Synthetic setup engineer");
  await page.getByLabel("Company", { exact: true }).fill("Synthetic Setup Lab");
  await page.getByRole("button", { name: /Review job/u }).click();
};

test("Quick start saves a real named vault and reviewable capture, then reopens offline", async ({
  page,
  context,
}, testInfo) => {
  const external = [];
  const errors = [];
  await page.addInitScript(() => {
    globalThis.syntheticPersistenceRequests = 0;
    const original = navigator.storage.persist.bind(navigator.storage);
    navigator.storage.persist = (...args) => {
      globalThis.syntheticPersistenceRequests += 1;
      return original(...args);
    };
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => {
    if (route.request().url().startsWith("http://127.0.0.1:4181/")) return route.continue();
    external.push(route.request().url());
    return route.abort("blockedbyclient");
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Quick start/u })).toBeVisible();
  expect((await identity(page)).value.vault).toBeNull();
  await quickReview(page);
  expect((await identity(page)).value.vault).toBeNull();
  expect(await captures(page)).toHaveLength(0);
  expect(await unloadWouldBeCancelled(page)).toBe(true);
  await page.setViewportSize({ width: 320, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("quick-review-320.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Save vault and first capture", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your workspace is ready", exact: true }),
  ).toBeVisible();
  const saved = (await identity(page)).value.vault;
  expect(saved.name).toBe("Synthetic first-run vault");
  const pending = await captures(page);
  expect(pending).toHaveLength(1);
  const receipt = await page.evaluate(
    (id) => globalThis.coredrillExtensionInbox.getReviewItem(id),
    pending[0].envelopeId,
  );
  expect(receipt.resolutionKind).toBeNull();
  expect(await unloadWouldBeCancelled(page)).toBe(false);
  await page.getByRole("link", { name: "Go to Home", exact: true }).click();
  await page.getByRole("button", { name: "Review captures", exact: true }).click();
  const review = page.getByTestId("capture-review");
  await review.getByRole("button", { name: "Accept high-confidence fields", exact: true }).click();
  await review.getByRole("button", { name: "Save as new job", exact: true }).click();
  await expect(review.getByText("No durable captures yet")).toBeVisible();
  await page
    .getByRole("navigation", { name: "Primary", exact: true })
    .getByRole("link", { name: "Pipeline", exact: true })
    .click();
  await page.locator('[data-pipeline-view-option="table"]').click();
  await expect(
    page.getByRole("button", { name: "Synthetic setup engineer", exact: true }),
  ).toBeVisible();
  await page.waitForFunction(
    () => globalThis.coredrillOfflineShell?.getState().registered === true,
  );
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("button", { name: /Browser vault: Synthetic first-run vault/u }),
  ).toBeVisible();
  expect((await identity(page)).value.vault.id).toBe(saved.id);
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Local vault settings", exact: true }),
  ).toContainText("Synthetic first-run vault");
  await page.getByRole("button", { name: "Refresh storage health", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "No persistence permission was requested" }),
  ).toBeVisible();
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => globalThis.syntheticPersistenceRequests)).toBe(0);
});

test("partial Quick start failure retains input and saved identity until real retry succeeds", async ({
  page,
}) => {
  await page.goto("/");
  await quickReview(page);
  await page.evaluate(() => {
    const inbox = globalThis.coredrillExtensionInbox;
    let fail = true;
    globalThis.coredrillExtensionInbox = {
      ...inbox,
      ingestSupplied: async (draft) => {
        if (fail) {
          fail = false;
          await new Promise((resolve) => {
            globalThis.releaseFirstRunFailure = resolve;
          });
          throw new Error("synthetic private failure");
        }
        return inbox.ingestSupplied(draft);
      },
    };
  });
  await page.getByRole("button", { name: "Save vault and first capture", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Saving the local vault");
  await page.waitForFunction(() => typeof globalThis.releaseFirstRunFailure === "function");
  await expect(
    page.getByRole("heading", { name: "Your workspace is ready", exact: true }),
  ).toHaveCount(0);
  const saved = (await identity(page)).value.vault;
  expect(saved.name).toBe("Synthetic first-run vault");
  await page.evaluate(() => globalThis.releaseFirstRunFailure());
  await expect(page.getByRole("alert")).toContainText(
    "your form entries remain available for retry",
  );
  await expect(page.getByRole("alert")).toBeFocused();
  await expect(page.getByText("synthetic private failure", { exact: false })).toHaveCount(0);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("Job title", { exact: true })).toHaveValue(
    "Synthetic setup engineer",
  );
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByLabel("Vault name", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Vault name", { exact: true })).toHaveValue(saved.name);
  await page.getByRole("button", { name: "Continue with local defaults", exact: true }).click();
  await page.getByRole("button", { name: /Review job/u }).click();
  await page.getByRole("button", { name: "Save vault and first capture", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your workspace is ready", exact: true }),
  ).toBeVisible();
  expect((await identity(page)).value.vault.id).toBe(saved.id);
  expect(await captures(page)).toHaveLength(1);
});

test("Guided setup locks runtime and defers unavailable integrations without fake success", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Guided setup/u }).click();
  await expect(page.getByRole("radio", { name: /Browser on this device/u })).toBeChecked();
  await expect(page.getByRole("radio", { name: /Desktop app on this device/u })).toBeDisabled();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Vault name", { exact: true }).fill("Synthetic guided vault");
  await expect(page.getByRole("checkbox", { name: /Ask for device unlock/u })).toBeDisabled();
  await expect(page.getByRole("radio", { name: /Configure a backup now/u })).toBeDisabled();
  await page.getByRole("button", { name: "Skip this step", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: /Import a resume later/u })).toBeDisabled();
  await page.getByRole("button", { name: "Skip this step", exact: true }).click();
  await page.getByRole("button", { name: "Skip this step", exact: true }).click();
  await expect(page.getByRole("radio", { name: /AI disabled/u })).toBeChecked();
  await expect(page.getByRole("radio", { name: /Local model later/u })).toBeDisabled();
  await expect(page.getByRole("radio", { name: /Bring your own key later/u })).toBeDisabled();
  await page.getByRole("button", { name: "Skip this step", exact: true }).click();
  await expect(page.getByRole("radio", { name: /Pair after setup/u })).toBeDisabled();
  expect((await identity(page)).value.vault).toBeNull();
  await page.getByRole("button", { name: "Finish and go to Home", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your workspace is ready", exact: true }),
  ).toBeVisible();
  expect((await identity(page)).value.vault.name).toBe("Synthetic guided vault");
  expect(await captures(page)).toHaveLength(0);
});

test("explicit setup preserves a prior unidentified capture and treats pasted markup as inert data", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Quick start/u })).toBeVisible();
  // Prior-record fixture only: identity is still created by the actual setup UI below.
  const previous = await page.evaluate(async () => {
    const stored = await globalThis.coredrillExtensionInbox.ingestSupplied({
      captureMethod: "manual",
      senderKind: "web_app",
      source: { sourceKind: "manual_entry" },
      content: {},
      fields: {
        title: { value: "Synthetic legacy capture" },
        company: { value: "Synthetic Legacy Lab" },
      },
      captureClient: { name: "coredrill.web.capture", version: "0.1.0" },
    });
    return globalThis.coredrillExtensionInbox.getReviewItem(stored.durableEnvelopeId);
  });
  expect((await identity(page)).value.vault).toBeNull();
  await page.getByRole("button", { name: /Quick start/u }).click();
  await page.getByRole("button", { name: "Continue with local defaults", exact: true }).click();
  await page.getByText("Paste listing", { exact: true }).click();
  await expect(page.getByRole("radio", { name: /^Paste listing/u })).toBeChecked();
  await page.getByLabel("Job title", { exact: true }).fill("Synthetic pasted role");
  await page.getByLabel("Company", { exact: true }).fill("Synthetic Paste Lab");
  await page
    .getByLabel("Listing text", { exact: true })
    .fill("<script>globalThis.syntheticSetupExecuted = true</script> Build local tools.");
  await page.getByRole("button", { name: /Review job/u }).click();
  await page.getByRole("button", { name: "Save vault and first capture", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your workspace is ready", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => globalThis.syntheticSetupExecuted)).toBeUndefined();
  expect(await captures(page)).toHaveLength(2);
  expect(
    await page.evaluate(
      (id) => globalThis.coredrillExtensionInbox.getReviewItem(id),
      previous.envelopeId,
    ),
  ).toEqual(previous);
});

test("demo never seeds SQLite and a prior-initialization hint requires recovery review", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore demo", exact: true }).click();
  await expect(page.locator(".cd-demo-job")).toHaveCount(3);
  expect((await identity(page)).value.vault).toBeNull();
  expect(await captures(page)).toHaveLength(0);
  await page.getByRole("button", { name: "Discard demo and return", exact: true }).click();
  await page.evaluate(() => localStorage.setItem("coredrill-vault-initialized-v1", "true"));
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Review local vault recovery", exact: true }),
  ).toBeVisible();
  expect((await identity(page)).value.vault).toBeNull();
  await expect(page.getByRole("navigation", { name: "Primary", exact: true })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Review setup without discarding existing records", exact: true })
    .click();
  await initializeDefaultWorkspace(page);
  expect((await identity(page)).value.vault.name).toBe("My job search");
  expect(await captures(page)).toHaveLength(0);
});
