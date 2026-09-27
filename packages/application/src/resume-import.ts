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

export const RESUME_IMPORT_FORMATS = Object.freeze(["docx", "pdf", "text"] as const);
export type ResumeImportFormat = (typeof RESUME_IMPORT_FORMATS)[number];

export const RESUME_PROPOSAL_TARGETS = Object.freeze([
  "basics",
  "employment",
  "education",
  "project",
  "skill",
  "accomplishment",
  "certification",
  "publication",
  "volunteer",
  "unclassified",
] as const);
export type ResumeProposalTarget = (typeof RESUME_PROPOSAL_TARGETS)[number];

export const RESUME_IMPORT_LIMITS = Object.freeze({
  maxBlocks: 2_000,
  maxBlockCharacters: 20_000,
  maxFileBytes: 10 * 1024 * 1024,
  maxFileNameCharacters: 255,
  maxMediaTypeCharacters: 120,
  maxProposals: 4_000,
  maxSourceExcerptCharacters: 240,
  maxSourcePointerCharacters: 300,
  maxWarnings: 100,
});

export interface ResumeImportBlockInput {
  readonly sourceExcerpt: string;
  readonly sourcePointer: string;
  readonly text: string;
}

export interface QueueResumeImportInput {
  readonly blocks: readonly ResumeImportBlockInput[];
  readonly source: {
    readonly byteLength: number;
    readonly fileName: string;
    readonly format: ResumeImportFormat;
    readonly mediaType: string;
    readonly pageCount?: number;
    readonly sha256: string;
  };
  readonly warnings?: readonly string[];
}

export interface ResumeEvidenceProposalDto {
  readonly confidence: number;
  readonly evidenceStatus: "proposal";
  readonly fieldName: string;
  readonly groupKey: string;
  readonly id: EntityId<"career-import-proposal">;
  readonly importRunId: EntityId<"import-run">;
  readonly proposedValue: string;
  readonly reviewState: "pending";
  readonly sourceExcerpt: string;
  readonly sourcePointer: string;
  readonly target: ResumeProposalTarget;
}

export interface ResumeImportQueueItemDto {
  readonly completedAt: Instant;
  readonly id: EntityId<"import-run">;
  readonly proposalCount: number;
  readonly proposals: readonly ResumeEvidenceProposalDto[];
  readonly source: {
    readonly byteLength: number;
    readonly fileName: string;
    readonly format: ResumeImportFormat;
    readonly mediaType: string;
    readonly pageCount: number | null;
    readonly sha256: string;
  };
  readonly status: "completed";
  readonly warnings: readonly string[];
}

export interface ResumeImportPortInput extends ResumeImportQueueItemDto {
  readonly blocks: readonly ResumeImportBlockInput[];
  readonly startedAt: Instant;
}

export interface ResumeImportPort {
  enqueue(input: ResumeImportPortInput): Promise<ResumeImportQueueItemDto>;
  listPending(): Promise<readonly ResumeImportQueueItemDto[]>;
}

export const RESUME_IMPORT_ERROR_CODES = Object.freeze([
  "busy",
  "invalid_state",
  "permission_denied",
  "read_only",
  "unavailable",
] as const);
export type ResumeImportErrorCode = (typeof RESUME_IMPORT_ERROR_CODES)[number];

export class ResumeImportError extends Error {
  public readonly code: ResumeImportErrorCode;

  public constructor(code: ResumeImportErrorCode) {
    if (!RESUME_IMPORT_ERROR_CODES.includes(code)) {
      throw new TypeError("Resume import failures require a reviewed stable code.");
    }
    super("The local resume-import queue reported a failure.");
    this.name = "ResumeImportError";
    this.code = code;
  }
}

export interface ResumeImportOperationDependencies {
  readonly createId: (kind: "career-import-proposal" | "import-run") => string;
  readonly resumeImports: ResumeImportPort;
}

export interface ResumeImportOperations {
  readonly listPendingQuery: ApplicationQuery<undefined, readonly ResumeImportQueueItemDto[]>;
  readonly queueCommand: ApplicationCommand<QueueResumeImportInput, ResumeImportQueueItemDto>;
}

