import { describe, expect, it, vi } from "vitest";
import { createStoredJobSourceReader } from "../../apps/web/src/stored-job-source-reader.ts";

const jobId = "0198e207-0000-7000-8000-000000000001";
const a = "0198e207-0000-7000-8000-000000000002";
const b = "0198e207-0000-7000-8000-000000000003";
const id = "0198e207-0000-7000-8000-000000000004";
const snapshot = (snapshotId) => ({
  id: snapshotId,
  jobId,
  capturedAt: snapshotId === a ? "2026-10-19T12:00:00.000Z" : "2026-10-19T11:00:00.000Z",
});
const success = (value) => ({ ok: true, value });
const history = (items = [snapshot(a), snapshot(b)], nextCursor = null) => ({
  jobId,
  items,
  nextCursor,
  hasMore: nextCursor !== null,
});
const item = { kind: "field-value", id, jobId, snapshotId: a, currentReview: { rowVersion: 1 } };
const evidence = (snapshotId = a, items = [item], nextCursor = null) => ({
  jobId,
  snapshotId,
  items,
  nextCursor,
  hasMore: nextCursor !== null,
});
const body = (snapshotId = a, kind = "text", nextCursor = null) => ({
  jobId,
  snapshotId,
  kind,
  text: "first literal part",
  byteOffset: 0,
  nextCursor,
  hasMore: nextCursor !== null,
});
const value = (part = "normalized", nextCursor = null) => ({
  jobId,
  snapshotId: a,
  evidenceKind: "field-value",
  evidenceId: id,
  part,
  text: "first JSON part",
  nextCursor,
  hasMore: nextCursor !== null,
  rowVersion: 1,
});
const setup = () => {
  const api = {
    sourceComparison: vi.fn().mockResolvedValue(success(comparison())),
    sourceSnapshots: vi.fn().mockResolvedValue(success(history())),
    sourceContent: vi.fn((input) => Promise.resolve(success(body(input.snapshotId, input.kind)))),
    sourceEvidence: vi.fn((input) => Promise.resolve(success(evidence(input.snapshotId)))),
    sourceValue: vi.fn((input) => Promise.resolve(success(value(input.part)))),
  };
  const changed = vi.fn();
  const reader = createStoredJobSourceReader(jobId, () => api, changed);
  return { api, reader, changed };
};

const comparisonFact = (rawValueJson = null) => ({
  key: "retained-requirement-slot",
  valueJson: JSON.stringify({ text: "\uFEFFé中🙂 <script>neverExecute()</script> ".repeat(2500) }),
  sourceValueJson: JSON.stringify("exact source candidate"),
  rawValueJson,
  candidateId: null,
  sourceType: "capture",
  sourceId: id,
  sourcePointer: "/content/apiPayload/qualifications/0",
});
const comparison = (rawValueJson = null) => ({
  specVersion: 1,
  jobId,
  baselineSnapshotId: b,
  currentSnapshotId: a,
  baselineCapturedAt: snapshot(b).capturedAt,
  currentCapturedAt: snapshot(a).capturedAt,
  analyzedAt: "2026-10-20T04:00:00.000Z",
  refreshPerformed: false,
  trustedFieldMutationPerformed: false,
  fields: {
    requirements: {
      before: { items: [comparisonFact(rawValueJson)], absenceEvidence: [] },
      after: { items: [comparisonFact(rawValueJson)], absenceEvidence: [] },
    },
  },
});
const selectCompared = async () => {
  const setupValue = setup();
  await setupValue.reader.reload();
  await setupValue.reader.select("comparison", b);
  await setupValue.reader.compare();
  return setupValue;
};
const selection = (patch = {}) => ({
  analysisTime: comparison().analyzedAt,
  side: "after",
  field: "requirements",
  index: 0,
  key: comparisonFact().key,
  part: "comparison",
  ...patch,
});

