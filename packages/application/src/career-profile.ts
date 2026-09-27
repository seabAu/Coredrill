import {
  compareDateOnly,
  dateOnly,
  entityId,
  instant,
  webUrl,
  type DateOnly,
  type EntityId,
  type Instant,
  type WebUrl,
} from "@coredrill/domain";

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

export const MANUAL_CAREER_PROFILE_KINDS = Object.freeze([
  "basics",
  "employment",
  "education",
  "project",
  "skill",
  "accomplishment",
  "certification",
  "publication",
  "volunteer",
] as const);
export type ManualCareerProfileKind = (typeof MANUAL_CAREER_PROFILE_KINDS)[number];

export interface CareerProfileValidationIssue {
  readonly field: string;
  readonly message: string;
}

export interface ManualCareerBasicsInput {
  readonly kind: "basics";
  readonly displayName: string;
  readonly summary?: string;
  readonly targetRoles?: readonly string[];
  readonly workModes?: readonly string[];
}

interface ManualDateRangeInput {
  readonly startDate?: string | null;
  readonly endDate?: string | null;
}

export interface ManualEmploymentInput extends ManualDateRangeInput {
  readonly kind: "employment";
  readonly organization: string;
  readonly role: string;
  readonly current?: boolean;
  readonly description?: string;
}

export interface ManualEducationInput extends ManualDateRangeInput {
  readonly kind: "education";
  readonly institution: string;
  readonly credential: string;
  readonly field?: string | null;
  readonly details?: string;
}

export interface ManualProjectInput extends ManualDateRangeInput {
  readonly kind: "project";
  readonly name: string;
  readonly summary?: string;
  readonly url?: string | null;
}

export interface ManualSkillInput {
  readonly kind: "skill";
  readonly canonicalName: string;
  readonly category?: string | null;
  readonly aliases?: readonly string[];
}

export interface ManualAccomplishmentInput {
  readonly kind: "accomplishment";
  readonly action: string;
  readonly result: string;
}

export interface ManualCertificationInput {
  readonly kind: "certification";
  readonly name: string;
  readonly issuer: string;
  readonly issuedDate?: string | null;
  readonly expiresDate?: string | null;
  readonly credentialUrl?: string | null;
}

export interface ManualPublicationInput {
  readonly kind: "publication";
  readonly title: string;
  readonly publisher?: string | null;
  readonly publishedDate?: string | null;
  readonly url?: string | null;
  readonly summary?: string;
}

export interface ManualVolunteerInput extends ManualDateRangeInput {
  readonly kind: "volunteer";
  readonly organization: string;
  readonly role: string;
  readonly current?: boolean;
  readonly description?: string;
}

export type CreateManualCareerProfileEntryInput =
  | ManualAccomplishmentInput
  | ManualCareerBasicsInput
  | ManualCertificationInput
  | ManualEducationInput
  | ManualEmploymentInput
  | ManualProjectInput
  | ManualPublicationInput
  | ManualSkillInput
  | ManualVolunteerInput;

interface CareerAuditPortInput {
  readonly archivedAt: null;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
}

interface EvidencePortInput extends CareerAuditPortInput {
  readonly sourceDocumentId: null;
  readonly verificationState: "user_confirmed";
}

export type CreateManualCareerProfilePortInput =
  | (CareerAuditPortInput & {
      readonly kind: "basics";
      readonly id: EntityId<"candidate-profile">;
      readonly displayName: string;
      readonly summary: string;
      readonly targetRoles: readonly string[];
      readonly locationId: null;
      readonly workPreferences: Readonly<{ readonly workModes: readonly string[] }>;
    })
  | (EvidencePortInput & {
      readonly kind: "employment";
      readonly id: EntityId<"experience">;
      readonly organization: string;
      readonly role: string;
      readonly startDate: DateOnly | null;
      readonly endDate: DateOnly | null;
      readonly current: boolean;
      readonly description: string;
    })
  | (EvidencePortInput & {
      readonly kind: "education";
      readonly id: EntityId<"education">;
      readonly institution: string;
      readonly credential: string;
      readonly field: string | null;
      readonly startDate: DateOnly | null;
      readonly endDate: DateOnly | null;
      readonly details: string;
    })
  | (EvidencePortInput & {
      readonly kind: "project";
      readonly id: EntityId<"project">;
      readonly name: string;
      readonly summary: string;
      readonly url: WebUrl | null;
      readonly startDate: DateOnly | null;
      readonly endDate: DateOnly | null;
    })
  | (CareerAuditPortInput & {
      readonly kind: "skill";
      readonly id: EntityId<"skill">;
      readonly canonicalName: string;
      readonly category: string | null;
      readonly aliases: readonly string[];
    })
  | (EvidencePortInput & {
      readonly kind: "accomplishment";
      readonly id: EntityId<"accomplishment">;
      readonly parentType: "standalone";
      readonly parentId: null;
      readonly action: string;
      readonly result: string;
      readonly metrics: Readonly<Record<string, never>>;
    })
  | (EvidencePortInput & {
      readonly kind: "certification";
      readonly id: EntityId<"certification">;
      readonly name: string;
      readonly issuer: string;
      readonly issuedDate: DateOnly | null;
      readonly expiresDate: DateOnly | null;
      readonly credentialUrl: WebUrl | null;
    })
  | (EvidencePortInput & {
      readonly kind: "publication";
      readonly id: EntityId<"publication">;
      readonly title: string;
      readonly publisher: string | null;
      readonly publishedDate: DateOnly | null;
      readonly url: WebUrl | null;
      readonly summary: string;
    })
  | (EvidencePortInput & {
      readonly kind: "volunteer";
      readonly id: EntityId<"volunteer-experience">;
      readonly organization: string;
      readonly role: string;
      readonly startDate: DateOnly | null;
      readonly endDate: DateOnly | null;
      readonly current: boolean;
      readonly description: string;
    });