interface ParsedProposal {
  readonly confidence: number;
  readonly fieldName: string;
  readonly groupKey: string;
  readonly proposedValue: string;
  readonly sourceExcerpt: string;
  readonly sourcePointer: string;
  readonly target: ResumeProposalTarget;
}

interface NormalizedResumeImport {
  readonly blocks: readonly ResumeImportBlockInput[];
  readonly parsedProposals: readonly ParsedProposal[];
  readonly source: ResumeImportQueueItemDto["source"];
  readonly warnings: readonly string[];
}

const SHA256_PATTERN = /^[a-f\d]{64}$/u;
const MEDIA_TYPE_PATTERN =
  /^[a-z\d][a-z\d!#$&^_.+-]{0,63}\/[a-z\d][a-z\d!#$&^_.+-]{0,63}(?:;[\x20-\x7e]{1,80})?$/iu;
const SAFE_FIELD_PATTERN = /^[a-z][a-zA-Z0-9]{0,63}$/u;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const boundedText = (value: unknown, maximum: number, required = true): string => {
  if (typeof value !== "string" || value.includes("\u0000") || value.length > maximum) {
    throw new TypeError("Resume import text is invalid.");
  }
  const cleaned = value.trim().replaceAll(/\s+/gu, " ");
  if (required && cleaned.length === 0) throw new TypeError("Resume import text is required.");
  return cleaned;
};

const exactInteger = (value: unknown, minimum: number, maximum: number): number => {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new TypeError("Resume import number is invalid.");
  }
  return value as number;
};

const confidence = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new TypeError("Resume proposal confidence is invalid.");
  }
  return value;
};

const SECTION_BY_HEADING: Readonly<Record<string, ResumeProposalTarget>> = Object.freeze({
  accomplishments: "accomplishment",
  achievements: "accomplishment",
  certifications: "certification",
  education: "education",
  employment: "employment",
  experience: "employment",
  highlights: "accomplishment",
  objective: "basics",
  profile: "basics",
  projects: "project",
  publications: "publication",
  skills: "skill",
  summary: "basics",
  volunteer: "volunteer",
  volunteering: "volunteer",
  "core skills": "skill",
  "professional experience": "employment",
  "technical skills": "skill",
  "work history": "employment",
});

const headingTarget = (text: string): ResumeProposalTarget | undefined =>
  SECTION_BY_HEADING[text.toLocaleLowerCase("en-US").replace(/:$/u, "").trim()];

const fieldForTarget = (target: ResumeProposalTarget): string => {
  switch (target) {
    case "basics":
      return "summary";
    case "employment":
    case "volunteer":
      return "description";
    case "education":
      return "details";
    case "project":
      return "summary";
    case "skill":
      return "canonicalName";
    case "accomplishment":
      return "action";
    case "certification":
      return "name";
    case "publication":
      return "title";
    case "unclassified":
      return "sourceText";
  }
};

const likelyDisplayName = (text: string): boolean =>
  text.length <= 100 &&
  !/[\d@]|https?:\/\//iu.test(text) &&
  /^[\p{L}][\p{L}'’.-]+(?:\s+[\p{L}][\p{L}'’.-]+){1,5}$/u.test(text);

const structuredEmployment = (
  block: ResumeImportBlockInput,
  groupKey: string,
): readonly ParsedProposal[] | null => {
  const match = /^(.+?)\s+(?:—|–|--)\s+(.+?)\s+(?:—|–|--)\s+(.+)$/u.exec(block.text);
  if (match === null) return null;
  const organization = match[1]?.trim() ?? "";
  const role = match[2]?.trim() ?? "";
  const dateRange = match[3]?.trim() ?? "";
  if (organization.length === 0 || role.length === 0 || dateRange.length === 0) return null;
  return Object.freeze([
    Object.freeze({
      confidence: 0.82,
      fieldName: "organization",
      groupKey,
      proposedValue: organization,
      sourceExcerpt: block.sourceExcerpt,
      sourcePointer: block.sourcePointer,
      target: "employment" as const,
    }),
    Object.freeze({
      confidence: 0.78,
      fieldName: "role",
      groupKey,
      proposedValue: role,
      sourceExcerpt: block.sourceExcerpt,
      sourcePointer: block.sourcePointer,
      target: "employment" as const,
    }),
    Object.freeze({
      confidence: 0.55,
      fieldName: "dateRange",
      groupKey,
      proposedValue: dateRange,
      sourceExcerpt: block.sourceExcerpt,
      sourcePointer: block.sourcePointer,
      target: "employment" as const,
    }),
  ]);
};

