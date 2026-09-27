import { safeParsePageCaptureSnapshot, type PageCaptureSnapshot } from "@coredrill/capture-core";
import { useId } from "react";

export const PRODUCTION_EXTENSION_STATE_KINDS = Object.freeze([
  "unrecognized",
  "recognized",
  "needs-input",
  "queued",
  "transferred",
  "permission-needed",
] as const);

export type ProductionExtensionStateKind = (typeof PRODUCTION_EXTENSION_STATE_KINDS)[number];

export const PRODUCTION_EXTENSION_STATE_ACTION_IDS = Object.freeze([
  "capture-selected-text",
  "capture-page-manually",
  "close",
  "send-to-workspace",
  "choose-page-text",
  "retry-transfer",
  "export-capture",
  "open-workspace",
  "open-inbox",
  "request-temporary-access",
  "continue-manually",
] as const);

export type ProductionExtensionStateActionId =
  (typeof PRODUCTION_EXTENSION_STATE_ACTION_IDS)[number];

export interface ProductionExtensionStateAction {
  readonly emphasis: "primary" | "secondary";
  readonly id: ProductionExtensionStateActionId;
  readonly label: string;
}

export interface ProductionExtensionPermissionV1 {
  readonly exactAccess: string;
  readonly reason: string;
}

export interface ProductionExtensionStateModelV1 {
  readonly actions: readonly ProductionExtensionStateAction[];
  readonly available: readonly string[];
  readonly description: string;
  readonly kind: ProductionExtensionStateKind;
  readonly localStatus: string;
  readonly permission?: ProductionExtensionPermissionV1;
  readonly statusLabel: string;
  readonly title: string;
  readonly unavailable: readonly string[];
  readonly workStatus: string;
}

export interface ProductionExtensionStateFactsV1 {
  readonly specVersion: 1;
  readonly permission: "available" | "needed";
  readonly recognition: "unrecognized" | "recognized" | "needs-input";
  readonly transfer: "idle" | "queued" | "transferred";
}

export interface ProductionExtensionStateProps {
  readonly busy?: boolean;
  readonly model: ProductionExtensionStateModelV1;
  readonly onAction?: (action: ProductionExtensionStateAction) => void;
}

const MAX_TEXT_LENGTH = 260;
const FACT_KEYS = ["specVersion", "permission", "recognition", "transfer"] as const;
const ACTION_EMPHASES = Object.freeze(["primary", "secondary"] as const);

const boundedText = (value: unknown, maximum = MAX_TEXT_LENGTH): value is string =>
  typeof value === "string" &&
  value.trim() === value &&
  value.length > 0 &&
  value.length <= maximum;

const hasExactKeys = (value: Record<string, unknown>, expected: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
};

const hasAction = (
  model: ProductionExtensionStateModelV1,
  id: ProductionExtensionStateActionId,
): boolean => model.actions.some((action) => action.id === id);

const requireActions = (
  model: ProductionExtensionStateModelV1,
  ids: readonly ProductionExtensionStateActionId[],
): boolean => ids.every((id) => hasAction(model, id));

export function assertProductionExtensionStateModelV1(
  model: ProductionExtensionStateModelV1,
): void {
  if (!PRODUCTION_EXTENSION_STATE_KINDS.includes(model.kind)) {
    throw new RangeError("Production extension state kind is unsupported.");
  }
  if (
    !boundedText(model.statusLabel, 64) ||
    !boundedText(model.title, 96) ||
    !boundedText(model.description) ||
    !boundedText(model.localStatus) ||
    !boundedText(model.workStatus)
  ) {
    throw new RangeError("Production extension state copy is invalid.");
  }
  if (
    model.actions.length === 0 ||
    model.actions.length > 4 ||
    new Set(model.actions.map(({ id }) => id)).size !== model.actions.length ||
    model.actions.some(
      ({ emphasis, id, label }) =>
        !ACTION_EMPHASES.includes(emphasis) ||
        !PRODUCTION_EXTENSION_STATE_ACTION_IDS.includes(id) ||
        !boundedText(label, 64),
    )
  ) {
    throw new RangeError("Production extension state actions are invalid.");
  }
  if (
    model.available.length > 6 ||
    model.unavailable.length > 6 ||
    model.available.some((item) => !boundedText(item, 180)) ||
    model.unavailable.some((item) => !boundedText(item, 180))
  ) {
    throw new RangeError("Production extension state details are invalid.");
  }
  if (
    model.permission !== undefined &&
    (!boundedText(model.permission.exactAccess, 180) || !boundedText(model.permission.reason, 180))
  ) {
    throw new RangeError("Production extension permission detail is invalid.");
  }

  switch (model.kind) {
    case "unrecognized":
      if (!requireActions(model, ["capture-selected-text", "capture-page-manually", "close"])) {
        throw new RangeError("Unrecognized state requires selected-text, manual, and close paths.");
      }
      break;
    case "recognized":
      if (!hasAction(model, "send-to-workspace")) {
        throw new RangeError("Recognized state requires an explicit send action.");
      }
      break;
    case "needs-input":
      if (!requireActions(model, ["choose-page-text", "capture-page-manually"])) {
        throw new RangeError("Needs-input state requires correction and manual paths.");
      }
      break;
    case "queued":
      if (!requireActions(model, ["retry-transfer", "export-capture", "open-workspace"])) {
        throw new RangeError("Queued state requires retry, export, and workspace paths.");
      }
      break;
    case "transferred":
      if (!hasAction(model, "open-inbox") || model.available.length === 0) {
        throw new RangeError("Transferred state requires a durable destination path.");
      }
      break;
    case "permission-needed":
      if (
        model.permission === undefined ||
        !requireActions(model, ["request-temporary-access", "continue-manually"])
      ) {
        throw new RangeError("Permission state requires exact access and a manual fallback.");
      }
      break;
  }
}

