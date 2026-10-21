import {
  applicationFailure,
  parseCompanyWorkspaceV1,
  validateCreatedCompanyWorkspaceV1,
  type ApplicationResult,
  type CompanyWorkspaceV1,
} from "@coredrill/application";
import { entityId, webUrl, type EntityId } from "@coredrill/domain";
import type {
  StoredCompanyCreation,
  StoredCompanyWorkspaceApi,
} from "./stored-company-workspace.js";

export interface CompanyDraftFields {
  readonly canonicalName: string;
  readonly websiteUrl: string;
  readonly domain: string;
  readonly notes: string;
}
export interface StoredCompanyDraft {
  readonly mode: "create" | "notes";
  readonly vaultId: EntityId<"vault">;
  readonly companyId: EntityId<"company">;
  readonly expectedRowVersion: number | null;
  readonly fields: CompanyDraftFields;
  readonly dirty: boolean;
  readonly busy: boolean;
  readonly phase: "editing" | "uncertain" | "saved";
  readonly error: string | null;
  readonly acknowledged: CompanyWorkspaceV1 | null;
  readonly recovered: boolean;
}
const empty: CompanyDraftFields = Object.freeze({
  canonicalName: "",
  websiteUrl: "",
  domain: "",
  notes: "",
});
const limits: Readonly<Record<keyof CompanyDraftFields, number>> = {
  canonicalName: 512,
  websiteUrl: 8192,
  domain: 253,
  notes: 200_000,
};
const preserved = [
  "id",
  "canonicalName",
  "websiteUrl",
  "domain",
  "locationId",
  "createdAt",
  "archivedAt",
] as const;
type Result = ApplicationResult<CompanyWorkspaceV1>;