describe("normal Source structured comparison lifetime and bounded inspector", () => {
  it("never compares automatically and uses the explicit pair in chronological order", async () => {
    const { api, reader } = setup();
    expect(await reader.compare()).toBe(false);
    await reader.reload();
    expect(api.sourceComparison).not.toHaveBeenCalled();
    await reader.select("comparison", b);
    expect(api.sourceComparison).not.toHaveBeenCalled();
    await reader.compare();
    expect(api.sourceComparison).toHaveBeenCalledExactlyOnceWith({
      jobId,
      baselineSnapshotId: b,
      currentSnapshotId: a,
    });
    expect(reader.current().listingChanges).toEqual(comparison());
  });
  it("reconstructs complete Unicode literal JSON in scalar-safe bounded replacement parts", async () => {
    const { api, reader } = await selectCompared();
    await reader.inspectComparison(selection());
    let actual = "";
    let offset = 0;
    let more = true;
    while (more) {
      const part = reader.current().comparisonLiteral;
      expect(part.byteOffset).toBe(offset);
      expect(part.bytesRead).toBeLessThanOrEqual(32768);
      actual += part.text;
      offset += part.bytesRead;
      more = part.hasMore;
      if (more) await reader.comparisonPart(true);
    }
    expect(actual).toBe(comparisonFact().valueJson);
    expect(offset).toBe(new globalThis.TextEncoder().encode(actual).byteLength);
    expect(await reader.comparisonPart(true)).toBe(false);
    await reader.comparisonPart(false);
    expect(reader.current().comparisonLiteral.byteOffset).toBe(0);
    expect(api.sourceComparison).toHaveBeenCalledTimes(1);
    expect(api.sourceContent).toHaveBeenCalledTimes(2);
  });
  it("inspects explicit absence evidence without inventing a retained item", async () => {
    const { api, reader } = await selectCompared();
    const result = comparison();
    const absent = {
      ...comparisonFact(),
      key: "explicit-empty-array",
      valueJson: "[]",
      sourceValueJson: "[]",
    };
    result.fields.requirements.after = { items: [], absenceEvidence: [absent] };
    api.sourceComparison.mockResolvedValueOnce(success(result));
    await reader.compare();
    expect(await reader.inspectComparison(selection({ key: absent.key }))).toBe(true);
    expect(reader.current().comparisonLiteral).toMatchObject({
      text: "[]",
      byteLength: 2,
      hasMore: false,
    });
    expect(await reader.inspectComparison(selection({ key: absent.key, index: 1 }))).toBe(false);
  });
  it("keeps absent raw, JSON null and serialized empty string distinct", async () => {
    const { api, reader } = await selectCompared();
    await reader.inspectComparison(selection({ part: "raw" }));
    expect(reader.current().comparisonLiteral).toMatchObject({
      text: null,
      byteLength: null,
      bytesRead: 0,
      hasMore: false,
    });
    for (const raw of ["null", '""']) {
      api.sourceComparison.mockResolvedValueOnce(success(comparison(raw)));
      await reader.compare();
      await reader.inspectComparison(selection({ part: "raw" }));
      expect(reader.current().comparisonLiteral).toMatchObject({
        text: raw,
        byteLength: new globalThis.TextEncoder().encode(raw).byteLength,
      });
    }
  });
  it.each([
    { analysisTime: "old" },
    { key: "foreign" },
    { index: -1 },
    { index: 100 },
    { side: "foreign" },
    { field: "foreign" },
    { part: "foreign" },
  ])("ignores stale or invalid inspector identity without changing prior data", async (patch) => {
    const { reader } = await selectCompared();
    await reader.inspectComparison(selection());
    const before = reader.current();
    expect(await reader.inspectComparison(selection(patch))).toBe(false);
    expect(reader.current()).toBe(before);
  });
  it("clears obsolete comparisons/parts on snapshot selection, removal and newest reset", async () => {
    const { reader } = await selectCompared();
    await reader.inspectComparison(selection());
    await reader.select("primary", a);
    expect(reader.current()).toMatchObject({ listingChanges: null, comparisonLiteral: null });
    await reader.compare();
    await reader.select("comparison", "");
    expect(reader.current()).toMatchObject({
      listingChanges: null,
      comparisonLiteral: null,
      comparison: null,
    });
    await reader.select("comparison", b);
    await reader.compare();
    await reader.reload();
    expect(reader.current()).toMatchObject({ listingChanges: null, comparisonLiteral: null });
  });
  it("retains a prior result and literal part on failure, redacts errors, and retries the same explicit pair", async () => {
    const { api, reader } = await selectCompared();
    await reader.inspectComparison(selection());
    const prior = reader.current().listingChanges;
    const literal = reader.current().comparisonLiteral;
    api.sourceComparison.mockRejectedValueOnce(new Error("C:/private/source"));
    await reader.compare();
    expect(reader.current().listingChanges).toBe(prior);
    expect(reader.current().comparisonLiteral).toBe(literal);
    expect(reader.current().error).not.toContain("private");
    await reader.retry();
    expect(reader.current()).toMatchObject({ error: null, comparisonLiteral: null });
  });
  it.each([
    { currentSnapshotId: b },
    { jobId: b },
    { baselineCapturedAt: snapshot(a).capturedAt },
    { refreshPerformed: true },
    { trustedFieldMutationPerformed: true },
    { specVersion: 2 },
  ])(
    "rejects mismatched or non-read-only comparison echoes without publishing success",
    async (patch) => {
      const { api, reader } = await selectCompared();
      const prior = reader.current().listingChanges;
      api.sourceComparison.mockResolvedValueOnce(success({ ...comparison(), ...patch }));
      await reader.compare();
      expect(reader.current().listingChanges).toBe(prior);
      expect(reader.current().error).not.toBeNull();
    },
  );
  it("keeps comparison single-flight and suppresses results after owner disposal", async () => {
    const { api, reader, changed } = await selectCompared();
    let release;
    api.sourceComparison.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const pending = reader.compare();
    expect(await reader.compare()).toBe(false);
    expect(await reader.inspectComparison(selection())).toBe(false);
    reader.dispose();
    const count = changed.mock.calls.length;
    release(success(comparison()));
    expect(await pending).toBe(false);
    expect(changed).toHaveBeenCalledTimes(count);
  });
  it("does not invent order for equal capture timestamps", async () => {
    const { api, reader } = setup();
    api.sourceSnapshots.mockResolvedValueOnce(
      success(history([snapshot(a), { ...snapshot(b), capturedAt: snapshot(a).capturedAt }])),
    );
    await reader.reload();
    await reader.select("comparison", b);
    expect(await reader.compare()).toBe(false);
    expect(api.sourceComparison).not.toHaveBeenCalled();
  });
});