const actions = (
  ...values: readonly ProductionExtensionStateAction[]
): readonly ProductionExtensionStateAction[] =>
  Object.freeze(values.map((value) => Object.freeze({ ...value })));

const items = (...values: readonly string[]): readonly string[] => Object.freeze(values);

export const PRODUCTION_EXTENSION_STATE_CATALOG_V1: Readonly<
  Record<ProductionExtensionStateKind, ProductionExtensionStateModelV1>
> = Object.freeze({
  unrecognized: Object.freeze({
    actions: actions(
      {
        emphasis: "primary",
        id: "capture-selected-text",
        label: "Capture selected text",
      },
      {
        emphasis: "secondary",
        id: "capture-page-manually",
        label: "Capture page manually",
      },
      { emphasis: "secondary", id: "close", label: "Close" },
    ),
    available: items(
      "You can select the job text on the page and try again.",
      "You can send the current page to Inbox for manual review.",
    ),
    description:
      "Coredrill did not find a validated job-posting signal on the active page, so it will not describe the page as a recognized job.",
    kind: "unrecognized",
    localStatus: "Nothing from this page has entered the local outbox yet.",
    statusLabel: "Not a recognized job",
    title: "This page is not recognized as a job",
    unavailable: items("Automatic field confidence is unavailable for this page."),
    workStatus: "No cookies, forms, browsing history, or background pages were read.",
  }),
  recognized: Object.freeze({
    actions: actions({
      emphasis: "primary",
      id: "send-to-workspace",
      label: "Send to Workspace",
    }),
    available: items("A validated job-posting signal and the detected preview are available."),
    description:
      "Coredrill found a validated job-posting signal with the minimum title and company preview fields.",
    kind: "recognized",
    localStatus: "The preview remains in extension memory until you explicitly send it.",
    statusLabel: "Recognized",
    title: "Job page recognized",
    unavailable: items(),
    workStatus: "Detected values remain provisional and are not trusted job fields.",
  }),
  "needs-input": Object.freeze({
    actions: actions(
      {
        emphasis: "primary",
        id: "choose-page-text",
        label: "Choose text on the page",
      },
      {
        emphasis: "secondary",
        id: "capture-page-manually",
        label: "Queue for Inbox review",
      },
    ),
    available: items("The retained page and any detected fields can still be reviewed."),
    description:
      "A job-posting signal was found, but the title or company is missing or needs a person to resolve it.",
    kind: "needs-input",
    localStatus: "The incomplete preview has not entered the local outbox yet.",
    statusLabel: "Needs input",
    title: "A few job details need input",
    unavailable: items("Coredrill cannot claim a complete recognized preview yet."),
    workStatus: "You can select page text again or keep the uncertainty for Inbox review.",
  }),
  queued: Object.freeze({
    actions: actions(
      { emphasis: "primary", id: "retry-transfer", label: "Retry in Workspace" },
      { emphasis: "secondary", id: "export-capture", label: "Export capture" },
      { emphasis: "secondary", id: "open-workspace", label: "Open Workspace" },
    ),
    available: items("The capture can be retried or exported without recapturing the page."),
    description:
      "The capture is in the bounded extension outbox and is waiting for Coredrill to store and acknowledge it.",
    kind: "queued",
    localStatus:
      "The full capture stays local in the extension outbox until acknowledgement or expiry.",
    statusLabel: "Queued locally",
    title: "Capture is queued locally",
    unavailable: items("A durable Inbox receipt is not confirmed yet."),
    workStatus: "Closing this panel does not discard the queued capture.",
  }),
  transferred: Object.freeze({
    actions: actions({ emphasis: "primary", id: "open-inbox", label: "Open Inbox" }),
    available: items("Coredrill has a durable Inbox receipt for the acknowledged capture."),
    description:
      "Coredrill stored and acknowledged the capture. Review it in Inbox before any detected value becomes trusted.",
    kind: "transferred",
    localStatus: "The acknowledged full capture is no longer retained in the extension outbox.",
    statusLabel: "Transferred",
    title: "Capture reached Coredrill",
    unavailable: items(),
    workStatus: "The extension keeps no second trusted copy of the acknowledged content.",
  }),
  "permission-needed": Object.freeze({
    actions: actions(
      {
        emphasis: "primary",
        id: "request-temporary-access",
        label: "Try current page again",
      },
      {
        emphasis: "secondary",
        id: "continue-manually",
        label: "Continue manually",
      },
    ),
    available: items("Manual entry and the existing local outbox remain available."),
    description:
      "The active page was not read because the extension does not currently have temporary access to that page.",
    kind: "permission-needed",
    localStatus: "No page content was captured, queued locally, uploaded, or discarded.",
    permission: Object.freeze({
      exactAccess: "Temporary activeTab access plus scripting on only the current HTTP(S) page.",
      reason: "Coredrill needs that access only after your click to build a local capture preview.",
    }),
    statusLabel: "Permission needed",
    title: "Temporary page access is needed",
    unavailable: items("The current page preview cannot be prepared without temporary access."),
    workStatus: "No site-wide host permission or browsing-history permission is requested.",
  }),
});

