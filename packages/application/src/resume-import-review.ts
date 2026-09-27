import {
  compareDateOnly,
  dateOnly,
  entityId,
  instant,
  type DateOnly,
  type EntityId,
  type Instant,
} from "@coredrill/domain";

import type { CareerProfileEntryDto } from "./career-profile.js";
import { defineCommand, type ApplicationCommand } from "./operation.js";
import type {
  ResumeEvidenceProposalDto,
  ResumeImportQueueItemDto,
  ResumeProposalTarget,
} from "./resume-import.js";
import { ResumeImportError } from "./resume-import.js";
import {
  applicationFailure,
  applicationSuccess,
  type ApplicationError,
  type ApplicationResult,
} from "./result.js";

export const RESUME_IMPORT_CONFLICT_KINDS = Object.freeze([
  "ambiguous_date",
  "date_overlap",
  "duplicate_role",
  "duplicate_skill",
  "ambiguous_skill",
] as const);
export type ResumeImportConflictKind = (typeof RESUME_IMPORT_CONFLICT_KINDS)[number];

export const RESUME_IMPORT_RESOLUTION_DECISIONS = Object.freeze([
  "accepted_new",
  "merged_existing",
  "rejected",
] as const);
export type ResumeImportResolutionDecision = (typeof RESUME_IMPORT_RESOLUTION_DECISIONS)[number];

export interface ResumeImportConflictDto {
  readonly candidateId: EntityId | null;
  readonly candidateLabel: string | null;
  readonly kind: ResumeImportConflictKind;
  readonly message: string;
}

export interface ResumeImportReviewGroupDto {
  readonly actionable: boolean;
  readonly conflicts: readonly ResumeImportConflictDto[];
  readonly groupKey: string;
  readonly importRunId: EntityId<"import-run">;
  readonly proposals: readonly ResumeEvidenceProposalDto[];
  readonly sourceExcerpts: readonly string[];
  readonly sourcePointers: readonly string[];
  readonly suggestedDates: Readonly<{
    readonly current: boolean;
    readonly endDate: DateOnly | null;
    readonly exact: boolean;
    readonly original: string | null;
    readonly startDate: DateOnly | null;
  }>;
  readonly target: ResumeProposalTarget;
}

export type ResolveResumeImportGroupInput =
  | Readonly<{
      decision: "rejected";
      groupKey: string;
      importRunId: string;
    }>
  | Readonly<{
      decision: "merged_existing";
      groupKey: string;
      importRunId: string;
      target: "employment" | "skill";
      targetId: string;
    }>
  | Readonly<{
      current?: boolean;
      dateDecision: "explicit" | "unknown";
      decision: "accepted_new";
      endDate?: string | null;
      groupKey: string;
      importRunId: string;
      startDate?: string | null;
      target: "employment";
    }>
  | Readonly<{
      decision: "accepted_new";
      groupKey: string;
      importRunId: string;
      target: "skill";
    }>;

export interface ResumeImportResolutionPortInput {
  readonly current: boolean;
  readonly decision: ResumeImportResolutionDecision;
  readonly endDate: DateOnly | null;
  readonly groupKey: string;
  readonly importRunId: EntityId<"import-run">;
  readonly newTargetId: EntityId | null;
  readonly resolutionId: EntityId<"career-import-resolution">;
  readonly resolvedAt: Instant;
  readonly startDate: DateOnly | null;
  readonly target: "employment" | "skill" | null;
  readonly targetId: EntityId | null;
}

export interface ResumeImportResolutionDto {
  readonly decision: ResumeImportResolutionDecision;
  readonly groupKey: string;
  readonly id: EntityId<"career-import-resolution">;
  readonly importRunId: EntityId<"import-run">;
  readonly resolvedAt: Instant;
  readonly target: "employment" | "skill" | null;
  readonly targetId: EntityId | null;
}

export interface ResumeImportReviewPort {
  resolve(input: ResumeImportResolutionPortInput): Promise<ResumeImportResolutionDto>;
}

export interface ResumeImportReviewDependencies {
  readonly createId: (kind: "career-import-resolution" | "experience" | "skill") => string;
  readonly review: ResumeImportReviewPort;
}

export interface ResumeImportReviewOperations {
  readonly resolveCommand: ApplicationCommand<
    ResolveResumeImportGroupInput,
    ResumeImportResolutionDto
  >;
}

