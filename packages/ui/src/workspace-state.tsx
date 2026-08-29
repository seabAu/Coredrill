import { useId } from "react";

import { Icon, type UiIconName } from "./icon.js";

export const PHASE_ONE_WORKSPACE_STATE_KINDS = Object.freeze([
  "loading",
  "empty",
  "partial",
  "error",
  "offline",
  "permission-denied",
] as const);
export type PhaseOneWorkspaceStateKind = (typeof PHASE_ONE_WORKSPACE_STATE_KINDS)[number];

export const PHASE_ONE_WORKSPACE_SURFACES = Object.freeze([
  "home",
  "pipeline",
  "job-workspace",
  "documents",
  "career-profile",
  "network",
  "insights",
  "settings",
] as const);
export type PhaseOneWorkspaceSurface = (typeof PHASE_ONE_WORKSPACE_SURFACES)[number];

export const PHASE_ONE_WORKSPACE_STATE_ACTION_IDS = Object.freeze([
  "cancel",
  "add-job",
  "import-tracker",
  "retry",
  "copy-diagnostics",
  "export-fallback",
  "manual-path",
  "continue-locally",
  "review-queued",
  "request-permission",
] as const);
export type PhaseOneWorkspaceStateActionId = (typeof PHASE_ONE_WORKSPACE_STATE_ACTION_IDS)[number];

export interface PhaseOneWorkspaceStateAction {
  readonly emphasis: "primary" | "secondary";
  readonly id: PhaseOneWorkspaceStateActionId;
  readonly label: string;
}

export interface PhaseOneWorkspaceStateProgress {
  readonly current: number;
  readonly label: string;
  readonly total: number;
}

export interface PhaseOneWorkspaceStatePermission {
  readonly exactAccess: string;
  readonly reason: string;
}

export interface PhaseOneWorkspaceStateModel {
  readonly actions: readonly PhaseOneWorkspaceStateAction[];
  readonly available: readonly string[];
  readonly description: string;
  readonly kind: PhaseOneWorkspaceStateKind;
  readonly localStatus: string;
  readonly permission?: PhaseOneWorkspaceStatePermission;
  readonly progress?: PhaseOneWorkspaceStateProgress;
  readonly title: string;
  readonly unavailable: readonly string[];
  readonly workStatus: string;
}

export interface PhaseOneWorkspaceStateCatalogEntry extends PhaseOneWorkspaceStateModel {
  readonly appliesTo: readonly PhaseOneWorkspaceSurface[];
}

export interface PhaseOneWorkspaceStateProps {
  readonly model: PhaseOneWorkspaceStateModel;
  readonly onAction?: (action: PhaseOneWorkspaceStateAction) => void;
}

const MAX_TEXT_LENGTH = 240;
const STATE_ACTION_EMPHASES = Object.freeze(["primary", "secondary"] as const);

const isBoundedText = (value: unknown, maximum = MAX_TEXT_LENGTH): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= maximum;

const hasAction = (
  model: PhaseOneWorkspaceStateModel,
  id: PhaseOneWorkspaceStateActionId,
): boolean => model.actions.some((action) => action.id === id);

const hasAnyAction = (
  model: PhaseOneWorkspaceStateModel,
  ids: readonly PhaseOneWorkspaceStateActionId[],
): boolean => ids.some((id) => hasAction(model, id));

