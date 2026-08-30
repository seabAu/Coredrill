import type { Phase1CanonicalJourneyProof } from "@coredrill/storage-core";
import { useEffect, useState } from "react";

export type CanonicalJourneyPanelStatus = "failed" | "idle" | "passed" | "running";

export interface CanonicalJourneyPanelState {
  readonly status: CanonicalJourneyPanelStatus;
  readonly proof: Phase1CanonicalJourneyProof | null;
}

interface CanonicalJourneyPanelApi {
  getState(): CanonicalJourneyPanelState;
}

declare global {
  var coredrillCanonicalJourney: CanonicalJourneyPanelApi | undefined;
}

const EMPTY_STATE: CanonicalJourneyPanelState = Object.freeze({ status: "idle", proof: null });

export const CanonicalJourneyPanel = () => {
  const [state, setState] = useState<CanonicalJourneyPanelState>(EMPTY_STATE);

  useEffect(() => {
    globalThis.coredrillCanonicalJourney = Object.freeze({
      getState: () => state,
    });
  }, [state]);

  const runJourney = (): void => {
    setState(Object.freeze({ status: "running", proof: null }));
    void globalThis.coredrillStorageSpike
      .runPhase1CanonicalJourney()
      .then((proof) => {
        setState(Object.freeze({ status: "passed", proof }));
      })
      .catch(() => {
        setState(Object.freeze({ status: "failed", proof: null }));
      });
  };

  return (
    <section className="cd-canonical-journey cd-shell-page-card" aria-labelledby="journey-heading">
      <div className="cd-canonical-journey__intro">
        <div>
          <p className="cd-canonical-journey__eyebrow">Phase 1 recovery loop</p>
          <h2 id="journey-heading">Run the complete local job journey</h2>
          <p>
            Coredrill will create a disposable local vault, add one job, move it through the
            Pipeline, schedule an interview and follow-up, export it, delete the app-managed vault,
            and restore the verified archive.
          </p>
        </div>
        <div className="cd-canonical-journey__boundaries" aria-label="Journey boundaries">
          <span>No account</span>
          <span>No network</span>
          <span>AI disabled</span>
        </div>
      </div>

      <div className="cd-canonical-journey__action">
        <button
          className="cd-button cd-button-primary"
          disabled={state.status === "running"}
          onClick={runJourney}
          type="button"
        >
          {state.status === "running" ? "Running local journey…" : "Run local journey"}
        </button>
        <p aria-live="polite" role="status">
          {state.status === "idle"
            ? "Ready. The rehearsal replaces only its disposable local proof vault."
            : state.status === "running"
              ? "Writing and verifying the local SQLite workflow. Keep this window open."
              : state.status === "failed"
                ? "The local journey stopped safely. No successful proof was recorded."
                : "Canonical journey passed and the restored records match the exported archive."}
        </p>
      </div>

      {state.proof === null ? null : (
        <div className="cd-canonical-journey__proof" data-testid="canonical-journey-proof">
          <ol aria-label="Canonical journey proof steps">
            {state.proof.steps.map((proofStep) => (
              <li key={proofStep.id}>
                <span aria-hidden="true">✓</span>
                <div>
                  <strong>{proofStep.id.replaceAll("_", " ")}</strong>
                  <p>{proofStep.summary}</p>
                </div>
              </li>
            ))}
          </ol>
          <dl>
            <div>
              <dt>Runtime</dt>
              <dd>{state.proof.adapterName}</dd>
            </div>
            <div>
              <dt>Final stage</dt>
              <dd>{state.proof.finalStage}</dd>
            </div>
            <div>
              <dt>Archive SHA-256</dt>
              <dd>{state.proof.archiveSha256}</dd>
            </div>
            <div>
              <dt>Restored content SHA-256</dt>
              <dd>{state.proof.contentSha256AfterRestore}</dd>
            </div>
          </dl>
        </div>
      )}
    </section>
  );
};