interface RawResumeImportResolutionInput {
  readonly current?: unknown;
  readonly dateDecision?: unknown;
  readonly decision?: unknown;
  readonly endDate?: unknown;
  readonly groupKey?: unknown;
  readonly importRunId?: unknown;
  readonly startDate?: unknown;
  readonly target?: unknown;
  readonly targetId?: unknown;
}

const SPACE_PATTERN = /\s+/gu;
const EXACT_DATE_RANGE_PATTERN =
  /^(?<start>\d{4}-\d{2}-\d{2})\s*(?:—|–|--|-)\s*(?<end>\d{4}-\d{2}-\d{2})$/u;
const YEAR_PATTERN = /(?<year>\d{4})/gu;

const normalizedWords = (value: string): string =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replaceAll(/[^\p{L}\p{N}+#.]+/gu, " ")
    .trim()
    .replaceAll(SPACE_PATTERN, " ");

const SKILL_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  ".net": "dotnet",
  "c#": "csharp",
  js: "javascript",
  node: "nodejs",
  "node.js": "nodejs",
  postgres: "postgresql",
  ts: "typescript",
});

const normalizedSkill = (value: string): string => {
  const normalized = normalizedWords(value);
  return SKILL_ALIASES[normalized] ?? normalized;
};

const uniqueText = (values: readonly string[]): readonly string[] =>
  Object.freeze([...new Set(values.filter((value) => value.length > 0))]);

const proposalValue = (
  proposals: readonly ResumeEvidenceProposalDto[],
  fieldName: string,
): string | null =>
  proposals.find((proposal) => proposal.fieldName === fieldName)?.proposedValue ?? null;

const exactDates = (raw: string | null): ResumeImportReviewGroupDto["suggestedDates"] => {
  if (raw === null) {
    return Object.freeze({
      current: false,
      endDate: null,
      exact: false,
      original: null,
      startDate: null,
    });
  }
  const match = EXACT_DATE_RANGE_PATTERN.exec(raw);
  if (match?.groups === undefined) {
    return Object.freeze({
      current: /\b(?:current|present|now)\b/iu.test(raw),
      endDate: null,
      exact: false,
      original: raw,
      startDate: null,
    });
  }
  try {
    const startDate = dateOnly(match.groups["start"] ?? "");
    const endDate = dateOnly(match.groups["end"] ?? "");
    if (compareDateOnly(startDate, endDate) > 0) throw new TypeError("Inverted date range.");
    return Object.freeze({ current: false, endDate, exact: true, original: raw, startDate });
  } catch {
    return Object.freeze({
      current: false,
      endDate: null,
      exact: false,
      original: raw,
      startDate: null,
    });
  }
};

const yearBounds = (raw: string | null): readonly [number, number] | null => {
  if (raw === null) return null;
  const years = [...raw.matchAll(YEAR_PATTERN)].map((match) => Number(match.groups?.["year"]));
  if (years.length === 0 || years.some((year) => !Number.isSafeInteger(year))) return null;
  const start = years[0];
  const last = years.at(-1);
  if (start === undefined || last === undefined) return null;
  const end = /\b(?:current|present|now)\b/iu.test(raw) ? 9999 : last;
  return start <= end ? Object.freeze([start, end]) : Object.freeze([end, start]);
};

const rangesOverlap = (
  proposed: readonly [number, number] | null,
  entry: CareerProfileEntryDto,
): boolean => {
  if (proposed === null || entry.startDate === null) return false;
  const start = Number(entry.startDate.slice(0, 4));
  const end = entry.current || entry.endDate === null ? 9999 : Number(entry.endDate.slice(0, 4));
  return proposed[0] <= end && start <= proposed[1];
};

const conflict = (
  kind: ResumeImportConflictKind,
  message: string,
  candidate?: CareerProfileEntryDto,
): ResumeImportConflictDto =>
  Object.freeze({
    candidateId: candidate?.id ?? null,
    candidateLabel:
      candidate === undefined
        ? null
        : [candidate.primaryLabel, candidate.secondaryLabel].filter(Boolean).join(" · "),
    kind,
    message,
  });

