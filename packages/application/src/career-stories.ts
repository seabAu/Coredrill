import { entityId, instant, type EntityId, type Instant } from "@coredrill/domain";

import {
  defineCommand,
  defineQuery,
  type ApplicationCommand,
  type ApplicationQuery,
} from "./operation.js";
import {
  applicationFailure,
  applicationSuccess,
  type ApplicationError,
  type ApplicationResult,
} from "./result.js";

export const CAREER_STORY_EVIDENCE_KINDS = Object.freeze([
  "employment",
  "education",
  "project",
  "skill",
  "accomplishment",
  "certification",
  "publication",
  "volunteer",
] as const);
export type CareerStoryEvidenceKind = (typeof CAREER_STORY_EVIDENCE_KINDS)[number];

export type CareerStoryVerificationState =
  "disputed" | "imported" | "source_backed" | "stale" | "user_confirmed";

export interface CareerStoryEvidenceRefInput {
  readonly evidenceId: string;
  readonly evidenceKind: CareerStoryEvidenceKind;
}

export interface CareerStoryEvidenceRefDto {
  readonly evidenceId: EntityId;
  readonly evidenceKind: CareerStoryEvidenceKind;
}

interface CareerStoryDraftInput {
  readonly title: string;
  readonly situation: string;
  readonly action: string;
  readonly result: string;
  readonly tags?: readonly string[];
  readonly privacyTags?: readonly string[];
  readonly linkedEvidence?: readonly CareerStoryEvidenceRefInput[];
}

export type CreateCareerStoryInput = CareerStoryDraftInput;

export interface UpdateCareerStoryInput extends CareerStoryDraftInput {
  readonly id: string;
  readonly expectedRowVersion: number;
}

export interface CareerStoryDto {
  readonly id: EntityId<"anecdote">;
  readonly title: string;
  readonly situation: string;
  readonly action: string;
  readonly result: string;
  readonly tags: readonly string[];
  readonly privacyTags: readonly string[];
  readonly linkedEvidence: readonly CareerStoryEvidenceRefDto[];
  readonly sourceDocumentId: EntityId<"document"> | null;
  readonly verificationState: CareerStoryVerificationState;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
  readonly rowVersion: number;
}

export interface CareerStoryValidationIssue {
  readonly field: string;
  readonly message: string;
}

interface NormalizedCareerStoryDraft {
  readonly title: string;
  readonly situation: string;
  readonly action: string;
  readonly result: string;
  readonly tags: readonly string[];
  readonly privacyTags: readonly string[];
  readonly linkedEvidence: readonly CareerStoryEvidenceRefDto[];
}

export type CareerStoryValidationResult =
  | { readonly ok: true; readonly value: NormalizedCareerStoryDraft }
  | { readonly ok: false; readonly issues: readonly CareerStoryValidationIssue[] };

export interface CreateCareerStoryPortInput extends NormalizedCareerStoryDraft {
  readonly id: EntityId<"anecdote">;
  readonly sourceDocumentId: null;
  readonly verificationState: "user_confirmed";
  readonly archivedAt: null;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
}

export interface UpdateCareerStoryPortInput extends NormalizedCareerStoryDraft {
  readonly id: EntityId<"anecdote">;
  readonly expectedRowVersion: number;
  readonly updatedAt: Instant;
}

export interface CareerStoryPort {
  createStory(input: CreateCareerStoryPortInput): Promise<CareerStoryDto>;
  updateStory(input: UpdateCareerStoryPortInput): Promise<CareerStoryDto>;
  listStories(): Promise<readonly CareerStoryDto[]>;
}

export const CAREER_STORY_ERROR_CODES = Object.freeze([
  "already_exists",
  "busy",
  "conflict",
  "invalid_state",
  "permission_denied",
  "read_only",
  "unavailable",
] as const);
export type CareerStoryErrorCode = (typeof CAREER_STORY_ERROR_CODES)[number];

