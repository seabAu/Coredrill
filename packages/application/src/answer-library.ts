import type { JsonValue } from "@coredrill/contracts";
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

export const ANSWER_SENSITIVITIES = Object.freeze(["standard", "sensitive", "restricted"] as const);
export type AnswerSensitivity = (typeof ANSWER_SENSITIVITIES)[number];
export const ANSWER_SOURCE_KINDS = Object.freeze(["manual", "application"] as const);
export type AnswerSourceKind = (typeof ANSWER_SOURCE_KINDS)[number];

export interface AnswerLibraryVersionDto {
  readonly id: EntityId<"document-version">;
  readonly versionNumber: number;
  readonly question: string;
  readonly answer: string;
  readonly sensitivity: AnswerSensitivity;
  readonly createdAt: Instant;
  readonly parentVersionId: EntityId<"document-version"> | null;
  readonly contentHash: string;
}

export interface AnswerLibraryEntryDto {
  readonly id: EntityId<"document">;
  readonly sourceKind: AnswerSourceKind;
  readonly sourceJobId: EntityId<"job"> | null;
  readonly sourceContext: string | null;
  readonly lastUsedAt: Instant | null;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
  readonly rowVersion: number;
  readonly currentVersion: AnswerLibraryVersionDto;
  readonly versions: readonly AnswerLibraryVersionDto[];
}

export interface CreateAnswerLibraryEntryInput {
  readonly question: string;
  readonly answer: string;
  readonly sensitivity: AnswerSensitivity;
  readonly sourceKind?: AnswerSourceKind;
  readonly sourceJobId?: string | null;
  readonly sourceContext?: string | null;
}

export interface UpdateAnswerLibraryEntryInput {
  readonly id: string;
  readonly question: string;
  readonly answer: string;
  readonly sensitivity: AnswerSensitivity;
  readonly expectedRowVersion: number;
}

export interface MarkAnswerLibraryEntryUsedInput {
  readonly id: string;
  readonly expectedRowVersion: number;
}

export interface AnswerLibraryValidationIssue {
  readonly field: string;
  readonly message: string;
}

interface NormalizedAnswerContent {
  readonly question: string;
  readonly answer: string;
  readonly sensitivity: AnswerSensitivity;
}

interface AnswerVersionPortInput extends NormalizedAnswerContent {
  readonly versionId: EntityId<"document-version">;
  readonly contentIr: JsonValue;
  readonly contentHash: string;
}

export interface CreateAnswerLibraryEntryPortInput extends AnswerVersionPortInput {
  readonly id: EntityId<"document">;
  readonly sourceKind: AnswerSourceKind;
  readonly sourceJobId: EntityId<"job"> | null;
  readonly sourceContext: string | null;
  readonly createdAt: Instant;
}

export interface UpdateAnswerLibraryEntryPortInput extends AnswerVersionPortInput {
  readonly id: EntityId<"document">;
  readonly expectedRowVersion: number;
  readonly updatedAt: Instant;
}

export interface AnswerLibraryPort {
  createAnswer(input: CreateAnswerLibraryEntryPortInput): Promise<AnswerLibraryEntryDto>;
  updateAnswer(input: UpdateAnswerLibraryEntryPortInput): Promise<AnswerLibraryEntryDto>;
  markAnswerUsed(
    id: EntityId<"document">,
    expectedRowVersion: number,
    usedAt: Instant,
  ): Promise<AnswerLibraryEntryDto>;
  listAnswers(): Promise<readonly AnswerLibraryEntryDto[]>;
}

export type AnswerLibraryErrorCode =
  "busy" | "conflict" | "invalid_state" | "permission_denied" | "read_only" | "unavailable";

export class AnswerLibraryError extends Error {
  public override readonly name = "AnswerLibraryError";
  public constructor(public readonly code: AnswerLibraryErrorCode) {
    super("The Answer Library port reported a failure.");
  }
}

export interface AnswerLibraryOperationDependencies {
  readonly answers: AnswerLibraryPort;
  readonly createId: (kind: "document" | "document-version") => string;
  readonly hashText: (value: string) => Promise<string>;
}

