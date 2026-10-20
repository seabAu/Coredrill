import type {
  PipelineBoardGroupDto,
  PipelineCountsDto,
  PipelineJobSummaryDto,
} from "@coredrill/application";
import type { BoardColumn, BoardJobCard, PipelineTableJob } from "@coredrill/ui";

import type { StoredPipelineApi } from "./stored-pipeline.js";

export interface StoredPipelineSnapshot {
  readonly counts: PipelineCountsDto;
  readonly groups: readonly PipelineBoardGroupDto[];
  readonly jobs: readonly PipelineJobSummaryDto[];
}

const unavailable = (): never => {
  throw new Error("The local Pipeline changed or could not be loaded. Try again.");
};

/** Read every validated keyset page, never quietly present the first 100 as the corpus. */
export const loadStoredPipelineSnapshot = async (
  api: StoredPipelineApi,
  signal: AbortSignal,
): Promise<StoredPipelineSnapshot> => {
  const counts = await api.counts();
  signal.throwIfAborted();
  if (!counts.ok) return unavailable();
  const groups = await api.groups();
  signal.throwIfAborted();
  if (!groups.ok) return unavailable();
  const jobs: PipelineJobSummaryDto[] = [];
  const seenIds = new Set<string>();
  const seenCursors = new Set<string>();
  let after: { readonly jobId: string; readonly updatedAt: string } | null = null;
  for (;;) {
    const page = await api.page({ after, limit: 100 });
    signal.throwIfAborted();
    if (!page.ok) return unavailable();
    for (const job of page.value.items) {
      if (seenIds.has(job.id)) return unavailable();
      seenIds.add(job.id);
      jobs.push(job);
    }
    if (!page.value.hasMore) break;
    after = page.value.nextCursor;
    if (after === null || seenCursors.has(`${after.updatedAt}/${after.jobId}`))
      return unavailable();
    seenCursors.add(`${after.updatedAt}/${after.jobId}`);
  }
  if (jobs.length !== counts.value.all) return unavailable();
  for (const group of groups.value) {
    if (jobs.filter((job) => (job.status?.id ?? null) === group.statusId).length !== group.jobCount)
      return unavailable();
  }
  if (
    jobs.some((job) => !groups.value.some((group) => group.statusId === (job.status?.id ?? null)))
  )
    return unavailable();
  return Object.freeze({ counts: counts.value, groups: groups.value, jobs: Object.freeze(jobs) });
};

export const storedPipelineTableRow = (job: PipelineJobSummaryDto): PipelineTableJob => ({
  id: job.id,
  title: job.title,
  company: job.company?.name ?? "Unknown company",
  status: job.status,
  rowVersion: job.rowVersion,
  priority: null,
  tags: job.tags.map((tag) => tag.name),
  workMode: job.workplaceType ?? "Unknown work mode",
  location: job.locationLabel ?? "Unknown location",
  appliedDate: null,
  capturedDate: null,
  disclosedSalary: null,
  marketBand: null,
  matchSummary: null,
  nextActionDate: job.nextAction?.dueAt ?? null,
  lastInteraction: job.lastInteractionAt,
  source: "Unknown source",
});

/** A null due date does not mean there is no pending task. Keep the full stored title/instant. */
export const storedJobHeaderNextAction = (
  job: Pick<PipelineJobSummaryDto, "nextAction"> | undefined,
): string | null => {
  if (job === undefined) return "Next action unavailable";
  const action = job.nextAction;
  if (action === null) return null;
  return action.dueAt === null
    ? `${action.title} — Unscheduled`
    : `${action.title} — Due ${action.dueAt.replace("T", " ").replace(/Z$/u, " UTC")}`;
};

export const storedPipelineBoardColumns = (
  snapshot: StoredPipelineSnapshot,
): readonly BoardColumn[] =>
  snapshot.groups.map((group) => ({
    stage: {
      id: group.statusId ?? "unassigned",
      name: group.name,
      semanticCategories: group.category === null ? [] : [group.category],
      terminal: group.terminal,
      ...(group.statusId === null ? { unassigned: true } : {}),
    },
    items: snapshot.jobs
      .filter((job) => (job.status?.id ?? null) === group.statusId)
      .map((job): BoardJobCard => ({
        rowVersion: job.rowVersion,
        id: job.id,
        title: job.title,
        company: job.company?.name ?? "Unknown company",
        priority: null,
        location: job.locationLabel ?? "Unknown location",
        workMode:
          job.workplaceType === "remote" ||
          job.workplaceType === "hybrid" ||
          job.workplaceType === "onsite"
            ? job.workplaceType
            : "unspecified",
        nextAction: job.nextAction?.title ?? null,
        lastActivity:
          job.lastInteractionAt === null
            ? `Updated ${job.updatedAt}`
            : `Last interaction ${job.lastInteractionAt}`,
        warnings: [],
      })),
  }));