export const analyzeResumeImportReviewQueue = (
  imports: readonly ResumeImportQueueItemDto[],
  entries: readonly CareerProfileEntryDto[],
): readonly ResumeImportReviewGroupDto[] => {
  const groups: ResumeImportReviewGroupDto[] = [];
  for (const imported of imports) {
    const grouped = new Map<string, ResumeEvidenceProposalDto[]>();
    for (const proposal of imported.proposals) {
      const values = grouped.get(proposal.groupKey) ?? [];
      values.push(proposal);
      grouped.set(proposal.groupKey, values);
    }
    for (const [groupKey, groupProposals] of grouped) {
      const proposals = Object.freeze([...groupProposals]);
      const target = proposals[0]?.target ?? "unclassified";
      if (proposals.some((proposal) => proposal.target !== target)) {
        throw new TypeError("Resume proposal group mixes targets.");
      }
      const conflicts: ResumeImportConflictDto[] = [];
      const rawDateRange = proposalValue(proposals, "dateRange");
      const suggestedDates = exactDates(rawDateRange);
      let actionable = false;

      if (target === "employment") {
        const organization = proposalValue(proposals, "organization");
        const role = proposalValue(proposals, "role");
        actionable = organization !== null && role !== null;
        if (actionable && !suggestedDates.exact) {
          conflicts.push(
            conflict(
              "ambiguous_date",
              "Choose exact dates or explicitly keep the imported dates unknown.",
            ),
          );
        }
        const proposedYears = yearBounds(rawDateRange);
        for (const entry of entries.filter((value) => value.kind === "employment")) {
          const sameOrganization =
            normalizedWords(entry.secondaryLabel ?? "") === normalizedWords(organization ?? "");
          const sameRole = normalizedWords(entry.primaryLabel) === normalizedWords(role ?? "");
          if (sameOrganization && sameRole) {
            conflicts.push(
              conflict(
                "duplicate_role",
                "An existing role has the same organization and title.",
                entry,
              ),
            );
          } else if (sameOrganization && rangesOverlap(proposedYears, entry)) {
            conflicts.push(
              conflict(
                "date_overlap",
                "An existing role at this organization overlaps these dates.",
                entry,
              ),
            );
          }
        }
      } else if (target === "skill") {
        const name = proposalValue(proposals, "canonicalName");
        actionable = name !== null;
        const canonical = normalizedSkill(name ?? "");
        const literal = normalizedWords(name ?? "");
        for (const entry of entries.filter((value) => value.kind === "skill")) {
          if (normalizedSkill(entry.primaryLabel) !== canonical) continue;
          conflicts.push(
            conflict(
              normalizedWords(entry.primaryLabel) === literal
                ? "duplicate_skill"
                : "ambiguous_skill",
              normalizedWords(entry.primaryLabel) === literal
                ? "This skill already exists in the Career Profile."
                : "This skill may be an alias of an existing Career Profile skill.",
              entry,
            ),
          );
        }
      }

      groups.push(
        Object.freeze({
          actionable,
          conflicts: Object.freeze(conflicts),
          groupKey,
          importRunId: imported.id,
          proposals,
          sourceExcerpts: uniqueText(proposals.map(({ sourceExcerpt }) => sourceExcerpt)),
          sourcePointers: uniqueText(proposals.map(({ sourcePointer }) => sourcePointer)),
          suggestedDates,
          target,
        }),
      );
    }
  }
  return Object.freeze(groups);
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const cleanGroupKey = (value: unknown): string => {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 128) {
    throw new TypeError("Resume resolution group is invalid.");
  }
  return value.trim();
};

const nullableDate = (value: unknown): DateOnly | null =>
  value === undefined || value === null || value === "" ? null : dateOnly(value as string);

const VALIDATION_ERROR: ApplicationError = Object.freeze({
  code: "validation",
  message: "Review the resume proposal and choose a valid explicit resolution.",
  retryable: false,
});
const UNKNOWN_ERROR: ApplicationError = Object.freeze({
  code: "internal",
  message: "The resume proposal could not be resolved safely.",
  retryable: false,
});

const failureFrom = <Value>(error: unknown): ApplicationResult<Value> =>
  applicationFailure(
    error instanceof ResumeImportError
      ? Object.freeze({
          code: error.code === "busy" ? "conflict" : "internal",
          message:
            error.code === "busy"
              ? "That proposal changed while it was being reviewed. Reload and try again."
              : "The local resume proposal is not in a resolvable state.",
          retryable: error.code === "busy",
        })
      : UNKNOWN_ERROR,
  );

