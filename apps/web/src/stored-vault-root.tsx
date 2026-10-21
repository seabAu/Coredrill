import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FirstRunExperience } from "@coredrill/ui";
import {
  applicationFailure,
  type ApplicationResult,
  type VaultSessionDto,
} from "@coredrill/application";
import { useStoredVaultRestoreSession } from "./stored-vault-restore-session.js";
import { createFirstRunCommitter } from "./first-run-commit.js";
import { prepareSuppliedCaptureDraft } from "./supplied-capture.js";
import { expectsLocalVault, markLocalVaultInitialized } from "./vault-lifecycle.js";

export const StoredVaultRoot = ({
  children,
}: {
  readonly children: (
    session: VaultSessionDto,
    observed: (session: VaultSessionDto) => void,
  ) => ReactNode;
}) => {
  const [session, setSession] = useState<VaultSessionDto | null>(null);
  const [saved, setSaved] = useState<VaultSessionDto | null>(null);
  const [phase, setPhase] = useState<"loading" | "setup" | "recovery" | "failed" | "ready">(
    "loading",
  );
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [restoreMode, setRestoreMode] = useState(false);
  const [setupPending, setSetupPending] = useState(false);
  const flow = useRef({ restore: false, setupPending: false });
  const restoreSession = useStoredVaultRestoreSession({
    api: globalThis.coredrillStorageSpike,
    ownerId: session?.vault.id ?? saved?.vault.id ?? null,
    enabled: phase !== "ready" && phase !== "loading",
  });
  const runSetup = async (work: () => Promise<ApplicationResult<unknown>>) => {
    if (flow.current.restore || flow.current.setupPending || restoreSession.pending())
      return applicationFailure({
        code: "conflict",
        retryable: false,
        message: "Finish reviewing restore before saving setup.",
      });
    flow.current.setupPending = true;
    setSetupPending(true);
    try {
      return await work();
    } finally {
      flow.current.setupPending = false;
      setSetupPending(false);
    }
  };
  const recoveryControls = (
    <section aria-label="Restore an existing vault">
      {!restoreMode ? (
        <button
          type="button"
          className="cd-button"
          disabled={setupPending}
          onClick={() => {
            if (flow.current.setupPending) return;
            flow.current.restore = true;
            setRestoreMode(true);
          }}
        >
          Restore an existing archive instead
        </button>
      ) : null}
      <div hidden={!restoreMode}>
        <h1>Restore local vault</h1>
        {restoreSession.panel(false, 2)}
        <button
          type="button"
          className="cd-button"
          disabled={restoreSession.busy || restoreSession.needsReopen}
          onClick={() => {
            void restoreSession.discard().then((discarded) => {
              if (!discarded) return;
              flow.current.restore = false;
              setRestoreMode(false);
            });
          }}
        >
          Back without restoring
        </button>
      </div>
    </section>
  );
  const committer = useMemo(
    () =>
      createFirstRunCommitter({
        runtimeKind: globalThis.coredrillStorageSpike.runtimeKind,
        getVaultApi: () => globalThis.coredrillStorageSpike.vault,
        prepareCapture: (job) =>
          prepareSuppliedCaptureDraft({
            mode: job.method === "paste" ? "paste" : "manual",
            title: job.title,
            company: job.company,
            sourceUrl: "",
            text: job.sourceText,
            file: null,
          }),
        saveCapture: (draft) => globalThis.coredrillExtensionInbox.ingestSupplied(draft),
        onVaultSaved: (value) => {
          markLocalVaultInitialized();
          setSaved(value);
        },
      }),
    [],
  );
  useEffect(() => {
    let current = true;
    // Recheck after each await; cleanup can run while a database operation is pending.
    const isCurrent = () => current;
    setPhase("loading");
    const open = async () => {
      const api = globalThis.coredrillStorageSpike.vault;
      const inspected = await api.inspect();
      if (!isCurrent()) return;
      if (!inspected.ok) {
        setMessage(inspected.error.message);
        setPhase("failed");
        return;
      }
      if (inspected.value.vault === null) {
        setPhase(expectsLocalVault() ? "recovery" : "setup");
        return;
      }
      const opened = await api.open({ vaultId: inspected.value.vault.id });
      if (!isCurrent()) return;
      if (!opened.ok) {
        setMessage(opened.error.message);
        setPhase("failed");
        return;
      }
      markLocalVaultInitialized();
      setSession(opened.value);
      setPhase("ready");
    };
    void open().catch(() => {
      if (current) {
        setMessage(
          "The local vault could not be opened. No alternate storage or account was used.",
        );
        setPhase("failed");
      }
    });
    return () => {
      current = false;
    };
  }, [attempt]);
  if (phase === "ready" && session !== null) return children(session, setSession);
  if (phase === "loading")
    return (
      <main className="cd-first-run">
        <p role="status">Opening the local vault…</p>
      </main>
    );
  if (phase === "failed" || phase === "recovery")
    return (
      <main className="cd-first-run" aria-labelledby="vault-startup-heading">
        <h1 id="vault-startup-heading">
          {phase === "recovery" ? "Review local vault recovery" : "Local vault unavailable"}
        </h1>
        <p role="alert">
          {phase === "recovery"
            ? "This profile previously initialized a vault, but no vault identity was found. Check the same device, browser profile and origin before creating a replacement. Existing records, if present, have not been discarded. You can review a complete portable archive below."
            : message}
        </p>
        <button
          type="button"
          className="cd-button"
          disabled={restoreMode}
          onClick={() => {
            setAttempt((value) => value + 1);
          }}
        >
          Retry local vault
        </button>
        {phase === "recovery" ? (
          <button
            type="button"
            className="cd-button"
            disabled={restoreMode}
            onClick={() => {
              setPhase("setup");
            }}
          >
            Review setup without discarding existing records
          </button>
        ) : null}
        {recoveryControls}
      </main>
    );
  return (
    <main>
      <div hidden={restoreMode}>
        <FirstRunExperience
          productionMode
          initialRuntime={
            globalThis.coredrillStorageSpike.runtimeKind === "native" ? "desktop" : "browser"
          }
          {...(saved === null ? {} : { savedVaultName: saved.vault.name })}
          onCommit={(input) => runSetup(() => committer.complete(input))}
          onCommitSkip={() => runSetup(committer.skip)}
          onNavigate={() => {
            if (saved === null || flow.current.restore) return;
            history.replaceState(null, "", "/");
            setSession(saved);
            setPhase("ready");
          }}
        />
      </div>
      {recoveryControls}
    </main>
  );
};
