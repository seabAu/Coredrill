import {
  confidence,
  entityId,
  instant,
  webUrl,
  type Confidence,
  type EntityId,
  type Instant,
  type WebUrl,
} from "@coredrill/domain";

import { defineCommand, type ApplicationCommand } from "./operation.js";
import {
  applicationFailure,
  applicationSuccess,
  type ApplicationError,
  type ApplicationResult,
} from "./result.js";

export interface CompanyDto {
  readonly id: EntityId<"company">;
  readonly canonicalName: string;
  readonly websiteUrl: WebUrl | null;
  readonly domain: string | null;
  readonly locationId: EntityId<"location"> | null;
  readonly notes: string;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
  readonly rowVersion: number;
}

export interface ContactDto {
  readonly id: EntityId<"contact">;
  readonly companyId: EntityId<"company"> | null;
  readonly name: string;
  readonly role: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly publicProfileUrl: WebUrl | null;
  readonly confidence: Confidence | null;
  readonly userConfirmed: boolean;
  readonly notes: string;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
  readonly rowVersion: number;
}

export interface CreateCompanyPortInput {
  readonly id: EntityId<"company">;
  readonly canonicalName: string;
  readonly websiteUrl: WebUrl | null;
  readonly domain: string | null;
  readonly locationId: EntityId<"location"> | null;
  readonly notes: string;
  readonly archivedAt: null;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
}

export const CONTACT_PROVENANCE_FIELDS = [
  "name",
  "role",
  "email",
  "phone",
  "public_profile_url",
] as const;
export type ContactProvenanceFieldName = (typeof CONTACT_PROVENANCE_FIELDS)[number];
export type ContactOrigin = "source_backed" | "user_entered";

export interface ContactProvenanceLinkPortInput {
  readonly id: EntityId<"contact-point-provenance">;
  readonly contactId: EntityId<"contact">;
  readonly fieldName: ContactProvenanceFieldName;
  readonly valueHash: string;
  readonly provenanceId: EntityId<"provenance">;
  readonly createdAt: Instant;
}

export interface ContactRecordPortInput {
  readonly id: EntityId<"contact">;
  readonly companyId: EntityId<"company"> | null;
  readonly name: string;
  readonly role: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly publicProfileUrl: WebUrl | null;
  readonly confidence: Confidence | null;
  readonly userConfirmed: boolean;
  readonly notes: string;
  readonly archivedAt: null;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
}

export interface CreateContactPortInput {
  readonly contact: ContactRecordPortInput;
  readonly provenanceLinks: readonly ContactProvenanceLinkPortInput[];
}

/**
 * Runtime-owned local persistence boundary for companies and contacts.
 * createContact MUST persist the contact and all provenance links atomically.
 */
export interface CompanyContactPort {
  createCompany(input: CreateCompanyPortInput): Promise<CompanyDto>;
  createContact(input: CreateContactPortInput): Promise<ContactDto>;
}

export const COMPANY_CONTACT_ERROR_CODES = [
  "already_exists",
  "company_not_found",
  "provenance_not_found",
  "linkage_conflict",
  "busy",
  "unavailable",
  "permission_denied",
  "read_only",
  "invalid_state",
] as const;
export type CompanyContactErrorCode = (typeof COMPANY_CONTACT_ERROR_CODES)[number];

/** Content-free typed failure for implementations of CompanyContactPort. */
export class CompanyContactError extends Error {
  public readonly code: CompanyContactErrorCode;

  public constructor(code: CompanyContactErrorCode) {
    if (!COMPANY_CONTACT_ERROR_CODES.includes(code)) {
      throw new TypeError("Company/contact failures require a reviewed stable code.");
    }
    super("The company/contact port reported a failure.");
    this.name = "CompanyContactError";
    this.code = code;
  }
}

export interface CreateCompanyInput {
  /** Source-backed company data must enter through the capture/evidence boundary. */
  readonly origin: "user_entered";
  readonly canonicalName: string;
  readonly websiteUrl?: string | null;
  readonly domain?: string | null;
  readonly locationId?: string | null;
  readonly notes?: string;
}

export interface ContactProvenanceInput {
  readonly fieldName: ContactProvenanceFieldName;
  readonly provenanceId: string;
}

interface CreateContactFieldsInput {
  readonly companyId?: string | null;
  readonly name: string;
  readonly role?: string | null;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly publicProfileUrl?: string | null;
}

