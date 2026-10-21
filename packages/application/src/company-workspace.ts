import { entityId, instant, type EntityId, type Instant } from "@coredrill/domain";
import {
  parseCompanyDto,
  parseManualCompanyFields,
  type CompanyDto,
  type CreateCompanyInput,
  type CreateCompanyPortInput,
} from "./company-contact.js";
import { defineCommand, defineQuery, type ApplicationOperationContext } from "./operation.js";
import { applicationFailure, applicationSuccess, type ApplicationError } from "./result.js";

interface ViewedVaultV1 {
  readonly specVersion: 1;
  readonly expectedVaultId: EntityId<"vault">;
}
export interface ReadCompanyWorkspaceInputV1 extends ViewedVaultV1 {
  readonly companyId: EntityId<"company">;
  readonly includeArchived?: boolean;
}
export interface ReadCompanyWorkspaceRequestV1 extends ReadCompanyWorkspaceInputV1 {
  readonly includeArchived: boolean;
}
export interface CreateViewedCompanyInputV1 extends ViewedVaultV1 {
  readonly company: CreateCompanyInput;
}
export interface CreateViewedCompanyPortInputV1 extends ViewedVaultV1 {
  readonly company: CreateCompanyPortInput;
}
export interface UpdateCompanyNotesInputV1 extends ViewedVaultV1 {
  readonly companyId: EntityId<"company">;
  readonly expectedRowVersion: number;
  readonly notes: string;
}
export interface UpdateCompanyNotesPortInputV1 extends UpdateCompanyNotesInputV1 {
  readonly updatedAt: Instant;
}
export interface CompanyWorkspaceV1 {
  readonly specVersion: 1;
  readonly vaultId: EntityId<"vault">;
  readonly company: CompanyDto & { readonly archivedAt: Instant | null };
}

/** All writes check the sole physical vault root in their transaction before effects. */
export interface CompanyWorkspacePortV1 {
  read(input: ReadCompanyWorkspaceRequestV1): Promise<unknown>;
  create(input: CreateViewedCompanyPortInputV1): Promise<unknown>;
  updateNotes(input: UpdateCompanyNotesPortInputV1): Promise<unknown>;
}
export type CompanyWorkspaceErrorCode = "not_found" | "stale" | "invalid_state" | "unavailable";
export class CompanyWorkspaceError extends Error {
  public constructor(public readonly code: CompanyWorkspaceErrorCode) {
    super("The local company port reported a safe failure.");
    if (!["not_found", "stale", "invalid_state", "unavailable"].includes(code)) {
      throw new TypeError("Invalid company failure code.");
    }
    this.name = "CompanyWorkspaceError";
  }
}
const errors: Readonly<Record<CompanyWorkspaceErrorCode | "validation", ApplicationError>> = {
  validation: {
    code: "validation",
    message: "Review the company fields and viewed context.",
    retryable: false,
  },
  not_found: {
    code: "not_found",
    message: "The viewed local company or vault was not found.",
    retryable: false,
  },
  stale: {
    code: "conflict",
    message: "The viewed company changed. Refresh before starting a new edit.",
    retryable: false,
  },
  invalid_state: {
    code: "internal",
    message: "The local company operation failed safely.",
    retryable: false,
  },
  unavailable: {
    code: "unavailable",
    message: "Local company storage is unavailable.",
    retryable: true,
  },
};
const failure = (error: unknown) =>
  applicationFailure(
    error instanceof CompanyWorkspaceError ? errors[error.code] : errors.invalid_state,
  );