export const assertPhaseOneWorkspaceStateModel = (model: PhaseOneWorkspaceStateModel): void => {
  if (!PHASE_ONE_WORKSPACE_STATE_KINDS.includes(model.kind)) {
    throw new RangeError("Phase 1 workspace state kind is unsupported.");
  }
  if (
    !isBoundedText(model.title, 96) ||
    !isBoundedText(model.description) ||
    !isBoundedText(model.localStatus) ||
    !isBoundedText(model.workStatus)
  ) {
    throw new RangeError("Phase 1 workspace state copy is invalid.");
  }
  if (
    model.actions.length === 0 ||
    model.actions.length > 4 ||
    new Set(model.actions.map(({ id }) => id)).size !== model.actions.length ||
    model.actions.some(
      ({ emphasis, id, label }) =>
        !PHASE_ONE_WORKSPACE_STATE_ACTION_IDS.includes(id) ||
        !STATE_ACTION_EMPHASES.includes(emphasis) ||
        !isBoundedText(label, 64),
    )
  ) {
    throw new RangeError("Phase 1 workspace recovery actions are invalid.");
  }
  if (
    model.available.length > 8 ||
    model.unavailable.length > 8 ||
    model.available.some((item) => !isBoundedText(item, 160)) ||
    model.unavailable.some((item) => !isBoundedText(item, 160))
  ) {
    throw new RangeError("Phase 1 workspace state details are invalid.");
  }
  if (
    model.progress !== undefined &&
    (!Number.isSafeInteger(model.progress.current) ||
      !Number.isSafeInteger(model.progress.total) ||
      model.progress.current < 0 ||
      model.progress.total < 1 ||
      model.progress.current > model.progress.total ||
      !isBoundedText(model.progress.label, 120))
  ) {
    throw new RangeError("Phase 1 workspace state progress is invalid.");
  }
  if (
    model.permission !== undefined &&
    (!isBoundedText(model.permission.exactAccess, 160) ||
      !isBoundedText(model.permission.reason, 160))
  ) {
    throw new RangeError("Phase 1 workspace permission detail is invalid.");
  }

  switch (model.kind) {
    case "loading":
      if (model.progress === undefined || !hasAction(model, "cancel")) {
        throw new RangeError("Loading state requires named progress and cancellation.");
      }
      break;
    case "empty":
      if (!hasAnyAction(model, ["add-job", "import-tracker", "manual-path"])) {
        throw new RangeError("Empty state requires a meaningful next action.");
      }
      break;
    case "partial":
      if (
        model.available.length === 0 ||
        model.unavailable.length === 0 ||
        !hasAnyAction(model, ["retry", "manual-path", "export-fallback"])
      ) {
        throw new RangeError("Partial state requires available data and a recovery path.");
      }
      break;
    case "error":
      if (
        !hasAction(model, "retry") ||
        !hasAction(model, "copy-diagnostics") ||
        !hasAnyAction(model, ["manual-path", "export-fallback"])
      ) {
        throw new RangeError("Error state requires retry, redacted diagnostics, and fallback.");
      }
      break;
    case "offline":
      if (model.available.length === 0 || !hasAction(model, "continue-locally")) {
        throw new RangeError("Offline state requires a useful local continuation.");
      }
      break;
    case "permission-denied":
      if (
        model.permission === undefined ||
        !hasAction(model, "request-permission") ||
        !hasAction(model, "manual-path")
      ) {
        throw new RangeError("Permission state requires exact access and a manual path.");
      }
      break;
  }
};

export const assertPhaseOneWorkspaceStateCatalogEntry = (
  entry: PhaseOneWorkspaceStateCatalogEntry,
): void => {
  assertPhaseOneWorkspaceStateModel(entry);
  if (
    entry.appliesTo.length === 0 ||
    new Set(entry.appliesTo).size !== entry.appliesTo.length ||
    entry.appliesTo.some((surface) => !PHASE_ONE_WORKSPACE_SURFACES.includes(surface))
  ) {
    throw new RangeError("Phase 1 workspace state surface coverage is invalid.");
  }
};

const actions = (
  ...values: readonly PhaseOneWorkspaceStateAction[]
): readonly PhaseOneWorkspaceStateAction[] =>
  Object.freeze(values.map((value) => Object.freeze({ ...value })));

const items = (...values: readonly string[]): readonly string[] => Object.freeze(values);

export const PHASE_ONE_WORKSPACE_STATE_CATALOG: Readonly<
  Record<PhaseOneWorkspaceStateKind, PhaseOneWorkspaceStateCatalogEntry>