export class CareerStoryError extends Error {
  public readonly code: CareerStoryErrorCode;

  public constructor(code: CareerStoryErrorCode) {
    if (!CAREER_STORY_ERROR_CODES.includes(code)) {
      throw new TypeError("Career story failures require a reviewed stable code.");
    }
    super("The Career story port reported a failure.");
    this.name = "CareerStoryError";
    this.code = code;
  }
}

export interface CareerStoryOperationDependencies {
  readonly careerStories: CareerStoryPort;
  readonly createId: () => string;
}

export interface CareerStoryOperations {
  readonly createStoryCommand: ApplicationCommand<CreateCareerStoryInput, CareerStoryDto>;
  readonly updateStoryCommand: ApplicationCommand<UpdateCareerStoryInput, CareerStoryDto>;
  readonly listStoriesQuery: ApplicationQuery<undefined, readonly CareerStoryDto[]>;
}

const EVIDENCE_ENTITY_BY_KIND = Object.freeze({
  employment: "experience",
  education: "education",
  project: "project",
  skill: "skill",
  accomplishment: "accomplishment",
  certification: "certification",
  publication: "publication",
  volunteer: "volunteer-experience",
} as const);
const PRIVACY_TAG_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/u;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const issue = (field: string, message: string): CareerStoryValidationIssue =>
  Object.freeze({ field, message });

const requiredText = (
  value: unknown,
  field: string,
  maximum: number,
  issues: CareerStoryValidationIssue[],
): string | null => {
  if (typeof value !== "string" || value.includes("\u0000") || value.length > maximum) {
    issues.push(issue(field, `Enter between 1 and ${maximum.toLocaleString("en-US")} characters.`));
    return null;
  }
  const cleaned = value.trim();
  if (cleaned.length === 0) {
    issues.push(issue(field, "Enter a value."));
    return null;
  }
  return cleaned;
};

const stringList = (
  value: unknown,
  field: string,
  maximumItems: number,
  maximumLength: number,
  issues: CareerStoryValidationIssue[],
  pattern?: RegExp,
): readonly string[] => {
  if (value === undefined) return Object.freeze([]);
  if (
    !Array.isArray(value) ||
    value.length > maximumItems ||
    value.some((item) => typeof item !== "string")
  ) {
    issues.push(issue(field, `Use at most ${String(maximumItems)} text values.`));
    return Object.freeze([]);
  }
  const cleaned = (value as readonly string[]).map((item) => item.trim()).filter(Boolean);
  if (
    cleaned.some(
      (item) =>
        item.length > maximumLength ||
        item.includes("\u0000") ||
        (pattern !== undefined && !pattern.test(item)),
    ) ||
    new Set(cleaned).size !== cleaned.length
  ) {
    issues.push(issue(field, "Use unique, bounded identifiers."));
    return Object.freeze([]);
  }
  return Object.freeze(pattern === undefined ? cleaned : [...cleaned].sort());
};

const evidenceLinks = (
  value: unknown,
  issues: CareerStoryValidationIssue[],
): readonly CareerStoryEvidenceRefDto[] => {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value) || value.length > 64) {
    issues.push(issue("linkedEvidence", "Choose at most 64 evidence records."));
    return Object.freeze([]);
  }
  const links: CareerStoryEvidenceRefDto[] = [];
  for (const item of value as readonly unknown[]) {
    if (!isRecord(item) || !CAREER_STORY_EVIDENCE_KINDS.includes(item["evidenceKind"] as never)) {
      issues.push(issue("linkedEvidence", "Choose only supported Career Profile evidence."));
      continue;
    }
    const kind = item["evidenceKind"] as CareerStoryEvidenceKind;
    if (typeof item["evidenceId"] !== "string") {
      issues.push(issue("linkedEvidence", "Choose only supported Career Profile evidence."));
      continue;
    }
    try {
      links.push(
        Object.freeze({
          evidenceKind: kind,
          evidenceId: entityId(EVIDENCE_ENTITY_BY_KIND[kind], item["evidenceId"]),
        }),
      );
    } catch {
      issues.push(issue("linkedEvidence", "Choose only supported Career Profile evidence."));
    }
  }
  const keys = links.map(({ evidenceId, evidenceKind: kind }) => `${kind}:${evidenceId}`);
  if (new Set(keys).size !== keys.length) {
    issues.push(issue("linkedEvidence", "Choose each evidence record once."));
  }
  links.sort(
    (left, right) =>
      left.evidenceKind.localeCompare(right.evidenceKind) ||
      left.evidenceId.localeCompare(right.evidenceId),
  );
  return Object.freeze(links);
};

