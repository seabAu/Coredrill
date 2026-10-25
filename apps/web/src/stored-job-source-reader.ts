import type {
  ApplicationResult,
  JobSourceContentKind,
  JobSourceEvidenceDto,
  SourceEvidenceValuePart,
} from "@coredrill/application";
import { decodeLiteralUtf8Chunk, LISTING_COMPARISON_FIELDS } from "@coredrill/application";
import type {
  StoredJobSourceModel,
  StoredSourcePane,
  StoredSourceSlot,
  ComparisonLiteralValue,
  ComparisonValueSelection,
} from "@coredrill/ui";
import type { StoredPipelineApi } from "./stored-pipeline.js";

export type StoredSourceApi = Pick<
  StoredPipelineApi,
  "sourceSnapshots" | "sourceContent" | "sourceEvidence" | "sourceValue" | "sourceComparison"
>;
const unwrap = <T>(result: ApplicationResult<T>, belongs: (value: T) => boolean): T => {
  if (!result.ok || !belongs(result.value)) throw new Error("source_unavailable");
  return result.value;
};
const readOnlyComparisonProof = (value: unknown): boolean => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record["specVersion"] === 1 &&
    record["refreshPerformed"] === false &&
    record["trustedFieldMutationPerformed"] === false
  );
};
export const emptyStoredSource = (jobId: string): StoredJobSourceModel =>
  Object.freeze({
    jobId,
    history: null,
    primary: null,
    comparison: null,
    busy: false,
    error: null,
    listingChanges: null,
    comparisonLiteral: null,
  });

