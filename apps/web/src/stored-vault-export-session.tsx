import { useEffect, useRef, useState } from "react";
import { applicationFailure, type ApplicationResult } from "@coredrill/application";
import { VaultExportPanel, restoreFocusAfterChange } from "@coredrill/ui";
import type { CoredrillStorageSpikeApi } from "./main.js";
import { createBrowserVaultExportHandoff } from "./browser-vault-export-handoff.js";
import {
  createVaultExportSession,
  type VaultExportSession,
  type VaultExportSessionState,
} from "./vault-export-session.js";

/** Mounted above Settings routes: navigation/reflow cannot replace a pending export. */
export const useStoredVaultExportSession = (options: {
  readonly api: CoredrillStorageSpikeApi;
  readonly ownerId: string | null;
  readonly enabled: boolean;
}) => {
  const ownerId = options.enabled ? options.ownerId : null;
  const liveApi = useRef(options.api);
  liveApi.current = options.api;
  const controller = useRef<VaultExportSession | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const [model, setModel] = useState<VaultExportSessionState | null>(null);
  useEffect(() => {
    const current = createVaultExportSession({
      ownerId,
      prepare: (input) => liveApi.current.vaultExport.prepare(input),
      recordVerification: (input) => liveApi.current.vaultExport.recordVerification(input),
      save:
        options.api.runtimeKind === "native"
          ? async (artifact) => {
              const result = await liveApi.current.vaultExport.save({
                vaultId: artifact.vaultId,
                archiveId: artifact.archiveId,
                schemaVersion: artifact.schemaVersion,
                byteLength: artifact.byteLength,
                sha256: artifact.sha256,
                bytes: artifact.bytes,
                acknowledgeUnencrypted: true,
              });
              if (!result.ok) throw new Error("Native archive save was not confirmed.");
              return result.value;
            }
          : createBrowserVaultExportHandoff("browser"),
      onChange: setModel,
    });
    controller.current = current;
    setModel(current.current());
    return () => {
      current.dispose();
      controller.current = null;
    };
  }, [ownerId, options.api.runtimeKind]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!controller.current?.current().busy) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, []);
  const visible: VaultExportSessionState =
    model?.ownerId === ownerId
      ? model
      : {
          ownerId,
          phase: "idle",
          busy: false,
          consent: false,
          metadata: null,
          error: null,
          message: "No portable archive is prepared.",
          recordStatus: "not_recorded",
          recordError: null,
          recordRetryAvailable: false,
          recordRevision: 0,
        };
  const prepare = () => {
    const current = controller.current;
    if (current?.current().ownerId !== ownerId) return;
    const origin = document.activeElement;
    void current.prepare().then((prepared) => {
      if (!prepared || controller.current !== current) return;
      restoreFocusAfterChange(
        origin,
        () => container.current?.querySelector<HTMLElement>("[data-vault-export-review]") ?? null,
      );
    });
  };
  const scoped = () =>
    controller.current?.current().ownerId === ownerId && ownerId !== null
      ? controller.current
      : null;
  const mutate = <Result,>(
    vaultId: string,
    work: () => Promise<ApplicationResult<Result>>,
  ): Promise<ApplicationResult<Result>> => {
    const current = controller.current;
    if (current?.current().ownerId !== ownerId)
      return Promise.resolve(
        applicationFailure({
          code: "conflict",
          retryable: false,
          message: "Review the current vault before continuing.",
        }),
      );
    return current.runVaultMutation(vaultId, work);
  };
  return {
    busy: visible.busy,
    recordRevision: visible.recordRevision,
    mutate,
    focusExport: (origin: Element | null) => {
      const current = scoped();
      if (current === null || current.current().busy) return;
      restoreFocusAfterChange(origin, () => {
        if (controller.current !== current || current.current().ownerId !== ownerId) return null;
        return (
          container.current?.querySelector<HTMLElement>(
            '[data-vault-export-review], input[type="checkbox"]',
          ) ?? null
        );
      });
    },
    panel: (blocked: boolean) => (
      <div ref={container}>
        <VaultExportPanel
          state={visible}
          runtime={options.api.runtimeKind}
          blocked={blocked}
          onConsent={(value) => {
            if (!blocked) scoped()?.setConsent(value);
          }}
          onPrepare={() => {
            if (!blocked) prepare();
          }}
          onSave={() => {
            if (!blocked) void scoped()?.save();
          }}
          onVerify={(file) => {
            if (!blocked) void scoped()?.verify(file);
          }}
          onDiscard={() => {
            if (!blocked) scoped()?.discard();
          }}
          onRetryRecord={() => {
            if (!blocked) void scoped()?.retryRecord();
          }}
        />
      </div>
    ),
  };
};