export interface AnswerLibraryOperations {
  readonly createAnswerCommand: ApplicationCommand<
    CreateAnswerLibraryEntryInput,
    AnswerLibraryEntryDto
  >;
  readonly updateAnswerCommand: ApplicationCommand<
    UpdateAnswerLibraryEntryInput,
    AnswerLibraryEntryDto
  >;
  readonly markAnswerUsedCommand: ApplicationCommand<
    MarkAnswerLibraryEntryUsedInput,
    AnswerLibraryEntryDto
  >;
  readonly listAnswersQuery: ApplicationQuery<undefined, readonly AnswerLibraryEntryDto[]>;
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const issue = (field: string, message: string): AnswerLibraryValidationIssue =>
  Object.freeze({ field, message });

const checkedText = (
  value: unknown,
  field: string,
  maximum: number,
  issues: AnswerLibraryValidationIssue[],
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

export const validateAnswerLibraryEntry = (
  input: unknown,
):
  | { readonly ok: true; readonly value: NormalizedAnswerContent }
  | { readonly ok: false; readonly issues: readonly AnswerLibraryValidationIssue[] } => {
  if (!isRecord(input)) {
    return Object.freeze({
      ok: false as const,
      issues: Object.freeze([issue("question", "Enter an answer.")]),
    });
  }
  const issues: AnswerLibraryValidationIssue[] = [];
  const question = checkedText(input["question"], "question", 512, issues);
  const answer = checkedText(input["answer"], "answer", 200_000, issues);
  const sensitivity = input["sensitivity"];
  if (!ANSWER_SENSITIVITIES.includes(sensitivity as AnswerSensitivity)) {
    issues.push(issue("sensitivity", "Choose a reviewed sensitivity classification."));
  }
  if (question === null || answer === null || issues.length > 0) {
    return Object.freeze({ ok: false as const, issues: Object.freeze(issues) });
  }
  return Object.freeze({
    ok: true as const,
    value: Object.freeze({ question, answer, sensitivity: sensitivity as AnswerSensitivity }),
  });
};

const documentIr = (answer: string): JsonValue => ({
  specVersion: 1,
  document: {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: answer }] }],
  },
});

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

const copyVersion = (value: unknown): AnswerLibraryVersionDto => {
  if (!isRecord(value)) throw new TypeError("Invalid Answer Library version.");
  const validation = validateAnswerLibraryEntry(value);
  if (!validation.ok) throw new TypeError("Invalid Answer Library version.");
  if (!Number.isSafeInteger(value["versionNumber"]) || (value["versionNumber"] as number) < 1) {
    throw new TypeError("Invalid Answer Library version.");
  }
  if (typeof value["contentHash"] !== "string" || !SHA256_PATTERN.test(value["contentHash"])) {
    throw new TypeError("Invalid Answer Library version.");
  }
  return Object.freeze({
    id: entityId("document-version", value["id"] as string),
    versionNumber: value["versionNumber"] as number,
    ...validation.value,
    createdAt: instant(value["createdAt"] as string),
    parentVersionId:
      value["parentVersionId"] === null
        ? null
        : entityId("document-version", value["parentVersionId"] as string),
    contentHash: value["contentHash"],
  });
};