export interface CreateUserEnteredContactInput extends CreateContactFieldsInput {
  readonly origin: "user_entered";
  readonly notes?: string;
  readonly confidence?: never;
  readonly provenance?: never;
}

export interface CreateSourceBackedContactInput extends CreateContactFieldsInput {
  readonly origin: "source_backed";
  readonly confidence: number;
  readonly provenance: readonly ContactProvenanceInput[];
  readonly notes?: never;
}

export type CreateContactInput = CreateSourceBackedContactInput | CreateUserEnteredContactInput;

export interface CompanyContactOperationDependencies {
  readonly companyContacts: CompanyContactPort;
  readonly createCompanyId: () => EntityId<"company">;
  readonly createContactId: () => EntityId<"contact">;
  readonly createContactProvenanceLinkId: () => EntityId<"contact-point-provenance">;
  /** Returns a lowercase SHA-256 of the exact normalized field value without persisting it. */
  readonly hashContactValue: (value: string) => Promise<string>;
}

export interface CompanyContactOperations {
  readonly createCompanyCommand: ApplicationCommand<CreateCompanyInput, CompanyDto>;
  readonly createContactCommand: ApplicationCommand<CreateContactInput, ContactDto>;
}

const VALID_COMPANY_ERROR: ApplicationError = Object.freeze({
  code: "validation",
  message: "Review the company fields and try again.",
  retryable: false,
});
const VALID_CONTACT_ERROR: ApplicationError = Object.freeze({
  code: "validation",
  message: "Review the contact fields and their evidence, then try again.",
  retryable: false,
});
const UNKNOWN_COMPANY_CONTACT_ERROR: ApplicationError = Object.freeze({
  code: "internal",
  message: "The local company or contact operation failed safely.",
  retryable: false,
});

const COMPANY_CONTACT_ERRORS: Readonly<Record<CompanyContactErrorCode, ApplicationError>> =
  Object.freeze({
    already_exists: Object.freeze({
      code: "conflict",
      message: "This local company or contact already exists.",
      retryable: false,
    }),
    company_not_found: Object.freeze({
      code: "not_found",
      message: "The selected local company was not found.",
      retryable: false,
    }),
    provenance_not_found: Object.freeze({
      code: "not_found",
      message: "Required local provenance was not found.",
      retryable: false,
    }),
    linkage_conflict: Object.freeze({
      code: "conflict",
      message: "The contact and provenance records could not be linked safely.",
      retryable: false,
    }),
    busy: Object.freeze({
      code: "conflict",
      message: "The local relationship store is busy. Retry shortly.",
      retryable: true,
    }),
    unavailable: Object.freeze({
      code: "unavailable",
      message: "Local relationship storage is unavailable.",
      retryable: true,
    }),
    permission_denied: Object.freeze({
      code: "permission_denied",
      message: "Coredrill cannot access local relationship storage.",
      retryable: true,
    }),
    read_only: Object.freeze({
      code: "permission_denied",
      message: "The local relationship store is read-only.",
      retryable: false,
    }),
    invalid_state: Object.freeze({
      code: "internal",
      message: "The local relationship store is not usable.",
      retryable: false,
    }),
  });

const CONTACT_PROVENANCE_FIELD_SET = new Set<string>(CONTACT_PROVENANCE_FIELDS);
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const DOMAIN_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasControlCharacter = (value: string): boolean => {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || codePoint === 0x7f) return true;
  }
  return false;
};

const requiredText = (value: unknown, maximum: number): string => {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maximum ||
    hasControlCharacter(value)
  ) {
    throw new TypeError("Invalid required relationship text.");
  }
  return value;
};

const optionalText = (value: unknown, maximum: number): string | null =>
  value === undefined || value === null ? null : requiredText(value, maximum);

const notesText = (value: unknown): string => {
  if (value === undefined) return "";
  if (typeof value !== "string" || value.length > 200_000 || value.includes("\u0000")) {
    throw new TypeError("Invalid relationship notes.");
  }
  return value;
};

const resultNotesText = (value: unknown): string => {
  if (value === undefined) throw new TypeError("Missing relationship notes.");
  return notesText(value);
};

const optionalEntityId = <Entity extends string>(
  entityType: Entity,
  value: unknown,
): EntityId<Entity> | null =>
  value === undefined || value === null ? null : entityId(entityType, value as string);

const nullableEntityId = <Entity extends string>(
  entityType: Entity,
  value: unknown,
): EntityId<Entity> | null => (value === null ? null : entityId(entityType, value as string));