export interface CareerProfileEntryDto {
  readonly id: EntityId;
  readonly kind: ManualCareerProfileKind;
  readonly primaryLabel: string;
  readonly secondaryLabel: string | null;
  readonly startDate: DateOnly | null;
  readonly endDate: DateOnly | null;
  readonly current: boolean;
  readonly verificationState: "user_confirmed" | null;
  readonly createdAt: Instant;
  readonly rowVersion: number;
}

export interface CareerProfilePort {
  createManualEntry(input: CreateManualCareerProfilePortInput): Promise<CareerProfileEntryDto>;
  listManualEntries(): Promise<readonly CareerProfileEntryDto[]>;
}

export const CAREER_PROFILE_ERROR_CODES = Object.freeze([
  "already_exists",
  "busy",
  "invalid_state",
  "permission_denied",
  "read_only",
  "unavailable",
] as const);
export type CareerProfileErrorCode = (typeof CAREER_PROFILE_ERROR_CODES)[number];

export class CareerProfileError extends Error {
  public readonly code: CareerProfileErrorCode;

  public constructor(code: CareerProfileErrorCode) {
    if (!CAREER_PROFILE_ERROR_CODES.includes(code)) {
      throw new TypeError("Career Profile failures require a reviewed stable code.");
    }
    super("The Career Profile port reported a failure.");
    this.name = "CareerProfileError";
    this.code = code;
  }
}

export interface CareerProfileOperationDependencies {
  readonly careerProfile: CareerProfilePort;
  readonly createId: (kind: ManualCareerProfileKind) => string;
}

export interface CareerProfileOperations {
  readonly createManualEntryCommand: ApplicationCommand<
    CreateManualCareerProfileEntryInput,
    CareerProfileEntryDto
  >;
  readonly listManualEntriesQuery: ApplicationQuery<undefined, readonly CareerProfileEntryDto[]>;
}

type PortFieldsToOmit =
  "archivedAt" | "createdAt" | "id" | "sourceDocumentId" | "updatedAt" | "verificationState";
type NormalizePortInput<T> = T extends unknown ? Omit<T, PortFieldsToOmit> : never;
type NormalizedManualInput = NormalizePortInput<CreateManualCareerProfilePortInput>;

export type CareerProfileValidationResult =
  | { readonly ok: true; readonly value: NormalizedManualInput }
  | { readonly issues: readonly CareerProfileValidationIssue[]; readonly ok: false };

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const issue = (field: string, message: string): CareerProfileValidationIssue =>
  Object.freeze({ field, message });

const cleanText = (
  value: unknown,
  field: string,
  maximum: number,
  required: boolean,
  issues: CareerProfileValidationIssue[],
): string | null => {
  if (value === undefined || value === null || value === "") {
    if (required) issues.push(issue(field, "Enter a value."));
    return required ? null : "";
  }
  if (typeof value !== "string" || value.includes("\u0000") || value.length > maximum) {
    issues.push(issue(field, `Use at most ${maximum.toLocaleString("en-US")} characters.`));
    return null;
  }
  const cleaned = value.trim();
  if (required && cleaned.length === 0) {
    issues.push(issue(field, "Enter a value."));
    return null;
  }
  return cleaned;
};

