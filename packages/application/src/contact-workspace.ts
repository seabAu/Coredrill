import { entityId, instant, type EntityId, type Instant } from "@coredrill/domain";
import {
  CONTACT_PROVENANCE_FIELDS,
  contactFieldValues,
  parseContactDto,
  parseManualContactFields,
  type ContactDto,
  type ContactProvenanceFieldName,
  type ContactRecordPortInput,
  type CreateUserEnteredContactInput,
} from "./company-contact.js";
import { defineCommand, defineQuery, type ApplicationOperationContext } from "./operation.js";
import { applicationFailure, applicationSuccess, type ApplicationError } from "./result.js";

interface ViewedVaultV1 {
  readonly specVersion: 1;
  readonly expectedVaultId: EntityId<"vault">;
}
export interface ReadContactWorkspaceInputV1 extends ViewedVaultV1 {
  readonly contactId: EntityId<"contact">;
  readonly includeArchived?: boolean;
}
export interface ReadContactWorkspaceRequestV1 extends ReadContactWorkspaceInputV1 {
  readonly includeArchived: boolean;
}
export type ContactValueHashesV1 = Readonly<Record<ContactProvenanceFieldName, string | null>>;
/** Initial explicit input evidence, not a claim about current edited values or public access. */
export interface ContactManualCreationV1 {
  readonly operationId: EntityId<"application-operation">;
  readonly createdAt: Instant;
  readonly valueHashes: ContactValueHashesV1;
}
export interface ContactWorkspaceV1 {
  readonly specVersion: 1;
  readonly vaultId: EntityId<"vault">;
  readonly contact: ContactDto & { readonly archivedAt: Instant | null };
  readonly manualCreation: ContactManualCreationV1 | null;
}
export interface CreateViewedContactInputV1 extends ViewedVaultV1 {
  readonly contactId: EntityId<"contact">;
  readonly contact: CreateUserEnteredContactInput;
  readonly expectedCompanyRowVersion?: number | null;
}
export interface CreateViewedContactPortInputV1 extends ViewedVaultV1 {
  readonly contact: ContactRecordPortInput;
  readonly expectedCompanyRowVersion: number | null;
  readonly manualCreation: ContactManualCreationV1;
}
export interface UpdateContactNotesInputV1 extends ViewedVaultV1 {
  readonly contactId: EntityId<"contact">;
  readonly expectedRowVersion: number;
  readonly notes: string;
}
export interface UpdateContactNotesPortInputV1 extends UpdateContactNotesInputV1 {
  readonly updatedAt: Instant;
}
/** Writes validate acknowledgement inside the same transaction as contact/receipt changes. */
export interface ContactWorkspacePortV1 {
  read(input: ReadContactWorkspaceRequestV1): Promise<unknown>;
  create(input: CreateViewedContactPortInputV1): Promise<unknown>;
  updateNotes(input: UpdateContactNotesPortInputV1): Promise<unknown>;
}
export type ContactWorkspaceErrorCode = "not_found" | "stale" | "invalid_state" | "unavailable";
export class ContactWorkspaceError extends Error {
  public constructor(public readonly code: ContactWorkspaceErrorCode) {
    super("The local contact port reported a safe failure.");
    if (!["not_found", "stale", "invalid_state", "unavailable"].includes(code))
      throw new TypeError("Invalid contact failure code.");
    this.name = "ContactWorkspaceError";
  }
}
const errors: Readonly<Record<ContactWorkspaceErrorCode | "validation", ApplicationError>> = {
  validation: {
    code: "validation",
    message: "Review the contact fields and viewed context.",
    retryable: false,
  },
  not_found: {
    code: "not_found",
    message: "The viewed local contact, company or vault was not found.",
    retryable: false,
  },
  stale: {
    code: "conflict",
    message: "The viewed contact or company changed. Refresh before starting a new edit.",
    retryable: false,
  },
  invalid_state: {
    code: "internal",
    message: "The local contact operation failed safely.",
    retryable: false,
  },
  unavailable: {
    code: "unavailable",
    message: "Local contact storage is unavailable.",
    retryable: true,
  },
};
const failure = (error: unknown) =>
  applicationFailure(
    error instanceof ContactWorkspaceError ? errors[error.code] : errors.invalid_state,
  );