const splitSkillValues = (text: string): readonly string[] => {
  const values = text
    .split(/[,;|•]/u)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return Object.freeze(values.length > 1 ? values : [text]);
};

export const extractResumeEvidenceProposals = (
  blocks: readonly ResumeImportBlockInput[],
): readonly ParsedProposal[] => {
  const proposals: ParsedProposal[] = [];
  let section: ResumeProposalTarget = "unclassified";
  let sawContent = false;

  blocks.forEach((block, index) => {
    const target = headingTarget(block.text);
    if (target !== undefined) {
      section = target;
      return;
    }

    const groupKey = `block-${String(index + 1)}`;
    if (!sawContent && section === "unclassified" && likelyDisplayName(block.text)) {
      proposals.push({
        confidence: 0.72,
        fieldName: "displayName",
        groupKey,
        proposedValue: block.text,
        sourceExcerpt: block.sourceExcerpt,
        sourcePointer: block.sourcePointer,
        target: "basics",
      });
      sawContent = true;
      return;
    }
    sawContent = true;

    if (section === "employment") {
      const structured = structuredEmployment(block, groupKey);
      if (structured !== null) {
        proposals.push(...structured);
        return;
      }
    }

    const values = section === "skill" ? splitSkillValues(block.text) : [block.text];
    values.forEach((value, valueIndex) => {
      proposals.push({
        confidence: section === "unclassified" ? 0.25 : section === "skill" ? 0.7 : 0.62,
        fieldName: fieldForTarget(section),
        groupKey: values.length === 1 ? groupKey : `${groupKey}-${String(valueIndex + 1)}`,
        proposedValue: value,
        sourceExcerpt: block.sourceExcerpt,
        sourcePointer: block.sourcePointer,
        target: section,
      });
    });
  });

  if (proposals.length > RESUME_IMPORT_LIMITS.maxProposals) {
    throw new TypeError("Resume import produced too many proposals.");
  }
  return Object.freeze(proposals.map((proposal) => Object.freeze(proposal)));
};

const normalizeInput = (input: unknown): NormalizedResumeImport => {
  if (!isRecord(input) || !isRecord(input["source"]) || !Array.isArray(input["blocks"])) {
    throw new TypeError("Resume import input is invalid.");
  }
  const sourceInput = input["source"];
  const format = sourceInput["format"];
  if (!RESUME_IMPORT_FORMATS.includes(format as ResumeImportFormat)) {
    throw new TypeError("Resume import format is invalid.");
  }
  const sha256 = boundedText(sourceInput["sha256"], 64).toLocaleLowerCase("en-US");
  if (!SHA256_PATTERN.test(sha256)) throw new TypeError("Resume import hash is invalid.");
  const mediaType = boundedText(
    sourceInput["mediaType"],
    RESUME_IMPORT_LIMITS.maxMediaTypeCharacters,
  );
  if (!MEDIA_TYPE_PATTERN.test(mediaType))
    throw new TypeError("Resume import media type is invalid.");
  const pageCount =
    sourceInput["pageCount"] === undefined ? null : exactInteger(sourceInput["pageCount"], 0, 500);
  const rawBlocks = input["blocks"] as readonly unknown[];
  if (rawBlocks.length > RESUME_IMPORT_LIMITS.maxBlocks) {
    throw new TypeError("Resume import has too many blocks.");
  }
  const blocks = rawBlocks.map((value): ResumeImportBlockInput => {
    if (!isRecord(value)) throw new TypeError("Resume import block is invalid.");
    return Object.freeze({
      text: boundedText(value["text"], RESUME_IMPORT_LIMITS.maxBlockCharacters),
      sourcePointer: boundedText(
        value["sourcePointer"],
        RESUME_IMPORT_LIMITS.maxSourcePointerCharacters,
      ),
      sourceExcerpt: boundedText(
        value["sourceExcerpt"],
        RESUME_IMPORT_LIMITS.maxSourceExcerptCharacters,
        false,
      ),
    });
  });
  const rawWarnings = input["warnings"] ?? [];
  if (!Array.isArray(rawWarnings) || rawWarnings.length > RESUME_IMPORT_LIMITS.maxWarnings) {
    throw new TypeError("Resume import warnings are invalid.");
  }
  const warnings = rawWarnings.map((value) => boundedText(value, 500));
  const normalizedBlocks = Object.freeze(blocks);
  return Object.freeze({
    blocks: normalizedBlocks,
    parsedProposals: extractResumeEvidenceProposals(normalizedBlocks),
    source: Object.freeze({
      byteLength: exactInteger(sourceInput["byteLength"], 1, RESUME_IMPORT_LIMITS.maxFileBytes),
      fileName: boundedText(sourceInput["fileName"], RESUME_IMPORT_LIMITS.maxFileNameCharacters),
      format: format as ResumeImportFormat,
      mediaType,
      pageCount,
      sha256,
    }),
    warnings: Object.freeze(warnings),
  });
};