const optionalText = (
  value: unknown,
  field: string,
  maximum: number,
  issues: CareerProfileValidationIssue[],
): string | null => {
  const cleaned = cleanText(value, field, maximum, false, issues);
  return cleaned === "" ? null : cleaned;
};

const optionalDate = (
  value: unknown,
  field: string,
  issues: CareerProfileValidationIssue[],
): DateOnly | null => {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    issues.push(issue(field, "Use a real date in YYYY-MM-DD format."));
    return null;
  }
  try {
    return dateOnly(value);
  } catch {
    issues.push(issue(field, "Use a real date in YYYY-MM-DD format."));
    return null;
  }
};

const optionalUrl = (
  value: unknown,
  field: string,
  issues: CareerProfileValidationIssue[],
): WebUrl | null => {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    issues.push(issue(field, "Use an absolute HTTP(S) URL without credentials."));
    return null;
  }
  try {
    return webUrl(value.trim());
  } catch {
    issues.push(issue(field, "Use an absolute HTTP(S) URL without credentials."));
    return null;
  }
};

const stringList = (
  value: unknown,
  field: string,
  maximumItems: number,
  maximumLength: number,
  issues: CareerProfileValidationIssue[],
): readonly string[] => {
  if (value === undefined) return Object.freeze([]);
  const values: readonly unknown[] = Array.isArray(value) ? (value as readonly unknown[]) : [];
  if (
    !Array.isArray(value) ||
    values.length > maximumItems ||
    values.some((item) => typeof item !== "string")
  ) {
    issues.push(issue(field, `Use at most ${String(maximumItems)} text values.`));
    return Object.freeze([]);
  }
  const cleaned = values.map((item) => (item as string).trim()).filter((item) => item.length > 0);
  if (
    cleaned.some((item) => item.length > maximumLength || item.includes("\u0000")) ||
    new Set(cleaned.map((item) => item.toLocaleLowerCase("en-US"))).size !== cleaned.length
  ) {
    issues.push(issue(field, "Use unique, bounded text values."));
    return Object.freeze([]);
  }
  return Object.freeze(cleaned);
};

const range = (
  record: Readonly<Record<string, unknown>>,
  issues: CareerProfileValidationIssue[],
): { readonly startDate: DateOnly | null; readonly endDate: DateOnly | null } => {
  const startDate = optionalDate(record["startDate"], "startDate", issues);
  const endDate = optionalDate(record["endDate"], "endDate", issues);
  if (startDate !== null && endDate !== null && compareDateOnly(startDate, endDate) > 0) {
    issues.push(issue("endDate", "End date cannot be earlier than start date."));
  }
  return { startDate, endDate };
};

const currentValue = (
  record: Readonly<Record<string, unknown>>,
  endDate: DateOnly | null,
  issues: CareerProfileValidationIssue[],
): boolean => {
  const current = record["current"] ?? false;
  if (typeof current !== "boolean") {
    issues.push(issue("current", "Choose whether this entry is current."));
    return false;
  }
  if (current && endDate !== null) {
    issues.push(issue("endDate", "A current entry cannot have an end date."));
  }
  return current;
};

