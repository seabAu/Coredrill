import { useEffect, useRef, useState } from "react";
import { restoreFocusAfterChange, VaultRestorePanel } from "@coredrill/ui";
import type { ApplicationResult } from "@coredrill/application";
import type { CoredrillStorageSpikeApi } from "./main.js";
import {
  createVaultRestoreSession,
  type VaultRestoreSession,
  type VaultRestoreSessionState,
} from "./vault-restore-session.js";
import { markLocalVaultInitialized } from "./vault-lifecycle.js";

/** Mount above routes, not inside Settings: navigation cannot abandon a live capability. */
export const useStoredVaultRestoreSession = (options: {
  readonly api: CoredrillStorageSpikeApi;
  readonly ownerId: string | null;
  readonly enabled: boolean;
  readonly exclusive?: <T>(
    work: () => Promise<ApplicationResult<T>>,
  ) => Promise<ApplicationResult<T>>;
}) => {
  const live = useRef(options);
  live.current = options;
  const controller = useRef<VaultRestoreSession | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const [model, setModel] = useState<VaultRestoreSessionState | null>(null);
  useEffect(() => {
    if (!options.enabled) return;
    const current = createVaultRestoreSession({
      ownerId: options.ownerId,
      runtime: options.api.runtimeKind,
      api: options.api.vaultRestore,
      exclusive: (work) => live.current.exclusive?.(work) ?? work(),
      onChange: setModel,
    });
    controller.current = current;
    setModel(current.current());
    return () => {
      current.dispose();
      controller.current = null;
    };
  }, [options.enabled, options.ownerId, options.api]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (controller.current?.current().busy) event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, []);
  const scoped = () =>
    options.enabled && controller.current?.current().ownerId === options.ownerId
      ? controller.current
      : null;
  const visible = options.enabled && model?.ownerId === options.ownerId ? model : null;
  const select = (file?: File) => {
    const current = scoped();
    if (current === null) return;
    const origin = document.activeElement;
    void current.select(file).then((reviewed) => {
      if (!reviewed || controller.current !== current) return;
      restoreFocusAfterChange(
        origin,
        () => container.current?.querySelector<HTMLElement>("[data-vault-restore-review]") ?? null,
      );
    });
  };
  return {
    busy: visible?.busy ?? false,
    needsReopen: visible?.phase === "reopen",
    pending: () => scoped()?.current().busy ?? false,
    discard: () => scoped()?.discard() ?? Promise.resolve(true),
    panel: (blocked: boolean, headingLevel: 2 | 3 = 3) =>
      visible === null ? null : (
        <div ref={container}>
          <VaultRestorePanel
            state={visible}
            runtime={options.api.runtimeKind}
            blocked={blocked}
            headingLevel={headingLevel}
            onFile={(file) => {
              if (!blocked) select(file);
            }}
            onNativeSelect={() => {
              if (!blocked) select();
            }}
            onConfirm={(checked) => {
              if (!blocked) scoped()?.confirm(checked);
            }}
            onCommit={() => {
              if (blocked) return;
              const current = scoped();
              if (current === null) return;
              const origin = document.activeElement;
              void current.commit().then(() => {
                if (controller.current !== current || current.current().phase !== "reopen") return;
                restoreFocusAfterChange(
                  origin,
                  () =>
                    container.current?.querySelector<HTMLElement>("[data-vault-restore-heading]") ??
                    null,
                );
              });
            }}
            onDiscard={() => {
              if (!blocked) void scoped()?.discard();
            }}
            onReopen={() => {
              const current = scoped()?.current();
              if (current?.phase !== "reopen" || current.busy) return;
              if (current.error === null) markLocalVaultInitialized();
              history.replaceState(null, "", "/");
              window.location.reload();
            }}
          />
        </div>
      ),
  };
};