/** Bounded ephemeral pages/parts only. Never a second canonical store or write path. */
export const createStoredJobSourceReader = (
  jobId: string,
  api: () => StoredSourceApi,
  changed: (state: StoredJobSourceModel) => void,
  includeArchived = false,
) => {
  const lifetime = { disposed: false };
  const isDisposed = () => lifetime.disposed;
  let state = emptyStoredSource(jobId);
  let retry: (() => Promise<boolean>) | null = null;
  const publish = (next: StoredJobSourceModel) => {
    state = Object.freeze(next);
    changed(state);
  };
  const run = async (
    action: () => Promise<StoredJobSourceModel>,
    restart?: () => Promise<boolean>,
  ): Promise<boolean> => {
    if (isDisposed() || state.busy) return false;
    publish({ ...state, busy: true, error: null });
    try {
      const next = await action();
      if (isDisposed()) return false;
      retry = null;
      publish({ ...next, busy: false, error: null });
    } catch {
      if (isDisposed()) return false;
      retry = restart ?? (() => run(action));
      publish({
        ...state,
        busy: false,
        error:
          "Local Source evidence could not be read. Retry reads the vault again; no source is visited.",
      });
    }
    return true;
  };
  const loadPane = async (
    snapshot: NonNullable<StoredJobSourceModel["history"]>["items"][number],
  ): Promise<StoredSourcePane> => {
    if (isDisposed()) throw new Error("source_disposed");
    if (snapshot.jobId !== jobId) throw new Error("source_scope");
    const [bodyResult, pageResult] = await Promise.allSettled([
      api().sourceContent({ jobId, snapshotId: snapshot.id, kind: "text", includeArchived }),
      api().sourceEvidence({ jobId, snapshotId: snapshot.id, limit: 10, includeArchived }),
    ]);
    if (bodyResult.status !== "fulfilled" || pageResult.status !== "fulfilled")
      throw new Error("source_unavailable");
    const body = bodyResult.value;
    const page = pageResult.value;
    const content = unwrap(
      body,
      (value) => value.jobId === jobId && value.snapshotId === snapshot.id && value.kind === "text",
    );
    const evidence = unwrap(
      page,
      (value) => value.jobId === jobId && value.snapshotId === snapshot.id,
    );
    return Object.freeze({ snapshot, content, evidence, value: null });
  };
  const reload = () =>
    run(async () => {
      const history = unwrap(
        await api().sourceSnapshots({ jobId, limit: 10, includeArchived }),
        (value) => value.jobId === jobId && value.items.every((item) => item.jobId === jobId),
      );
      const first = history.items[0];
      const primary = first === undefined ? null : await loadPane(first);
      return {
        ...state,
        history,
        primary,
        comparison: null,
        listingChanges: null,
        comparisonLiteral: null,
      };
    });
  const select = (slot: StoredSourceSlot, id: string): Promise<boolean> => {
    if (isDisposed() || state.busy) return Promise.resolve(false);
    if (slot === "comparison" && id === "") {
      retry = null;
      publish({
        ...state,
        comparison: null,
        listingChanges: null,
        comparisonLiteral: null,
        error: null,
      });
      return Promise.resolve(true);
    }
    const snapshot =
      state.history?.items.find((item) => item.id === id) ??
      (state[slot]?.snapshot.id === id ? state[slot].snapshot : undefined);
    const other = slot === "primary" ? state.comparison : state.primary;
    if (snapshot === undefined || other?.snapshot.id === id) return Promise.resolve(false);
    return run(async () => ({
      ...state,
      [slot]: await loadPane(snapshot),
      listingChanges: null,
      comparisonLiteral: null,
    }));
  };
  const compare = (): Promise<boolean> => {
    const primary = state.primary?.snapshot;
    const second = state.comparison?.snapshot;
    if (primary === undefined || second === undefined || primary.capturedAt === second.capturedAt)
      return Promise.resolve(false);
    const [baseline, current] =
      primary.capturedAt < second.capturedAt ? [primary, second] : [second, primary];
    return run(async () => {
      const result = unwrap(
        await api().sourceComparison({
          jobId,
          includeArchived,
          baselineSnapshotId: baseline.id,
          currentSnapshotId: current.id,
        }),
        (value) =>
          readOnlyComparisonProof(value) &&
          value.jobId === jobId &&
          value.baselineSnapshotId === baseline.id &&
          value.currentSnapshotId === current.id &&
          value.baselineCapturedAt === baseline.capturedAt &&
          value.currentCapturedAt === current.capturedAt,
      );
      return { ...state, listingChanges: result, comparisonLiteral: null };
    });
  };
  const literalPart = (
    selection: ComparisonValueSelection,
    offset: number,
  ): ComparisonLiteralValue => {
    const changes = state.listingChanges;
    if (
      changes?.analyzedAt !== selection.analysisTime ||
      !["before", "after"].includes(selection.side) ||
      !LISTING_COMPARISON_FIELDS.includes(selection.field) ||
      !["comparison", "source", "raw"].includes(selection.part) ||
      !Number.isSafeInteger(selection.index) ||
      selection.index < 0
    )
      throw new TypeError();
    const field = changes.fields[selection.field][selection.side];
    const fact = [...field.items, ...field.absenceEvidence][selection.index];
    if (fact?.key !== selection.key) throw new TypeError();
    const text =
      selection.part === "comparison"
        ? fact.valueJson
        : selection.part === "source"
          ? fact.sourceValueJson
          : fact.rawValueJson;
    if (text !== null && typeof text !== "string") throw new TypeError();
    const base = {
      ...selection,
      snapshotId:
        selection.side === "before" ? changes.baselineSnapshotId : changes.currentSnapshotId,
      sourceType: fact.sourceType,
      sourceId: fact.sourceId,
      sourcePointer: fact.sourcePointer,
      byteOffset: offset,
    };
    if (text === null) {
      if (offset !== 0) throw new TypeError();
      return { ...base, text: null, byteLength: null, bytesRead: 0, hasMore: false };
    }
    const bytes = new TextEncoder().encode(text);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > bytes.byteLength)
      throw new TypeError();
    const part = decodeLiteralUtf8Chunk(
      bytes.slice(offset, offset + 32_768),
      bytes.byteLength,
      offset,
      32_768,
    );
    return Object.freeze({ ...base, ...part, byteLength: bytes.byteLength });
  };
  const inspectComparison = (selection: ComparisonValueSelection, offset = 0): Promise<boolean> => {
    if (isDisposed() || state.busy) return Promise.resolve(false);
    try {
      publish({ ...state, comparisonLiteral: literalPart(selection, offset) });
      return Promise.resolve(true);
    } catch {
      return Promise.resolve(false);
    }
  };
  const content = (
    slot: StoredSourceSlot,
    kind: JobSourceContentKind,
    more: boolean,
  ): Promise<boolean> => {
    const pane = state[slot];
    if (pane === null || (more && (pane.content.kind !== kind || pane.content.nextCursor === null)))
      return Promise.resolve(false);
    const after = more ? pane.content.nextCursor : null;
    return run(
      async () => {
        const result = unwrap(
          await api().sourceContent({
            jobId,
            snapshotId: pane.snapshot.id,
            kind,
            after,
            includeArchived,
          }),
          (value) =>
            value.jobId === jobId && value.snapshotId === pane.snapshot.id && value.kind === kind,
        );
        return { ...state, [slot]: Object.freeze({ ...pane, content: result }) };
      },
      () => content(slot, kind, false),
    );
  };
  const value = (
    slot: StoredSourceSlot,
    item: JobSourceEvidenceDto,
    part: SourceEvidenceValuePart,
    more: boolean,
  ): Promise<boolean> => {
    const pane = state[slot];
    if (
      !pane?.evidence.items.some(
        (candidate) => candidate.kind === item.kind && candidate.id === item.id,
      )
    )
      return Promise.resolve(false);
    const previous = pane.value;
    if (
      more &&
      (previous?.evidenceKind !== item.kind ||
        previous.evidenceId !== item.id ||
        previous.part !== part ||
        previous.nextCursor === null)
    )
      return Promise.resolve(false);
    const after = more && previous !== null ? previous.nextCursor : null;
    return run(
      async () => {
        const result = unwrap(
          await api().sourceValue({
            jobId,
            includeArchived,
            snapshotId: pane.snapshot.id,
            evidenceKind: item.kind,
            evidenceId: item.id,
            part,
            after,
          }),
          (chunk) =>
            chunk.jobId === jobId &&
            chunk.snapshotId === pane.snapshot.id &&
            chunk.evidenceKind === item.kind &&
            chunk.evidenceId === item.id &&
            chunk.part === part,
        );
        return { ...state, [slot]: Object.freeze({ ...pane, value: result }) };
      },
      () => value(slot, item, part, false),
    );
  };
  return Object.freeze({
    current: () => state,
    dispose: () => {
      lifetime.disposed = true;
    },
    reload,
    select,
    content,
    value,
    compare,
    inspectComparison,
    comparisonPart: (more: boolean) => {
      const previous = state.comparisonLiteral;
      if (previous === null || (more && !previous.hasMore)) return Promise.resolve(false);
      return inspectComparison(previous, more ? previous.byteOffset + previous.bytesRead : 0);
    },
    retry: () => (isDisposed() || state.busy || retry === null ? Promise.resolve(false) : retry()),
    historyMore: () => {
      const after = state.history?.nextCursor;
      if (after === null || after === undefined) return Promise.resolve(false);
      return run(async () => ({
        ...state,
        history: unwrap(
          await api().sourceSnapshots({ jobId, limit: 10, after, includeArchived }),
          (page) => page.jobId === jobId && page.items.every((item) => item.jobId === jobId),
        ),
      }));
    },
    evidencePage: (slot: StoredSourceSlot, more: boolean) => {
      const pane = state[slot];
      if (pane === null || (more && pane.evidence.nextCursor === null))
        return Promise.resolve(false);
      return run(async () => ({
        ...state,
        [slot]: Object.freeze({
          ...pane,
          value: null,
          evidence: unwrap(
            await api().sourceEvidence({
              jobId,
              includeArchived,
              snapshotId: pane.snapshot.id,
              limit: 10,
              after: more ? pane.evidence.nextCursor : null,
            }),
            (page) => page.jobId === jobId && page.snapshotId === pane.snapshot.id,
          ),
        }),
      }));
    },
  });
};