const optionalWebUrl = (value: unknown): WebUrl | null =>
  value === undefined || value === null ? null : webUrl(value as string);

const canonicalDomain = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value !== value.trim() || value.length > 253) {
    throw new TypeError("Invalid company domain.");
  }
  const normalized = value.toLowerCase();
  const labels = normalized.split(".");
  if (labels.some((label) => !DOMAIN_LABEL_PATTERN.test(label))) {
    throw new TypeError("Invalid company domain.");
  }
  return normalized;
};

const nullableResultDomain = (value: unknown): string | null => {
  if (value === undefined) throw new TypeError("Missing company domain.");
  return canonicalDomain(value);
};

const optionalEmail = (value: unknown): string | null => {
  const parsed = optionalText(value, 320);
  if (parsed === null) return null;
  const at = parsed.indexOf("@");
  if (
    parsed.includes(" ") ||
    at <= 0 ||
    at !== parsed.lastIndexOf("@") ||
    at > 64 ||
    canonicalDomain(parsed.slice(at + 1)) === null
  ) {
    throw new TypeError("Invalid contact email.");
  }
  return parsed;
};

const nullableResultText = (value: unknown, maximum: number): string | null => {
  if (value === undefined) throw new TypeError("Missing nullable relationship text.");
  return optionalText(value, maximum);
};

const nullableResultEmail = (value: unknown): string | null => {
  if (value === undefined) throw new TypeError("Missing contact email.");
  return optionalEmail(value);
};

const requireRowVersion = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new TypeError("Invalid relationship row version.");
  }
  return value;
};

interface ExpectedCompany {
  readonly id: EntityId<"company">;
  readonly canonicalName: string;
  readonly websiteUrl: WebUrl | null;
  readonly domain: string | null;
  readonly locationId: EntityId<"location"> | null;
  readonly notes: string;
  readonly createdAt: Instant;
}

const copyCompany = (value: unknown, expected: ExpectedCompany): CompanyDto => {
  if (!isRecord(value)) throw new TypeError("Invalid company result.");
  const copied: CompanyDto = Object.freeze({
    id: entityId("company", value["id"] as string),
    canonicalName: requiredText(value["canonicalName"], 512),
    websiteUrl: value["websiteUrl"] === null ? null : webUrl(value["websiteUrl"] as string),
    domain: nullableResultDomain(value["domain"]),
    locationId: nullableEntityId("location", value["locationId"]),
    notes: resultNotesText(value["notes"]),
    createdAt: instant(value["createdAt"] as string),
    updatedAt: instant(value["updatedAt"] as string),
    rowVersion: requireRowVersion(value["rowVersion"]),
  });
  if (
    copied.id !== expected.id ||
    copied.canonicalName !== expected.canonicalName ||
    copied.websiteUrl !== expected.websiteUrl ||
    copied.domain !== expected.domain ||
    copied.locationId !== expected.locationId ||
    copied.notes !== expected.notes ||
    copied.createdAt !== expected.createdAt ||
    copied.updatedAt !== expected.createdAt ||
    copied.rowVersion !== 1
  ) {
    throw new TypeError("Company result does not match the requested operation.");
  }
  return copied;
};

type ExpectedContact = Omit<ContactRecordPortInput, "archivedAt" | "updatedAt">;

const copyContact = (value: unknown, expected: ExpectedContact): ContactDto => {
  if (!isRecord(value)) throw new TypeError("Invalid contact result.");
  const resultConfidence =
    value["confidence"] === null ? null : confidence(value["confidence"] as number);
  if (typeof value["userConfirmed"] !== "boolean") {
    throw new TypeError("Invalid contact confirmation state.");
  }
  const copied: ContactDto = Object.freeze({
    id: entityId("contact", value["id"] as string),
    companyId: nullableEntityId("company", value["companyId"]),
    name: requiredText(value["name"], 512),
    role: nullableResultText(value["role"], 512),
    email: nullableResultEmail(value["email"]),
    phone: nullableResultText(value["phone"], 128),
    publicProfileUrl:
      value["publicProfileUrl"] === null ? null : webUrl(value["publicProfileUrl"] as string),
    confidence: resultConfidence,
    userConfirmed: value["userConfirmed"],
    notes: resultNotesText(value["notes"]),
    createdAt: instant(value["createdAt"] as string),
    updatedAt: instant(value["updatedAt"] as string),
    rowVersion: requireRowVersion(value["rowVersion"]),
  });
  if (
    copied.id !== expected.id ||
    copied.companyId !== expected.companyId ||
    copied.name !== expected.name ||
    copied.role !== expected.role ||
    copied.email !== expected.email ||
    copied.phone !== expected.phone ||
    copied.publicProfileUrl !== expected.publicProfileUrl ||
    copied.confidence !== expected.confidence ||
    copied.userConfirmed !== expected.userConfirmed ||
    copied.notes !== expected.notes ||
    copied.createdAt !== expected.createdAt ||
    copied.updatedAt !== expected.createdAt ||
    copied.rowVersion !== 1
  ) {
    throw new TypeError("Contact result does not match the requested operation.");
  }
  return copied;
};