/** One ephemeral root-owned draft, never canonical company storage. */
export const createStoredCompanyEditor = (options: {
  readonly api: () => StoredCompanyWorkspaceApi;
  readonly changed: (draft: StoredCompanyDraft | null) => void;
  readonly allowed?: () => boolean;
  readonly exclusive?: (vaultId: string, work: () => Promise<Result>) => Promise<Result>;
}) => {
  let disposed = false;
  const inactive = () => disposed;
  let state: StoredCompanyDraft | null = null;
  let api: StoredCompanyWorkspaceApi | null = null;
  let creation: StoredCompanyCreation | null = null;
  let original: CompanyWorkspaceV1 | null = null;
  let initialFields = empty;
  const allowed = () => !disposed && (options.allowed?.() ?? true);
  const publish = (next: StoredCompanyDraft | null) => {
    if (disposed) return;
    state =
      next === null
        ? null
        : Object.freeze({
            ...next,
            fields: Object.freeze({ ...next.fields }),
            dirty: Object.keys(limits).some(
              (field) =>
                next.fields[field as keyof CompanyDraftFields] !==
                initialFields[field as keyof CompanyDraftFields],
            ),
          });
    options.changed(state);
  };
  const owns = (vaultId: string) => !disposed && state !== null && state.vaultId === vaultId;
  const expected = (raw: unknown, draft: StoredCompanyDraft): CompanyWorkspaceV1 => {
    const value = parseCompanyWorkspaceV1(raw, {
      expectedVaultId: draft.vaultId,
      companyId: draft.companyId,
      includeArchived: false,
    });
    if (draft.mode === "create") {
      const at = creation?.createdAt();
      if (at === null || at === undefined) throw new TypeError("Missing creation attempt time.");
      return validateCreatedCompanyWorkspaceV1(value, {
        specVersion: 1,
        expectedVaultId: draft.vaultId,
        company: {
          id: draft.companyId,
          canonicalName: draft.fields.canonicalName,
          websiteUrl: draft.fields.websiteUrl === "" ? null : webUrl(draft.fields.websiteUrl),
          domain: draft.fields.domain === "" ? null : draft.fields.domain.toLowerCase(),
          locationId: null,
          notes: draft.fields.notes,
          archivedAt: null,
          createdAt: at,
          updatedAt: at,
        },
      });
    }
    if (
      original === null ||
      draft.expectedRowVersion === null ||
      value.company.rowVersion !== draft.expectedRowVersion + 1 ||
      value.company.notes !== draft.fields.notes ||
      value.company.updatedAt < original.company.updatedAt ||
      preserved.some((key) => value.company[key] !== original?.company[key])
    )
      throw new TypeError("Company notes do not match the original draft.");
    return value;
  };
  const saved = (
    draft: StoredCompanyDraft,
    acknowledged: CompanyWorkspaceV1,
    recovered: boolean,
  ) => {
    publish({ ...draft, busy: false, phase: "saved", error: null, acknowledged, recovered });
    return true;
  };
  const begin = (
    mode: StoredCompanyDraft["mode"],
    vaultId: EntityId<"vault">,
    companyId: EntityId<"company">,
    fields: CompanyDraftFields,
    expectedRowVersion: number | null,
  ) => {
    initialFields = fields;
    publish({
      mode,
      vaultId,
      companyId,
      expectedRowVersion,
      fields,
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
    startCreate: (viewedVaultId: string): boolean => {
      if (!allowed() || state !== null) return false;
      try {
        const vaultId = entityId("vault", viewedVaultId);
        api = options.api();
        creation = api.beginCreation(vaultId);
        if (creation.vaultId !== vaultId) throw new TypeError("Foreign draft capability.");
        original = null;
        return begin("create", vaultId, entityId("company", creation.companyId), empty, null);
      } catch {
        api = null;
        creation = null;
        return false;
      }
    },
    startNotes: (input: CompanyWorkspaceV1): boolean => {
      if (!allowed() || state !== null) return false;
      try {
        const viewed = parseCompanyWorkspaceV1(input, {
          expectedVaultId: entityId("vault", input.vaultId),
          companyId: entityId("company", input.company.id),
          includeArchived: false,
        });
        api = options.api();
        creation = null;
        original = viewed;
        return begin(
          "notes",
          viewed.vaultId,
          viewed.company.id,
          {
            canonicalName: viewed.company.canonicalName,
            websiteUrl: viewed.company.websiteUrl ?? "",
            domain: viewed.company.domain ?? "",
            notes: viewed.company.notes,
          },
          viewed.company.rowVersion,
        );
      } catch {
        api = null;
        original = null;
        return false;
      }
    },
    edit: (viewedVaultId: string, field: keyof CompanyDraftFields, value: string): boolean => {
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
            if (capturedCreation === null) throw new TypeError("Missing creation owner.");
            return capturedCreation.save({
              origin: "user_entered",
              canonicalName: draft.fields.canonicalName,
              websiteUrl: draft.fields.websiteUrl === "" ? null : draft.fields.websiteUrl,
              domain: draft.fields.domain === "" ? null : draft.fields.domain,
              locationId: null,
              notes: draft.fields.notes,
            });
          }
          if (draft.expectedRowVersion === null) throw new TypeError("Missing notes version.");
          return capturedApi.updateNotes({
            specVersion: 1,
            expectedVaultId: draft.vaultId,
            companyId: draft.companyId,
            expectedRowVersion: draft.expectedRowVersion,
            notes: draft.fields.notes,
          });
        };
        const result = await (options.exclusive?.(draft.vaultId, work) ?? work());
        if (inactive()) return false;
        if (result.ok) {
          if (!didSubmit()) throw new TypeError("No company write was submitted.");
          return saved(draft, expected(result.value, draft), false);
        }
        publish({
          ...draft,
          busy: false,
          phase: !didSubmit() || result.error.code === "validation" ? "editing" : "uncertain",
          error: !didSubmit()
            ? "Another vault operation prevented submission. Your original draft remains here."
            : result.error.code === "validation"
              ? "Review the company fields. Your original input remains here; nothing was saved."
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
      publish({ ...draft, busy: true, error: null });
      if (inactive()) return false;
      try {
        const result = await capturedApi.read({
          specVersion: 1,
          expectedVaultId: draft.vaultId,
          companyId: draft.companyId,
          includeArchived: true,
        });
        if (inactive()) return false;
        if (result.ok) {
          try {
            return saved(draft, expected(result.value, draft), true);
          } catch {
            const actual = parseCompanyWorkspaceV1(result.value, {
              expectedVaultId: draft.vaultId,
              companyId: draft.companyId,
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
                  "Stored company still matches the original view. Your draft was not reapplied; you may explicitly retry.",
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
              "The fixed creation identity was not found when read. An explicit retry will keep that same identity.",
          });
          return false;
        }
      } catch {
        /* Keep private adapter errors out of draft state. */
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
export type StoredCompanyEditor = ReturnType<typeof createStoredCompanyEditor>;