> = Object.freeze({
  loading: Object.freeze({
    actions: actions({ emphasis: "secondary", id: "cancel", label: "Cancel and return" }),
    appliesTo: PHASE_ONE_WORKSPACE_SURFACES,
    available: items("The current vault remains readable and unchanged."),
    description:
      "Coredrill is opening the selected local view. This named stage replaces an indefinite spinner.",
    kind: "loading",
    localStatus: "Existing vault data remains on this device; no network request is required.",
    progress: Object.freeze({ current: 2, label: "Reading local job records", total: 3 }),
    title: "Opening your local workspace",
    unavailable: items(),
    workStatus: "No draft or edit has been discarded while this view opens.",
  }),
  empty: Object.freeze({
    actions: actions(
      { emphasis: "primary", id: "add-job", label: "Add a job" },
      { emphasis: "secondary", id: "import-tracker", label: "Import a tracker" },
    ),
    appliesTo: Object.freeze([
      "home",
      "pipeline",
      "documents",
      "career-profile",
      "network",
      "insights",
    ] as const),
    available: items(),
    description:
      "Start with one opportunity or preview an existing tracker before anything is saved.",
    kind: "empty",
    localStatus: "No account, AI provider, or network connection is required to begin local work.",
    title: "No opportunities are in this vault yet",
    unavailable: items(),
    workStatus: "This is an empty local vault, not a loading or connection failure.",
  }),
  partial: Object.freeze({
    actions: actions(
      { emphasis: "primary", id: "retry", label: "Retry missing details" },
      { emphasis: "secondary", id: "manual-path", label: "Continue with available data" },
      { emphasis: "secondary", id: "copy-diagnostics", label: "Copy redacted diagnostics" },
    ),
    appliesTo: Object.freeze([
      "home",
      "pipeline",
      "job-workspace",
      "documents",
      "career-profile",
      "network",
      "insights",
    ] as const),
    available: items(
      "12 job records and their timelines are available.",
      "Your filters and current selection are preserved.",
    ),
    description:
      "The available records stay usable while one attachment and its preview are unavailable.",
    kind: "partial",
    localStatus: "Loaded records remain local and can still be reviewed or exported.",
    title: "Most of this view is available",
    unavailable: items("One document attachment could not be opened from local storage."),
    workStatus: "Your current filters, selection, and unsaved note remain in place.",
  }),
  error: Object.freeze({
    actions: actions(
      { emphasis: "primary", id: "retry", label: "Retry local load" },
      { emphasis: "secondary", id: "copy-diagnostics", label: "Copy redacted diagnostics" },
      { emphasis: "secondary", id: "export-fallback", label: "Open export fallback" },
      { emphasis: "secondary", id: "manual-path", label: "Return to Home" },
    ),
    appliesTo: PHASE_ONE_WORKSPACE_SURFACES,
    available: items(),
    description:
      "Coredrill could not finish opening this local view. No raw error text, path, or record content is included here.",
    kind: "error",
    localStatus: "The existing vault remains on this device and no diagnostics were sent.",
    title: "This view could not finish loading",
    unavailable: items("The selected view is unavailable until the local load succeeds."),
    workStatus: "Your draft and the last usable local state are preserved.",
  }),
  offline: Object.freeze({
    actions: actions(
      { emphasis: "primary", id: "continue-locally", label: "Continue locally" },
      { emphasis: "secondary", id: "review-queued", label: "Review queued work" },
    ),
    appliesTo: PHASE_ONE_WORKSPACE_SURFACES,
    available: items(
      "Review and edit local jobs, contacts, notes, and documents.",
      "Create exports from records already stored in this vault.",
    ),
    description:
      "Local work remains available. Only actions that explicitly need a network will wait.",
    kind: "offline",
    localStatus: "Coredrill has kept queued work local and has not sent or discarded it.",
    title: "You are offline — local work is available",
    unavailable: items("New external fetches and transfers will wait for a connection."),
    workStatus: "New local edits continue to be stored in this vault.",
  }),
  "permission-denied": Object.freeze({
    actions: actions(
      { emphasis: "primary", id: "request-permission", label: "Choose a file again" },
      { emphasis: "secondary", id: "manual-path", label: "Continue manually" },
    ),
    appliesTo: Object.freeze([
      "pipeline",
      "job-workspace",
      "documents",
      "career-profile",
      "settings",
    ] as const),
    available: items("Manual job entry and the rest of the local workspace remain available."),
    description: "The selected import was not opened because one-time file access was not granted.",
    kind: "permission-denied",
    localStatus: "No file was read, uploaded, or retained after permission was denied.",
    permission: Object.freeze({
      exactAccess: "Read the single tracker file you choose in the system picker.",
      reason: "Coredrill needs its contents only to build a local import preview.",
    }),
    title: "File access was not granted",
    unavailable: items("The tracker preview cannot be prepared without the selected file."),
    workStatus: "Anything you already entered in Coredrill remains unchanged.",
  }),
});

