import { useId, useState, type SyntheticEvent } from "react";

import { Icon, type UiIconName } from "./icon.js";

export const FIRST_RUN_TRACKS = Object.freeze(["quick", "guided"] as const);
export type FirstRunTrack = (typeof FIRST_RUN_TRACKS)[number];

export const FIRST_RUN_RUNTIME_KINDS = Object.freeze(["browser", "desktop"] as const);
export type FirstRunRuntimeKind = (typeof FIRST_RUN_RUNTIME_KINDS)[number];

export const FIRST_JOB_METHODS = Object.freeze(["manual", "paste", "capture"] as const);
export type FirstJobMethod = (typeof FIRST_JOB_METHODS)[number];

export const FIRST_RUN_AI_MODES = Object.freeze(["disabled", "local", "byok"] as const);
export type FirstRunAiMode = (typeof FIRST_RUN_AI_MODES)[number];

export const GUIDED_SETUP_STEPS = Object.freeze([
  "device-scope",
  "vault-and-backup",
  "imports",
  "evidence-review",
  "ai-mode",
  "extension",
] as const);
export type GuidedSetupStep = (typeof GUIDED_SETUP_STEPS)[number];

export const SAFE_DEFAULT_VAULT_NAME = "My job search";

export const DISPOSABLE_DEMO_VAULT = Object.freeze({
  kind: "demo",
  lifetime: "session",
  isolatedFromUserVault: true,
  sampleData: "synthetic-v1",
  sampleJobCount: 3,
} as const);

export interface FirstJobDraft {
  readonly company: string;
  readonly method: FirstJobMethod;
  readonly sourceText: string;
  readonly title: string;
}

interface CompletionBase {
  readonly runtime: FirstRunRuntimeKind;
  readonly vaultName: string;
}

export interface QuickStartCompletion extends CompletionBase {
  readonly destination: "job-overview";
  readonly firstJob: FirstJobDraft;
  readonly track: "quick";
}

export interface GuidedSetupCompletion extends CompletionBase {
  readonly aiMode: FirstRunAiMode;
  readonly backup: "configure-now" | "remind-later";
  readonly destination: "home";
  readonly extension: "pair" | "later";
  readonly imports: readonly ("resume" | "tracker")[];
  readonly optionalLock: boolean;
  readonly track: "guided";
}

export type FirstRunCompletion = QuickStartCompletion | GuidedSetupCompletion;
export type DisposableDemoVaultRequest = typeof DISPOSABLE_DEMO_VAULT;

export interface FirstRunExperienceProps {
  readonly initialRuntime?: FirstRunRuntimeKind;
  readonly onComplete?: (completion: FirstRunCompletion) => void;
  readonly onDiscardDemoVault?: () => void;
  readonly onNavigate?: (destination: FirstRunCompletion["destination"]) => void;
  readonly onOpenDemoVault?: (request: DisposableDemoVaultRequest) => void;
  readonly onSkip?: () => void;
}

type FirstRunScreen = "chooser" | "complete" | "demo" | "guided" | "quick";

const TRACK_DETAILS = Object.freeze([
  {
    id: "quick",
    title: "Quick start",
    description:
      "Create a local vault and add one job now. Bring in your profile only when it helps.",
    icon: "briefcase",
    time: "About 2 minutes",
  },
  {
    id: "guided",
    title: "Guided setup",
    description: "Review device scope, backup, optional imports, AI mode, and extension pairing.",
    icon: "settings",
    time: "About 8 minutes · every step is skippable",
  },
] as const satisfies readonly {
  readonly description: string;
  readonly icon: UiIconName;
  readonly id: FirstRunTrack;
  readonly time: string;
  readonly title: string;
}[]);

const GUIDED_STEP_LABELS: Readonly<Record<GuidedSetupStep, string>> = Object.freeze({
  "device-scope": "Device scope",
  "vault-and-backup": "Vault & backup",
  imports: "Optional imports",
  "evidence-review": "Evidence review",
  "ai-mode": "AI mode",
  extension: "Extension",
});

const trimRequired = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};

