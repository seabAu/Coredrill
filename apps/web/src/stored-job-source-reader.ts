import type {
  ApplicationResult,
  JobSourceContentKind,
  JobSourceEvidenceDto,
  SourceEvidenceValuePart,
} from "@coredrill/application";
import type { StoredJobSourceModel, StoredSourcePane, StoredSourceSlot } from "@coredrill/ui";
import type { StoredPipelineApi } from "./stored-pipeline.js";

export type StoredSourceApi = Pick<
  StoredPipelineApi,
  "sourceSnapshots" | "sourceContent" | "sourceEvidence" | "sourceValue"
>;
const unwrap = <T>(result: ApplicationResult<T>, belongs: (value: T) => boolean): T => {
  if (!result.ok || !belongs(result.value)) throw new Error("source_unavailable");
  return result.value;
};
export const emptyStoredSource = (jobId: string): StoredJobSourceModel =>
  Object.freeze({
    jobId,
    history: null,
    primary: null,
    comparison: null,
    busy: false,
    error: null,
  });

/** Bounded ephemeral pages/parts only. Never a second canonical store or write path. */
export const createStoredJobSourceReader = (
  jobId: string,
  api: () => StoredSourceApi,
  changed: (state: StoredJobSourceModel) => void,
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
      api().sourceContent({ jobId, snapshotId: snapshot.id, kind: "text" }),
      api().sourceEvidence({ jobId, snapshotId: snapshot.id, limit: 10 }),
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
        await api().sourceSnapshots({ jobId, limit: 10 }),
        (value) => value.jobId === jobId && value.items.every((item) => item.jobId === jobId),
      );
      const first = history.items[0];
      const primary = first === undefined ? null : await loadPane(first);
      return { ...state, history, primary, comparison: null };
    });
  const select = (slot: StoredSourceSlot, id: string): Promise<boolean> => {
    if (isDisposed() || state.busy) return Promise.resolve(false);
    if (slot === "comparison" && id === "") {
      retry = null;
      publish({ ...state, comparison: null, error: null });
      return Promise.resolve(true);
    }
    const snapshot =
      state.history?.items.find((item) => item.id === id) ??
      (state[slot]?.snapshot.id === id ? state[slot].snapshot : undefined);
    const other = slot === "primary" ? state.comparison : state.primary;
    if (snapshot === undefined || other?.snapshot.id === id) return Promise.resolve(false);
    return run(async () => ({ ...state, [slot]: await loadPane(snapshot) }));
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
          await api().sourceContent({ jobId, snapshotId: pane.snapshot.id, kind, after }),
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
    retry: () => (isDisposed() || state.busy || retry === null ? Promise.resolve(false) : retry()),
    historyMore: () => {
      const after = state.history?.nextCursor;
      if (after === null || after === undefined) return Promise.resolve(false);
      return run(async () => ({
        ...state,
        history: unwrap(
          await api().sourceSnapshots({ jobId, limit: 10, after }),
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