const copyAnswer = (value: unknown): AnswerLibraryEntryDto => {
  if (!isRecord(value) || !Array.isArray(value["versions"])) {
    throw new TypeError("Invalid Answer Library entry.");
  }
  const sourceKind = value["sourceKind"];
  const rowVersion = value["rowVersion"];
  if (
    !ANSWER_SOURCE_KINDS.includes(sourceKind as AnswerSourceKind) ||
    !Number.isSafeInteger(rowVersion) ||
    (rowVersion as number) < 1
  ) {
    throw new TypeError("Invalid Answer Library entry.");
  }
  const versions = Object.freeze((value["versions"] as readonly unknown[]).map(copyVersion));
  const currentVersion = copyVersion(value["currentVersion"]);
  if (
    versions.at(-1)?.id !== currentVersion.id ||
    versions.some(
      (version, index) =>
        version.versionNumber !== index + 1 ||
        (index === 0) !== (version.parentVersionId === null) ||
        (index > 0 && version.parentVersionId !== versions[index - 1]?.id),
    )
  ) {
    throw new TypeError("Invalid Answer Library version history.");
  }
  const sourceContext = value["sourceContext"];
  if (sourceContext !== null && typeof sourceContext !== "string") {
    throw new TypeError("Invalid Answer Library provenance.");
  }
  const sourceJobId =
    value["sourceJobId"] === null ? null : entityId("job", value["sourceJobId"] as string);
  if ((sourceKind === "manual") !== (sourceJobId === null)) {
    throw new TypeError("Invalid Answer Library provenance.");
  }
  return Object.freeze({
    id: entityId("document", value["id"] as string),
    sourceKind: sourceKind as AnswerSourceKind,
    sourceJobId,
    sourceContext,
    lastUsedAt: value["lastUsedAt"] === null ? null : instant(value["lastUsedAt"] as string),
    createdAt: instant(value["createdAt"] as string),
    updatedAt: instant(value["updatedAt"] as string),
    rowVersion: rowVersion as number,
    currentVersion,
    versions,
  });
};

const VALIDATION_ERROR: ApplicationError = Object.freeze({
  code: "validation",
  message: "Review the highlighted Answer Library fields and try again.",
  retryable: false,
});
const UNKNOWN_ERROR: ApplicationError = Object.freeze({
  code: "internal",
  message: "The local Answer Library operation failed safely.",
  retryable: false,
});
const PORT_ERRORS: Readonly<Record<AnswerLibraryErrorCode, ApplicationError>> = Object.freeze({
  busy: Object.freeze({
    code: "conflict",
    message: "The local Answer Library is busy. Retry shortly.",
    retryable: true,
  }),
  conflict: Object.freeze({
    code: "conflict",
    message: "This answer changed elsewhere. Reload before saving.",
    retryable: true,
  }),
  invalid_state: Object.freeze({
    code: "internal",
    message: "The local Answer Library is not usable.",
    retryable: false,
  }),
  permission_denied: Object.freeze({
    code: "permission_denied",
    message: "Coredrill cannot access the local Answer Library.",
    retryable: true,
  }),
  read_only: Object.freeze({
    code: "permission_denied",
    message: "The local Answer Library is read-only.",
    retryable: false,
  }),
  unavailable: Object.freeze({
    code: "unavailable",
    message: "Local Answer Library storage is unavailable.",
    retryable: true,
  }),
});

const failureFrom = <Value>(error: unknown): ApplicationResult<Value> =>
  applicationFailure(error instanceof AnswerLibraryError ? PORT_ERRORS[error.code] : UNKNOWN_ERROR);

const source = (
  input: CreateAnswerLibraryEntryInput,
): {
  sourceKind: AnswerSourceKind;
  sourceJobId: EntityId<"job"> | null;
  sourceContext: string | null;
} | null => {
  const sourceKind = input.sourceKind ?? "manual";
  if (!ANSWER_SOURCE_KINDS.includes(sourceKind)) return null;
  const sourceContext = input.sourceContext ?? null;
  if (
    sourceContext !== null &&
    (typeof sourceContext !== "string" ||
      sourceContext.includes("\u0000") ||
      sourceContext.trim().length === 0 ||
      sourceContext.length > 2_000)
  )
    return null;
  try {
    const sourceJobId =
      input.sourceJobId === null || input.sourceJobId === undefined
        ? null
        : entityId("job", input.sourceJobId);
    if ((sourceKind === "manual") !== (sourceJobId === null)) return null;
    return Object.freeze({ sourceKind, sourceJobId, sourceContext: sourceContext?.trim() ?? null });
  } catch {
    return null;
  }
};

