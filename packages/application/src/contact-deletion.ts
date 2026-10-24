import { entityId, instant, type EntityId, type Instant } from "@coredrill/domain";
import {
  ContactWorkspaceError,
  parseContactWorkspaceV1,
  type ContactWorkspaceV1,
  type ContactWorkspaceErrorCode,
} from "./contact-workspace.js";
import { defineCommand, defineQuery, type ApplicationOperationContext } from "./operation.js";
import { applicationFailure, applicationSuccess, type ApplicationError } from "./result.js";

export interface ContactDeletionTargetV1 {
  readonly specVersion: 1;
  readonly expectedVaultId: EntityId<"vault">;
  readonly contactId: EntityId<"contact">;
  readonly expectedRowVersion: number;
  readonly expectedCreatedAt: Instant;
  readonly expectedUpdatedAt: Instant;
  readonly expectedArchivedAt: Instant | null;
  readonly expectedCompanyId: EntityId<"company"> | null;
  readonly expectedManualCreationOperationId: EntityId<"application-operation"> | null;
}
export interface DeleteViewedContactInputV1 extends ContactDeletionTargetV1 {
  readonly confirmation: string;
}
export type ContactDeletionObservationV1 =
  "original_present" | "changed" | "absent_complete" | "unresolved";
export type ContactDeletionStateV1 = ContactDeletionObservationV1 | "deleted";
export interface ContactDeletionResultV1 {
  readonly specVersion: 1;
  readonly vaultId: EntityId<"vault">;
  readonly contactId: EntityId<"contact">;
  readonly state: ContactDeletionStateV1;
}
export interface ContactDeletionPortV1 {
  remove(target: ContactDeletionTargetV1): Promise<unknown>;
  inspect(target: ContactDeletionTargetV1): Promise<unknown>;
}
const targetKeys = [
  "specVersion",
  "expectedVaultId",
  "contactId",
  "expectedRowVersion",
  "expectedCreatedAt",
  "expectedUpdatedAt",
  "expectedArchivedAt",
  "expectedCompanyId",
  "expectedManualCreationOperationId",
] as const;
const observations = ["original_present", "changed", "absent_complete", "unresolved"] as const;
function keys(value: unknown, allowed: readonly string[]): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new TypeError("Invalid contact deletion contract.");
  const record = value as Readonly<Record<string, unknown>>;
  if (
    Object.keys(record).length !== allowed.length ||
    allowed.some((key) => !Object.hasOwn(record, key))
  )
    throw new TypeError("Invalid contact deletion fields.");
  return record;
}
export const parseContactDeletionTargetV1 = (value: unknown): ContactDeletionTargetV1 => {
  const raw = keys(value, targetKeys);
  const createdAt = instant(raw["expectedCreatedAt"] as string);
  const updatedAt = instant(raw["expectedUpdatedAt"] as string);
  const archivedAt =
    raw["expectedArchivedAt"] === null ? null : instant(raw["expectedArchivedAt"] as string);
  const version = raw["expectedRowVersion"];
  const expectedVaultId = entityId("vault", raw["expectedVaultId"] as string);
  const contactId = entityId("contact", raw["contactId"] as string);
  const companyId =
    raw["expectedCompanyId"] === null
      ? null
      : entityId("company", raw["expectedCompanyId"] as string);
  const operationId =
    raw["expectedManualCreationOperationId"] === null
      ? null
      : entityId("application-operation", raw["expectedManualCreationOperationId"] as string);
  if (
    raw["specVersion"] !== 1 ||
    typeof version !== "number" ||
    !Number.isSafeInteger(version) ||
    version < 1 ||
    version >= Number.MAX_SAFE_INTEGER ||
    updatedAt < createdAt ||
    (archivedAt !== null && (archivedAt < createdAt || archivedAt > updatedAt)) ||
    raw["expectedVaultId"] !== expectedVaultId ||
    raw["contactId"] !== contactId ||
    raw["expectedCompanyId"] !== companyId ||
    raw["expectedManualCreationOperationId"] !== operationId ||
    raw["expectedCreatedAt"] !== createdAt ||
    raw["expectedUpdatedAt"] !== updatedAt ||
    raw["expectedArchivedAt"] !== archivedAt
  )
    throw new TypeError("Invalid original contact identity.");
  return Object.freeze({
    specVersion: 1,
    expectedVaultId,
    contactId,
    expectedRowVersion: version,
    expectedCreatedAt: createdAt,
    expectedUpdatedAt: updatedAt,
    expectedArchivedAt: archivedAt,
    expectedCompanyId: companyId,
    expectedManualCreationOperationId: operationId,
  });
};
/** Copies only validated original identity; no notes, methods or source rights become deletion metadata. */
export const createContactDeletionTargetV1 = (
  workspace: ContactWorkspaceV1,
): ContactDeletionTargetV1 => {
  const viewed = parseContactWorkspaceV1(workspace, {
    expectedVaultId: workspace.vaultId,
    contactId: workspace.contact.id,
    includeArchived: true,
  });
  return parseContactDeletionTargetV1({
    specVersion: 1,
    expectedVaultId: viewed.vaultId,
    contactId: viewed.contact.id,
    expectedRowVersion: viewed.contact.rowVersion,
    expectedCreatedAt: viewed.contact.createdAt,
    expectedUpdatedAt: viewed.contact.updatedAt,
    expectedArchivedAt: viewed.contact.archivedAt,
    expectedCompanyId: viewed.contact.companyId,
    expectedManualCreationOperationId: viewed.manualCreation?.operationId ?? null,
  });
};
export const parseContactDeletionResultV1 = (
  value: unknown,
  target: ContactDeletionTargetV1,
  allowedStates: readonly ContactDeletionStateV1[],
): ContactDeletionResultV1 => {
  const expected = parseContactDeletionTargetV1(target);
  const raw = keys(value, ["specVersion", "vaultId", "contactId", "state"]);
  const state = raw["state"];
  if (
    raw["specVersion"] !== 1 ||
    raw["vaultId"] !== expected.expectedVaultId ||
    raw["contactId"] !== expected.contactId ||
    typeof state !== "string" ||
    !["deleted", ...observations].includes(state) ||
    !allowedStates.includes(state as ContactDeletionStateV1)
  )
    throw new TypeError("Contact deletion result does not match the original scope.");
  return Object.freeze({
    specVersion: 1,
    vaultId: expected.expectedVaultId,
    contactId: expected.contactId,
    state: state as ContactDeletionStateV1,
  });
};
function validContext(context: ApplicationOperationContext): void {
  const raw = keys(context, ["operationId", "initiatedAt"]);
  entityId("application-operation", raw["operationId"] as string);
  instant(raw["initiatedAt"] as string);
}
const errors: Readonly<Record<ContactWorkspaceErrorCode | "validation", ApplicationError>> = {
  validation: {
    code: "validation",
    message: "Review the original contact and exact deletion confirmation.",
    retryable: false,
  },
  not_found: {
    code: "not_found",
    message: "The original local contact or vault is no longer available.",
    retryable: false,
  },
  stale: {
    code: "conflict",
    message: "The original contact changed. Review it before a new deletion attempt.",
    retryable: false,
  },
  unavailable: {
    code: "unavailable",
    message: "Local contact storage is unavailable.",
    retryable: true,
  },
  invalid_state: {
    code: "internal",
    message:
      "The contact deletion outcome could not be confirmed. Check its state without repeating the write.",
    retryable: false,
  },
};
const failure = (error: unknown) =>
  applicationFailure(
    error instanceof ContactWorkspaceError && Object.hasOwn(errors, error.code)
      ? errors[error.code]
      : errors.invalid_state,
  );