const keys = (
  value: unknown,
  allowed: readonly string[],
  required: readonly string[] = allowed,
) => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new TypeError("Invalid contact contract.");
  const record = value as Readonly<Record<string, unknown>>;
  if (
    Object.keys(record).some((key) => !allowed.includes(key)) ||
    required.some((key) => !Object.hasOwn(record, key))
  )
    throw new TypeError("Invalid contact contract shape.");
  return record;
};
const scope = (value: Readonly<Record<string, unknown>>): ViewedVaultV1 => {
  if (value["specVersion"] !== 1) throw new TypeError("Unsupported contact contract.");
  return { specVersion: 1, expectedVaultId: entityId("vault", value["expectedVaultId"] as string) };
};
const version = (value: unknown): number => {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value >= Number.MAX_SAFE_INTEGER
  )
    throw new TypeError("Invalid contact version.");
  return value;
};
const contextCopy = (value: ApplicationOperationContext): ApplicationOperationContext => {
  const raw = keys(value, ["operationId", "initiatedAt"]);
  return Object.freeze({
    operationId: entityId("application-operation", raw["operationId"] as string),
    initiatedAt: instant(raw["initiatedAt"] as string),
  });
};
const contactKeys = [
  "id",
  "companyId",
  "name",
  "role",
  "email",
  "phone",
  "publicProfileUrl",
  "confidence",
  "userConfirmed",
  "notes",
  "archivedAt",
  "createdAt",
  "updatedAt",
  "rowVersion",
];
const manualKeys = [
  "origin",
  "companyId",
  "name",
  "role",
  "email",
  "phone",
  "publicProfileUrl",
  "notes",
];
const digest = (value: unknown): string => {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value))
    throw new TypeError("Invalid local contact digest.");
  return value;
};
const receipt = (value: unknown, createdAt: Instant): ContactManualCreationV1 => {
  const raw = keys(value, ["operationId", "createdAt", "valueHashes"]);
  const hashes = keys(raw["valueHashes"], CONTACT_PROVENANCE_FIELDS);
  const valueHashes = Object.freeze(
    Object.fromEntries(
      CONTACT_PROVENANCE_FIELDS.map((field) => [
        field,
        hashes[field] === null && field !== "name" ? null : digest(hashes[field]),
      ]),
    ) as unknown as ContactValueHashesV1,
  );
  if (instant(raw["createdAt"] as string) !== createdAt)
    throw new TypeError("Invalid contact creation evidence time.");
  return Object.freeze({
    operationId: entityId("application-operation", raw["operationId"] as string),
    createdAt,
    valueHashes,
  });
};
export const parseReadContactWorkspaceRequestV1 = (
  value: unknown,
): ReadContactWorkspaceRequestV1 => {
  const raw = keys(
    value,
    ["specVersion", "expectedVaultId", "contactId", "includeArchived"],
    ["specVersion", "expectedVaultId", "contactId"],
  );
  if (raw["includeArchived"] !== undefined && typeof raw["includeArchived"] !== "boolean")
    throw new TypeError("Invalid contact archive scope.");
  return Object.freeze({
    ...scope(raw),
    contactId: entityId("contact", raw["contactId"] as string),
    includeArchived: raw["includeArchived"] ?? false,
  });
};
export const parseContactWorkspaceV1 = (
  value: unknown,
  expected: {
    readonly expectedVaultId: EntityId<"vault">;
    readonly contactId: EntityId<"contact">;
    readonly includeArchived: boolean;
  },
): ContactWorkspaceV1 => {
  const raw = keys(value, ["specVersion", "vaultId", "contact", "manualCreation"]);
  const stored = keys(raw["contact"], contactKeys);
  const parsed = parseContactDto(stored);
  const archivedAt = stored["archivedAt"] === null ? null : instant(stored["archivedAt"] as string);
  if (
    raw["specVersion"] !== 1 ||
    raw["vaultId"] !== expected.expectedVaultId ||
    parsed.id !== expected.contactId ||
    (archivedAt !== null &&
      (!expected.includeArchived || archivedAt < parsed.createdAt || archivedAt > parsed.updatedAt))
  )
    throw new TypeError("Contact detail does not match the viewed scope.");
  return Object.freeze({
    specVersion: 1,
    vaultId: expected.expectedVaultId,
    contact: Object.freeze({ ...parsed, archivedAt }),
    manualCreation:
      raw["manualCreation"] === null ? null : receipt(raw["manualCreation"], parsed.createdAt),
  });
};
export const parseCreateViewedContactPortInputV1 = (
  value: unknown,
): CreateViewedContactPortInputV1 => {
  const raw = keys(value, [
    "specVersion",
    "expectedVaultId",
    "contact",
    "expectedCompanyRowVersion",
    "manualCreation",
  ]);
  const stored = keys(
    raw["contact"],
    contactKeys.filter((key) => key !== "rowVersion"),
  );
  const contact = parseContactDto({ ...stored, rowVersion: 1 });
  if (
    stored["archivedAt"] !== null ||
    contact.confidence !== null ||
    !contact.userConfirmed ||
    contact.createdAt !== contact.updatedAt
  )
    throw new TypeError("Invalid initial manual contact facts.");
  const expectedCompanyRowVersion =
    contact.companyId === null ? null : version(raw["expectedCompanyRowVersion"]);
  if (contact.companyId === null && raw["expectedCompanyRowVersion"] !== null)
    throw new TypeError("A company expectation requires a company.");
  const manualCreation = receipt(raw["manualCreation"], contact.createdAt);
  const values = contactFieldValues(contact);
  for (const field of CONTACT_PROVENANCE_FIELDS)
    if ((values[field] === null) !== (manualCreation.valueHashes[field] === null))
      throw new TypeError("Contact evidence does not match populated fields.");
  return Object.freeze({
    ...scope(raw),
    contact: Object.freeze({
      id: contact.id,
      companyId: contact.companyId,
      name: contact.name,
      role: contact.role,
      email: contact.email,
      phone: contact.phone,
      publicProfileUrl: contact.publicProfileUrl,
      confidence: contact.confidence,
      userConfirmed: contact.userConfirmed,
      notes: contact.notes,
      createdAt: contact.createdAt,
      updatedAt: contact.updatedAt,
      archivedAt: null,
    }),
    expectedCompanyRowVersion,
    manualCreation,
  });
};
export const parseUpdateContactNotesPortInputV1 = (
  value: unknown,
): UpdateContactNotesPortInputV1 => {
  const raw = keys(value, [
    "specVersion",
    "expectedVaultId",
    "contactId",
    "expectedRowVersion",
    "notes",
    "updatedAt",
  ]);
  if (typeof raw["notes"] !== "string") throw new TypeError("Missing contact notes.");
  const fields = parseManualContactFields({
    origin: "user_entered",
    name: "validation",
    notes: raw["notes"],
  });
  return Object.freeze({
    ...scope(raw),
    contactId: entityId("contact", raw["contactId"] as string),
    expectedRowVersion: version(raw["expectedRowVersion"]),
    notes: fields.notes,
    updatedAt: instant(raw["updatedAt"] as string),
  });
};
export const validateCreatedContactWorkspaceV1 = (
  value: unknown,
  input: CreateViewedContactPortInputV1,
): ContactWorkspaceV1 => {
  const result = parseContactWorkspaceV1(value, {
    ...input,
    contactId: input.contact.id,
    includeArchived: false,
  });
  for (const key of Object.keys(input.contact) as (keyof ContactRecordPortInput)[])
    if (result.contact[key] !== input.contact[key])
      throw new TypeError("Contact creation acknowledgement mismatch.");
  const manualCreation = result.manualCreation;
  if (
    result.contact.rowVersion !== 1 ||
    manualCreation?.operationId !== input.manualCreation.operationId ||
    manualCreation.createdAt !== input.manualCreation.createdAt ||
    CONTACT_PROVENANCE_FIELDS.some(
      (field) => manualCreation.valueHashes[field] !== input.manualCreation.valueHashes[field],
    )
  )
    throw new TypeError("Contact evidence acknowledgement mismatch.");
  return result;
};
export const validateUpdatedContactNotesV1 = (
  value: unknown,
  input: UpdateContactNotesPortInputV1,
): ContactWorkspaceV1 => {
  const result = parseContactWorkspaceV1(value, { ...input, includeArchived: false });
  if (
    result.contact.notes !== input.notes ||
    result.contact.updatedAt !== input.updatedAt ||
    result.contact.rowVersion !== input.expectedRowVersion + 1
  )
    throw new TypeError("Contact notes acknowledgement mismatch.");
  return result;
};