for (const model of Object.values(PRODUCTION_EXTENSION_STATE_CATALOG_V1)) {
  assertProductionExtensionStateModelV1(model);
}

export function resolveProductionExtensionStateV1(input: unknown): ProductionExtensionStateKind {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    !hasExactKeys(input as Record<string, unknown>, FACT_KEYS)
  ) {
    throw new RangeError("Production extension state facts are invalid.");
  }
  const facts = input as Record<string, unknown>;
  if (
    facts["specVersion"] !== 1 ||
    (facts["permission"] !== "available" && facts["permission"] !== "needed") ||
    !["unrecognized", "recognized", "needs-input"].includes(facts["recognition"] as string) ||
    !["idle", "queued", "transferred"].includes(facts["transfer"] as string)
  ) {
    throw new RangeError("Production extension state facts are invalid.");
  }
  if (facts["permission"] === "needed") return "permission-needed";
  if (facts["transfer"] === "transferred") return "transferred";
  if (facts["transfer"] === "queued") return "queued";
  return facts["recognition"] as ProductionExtensionStateKind;
}

export function classifyCapturedPageV1(
  input: unknown,
): Extract<ProductionExtensionStateKind, "unrecognized" | "recognized" | "needs-input"> {
  const parsed = safeParsePageCaptureSnapshot(input);
  if (!parsed.success) throw new RangeError("Capture preview is invalid.");
  const snapshot: PageCaptureSnapshot = parsed.data;
  if (snapshot.jsonLd === undefined || snapshot.jsonLd.length === 0) return "unrecognized";
  return snapshot.fields.title === undefined || snapshot.fields.company === undefined
    ? "needs-input"
    : "recognized";
}

const DetailList = ({
  heading,
  values,
}: {
  readonly heading: string;
  readonly values: readonly string[];
}) =>
  values.length === 0 ? null : (
    <div className="capture-state__detail">
      <h3>{heading}</h3>
      <ul>
        {values.map((value) => (
          <li key={value}>{value}</li>
        ))}
      </ul>
    </div>
  );

export function ProductionExtensionState({
  busy = false,
  model,
  onAction,
}: ProductionExtensionStateProps): React.JSX.Element {
  assertProductionExtensionStateModelV1(model);
  const headingId = useId();
  const descriptionId = useId();
  return (
    <section
      aria-describedby={descriptionId}
      aria-labelledby={headingId}
      className="capture-state"
      data-capture-state={model.kind}
    >
      <p className="capture-state__label">{model.statusLabel}</p>
      <h2 id={headingId}>{model.title}</h2>
      <p id={descriptionId}>{model.description}</p>

      {model.permission === undefined ? null : (
        <dl className="capture-state__permission">
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

      <div className="capture-state__details">
        <DetailList heading="Available now" values={model.available} />
        <DetailList heading="Unavailable right now" values={model.unavailable} />
      </div>

      <div className="capture-state__local" role="note">
        <strong>{model.localStatus}</strong>
        <span>{model.workStatus}</span>
      </div>

      <div className="capture-state__actions">
        {model.actions.map((action) => (
          <button
            className={action.emphasis}
            disabled={busy}
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
    </section>
  );
}
