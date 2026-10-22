import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";

/** Observes actual selected-runtime reads; faults delay/reject calls, never supply company rows. */
export const exerciseCompanyDirectory = async (page, testInfo, companyName) => {
  await page.evaluate(() => {
    const original = globalThis.coredrillStorageSpike;
    globalThis.coredrillCompanyReadProbe = {
      original,
      mode: "success",
      calls: 0,
      release: null,
      completed: 0,
    };
    globalThis.coredrillStorageSpike = {
      ...original,
      companyDirectory: {
        page: async (input) => {
          const probe = globalThis.coredrillCompanyReadProbe;
          probe.calls += 1;
          if (probe.mode === "failure") throw new Error("PRIVATE_DIRECTORY_PATH");
          if (probe.mode === "hold") {
            probe.mode = "success";
            await new Promise((resolve) => {
              probe.release = resolve;
            });
          }
          const result = await original.companyDirectory.page(input);
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
  const list = network.getByRole("list", { name: "Stored companies on this page", exact: true });
  await expect(list.getByRole("heading", { name: companyName, exact: true })).toBeVisible();
  await expect(network).toContainText("not a vault total");
  await expect(list).toContainText("Not recorded");
  const first = network.getByRole("button", { name: "Load first company page", exact: true });
  await page.evaluate(() => {
    globalThis.coredrillCompanyReadProbe.mode = "failure";
  });
  await first.click();
  await expect(network.getByRole("alert")).toContainText("could not be read");
  await expect(network).toContainText("may be stale");
  await expect(list).toContainText(companyName);
  await expect(network).not.toContainText("PRIVATE_DIRECTORY_PATH");
  await page.evaluate(() => {
    globalThis.coredrillCompanyReadProbe.mode = "success";
  });
  await network.getByRole("button", { name: "Retry company page", exact: true }).click();
  await expect(network.getByRole("alert")).toHaveCount(0);
  await expect(first).toBeFocused();
  await page.evaluate(() => {
    globalThis.coredrillCompanyReadProbe.mode = "hold";
  });
  await first.click();
  await page.waitForFunction(() => globalThis.coredrillCompanyReadProbe.release !== null);
  const calls = await page.evaluate(() => globalThis.coredrillCompanyReadProbe.calls);
  await page.setViewportSize({ width: 320, height: 900 });
  await expect(first).toBeDisabled();
  expect(await page.evaluate(() => globalThis.coredrillCompanyReadProbe.calls)).toBe(calls);
  // Replacing archive scope retires the held old-scope reader immediately.
  await network.getByRole("checkbox", { name: "Include archived companies", exact: true }).check();
  await expect(first).toBeEnabled();
  await expect(list).toContainText(companyName);
  const completed = await page.evaluate(() => globalThis.coredrillCompanyReadProbe.completed);
  await network.getByRole("button", { name: "Contacts", exact: true }).focus();
  await page.evaluate(() => globalThis.coredrillCompanyReadProbe.release());
  await page.waitForFunction(
    (prior) => globalThis.coredrillCompanyReadProbe.completed > prior,
    completed,
  );
  await expect(first).toBeEnabled();
  await expect(list).toContainText(companyName);
  await expect(network.getByRole("alert")).toHaveCount(0);
  await expect(
    network.getByRole("checkbox", { name: "Include archived companies", exact: true }),
  ).toBeChecked();
  await expect(network.getByRole("button", { name: "Contacts", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(network).toContainText(
    "No contacts were found in this vault, archive and company scope when read.",
  );
  await expect(list).toHaveCount(0);
  await page.goBack();
  await expect(list).toContainText(companyName);
  await network.getByRole("button", { name: "Interactions", exact: true }).click();
  await expect(network).toContainText("Stored interactions navigation is not connected yet");
  await network.getByRole("button", { name: "Companies", exact: true }).click();
  await expect(list).toContainText(companyName);
  await page.reload();
  await expect(list).toContainText(companyName);
  await expect(
    network.getByRole("checkbox", { name: "Include archived companies", exact: true }),
  ).not.toBeChecked();
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  const selectedTab = network.getByRole("button", { name: "Companies", exact: true });
  const outline = (element) => {
    const style = globalThis.getComputedStyle(element);
    return {
      focused: element === globalThis.document.activeElement,
      keyboardVisible: element.matches(":focus-visible"),
      width: Number.parseFloat(style.outlineWidth),
      offset: Number.parseFloat(style.outlineOffset),
      shadow: style.boxShadow,
    };
  };
  const selectedOutline = await selectedTab.evaluate(outline);
  await selectedTab.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(selectedTab).toBeFocused();
  const focusedOutline = await selectedTab.evaluate(outline);
  await testInfo.attach("company-directory-selected-focus.json", {
    body: JSON.stringify({ selectedOutline, focusedOutline, forcedColors: true }),
    contentType: "application/json",
  });
  expect(focusedOutline.keyboardVisible).toBe(true);
  expect(focusedOutline.width).toBeGreaterThanOrEqual(3);
  expect(focusedOutline.offset).toBeGreaterThanOrEqual(2);
  expect(focusedOutline.offset).not.toBe(selectedOutline.offset);
  expect(
    await page.evaluate(
      () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth,
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.evaluate(() => globalThis.scrollTo(0, globalThis.document.body.scrollHeight));
  expect(
    await page.evaluate(() => {
      const last = globalThis.document.querySelector(".cd-stored-companies__list li:last-child");
      const navigation = globalThis.document.querySelector(".cd-shell-mobile-nav");
      return (
        last !== null &&
        navigation !== null &&
        last.getBoundingClientRect().bottom <= navigation.getBoundingClientRect().top
      );
    }),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("stored-company-directory-320.png"),
    fullPage: true,
  });
  return {
    actualStoredCompany: true,
    failureRetainsStalePage: true,
    retiredArchiveReadIgnored: true,
    reflowSingleFlight: true,
    deliberateFocusPreserved: true,
    reloadReadback: true,
    contactsAndInteractionsNotInvented: true,
  };
};