for (const model of Object.values(PHASE_ONE_WORKSPACE_STATE_CATALOG)) {
  assertPhaseOneWorkspaceStateCatalogEntry(model);
}

const STATE_META: Readonly<
  Record<PhaseOneWorkspaceStateKind, { readonly icon: UiIconName; readonly label: string }>
> = Object.freeze({
  empty: { icon: "briefcase", label: "Empty local vault" },
  error: { icon: "alert-triangle", label: "Local load error" },
  loading: { icon: "database", label: "Loading local data" },
  offline: { icon: "cloud-off", label: "Offline" },
  partial: { icon: "info", label: "Partially available" },
  "permission-denied": { icon: "alert-triangle", label: "Permission not granted" },
});

const DetailList = ({
  heading,
  kind,
  values,
}: {
  readonly heading: string;
  readonly kind: "available" | "unavailable";
  readonly values: readonly string[];
}) =>
  values.length === 0 ? null : (
    <div className="cd-workspace-state-detail" data-detail-kind={kind}>
      <h3>{heading}</h3>
      <ul>
        {values.map((value) => (
          <li key={value}>{value}</li>
        ))}
      </ul>
    </div>
  );

export const PhaseOneWorkspaceState = ({ model, onAction }: PhaseOneWorkspaceStateProps) => {
  assertPhaseOneWorkspaceStateModel(model);
  const headingId = useId();
  const descriptionId = useId();
  const meta = STATE_META[model.kind];

  return (
    <section
      aria-busy={model.kind === "loading" ? "true" : undefined}
      aria-describedby={descriptionId}
      aria-labelledby={headingId}
      className="cd-workspace-state"
      data-testid="phase-one-workspace-state"
      data-workspace-state={model.kind}
    >
      <div className="cd-workspace-state-icon" data-state-kind={model.kind}>
        <Icon decorative name={meta.icon} size={24} />
      </div>
      <div className="cd-workspace-state-body">
        <p className="cd-workspace-state-label">{meta.label}</p>
        <h2 id={headingId}>{model.title}</h2>
        <p id={descriptionId}>{model.description}</p>

        {model.progress === undefined ? null : (
          <div className="cd-workspace-state-progress">
            <div>
              <strong>{model.progress.label}</strong>
              <span>
                Step {model.progress.current} of {model.progress.total}
              </span>
            </div>
            <progress
              aria-label={model.progress.label}
              max={model.progress.total}
              value={model.progress.current}
            />
          </div>
        )}

        {model.permission === undefined ? null : (
          <dl className="cd-workspace-state-permission">
            <div>
              <dt>Exact access</dt>
              <dd>{model.permission.exactAccess}</dd>
            </div>
            <div>
              <dt>Why</dt>
              <dd>{model.permission.reason}</dd>
            </div>
          </dl>
        )}

        <div className="cd-workspace-state-details">
          <DetailList heading="Available now" kind="available" values={model.available} />
          <DetailList
            heading="Unavailable right now"
            kind="unavailable"
            values={model.unavailable}
          />
        </div>

        <div className="cd-workspace-state-local" role="note">
          <Icon decorative name="database" size={18} />
          <div>
            <strong>{model.localStatus}</strong>
            <span>{model.workStatus}</span>
          </div>
        </div>

        <div className="cd-workspace-state-actions">
          {model.actions.map((action) => (
            <button
              className={`cd-button${action.emphasis === "primary" ? " cd-button-primary" : ""}`}
              key={action.id}
              onClick={() => {
                onAction?.(action);
              }}
              type="button"
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};