export const validateCareerStory = (input: unknown): CareerStoryValidationResult => {
  if (!isRecord(input)) {
    return Object.freeze({
      ok: false as const,
      issues: Object.freeze([issue("title", "Enter a story.")]),
    });
  }
  const issues: CareerStoryValidationIssue[] = [];
  const title = requiredText(input["title"], "title", 512, issues);
  const situation = requiredText(input["situation"], "situation", 20_000, issues);
  const action = requiredText(input["action"], "action", 20_000, issues);
  const result = requiredText(input["result"], "result", 20_000, issues);
  const tags = stringList(input["tags"], "tags", 128, 512, issues);
  const privacyTags = stringList(
    input["privacyTags"],
    "privacyTags",
    16,
    64,
    issues,
    PRIVACY_TAG_PATTERN,
  );
  const linkedEvidence = evidenceLinks(input["linkedEvidence"], issues);
  if (
    title === null ||
    situation === null ||
    action === null ||
    result === null ||
    issues.length > 0
  ) {
    return Object.freeze({ ok: false as const, issues: Object.freeze(issues) });
  }
  return Object.freeze({
    ok: true as const,
    value: Object.freeze({ title, situation, action, result, tags, privacyTags, linkedEvidence }),
  });
};

const VERIFICATION_STATES = new Set<CareerStoryVerificationState>([
  "disputed",
  "imported",
  "source_backed",
  "stale",
  "user_confirmed",
]);

const copyStory = (value: unknown): CareerStoryDto => {
  if (!isRecord(value)) throw new TypeError("Invalid Career story result.");
  const validation = validateCareerStory(value);
  if (!validation.ok) throw new TypeError("Invalid Career story result.");
  const verificationState = value["verificationState"];
  const rowVersion = value["rowVersion"];
  if (
    typeof verificationState !== "string" ||
    !VERIFICATION_STATES.has(verificationState as CareerStoryVerificationState) ||
    !Number.isSafeInteger(rowVersion) ||
    (rowVersion as number) < 1
  ) {
    throw new TypeError("Invalid Career story result.");
  }
  return Object.freeze({
    id: entityId("anecdote", value["id"] as string),
    ...validation.value,
    sourceDocumentId:
      value["sourceDocumentId"] === null
        ? null
        : entityId("document", value["sourceDocumentId"] as string),
    verificationState: verificationState as CareerStoryVerificationState,
    createdAt: instant(value["createdAt"] as string),
    updatedAt: instant(value["updatedAt"] as string),
    rowVersion: rowVersion as number,
  });
};

