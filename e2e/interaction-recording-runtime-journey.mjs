import { expect } from "@playwright/test";

/** Real selected-runtime API/SQLite proof, not yet a normal composer journey. */
export const exerciseInteractionRecordingRuntime = async (page, testInfo) => {
  const first = await page.evaluate(async () => {
    const api = globalThis.coredrillStorageSpike;
    const identity = await api.vault.inspect(),
      jobs = await api.pipeline.page({ limit: 1 });
    if (!identity.ok || identity.value.vault === null || !jobs.ok || jobs.value.items.length !== 1)
      throw new Error("Synthetic interaction owner unavailable.");
    const vaultId = identity.value.vault.id,
      job = jobs.value.items[0];
    const created = await api.contactWorkspace
      .beginCreation(vaultId)
      .save({ origin: "user_entered", name: "Synthetic interaction runtime contact" });
    if (!created.ok) throw new Error("Synthetic contact unavailable.");
    const contactId = created.value.contact.id;
    const scope = {
      specVersion: 1,
      expectedVaultId: vaultId,
      jobId: job.id,
      jobRowVersion: job.rowVersion,
      contactId,
      contactRowVersion: created.value.contact.rowVersion,
    };
    const fields = {
      type: "note",
      direction: "unknown",
      summary: "  exact 🧭 <script>literal</script>  ",
    };
    const beforeInvalid = (await api.exportPortable()).sha256;
    const invalidDraft = api.interactionRecording.beginRecording(scope);
    const invalid = await invalidDraft.save({ ...fields, occurredAt: null });
    invalidDraft.dispose();
    const afterInvalid = (await api.exportPortable()).sha256;
    const missingDraft = api.interactionRecording.beginRecording({
      ...scope,
      jobId: "0198e109-0000-7000-8000-000000000099",
    });
    const missingSave = await missingDraft.save(fields);
    const beforeCheck = (await api.exportPortable()).sha256;
    const missingCheck = await missingDraft.check();
    const afterCheck = (await api.exportPortable()).sha256;
    missingDraft.dispose();
    const records = [];
    for (const type of ["note", "call", "email_logged", "meeting", "referral", "follow_up"]) {
      const summary = type === "meeting" ? "\uFEFF" + "x".repeat(199997) + "🧭" : fields.summary;
      const draft = api.interactionRecording.beginRecording(scope);
      const saved = await draft.save({ ...fields, type, summary });
      const duplicate = await draft.save({ ...fields, type, summary });
      if (
        !saved.ok ||
        saved.value.summary !== summary ||
        saved.value.id !== draft.interactionId ||
        duplicate.ok
      )
        throw new Error(
          JSON.stringify({
            failure: "original_interaction_acknowledgement",
            type,
            saved: saved.ok,
            errorCode: saved.ok ? null : saved.error.code,
            summaryEqual: saved.ok ? saved.value.summary === summary : null,
            identityEqual: saved.ok ? saved.value.id === draft.interactionId : null,
            duplicateAccepted: duplicate.ok,
            phase: draft.phase(),
          }),
        );
      records.push({ id: saved.value.id, type, occurredAt: saved.value.occurredAt });
    }
    let lostAck = null;
    if (typeof globalThis.coredrillArmInteractionAckLoss === "function") {
      const draft = api.interactionRecording.beginRecording(scope);
      await globalThis.coredrillArmInteractionAckLoss(draft.interactionId);
      const failed = await draft.save({ ...fields, type: "call" });
      const blocked = await draft.save({ ...fields, type: "call" });
      const before = (await api.exportPortable()).sha256;
      const checked = await draft.check();
      const after = (await api.exportPortable()).sha256;
      const blockedAfter = await draft.save({ ...fields, type: "call" });
      lostAck = {
        failed: !failed.ok,
        blocked: !blocked.ok,
        checked,
        unchangedByCheck: before === after,
        blockedAfter: !blockedAfter.ok,
      };
      if (!checked.ok || checked.value.state !== "recorded")
        throw new Error("Lost native commit acknowledgement was not recovered by a read.");
      records.push({
        id: draft.interactionId,
        type: "call",
        occurredAt: checked.value.interaction.occurredAt,
      });
      // Keep the witness content-free; exact summary identity is checked inside the runtime query.
      lostAck.checked = { ok: true, state: checked.value.state, id: checked.value.interaction.id };
    }
    const history = await api.contactHistory.page({
      specVersion: 1,
      expectedVaultId: vaultId,
      contactId,
    });
    if (!history.ok || history.value.items.length !== records.length)
      throw new Error("Recorded history lost or duplicated interactions.");
    return {
      vaultId,
      jobId: job.id,
      contactId,
      records,
      invalidRejected: !invalid.ok,
      invalidUnchanged: beforeInvalid === afterInvalid,
      missingSaveRejected: !missingSave.ok,
      missingCheck,
      absenceCheckUnchanged: beforeCheck === afterCheck,
      lostAck,
    };
  });
  expect(first.invalidRejected).toBe(true);
  expect(first.invalidUnchanged).toBe(true);
  expect(first.missingSaveRejected).toBe(true);
  expect(first.missingCheck).toMatchObject({
    ok: true,
    value: { state: "not_recorded", interaction: null },
  });
  expect(first.absenceCheckUnchanged).toBe(true);
  if (first.lostAck !== null) {
    expect(first.lostAck).toMatchObject({
      failed: true,
      blocked: true,
      unchangedByCheck: true,
      blockedAfter: true,
      checked: { ok: true, state: "recorded" },
    });
  }
  await page.reload();
  await page.waitForFunction(() => globalThis.coredrillStorageSpike !== undefined);
  const restored = await page.evaluate(async ({ vaultId, contactId }) => {
    const api = globalThis.coredrillStorageSpike;
    const page = await api.contactHistory.page({
      specVersion: 1,
      expectedVaultId: vaultId,
      contactId,
    });
    if (!page.ok) throw new Error("Recorded history unavailable after reload.");
    const large = page.value.items.find((item) => item.type === "meeting");
    if (large === undefined) throw new Error("Large original summary missing.");
    const reference = {
      specVersion: 1,
      vaultId,
      contactId,
      includeArchived: false,
      contactRowVersion: page.value.contactRowVersion,
      occurredAt: large.occurredAt,
      id: large.id,
      rowVersion: large.rowVersion,
      jobId: large.currentJob.id,
      jobRowVersion: large.currentJob.rowVersion,
    };
    let byteOffset = 0,
      text = "",
      parts = 0;
    while (true) {
      const result = await api.contactHistory.summaryPart({
        specVersion: 1,
        reference,
        summaryByteLength: large.summaryByteLength,
        byteOffset,
        limitBytes: 65536,
      });
      if (!result.ok) throw new Error("Full recorded summary was not retained.");
      text += result.value.text;
      parts++;
      if (!result.value.hasMore) break;
      if (parts > 16) throw new Error("Unexpected summary continuation.");
      byteOffset = result.value.nextByteOffset;
    }
    return {
      records: page.value.items.map(({ id, type, occurredAt }) => ({ id, type, occurredAt })),
      fullSummaryExact: text === "\uFEFF" + "x".repeat(199997) + "🧭",
      parts,
    };
  }, first);
  expect(restored.records.sort((a, b) => a.id.localeCompare(b.id))).toEqual(
    first.records.sort((a, b) => a.id.localeCompare(b.id)),
  );
  expect(restored.fullSummaryExact).toBe(true);
  expect(restored.parts).toBeGreaterThan(1);
  const proof = {
    ...first,
    ...restored,
    normalRuntimeApi: true,
    normalComposer: false,
    noFixtureInstaller: true,
    noSending: true,
    schemaChanged: false,
  };
  await testInfo.attach("interaction-recording-runtime.json", {
    body: JSON.stringify(proof, null, 2),
    contentType: "application/json",
  });
  return proof;
};
