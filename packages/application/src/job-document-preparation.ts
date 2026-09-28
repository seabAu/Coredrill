import { entityId, instant, type EntityId, type Instant } from "@coredrill/domain";

import {
  defineCommand,
  defineQuery,
  type ApplicationCommand,
  type ApplicationQuery,
} from "./operation.js";
import { applicationFailure, applicationSuccess, type ApplicationError } from "./result.js";

export const DOCUMENT_PREPARATION_STATUSES = Object.freeze([
  "missing",
  "draft",
  "review_needed",
  "ready",
] as const);
export type DocumentPreparationStatus = (typeof DOCUMENT_PREPARATION_STATUSES)[number];

export const DOCUMENT_PREPARATION_REASON_CODES = Object.freeze([
  "resume_missing",
  "selected_document_has_draft",
  "selected_version_not_latest",
] as const);
export type DocumentPreparationReasonCode = (typeof DOCUMENT_PREPARATION_REASON_CODES)[number];

export type ApplicationDocumentKind = "application_answer" | "cover_letter" | "resume";
export type ApplicationDocumentLineageRole = "base" | "job_derivative" | null;

export interface ApplicationDocumentCandidateDto {
  readonly documentId: EntityId<"document">;
  readonly documentVersionId: EntityId<"document-version">;
  readonly kind: ApplicationDocumentKind;
  readonly title: string;
  readonly versionNumber: number;
  readonly versionLabel: string | null;
  readonly lineageRole: ApplicationDocumentLineageRole;
  readonly relatedJobId: EntityId<"job"> | null;
  readonly latestVersion: boolean;
  readonly hasDraft: boolean;
  readonly claimStatus: "not_evaluated";
}

export interface ApplicationDocumentPreparationDto {
  readonly applicationId: EntityId<"application">;
  readonly jobId: EntityId<"job">;
  readonly applicationRowVersion: number;
  readonly submitted: boolean;
  readonly status: DocumentPreparationStatus;
  readonly reasons: readonly DocumentPreparationReasonCode[];
  readonly selected: {
    readonly resume: ApplicationDocumentCandidateDto | null;
    readonly coverLetter: ApplicationDocumentCandidateDto | null;
    readonly answers: readonly ApplicationDocumentCandidateDto[];
  };
  readonly candidates: {
    readonly resumes: readonly ApplicationDocumentCandidateDto[];
    readonly coverLetters: readonly ApplicationDocumentCandidateDto[];
    readonly answers: readonly ApplicationDocumentCandidateDto[];
  };
}

export interface LoadApplicationDocumentPreparationInput {
  readonly applicationId: EntityId<"application">;
}

export interface SaveApplicationDocumentPreparationInput {
  readonly applicationId: EntityId<"application">;
  readonly expectedApplicationRowVersion: number;
  readonly resumeVersionId: EntityId<"document-version"> | null;
  readonly coverLetterVersionId: EntityId<"document-version"> | null;
  readonly answerVersionIds: readonly EntityId<"document-version">[];
}

export interface SaveApplicationDocumentPreparationPortInput extends SaveApplicationDocumentPreparationInput {
  readonly updatedAt: Instant;
}

export type DocumentPreparationErrorCode =
  "conflict" | "immutable" | "invalid_state" | "not_found" | "unavailable";

export class DocumentPreparationError extends Error {
  public override readonly name = "DocumentPreparationError";

  public constructor(public readonly code: DocumentPreparationErrorCode) {
    super(code);
  }
}

export interface ApplicationDocumentPreparationPort {
  load(applicationId: EntityId<"application">): Promise<unknown>;
  save(input: SaveApplicationDocumentPreparationPortInput): Promise<unknown>;
}

export interface ApplicationDocumentPreparationOperations {
  readonly loadPreparationQuery: ApplicationQuery<
    LoadApplicationDocumentPreparationInput,
    ApplicationDocumentPreparationDto
  >;
  readonly savePreparationCommand: ApplicationCommand<
    SaveApplicationDocumentPreparationInput,
    ApplicationDocumentPreparationDto
  >;
}

const MAX_CANDIDATES = 5_000;
const MAX_ANSWERS = 128;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requiredText = (value: unknown, maximum: number): string => {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maximum ||
    value.includes("\u0000")
  ) {
    throw new TypeError("Stored document preparation text is invalid.");
  }
  return value;
};

const optionalText = (value: unknown, maximum: number): string | null =>
  value === null ? null : requiredText(value, maximum);

const positiveInteger = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new TypeError("Stored document preparation integer is invalid.");
  }
  return value as number;
};

const parsedId = <Kind extends string>(kind: Kind, value: unknown): EntityId<Kind> => {
  if (typeof value !== "string") throw new TypeError("Stored document preparation ID is invalid.");
  return entityId(kind, value);
};

