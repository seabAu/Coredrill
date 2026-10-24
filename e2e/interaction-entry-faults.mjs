import { expect } from "@playwright/test";

/** Test-only acknowledgement fault after an actual browser Worker COMMIT succeeds. */
export const installInteractionCommitProbe = async (page) => {
  await page.addInitScript(() => {
    const states = new WeakMap();
    const post = globalThis.Worker.prototype.postMessage;
    const add = globalThis.Worker.prototype.addEventListener;
    globalThis.Worker.prototype.postMessage = function (request, ...rest) {
      if (
        globalThis.interactionEntryProbe?.failBeforeInsert === true &&
        request?.operation === "execute" &&
        request.statement?.sql?.includes("INSERT INTO interaction(")
      ) {
        globalThis.interactionEntryProbe.failBeforeInsert = false;
        this.dispatchEvent(
          new globalThis.MessageEvent("message", {
            data: {
              version: request.version,
              id: request.id,
              ok: false,
              error: { name: "Error", message: "Synthetic refusal before insert" },
            },
          }),
        );
        return;
      }
      let state = states.get(this);
      if (!state) {
        state = {};
        states.set(this, state);
      }
      if (
        globalThis.interactionEntryProbe?.loseCommit === true &&
        request?.operation === "execute" &&
        request.statement?.sql?.includes("INSERT INTO interaction(")
      )
        state.interaction = true;
      if (request?.operation === "commit" && state.interaction) {
        state.commitId = request.id;
        state.interaction = false;
      }
      return post.call(this, request, ...rest);
    };
    globalThis.Worker.prototype.addEventListener = function (type, listener, ...rest) {
      if (type !== "message" || typeof listener !== "function")
        return add.call(this, type, listener, ...rest);
      const wrapped = (event) => {
        const state = states.get(this);
        if (state?.commitId === event.data?.id && event.data.ok === true) {
          state.commitId = null;
          globalThis.interactionEntryProbe.loseCommit = false;
          globalThis.interactionEntryProbe.lostCommits += 1;
          return listener.call(
            this,
            new globalThis.MessageEvent("message", {
              data: {
                version: event.data.version,
                id: event.data.id,
                ok: false,
                error: { name: "Error", message: "Synthetic lost committed acknowledgement" },
              },
            }),
          );
        }
        return listener.call(this, event);
      };
      return add.call(this, type, wrapped, ...rest);
    };
  });
};