describe("root-owned bounded normal Source coordination", () => {
  it("does not read until requested, then inspects one newest snapshot without choosing a comparison", async () => {
    const { api, reader } = setup();
    expect(api.sourceSnapshots).not.toHaveBeenCalled();
    await reader.reload();
    expect(api.sourceSnapshots).toHaveBeenCalledWith({ jobId, limit: 10 });
    expect(api.sourceContent).toHaveBeenCalledWith({ jobId, snapshotId: a, kind: "text" });
    expect(reader.current()).toMatchObject({
      jobId,
      primary: { snapshot: snapshot(a) },
      comparison: null,
      busy: false,
      error: null,
    });
    expect(Object.isFrozen(reader.current())).toBe(true);
  });
  it("returns an honest empty history without inventing a source or reading content", async () => {
    const { api, reader } = setup();
    api.sourceSnapshots.mockResolvedValue(success(history([])));
    await reader.reload();
    expect(reader.current()).toMatchObject({
      history: { items: [] },
      primary: null,
      comparison: null,
      error: null,
    });
    expect(api.sourceContent).not.toHaveBeenCalled();
    expect(api.sourceEvidence).not.toHaveBeenCalled();
  });
  it.each(["history", "content", "evidence"])(
    "rejects wrong-job/snapshot %s output and retains previously read evidence",
    async (kind) => {
      const { api, reader } = setup();
      await reader.reload();
      const previous = reader.current().primary;
      if (kind === "history")
        api.sourceSnapshots.mockResolvedValueOnce(success({ ...history(), jobId: b }));
      if (kind === "content")
        api.sourceContent.mockResolvedValueOnce(success({ ...body(), snapshotId: b }));
      if (kind === "evidence")
        api.sourceEvidence.mockResolvedValueOnce(success({ ...evidence(), jobId: b }));
      await reader.reload();
      expect(reader.current().primary).toBe(previous);
      expect(reader.current().error).toContain("could not be read");
      await reader.retry();
      expect(reader.current().error).toBeNull();
    },
  );
  it.each(["resolve", "reject"])(
    "prevents overlapping work and discards disposed late %s",
    async (mode) => {
      const { api, reader, changed } = setup();
      let release;
      let fail;
      api.sourceSnapshots.mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            release = resolve;
            fail = reject;
          }),
      );
      const pending = reader.reload();
      expect(await reader.reload()).toBe(false);
      expect(await reader.select("primary", a)).toBe(false);
      reader.dispose();
      const calls = changed.mock.calls.length;
      if (mode === "resolve") release(success(history([])));
      else fail(new Error("private late adapter details"));
      expect(await pending).toBe(false);
      expect(changed).toHaveBeenCalledTimes(calls);
      expect(await reader.reload()).toBe(false);
      expect(await reader.retry()).toBe(false);
      expect(api.sourceSnapshots).toHaveBeenCalledOnce();
    },
  );
  it("requires two explicit distinct selections and clears paired inspection without a query", async () => {
    const { api, reader } = setup();
    await reader.reload();
    expect(await reader.select("comparison", a)).toBe(false);
    expect(await reader.select("comparison", "unknown")).toBe(false);
    expect(await reader.select("comparison", b)).toBe(true);
    expect(reader.current().comparison.snapshot.id).toBe(b);
    expect(await reader.select("primary", b)).toBe(false);
    const calls = api.sourceContent.mock.calls.length;
    expect(await reader.select("comparison", "")).toBe(true);
    expect(reader.current().comparison).toBeNull();
    expect(api.sourceContent).toHaveBeenCalledTimes(calls);
  });
  it("replaces history pages, preserves inspected evidence, and resets selections only on explicit reload", async () => {
    const { api, reader } = setup();
    const next = { jobId, id: a };
    api.sourceSnapshots
      .mockResolvedValueOnce(success(history([snapshot(a)], next)))
      .mockResolvedValueOnce(success(history([snapshot(b)])));
    await reader.reload();
    const original = reader.current().primary;
    await reader.historyMore();
    expect(api.sourceSnapshots).toHaveBeenLastCalledWith({ jobId, limit: 10, after: next });
    expect(reader.current().history.items).toEqual([snapshot(b)]);
    expect(reader.current().primary).toBe(original);
    await reader.select("comparison", b);
    await reader.reload();
    expect(reader.current().comparison).toBeNull();
  });
  it("holds only the current content part, supports next/first and never concatenates unbounded bodies", async () => {
    const { api, reader } = setup();
    const next = { jobId, snapshotId: a, kind: "text", byteOffset: 4 };
    api.sourceContent
      .mockResolvedValueOnce(success(body(a, "text", next)))
      .mockResolvedValueOnce(success({ ...body(), text: "second part", byteOffset: 4 }));
    await reader.reload();
    await reader.content("primary", "text", true);
    expect(api.sourceContent).toHaveBeenLastCalledWith({
      jobId,
      snapshotId: a,
      kind: "text",
      after: next,
    });
    expect(reader.current().primary.content.text).toBe("second part");
    expect(await reader.content("primary", "text", true)).toBe(false);
    await reader.content("primary", "structured", false);
    expect(api.sourceContent).toHaveBeenLastCalledWith({
      jobId,
      snapshotId: a,
      kind: "structured",
      after: null,
    });
  });
  it("replaces evidence pages and clears an older inspected value, with explicit first-page reload", async () => {
    const { api, reader } = setup();
    const next = { jobId, snapshotId: a, id };
    api.sourceEvidence
      .mockResolvedValueOnce(success(evidence(a, [item], next)))
      .mockResolvedValueOnce(success(evidence(a, [])));
    await reader.reload();
    await reader.value("primary", item, "raw", false);
    await reader.evidencePage("primary", true);
    expect(reader.current().primary.value).toBeNull();
    expect(reader.current().primary.evidence.items).toEqual([]);
    expect(api.sourceEvidence).toHaveBeenLastCalledWith({
      jobId,
      snapshotId: a,
      limit: 10,
      after: next,
    });
    await reader.evidencePage("primary", false);
    expect(api.sourceEvidence).toHaveBeenLastCalledWith({
      jobId,
      snapshotId: a,
      limit: 10,
      after: null,
    });
  });
  it("permits value reads only for displayed kind-qualified evidence and matching continuation", async () => {
    const { api, reader } = setup();
    await reader.reload();
    expect(await reader.value("primary", { ...item, id: b }, "raw", false)).toBe(false);
    expect(await reader.value("primary", item, "raw", true)).toBe(false);
    const next = {
      jobId,
      snapshotId: a,
      evidenceKind: item.kind,
      evidenceId: id,
      part: "raw",
      byteOffset: 4,
    };
    api.sourceValue
      .mockResolvedValueOnce(success(value("raw", next)))
      .mockResolvedValueOnce(success({ ...value("raw"), text: "second JSON part" }));
    await reader.value("primary", item, "raw", false);
    expect(await reader.value("primary", item, "normalized", true)).toBe(false);
    await reader.value("primary", item, "raw", true);
    expect(api.sourceValue).toHaveBeenLastCalledWith({
      jobId,
      snapshotId: a,
      evidenceKind: "field-value",
      evidenceId: id,
      part: "raw",
      after: next,
    });
    expect(reader.current().primary.value.text).toBe("second JSON part");
  });
  it.each(["content", "value"])(
    "retries stale %s continuation from the first part without leaking adapter text",
    async (kind) => {
      const { api, reader } = setup();
      const next = { byteOffset: 4 };
      api.sourceContent.mockResolvedValueOnce(success(body(a, "text", next)));
      await reader.reload();
      if (kind === "value") {
        api.sourceValue.mockResolvedValueOnce(success(value("normalized", next)));
        await reader.value("primary", item, "normalized", false);
        api.sourceValue.mockRejectedValueOnce(new Error("private cursor details"));
        await reader.value("primary", item, "normalized", true);
      } else {
        api.sourceContent.mockRejectedValueOnce(new Error("private cursor details"));
        await reader.content("primary", "text", true);
      }
      expect(reader.current().error).not.toContain("private");
      await reader.retry();
      expect(reader.current().error).toBeNull();
      const read = kind === "content" ? api.sourceContent : api.sourceValue;
      expect(read.mock.calls.at(-1)[0].after).toBeNull();
    },
  );
  it("uses the current runtime API on retry without restarting the reader", async () => {
    const { api, reader } = setup();
    api.sourceSnapshots.mockRejectedValueOnce(new Error("private path"));
    await reader.reload();
    api.sourceSnapshots = vi.fn().mockResolvedValue(success(history([])));
    await reader.retry();
    expect(api.sourceSnapshots).toHaveBeenCalledOnce();
    expect(reader.current().error).toBeNull();
  });
  it("does not begin new content/evidence reads after a disposed history request returns", async () => {
    const { api, reader } = setup();
    let release;
    api.sourceSnapshots.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const pending = reader.reload();
    reader.dispose();
    release(success(history()));
    expect(await pending).toBe(false);
    expect(api.sourceContent).not.toHaveBeenCalled();
    expect(api.sourceEvidence).not.toHaveBeenCalled();
  });
  it("holds single-flight ownership until both pane reads settle even if one rejects early", async () => {
    const { api, reader } = setup();
    let release;
    api.sourceContent.mockRejectedValueOnce(new Error("private failure"));
    api.sourceEvidence.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const pending = reader.reload();
    await vi.waitFor(() => expect(api.sourceEvidence).toHaveBeenCalledOnce());
    expect(reader.current().busy).toBe(true);
    expect(await reader.reload()).toBe(false);
    release(success(evidence()));
    await pending;
    expect(reader.current().busy).toBe(false);
    expect(reader.current().error).toContain("could not be read");
  });
});