const copyResolution = (value: ResumeImportResolutionDto): ResumeImportResolutionDto =>
  Object.freeze({
    decision: value.decision,
    groupKey: cleanGroupKey(value.groupKey),
    id: entityId("career-import-resolution", value.id),
    importRunId: entityId("import-run", value.importRunId),
    resolvedAt: instant(value.resolvedAt),
    target: value.target,
    targetId:
      value.targetId === null ? null : entityId(value.target ?? "career-entry", value.targetId),
  });

export const createResumeImportReviewOperations = (
  dependencies: ResumeImportReviewDependencies,
): ResumeImportReviewOperations => {
  if (
    !isRecord(dependencies) ||
    !isRecord(dependencies.review) ||
    typeof dependencies.review.resolve !== "function" ||
    typeof dependencies.createId !== "function"
  ) {
    throw new TypeError("Resume review operations require a complete local resolution port.");
  }

  const resolveCommand = defineCommand<ResolveResumeImportGroupInput, ResumeImportResolutionDto>(
    "ResolveResumeImportGroupCommand",
    async (input, context) => {
      let normalized: ResumeImportResolutionPortInput;
      try {
        if (!isRecord(input)) throw new TypeError("Resume resolution input is invalid.");
        const rawInput = input as unknown as RawResumeImportResolutionInput;
        const importRunId = entityId("import-run", rawInput.importRunId as string);
        const groupKey = cleanGroupKey(rawInput.groupKey);
        const decisionValue = rawInput.decision;
        if (
          typeof decisionValue !== "string" ||
          !RESUME_IMPORT_RESOLUTION_DECISIONS.includes(
            decisionValue as ResumeImportResolutionDecision,
          )
        ) {
          throw new TypeError("Resume resolution decision is invalid.");
        }
        const decision = decisionValue as ResumeImportResolutionDecision;
        let target: "employment" | "skill" | null = null;
        let targetId: EntityId | null = null;
        let newTargetId: EntityId | null = null;
        let startDate: DateOnly | null = null;
        let endDate: DateOnly | null = null;
        let current = false;

        if (decision === "merged_existing") {
          if (rawInput.target !== "employment" && rawInput.target !== "skill") {
            throw new TypeError("Resume merge target is invalid.");
          }
          target = rawInput.target;
          targetId = entityId(
            target === "employment" ? "experience" : "skill",
            rawInput.targetId as string,
          );
        } else if (decision === "accepted_new") {
          if (rawInput.target !== "employment" && rawInput.target !== "skill") {
            throw new TypeError("Resume acceptance target is invalid.");
          }
          target = rawInput.target;
          if (target === "employment") {
            const dateDecision = rawInput.dateDecision;
            if (dateDecision !== "explicit" && dateDecision !== "unknown") {
              throw new TypeError("Resume employment date decision is required.");
            }
            if (dateDecision === "explicit") {
              startDate = nullableDate(rawInput.startDate);
              endDate = nullableDate(rawInput.endDate);
              current = rawInput.current === true;
              if (startDate === null || (!current && endDate === null)) {
                throw new TypeError("Explicit employment dates are incomplete.");
              }
              if (current && endDate !== null) {
                throw new TypeError("Current employment cannot have an end date.");
              }
              if (endDate !== null && compareDateOnly(startDate, endDate) > 0) {
                throw new TypeError("Employment dates are inverted.");
              }
            }
          }
          newTargetId = entityId(
            target === "employment" ? "experience" : "skill",
            dependencies.createId(target === "employment" ? "experience" : "skill"),
          );
        }

        normalized = Object.freeze({
          current,
          decision,
          endDate,
          groupKey,
          importRunId,
          newTargetId,
          resolutionId: entityId(
            "career-import-resolution",
            dependencies.createId("career-import-resolution"),
          ),
          resolvedAt: instant(context.initiatedAt),
          startDate,
          target,
          targetId,
        });
      } catch {
        return applicationFailure(VALIDATION_ERROR);
      }

      try {
        return applicationSuccess(copyResolution(await dependencies.review.resolve(normalized)));
      } catch (error) {
        return failureFrom<ResumeImportResolutionDto>(error);
      }
    },
  );

  return Object.freeze({ resolveCommand });
};