const object = (value: unknown): Readonly<Record<string, unknown>> => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new TypeError("Invalid company contract.");
  return value as Readonly<Record<string, unknown>>;
};
const keys = (
  value: unknown,
  allowed: readonly string[],
  required: readonly string[] = allowed,
) => {
  const record = object(value);
  if (
    Object.keys(record).some((key) => !allowed.includes(key)) ||
    required.some((key) => !Object.hasOwn(record, key))
  )
    throw new TypeError("Invalid company contract shape.");
  return record;
};
const scope = (value: Readonly<Record<string, unknown>>): ViewedVaultV1 => {
  if (value["specVersion"] !== 1) throw new TypeError("Unsupported company contract.");
  return { specVersion: 1, expectedVaultId: entityId("vault", value["expectedVaultId"] as string) };
};
const version = (value: unknown): number => {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value >= Number.MAX_SAFE_INTEGER
  )
    throw new TypeError("Invalid company version.");
  return value;
};
const notes = (value: unknown): string => {
  // Reuse the existing creation contract's full literal-note validation.
  if (typeof value !== "string") throw new TypeError("Missing company notes.");
  return parseManualCompanyFields({
    origin: "user_entered",
    canonicalName: "validation",
    notes: value,
  }).notes;
};
const validateContext = (value: ApplicationOperationContext): Instant => {
  const context = object(value);
  entityId("application-operation", context["operationId"] as string);
  return instant(context["initiatedAt"] as string);
};
const companyKeys = [
  "id",
  "canonicalName",
  "websiteUrl",
  "domain",
  "locationId",
  "notes",
  "archivedAt",
  "createdAt",
  "updatedAt",
  "rowVersion",
];
const creationKeys = ["origin", "canonicalName", "websiteUrl", "domain", "locationId", "notes"];

export const parseReadCompanyWorkspaceRequestV1 = (
  value: unknown,
): ReadCompanyWorkspaceRequestV1 => {
  const input = keys(
    value,
    ["specVersion", "expectedVaultId", "companyId", "includeArchived"],
    ["specVersion", "expectedVaultId", "companyId"],
  );
  if (input["includeArchived"] !== undefined && typeof input["includeArchived"] !== "boolean")
    throw new TypeError("Invalid archived scope.");
  return Object.freeze({
    ...scope(input),
    companyId: entityId("company", input["companyId"] as string),
    includeArchived: input["includeArchived"] ?? false,
  });
};
export const parseCreateViewedCompanyPortInputV1 = (
  value: unknown,
): CreateViewedCompanyPortInputV1 => {
  const input = keys(value, ["specVersion", "expectedVaultId", "company"]);
  const stored = keys(
    input["company"],
    companyKeys.filter((key) => key !== "rowVersion"),
  );
  const parsed = parseCompanyDto({ ...stored, rowVersion: 1 });
  if (
    stored["archivedAt"] !== null ||
    parsed.updatedAt !== parsed.createdAt ||
    parsed.domain !== stored["domain"]
  )
    throw new TypeError("Invalid creation audit or archive facts.");
  return Object.freeze({
    ...scope(input),
    company: Object.freeze({
      id: parsed.id,
      canonicalName: parsed.canonicalName,
      websiteUrl: parsed.websiteUrl,
      domain: parsed.domain,
      locationId: parsed.locationId,
      notes: parsed.notes,
      createdAt: parsed.createdAt,
      updatedAt: parsed.updatedAt,
      archivedAt: null,
    }),
  });
};
export const parseUpdateCompanyNotesPortInputV1 = (
  value: unknown,
): UpdateCompanyNotesPortInputV1 => {
  const input = keys(value, [
    "specVersion",
    "expectedVaultId",
    "companyId",
    "expectedRowVersion",
    "notes",
    "updatedAt",
  ]);
  return Object.freeze({
    ...scope(input),
    companyId: entityId("company", input["companyId"] as string),
    expectedRowVersion: version(input["expectedRowVersion"]),
    notes: notes(input["notes"]),
    updatedAt: instant(input["updatedAt"] as string),
  });
};

/** Strict scalar detail only; absence of relationship arrays never means zero relationships. */
export const parseCompanyWorkspaceV1 = (
  value: unknown,
  expected: {
    readonly expectedVaultId: EntityId<"vault">;
    readonly companyId: EntityId<"company">;
    readonly includeArchived: boolean;
  },
): CompanyWorkspaceV1 => {
  const envelope = keys(value, ["specVersion", "vaultId", "company"]);
  const raw = keys(envelope["company"], companyKeys);
  const company = parseCompanyDto(raw);
  const archivedAt = raw["archivedAt"] === null ? null : instant(raw["archivedAt"] as string);
  if (
    envelope["specVersion"] !== 1 ||
    envelope["vaultId"] !== expected.expectedVaultId ||
    company.id !== expected.companyId ||
    company.domain !== raw["domain"] ||
    (archivedAt !== null &&
      (!expected.includeArchived ||
        archivedAt < company.createdAt ||
        archivedAt > company.updatedAt))
  )
    throw new TypeError("Company detail does not match the viewed scope.");
  return Object.freeze({
    specVersion: 1,
    vaultId: expected.expectedVaultId,
    company: Object.freeze({ ...company, archivedAt }),
  });
};