const versionInput = async (
  dependencies: AnswerLibraryOperationDependencies,
  content: NormalizedAnswerContent,
): Promise<AnswerVersionPortInput> => {
  const contentIr = documentIr(content.answer);
  const hash = await dependencies.hashText(JSON.stringify(contentIr));
  if (!SHA256_PATTERN.test(hash))
    throw new TypeError("Answer hash dependency returned invalid output.");
  return Object.freeze({
    ...content,
    versionId: entityId("document-version", dependencies.createId("document-version")),
    contentIr,
    contentHash: hash,
  });
};

export const createAnswerLibraryOperations = (
  dependencies: AnswerLibraryOperationDependencies,
): AnswerLibraryOperations => {
  if (
    !isRecord(dependencies) ||
    !isRecord(dependencies.answers) ||
    typeof dependencies.answers.createAnswer !== "function" ||
    typeof dependencies.answers.updateAnswer !== "function" ||
    typeof dependencies.answers.markAnswerUsed !== "function" ||
    typeof dependencies.answers.listAnswers !== "function" ||
    typeof dependencies.createId !== "function" ||
    typeof dependencies.hashText !== "function"
  )
    throw new TypeError("Answer Library operations require a complete local persistence port.");

  const createAnswerCommand = defineCommand<CreateAnswerLibraryEntryInput, AnswerLibraryEntryDto>(
    "CreateAnswerLibraryEntryCommand",
    async (input, context) => {
      const validation = validateAnswerLibraryEntry(input);
      const provenance = source(input);
      if (!validation.ok || provenance === null) return applicationFailure(VALIDATION_ERROR);
      try {
        const createdAt = instant(context.initiatedAt);
        return applicationSuccess(
          copyAnswer(
            await dependencies.answers.createAnswer({
              ...(await versionInput(dependencies, validation.value)),
              ...provenance,
              id: entityId("document", dependencies.createId("document")),
              createdAt,
            }),
          ),
        );
      } catch (error) {
        return failureFrom(error);
      }
    },
  );

  const updateAnswerCommand = defineCommand<UpdateAnswerLibraryEntryInput, AnswerLibraryEntryDto>(
    "UpdateAnswerLibraryEntryCommand",
    async (input, context) => {
      const validation = validateAnswerLibraryEntry(input);
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
          copyAnswer(
            await dependencies.answers.updateAnswer({
              ...(await versionInput(dependencies, validation.value)),
              id: entityId("document", input.id),
              expectedRowVersion: input.expectedRowVersion,
              updatedAt: instant(context.initiatedAt),
            }),
          ),
        );
      } catch (error) {
        return failureFrom(error);
      }
    },
  );

  const markAnswerUsedCommand = defineCommand<
    MarkAnswerLibraryEntryUsedInput,
    AnswerLibraryEntryDto
  >("MarkAnswerLibraryEntryUsedCommand", async (input, context) => {
    if (
      !isRecord(input) ||
      typeof input.id !== "string" ||
      !Number.isSafeInteger(input.expectedRowVersion) ||
      input.expectedRowVersion < 1
    ) {
      return applicationFailure(VALIDATION_ERROR);
    }
    try {
      return applicationSuccess(
        copyAnswer(
          await dependencies.answers.markAnswerUsed(
            entityId("document", input.id),
            input.expectedRowVersion,
            instant(context.initiatedAt),
          ),
        ),
      );
    } catch (error) {
      return failureFrom(error);
    }
  });

  const listAnswersQuery = defineQuery<undefined, readonly AnswerLibraryEntryDto[]>(
    "ListAnswerLibraryEntriesQuery",
    async () => {
      try {
        const answers = (await dependencies.answers.listAnswers()).map(copyAnswer);
        if (new Set(answers.map(({ id }) => id)).size !== answers.length)
          throw new TypeError("Answer identities must be unique.");
        return applicationSuccess(Object.freeze(answers));
      } catch (error) {
        return failureFrom(error);
      }
    },
  );

  return Object.freeze({
    createAnswerCommand,
    updateAnswerCommand,
    markAnswerUsedCommand,
    listAnswersQuery,
  });
};