export const createContactDeletionOperations = (port: ContactDeletionPortV1) =>
  Object.freeze({
    inspect: defineQuery<ContactDeletionTargetV1, ContactDeletionResultV1>(
      "InspectContactDeletionQuery",
      async (input, context) => {
        let target: ContactDeletionTargetV1;
        try {
          target = parseContactDeletionTargetV1(input);
          validContext(context);
        } catch {
          return applicationFailure(errors.validation);
        }
        try {
          return applicationSuccess(
            parseContactDeletionResultV1(await port.inspect(target), target, observations),
          );
        } catch (error) {
          return failure(error);
        }
      },
    ),
    remove: defineCommand<DeleteViewedContactInputV1, ContactDeletionResultV1>(
      "DeleteViewedContactCommand",
      async (input, context) => {
        let target: ContactDeletionTargetV1;
        try {
          const raw = keys(input, [...targetKeys, "confirmation"]);
          if (raw["confirmation"] !== "DELETE CONTACT")
            throw new TypeError("Explicit confirmation required.");
          target = parseContactDeletionTargetV1(
            Object.fromEntries(targetKeys.map((key) => [key, raw[key]])),
          );
          validContext(context);
        } catch {
          return applicationFailure(errors.validation);
        }
        try {
          return applicationSuccess(
            parseContactDeletionResultV1(await port.remove(target), target, ["deleted"]),
          );
        } catch (error) {
          return failure(error);
        }
      },
    ),
  });