const parsedCandidate = (value: unknown): ApplicationDocumentCandidateDto => {
  if (!isRecord(value)) throw new TypeError("Stored document candidate is invalid.");
  const kind = value["kind"];
  const lineageRole = value["lineageRole"];
  if (
    !(["application_answer", "cover_letter", "resume"] as const).includes(
      kind as ApplicationDocumentKind,
    )
  ) {
    throw new TypeError("Stored document candidate kind is invalid.");
  }
  if (lineageRole !== null && lineageRole !== "base" && lineageRole !== "job_derivative") {
    throw new TypeError("Stored document candidate lineage is invalid.");
  }
  if (typeof value["latestVersion"] !== "boolean" || typeof value["hasDraft"] !== "boolean") {
    throw new TypeError("Stored document candidate state is invalid.");
  }
  return Object.freeze({
    documentId: parsedId("document", value["documentId"]),
    documentVersionId: parsedId("document-version", value["documentVersionId"]),
    kind: kind as ApplicationDocumentKind,
    title: requiredText(value["title"], 512),
    versionNumber: positiveInteger(value["versionNumber"]),
    versionLabel: optionalText(value["versionLabel"], 256),
    lineageRole,
    relatedJobId: value["relatedJobId"] === null ? null : parsedId("job", value["relatedJobId"]),
    latestVersion: value["latestVersion"],
    hasDraft: value["hasDraft"],
    claimStatus: "not_evaluated",
  });
};

const parsedCandidateList = (value: unknown): readonly ApplicationDocumentCandidateDto[] => {
  if (!Array.isArray(value) || value.length > MAX_CANDIDATES) {
    throw new TypeError("Stored document candidate list is invalid.");
  }
  const candidates = value.map(parsedCandidate);
  if (
    new Set(candidates.map(({ documentVersionId }) => documentVersionId)).size !== candidates.length
  ) {
    throw new TypeError("Stored document candidate list contains duplicates.");
  }
  return Object.freeze(candidates);
};

const selectedCandidate = (
  value: unknown,
  candidates: readonly ApplicationDocumentCandidateDto[],
  expectedKind: ApplicationDocumentKind,
): ApplicationDocumentCandidateDto | null => {
  if (value === null) return null;
  const id = parsedId("document-version", value);
  const candidate = candidates.find(({ documentVersionId }) => documentVersionId === id);
  if (candidate?.kind !== expectedKind) {
    throw new TypeError("Stored selected document is not an eligible candidate.");
  }
  return candidate;
};

export const deriveDocumentPreparationStatus = (input: {
  readonly resume: ApplicationDocumentCandidateDto | null;
  readonly coverLetter: ApplicationDocumentCandidateDto | null;
  readonly answers: readonly ApplicationDocumentCandidateDto[];
}): Pick<ApplicationDocumentPreparationDto, "status" | "reasons"> => {
  const selected = [input.resume, input.coverLetter, ...input.answers].filter(
    (candidate): candidate is ApplicationDocumentCandidateDto => candidate !== null,
  );
  const reasons: DocumentPreparationReasonCode[] = [];
  if (input.resume === null) reasons.push("resume_missing");
  if (selected.some(({ hasDraft }) => hasDraft)) reasons.push("selected_document_has_draft");
  if (selected.some(({ latestVersion }) => !latestVersion)) {
    reasons.push("selected_version_not_latest");
  }
  const status: DocumentPreparationStatus = reasons.includes("resume_missing")
    ? "missing"
    : reasons.includes("selected_document_has_draft")
      ? "draft"
      : reasons.includes("selected_version_not_latest")
        ? "review_needed"
        : "ready";
  return Object.freeze({ status, reasons: Object.freeze(reasons) });
};

export const validateApplicationDocumentPreparation = (
  value: unknown,
): ApplicationDocumentPreparationDto => {
  if (!isRecord(value) || !isRecord(value["candidates"]) || !isRecord(value["selected"])) {
    throw new TypeError("Stored application document preparation is invalid.");
  }
  if (typeof value["submitted"] !== "boolean") {
    throw new TypeError("Stored application submission state is invalid.");
  }
  const resumes = parsedCandidateList(value["candidates"]["resumes"]);
  const coverLetters = parsedCandidateList(value["candidates"]["coverLetters"]);
  const answers = parsedCandidateList(value["candidates"]["answers"]);
  if (
    resumes.some(({ kind }) => kind !== "resume") ||
    coverLetters.some(({ kind }) => kind !== "cover_letter") ||
    answers.some(({ kind }) => kind !== "application_answer")
  ) {
    throw new TypeError("Stored document candidates are in the wrong collection.");
  }
  const resume = selectedCandidate(value["selected"]["resumeVersionId"], resumes, "resume");
  const coverLetter = selectedCandidate(
    value["selected"]["coverLetterVersionId"],
    coverLetters,
    "cover_letter",
  );
  const answerIds = value["selected"]["answerVersionIds"];
  if (!Array.isArray(answerIds) || answerIds.length > MAX_ANSWERS) {
    throw new TypeError("Stored selected answers are invalid.");
  }
  const selectedAnswers = answerIds.map((id) =>
    selectedCandidate(id, answers, "application_answer"),
  );
  if (selectedAnswers.some((candidate) => candidate === null)) {
    throw new TypeError("Stored selected answer is invalid.");
  }
  const selectedAnswerCandidates = selectedAnswers as ApplicationDocumentCandidateDto[];
  if (
    new Set(selectedAnswerCandidates.map(({ documentVersionId }) => documentVersionId)).size !==
      selectedAnswerCandidates.length ||
    new Set(selectedAnswerCandidates.map(({ documentId }) => documentId)).size !==
      selectedAnswerCandidates.length
  ) {
    throw new TypeError("Stored selected answers contain duplicate versions or documents.");
  }
  const derived = deriveDocumentPreparationStatus({
    resume,
    coverLetter,
    answers: selectedAnswerCandidates,
  });
  return Object.freeze({
    applicationId: parsedId("application", value["applicationId"]),
    jobId: parsedId("job", value["jobId"]),
    applicationRowVersion: positiveInteger(value["applicationRowVersion"]),
    submitted: value["submitted"],
    ...derived,
    selected: Object.freeze({
      resume,
      coverLetter,
      answers: Object.freeze(selectedAnswerCandidates),
    }),
    candidates: Object.freeze({ resumes, coverLetters, answers }),
  });
};