const ChoiceCard = ({
  checked,
  description,
  groupName,
  label,
  onChange,
  value,
}: {
  readonly checked: boolean;
  readonly description: string;
  readonly groupName: string;
  readonly label: string;
  readonly onChange: () => void;
  readonly value: string;
}) => (
  <label className="cd-first-run-choice">
    <input checked={checked} name={groupName} onChange={onChange} type="radio" value={value} />
    <span>
      <strong>{label}</strong>
      <small>{description}</small>
    </span>
  </label>
);

const Progress = ({
  current,
  labels,
}: {
  readonly current: number;
  readonly labels: readonly string[];
}) => (
  <ol aria-label="Setup progress" className="cd-first-run-progress">
    {labels.map((label, index) => (
      <li
        aria-current={index === current ? "step" : undefined}
        data-complete={index < current}
        key={label}
      >
        <span aria-hidden="true">
          {index < current ? <Icon decorative name="check" size={14} /> : index + 1}
        </span>
        <small>{label}</small>
      </li>
    ))}
  </ol>
);

export const FirstRunExperience = ({
  initialRuntime = "browser",
  onComplete,
  onDiscardDemoVault,
  onNavigate,
  onOpenDemoVault,
  onSkip,
}: FirstRunExperienceProps) => {
  const [screen, setScreen] = useState<FirstRunScreen>("chooser");
  const [completion, setCompletion] = useState<FirstRunCompletion | null>(null);
  const [quickStep, setQuickStep] = useState(0);
  const [guidedStep, setGuidedStep] = useState(0);
  const [runtime, setRuntime] = useState<FirstRunRuntimeKind>(initialRuntime);
  const [vaultName, setVaultName] = useState(SAFE_DEFAULT_VAULT_NAME);
  const [firstJobMethod, setFirstJobMethod] = useState<FirstJobMethod>("manual");
  const [jobTitle, setJobTitle] = useState("");
  const [jobCompany, setJobCompany] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [quickError, setQuickError] = useState<string | null>(null);
  const [backup, setBackup] = useState<"configure-now" | "remind-later">("remind-later");
  const [optionalLock, setOptionalLock] = useState(false);
  const [imports, setImports] = useState<readonly ("resume" | "tracker")[]>([]);
  const [aiMode, setAiMode] = useState<FirstRunAiMode>("disabled");
  const [extension, setExtension] = useState<"pair" | "later">("later");
  const headingId = useId();

  const finish = (result: FirstRunCompletion): void => {
    setCompletion(result);
    setScreen("complete");
    onComplete?.(result);
  };

  const skipToHome = (): void => {
    onSkip?.();
    setCompletion(null);
    setScreen("complete");
  };

  const startTrack = (track: FirstRunTrack): void => {
    setQuickError(null);
    if (track === "quick") {
      setQuickStep(0);
      setScreen("quick");
    } else {
      setGuidedStep(0);
      setScreen("guided");
    }
  };

  const openDemo = (): void => {
    onOpenDemoVault?.(DISPOSABLE_DEMO_VAULT);
    setScreen("demo");
  };

  const discardDemo = (next: "chooser" | "quick" = "chooser"): void => {
    onDiscardDemoVault?.();
    if (next === "quick") {
      startTrack("quick");
    } else {
      setScreen("chooser");
    }
  };

  const submitQuickVault = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (trimRequired(vaultName) === null) {
      setQuickError("Give this local vault a name.");
      return;
    }
    setQuickError(null);
    setQuickStep(1);
  };

  const submitFirstJob = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (trimRequired(jobTitle) === null || trimRequired(jobCompany) === null) {
      setQuickError("Add a job title and company so you can review the record.");
      return;
    }
    if (firstJobMethod === "paste" && sourceText.trim().length < 20) {
      setQuickError("Paste at least 20 characters from the listing, or choose manual entry.");
      return;
    }
    setQuickError(null);
    setQuickStep(2);
  };

  const finishQuick = (): void => {
    const normalizedVaultName = trimRequired(vaultName);
    const normalizedTitle = trimRequired(jobTitle);
    const normalizedCompany = trimRequired(jobCompany);
    if (normalizedVaultName === null || normalizedTitle === null || normalizedCompany === null)
      return;
    finish(
      Object.freeze({
        destination: "job-overview",
        firstJob: Object.freeze({
          company: normalizedCompany,
          method: firstJobMethod,
          sourceText: firstJobMethod === "paste" ? sourceText.trim() : "",
          title: normalizedTitle,
        }),
        runtime,
        track: "quick",
        vaultName: normalizedVaultName,
      }),
    );
  };

  const finishGuided = (): void => {
    finish(
      Object.freeze({
        aiMode,
        backup,
        destination: "home",
        extension,
        imports: Object.freeze([...imports]),
        optionalLock,
        runtime,
        track: "guided",
        vaultName: trimRequired(vaultName) ?? SAFE_DEFAULT_VAULT_NAME,
      }),
    );
  };

  const toggleImport = (kind: "resume" | "tracker"): void => {
    setImports((current) =>
      current.includes(kind)
        ? current.filter((value) => value !== kind)
        : Object.freeze([...current, kind]),
    );
  };

  if (screen === "demo") {
    return (
      <section
        aria-labelledby={headingId}
        className="cd-first-run cd-demo-vault"
        data-vault-kind="demo"
      >
        <header className="cd-first-run-topbar">
          <span className="cd-first-run-brand">Coredrill</span>
          <span className="cd-first-run-local">
            <Icon decorative name="database" size={16} />
            Local demo · session only
          </span>
        </header>
        <div className="cd-demo-vault-banner">
          <Icon decorative name="info" size={20} />
          <span>
            <strong>Disposable demo vault</strong> This synthetic sample is separate from your vault
            and disappears when you discard it.
          </span>
        </div>
        <div className="cd-first-run-panel cd-demo-vault-panel">
          <div className="cd-first-run-heading">
            <p className="cd-eyebrow">Explore without setup</p>
            <h1 id={headingId}>A small, synthetic job search</h1>
            <p>
              Try the workspace with fictional records. Nothing here is copied into your own vault.
            </p>
          </div>
          <div className="cd-demo-job-grid" aria-label="Synthetic demo jobs">
            {[
              ["Northstar Health", "Product Operations Lead", "Interview"],
              ["Canvas Works", "Customer Insights Manager", "Preparing"],
              ["Juniper Field", "Program Manager", "Saved"],
            ].map(([company, title, status]) => (
              <article className="cd-demo-job" key={company}>
                <span>{status}</span>
                <strong>{title}</strong>
                <small>{company}</small>
              </article>
            ))}
          </div>
          <div className="cd-first-run-actions">
            <button
              className="cd-button cd-button-primary"
              onClick={() => {
                discardDemo("quick");
              }}
              type="button"
            >
              Start with my own vault
            </button>
            <button
              className="cd-button cd-button-secondary"
              onClick={() => {
                discardDemo();
              }}
              type="button"
            >
              Discard demo and return
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (screen === "complete") {
    const destination = completion?.destination ?? "home";
    return (
      <section
        aria-labelledby={headingId}
        className="cd-first-run cd-first-run-complete"
        data-destination={destination}
      >
        <div className="cd-first-run-panel">
          <span className="cd-first-run-success" aria-hidden="true">
            <Icon decorative name="check" size={28} />
          </span>
          <div className="cd-first-run-heading">
            <p className="cd-eyebrow">Setup saved locally</p>
            <h1 id={headingId}>
              {destination === "job-overview"
                ? "Your first job is ready"
                : "Your workspace is ready"}
            </h1>
            <p>
              {destination === "job-overview"
                ? "Continue to the job Overview to review details and choose the next action."
                : "Continue to Home. You can finish every skipped option later in Settings."}
            </p>
          </div>
          {completion?.track === "quick" ? (
            <div className="cd-first-run-summary">
              <span>First job</span>
              <strong>{completion.firstJob.title}</strong>
              <small>{completion.firstJob.company}</small>
            </div>
          ) : null}
          <a
            className="cd-button cd-button-primary"
            href={destination === "job-overview" ? "/pipeline/jobs/first/overview" : "/"}
            onClick={(event) => {
              if (onNavigate !== undefined) {
                event.preventDefault();
                onNavigate(destination);
              }
            }}
          >
            {destination === "job-overview" ? "Open job overview" : "Go to Home"}
            <Icon decorative name="chevron-right" size={18} />
          </a>
        </div>
      </section>
    );
  }

  if (screen === "chooser") {
    return (
      <section aria-labelledby={headingId} className="cd-first-run cd-first-run-chooser">
        <header className="cd-first-run-topbar">
          <span className="cd-first-run-brand">Coredrill</span>
          <span className="cd-first-run-local">
            <Icon decorative name="database" size={16} />
            No account · local first
          </span>
        </header>
        <div className="cd-first-run-panel">
          <div className="cd-first-run-heading">
            <p className="cd-eyebrow">Welcome to your job workspace</p>
            <h1 id={headingId}>Start with one job, or set up the whole workspace</h1>
            <p>
              Your vault lives on this device. Coredrill remains useful offline, and AI stays
              disabled unless you choose otherwise.
            </p>
          </div>
          <div className="cd-first-run-track-grid">
            {TRACK_DETAILS.map((track) => (
              <button
                className="cd-first-run-track"
                key={track.id}
                onClick={() => {
                  startTrack(track.id);
                }}
                type="button"
              >
                <span className="cd-first-run-track-icon">
                  <Icon decorative name={track.icon} size={22} />
                </span>
                <span>
                  <strong>{track.title}</strong>
                  <small>{track.description}</small>
                  <em>{track.time}</em>
                </span>
                <Icon decorative name="chevron-right" size={20} />
              </button>
            ))}
          </div>
          <div className="cd-first-run-demo-callout">
            <span>
              <strong>Want to look around first?</strong>
              <small>Open three fictional jobs in a separate disposable demo vault.</small>
            </span>
            <button className="cd-button cd-button-secondary" onClick={openDemo} type="button">
              Explore demo
            </button>
          </div>
          <button className="cd-text-button" onClick={skipToHome} type="button">
            Skip setup and go to Home
          </button>
        </div>
      </section>
    );
  }

  if (screen === "quick") {
    return (
      <section aria-labelledby={headingId} className="cd-first-run">
        <header className="cd-first-run-topbar">
          <button
            className="cd-text-button"
            onClick={() => {
              setScreen("chooser");
            }}
            type="button"
          >
            ← Choose a different path
          </button>
          <span className="cd-first-run-local">
            <Icon decorative name="database" size={16} />
            Local quick start
          </span>
        </header>
        <div className="cd-first-run-panel">
          <Progress current={quickStep} labels={["Local storage", "First job", "Review"]} />
          {quickStep === 0 ? (
            <form onSubmit={submitQuickVault}>
              <div className="cd-first-run-heading">
                <p className="cd-eyebrow">Quick start · 1 of 3</p>
                <h1 id={headingId}>Your vault stays on this device</h1>
                <p>
                  {runtime === "browser"
                    ? "This browser profile holds your local workspace. Export backups regularly so profile cleanup cannot take your only copy."
                    : "The desktop app stores the vault in its private app-data directory. You choose every backup destination."}
                </p>
              </div>
              <div className="cd-local-storage-card">
                <Icon decorative name="hard-drive-download" size={24} />
                <span>
                  <strong>No account or remote database</strong>
                  <small>
                    AI is off. Network features remain off until you explicitly configure one.
                  </small>
                </span>
              </div>
              <label className="cd-first-run-field">
                <span>Vault name</span>
                <input
                  autoComplete="off"
                  maxLength={80}
                  onChange={(event) => {
                    setVaultName(event.target.value);
                  }}
                  value={vaultName}
                />
              </label>
              {quickError === null ? null : (
                <p className="cd-field-error" role="alert">
                  {quickError}
                </p>
              )}
              <div className="cd-first-run-actions">
                <button className="cd-button cd-button-primary" type="submit">
                  Create with safe defaults
                  <Icon decorative name="chevron-right" size={18} />
                </button>
                <button className="cd-text-button" onClick={skipToHome} type="button">
                  Finish later
                </button>
              </div>
            </form>
          ) : null}
          {quickStep === 1 ? (
            <form onSubmit={submitFirstJob}>
              <div className="cd-first-run-heading">
                <p className="cd-eyebrow">Quick start · 2 of 3</p>
                <h1 id={headingId}>Add the first opportunity</h1>
                <p>
                  Start manually, paste a listing for later review, or record a user-invoked
                  capture. Nothing is submitted to an employer.
                </p>
              </div>
              <fieldset className="cd-segmented-field">
                <legend>How are you adding it?</legend>
                <div>
                  {FIRST_JOB_METHODS.map((method) => (
                    <label key={method}>
                      <input
                        checked={firstJobMethod === method}
                        name="first-job-method"
                        onChange={() => {
                          setFirstJobMethod(method);
                          setQuickError(null);
                        }}
                        type="radio"
                        value={method}
                      />
                      <span>
                        {method === "manual"
                          ? "Add manually"
                          : method === "paste"
                            ? "Paste listing"
                            : "Capture"}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              {firstJobMethod === "paste" ? (
                <label className="cd-first-run-field">
                  <span>Listing text</span>
                  <textarea
                    onChange={(event) => {
                      setSourceText(event.target.value);
                    }}
                    placeholder="Paste text from a job listing. It stays local."
                    rows={5}
                    value={sourceText}
                  />
                </label>
              ) : null}
              {firstJobMethod === "capture" ? (
                <div className="cd-inline-notice">
                  <Icon decorative name="info" size={18} />
                  <span>
                    <strong>Capture remains user-invoked</strong>
                    <small>Pairing can wait. For now, review the title and company manually.</small>
                  </span>
                </div>
              ) : null}
              <div className="cd-field-grid">
                <label className="cd-first-run-field">
                  <span>Job title</span>
                  <input
                    autoComplete="organization-title"
                    maxLength={160}
                    onChange={(event) => {
                      setJobTitle(event.target.value);
                    }}
                    value={jobTitle}
                  />
                </label>
                <label className="cd-first-run-field">
                  <span>Company</span>
                  <input
                    autoComplete="organization"
                    maxLength={160}
                    onChange={(event) => {
                      setJobCompany(event.target.value);
                    }}
                    value={jobCompany}
                  />
                </label>
              </div>
              {quickError === null ? null : (
                <p className="cd-field-error" role="alert">
                  {quickError}
                </p>
              )}
              <div className="cd-first-run-actions">
                <button className="cd-button cd-button-primary" type="submit">
                  Review job
                  <Icon decorative name="chevron-right" size={18} />
                </button>
                <button
                  className="cd-button cd-button-secondary"
                  onClick={() => {
                    setQuickStep(0);
                  }}
                  type="button"
                >
                  Back
                </button>
              </div>
            </form>
          ) : null}
          {quickStep === 2 ? (
            <div>
              <div className="cd-first-run-heading">
                <p className="cd-eyebrow">Quick start · 3 of 3</p>
                <h1 id={headingId}>Review before saving</h1>
                <p>
                  User-entered values are treated as confirmed. Pasted or captured source remains a
                  proposal until you review it.
                </p>
              </div>
              <dl className="cd-review-list">
                <div>
                  <dt>Vault</dt>
                  <dd>{vaultName.trim()}</dd>
                </div>
                <div>
                  <dt>Job</dt>
                  <dd>{jobTitle.trim()}</dd>
                </div>
                <div>
                  <dt>Company</dt>
                  <dd>{jobCompany.trim()}</dd>
                </div>
                <div>
                  <dt>Method</dt>
                  <dd>
                    {firstJobMethod === "manual"
                      ? "Manual · confirmed"
                      : `${firstJobMethod} · source retained for review`}
                  </dd>
                </div>
              </dl>
              <div className="cd-inline-notice">
                <Icon decorative name="info" size={18} />
                <span>
                  <strong>Career Profile can wait</strong>
                  <small>
                    Coredrill asks for a resume or evidence only when you first compare a role or
                    draft a document.
                  </small>
                </span>
              </div>
              <div className="cd-first-run-actions">
                <button className="cd-button cd-button-primary" onClick={finishQuick} type="button">
                  Create vault and open job overview
                </button>
                <button
                  className="cd-button cd-button-secondary"
                  onClick={() => {
                    setQuickStep(1);
                  }}
                  type="button"
                >
                  Edit
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    );
  }

  const stepId = GUIDED_SETUP_STEPS[guidedStep] ?? "device-scope";
  const nextGuidedStep = (): void => {
    if (guidedStep < GUIDED_SETUP_STEPS.length - 1) setGuidedStep((current) => current + 1);
  };

  return (
    <section aria-labelledby={headingId} className="cd-first-run">
      <header className="cd-first-run-topbar">
        <button
          className="cd-text-button"
          onClick={() => {
            setScreen("chooser");
          }}
          type="button"
        >
          ← Choose a different path
        </button>
        <span className="cd-first-run-local">
          <Icon decorative name="database" size={16} />
          Local guided setup
        </span>
      </header>
      <div className="cd-first-run-panel cd-guided-panel">
        <Progress
          current={guidedStep}
          labels={GUIDED_SETUP_STEPS.map((step) => GUIDED_STEP_LABELS[step])}
        />
        <div className="cd-first-run-heading">
          <p className="cd-eyebrow">
            Guided setup · {guidedStep + 1} of {GUIDED_SETUP_STEPS.length}
          </p>
          <h1 id={headingId}>{GUIDED_STEP_LABELS[stepId]}</h1>
        </div>
        {stepId === "device-scope" ? (
          <fieldset className="cd-choice-fieldset">
            <legend>Where will this vault live?</legend>
            <ChoiceCard
              checked={runtime === "browser"}
              description="Fast local setup in this browser profile. Export backups protect against profile cleanup."
              groupName="guided-runtime"
              label="Browser on this device"
              onChange={() => {
                setRuntime("browser");
              }}
              value="browser"
            />
            <ChoiceCard
              checked={runtime === "desktop"}
              description="Private app-data storage with native file pickers and optional device lock."
              groupName="guided-runtime"
              label="Desktop app on this device"
              onChange={() => {
                setRuntime("desktop");
              }}
              value="desktop"
            />
          </fieldset>
        ) : null}
        {stepId === "vault-and-backup" ? (
          <div className="cd-first-run-stack">
            <label className="cd-first-run-field">
              <span>Vault name</span>
              <input
                maxLength={80}
                onChange={(event) => {
                  setVaultName(event.target.value);
                }}
                value={vaultName}
              />
            </label>
            <label className="cd-check-choice">
              <input
                checked={optionalLock}
                onChange={(event) => {
                  setOptionalLock(event.target.checked);
                }}
                type="checkbox"
              />
              <span>
                <strong>Ask for device unlock when supported</strong>
                <small>No password or recovery key is collected on this screen.</small>
              </span>
            </label>
            <fieldset className="cd-choice-fieldset">
              <legend>Backup reminder</legend>
              <ChoiceCard
                checked={backup === "configure-now"}
                description="Choose a destination after the vault is created."
                groupName="guided-backup"
                label="Configure a backup now"
                onChange={() => {
                  setBackup("configure-now");
                }}
                value="configure-now"
              />
              <ChoiceCard
                checked={backup === "remind-later"}
                description="Keep a visible reminder until a fresh export exists."
                groupName="guided-backup"
                label="Remind me later"
                onChange={() => {
                  setBackup("remind-later");
                }}
                value="remind-later"
              />
            </fieldset>
          </div>
        ) : null}
        {stepId === "imports" ? (
          <div className="cd-first-run-stack">
            <p className="cd-step-copy">
              Imports are optional and local. Files become reviewable proposals; they never silently
              overwrite confirmed values.
            </p>
            <label className="cd-check-choice">
              <input
                checked={imports.includes("resume")}
                onChange={() => {
                  toggleImport("resume");
                }}
                type="checkbox"
              />
              <span>
                <strong>Import a resume later</strong>
                <small>DOCX, text PDF, Markdown, or plain text.</small>
              </span>
            </label>
            <label className="cd-check-choice">
              <input
                checked={imports.includes("tracker")}
                onChange={() => {
                  toggleImport("tracker");
                }}
                type="checkbox"
              />
              <span>
                <strong>Import an existing tracker later</strong>
                <small>Mapping and duplicate review happen before any commit.</small>
              </span>
            </label>
            <div className="cd-inline-notice">
              <Icon decorative name="info" size={18} />
              <span>
                <strong>No file leaves this device</strong>
                <small>This setup records intent only; the import review opens after setup.</small>
              </span>
            </div>
          </div>
        ) : null}
        {stepId === "evidence-review" ? (
          <div className="cd-first-run-stack">
            <p className="cd-step-copy">
              {imports.length === 0
                ? "No imports selected. You can build the Career Profile later when a comparison or draft needs it."
                : `${String(imports.length)} import ${imports.length === 1 ? "source is" : "sources are"} queued for a separate review.`}
            </p>
            <div className="cd-local-storage-card">
              <Icon decorative name="check" size={22} />
              <span>
                <strong>Proposals remain unconfirmed</strong>
                <small>
                  Every imported field keeps its source. You decide what becomes confirmed evidence.
                </small>
              </span>
            </div>
          </div>
        ) : null}
        {stepId === "ai-mode" ? (
          <fieldset className="cd-choice-fieldset">
            <legend>Choose the default assistance mode</legend>
            <ChoiceCard
              checked={aiMode === "disabled"}
              description="Recommended baseline. Tracking, search, documents, and exports remain available."
              groupName="guided-ai"
              label="AI disabled"
              onChange={() => {
                setAiMode("disabled");
              }}
              value="disabled"
            />
            <ChoiceCard
              checked={aiMode === "local"}
              description="Use a reviewed local model only after it is installed and selected."
              groupName="guided-ai"
              label="Local model later"
              onChange={() => {
                setAiMode("local");
              }}
              value="local"
            />
            <ChoiceCard
              checked={aiMode === "byok"}
              description="Configure a provider and review destination/data categories in Settings first."
              groupName="guided-ai"
              label="Bring your own key later"
              onChange={() => {
                setAiMode("byok");
              }}
              value="byok"
            />
            <div className="cd-inline-notice">
              <Icon decorative name="cloud-off" size={18} />
              <span>
                <strong>Nothing is sent now</strong>
                <small>
                  Local setup never tests a provider, stores a key, or uploads career data.
                </small>
              </span>
            </div>
          </fieldset>
        ) : null}
        {stepId === "extension" ? (
          <div className="cd-first-run-stack">
            <fieldset className="cd-choice-fieldset">
              <legend>Browser capture</legend>
              <ChoiceCard
                checked={extension === "later"}
                description="Use manual entry and paste now. Pair from Settings whenever useful."
                groupName="guided-extension"
                label="Pair later"
                onChange={() => {
                  setExtension("later");
                }}
                value="later"
              />
              <ChoiceCard
                checked={extension === "pair"}
                description="Open the reviewed pairing flow after Home; no blanket host permission is requested."
                groupName="guided-extension"
                label="Pair after setup"
                onChange={() => {
                  setExtension("pair");
                }}
                value="pair"
              />
            </fieldset>
            <dl className="cd-review-list">
              <div>
                <dt>Vault</dt>
                <dd>{vaultName.trim() || SAFE_DEFAULT_VAULT_NAME}</dd>
              </div>
              <div>
                <dt>Scope</dt>
                <dd>{runtime === "browser" ? "This browser profile" : "Desktop app data"}</dd>
              </div>
              <div>
                <dt>AI</dt>
                <dd>{aiMode === "disabled" ? "Disabled" : `${aiMode} · configure later`}</dd>
              </div>
              <div>
                <dt>Imports</dt>
                <dd>
                  {imports.length === 0 ? "None" : `${String(imports.length)} queued for review`}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}
        <div className="cd-first-run-actions">
          {stepId === "extension" ? (
            <button className="cd-button cd-button-primary" onClick={finishGuided} type="button">
              Finish and go to Home
            </button>
          ) : (
            <button className="cd-button cd-button-primary" onClick={nextGuidedStep} type="button">
              Continue
              <Icon decorative name="chevron-right" size={18} />
            </button>
          )}
          {guidedStep > 0 ? (
            <button
              className="cd-button cd-button-secondary"
              onClick={() => {
                setGuidedStep((current) => Math.max(0, current - 1));
              }}
              type="button"
            >
              Back
            </button>
          ) : null}
          <button
            className="cd-text-button"
            onClick={stepId === "extension" ? finishGuided : nextGuidedStep}
            type="button"
          >
            {stepId === "extension" ? "Use safe defaults" : "Skip this step"}
          </button>
          <button className="cd-text-button" onClick={skipToHome} type="button">
            Finish later
          </button>
        </div>
      </div>
    </section>
  );
};