const copyProposal = (
  value: unknown,
  expectedImportRunId?: EntityId<"import-run">,
): ResumeEvidenceProposalDto => {
  if (!isRecord(value)) throw new TypeError("Resume proposal result is invalid.");
  const target = value["target"];
  const fieldName = boundedText(value["fieldName"], 64);
  if (!RESUME_PROPOSAL_TARGETS.includes(target as ResumeProposalTarget)) {
    throw new TypeError("Resume proposal target is invalid.");
  }
  if (!SAFE_FIELD_PATTERN.test(fieldName)) throw new TypeError("Resume proposal field is invalid.");
  const importRunId = entityId("import-run", value["importRunId"] as string);
  if (expectedImportRunId !== undefined && importRunId !== expectedImportRunId) {
    throw new TypeError("Resume proposal import run changed.");
  }
  if (value["evidenceStatus"] !== "proposal" || value["reviewState"] !== "pending") {
    throw new TypeError("Resume proposal state is invalid.");
  }
  return Object.freeze({
    confidence: confidence(value["confidence"]),
    evidenceStatus: "proposal",
    fieldName,
    groupKey: boundedText(value["groupKey"], 128),
    id: entityId("career-import-proposal", value["id"] as string),
    importRunId,
    proposedValue: boundedText(value["proposedValue"], RESUME_IMPORT_LIMITS.maxBlockCharacters),
    reviewState: "pending",
    sourceExcerpt: boundedText(
      value["sourceExcerpt"],
      RESUME_IMPORT_LIMITS.maxSourceExcerptCharacters,
      false,
    ),
    sourcePointer: boundedText(
      value["sourcePointer"],
      RESUME_IMPORT_LIMITS.maxSourcePointerCharacters,
    ),
    target: target as ResumeProposalTarget,
  });
};

const copyQueueItem = (value: unknown): ResumeImportQueueItemDto => {
  if (!isRecord(value) || !isRecord(value["source"]) || !Array.isArray(value["proposals"])) {
    throw new TypeError("Resume import queue result is invalid.");
  }
  if (value["status"] !== "completed" || !Array.isArray(value["warnings"])) {
    throw new TypeError("Resume import queue state is invalid.");
  }
  const id = entityId("import-run", value["id"] as string);
  const source = value["source"];
  const format = source["format"];
  if (!RESUME_IMPORT_FORMATS.includes(format as ResumeImportFormat)) {
    throw new TypeError("Resume import queue format is invalid.");
  }
  const proposals = Object.freeze(
    (value["proposals"] as readonly unknown[]).map((proposal) => copyProposal(proposal, id)),
  );
  if (value["proposalCount"] !== proposals.length) {
    throw new TypeError("Resume import proposal count changed.");
  }
  const sha256 = boundedText(source["sha256"], 64);
  if (!SHA256_PATTERN.test(sha256)) throw new TypeError("Resume import queue hash is invalid.");
  const pageCount = source["pageCount"];
  return Object.freeze({
    completedAt: instant(value["completedAt"] as string),
    id,
    proposalCount: proposals.length,
    proposals,
    source: Object.freeze({
      byteLength: exactInteger(source["byteLength"], 1, RESUME_IMPORT_LIMITS.maxFileBytes),
      fileName: boundedText(source["fileName"], RESUME_IMPORT_LIMITS.maxFileNameCharacters),
      format: format as ResumeImportFormat,
      mediaType: boundedText(source["mediaType"], RESUME_IMPORT_LIMITS.maxMediaTypeCharacters),
      pageCount: pageCount === null ? null : exactInteger(pageCount, 0, 500),
      sha256,
    }),
    status: "completed",
    warnings: Object.freeze(
      (value["warnings"] as readonly unknown[]).map((warning) => boundedText(warning, 500)),
    ),
  });
};