interface ParsedContactFields {
  readonly companyId: EntityId<"company"> | null;
  readonly name: string;
  readonly role: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly publicProfileUrl: WebUrl | null;
}

const parseContactFields = (input: Readonly<Record<string, unknown>>): ParsedContactFields => ({
  companyId: optionalEntityId("company", input["companyId"]),
  name: requiredText(input["name"], 512),
  role: optionalText(input["role"], 512),
  email: optionalEmail(input["email"]),
  phone: optionalText(input["phone"], 128),
  publicProfileUrl: optionalWebUrl(input["publicProfileUrl"]),
});

const fieldValues = (
  fields: ParsedContactFields,
): Readonly<Record<ContactProvenanceFieldName, string | null>> => ({
  name: fields.name,
  role: fields.role,
  email: fields.email,
  phone: fields.phone,
  public_profile_url: fields.publicProfileUrl,
});

const parseProvenance = (
  value: unknown,
  fields: ParsedContactFields,
): ReadonlyMap<ContactProvenanceFieldName, EntityId<"provenance">> => {
  if (!Array.isArray(value)) throw new TypeError("Source-backed contact provenance is required.");
  const populatedFields = fieldValues(fields);
  const parsed = new Map<ContactProvenanceFieldName, EntityId<"provenance">>();
  for (const candidate of value as readonly unknown[]) {
    if (!isRecord(candidate)) throw new TypeError("Invalid contact provenance entry.");
    const fieldName = candidate["fieldName"];
    if (typeof fieldName !== "string" || !CONTACT_PROVENANCE_FIELD_SET.has(fieldName)) {
      throw new TypeError("Invalid contact provenance field.");
    }
    const typedFieldName = fieldName as ContactProvenanceFieldName;
    if (populatedFields[typedFieldName] === null || parsed.has(typedFieldName)) {
      throw new TypeError("Contact provenance must map once to a populated field.");
    }
    parsed.set(typedFieldName, entityId("provenance", candidate["provenanceId"] as string));
  }
  const requiredFields = CONTACT_PROVENANCE_FIELDS.filter(
    (fieldName) => populatedFields[fieldName] !== null,
  );
  if (parsed.size !== requiredFields.length || requiredFields.some((field) => !parsed.has(field))) {
    throw new TypeError("Every populated source-backed field requires provenance.");
  }
  return parsed;
};

const failureFrom = <Value>(error: unknown): ApplicationResult<Value> =>
  applicationFailure(
    error instanceof CompanyContactError
      ? COMPANY_CONTACT_ERRORS[error.code]
      : UNKNOWN_COMPANY_CONTACT_ERROR,
  );