export const validateManualCareerProfileEntry = (input: unknown): CareerProfileValidationResult => {
  if (!isRecord(input) || !MANUAL_CAREER_PROFILE_KINDS.includes(input["kind"] as never)) {
    return Object.freeze({
      ok: false as const,
      issues: Object.freeze([issue("kind", "Choose a supported Career Profile section.")]),
    });
  }

  const issues: CareerProfileValidationIssue[] = [];
  let value: NormalizedManualInput | null = null;

  switch (input["kind"]) {
    case "basics": {
      const displayName = cleanText(input["displayName"], "displayName", 512, true, issues);
      const summary = cleanText(input["summary"], "summary", 200_000, false, issues);
      value =
        displayName === null || summary === null
          ? null
          : {
              kind: "basics",
              displayName,
              summary,
              targetRoles: stringList(input["targetRoles"], "targetRoles", 32, 256, issues),
              locationId: null,
              workPreferences: Object.freeze({
                workModes: stringList(input["workModes"], "workModes", 8, 64, issues),
              }),
            };
      break;
    }
    case "employment":
    case "volunteer": {
      const { startDate, endDate } = range(input, issues);
      const organization = cleanText(input["organization"], "organization", 512, true, issues);
      const role = cleanText(input["role"], "role", 512, true, issues);
      const description = cleanText(input["description"], "description", 200_000, false, issues);
      const current = currentValue(input, endDate, issues);
      value =
        organization === null || role === null || description === null
          ? null
          : {
              kind: input["kind"],
              organization,
              role,
              startDate,
              endDate,
              current,
              description,
            };
      break;
    }
    case "education": {
      const { startDate, endDate } = range(input, issues);
      const institution = cleanText(input["institution"], "institution", 512, true, issues);
      const credential = cleanText(input["credential"], "credential", 512, true, issues);
      const field = optionalText(input["field"], "field", 512, issues);
      const details = cleanText(input["details"], "details", 200_000, false, issues);
      value =
        institution === null || credential === null || details === null
          ? null
          : {
              kind: "education",
              institution,
              credential,
              field,
              startDate,
              endDate,
              details,
            };
      break;
    }
    case "project": {
      const { startDate, endDate } = range(input, issues);
      const name = cleanText(input["name"], "name", 512, true, issues);
      const summary = cleanText(input["summary"], "summary", 200_000, false, issues);
      const url = optionalUrl(input["url"], "url", issues);
      value =
        name === null || summary === null
          ? null
          : { kind: "project", name, summary, url, startDate, endDate };
      break;
    }
    case "skill": {
      const canonicalName = cleanText(input["canonicalName"], "canonicalName", 512, true, issues);
      const category = optionalText(input["category"], "category", 256, issues);
      value =
        canonicalName === null
          ? null
          : {
              kind: "skill",
              canonicalName,
              category,
              aliases: stringList(input["aliases"], "aliases", 64, 256, issues),
            };
      break;
    }
    case "accomplishment": {
      const action = cleanText(input["action"], "action", 10_000, true, issues);
      const result = cleanText(input["result"], "result", 10_000, true, issues);
      value =
        action === null || result === null
          ? null
          : {
              kind: "accomplishment",
              parentType: "standalone",
              parentId: null,
              action,
              result,
              metrics: Object.freeze({}),
            };
      break;
    }
    case "certification": {
      const name = cleanText(input["name"], "name", 512, true, issues);
      const issuer = cleanText(input["issuer"], "issuer", 512, true, issues);
      const issuedDate = optionalDate(input["issuedDate"], "issuedDate", issues);
      const expiresDate = optionalDate(input["expiresDate"], "expiresDate", issues);
      if (
        issuedDate !== null &&
        expiresDate !== null &&
        compareDateOnly(issuedDate, expiresDate) > 0
      ) {
        issues.push(issue("expiresDate", "Expiration date cannot be earlier than issue date."));
      }
      const credentialUrl = optionalUrl(input["credentialUrl"], "credentialUrl", issues);
      value =
        name === null || issuer === null
          ? null
          : {
              kind: "certification",
              name,
              issuer,
              issuedDate,
              expiresDate,
              credentialUrl,
            };
      break;
    }
    case "publication": {
      const title = cleanText(input["title"], "title", 1_024, true, issues);
      const publisher = optionalText(input["publisher"], "publisher", 512, issues);
      const publishedDate = optionalDate(input["publishedDate"], "publishedDate", issues);
      const url = optionalUrl(input["url"], "url", issues);
      const summary = cleanText(input["summary"], "summary", 200_000, false, issues);
      value =
        title === null || summary === null
          ? null
          : { kind: "publication", title, publisher, publishedDate, url, summary };
      break;
    }
  }

  if (value === null || issues.length > 0) {
    return Object.freeze({ ok: false as const, issues: Object.freeze(issues) });
  }
  return Object.freeze({ ok: true as const, value: Object.freeze(value) });
};

const ENTITY_TYPE_BY_KIND = Object.freeze({
  basics: "candidate-profile",
  employment: "experience",
  education: "education",
  project: "project",
  skill: "skill",
  accomplishment: "accomplishment",
  certification: "certification",
  publication: "publication",
  volunteer: "volunteer-experience",
} as const);

const VALIDATION_ERROR: ApplicationError = Object.freeze({
  code: "validation",
  message: "Review the highlighted Career Profile fields and try again.",
  retryable: false,
});
const UNKNOWN_ERROR: ApplicationError = Object.freeze({
  code: "internal",
  message: "The local Career Profile operation failed safely.",
  retryable: false,
});
const PORT_ERRORS: Readonly<Record<CareerProfileErrorCode, ApplicationError>> = Object.freeze({
  already_exists: Object.freeze({
    code: "conflict",
    message: "This Career Profile entry already exists.",
    retryable: false,
  }),
  busy: Object.freeze({
    code: "conflict",
    message: "The local Career Profile is busy. Retry shortly.",
    retryable: true,
  }),
  invalid_state: Object.freeze({
    code: "internal",
    message: "The local Career Profile is not in a usable state.",
    retryable: false,
  }),
  permission_denied: Object.freeze({
    code: "permission_denied",
    message: "Coredrill cannot access the local Career Profile.",
    retryable: true,
  }),
  read_only: Object.freeze({
    code: "permission_denied",
    message: "The local Career Profile is read-only.",
    retryable: false,
  }),
  unavailable: Object.freeze({
    code: "unavailable",
    message: "Local Career Profile storage is unavailable.",
    retryable: true,
  }),
});