const VALIDATION_ERROR: ApplicationError = Object.freeze({
  code: "validation",
  message: "Choose a supported local resume file and review its contents.",
  retryable: false,
});
const UNKNOWN_ERROR: ApplicationError = Object.freeze({
  code: "internal",
  message: "The local resume import failed safely.",
  retryable: false,
});
const PORT_ERRORS: Readonly<Record<ResumeImportErrorCode, ApplicationError>> = Object.freeze({
  busy: Object.freeze({
    code: "conflict",
    message: "The local resume-import queue is busy. Retry shortly.",
    retryable: true,
  }),
  invalid_state: Object.freeze({
    code: "internal",
    message: "The local resume-import queue is not in a usable state.",
    retryable: false,
  }),
  permission_denied: Object.freeze({
    code: "permission_denied",
    message: "Coredrill cannot access the local resume-import queue.",
    retryable: true,
  }),
  read_only: Object.freeze({
    code: "permission_denied",
    message: "The local resume-import queue is read-only.",
    retryable: false,
  }),
  unavailable: Object.freeze({
    code: "unavailable",
    message: "Local resume-import storage is unavailable.",
    retryable: true,
  }),
});

const failureFrom = <Value>(error: unknown): ApplicationResult<Value> =>
  applicationFailure(error instanceof ResumeImportError ? PORT_ERRORS[error.code] : UNKNOWN_ERROR);

export const createResumeImportOperations = (
  dependencies: ResumeImportOperationDependencies,
): ResumeImportOperations => {
  if (
    !isRecord(dependencies) ||
    !isRecord(dependencies.resumeImports) ||
    typeof dependencies.resumeImports.enqueue !== "function" ||
    typeof dependencies.resumeImports.listPending !== "function" ||
    typeof dependencies.createId !== "function"
  ) {
    throw new TypeError("Resume import operations require a complete local proposal port.");
  }

  const queueCommand = defineCommand<QueueResumeImportInput, ResumeImportQueueItemDto>(
    "QueueResumeImportCommand",
    async (input, context) => {
      let normalized: NormalizedResumeImport;
      try {
        normalized = normalizeInput(input);
      } catch {
        return applicationFailure(VALIDATION_ERROR);
      }

      try {
        const importRunId = entityId("import-run", dependencies.createId("import-run"));
        const proposals = Object.freeze(
          normalized.parsedProposals.map((proposal) =>
            Object.freeze({
              ...proposal,
              evidenceStatus: "proposal" as const,
              id: entityId(
                "career-import-proposal",
                dependencies.createId("career-import-proposal"),
              ),
              importRunId,
              reviewState: "pending" as const,
            }),
          ),
        );
        const at = instant(context.initiatedAt);
        const stored = await dependencies.resumeImports.enqueue({
          blocks: normalized.blocks,
          completedAt: at,
          id: importRunId,
          proposalCount: proposals.length,
          proposals,
          source: normalized.source,
          startedAt: at,
          status: "completed",
          warnings: normalized.warnings,
        });
        return applicationSuccess(copyQueueItem(stored));
      } catch (error) {
        return failureFrom<ResumeImportQueueItemDto>(error);
      }
    },
  );

  const listPendingQuery = defineQuery<undefined, readonly ResumeImportQueueItemDto[]>(
    "ListPendingResumeImportsQuery",
    async () => {
      try {
        const values = await dependencies.resumeImports.listPending();
        return applicationSuccess(Object.freeze(values.map(copyQueueItem)));
      } catch (error) {
        return failureFrom<readonly ResumeImportQueueItemDto[]>(error);
      }
    },
  );

  return Object.freeze({ listPendingQuery, queueCommand });
};