export const createCompanyContactOperations = (
  dependencies: CompanyContactOperationDependencies,
): CompanyContactOperations => {
  const untrustedDependencies = dependencies as unknown;
  if (
    !isRecord(untrustedDependencies) ||
    !isRecord(untrustedDependencies["companyContacts"]) ||
    typeof untrustedDependencies["companyContacts"]["createCompany"] !== "function" ||
    typeof untrustedDependencies["companyContacts"]["createContact"] !== "function" ||
    typeof untrustedDependencies["createCompanyId"] !== "function" ||
    typeof untrustedDependencies["createContactId"] !== "function" ||
    typeof untrustedDependencies["createContactProvenanceLinkId"] !== "function" ||
    typeof untrustedDependencies["hashContactValue"] !== "function"
  ) {
    throw new TypeError("Company/contact operations require a complete local persistence port.");
  }

  const createCompanyCommand = defineCommand<CreateCompanyInput, CompanyDto>(
    "CreateCompanyCommand",
    async (input, operationContext) => {
      const untrustedInput = input as unknown;
      if (!isRecord(untrustedInput)) return applicationFailure(VALID_COMPANY_ERROR);

      let parsed: Omit<CreateCompanyPortInput, "id" | "createdAt" | "updatedAt">;
      try {
        if (untrustedInput["origin"] !== "user_entered") {
          throw new TypeError("Company creation requires an explicit user-entered origin.");
        }
        parsed = {
          canonicalName: requiredText(untrustedInput["canonicalName"], 512),
          websiteUrl: optionalWebUrl(untrustedInput["websiteUrl"]),
          domain: canonicalDomain(untrustedInput["domain"]),
          locationId: optionalEntityId("location", untrustedInput["locationId"]),
          notes: notesText(untrustedInput["notes"]),
          archivedAt: null,
        };
      } catch {
        return applicationFailure(VALID_COMPANY_ERROR);
      }

      try {
        const id = entityId("company", dependencies.createCompanyId());
        const createdAt = instant(operationContext.initiatedAt);
        const expected: ExpectedCompany = { id, ...parsed, createdAt };
        return applicationSuccess(
          copyCompany(
            await dependencies.companyContacts.createCompany({
              id,
              ...parsed,
              createdAt,
              updatedAt: createdAt,
            }),
            expected,
          ),
        );
      } catch (error) {
        return failureFrom<CompanyDto>(error);
      }
    },
  );

  const createContactCommand = defineCommand<CreateContactInput, ContactDto>(
    "CreateContactCommand",
    async (input, operationContext) => {
      const untrustedInput = input as unknown;
      if (!isRecord(untrustedInput)) return applicationFailure(VALID_CONTACT_ERROR);

      let fields: ParsedContactFields;
      let parsedConfidence: Confidence | null;
      let userConfirmed: boolean;
      let notes: string;
      let provenance: ReadonlyMap<ContactProvenanceFieldName, EntityId<"provenance">>;
      try {
        fields = parseContactFields(untrustedInput);
        const origin = untrustedInput["origin"];
        if (origin === "user_entered") {
          if (
            untrustedInput["confidence"] !== undefined ||
            untrustedInput["provenance"] !== undefined
          ) {
            throw new TypeError("Manual contacts cannot carry source evidence metadata.");
          }
          parsedConfidence = null;
          userConfirmed = true;
          notes = notesText(untrustedInput["notes"]);
          provenance = new Map();
        } else if (origin === "source_backed") {
          if (untrustedInput["notes"] !== undefined && untrustedInput["notes"] !== "") {
            throw new TypeError("Source-backed contact notes require a separate user action.");
          }
          parsedConfidence = confidence(untrustedInput["confidence"] as number);
          userConfirmed = false;
          notes = "";
          provenance = parseProvenance(untrustedInput["provenance"], fields);
        } else {
          throw new TypeError("Contact origin must be explicit.");
        }
      } catch {
        return applicationFailure(VALID_CONTACT_ERROR);
      }

      try {
        const id = entityId("contact", dependencies.createContactId());
        const createdAt = instant(operationContext.initiatedAt);
        const contact: ContactRecordPortInput = Object.freeze({
          id,
          ...fields,
          confidence: parsedConfidence,
          userConfirmed,
          notes,
          archivedAt: null,
          createdAt,
          updatedAt: createdAt,
        });
        const values = fieldValues(fields);
        const provenanceLinks: ContactProvenanceLinkPortInput[] = [];
        for (const fieldName of CONTACT_PROVENANCE_FIELDS) {
          const provenanceId = provenance.get(fieldName);
          if (provenanceId === undefined) continue;
          const value = values[fieldName];
          if (value === null) throw new TypeError("Provenance field value is unavailable.");
          const valueHash = await dependencies.hashContactValue(value);
          if (!SHA256_PATTERN.test(valueHash)) {
            throw new TypeError("Contact value hashing returned an invalid digest.");
          }
          provenanceLinks.push(
            Object.freeze({
              id: entityId(
                "contact-point-provenance",
                dependencies.createContactProvenanceLinkId(),
              ),
              contactId: id,
              fieldName,
              valueHash,
              provenanceId,
              createdAt,
            }),
          );
        }
        const expected: ExpectedContact = {
          id,
          ...fields,
          confidence: parsedConfidence,
          userConfirmed,
          notes,
          createdAt,
        };
        return applicationSuccess(
          copyContact(
            await dependencies.companyContacts.createContact({
              contact,
              provenanceLinks: Object.freeze(provenanceLinks),
            }),
            expected,
          ),
        );
      } catch (error) {
        return failureFrom<ContactDto>(error);
      }
    },
  );

  return Object.freeze({ createCompanyCommand, createContactCommand });
};
