import {
  applicationFailure,
  CONTACT_PROVENANCE_FIELDS,
  contactFieldValues,
  parseCompanyWorkspaceV1,
  parseContactWorkspaceV1,
  parseManualContactFields,
  validateCreatedContactWorkspaceV1,
  type ApplicationResult,
  type CompanyWorkspaceV1,
  type ContactWorkspaceV1,
  type CreateUserEnteredContactInput,
} from "@coredrill/application";
import { entityId, instant, type EntityId } from "@coredrill/domain";
import type {
  StoredContactCreation,
  StoredContactWorkspaceApi,
} from "./stored-contact-workspace.js";

export interface ContactDraftFields {
  readonly name: string;
  readonly role: string;
  readonly email: string;
  readonly phone: string;
  readonly publicProfileUrl: string;
  readonly notes: string;
}
export interface StoredContactDraft {
  readonly mode: "create" | "notes";
  readonly vaultId: EntityId<"vault">;
  readonly contactId: EntityId<"contact">;
  readonly companyId: EntityId<"company"> | null;
  readonly companyName: string | null;
  readonly expectedCompanyRowVersion: number | null;
  readonly expectedRowVersion: number | null;
  readonly fields: ContactDraftFields;
  readonly dirty: boolean;
  readonly busy: boolean;
  readonly phase: "editing" | "uncertain" | "saved";
  readonly error: string | null;
  readonly acknowledged: ContactWorkspaceV1 | null;
  readonly recovered: boolean;
}
const empty: ContactDraftFields = Object.freeze({
  name: "",
  role: "",
  email: "",
  phone: "",
  publicProfileUrl: "",
  notes: "",
});
const limits: Readonly<Record<keyof ContactDraftFields, number>> = {
  name: 512,
  role: 512,
  email: 320,
  phone: 128,
  publicProfileUrl: 8192,
  notes: 200_000,
};
const manualFields = (
  fields: ContactDraftFields,
): Omit<CreateUserEnteredContactInput, "companyId"> => ({
  origin: "user_entered",
  name: fields.name,
  role: fields.role === "" ? null : fields.role,
  email: fields.email === "" ? null : fields.email,
  phone: fields.phone === "" ? null : fields.phone,
  publicProfileUrl: fields.publicProfileUrl === "" ? null : fields.publicProfileUrl,
  notes: fields.notes,
});
const preserved = [
  "id",
  "companyId",
  "name",
  "role",
  "email",
  "phone",
  "publicProfileUrl",
  "confidence",
  "userConfirmed",
  "createdAt",
  "archivedAt",
] as const;
type Result = ApplicationResult<ContactWorkspaceV1>;