export const exerciseInteractionEntryFaults = async (page, testInfo) => {
  const primary = page.getByRole("navigation", { name: "Primary", exact: true });
  const entry = page.getByRole("region", { name: "Record local interaction", exact: true });
  const contactUrl = page.url();
  const owner = await page.evaluate(async () => {
    const api = globalThis.coredrillStorageSpike;
    const result = await api.pipeline.page({ limit: 1 });
    if (!result.ok) throw new Error("Read unavailable");
    const job = result.value.items[0];
    const probe = {
      saves: 0,
      checks: 0,
      lostCommits: 0,
      loseCommit: false,
      failBeforeInsert: false,
      identities: [],
      hold: false,
      release: null,
    };
    globalThis.interactionEntryProbe = probe;
    const original = api.interactionRecording;
    globalThis.coredrillStorageSpike = {
      ...api,
      interactionRecording: {
        ...original,
        beginRecording: (scope) => {
          const recording = original.beginRecording(scope);
          probe.identities.push(recording.interactionId);
          return {
            ...recording,
            save: async (fields) => {
              probe.saves += 1;
              if (
                probe.failBeforeInsert &&
                typeof globalThis.coredrillArmInteractionWriteFailure === "function"
              ) {
                await globalThis.coredrillArmInteractionWriteFailure(recording.interactionId);
                probe.failBeforeInsert = false;
              }
              if (probe.hold)
                await new Promise((resolve) => {
                  probe.release = resolve;
                });
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
    return { jobId: job.id, title: job.title };
  });
  await entry.getByLabel("Linked stored job", { exact: true }).selectOption(owner.jobId);
  await entry.getByRole("button", { name: "New interaction", exact: true }).click();
  const text = "Private synthetic pending interaction 🧭";
  await entry.getByLabel("Interaction summary", { exact: true }).fill(text);
  await page.evaluate(() => {
    globalThis.interactionEntryProbe.hold = true;
    globalThis.interactionEntryProbe.loseCommit = true;
  });
  await entry.getByRole("button", { name: "Record interaction", exact: true }).click();
  await expect.poll(() => page.evaluate(() => globalThis.interactionEntryProbe.saves)).toBe(1);
  await expect(entry.getByLabel("Interaction summary", { exact: true })).toBeDisabled();
  await expect(
    entry.getByRole("button", { name: "Discard interaction draft", exact: true }),
  ).toBeDisabled();
  await page.setViewportSize({ width: 320, height: 900 });
  await expect(entry.getByLabel("Interaction summary", { exact: true })).toHaveValue(text);
  // The shared vault lock must stop preparation/deletion while the form owns a pending write.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Prepare portable archive", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Review vault deletion", exact: true }),
  ).toBeDisabled();
  await primary.getByRole("link", { name: "Pipeline", exact: true }).click();
  await page.locator('[data-pipeline-view-option="table"]').click();
  await page.getByRole("button", { name: owner.title, exact: true }).click();
  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  await expect(entry.getByLabel("Interaction summary", { exact: true })).toHaveCount(0);
  expect(await page.locator("body").innerText()).not.toContain(text);
  const deliberate = page.getByRole("button", { name: "Timeline", exact: true });
  await deliberate.focus();
  await page.evaluate(() => globalThis.interactionEntryProbe.release());
  await expect(entry.getByRole("status")).toContainText("Save acknowledgement uncertain");
  await expect(deliberate).toBeFocused();
  await expect(entry.getByLabel("Interaction summary", { exact: true })).toHaveCount(0);
  await primary.getByRole("link", { name: "Network", exact: true }).click();
  const network = page.getByRole("region", { name: "Stored Network", exact: true });
  await network.getByRole("button", { name: "Contacts", exact: true }).click();
  await network
    .getByRole("listitem")
    .filter({
      has: page.getByRole("heading", { name: "Synthetic interaction entry contact", exact: true }),
    })
    .getByRole("button", { name: "View contact details", exact: true })
    .click();
  await expect(entry.getByLabel("Interaction summary", { exact: true })).toHaveAttribute(
    "readonly",
    "",
  );
  await expect(entry.getByRole("button", { name: "Record interaction", exact: true })).toHaveCount(
    0,
  );
  const before = await page.evaluate(
    async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
  );
  await entry.getByRole("button", { name: "Check original acknowledgement", exact: true }).click();
  await expect(entry.getByRole("status")).toContainText(
    "Original interaction found by a read-only check",
  );
  const after = await page.evaluate(
    async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
  );
  expect(after).toBe(before);
  expect(
    await page.evaluate(() => ({
      saves: globalThis.interactionEntryProbe.saves,
      checks: globalThis.interactionEntryProbe.checks,
    })),
  ).toEqual({ saves: 1, checks: 1 });
  await entry.getByRole("button", { name: "Close recorded interaction", exact: true }).click();
  await entry.getByRole("button", { name: "New interaction", exact: true }).click();
  await entry
    .getByLabel("Interaction summary", { exact: true })
    .fill("Identical retry after explicit absence");
  await page.evaluate(() => {
    globalThis.interactionEntryProbe.failBeforeInsert = true;
    globalThis.interactionEntryProbe.hold = false;
  });
  await entry.getByRole("button", { name: "Record interaction", exact: true }).click();
  await expect(entry.getByRole("status")).toContainText("Save acknowledgement uncertain");
  await entry.getByRole("button", { name: "Check original acknowledgement", exact: true }).click();
  await expect(entry.getByRole("status")).toContainText("Read-only check found no original record");
  const originalIdentity = await page.evaluate(() =>
    globalThis.interactionEntryProbe.identities.at(-1),
  );
  await expect(entry.getByLabel("Interaction summary", { exact: true })).toHaveAttribute(
    "readonly",
    "",
  );
  await entry.getByRole("button", { name: "Retry identical interaction", exact: true }).click();
  await expect(entry.getByRole("status")).toContainText("Interaction save acknowledged");
  expect(await page.evaluate(() => globalThis.interactionEntryProbe.identities)).toHaveLength(2);
  const retryRecords = await page.evaluate(async (id) => {
    const api = globalThis.coredrillStorageSpike;
    const identity = await api.vault.inspect();
    if (!identity.ok || !identity.value.vault) throw new Error("Vault read unavailable");
    const result = await api.contactHistory.page({
      specVersion: 1,
      expectedVaultId: identity.value.vault.id,
      contactId: new URL(globalThis.location.href).pathname.split("/").at(-1),
      includeArchived: false,
    });
    if (!result.ok) throw new Error("Canonical retry read unavailable");
    return result.value.items.filter((item) => item.id === id);
  }, originalIdentity);
  expect(retryRecords).toHaveLength(1);
  expect(retryRecords[0]).toMatchObject({
    id: originalIdentity,
    summaryPreview: "Identical retry after explicit absence",
  });
  expect(
    await page.evaluate(() => ({
      saves: globalThis.interactionEntryProbe.saves,
      checks: globalThis.interactionEntryProbe.checks,
    })),
  ).toEqual({ saves: 3, checks: 2 });
  await entry.getByRole("button", { name: "Close recorded interaction", exact: true }).click();
  // A new unsaved contact draft stays private under another normal selection.
  await entry.getByRole("button", { name: "New interaction", exact: true }).click();
  await entry
    .getByLabel("Interaction summary", { exact: true })
    .fill("PRIVATE_FOREIGN_DRAFT_SENTINEL");
  await primary.getByRole("link", { name: "Pipeline", exact: true }).click();
  await page.locator('[data-pipeline-view-option="table"]').click();
  await page.getByRole("button", { name: owner.title, exact: true }).click();
  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  await expect(entry).toContainText("private fields are hidden");
  await expect(entry.getByLabel("Interaction summary", { exact: true })).toHaveCount(0);
  expect(await page.locator("body").innerText()).not.toContain("PRIVATE_FOREIGN_DRAFT_SENTINEL");
  await page.getByRole("button", { name: "Set next action", exact: true }).click();
  const task = page.getByRole("form", { name: "Add local next action", exact: true });
  await task
    .getByRole("textbox", { name: "Task title", exact: true })
    .fill("Synthetic owner revision change");
  await task.getByRole("button", { name: "Save local next action", exact: true }).click();
  await expect(task).toHaveCount(0);
  await primary.getByRole("link", { name: "Network", exact: true }).click();
  await network.getByRole("button", { name: "Contacts", exact: true }).click();
  await network
    .getByRole("listitem")
    .filter({
      has: page.getByRole("heading", { name: "Synthetic interaction entry contact", exact: true }),
    })
    .getByRole("button", { name: "View contact details", exact: true })
    .click();
  await expect(entry.getByLabel("Interaction summary", { exact: true })).toHaveValue(
    "PRIVATE_FOREIGN_DRAFT_SENTINEL",
  );
  await expect(
    entry.getByRole("button", { name: "Record interaction", exact: true }),
  ).toBeDisabled();
  await expect(entry).toContainText("original viewed owner/version is unavailable or changed");
  await entry.getByRole("button", { name: "Discard interaction draft", exact: true }).click();
  await entry.getByRole("button", { name: "Keep interaction draft", exact: true }).click();
  await entry.getByRole("button", { name: "Discard interaction draft", exact: true }).click();
  await entry
    .getByRole("button", { name: "Confirm discard interaction draft", exact: true })
    .click();
  await expect(entry.getByRole("button", { name: "New interaction", exact: true })).toBeFocused();
  await page.goto(contactUrl);
  const proof = {
    heldWriteAndReflow: true,
    vaultExclusion: true,
    actualCommittedLostAcknowledgement: true,
    readOnlyHashUnchanged: true,
    saves: 3,
    checks: 2,
    explicitAbsentIdenticalRetry: true,
    staleViewedJobCannotRebase: true,
    lateForeignAcknowledgementHidden: true,
    foreignDraftHiddenAndExplicitDiscard: true,
    deliberateFocusPreserved: true,
  };
  await testInfo.attach("interaction-entry-faults.json", {
    body: JSON.stringify(proof),
    contentType: "application/json",
  });
  return proof;
};