export const validateCreatedCompanyWorkspaceV1 = (
  value: unknown,
  input: CreateViewedCompanyPortInputV1,
): CompanyWorkspaceV1 => {
  const result = parseCompanyWorkspaceV1(value, {
    expectedVaultId: input.expectedVaultId,
    companyId: input.company.id,
    includeArchived: false,
  });
  for (const key of Object.keys(input.company) as (keyof CreateCompanyPortInput)[])
    if (result.company[key] !== input.company[key])
      throw new TypeError("Company creation acknowledgement mismatch.");
  if (result.company.rowVersion !== 1) throw new TypeError("Invalid created company version.");
  return result;
};
export const validateUpdatedCompanyNotesV1 = (
  value: unknown,
  input: UpdateCompanyNotesPortInputV1,
): CompanyWorkspaceV1 => {
  const result = parseCompanyWorkspaceV1(value, { ...input, includeArchived: false });
  if (
    result.company.notes !== input.notes ||
    result.company.updatedAt !== input.updatedAt ||
    result.company.rowVersion !== input.expectedRowVersion + 1
  )
    throw new TypeError("Company notes acknowledgement mismatch.");
  return result;
};

export const createCompanyWorkspaceOperations = (
  port: CompanyWorkspacePortV1,
  createCompanyId: () => EntityId<"company">,
) =>
  Object.freeze({
    read: defineQuery<ReadCompanyWorkspaceInputV1, CompanyWorkspaceV1>(
      "ReadCompanyWorkspaceQuery",
      async (input, context) => {
        let request: ReadCompanyWorkspaceRequestV1;
        try {
          validateContext(context);
          request = parseReadCompanyWorkspaceRequestV1(input);
        } catch {
          return applicationFailure(errors.validation);
        }
        try {
          const value = await port.read(request);
          if (value === undefined || value === null) return applicationFailure(errors.not_found);
          return applicationSuccess(parseCompanyWorkspaceV1(value, request));
        } catch (error) {
          return failure(error);
        }
      },
    ),
    create: defineCommand<CreateViewedCompanyInputV1, CompanyWorkspaceV1>(
      "CreateViewedCompanyCommand",
      async (input, context) => {
        let parsed: ReturnType<typeof parseManualCompanyFields>;
        let owner: ViewedVaultV1;
        let createdAt: Instant;
        try {
          createdAt = validateContext(context);
          const raw = keys(input, ["specVersion", "expectedVaultId", "company"]);
          owner = scope(raw);
          parsed = parseManualCompanyFields(
            keys(raw["company"], creationKeys, ["origin", "canonicalName"]),
          );
        } catch {
          return applicationFailure(errors.validation);
        }
        try {
          const request = Object.freeze({
            ...owner,
            company: Object.freeze({
              ...parsed,
              id: entityId("company", createCompanyId()),
              createdAt,
              updatedAt: createdAt,
            }),
          });
          return applicationSuccess(
            validateCreatedCompanyWorkspaceV1(await port.create(request), request),
          );
        } catch (error) {
          return failure(error);
        }
      },
    ),
    updateNotes: defineCommand<UpdateCompanyNotesInputV1, CompanyWorkspaceV1>(
      "UpdateCompanyNotesCommand",
      async (input, context) => {
        let request: UpdateCompanyNotesPortInputV1;
        try {
          const updatedAt = validateContext(context);
          keys(input, [
            "specVersion",
            "expectedVaultId",
            "companyId",
            "expectedRowVersion",
            "notes",
          ]);
          request = parseUpdateCompanyNotesPortInputV1({ ...input, updatedAt });
        } catch {
          return applicationFailure(errors.validation);
        }
        try {
          return applicationSuccess(
            validateUpdatedCompanyNotesV1(await port.updateNotes(request), request),
          );
        } catch (error) {
          return failure(error);
        }
      },
    ),
  });
