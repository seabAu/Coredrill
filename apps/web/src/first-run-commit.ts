import {
  applicationFailure,
  applicationSuccess,
  type ApplicationResult,
  type VaultSessionDto,
} from "@coredrill/application";
import type { SuppliedCaptureDraftV1 } from "@coredrill/capture-core";
import type { FirstJobDraft, FirstRunCompletion } from "@coredrill/ui";
import type { CoredrillStorageSpikeApi } from "./main.js";
import { SuppliedCaptureInputError } from "./supplied-capture.js";

const failure = (message: string, code: "conflict" | "validation" | "unavailable" = "conflict") =>
  applicationFailure({ code, message, retryable: true });

/** Wizard progress is ephemeral. Every retry checks SQLite's current identity. */
export const createFirstRunCommitter = (options: {
  readonly runtimeKind: "browser" | "native";
  readonly getVaultApi: () => CoredrillStorageSpikeApi["vault"];
  readonly prepareCapture: (job: FirstJobDraft) => Promise<SuppliedCaptureDraftV1>;
  readonly saveCapture: (draft: SuppliedCaptureDraftV1) => Promise<unknown>;
  readonly onVaultSaved: (session: VaultSessionDto) => void;
}) => {
  let owned: VaultSessionDto | null = null;
  let running = false;
  const ensureVault = async (
    name: string,
    keepSavedName: boolean,
  ): Promise<ApplicationResult<VaultSessionDto>> => {
    const api = options.getVaultApi();
    const inspected = await api.inspect();
    if (!inspected.ok) return inspected;
    const current = inspected.value.vault;
    if (current !== null) {
      if (current.id !== owned?.vault.id)
        return failure(
          "This database now has a named vault. Reload to review it; no data was replaced.",
        );
      if (!keepSavedName && current.name !== name)
        return failure(
          "The vault name was already saved. Keep that name; renaming is not available in setup.",
        );
      return applicationSuccess(
        Object.freeze({ vault: current, diagnostics: inspected.value.diagnostics }),
      );
    }
    if (owned !== null)
      return failure(
        "The previously saved vault is no longer available. Reload to review recovery options before creating another.",
      );
    const result = await api.create({ name });
    if (result.ok) {
      owned = result.value;
      options.onVaultSaved(result.value);
    }
    return result;
  };
  const run = async (
    action: () => Promise<ApplicationResult<unknown>>,
  ): Promise<ApplicationResult<unknown>> => {
    if (running)
      return failure("Local setup is already saving. Wait for that operation to finish.");
    running = true;
    try {
      return await action();
    } catch (error) {
      return failure(
        error instanceof SuppliedCaptureInputError
          ? error.message
          : "Local setup could not be saved. Any saved vault remains local; your form entries remain available for retry.",
        error instanceof SuppliedCaptureInputError ? "validation" : "unavailable",
      );
    } finally {
      running = false;
    }
  };
  return Object.freeze({
    complete: (input: FirstRunCompletion) => {
      const request = structuredClone(input);
      return run(async () => {
        const runtime = options.runtimeKind === "native" ? "desktop" : "browser";
        if (!["quick", "guided"].includes(request.track))
          return failure("Choose a supported setup track.", "validation");
        if (request.runtime !== runtime)
          return failure(
            "This setup can only configure the current storage runtime.",
            "validation",
          );
        if (
          request.track === "guided" &&
          (request.aiMode !== "disabled" ||
            !Object.is(request.optionalLock, false) ||
            request.backup !== "remind-later" ||
            request.extension !== "later" ||
            request.imports.length !== 0)
        ) {
          return failure(
            "That optional setup action is not connected. Keep AI disabled and defer optional integrations.",
            "validation",
          );
        }
        if (request.track === "quick" && request.firstJob.method === "capture")
          return failure(
            "Extension capture must be invoked separately. Choose manual entry or paste in setup.",
            "validation",
          );
        const prepared =
          request.track === "quick" ? await options.prepareCapture(request.firstJob) : null;
        const result = await ensureVault(request.vaultName, false);
        if (!result.ok) return result;
        if (prepared !== null) await options.saveCapture(prepared);
        return applicationSuccess(undefined);
      });
    },
    skip: () =>
      run(async () => {
        const result = await ensureVault("My job search", true);
        return result.ok ? applicationSuccess(undefined) : result;
      }),
  });
};