/** Matching creation evidence proves only explicit user entry of that exact value. */
export const resolveContactManualFieldsV1 = async (
  workspace: ContactWorkspaceV1,
  hashValue: (value: string) => Promise<string>,
): Promise<readonly ContactProvenanceFieldName[]> => {
  // Copy before hashing; a caller mutation cannot change the comparison mid-flight.
  const copied = parseContactWorkspaceV1(workspace, {
    expectedVaultId: workspace.vaultId,
    contactId: workspace.contact.id,
    includeArchived: true,
  });
  const evidence = copied.manualCreation;
  if (evidence === null) return Object.freeze([]);
  const values = contactFieldValues(copied.contact);
  const matches: ContactProvenanceFieldName[] = [];
  for (const field of CONTACT_PROVENANCE_FIELDS) {
    const value = values[field];
    if (
      value !== null &&
      evidence.valueHashes[field] !== null &&
      digest(await hashValue(value)) === evidence.valueHashes[field]
    )
      matches.push(field);
  }
  return Object.freeze(matches);
};

export const createContactWorkspaceOperations = (
  port: ContactWorkspacePortV1,
  hashValue: (value: string) => Promise<string>,
) => {
  const untrustedPort = port as unknown;
  if (typeof untrustedPort !== "object" || untrustedPort === null || Array.isArray(untrustedPort))
    throw new TypeError("Contact operations require a local port.");
  const methods = untrustedPort as Readonly<Record<string, unknown>>;
  if (
    typeof methods["read"] !== "function" ||
    typeof methods["create"] !== "function" ||
    typeof methods["updateNotes"] !== "function" ||
    typeof hashValue !== "function"
  )
    throw new TypeError("Contact operations require the complete local port and hasher.");
  return Object.freeze({
    read: defineQuery<ReadContactWorkspaceInputV1, ContactWorkspaceV1>(
      "ReadContactWorkspaceQuery",
      async (input, context) => {
        let request: ReadContactWorkspaceRequestV1;
        try {
          contextCopy(context);
          request = parseReadContactWorkspaceRequestV1(input);
        } catch {
          return applicationFailure(errors.validation);
        }
        try {
          const value = await port.read(request);
          if (value === null || value === undefined) return applicationFailure(errors.not_found);
          return applicationSuccess(parseContactWorkspaceV1(value, request));
        } catch (error) {
          return failure(error);
        }
      },
    ),
    create: defineCommand<CreateViewedContactInputV1, ContactWorkspaceV1>(
      "CreateViewedContactCommand",
      async (input, context) => {
        let fields: ReturnType<typeof parseManualContactFields>;
        let owner: ViewedVaultV1;
        let id: EntityId<"contact">;
        let captured: ApplicationOperationContext;
        let expectedCompanyRowVersion: number | null;
        try {
          captured = contextCopy(context);
          const raw = keys(
            input,
            ["specVersion", "expectedVaultId", "contactId", "contact", "expectedCompanyRowVersion"],
            ["specVersion", "expectedVaultId", "contactId", "contact"],
          );
          owner = scope(raw);
          id = entityId("contact", raw["contactId"] as string);
          fields = parseManualContactFields(keys(raw["contact"], manualKeys, ["origin", "name"]));
          expectedCompanyRowVersion =
            fields.companyId === null ? null : version(raw["expectedCompanyRowVersion"]);
          if (
            fields.companyId === null &&
            raw["expectedCompanyRowVersion"] !== undefined &&
            raw["expectedCompanyRowVersion"] !== null
          )
            throw new TypeError("A company expectation requires a company.");
        } catch {
          return applicationFailure(errors.validation);
        }
        try {
          const values = contactFieldValues(fields);
          const hashes: [ContactProvenanceFieldName, string | null][] = [];
          for (const field of CONTACT_PROVENANCE_FIELDS) {
            const value = values[field];
            hashes.push([field, value === null ? null : digest(await hashValue(value))]);
          }
          const request = parseCreateViewedContactPortInputV1({
            ...owner,
            expectedCompanyRowVersion,
            contact: {
              ...fields,
              id,
              createdAt: captured.initiatedAt,
              updatedAt: captured.initiatedAt,
            },
            manualCreation: {
              operationId: captured.operationId,
              createdAt: captured.initiatedAt,
              valueHashes: Object.fromEntries(hashes),
            },
          });
          return applicationSuccess(
            validateCreatedContactWorkspaceV1(await port.create(request), request),
          );
        } catch (error) {
          return failure(error);
        }
      },
    ),
    updateNotes: defineCommand<UpdateContactNotesInputV1, ContactWorkspaceV1>(
      "UpdateContactNotesCommand",
      async (input, context) => {
        let request: UpdateContactNotesPortInputV1;
        try {
          const captured = contextCopy(context);
          const raw = keys(input, [
            "specVersion",
            "expectedVaultId",
            "contactId",
            "expectedRowVersion",
            "notes",
          ]);
          request = parseUpdateContactNotesPortInputV1({ ...raw, updatedAt: captured.initiatedAt });
        } catch {
          return applicationFailure(errors.validation);
        }
        try {
          return applicationSuccess(
            validateUpdatedContactNotesV1(await port.updateNotes(request), request),
          );
        } catch (error) {
          return failure(error);
        }
      },
    ),
  });
};
