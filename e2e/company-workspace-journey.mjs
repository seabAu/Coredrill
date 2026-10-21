import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** All successful writes delegate to the actual normal runtime; faults never supply records. */
export const exerciseCompanyWorkspace = async (page, testInfo) => {
  const priorViewport = page.viewportSize();
  const priorMedia = await page.evaluate(() => ({
    forced: globalThis.matchMedia("(forced-colors: active)").matches,
    reduced: globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches,
  }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ forcedColors: "none", reducedMotion: "no-preference" });
  await page.evaluate(() => {
    const root = globalThis.coredrillStorageSpike;
    const original = root.companyWorkspace;
    const probe = {
      creates: 0,
      notes: 0,
      mode: "hold_then_lose",
      notesMode: "success",
      readMode: "success",
      release: null,
      readRelease: null,
      completed: 0,
      readCompleted: 0,
    };
    globalThis.coredrillCompanyWriteProbe = probe;
    globalThis.coredrillStorageSpike = {
      ...root,
      companyWorkspace: {
        ...original,
        beginCreation: (vaultId) => {
          const owned = original.beginCreation(vaultId);
          return {
            ...owned,
            save: async (input) => {
              probe.creates += 1;
              const mode = probe.mode;
              if (mode === "hold_then_lose")
                await new Promise((resolve) => {
                  probe.release = resolve;
                });
              const result = await owned.save(input);
              probe.completed += 1;
              if (mode === "hold_then_lose") throw new Error("SYNTHETIC_PRIVATE_CREATION_ACK");
              return result;
            },
          };
        },
        updateNotes: async (input) => {
          probe.notes += 1;
          if (probe.notesMode === "fail_before") throw new Error("SYNTHETIC_PRIVATE_NOTE_PATH");
          if (probe.notesMode === "hold")
            await new Promise((resolve) => {
              probe.release = resolve;
            });
          const result = await original.updateNotes(input);
          if (probe.notesMode === "read_failure_after_write") probe.readMode = "failure";
          probe.completed += 1;
          return result;
        },
        read: async (input) => {
          if (probe.readMode === "failure") throw new Error("SYNTHETIC_PRIVATE_READ_PATH");
          if (probe.readMode === "hold")
            await new Promise((resolve) => {
              probe.readRelease = resolve;
            });
          const result = await original.read(input);
          probe.readCompleted += 1;
          return result;
        },
      },
    };
  });
  const primary = page.getByRole("navigation", { name: "Primary", exact: true });
  await primary.getByRole("link", { name: "Pipeline", exact: true }).click();
  await primary.getByRole("link", { name: "Network", exact: true }).click();
  const network = page.getByRole("region", { name: "Stored Network", exact: true });
  const prefix = "  Synthetic <b>Manual</b> ";
  const name = `${prefix}${"x".repeat(512 - prefix.length - 2)}  `;
  expect(name.length).toBe(512);
  const initialNotes = "  Synthetic local company notes\n<script>neverExecute()</script> 🧭  ";
  await network.getByRole("button", { name: "Create local company", exact: true }).click();
  const create = network.getByRole("form", { name: "Create local company", exact: true });
  await expect(create.getByLabel("Company name", { exact: true })).toBeFocused();
  await create.getByLabel("Company name", { exact: true }).fill(name);
  await create
    .getByLabel("Company website (optional)", { exact: true })
    .fill("http://synthetic.example/careers");
  await create.getByLabel("Company domain (optional)", { exact: true }).fill("SYNTHETIC.EXAMPLE");
  await create.getByLabel("Company notes", { exact: true }).fill(initialNotes);
  await create.getByRole("button", { name: "Save local company", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => globalThis.coredrillCompanyWriteProbe.creates))
    .toBe(1);
  await expect(
    create.getByRole("button", { name: "Save local company", exact: true }),
  ).toBeDisabled();
  await expect(
    create.getByRole("button", { name: "Discard company draft", exact: true }),
  ).toBeDisabled();
  await page.setViewportSize({ width: 320, height: 900 });
  await testInfo.attach("company-reflow-label-observation", {
    body: JSON.stringify({
      dom: await page.evaluate((expected) => {
        const control = globalThis.document.querySelector(
          'form[aria-label="Create local company"] textarea',
        );
        return {
          textareaPresent: control !== null,
          exactValueRetained: control?.value === expected,
          wrappingLabelContainsValue:
            control?.closest("label")?.textContent.includes(expected) ?? false,
        };
      }, initialNotes),
      roleMatches: await create
        .getByRole("textbox", { name: "Company notes", exact: true })
        .count(),
      labelMatches: await create.getByLabel("Company notes", { exact: true }).count(),
    }),
    contentType: "application/json",
  });
  await expect(create.getByLabel("Company notes", { exact: true })).toHaveValue(initialNotes);
  await network.getByRole("button", { name: "Contacts", exact: true }).click();
  await expect(network).toContainText("Stored contacts navigation is not connected yet");
  await network.getByRole("button", { name: "Companies", exact: true }).click();
  await expect(create.getByLabel("Company name", { exact: true })).toHaveValue(name);
  await page.evaluate(() => {
    globalThis.coredrillCompanyWriteProbe.release();
  });
  await expect(create).toContainText("Save result uncertain");
  await expect(create.getByLabel("Company notes", { exact: true })).toBeEnabled();
  await expect(create.getByLabel("Company notes", { exact: true })).toHaveJSProperty(
    "readOnly",
    true,
  );
  await expect(
    create.getByRole("button", { name: "Save local company", exact: true }),
  ).toBeDisabled();
  await expect(network).not.toContainText("SYNTHETIC_PRIVATE_CREATION_ACK");
  await create.getByRole("button", { name: "Check stored company state", exact: true }).click();
  await expect(create).toContainText("Stored company now matches this draft");
  expect(await page.evaluate(() => globalThis.coredrillCompanyWriteProbe.creates)).toBe(1);
  await create.getByRole("button", { name: "View saved company", exact: true }).click();
  const detail = network.getByRole("region", { name: "Stored company details", exact: true });
  await expect(detail).toContainText("Company detail read from local storage");
  expect(
    await detail.getByRole("heading", { level: 4, name: name.trim(), exact: true }).textContent(),
  ).toBe(name);
  expect(await detail.locator("p.cd-company-literal").textContent()).toBe(initialNotes);
  await expect(detail).toContainText("http://synthetic.example/careers");
  await expect(detail).toContainText("synthetic.example");
  await expect(detail.locator("script")).toHaveCount(0);
  await create.getByRole("button", { name: "Close saved company draft", exact: true }).click();
  const edit = detail.getByRole("button", { name: "Edit company notes", exact: true });
  await expect(edit).toBeFocused();
  await edit.click();
  const notes = network.getByRole("form", { name: "Edit company notes", exact: true });
  const replacement = "  Replacement local notes\n<b>literal, not evidence</b> 🧭  ";
  await expect(notes.getByLabel("Company notes", { exact: true })).toBeFocused();
  await notes.getByLabel("Company notes", { exact: true }).fill(replacement);
  await page.setViewportSize({ width: 1440, height: 900 });
  await primary.getByRole("link", { name: "Pipeline", exact: true }).click();
  await primary.getByRole("link", { name: "Network", exact: true }).click();
  await expect(network.getByRole("form")).toHaveCount(0);
  await network.getByRole("button", { name: "Return to company draft", exact: true }).click();
  await expect(notes.getByLabel("Company notes", { exact: true })).toHaveValue(replacement);
  await page.evaluate(() => {
    globalThis.coredrillCompanyWriteProbe.notesMode = "fail_before";
  });
  await notes.getByRole("button", { name: "Save company notes", exact: true }).click();
  await expect(notes).toContainText("Save result uncertain");
  await expect(notes.getByLabel("Company notes", { exact: true })).toBeEnabled();
  await expect(notes.getByLabel("Company notes", { exact: true })).toHaveJSProperty(
    "readOnly",
    true,
  );
  await expect(network).not.toContainText("SYNTHETIC_PRIVATE_NOTE_PATH");
  await notes.getByRole("button", { name: "Check stored company state", exact: true }).click();
  await expect(notes).toContainText("Stored company still matches the original view");
  await expect(notes.getByLabel("Company notes", { exact: true })).toHaveValue(replacement);
  await page.evaluate(() => {
    globalThis.coredrillCompanyWriteProbe.notesMode = "read_failure_after_write";
  });
  await notes.getByRole("button", { name: "Save company notes", exact: true }).click();
  await expect(notes).toContainText("Local save acknowledged");
  await expect(detail.getByRole("alert")).toContainText("Retry reads only");
  await expect(detail).toContainText("may be stale");
  await expect(network).not.toContainText("SYNTHETIC_PRIVATE_READ_PATH");
  expect(await page.evaluate(() => globalThis.coredrillCompanyWriteProbe.notes)).toBe(2);
  await page.evaluate(() => {
    globalThis.coredrillCompanyWriteProbe.readMode = "success";
  });
  await detail.getByRole("button", { name: "Refresh selected company", exact: true }).click();
  await expect.poll(() => detail.locator("p.cd-company-literal").textContent()).toBe(replacement);
  expect(await page.evaluate(() => globalThis.coredrillCompanyWriteProbe.notes)).toBe(2);
  await notes.getByRole("button", { name: "Close saved company draft", exact: true }).click();
  // A second company is created through the same normal form, never a storage seed.
  await network.getByRole("button", { name: "Back to companies", exact: true }).click();
  await page.evaluate(() => {
    globalThis.coredrillCompanyWriteProbe.mode = "success";
  });
  await network.getByRole("button", { name: "Create local company", exact: true }).click();
  await create.getByLabel("Company name", { exact: true }).fill("Synthetic Other Company");
  await create
    .getByLabel("Company notes", { exact: true })
    .fill("Other company's unchanged local note");
  await create.getByRole("button", { name: "Save local company", exact: true }).click();
  await expect(create).toContainText("Local save acknowledged");
  await create.getByRole("button", { name: "View saved company", exact: true }).click();
  await expect
    .poll(() => detail.locator("p.cd-company-literal").textContent())
    .toBe("Other company's unchanged local note");
  await create.getByRole("button", { name: "Close saved company draft", exact: true }).click();
  const list = network.getByRole("list", { name: "Stored companies on this page", exact: true });
  const originalRow = list
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name: name.trim(), exact: true }) });
  const otherRow = list
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name: "Synthetic Other Company", exact: true }) });
  await originalRow.getByRole("button", { name: "View company details", exact: true }).click();
  await expect.poll(() => detail.locator("p.cd-company-literal").textContent()).toBe(replacement);
  await edit.click();
  const finalNotes = `${replacement}\nOwned late save, never another company's notes.`;
  await notes.getByLabel("Company notes", { exact: true }).fill(finalNotes);
  await page.evaluate(() => {
    globalThis.coredrillCompanyWriteProbe.notesMode = "hold";
    globalThis.coredrillCompanyWriteProbe.release = null;
  });
  await notes.getByRole("button", { name: "Save company notes", exact: true }).click();
  await page.waitForFunction(() => globalThis.coredrillCompanyWriteProbe.release !== null);
  await otherRow.getByRole("button", { name: "View company details", exact: true }).click();
  await expect(network.getByRole("form", { name: "Edit company notes", exact: true })).toHaveCount(
    0,
  );
  await expect
    .poll(() => detail.locator("p.cd-company-literal").textContent())
    .toBe("Other company's unchanged local note");
  const refresh = detail.getByRole("button", { name: "Refresh selected company", exact: true });
  await page.evaluate(() => {
    const original = globalThis.requestAnimationFrame.bind(globalThis);
    const probe = globalThis.coredrillCompanyWriteProbe;
    probe.focusStage = "manual";
    probe.focusFrames = [];
    probe.restoreAnimationFrame = () => {
      globalThis.requestAnimationFrame = original;
    };
    globalThis.requestAnimationFrame = (callback) => {
      const target = globalThis.document.querySelector("[data-company-detail-refresh]");
      const frame = {
        stage: probe.focusStage,
        enabledAtSchedule: target !== null && !target.disabled,
        enabledAtCallback: null,
      };
      probe.focusFrames.push(frame);
      return original((time) => {
        const committed = globalThis.document.querySelector("[data-company-detail-refresh]");
        frame.enabledAtCallback = committed !== null && !committed.disabled;
        callback(time);
      });
    };
    probe.readMode = "hold";
    probe.readRelease = null;
  });
  const manualReadsBefore = await page.evaluate(
    () => globalThis.coredrillCompanyWriteProbe.readCompleted,
  );
  await refresh.click();
  await page.waitForFunction(() => globalThis.coredrillCompanyWriteProbe.readRelease !== null);
  await expect(refresh).toBeDisabled();
  await page.evaluate(() => {
    const probe = globalThis.coredrillCompanyWriteProbe;
    probe.readMode = "success";
    probe.readRelease();
  });
  await expect
    .poll(() => page.evaluate(() => globalThis.coredrillCompanyWriteProbe.readCompleted))
    .toBe(manualReadsBefore + 1);
  await expect(refresh).toBeEnabled();
  await testInfo.attach("company-detail-manual-focus-commit", {
    body: JSON.stringify(
      await page.evaluate(() => ({
        frames: globalThis.coredrillCompanyWriteProbe.focusFrames,
        refreshActive:
          globalThis.document.activeElement?.matches("[data-company-detail-refresh]") ?? false,
        documentHasFocus: globalThis.document.hasFocus(),
      })),
    ),
    contentType: "application/json",
  });
  await expect(refresh).toBeFocused();
  expect(
    await page.evaluate(() => {
      const frames = globalThis.coredrillCompanyWriteProbe.focusFrames.filter(
        (frame) => frame.stage === "manual",
      );
      return (
        frames.length > 0 &&
        frames.every((frame) => frame.enabledAtSchedule && frame.enabledAtCallback)
      );
    }),
  ).toBe(true);
  const readsBefore = await page.evaluate(
    () => globalThis.coredrillCompanyWriteProbe.readCompleted,
  );
  const completedBefore = await page.evaluate(
    () => globalThis.coredrillCompanyWriteProbe.completed,
  );
  await page.evaluate(() => {
    const probe = globalThis.coredrillCompanyWriteProbe;
    probe.focusStage = "late";
    probe.readMode = "hold";
    probe.readRelease = null;
    probe.release();
  });
  await expect
    .poll(() => page.evaluate(() => globalThis.coredrillCompanyWriteProbe.completed))
    .toBe(completedBefore + 1);
  await page.waitForFunction(() => globalThis.coredrillCompanyWriteProbe.readRelease !== null);
  await expect(refresh).toBeDisabled();
  await page.evaluate(() => {
    const probe = globalThis.coredrillCompanyWriteProbe;
    probe.readMode = "success";
    probe.readRelease();
  });
  await expect
    .poll(() => page.evaluate(() => globalThis.coredrillCompanyWriteProbe.readCompleted))
    .toBeGreaterThan(readsBefore);
  await expect(refresh).toBeFocused();
  expect(
    await page.evaluate(() => {
      const frames = globalThis.coredrillCompanyWriteProbe.focusFrames.filter(
        (frame) => frame.stage === "late",
      );
      return (
        frames.length > 0 &&
        frames.every((frame) => frame.enabledAtSchedule && frame.enabledAtCallback)
      );
    }),
  ).toBe(true);
  expect(await detail.locator("p.cd-company-literal").textContent()).toBe(
    "Other company's unchanged local note",
  );
  await expect(detail).not.toContainText(finalNotes);
  await page.evaluate(() => {
    const probe = globalThis.coredrillCompanyWriteProbe;
    probe.focusStage = "deliberate";
    probe.readMode = "hold";
    probe.readRelease = null;
  });
  await refresh.click();
  await page.waitForFunction(() => globalThis.coredrillCompanyWriteProbe.readRelease !== null);
  await expect(refresh).toBeDisabled();
  const deliberate = network.getByRole("button", { name: "Companies", exact: true });
  await deliberate.focus();
  await page.evaluate(() => {
    const probe = globalThis.coredrillCompanyWriteProbe;
    probe.readMode = "success";
    probe.readRelease();
  });
  await expect(refresh).toBeEnabled();
  await expect
    .poll(() =>
      page.evaluate(() =>
        globalThis.coredrillCompanyWriteProbe.focusFrames.some(
          (frame) => frame.stage === "deliberate" && frame.enabledAtCallback !== null,
        ),
      ),
    )
    .toBe(true);
  await expect(deliberate).toBeFocused();
  await testInfo.attach("company-detail-complete-focus-commit", {
    body: JSON.stringify(
      await page.evaluate(() => ({
        frames: globalThis.coredrillCompanyWriteProbe.focusFrames,
        deliberateActive: globalThis.document.activeElement?.textContent === "Companies",
        documentHasFocus: globalThis.document.hasFocus(),
      })),
    ),
    contentType: "application/json",
  });
  await page.evaluate(() => globalThis.coredrillCompanyWriteProbe.restoreAnimationFrame());
  await network.getByRole("button", { name: "Return to company draft", exact: true }).click();
  await expect(notes).toContainText("Local save acknowledged");
  await expect.poll(() => detail.locator("p.cd-company-literal").textContent()).toBe(finalNotes);
  await notes.getByRole("button", { name: "Close saved company draft", exact: true }).click();
  const selectedUrl = page.url();
  await page.reload();
  expect(page.url()).toBe(selectedUrl);
  await expect.poll(() => detail.locator("p.cd-company-literal").textContent()).toBe(finalNotes);
  await expect(
    detail.getByRole("heading", { level: 4, name: name.trim(), exact: true }),
  ).toBeVisible();
  await edit.click();
  await notes
    .getByLabel("Company notes", { exact: true })
    .fill(`${finalNotes}\nUnsaved reflow text`);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await expect(notes.getByLabel("Company notes", { exact: true })).toHaveValue(
    `${finalNotes}\nUnsaved reflow text`,
  );
  const documentOrigin = await page.evaluate(() => globalThis.performance.timeOrigin);
  let handled;
  let rejected;
  const warning = new Promise((resolve, reject) => {
    handled = resolve;
    rejected = reject;
  });
  const handleDialog = (dialog) => {
    void dialog.dismiss().then(() => handled(dialog.type()), rejected);
  };
  page.on("dialog", handleDialog);
  const attemptedReload = page.evaluate(() => globalThis.location.reload()).catch(() => null);
  expect(await warning).toBe("beforeunload");
  await attemptedReload;
  page.off("dialog", handleDialog);
  expect(await page.evaluate(() => globalThis.performance.timeOrigin)).toBe(documentOrigin);
  await expect(notes.getByLabel("Company notes", { exact: true })).toHaveValue(
    `${finalNotes}\nUnsaved reflow text`,
  );
  expect(
    await page.evaluate(
      () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth,
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await network.screenshot({ path: testInfo.outputPath("company-workspace-320.png") });
  await notes
    .getByLabel("Company notes", { exact: true })
    .screenshot({ path: testInfo.outputPath("company-notes-control-320.png") });
  await notes.getByRole("button", { name: "Discard company draft", exact: true }).click();
  await expect(notes).toContainText("does not undo any possibly committed save");
  await notes.getByRole("button", { name: "Keep company draft", exact: true }).click();
  await expect(notes.getByLabel("Company notes", { exact: true })).toHaveValue(
    `${finalNotes}\nUnsaved reflow text`,
  );
  await notes.getByRole("button", { name: "Discard company draft", exact: true }).click();
  await notes.getByRole("button", { name: "Confirm discard company draft", exact: true }).click();
  await expect(edit).toBeFocused();
  if (priorViewport !== null) await page.setViewportSize(priorViewport);
  await page.emulateMedia({
    forcedColors: priorMedia.forced ? "active" : "none",
    reducedMotion: priorMedia.reduced ? "reduce" : "no-preference",
  });
  return {
    normalManualCreation: true,
    fixedIdLostAckRecoveredWithoutRepeatWrite: true,
    notesOriginalVersionRetained: true,
    failedReadbackRetriesReadOnly: true,
    reloadSelectedRoute: true,
    reflowAndAxe: true,
    noFixtureInstaller: true,
    lateOtherCompanyReadAndFocusPreserved: true,
    heldReadFocusRestoredAfterEnabledCommit: true,
    deliberateFocusDuringReadPreserved: true,
    cancelledReloadRetainsExactUnsavedDraft: true,
  };
};