const copyEntry = (
  value: unknown,
  expectedKind?: ManualCareerProfileKind,
): CareerProfileEntryDto => {
  if (!isRecord(value) || !MANUAL_CAREER_PROFILE_KINDS.includes(value["kind"] as never)) {
    throw new TypeError("Invalid Career Profile entry result.");
  }
  const kind = value["kind"] as ManualCareerProfileKind;
  if (expectedKind !== undefined && kind !== expectedKind) {
    throw new TypeError("Career Profile entry kind changed.");
  }
  const id = value["id"];
  const primaryLabel = value["primaryLabel"];
  const secondaryLabel = value["secondaryLabel"];
  const current = value["current"];
  const verificationState = value["verificationState"];
  const rowVersion = value["rowVersion"];
  if (
    typeof id !== "string" ||
    typeof primaryLabel !== "string" ||
    primaryLabel.trim().length === 0 ||
    (secondaryLabel !== null && typeof secondaryLabel !== "string") ||
    typeof current !== "boolean" ||
    (verificationState !== null && verificationState !== "user_confirmed") ||
    !Number.isSafeInteger(rowVersion) ||
    (rowVersion as number) < 1
  ) {
    throw new TypeError("Invalid Career Profile entry result.");
  }
  return Object.freeze({
    id: entityId(ENTITY_TYPE_BY_KIND[kind], id),
    kind,
    primaryLabel: primaryLabel.trim(),
    secondaryLabel,
    startDate: value["startDate"] === null ? null : dateOnly(value["startDate"] as string),
    endDate: value["endDate"] === null ? null : dateOnly(value["endDate"] as string),
    current,
    verificationState,
    createdAt: instant(value["createdAt"] as string),
    rowVersion: rowVersion as number,
  });
};

const failureFrom = <Value>(error: unknown): ApplicationResult<Value> =>
  applicationFailure(error instanceof CareerProfileError ? PORT_ERRORS[error.code] : UNKNOWN_ERROR);

export const createCareerProfileOperations = (
  dependencies: CareerProfileOperationDependencies,
): CareerProfileOperations => {
  if (
    !isRecord(dependencies) ||
    !isRecord(dependencies.careerProfile) ||
    typeof dependencies.careerProfile.createManualEntry !== "function" ||
    typeof dependencies.careerProfile.listManualEntries !== "function" ||
    typeof dependencies.createId !== "function"
  ) {
    throw new TypeError("Career Profile operations require a complete local persistence port.");
  }

  const createManualEntryCommand = defineCommand<
    CreateManualCareerProfileEntryInput,
    CareerProfileEntryDto
  >("CreateManualCareerProfileEntryCommand", async (input, operationContext) => {
    const validation = validateManualCareerProfileEntry(input);
    if (!validation.ok) return applicationFailure(VALIDATION_ERROR);

    try {
      const kind = validation.value.kind;
      const entityType = ENTITY_TYPE_BY_KIND[kind];
      const id = entityId(entityType, dependencies.createId(kind));
      const createdAt = instant(operationContext.initiatedAt);
      const evidence =
        kind === "basics" || kind === "skill"
          ? {}
          : {
              sourceDocumentId: null,
              verificationState: "user_confirmed" as const,
            };
      const result = await dependencies.careerProfile.createManualEntry({
        ...validation.value,
        ...evidence,
        id,
        archivedAt: null,
        createdAt,
        updatedAt: createdAt,
      } as CreateManualCareerProfilePortInput);
      return applicationSuccess(copyEntry(result, kind));
    } catch (error) {
      return failureFrom<CareerProfileEntryDto>(error);
    }
  });

  const listManualEntriesQuery = defineQuery<undefined, readonly CareerProfileEntryDto[]>(
    "ListManualCareerProfileEntriesQuery",
    async () => {
      try {
        const entries = (await dependencies.careerProfile.listManualEntries()).map((entry) =>
          copyEntry(entry),
        );
        if (new Set(entries.map(({ id }) => id)).size !== entries.length) {
          throw new TypeError("Career Profile entry identities must be unique.");
        }
        return applicationSuccess(Object.freeze(entries));
      } catch (error) {
        return failureFrom<readonly CareerProfileEntryDto[]>(error);
      }
    },
  );

  return Object.freeze({ createManualEntryCommand, listManualEntriesQuery });
};