const checkedLoadInput = (
  input: LoadApplicationDocumentPreparationInput,
): EntityId<"application"> => entityId("application", input.applicationId);

const checkedSaveInput = (
  input: SaveApplicationDocumentPreparationInput,
  initiatedAt: Instant,
): SaveApplicationDocumentPreparationPortInput => {
  if (
    !Number.isSafeInteger(input.expectedApplicationRowVersion) ||
    input.expectedApplicationRowVersion < 1 ||
    input.answerVersionIds.length > MAX_ANSWERS ||
    new Set(input.answerVersionIds).size !== input.answerVersionIds.length
  ) {
    throw new TypeError("Application document selection is invalid.");
  }
  return Object.freeze({
    applicationId: entityId("application", input.applicationId),
    expectedApplicationRowVersion: input.expectedApplicationRowVersion,
    resumeVersionId:
      input.resumeVersionId === null ? null : entityId("document-version", input.resumeVersionId),
    coverLetterVersionId:
      input.coverLetterVersionId === null
        ? null
        : entityId("document-version", input.coverLetterVersionId),
    answerVersionIds: Object.freeze(
      input.answerVersionIds.map((id) => entityId("document-version", id)),
    ),
    updatedAt: instant(initiatedAt),
  });
};

const PORT_ERRORS: Readonly<Record<DocumentPreparationErrorCode, ApplicationError>> = Object.freeze(
  {
    conflict: Object.freeze({
      code: "conflict",
      message: "The application document set changed before this save. Reload and review it again.",
      retryable: true,
    }),
    immutable: Object.freeze({
      code: "conflict",
      message:
        "Submitted application materials are immutable. Start a new application attempt instead.",
      retryable: false,
    }),
    invalid_state: Object.freeze({
      code: "validation",
      message: "Choose eligible local document versions for this job.",
      retryable: false,
    }),
    not_found: Object.freeze({
      code: "not_found",
      message: "This local application could not be found.",
      retryable: false,
    }),
    unavailable: Object.freeze({
      code: "unavailable",
      message: "Local application documents are temporarily unavailable.",
      retryable: true,
    }),
  },
);

const failureFrom = <Value>(error: unknown) =>
  applicationFailure<Value>(
    error instanceof DocumentPreparationError
      ? PORT_ERRORS[error.code]
      : Object.freeze({
          code: "internal" as const,
          message: "Application document preparation could not be completed safely.",
          retryable: false,
        }),
  );

export const createApplicationDocumentPreparationOperations = (dependencies: {
  readonly preparation: ApplicationDocumentPreparationPort;
}): ApplicationDocumentPreparationOperations => {
  if (
    !isRecord(dependencies) ||
    !isRecord(dependencies.preparation) ||
    typeof dependencies.preparation.load !== "function" ||
    typeof dependencies.preparation.save !== "function"
  ) {
    throw new TypeError("Document preparation operations require a complete local port.");
  }
  return Object.freeze({
    loadPreparationQuery: defineQuery<
      LoadApplicationDocumentPreparationInput,
      ApplicationDocumentPreparationDto
    >("LoadApplicationDocumentPreparationQuery", async (input) => {
      try {
        return applicationSuccess(
          validateApplicationDocumentPreparation(
            await dependencies.preparation.load(checkedLoadInput(input)),
          ),
        );
      } catch (error) {
        if (error instanceof TypeError) {
          return applicationFailure({
            code: "validation",
            message: "The application document request is invalid.",
            retryable: false,
          });
        }
        return failureFrom(error);
      }
    }),
    savePreparationCommand: defineCommand<
      SaveApplicationDocumentPreparationInput,
      ApplicationDocumentPreparationDto
    >("SaveApplicationDocumentPreparationCommand", async (input, context) => {
      try {
        return applicationSuccess(
          validateApplicationDocumentPreparation(
            await dependencies.preparation.save(checkedSaveInput(input, context.initiatedAt)),
          ),
        );
      } catch (error) {
        if (error instanceof TypeError) {
          return applicationFailure({
            code: "validation",
            message: "The application document selection is invalid.",
            retryable: false,
          });
        }
        return failureFrom(error);
      }
    }),
  });
};
