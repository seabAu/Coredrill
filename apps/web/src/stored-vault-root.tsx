import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FirstRunExperience } from "@coredrill/ui";
import type { VaultSessionDto } from "@coredrill/application";
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
            ? "This profile previously initialized a vault, but no vault identity was found. Check the same device, browser profile and origin before creating a replacement. Existing records, if present, have not been discarded. Restore controls are not connected to this view yet."
            : message}
        </p>
        <button
          type="button"
          className="cd-button"
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
            onClick={() => {
              setPhase("setup");
            }}
          >
            Review setup without discarding existing records
          </button>
        ) : null}
      </main>
    );
  return (
    <main>
      <FirstRunExperience
        productionMode
        initialRuntime={
          globalThis.coredrillStorageSpike.runtimeKind === "native" ? "desktop" : "browser"
        }
        {...(saved === null ? {} : { savedVaultName: saved.vault.name })}
        onCommit={committer.complete}
        onCommitSkip={committer.skip}
        onNavigate={() => {
          if (saved === null) return;
          history.replaceState(null, "", "/");
          setSession(saved);
          setPhase("ready");
        }}
      />
    </main>
  );
};
