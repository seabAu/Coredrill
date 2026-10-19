import type { CoredrillStorageSpikeApi } from "./main.js";
import type { MutationUndoTokenDto, UndoableStatusChangeDto } from "@coredrill/application";

export interface ViewedStatusMove {
  readonly jobId: string;
  readonly rowVersion: number;
  readonly fromStatusId: string | null;
  readonly toStatusId: string;
  readonly allowReopen: boolean;
}
interface Failure {
  readonly kind: "failed";
  readonly message: string;
  readonly retryable: boolean;
}
export type StoredStatusMoveOutcome =
  | Failure
  | { readonly kind: "review-applied"; readonly jobId: string }
  | { readonly kind: "saved"; readonly change: UndoableStatusChangeDto };
export type StoredStatusUndoOutcome =
  Failure | { readonly kind: "undone"; readonly token: MutationUndoTokenDto };

const failed = (message: string, retryable = true): Failure => ({
  kind: "failed",
  message,
  retryable,
});

/** Resolve the active attempt, but never rebind an old user gesture to a newer job version. */
export const createStoredStatusController = (
  getApi: () => Pick<
    CoredrillStorageSpikeApi,
    "pipeline" | "pipelineMutations" | "loadApplicationSubmissionReview"
  >,
) => {
  let running = false;
  const run = async <Value>(action: () => Promise<Value>): Promise<Value | Failure> => {
    if (running)
      return failed("A local status operation is already pending. Wait for it to finish.");
    running = true;
    try {
      return await action();
    } catch {
      return failed(
        "The local status operation could not be confirmed. Refresh to check the saved value; your requested change is retained.",
      );
    } finally {
      running = false;
    }
  };
  return Object.freeze({
    move: (input: ViewedStatusMove): Promise<StoredStatusMoveOutcome> => {
      const request = Object.freeze({ ...input });
      return run(async () => {
        if (!Number.isSafeInteger(request.rowVersion) || request.rowVersion < 1)
          return failed("Refresh the local Pipeline before editing this job.", false);
        const api = getApi();
        const loaded = await api.pipeline.workspace({ jobId: request.jobId });
        if (!loaded.ok) return failed(loaded.error.message, loaded.error.retryable);
        const { job, application } = loaded.value;
        if (
          job.id !== request.jobId ||
          job.rowVersion !== request.rowVersion ||
          (job.status?.id ?? null) !== request.fromStatusId ||
          job.archivedAt !== null
        )
          return failed(
            "This job changed since the edit began. Refresh and review its current value before starting another edit.",
            false,
          );
        const groups = await api.pipeline.groups();
        if (!groups.ok) return failed(groups.error.message, groups.error.retryable);
        const target = groups.value.find(({ statusId }) => statusId === request.toStatusId);
        if (typeof target?.statusId !== "string")
          return failed(
            "Choose an existing local stage; Unassigned is not a move destination.",
            false,
          );
        if (target.category === "applied") {
          if (application === null) return { kind: "review-applied", jobId: request.jobId };
          const review = await api.loadApplicationSubmissionReview(application.id);
          if (!review.ok) return failed(review.error.message, review.error.retryable);
          if (review.value.snapshot === null)
            return { kind: "review-applied", jobId: request.jobId };
        }
        const changed = await api.pipelineMutations.changeStatus({
          jobId: request.jobId,
          applicationId: application?.id ?? null,
          toStatusId: request.toStatusId,
          allowReopen: request.allowReopen,
          expected: {
            jobRowVersion: request.rowVersion,
            currentStatusId: job.status?.id ?? null,
            applicationRowVersion: application?.rowVersion ?? null,
          },
        });
        return changed.ok
          ? { kind: "saved", change: changed.value }
          : failed(changed.error.message, changed.error.retryable);
      });
    },
    undo: (tokenId: string): Promise<StoredStatusUndoOutcome> =>
      run(async () => {
        const result = await getApi().pipelineMutations.undo({ tokenId });
        return result.ok
          ? { kind: "undone", token: result.value }
          : failed(result.error.message, result.error.retryable);
      }),
  });
};