const VALIDATION_ERROR: ApplicationError = Object.freeze({
  code: "validation",
  message: "Review the highlighted story fields and try again.",
  retryable: false,
});
const UNKNOWN_ERROR: ApplicationError = Object.freeze({
  code: "internal",
  message: "The local Career story operation failed safely.",
  retryable: false,
});
const PORT_ERRORS: Readonly<Record<CareerStoryErrorCode, ApplicationError>> = Object.freeze({
  already_exists: Object.freeze({
    code: "conflict",
    message: "This story already exists.",
    retryable: false,
  }),
  busy: Object.freeze({
    code: "conflict",
    message: "The local story library is busy. Retry shortly.",
    retryable: true,
  }),
  conflict: Object.freeze({
    code: "conflict",
    message: "This story changed elsewhere. Reload it before saving.",
    retryable: true,
  }),
  invalid_state: Object.freeze({
    code: "internal",
    message: "The local story library is not in a usable state.",
    retryable: false,
  }),
  permission_denied: Object.freeze({
    code: "permission_denied",
    message: "Coredrill cannot access the local story library.",
    retryable: true,
  }),
  read_only: Object.freeze({
    code: "permission_denied",
    message: "The local story library is read-only.",
    retryable: false,
  }),
  unavailable: Object.freeze({
    code: "unavailable",
    message: "Local story storage is unavailable.",
    retryable: true,
  }),
});

const failureFrom = <Value>(error: unknown): ApplicationResult<Value> =>
  applicationFailure(error instanceof CareerStoryError ? PORT_ERRORS[error.code] : UNKNOWN_ERROR);

export const createCareerStoryOperations = (
  dependencies: CareerStoryOperationDependencies,
): CareerStoryOperations => {
  if (
    !isRecord(dependencies) ||
    !isRecord(dependencies.careerStories) ||
    typeof dependencies.careerStories.createStory !== "function" ||
    typeof dependencies.careerStories.updateStory !== "function" ||
    typeof dependencies.careerStories.listStories !== "function" ||
    typeof dependencies.createId !== "function"
  ) {
    throw new TypeError("Career story operations require a complete local persistence port.");
  }

  const createStoryCommand = defineCommand<CreateCareerStoryInput, CareerStoryDto>(
    "CreateCareerStoryCommand",
    async (input, context) => {
      const validation = validateCareerStory(input);
      if (!validation.ok) return applicationFailure(VALIDATION_ERROR);
      try {
        const createdAt = instant(context.initiatedAt);
        return applicationSuccess(
          copyStory(
            await dependencies.careerStories.createStory({
              ...validation.value,
              id: entityId("anecdote", dependencies.createId()),
              sourceDocumentId: null,
              verificationState: "user_confirmed",
              archivedAt: null,
              createdAt,
              updatedAt: createdAt,
            }),
          ),
        );
      } catch (error) {
        return failureFrom<CareerStoryDto>(error);
      }
    },
  );

  const updateStoryCommand = defineCommand<UpdateCareerStoryInput, CareerStoryDto>(
    "UpdateCareerStoryCommand",
    async (input, context) => {
      const validation = validateCareerStory(input);
      if (
        !validation.ok ||
        typeof input.id !== "string" ||
        !Number.isSafeInteger(input.expectedRowVersion) ||
        input.expectedRowVersion < 1
      ) {
        return applicationFailure(VALIDATION_ERROR);
      }
      try {
        return applicationSuccess(
          copyStory(
            await dependencies.careerStories.updateStory({
              ...validation.value,
              id: entityId("anecdote", input.id),
              expectedRowVersion: input.expectedRowVersion,
              updatedAt: instant(context.initiatedAt),
            }),
          ),
        );
      } catch (error) {
        return failureFrom<CareerStoryDto>(error);
      }
    },
  );

  const listStoriesQuery = defineQuery<undefined, readonly CareerStoryDto[]>(
    "ListCareerStoriesQuery",
    async () => {
      try {
        const stories = (await dependencies.careerStories.listStories()).map(copyStory);
        if (new Set(stories.map(({ id }) => id)).size !== stories.length) {
          throw new TypeError("Career story identities must be unique.");
        }
        return applicationSuccess(Object.freeze(stories));
      } catch (error) {
        return failureFrom<readonly CareerStoryDto[]>(error);
      }
    },
  );

  return Object.freeze({ createStoryCommand, updateStoryCommand, listStoriesQuery });
};