/** One root-owned session draft, never canonical contact or provenance storage. */
export const createStoredContactEditor = (options: {
  readonly api: () => StoredContactWorkspaceApi;
  readonly changed: (draft: StoredContactDraft | null) => void;
  readonly allowed?: () => boolean;
  readonly exclusive?: (vaultId: string, work: () => Promise<Result>) => Promise<Result>;
}) => {
  let disposed = false;
  const inactive = () => disposed;
  let state: StoredContactDraft | null = null;
  let api: StoredContactWorkspaceApi | null = null;
  let creation: StoredContactCreation | null = null;
  let original: ContactWorkspaceV1 | null = null;
  let initialFields = empty;
  const allowed = () => !disposed && (options.allowed?.() ?? true);
  const publish = (next: StoredContactDraft | null) => {
    if (disposed) return;
    state =
      next === null
        ? null
        : Object.freeze({
            ...next,
            fields: Object.freeze({ ...next.fields }),
            dirty: Object.keys(limits).some(
              (field) =>
                next.fields[field as keyof ContactDraftFields] !==
                initialFields[field as keyof ContactDraftFields],
            ),
          });
    options.changed(state);
  };
  const owns = (vaultId: string) => !disposed && state !== null && state.vaultId === vaultId;
  const expected = async (
    raw: unknown,
    draft: StoredContactDraft,
    capturedApi: StoredContactWorkspaceApi,
    capturedCreation: StoredContactCreation | null,
  ): Promise<ContactWorkspaceV1> => {
    const value = parseContactWorkspaceV1(raw, {
      expectedVaultId: draft.vaultId,
      contactId: draft.contactId,
      includeArchived: false,
    });
    if (draft.mode === "create") {
      const attempt = capturedCreation?.attemptContext();
      const context =
        attempt === null || attempt === undefined
          ? null
          : Object.freeze({
              operationId: entityId("application-operation", attempt.operationId),
              initiatedAt: instant(attempt.initiatedAt),
            });
      const receipt = value.manualCreation;
      if (
        context === null ||
        receipt?.operationId !== context.operationId ||
        receipt.createdAt !== context.initiatedAt
      )
        throw new TypeError("The creation receipt does not match the original attempt.");
      const fields = parseManualContactFields({
        ...manualFields(draft.fields),
        companyId: draft.companyId,
      });
      const matching = await capturedApi.resolveManualFields(value);
      const values = contactFieldValues(fields);
      const populated = CONTACT_PROVENANCE_FIELDS.filter((field) => values[field] !== null);
      if (
        matching.length !== populated.length ||
        matching.some((field, index) => field !== populated[index])
      )
        throw new TypeError("The original contact values do not match their creation evidence.");
      return validateCreatedContactWorkspaceV1(value, {
        specVersion: 1,
        expectedVaultId: draft.vaultId,
        contact: {
          ...fields,
          id: draft.contactId,
          createdAt: context.initiatedAt,
          updatedAt: context.initiatedAt,
        },
        expectedCompanyRowVersion: draft.expectedCompanyRowVersion,
        manualCreation: receipt,
      });
    }
    const before = original;
    if (
      before === null ||
      draft.expectedRowVersion === null ||
      value.contact.rowVersion !== draft.expectedRowVersion + 1 ||
      value.contact.notes !== draft.fields.notes ||
      value.contact.updatedAt < before.contact.updatedAt ||
      preserved.some((key) => value.contact[key] !== before.contact[key]) ||
      JSON.stringify(value.manualCreation) !== JSON.stringify(before.manualCreation)
    )
      throw new TypeError("Contact notes do not match the original viewed record.");
    return value;
  };
  const saved = (
    draft: StoredContactDraft,
    acknowledged: ContactWorkspaceV1,
    recovered: boolean,
  ) => {
    publish({ ...draft, busy: false, phase: "saved", error: null, acknowledged, recovered });
    return true;
  };
  const begin = (
    draft: Omit<
      StoredContactDraft,
      "dirty" | "busy" | "phase" | "error" | "acknowledged" | "recovered"
    >,
  ) => {
    initialFields = Object.freeze({ ...draft.fields });
    publish({
      ...draft,
      dirty: false,
      busy: false,
      phase: "editing",
      error: null,
      acknowledged: null,
      recovered: false,
    });
    return true;
  };
  return Object.freeze({
    current: () => state,
    hasUnsaved: () =>
      state !== null &&
      (state.busy || state.phase === "uncertain" || (state.phase === "editing" && state.dirty)),
    startCreate: (viewedVaultId: string, company: CompanyWorkspaceV1 | null = null): boolean => {
      if (!allowed() || state !== null) return false;
      try {
        const vaultId = entityId("vault", viewedVaultId);
        const selected =
          company === null
            ? null
            : parseCompanyWorkspaceV1(company, {
                expectedVaultId: vaultId,
                companyId: entityId("company", company.company.id),
                includeArchived: false,
              });
        api = options.api();
        creation = api.beginCreation(
          vaultId,
          selected === null
            ? null
            : {
                id: selected.company.id,
                rowVersion: selected.company.rowVersion,
              },
        );
        if (
          creation.vaultId !== vaultId ||
          creation.companyId !== (selected?.company.id ?? null) ||
          creation.expectedCompanyRowVersion !== (selected?.company.rowVersion ?? null)
        )
          throw new TypeError("Foreign contact draft capability.");
        original = null;
        return begin({
          mode: "create",
          vaultId,
          contactId: entityId("contact", creation.contactId),
          companyId: creation.companyId,
          companyName: selected?.company.canonicalName ?? null,
          expectedCompanyRowVersion: creation.expectedCompanyRowVersion,
          expectedRowVersion: null,
          fields: empty,
        });
      } catch {
        api = null;
        creation = null;
        original = null;
        return false;
      }
    },
    startNotes: (input: ContactWorkspaceV1): boolean => {
      if (!allowed() || state !== null) return false;
      try {
        const viewed = parseContactWorkspaceV1(input, {
          expectedVaultId: entityId("vault", input.vaultId),
          contactId: entityId("contact", input.contact.id),
          includeArchived: false,
        });
        api = options.api();
        creation = null;
        original = viewed;
        return begin({
          mode: "notes",
          vaultId: viewed.vaultId,
          contactId: viewed.contact.id,
          companyId: viewed.contact.companyId,
          companyName: null,
          expectedCompanyRowVersion: null,
          expectedRowVersion: viewed.contact.rowVersion,
          fields: {
            name: viewed.contact.name,
            role: viewed.contact.role ?? "",
            email: viewed.contact.email ?? "",
            phone: viewed.contact.phone ?? "",
            publicProfileUrl: viewed.contact.publicProfileUrl ?? "",
            notes: viewed.contact.notes,
          },
        });
      } catch {
        api = null;
        creation = null;
        original = null;
        return false;
      }
    },
    edit: (viewedVaultId: string, field: keyof ContactDraftFields, value: string): boolean => {
      if (
        !owns(viewedVaultId) ||
        state === null ||
        state.busy ||
        state.phase !== "editing" ||
        !Object.hasOwn(limits, field) ||
        (state.mode === "notes" && field !== "notes")
      )
        return false;
      if (typeof value !== "string" || value.length > limits[field] || value.includes("\u0000")) {
        publish({
          ...state,
          error:
            "This field is too large or contains a NUL character. The prior value was kept, not truncated.",
        });
        return false;
      }
      publish({ ...state, fields: { ...state.fields, [field]: value }, error: null });
      return true;
    },
    discard: (viewedVaultId: string): boolean => {
      if (!owns(viewedVaultId) || state === null || state.busy) return false;
      api = null;
      creation = null;
      original = null;
      publish(null);
      return true;
    },
    save: async (viewedVaultId: string): Promise<boolean> => {
      if (
        !owns(viewedVaultId) ||
        state === null ||
        state.busy ||
        state.phase !== "editing" ||
        !allowed() ||
        api === null
      )
        return false;
      const draft = state;
      const capturedApi = api;
      const capturedCreation = creation;
      let submitted = false;
      const didSubmit = () => submitted;
      publish({ ...draft, busy: true, error: null });
      if (inactive()) return false;
      try {
        const work = async (): Promise<Result> => {
          if (!allowed())
            return applicationFailure({
              code: "conflict",
              retryable: false,
              message: "The viewed mutation owner is unavailable.",
            });
          submitted = true;
          if (draft.mode === "create") {
            if (capturedCreation === null) throw new TypeError("Missing contact creation owner.");
            return capturedCreation.save(manualFields(draft.fields));
          }
          if (draft.expectedRowVersion === null)
            throw new TypeError("Missing contact notes version.");
          return capturedApi.updateNotes({
            specVersion: 1,
            expectedVaultId: draft.vaultId,
            contactId: draft.contactId,
            expectedRowVersion: draft.expectedRowVersion,
            notes: draft.fields.notes,
          });
        };
        const result = await (options.exclusive?.(draft.vaultId, work) ?? work());
        if (inactive()) return false;
        if (result.ok) {
          if (!didSubmit()) throw new TypeError("No contact write was submitted.");
          const acknowledged = await expected(result.value, draft, capturedApi, capturedCreation);
          if (inactive()) return false;
          return saved(draft, acknowledged, false);
        }
        publish({
          ...draft,
          busy: false,
          phase: !didSubmit() || result.error.code === "validation" ? "editing" : "uncertain",
          error: !didSubmit()
            ? "Another vault operation prevented submission. Your original draft remains here."
            : result.error.code === "validation"
              ? "Review the contact fields. Your original input remains here; nothing was saved."
              : "The save could not be confirmed. Your original draft remains locked. Check stored state before an explicit retry; no automatic resubmission occurs.",
        });
      } catch {
        if (!inactive())
          publish({
            ...draft,
            busy: false,
            phase: didSubmit() ? "uncertain" : "editing",
            error:
              "The save could not be confirmed. Your original draft remains here. Check stored state before retrying.",
          });
      }
      return false;
    },
    recover: async (viewedVaultId: string): Promise<boolean> => {
      if (
        !owns(viewedVaultId) ||
        state === null ||
        state.busy ||
        state.phase !== "uncertain" ||
        api === null ||
        !allowed()
      )
        return false;
      const draft = state;
      const capturedApi = api;
      const capturedCreation = creation;
      publish({ ...draft, busy: true, error: null });
      if (inactive()) return false;
      try {
        const result = await capturedApi.read({
          specVersion: 1,
          expectedVaultId: draft.vaultId,
          contactId: draft.contactId,
          includeArchived: true,
        });
        if (inactive()) return false;
        if (result.ok) {
          try {
            const acknowledged = await expected(result.value, draft, capturedApi, capturedCreation);
            if (inactive()) return false;
            return saved(draft, acknowledged, true);
          } catch {
            if (inactive()) return false;
            const actual = parseContactWorkspaceV1(result.value, {
              expectedVaultId: draft.vaultId,
              contactId: draft.contactId,
              includeArchived: true,
            });
            if (
              draft.mode === "notes" &&
              original !== null &&
              JSON.stringify(actual) === JSON.stringify(original)
            ) {
              publish({
                ...draft,
                busy: false,
                phase: "editing",
                error:
                  "Stored contact still matches the original view. Your draft was not reapplied; you may explicitly retry.",
              });
              return false;
            }
          }
        } else if (draft.mode === "create" && result.error.code === "not_found") {
          publish({
            ...draft,
            busy: false,
            phase: "editing",
            error:
              "The fixed creation identity was not found when read. An explicit retry will keep that same identity and context.",
          });
          return false;
        }
      } catch {
        /* Never publish private adapter/hasher errors. */
      }
      if (!inactive())
        publish({
          ...draft,
          busy: false,
          phase: "uncertain",
          error:
            "Stored state could not confirm this original draft. It remains locked; review or explicitly discard it without resubmitting.",
        });
      return false;
    },
    dispose: () => {
      disposed = true;
      state = null;
      api = null;
      creation = null;
      original = null;
      initialFields = empty;
    },
  });
};
export type StoredContactEditor = ReturnType<typeof createStoredContactEditor>;
