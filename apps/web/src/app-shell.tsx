import {
  ApplicationShell,
  HomeDashboard,
  JobWorkspaceContent,
  JobWorkspaceFrame,
  JOB_WORKSPACE_TABS,
  NetworkWorkspace,
  PHASE_ONE_WORKSPACE_STATE_CATALOG,
  PHASE_ONE_WORKSPACE_STATE_KINDS,
  PIPELINE_VIEW_IDS,
  PhaseOneWorkspaceState,
  PipelineBoard,
  PipelineShell,
  PipelineTable,
  VAULT_HEALTH_STATES,
  DEFAULT_PIPELINE_TABLE_COLUMNS,
  getRootAppearanceAttributes,
  isJobWorkspaceContentTab,
  matchesLocalSearchQuery,
  type DensityMode,
  type HomeDashboardActionId,
  type HomeDashboardModel,
  type HomeRecentItem,
  type JobWorkspaceActionId,
  type JobWorkspaceContentActionRequest,
  type JobWorkspaceContentModel,
  type JobWorkspaceFrameModel,
  type JobWorkspaceMode,
  type JobWorkspaceTabId,
  type LocalSearchResult,
  type NetworkActionRequest,
  type NetworkTabId,
  type NetworkWorkspaceModel,
  type PipelineBulkActionId,
  type BoardColumn,
  type BoardJobCard,
  type BoardMoveRequest,
  type PipelineTableColumnConfiguration,
  type PipelineTableEditRequest,
  type PipelineTableEditResult,
  type PipelineTableJob,
  type PipelineTableStatusOption,
  type PipelineFilterChip,
  type PipelineSavedView,
  type PipelineShellActionId,
  type PipelineShellModel,
  type PipelineViewId,
  type PhaseOneWorkspaceStateAction,
  type PhaseOneWorkspaceStateKind,
  type ShellActionId,
  type ShellDestinationId,
  type ThemePreference,
  type VaultHealthState,
} from "@coredrill/ui";
import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

import "./app-shell.css";

interface AppShellCatalogState {
  readonly activeDestination: ShellDestinationId;
  readonly boardAnnouncement: string;
  readonly boardTimelineEventCount: number;
  readonly boardUndoAvailable: boolean;
  readonly density: DensityMode;
  readonly homeMode: HomeDashboardModel["state"];
  readonly homeSnapshotVisible: boolean;
  readonly lastActivity: string;
  readonly networkInteractionDraftCount: number;
  readonly networkSelectedCompanyId: string | null;
  readonly networkSelectedContactId: string | null;
  readonly networkTab: NetworkTabId;
  readonly pipelineFilterCount: number;
  readonly pipelineSavedViewId: string;
  readonly pipelineSearchQuery: string;
  readonly pipelineSelectedCount: number;
  readonly pipelineView: PipelineViewId;
  readonly tableColumnSaveCount: number;
  readonly tableEditCount: number;
  readonly workspaceJobId: string | null;
  readonly workspaceMode: JobWorkspaceMode | null;
  readonly workspaceState: PhaseOneWorkspaceStateKind | null;
  readonly workspaceTab: JobWorkspaceTabId | null;
  readonly theme: ThemePreference;
  readonly vaultHealth: VaultHealthState;
}

interface AppShellCatalogApi {
  getState(): AppShellCatalogState;
}

declare global {
  var coredrillAppShell: AppShellCatalogApi | undefined;
}

interface PipelineScrollPosition {
  readonly left: number;
  readonly top: number;
}

interface PipelineStageScrollPosition extends PipelineScrollPosition {
  readonly stageId: string;
}

interface PipelineReturnFocus {
  readonly jobId: string;
  readonly source: "board" | "table";
}

interface PipelineNavigationSnapshot {
  readonly boardColumnsScroll: PipelineScrollPosition | null;
  readonly boardScroll: readonly PipelineStageScrollPosition[];
  readonly filters: readonly PipelineFilterChip[];
  readonly focus: PipelineReturnFocus;
  readonly savedViewId: string;
  readonly searchQuery: string;
  readonly selectedJobIds: readonly string[];
  readonly tableScroll: PipelineScrollPosition | null;
  readonly view: PipelineViewId;
  readonly windowScrollY: number;
}

interface JobRouteState {
  readonly jobId: string;
  readonly mode: JobWorkspaceMode;
  readonly responsiveContextual: boolean;
  readonly returnSnapshot: PipelineNavigationSnapshot | null;
  readonly tab: JobWorkspaceTabId;
}

type InitialLocation =
  | { readonly kind: "home" }
  | {
      readonly kind: "network";
      readonly recordId: string | null;
      readonly tab: NetworkTabId;
    }
  | {
      readonly destination: Exclude<ShellDestinationId, "home" | "network" | "pipeline">;
      readonly kind: "destination";
    }
  | {
      readonly kind: "pipeline";
      readonly savedViewId: string;
      readonly view: PipelineViewId;
    }
  | { readonly jobId: string; readonly kind: "job"; readonly tab: JobWorkspaceTabId };

const PIPELINE_HISTORY_KIND = "coredrill-pipeline-v1";
const JOB_HISTORY_KIND = "coredrill-job-v1";
const JOB_ROUTE = /^\/jobs\/(?<jobId>[a-zA-Z0-9-]{1,128})\/(?<tab>[a-z-]{1,32})\/?$/u;
const NETWORK_ROUTE =
  /^\/network\/(?<tab>companies|contacts|interactions)(?:\/(?<recordId>[a-zA-Z0-9-]{1,128}))?\/?$/u;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isPipelineView = (value: unknown): value is PipelineViewId =>
  typeof value === "string" && PIPELINE_VIEW_IDS.some((view) => view === value);

const isJobWorkspaceTab = (value: unknown): value is JobWorkspaceTabId =>
  typeof value === "string" && JOB_WORKSPACE_TABS.some((tab) => tab === value);

const readInitialLocation = (): InitialLocation => {
  const match = JOB_ROUTE.exec(window.location.pathname);
  if (match?.groups !== undefined) {
    const jobId = match.groups["jobId"];
    const tab = match.groups["tab"];
    if (jobId !== undefined && isJobWorkspaceTab(tab)) return { jobId, kind: "job", tab };
  }
  const networkMatch = NETWORK_ROUTE.exec(window.location.pathname);
  const networkTab = networkMatch?.groups?.["tab"];
  if (networkTab === "companies" || networkTab === "contacts" || networkTab === "interactions") {
    return {
      kind: "network",
      recordId: networkTab === "interactions" ? null : (networkMatch?.groups?.["recordId"] ?? null),
      tab: networkTab,
    };
  }
  if (window.location.pathname === "/pipeline") {
    const parameters = new URLSearchParams(window.location.search);
    const view = parameters.get("view");
    return {
      kind: "pipeline",
      savedViewId: parameters.get("savedView") ?? "active-search",
      view: isPipelineView(view) ? view : "board",
    };
  }
  if (window.location.pathname.startsWith("/documents")) {
    return { destination: "documents", kind: "destination" };
  }
  if (window.location.pathname.startsWith("/profile")) {
    return { destination: "profile", kind: "destination" };
  }
  if (window.location.pathname.startsWith("/insights")) {
    return { destination: "insights", kind: "destination" };
  }
  if (window.location.pathname.startsWith("/settings")) {
    return { destination: "settings", kind: "destination" };
  }
  return { kind: "home" };
};

const readPipelineSnapshot = (value: unknown): PipelineNavigationSnapshot | null => {
  if (!isRecord(value) || value["kind"] !== PIPELINE_HISTORY_KIND || !isRecord(value["snapshot"])) {
    return null;
  }
  const snapshot = value["snapshot"];
  const focus = snapshot["focus"];
  const boardColumnsScroll = snapshot["boardColumnsScroll"];
  const tableScroll = snapshot["tableScroll"];
  if (
    !isPipelineView(snapshot["view"]) ||
    typeof snapshot["savedViewId"] !== "string" ||
    typeof snapshot["searchQuery"] !== "string" ||
    typeof snapshot["windowScrollY"] !== "number" ||
    !Array.isArray(snapshot["filters"]) ||
    !Array.isArray(snapshot["selectedJobIds"]) ||
    !Array.isArray(snapshot["boardScroll"]) ||
    !isRecord(focus) ||
    typeof focus["jobId"] !== "string" ||
    (focus["source"] !== "board" && focus["source"] !== "table") ||
    (boardColumnsScroll !== null &&
      (!isRecord(boardColumnsScroll) ||
        typeof boardColumnsScroll["left"] !== "number" ||
        typeof boardColumnsScroll["top"] !== "number")) ||
    (tableScroll !== null &&
      (!isRecord(tableScroll) ||
        typeof tableScroll["left"] !== "number" ||
        typeof tableScroll["top"] !== "number"))
  ) {
    return null;
  }
  const filters = snapshot["filters"];
  const selectedJobIds = snapshot["selectedJobIds"];
  const boardScroll = snapshot["boardScroll"];
  if (
    filters.some(
      (filter) =>
        !isRecord(filter) ||
        typeof filter["id"] !== "string" ||
        typeof filter["label"] !== "string",
    ) ||
    selectedJobIds.some((id) => typeof id !== "string") ||
    boardScroll.some(
      (position) =>
        !isRecord(position) ||
        typeof position["stageId"] !== "string" ||
        typeof position["left"] !== "number" ||
        typeof position["top"] !== "number",
    )
  ) {
    return null;
  }
  const validatedFilters = filters as readonly PipelineFilterChip[];
  const validatedBoardScroll = boardScroll as readonly PipelineStageScrollPosition[];
  return Object.freeze({
    boardColumnsScroll:
      boardColumnsScroll === null
        ? null
        : Object.freeze({
            left: boardColumnsScroll["left"] as number,
            top: boardColumnsScroll["top"] as number,
          }),
    boardScroll: Object.freeze(
      validatedBoardScroll.map((position) =>
        Object.freeze({
          left: position.left,
          stageId: position.stageId,
          top: position.top,
        }),
      ),
    ),
    filters: Object.freeze(
      validatedFilters.map((filter) => Object.freeze({ id: filter.id, label: filter.label })),
    ),
    focus: Object.freeze({
      jobId: focus["jobId"],
      source: focus["source"],
    }),
    savedViewId: snapshot["savedViewId"],
    searchQuery: snapshot["searchQuery"],
    selectedJobIds: Object.freeze(selectedJobIds as string[]),
    tableScroll:
      tableScroll === null
        ? null
        : Object.freeze({ left: tableScroll["left"] as number, top: tableScroll["top"] as number }),
    view: snapshot["view"],
    windowScrollY: snapshot["windowScrollY"],
  });
};

const readJobHistoryState = (
  value: unknown,
): Pick<JobRouteState, "mode" | "returnSnapshot"> | null => {
  if (
    !isRecord(value) ||
    value["kind"] !== JOB_HISTORY_KIND ||
    (value["mode"] !== "contextual" && value["mode"] !== "full-page")
  ) {
    return null;
  }
  return Object.freeze({
    mode: value["mode"],
    returnSnapshot: readPipelineSnapshot({
      kind: PIPELINE_HISTORY_KIND,
      snapshot: value["snapshot"],
    }),
  });
};

const pipelineUrl = (view: PipelineViewId, savedViewId: string): string => {
  const parameters = new URLSearchParams({ savedView: savedViewId, view });
  return `/pipeline?${parameters.toString()}`;
};

const jobUrl = (jobId: string, tab: JobWorkspaceTabId): string => `/jobs/${jobId}/${tab}`;

const networkUrl = (tab: NetworkTabId, recordId: string | null = null): string =>
  `/network/${tab}${recordId === null ? "" : `/${recordId}`}`;

const DESTINATION_URLS: Readonly<Record<ShellDestinationId, string>> = Object.freeze({
  documents: "/documents",
  home: "/app-shell.html",
  insights: "/insights/pipeline",
  network: "/network/companies",
  pipeline: "/pipeline?view=board",
  profile: "/profile/basics",
  settings: "/settings/vault-backup",
});

const navigationWasReloaded = (): boolean =>
  performance
    .getEntriesByType("navigation")
    .some((entry) => (entry as PerformanceNavigationTiming).type === "reload");

const SEARCH_RESULTS = Object.freeze([
  {
    context: "Northstar Health · Interviewing",
    href: "/jobs/board-northstar/overview",
    id: "search-job-northstar",
    kind: "job",
    title: "Product Operations Lead",
  },
  {
    context: "Canvas Works · Preparing",
    href: "/jobs/board-canvas/overview",
    id: "search-job-canvas",
    kind: "job",
    title: "Platform Engineer",
  },
  {
    context: "Company · 2 saved roles",
    href: "/network/companies/company-acme",
    id: "search-company-acme",
    kind: "company",
    title: "Acme Research",
  },
  {
    context: "Northstar Health · Director, Product Operations",
    href: "/network/contacts/contact-maya",
    id: "search-contact-maya",
    kind: "contact",
    title: "Maya Chen",
  },
  {
    context: "Resume · Edited 2 days ago",
    href: "/documents/document-product-base",
    id: "search-document-product",
    kind: "document",
    title: "Product leadership base",
  },
] as const satisfies readonly LocalSearchResult[]);

const NETWORK_MODEL = Object.freeze({
  companies: Object.freeze([
    Object.freeze({
      canonicalName: "Northstar Health",
      domain: "northstar.example.test",
      id: "company-northstar",
      jobs: Object.freeze([
        Object.freeze({
          id: "board-northstar",
          statusLabel: "Interviewing",
          title: "Product Operations Lead",
        }),
        Object.freeze({
          id: "network-northstar-program",
          statusLabel: "Saved",
          title: "Program Operations Manager",
        }),
      ]),
      notes:
        "Review the product operating model and recent service expansion before the next conversation.",
      outcomes: Object.freeze([
        Object.freeze({ count: 1, id: "northstar-outcome-interview", label: "Interview" }),
        Object.freeze({ count: 1, id: "northstar-outcome-no-response", label: "No response" }),
      ]),
      publicFacts: Object.freeze([
        Object.freeze({
          id: "northstar-fact-sector",
          label: "Sector",
          sourceLabel: "Official company overview",
          sourceUrl: "https://northstar.example.test/about",
          value: "Healthcare operations software",
        }),
        Object.freeze({
          id: "northstar-fact-work-mode",
          label: "Published work mode",
          sourceLabel: "Official careers page",
          sourceUrl: "https://northstar.example.test/careers",
          value: "Distributed within the United States",
        }),
      ]),
      salaryObservations: Object.freeze([
        Object.freeze({
          id: "northstar-salary-product-ops",
          rangeLabel: "$120k–$145k · annual",
          sourceLabel: "Disclosed role range · captured 2026-08-18",
        }),
        Object.freeze({
          id: "northstar-salary-program-ops",
          rangeLabel: "$108k–$132k · annual",
          sourceLabel: "Disclosed role range · captured 2026-08-11",
        }),
      ]),
      websiteUrl: "https://northstar.example.test",
    }),
    Object.freeze({
      canonicalName: "Canvas Works",
      domain: "canvas.example.test",
      id: "company-canvas",
      jobs: Object.freeze([
        Object.freeze({
          id: "board-canvas",
          statusLabel: "Preparing",
          title: "Platform Engineer",
        }),
      ]),
      notes: "Track the infrastructure modernization program and recruiter context.",
      outcomes: Object.freeze([
        Object.freeze({ count: 1, id: "canvas-outcome-screen", label: "Recruiter screen" }),
      ]),
      publicFacts: Object.freeze([
        Object.freeze({
          id: "canvas-fact-sector",
          label: "Sector",
          sourceLabel: "Official company overview",
          sourceUrl: "https://canvas.example.test/about",
          value: "Collaborative design systems",
        }),
      ]),
      salaryObservations: Object.freeze([]),
      websiteUrl: "https://canvas.example.test",
    }),
    Object.freeze({
      canonicalName: "Acme Research",
      domain: null,
      id: "company-acme",
      jobs: Object.freeze([
        Object.freeze({
          id: "board-acme",
          statusLabel: "Saved",
          title: "Research Operations Manager",
        }),
      ]),
      notes: "Domain is intentionally unconfirmed while the source conflict is under review.",
      outcomes: Object.freeze([]),
      publicFacts: Object.freeze([
        Object.freeze({
          id: "acme-fact-location",
          label: "Published location",
          sourceLabel: "Captured role snapshot",
          sourceUrl: "https://careers.example.test/acme/research-operations",
          value: "Boston, Massachusetts",
        }),
      ]),
      salaryObservations: Object.freeze([]),
      websiteUrl: null,
    }),
  ]),
  contacts: Object.freeze([
    Object.freeze({
      companyId: "company-northstar",
      contactPoints: Object.freeze([
        Object.freeze({
          id: "contact-point-maya-profile",
          kind: "public-profile" as const,
          origin: "explicitly-public" as const,
          provenanceLabel: "Public conference speaker profile",
          sourceUrl: "https://events.example.test/speakers/maya-chen",
          value: "events.example.test/speakers/maya-chen",
        }),
        Object.freeze({
          id: "contact-point-maya-phone",
          kind: "phone" as const,
          origin: "user-entered" as const,
          provenanceLabel: "Entered by you",
          sourceUrl: null,
          value: "+1 202-555-0147",
        }),
      ]),
      id: "contact-maya",
      identityOrigin: "explicitly-public" as const,
      identityProvenanceLabel: "Public conference speaker profile",
      identitySourceUrl: "https://events.example.test/speakers/maya-chen",
      lastInteractionAtLabel: "Today · 9:40 AM",
      name: "Maya Chen",
      notes: "Asked for examples of cross-functional operating cadences.",
      role: "Director, Product Operations",
    }),
    Object.freeze({
      companyId: "company-northstar",
      contactPoints: Object.freeze([]),
      id: "contact-jonah",
      identityOrigin: "user-entered" as const,
      identityProvenanceLabel: "Entered by you from interview scheduling context",
      identitySourceUrl: null,
      lastInteractionAtLabel: null,
      name: "Jonah Reed",
      notes:
        "Name and role were entered from interview scheduling context. No contact method saved.",
      role: "Recruiting coordinator",
    }),
    Object.freeze({
      companyId: "company-canvas",
      contactPoints: Object.freeze([
        Object.freeze({
          id: "contact-point-leila-email",
          kind: "email" as const,
          origin: "licensed" as const,
          provenanceLabel: "Licensed recruiting directory · reviewed 2026-08-22",
          sourceUrl: "https://directory.example.test/records/leila-morgan",
          value: "leila.morgan@example.test",
        }),
      ]),
      id: "contact-leila",
      identityOrigin: "licensed" as const,
      identityProvenanceLabel: "Licensed recruiting directory · reviewed 2026-08-22",
      identitySourceUrl: "https://directory.example.test/records/leila-morgan",
      lastInteractionAtLabel: "8 days ago",
      name: "Leila Morgan",
      notes: "Follow-up remains optional and user-controlled.",
      role: "Technical recruiter",
    }),
  ]),
  interactions: Object.freeze([
    Object.freeze({
      companyId: "company-northstar",
      contactId: "contact-maya",
      direction: "outbound" as const,
      id: "interaction-maya-note",
      jobTitle: "Product Operations Lead",
      nextActionAtLabel: "2026-09-02 · America/New_York",
      occurredAtLabel: "Today · 9:40 AM",
      summary: "Logged the interview question about portfolio reporting ownership.",
      type: "note" as const,
    }),
    Object.freeze({
      companyId: "company-canvas",
      contactId: "contact-leila",
      direction: "outbound" as const,
      id: "interaction-leila-email",
      jobTitle: "Platform Engineer",
      nextActionAtLabel: "Today · 4:00 PM",
      occurredAtLabel: "2026-08-21 · 2:15 PM",
      summary: "Recorded that a concise availability reply was sent outside Coredrill.",
      type: "email-logged" as const,
    }),
    Object.freeze({
      companyId: "company-northstar",
      contactId: "contact-maya",
      direction: "inbound" as const,
      id: "interaction-maya-call",
      jobTitle: "Product Operations Lead",
      nextActionAtLabel: null,
      occurredAtLabel: "2026-08-20 · 11:00 AM",
      summary: "Discussed the team structure and the upcoming interview sequence.",
      type: "call" as const,
    }),
  ]),
  reminder: Object.freeze({
    companyId: "company-canvas",
    contactId: "contact-leila",
    dueAtLabel: "Due today · 4:00 PM",
    id: "reminder-leila-follow-up",
    title: "Decide whether to follow up with Leila",
  }),
} as const satisfies NetworkWorkspaceModel);

const readAppearance = (): {
  readonly boardMode: "large" | "standard";
  readonly density: DensityMode;
  readonly homeMode: HomeDashboardModel["state"];
  readonly pipelineSelectionCount: number;
  readonly pipelineView: PipelineViewId;
  readonly tableEditMode: "conflict" | "ready";
  readonly tableMode: "large" | "standard";
  readonly theme: ThemePreference;
  readonly vaultHealth: VaultHealthState;
  readonly workspaceState: PhaseOneWorkspaceStateKind | null;
} => {
  const parameters = new URLSearchParams(window.location.search);
  const requestedBoard = parameters.get("board");
  const requestedDensity = parameters.get("density");
  const requestedHome = parameters.get("home");
  const requestedPipeline = parameters.get("pipeline");
  const requestedTable = parameters.get("table");
  const requestedTheme = parameters.get("theme");
  const requestedHealth = parameters.get("health");
  const requestedWorkspaceState = parameters.get("workspaceState");
  return {
    boardMode: requestedBoard === "large" ? "large" : "standard",
    density: requestedDensity === "compact" ? "compact" : "comfortable",
    homeMode: requestedHome === "empty" ? "empty" : "ready",
    pipelineSelectionCount: requestedPipeline === "selected" ? 2 : 0,
    pipelineView: requestedTable === "large" || requestedTable === "conflict" ? "table" : "board",
    tableEditMode: requestedTable === "conflict" ? "conflict" : "ready",
    tableMode: requestedTable === "large" ? "large" : "standard",
    theme: requestedTheme === "dark" || requestedTheme === "system" ? requestedTheme : "light",
    vaultHealth: VAULT_HEALTH_STATES.includes(requestedHealth as VaultHealthState)
      ? (requestedHealth as VaultHealthState)
      : "healthy",
    workspaceState: PHASE_ONE_WORKSPACE_STATE_KINDS.includes(
      requestedWorkspaceState as PhaseOneWorkspaceStateKind,
    )
      ? (requestedWorkspaceState as PhaseOneWorkspaceStateKind)
      : null,
  };
};

const PAGE_COPY: Readonly<
  Record<ShellDestinationId, { readonly eyebrow: string; readonly title: string }>
> = Object.freeze({
  documents: { eyebrow: "Application materials", title: "Documents" },
  home: { eyebrow: "Local attention queue", title: "Keep the next move clear" },
  insights: { eyebrow: "Explainable personal data", title: "Insights" },
  network: { eyebrow: "Companies and contacts", title: "Network" },
  pipeline: { eyebrow: "One opportunity record set", title: "Pipeline" },
  profile: { eyebrow: "Verified career evidence", title: "Career Profile" },
  settings: { eyebrow: "Local control", title: "Settings" },
});

const READY_HOME_MODEL = Object.freeze({
  agendaSummary: "4 actions · 1 interview",
  attention: Object.freeze([
    {
      action: { id: "review-captures", label: "Review captures" },
      detail: "One title conflict and one uncertain salary range remain unconfirmed.",
      id: "attention-captures",
      kind: "capture-review",
      title: "3 captures need review",
    },
    {
      action: { id: "review-unsupported-claims", label: "Review claim" },
      detail: "A draft sentence has no linked Career Profile evidence.",
      id: "attention-claim",
      kind: "unsupported-claim",
      title: "One draft claim needs evidence",
    },
    {
      action: { id: "retry-transfer", label: "Retry locally" },
      detail: "The queued capture remains safely in the extension outbox.",
      id: "attention-transfer",
      kind: "failed-transfer",
      title: "Extension transfer needs repair",
    },
    {
      action: { id: "open-follow-up", label: "Open follow-up" },
      detail: "Canvas Works has no interaction recorded for 8 days.",
      id: "attention-follow-up",
      kind: "stale-follow-up",
      title: "Follow-up is stale",
    },
    {
      action: { id: "review-backup", label: "Review backup" },
      detail: "The last verified export is 12 days old.",
      id: "attention-backup",
      kind: "backup-risk",
      title: "A fresh backup is due",
    },
  ]),
  now: Object.freeze([
    {
      context: "Northstar Health · Interview",
      description: "Review the submitted resume and three verified evidence stories.",
      id: "now-interview",
      primaryAction: { id: "open-interview-plan", label: "Open interview plan" },
      secondaryAction: { id: "view-submitted-files", label: "View submitted files" },
      title: "Prepare for tomorrow's conversation",
      urgency: "upcoming",
      when: "Tomorrow · 10:30 AM",
    },
    {
      context: "Canvas Works · Follow-up",
      description: "A concise check-in is ready to review; outreach remains manual.",
      id: "now-follow-up",
      primaryAction: { id: "open-follow-up", label: "Review follow-up" },
      title: "Decide whether to follow up",
      urgency: "today",
      when: "Today · 4:00 PM",
    },
    {
      context: "Acme Research · Deadline",
      description: "Confirm the role details and materials before the external deadline.",
      id: "now-deadline",
      primaryAction: { id: "review-captures", label: "Open job" },
      title: "Review the saved opportunity",
      urgency: "upcoming",
      when: "Friday",
    },
  ]),
  recent: Object.freeze([
    {
      context: "Interviewing · opened 25 minutes ago",
      href: "/jobs/00000000-0000-4000-8000-000000000101/overview",
      id: "recent-northstar",
      kind: "job",
      title: "Northstar Health · Product Operations Lead",
    },
    {
      context: "Resume · edited yesterday",
      href: "/documents/00000000-0000-4000-8000-000000000301",
      id: "recent-resume",
      kind: "document",
      title: "Product leadership base",
    },
  ]),
  snapshot: Object.freeze({
    pipeline: Object.freeze([
      { count: 8, label: "Saved" },
      { count: 4, label: "Preparing" },
      { count: 6, label: "Applied" },
      { count: 2, label: "Interviewing" },
    ]),
    responseTiming: "Median first response: 5 days across 4 responses.",
    weeklyTarget: Object.freeze({ completed: 4, target: 6 }),
  }),
  state: "ready",
  week: Object.freeze([
    {
      context: "Local capture inbox",
      day: "Today",
      id: "agenda-captures",
      time: "Before 3:00 PM",
      title: "Review 3 captures",
    },
    {
      context: "Northstar Health · video call",
      day: "Tomorrow",
      id: "agenda-interview",
      time: "10:30 AM",
      title: "Product Operations interview",
    },
    {
      context: "Canvas Works · manual outreach",
      day: "Thursday",
      id: "agenda-follow-up",
      time: null,
      title: "Decide on follow-up",
    },
    {
      context: "Browser vault · local export",
      day: "Friday",
      id: "agenda-backup",
      time: null,
      title: "Verify a fresh backup",
    },
  ]),
} as const satisfies HomeDashboardModel);

const EMPTY_HOME_MODEL = Object.freeze({ state: "empty" } as const satisfies HomeDashboardModel);

const PIPELINE_SAVED_VIEWS = Object.freeze([
  { id: "all-opportunities", label: "All opportunities" },
  { id: "active-search", label: "Active search" },
  { id: "interview-prep", label: "Interview prep" },
] as const satisfies readonly PipelineSavedView[]);

const INITIAL_PIPELINE_FILTERS = Object.freeze([
  { id: "active-status", label: "Status · Active" },
  { id: "priority-high", label: "Priority · High" },
] as const satisfies readonly PipelineFilterChip[]);

const BOARD_STAGES = Object.freeze([
  {
    id: "saved",
    name: "Saved",
    semanticCategories: Object.freeze(["saved"] as const),
    terminal: false,
  },
  {
    id: "preparing",
    name: "Preparing",
    semanticCategories: Object.freeze(["preparing"] as const),
    terminal: false,
  },
  {
    id: "applied",
    name: "Applied",
    semanticCategories: Object.freeze(["applied"] as const),
    terminal: false,
  },
  {
    id: "interviewing",
    name: "Interviewing",
    semanticCategories: Object.freeze(["response", "interview"] as const),
    terminal: false,
  },
  {
    id: "offer",
    name: "Offer",
    semanticCategories: Object.freeze(["offer"] as const),
    terminal: false,
  },
  {
    id: "closed",
    name: "Closed",
    semanticCategories: Object.freeze(["rejected", "withdrawn", "archived"] as const),
    terminal: true,
  },
] as const);

const boardJob = (
  id: string,
  title: string,
  company: string,
  overrides: Partial<BoardJobCard> = {},
): BoardJobCard =>
  Object.freeze({
    company,
    id,
    lastActivity: "Updated 2 days ago",
    location: "United States",
    nextAction: "Review role notes",
    priority: "normal",
    title,
    warnings: Object.freeze([]),
    workMode: "remote",
    ...overrides,
  });

const STANDARD_BOARD_COLUMNS = Object.freeze([
  {
    items: Object.freeze([
      boardJob("board-northstar", "Product Operations Lead", "Northstar Health", {
        lastActivity: "Saved today",
        nextAction: "Review source fields",
        priority: "high",
        warnings: Object.freeze(["unreviewed-source"]),
      }),
      boardJob("board-summit", "Program Manager", "Summit Labs", {
        location: "Boston, MA",
        nextAction: null,
        workMode: "hybrid",
      }),
    ]),
    stage: BOARD_STAGES[0],
  },
  {
    items: Object.freeze([
      boardJob("board-canvas", "Platform Engineer", "Canvas Works", {
        location: "New York, NY",
        nextAction: "Tailor resume",
        priority: "high",
        warnings: Object.freeze(["missing-document"]),
        workMode: "hybrid",
      }),
    ]),
    stage: BOARD_STAGES[1],
  },
  {
    items: Object.freeze([
      boardJob("board-arc", "Design Systems Lead", "Arc Studio", {
        nextAction: "Follow up Friday",
      }),
      boardJob("board-orbit", "Operations Manager", "Orbit Foods", {
        lastActivity: "Applied 4 days ago",
        nextAction: null,
        workMode: "onsite",
      }),
    ]),
    stage: BOARD_STAGES[2],
  },
  {
    items: Object.freeze([
      boardJob("board-acme", "Senior Product Designer", "Acme Research", {
        lastActivity: "Interview tomorrow",
        location: "Philadelphia, PA",
        nextAction: "Open interview plan",
        priority: "high",
        workMode: "hybrid",
      }),
    ]),
    stage: BOARD_STAGES[3],
  },
  {
    items: Object.freeze([
      boardJob("board-lumen", "Product Strategy Lead", "Lumen Group", {
        lastActivity: "Offer received today",
        nextAction: "Review offer details",
        priority: "high",
      }),
    ]),
    stage: BOARD_STAGES[4],
  },
  {
    items: Object.freeze([
      boardJob("board-harbor", "Product Manager", "Harbor Systems", {
        lastActivity: "Closed last week",
        nextAction: null,
        priority: "low",
        workMode: "unspecified",
      }),
    ]),
    stage: BOARD_STAGES[5],
  },
] as const satisfies readonly BoardColumn[]);

const LARGE_BOARD_COLUMNS = Object.freeze([
  {
    items: Object.freeze([
      ...STANDARD_BOARD_COLUMNS[0].items,
      ...Array.from({ length: 70 }, (_, index) =>
        boardJob(
          `board-volume-${String(index + 1).padStart(2, "0")}`,
          `Synthetic role ${String(index + 1)}`,
          `Fixture company ${String(index + 1)}`,
          {
            lastActivity: `Updated ${String((index % 14) + 1)} days ago`,
            nextAction: index % 3 === 0 ? "Review listing" : null,
          },
        ),
      ),
    ]),
    stage: BOARD_STAGES[0],
  },
  ...STANDARD_BOARD_COLUMNS.slice(1),
] as const satisfies readonly BoardColumn[]);

const TABLE_STATUS_OPTIONS = Object.freeze(
  BOARD_STAGES.map(({ id, name, terminal }) => Object.freeze({ id, name, terminal })),
) satisfies readonly PipelineTableStatusOption[];

const tableJob = (
  job: BoardJobCard,
  status: PipelineTableStatusOption,
  index: number,
): PipelineTableJob =>
  Object.freeze({
    appliedDate: status.id === "applied" || status.id === "interviewing" ? "2026-08-21" : null,
    capturedDate: "2026-08-18",
    company: job.company,
    disclosedSalary: index % 3 === 0 ? "$120k–$145k disclosed" : null,
    id: job.id,
    lastInteraction: index % 2 === 0 ? job.lastActivity : null,
    location: job.location,
    marketBand: index % 3 === 0 ? "$118k–$151k local estimate" : null,
    matchSummary:
      index % 2 === 0 ? `${String(5 + (index % 3))} of 8 requirements have linked evidence` : null,
    nextActionDate: job.nextAction === null ? null : "2026-09-03",
    priority: job.priority,
    rowVersion: 1,
    source: index % 2 === 0 ? "Company careers page" : "Manual entry",
    status,
    tags: index % 2 === 0 ? Object.freeze(["reviewed", job.workMode]) : Object.freeze([]),
    title: job.title,
    workMode: job.workMode === "unspecified" ? "Work mode not set" : job.workMode,
  });

const tableRowsFromBoard = (columns: readonly BoardColumn[]): readonly PipelineTableJob[] => {
  let index = 0;
  return Object.freeze(
    columns.flatMap((column) => {
      const status = TABLE_STATUS_OPTIONS.find(({ id }) => id === column.stage.id);
      if (status === undefined) throw new Error("Synthetic Table status fixture is missing.");
      return column.items.map((job) => tableJob(job, status, index++));
    }),
  );
};

const STANDARD_TABLE_ROWS = tableRowsFromBoard(STANDARD_BOARD_COLUMNS);
const STANDARD_BOARD_JOBS = Object.freeze(STANDARD_BOARD_COLUMNS.flatMap(({ items }) => items));

const jobWorkspaceContentFor = (
  job: PipelineTableJob,
  relatedJobs: readonly PipelineTableJob[],
): JobWorkspaceContentModel => {
  const boardRecord = STANDARD_BOARD_JOBS.find(({ id }) => id === job.id);
  const timelineItems: JobWorkspaceContentModel["timeline"]["items"] = Object.freeze([
    ...(job.lastInteraction === null
      ? []
      : [
          Object.freeze({
            detail: "Recorded as local interaction context; no external activity is inferred.",
            editable: false,
            id: `${job.id}-last-interaction`,
            kind: "interaction" as const,
            occurredAtLabel: job.lastInteraction,
            title: "Latest recorded interaction",
          }),
        ]),
    ...(job.tags.includes("reviewed")
      ? [
          Object.freeze({
            detail: "Reviewed the locally stored source candidates.",
            editable: true,
            id: `${job.id}-review-note`,
            kind: "note" as const,
            occurredAtLabel: "After capture",
            title: "Source review note",
          }),
        ]
      : []),
    ...(job.appliedDate === null
      ? []
      : [
          Object.freeze({
            detail: "Application status recorded in the local pipeline fixture.",
            editable: false,
            id: `${job.id}-applied`,
            kind: "status" as const,
            occurredAtLabel: job.appliedDate,
            title: "Marked applied",
          }),
        ]),
    Object.freeze({
      detail: `Captured from ${job.source.toLocaleLowerCase()}.`,
      editable: false,
      id: `${job.id}-captured`,
      kind: "status" as const,
      occurredAtLabel: job.capturedDate,
      title: "Job captured",
    }),
  ]);
  const isCompanySource = job.source === "Company careers page";
  const sourceBasis = isCompanySource
    ? "Stored source record · unconfirmed"
    : "User-entered local record";

  return Object.freeze({
    company: Object.freeze({
      canonicalName: job.company,
      contactCount: 0,
      domain: null,
      notes: "",
      otherActiveJobCount: relatedJobs.filter(
        (candidate) =>
          candidate.id !== job.id &&
          candidate.company === job.company &&
          candidate.status?.terminal !== true,
      ).length,
      outcomeCount: job.status?.terminal === true ? 1 : 0,
      salaryObservationCount: 0,
      websiteUrl: null,
    }),
    jobId: job.id,
    overview: Object.freeze({
      application:
        job.appliedDate === null
          ? null
          : Object.freeze({
              appliedAtLabel: job.appliedDate,
              channel: null,
              notes: "",
            }),
      datePosted: null,
      descriptionText:
        "Synthetic local proof record. Production content will come from the validated Job workspace read model.",
      disclosedCompensation: job.disclosedSalary,
      employmentType: null,
      locationLabel: job.location,
      nextAction:
        job.nextActionDate === null
          ? null
          : Object.freeze({
              dueAtLabel: `Due ${job.nextActionDate}`,
              timeZone: null,
              title: boardRecord?.nextAction ?? "Review local job details",
            }),
      notes: "",
      seniority: null,
      tags: job.tags,
      validThrough: null,
      workplaceType: job.workMode,
    }),
    source: Object.freeze({
      applyUrl: isCompanySource ? `https://careers.example.test/jobs/${job.id}` : null,
      canonicalUrl: isCompanySource ? `https://careers.example.test/jobs/${job.id}` : null,
      comparisonLabel: "No newer snapshot is available for comparison.",
      extractionLabel: isCompanySource
        ? "Stored candidates await user confirmation."
        : "No extraction was run for this manual entry.",
      firstSeenAtLabel: job.capturedDate,
      freshnessLabel: `Captured ${job.capturedDate} · no automatic refresh`,
      id: `source-${job.id}`,
      lastSeenAtLabel: job.capturedDate,
      provenance: Object.freeze([
        Object.freeze({ basis: sourceBasis, field: "Title", value: job.title }),
        Object.freeze({ basis: sourceBasis, field: "Company", value: job.company }),
        Object.freeze({ basis: sourceBasis, field: "Source", value: job.source }),
      ]),
      refreshPolicy: "Manual, user-invoked refresh only; connector policy must permit the source.",
      snapshotLabel: isCompanySource
        ? "One sanitized local snapshot is represented by this fixture."
        : "Manual entry has no captured HTML snapshot.",
    }),
    timeline: Object.freeze({
      itemCount: timelineItems.length,
      items: timelineItems,
      lastInteractionAtLabel: job.lastInteraction,
      pendingReminderCount: job.nextActionDate === null ? 0 : 1,
      upcomingInterviewCount: job.status?.id === "interviewing" ? 1 : 0,
    }),
  });
};

const LARGE_TABLE_ROWS = Object.freeze([
  ...STANDARD_TABLE_ROWS,
  ...Array.from({ length: 1_992 }, (_, index) => {
    const fixtureNumber = index + 1;
    const status = TABLE_STATUS_OPTIONS[fixtureNumber % TABLE_STATUS_OPTIONS.length];
    if (status === undefined) throw new Error("Synthetic Table status fixture is missing.");
    return tableJob(
      boardJob(
        `table-volume-${String(fixtureNumber).padStart(4, "0")}`,
        `Synthetic opportunity ${String(fixtureNumber)}`,
        `Volume company ${String(fixtureNumber)}`,
        {
          lastActivity: `Updated ${String((fixtureNumber % 28) + 1)} days ago`,
          nextAction: fixtureNumber % 4 === 0 ? null : "Review local notes",
          priority: fixtureNumber % 7 === 0 ? "high" : "normal",
        },
      ),
      status,
      fixtureNumber,
    );
  }),
] as const satisfies readonly PipelineTableJob[]);

const INITIAL_TABLE_CONFIGURATIONS: Readonly<
  Record<string, readonly PipelineTableColumnConfiguration[]>
> = Object.freeze(
  Object.fromEntries(
    PIPELINE_SAVED_VIEWS.map(({ id }) => [
      id,
      Object.freeze(DEFAULT_PIPELINE_TABLE_COLUMNS.map((column) => Object.freeze({ ...column }))),
    ]),
  ),
);

interface BoardUndoRecord {
  readonly fromStageId: string;
  readonly jobId: string;
  readonly title: string;
  readonly toStageId: string;
}

const moveBoardJob = (
  columns: readonly BoardColumn[],
  request: BoardMoveRequest,
): { readonly columns: readonly BoardColumn[]; readonly job: BoardJobCard } | null => {
  const source = columns.find(({ stage }) => stage.id === request.fromStageId);
  const target = columns.find(({ stage }) => stage.id === request.toStageId);
  const job = source?.items.find(({ id }) => id === request.jobId);
  if (source === undefined || target === undefined || job === undefined || source === target) {
    return null;
  }
  return Object.freeze({
    columns: Object.freeze(
      columns.map((column) => {
        if (column === source) {
          return Object.freeze({
            ...column,
            items: Object.freeze(column.items.filter(({ id }) => id !== request.jobId)),
          });
        }
        if (column === target) {
          return Object.freeze({ ...column, items: Object.freeze([...column.items, job]) });
        }
        return column;
      }),
    ),
    job,
  });
};

const AppShellCatalog = () => {
  const appearance = useMemo(readAppearance, []);
  const initialLocation = useMemo(readInitialLocation, []);
  const initialPipelineSnapshot = useMemo(() => readPipelineSnapshot(window.history.state), []);
  const initialJobRoute = useMemo<JobRouteState | null>(() => {
    if (initialLocation.kind !== "job") return null;
    const historyState = readJobHistoryState(window.history.state);
    const contextual =
      historyState?.mode === "contextual" &&
      !navigationWasReloaded() &&
      window.matchMedia("(min-width: 80rem)").matches;
    return Object.freeze({
      jobId: initialLocation.jobId,
      mode: contextual ? "contextual" : "full-page",
      responsiveContextual: contextual,
      returnSnapshot: historyState?.returnSnapshot ?? null,
      tab: initialLocation.tab,
    });
  }, [initialLocation]);
  const [activeDestination, setActiveDestination] = useState<ShellDestinationId>(
    initialLocation.kind === "pipeline" || initialLocation.kind === "job"
      ? "pipeline"
      : initialLocation.kind === "network"
        ? "network"
        : initialLocation.kind === "destination"
          ? initialLocation.destination
          : "home",
  );
  const [boardAnnouncement, setBoardAnnouncement] = useState("");
  const [boardColumns, setBoardColumns] = useState<readonly BoardColumn[]>(
    appearance.boardMode === "large" ? LARGE_BOARD_COLUMNS : STANDARD_BOARD_COLUMNS,
  );
  const [boardTimelineEventCount, setBoardTimelineEventCount] = useState(0);
  const [boardUndo, setBoardUndo] = useState<BoardUndoRecord | null>(null);
  const [homeSnapshotVisible, setHomeSnapshotVisible] = useState(true);
  const [networkInteractionDraftCount, setNetworkInteractionDraftCount] = useState(0);
  const [networkTab, setNetworkTab] = useState<NetworkTabId>(
    initialLocation.kind === "network" ? initialLocation.tab : "companies",
  );
  const [networkSelectedCompanyId, setNetworkSelectedCompanyId] = useState<string | null>(
    initialLocation.kind === "network" &&
      initialLocation.tab === "companies" &&
      NETWORK_MODEL.companies.some(({ id }) => id === initialLocation.recordId)
      ? initialLocation.recordId
      : null,
  );
  const [networkSelectedContactId, setNetworkSelectedContactId] = useState<string | null>(
    initialLocation.kind === "network" &&
      initialLocation.tab === "contacts" &&
      NETWORK_MODEL.contacts.some(({ id }) => id === initialLocation.recordId)
      ? initialLocation.recordId
      : null,
  );
  const [pipelineFilters, setPipelineFilters] = useState<readonly PipelineFilterChip[]>(
    initialPipelineSnapshot?.filters ?? INITIAL_PIPELINE_FILTERS,
  );
  const [pipelineSavedViewId, setPipelineSavedViewId] = useState(
    PIPELINE_SAVED_VIEWS.some(
      ({ id }) =>
        id ===
        (initialPipelineSnapshot?.savedViewId ??
          (initialLocation.kind === "pipeline" ? initialLocation.savedViewId : "active-search")),
    )
      ? (initialPipelineSnapshot?.savedViewId ??
          (initialLocation.kind === "pipeline" ? initialLocation.savedViewId : "active-search"))
      : "active-search",
  );
  const [pipelineSearchQuery, setPipelineSearchQuery] = useState(
    initialPipelineSnapshot?.searchQuery ?? "",
  );
  const [pipelineSelectedJobIds, setPipelineSelectedJobIds] = useState<readonly string[]>(
    initialPipelineSnapshot?.selectedJobIds ??
      Object.freeze(
        STANDARD_TABLE_ROWS.slice(0, appearance.pipelineSelectionCount).map(({ id }) => id),
      ),
  );
  const [pipelineView, setPipelineView] = useState<PipelineViewId>(
    initialPipelineSnapshot?.view ??
      (initialLocation.kind === "pipeline" ? initialLocation.view : appearance.pipelineView),
  );
  const [tableColumnSaveCount, setTableColumnSaveCount] = useState(0);
  const [tableConfigurations, setTableConfigurations] = useState(INITIAL_TABLE_CONFIGURATIONS);
  const [tableEditCount, setTableEditCount] = useState(0);
  const [tableRows, setTableRows] = useState<readonly PipelineTableJob[]>(
    appearance.tableMode === "large" ? LARGE_TABLE_ROWS : STANDARD_TABLE_ROWS,
  );
  const [workspaceRoute, setWorkspaceRoute] = useState<JobRouteState | null>(initialJobRoute);
  const [workspaceWidth, setWorkspaceWidth] = useState(640);
  const [lastActivity, setLastActivity] = useState(
    appearance.workspaceState === null
      ? "Shell ready. All displayed records are synthetic."
      : `State proof ready: ${appearance.workspaceState}. All displayed records are synthetic.`,
  );
  const homeModel: HomeDashboardModel =
    appearance.homeMode === "empty"
      ? EMPTY_HOME_MODEL
      : homeSnapshotVisible
        ? READY_HOME_MODEL
        : Object.freeze({ ...READY_HOME_MODEL, snapshot: null });
  const filteredBoardColumns = useMemo(
    () =>
      Object.freeze(
        boardColumns.map((column) =>
          Object.freeze({
            ...column,
            items: Object.freeze(
              column.items.filter((job) =>
                matchesLocalSearchQuery([job.title, job.company], pipelineSearchQuery),
              ),
            ),
          }),
        ),
      ),
    [boardColumns, pipelineSearchQuery],
  );
  const filteredTableRows = useMemo(
    () =>
      Object.freeze(
        tableRows.filter((job) =>
          matchesLocalSearchQuery([job.title, job.company], pipelineSearchQuery),
        ),
      ),
    [pipelineSearchQuery, tableRows],
  );
  const boardTotalCount = boardColumns.reduce((count, column) => count + column.items.length, 0);
  const boardMatchingCount = filteredBoardColumns.reduce(
    (count, column) => count + column.items.length,
    0,
  );
  const visiblePipelineJobIds = new Set(
    pipelineView === "board"
      ? filteredBoardColumns.flatMap(({ items }) => items.map(({ id }) => id))
      : filteredTableRows.map(({ id }) => id),
  );
  const visiblePipelineSelectedJobIds = pipelineSelectedJobIds.filter((id) =>
    visiblePipelineJobIds.has(id),
  );
  const pipelineMatchingCount =
    pipelineView === "board" ? boardMatchingCount : filteredTableRows.length;
  const pipelineTotalCount = pipelineView === "board" ? boardTotalCount : tableRows.length;
  const pipelineSelectedCount = visiblePipelineSelectedJobIds.length;
  const tableConfiguration =
    tableConfigurations[pipelineSavedViewId] ?? DEFAULT_PIPELINE_TABLE_COLUMNS;
  const workspaceJob =
    workspaceRoute === null
      ? undefined
      : (tableRows.find(({ id }) => id === workspaceRoute.jobId) ??
        STANDARD_TABLE_ROWS.find(({ id }) => id === workspaceRoute.jobId));
  const workspaceModel: JobWorkspaceFrameModel | null =
    workspaceJob === undefined
      ? null
      : Object.freeze({
          company: workspaceJob.company,
          id: workspaceJob.id,
          nextAction:
            workspaceJob.nextActionDate === null ? null : `Due ${workspaceJob.nextActionDate}`,
          priority: workspaceJob.priority,
          sourceFreshness: `Captured ${workspaceJob.capturedDate}`,
          sourceLabel: workspaceJob.source,
          status: workspaceJob.status?.name ?? "Unassigned",
          title: workspaceJob.title,
        });
  const workspaceContentModel =
    workspaceJob === undefined ? null : jobWorkspaceContentFor(workspaceJob, tableRows);
  const page =
    workspaceRoute?.mode === "full-page" && workspaceModel !== null
      ? Object.freeze({ eyebrow: "Local job workspace", title: workspaceModel.title })
      : PAGE_COPY[activeDestination];
  const pipelineModel: PipelineShellModel = Object.freeze({
    activeSavedViewId: pipelineSavedViewId,
    activeView: pipelineView,
    filters: pipelineFilters,
    inboxCount: 3,
    matchingCount: pipelineMatchingCount,
    savedViews: PIPELINE_SAVED_VIEWS,
    searchQuery: pipelineSearchQuery,
    selectedCount: pipelineSelectedCount,
    sortLabel: "Recently updated",
    totalCount: pipelineTotalCount,
  });

  useEffect(() => {
    const root = document.documentElement;
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const attributes = getRootAppearanceAttributes({
      density: appearance.density,
      prefersDark,
      prefersReducedMotion,
      theme: appearance.theme,
    });
    root.dataset["theme"] = attributes["data-theme"];
    root.dataset["density"] = attributes["data-density"];
    root.dataset["motion"] = attributes["data-motion"];
  }, [appearance]);

  useEffect(() => {
    globalThis.coredrillAppShell = Object.freeze({
      getState: () =>
        Object.freeze({
          activeDestination,
          boardAnnouncement,
          boardTimelineEventCount,
          boardUndoAvailable: boardUndo !== null,
          density: appearance.density,
          homeMode: appearance.homeMode,
          homeSnapshotVisible,
          lastActivity,
          networkInteractionDraftCount,
          networkSelectedCompanyId,
          networkSelectedContactId,
          networkTab,
          pipelineFilterCount: pipelineFilters.length,
          pipelineSavedViewId,
          pipelineSearchQuery,
          pipelineSelectedCount,
          pipelineView,
          tableColumnSaveCount,
          tableEditCount,
          theme: appearance.theme,
          vaultHealth: appearance.vaultHealth,
          workspaceJobId: workspaceRoute?.jobId ?? null,
          workspaceMode: workspaceRoute?.mode ?? null,
          workspaceState: appearance.workspaceState,
          workspaceTab: workspaceRoute?.tab ?? null,
        }),
    });
  }, [
    activeDestination,
    appearance,
    boardAnnouncement,
    boardTimelineEventCount,
    boardUndo,
    homeSnapshotVisible,
    lastActivity,
    networkInteractionDraftCount,
    networkSelectedCompanyId,
    networkSelectedContactId,
    networkTab,
    pipelineFilters.length,
    pipelineSavedViewId,
    pipelineSearchQuery,
    pipelineSelectedCount,
    pipelineView,
    tableColumnSaveCount,
    tableEditCount,
    workspaceRoute,
  ]);

  const recordAction = (action: ShellActionId): void => {
    setLastActivity(`Action selected: ${action}. No external request was made.`);
  };

  const recordHomeAction = (action: HomeDashboardActionId): void => {
    setLastActivity(`Home action selected: ${action}. No external request was made.`);
  };

  const openRecent = (item: HomeRecentItem): void => {
    setLastActivity(`Opened recent local ${item.kind}: ${item.title}.`);
  };

  const recordPipelineAction = (action: PipelineShellActionId): void => {
    setLastActivity(`Pipeline control selected: ${action}. No external request was made.`);
  };

  const recordPipelineBulkAction = (action: PipelineBulkActionId): void => {
    setLastActivity(
      `Bulk action prepared for ${String(pipelineSelectedCount)} local jobs: ${action}. No records changed.`,
    );
  };

  const recordWorkspaceStateAction = (action: PhaseOneWorkspaceStateAction): void => {
    setLastActivity(
      `State recovery selected: ${action.id}. Existing work remains local; no external request was made.`,
    );
  };

  const capturePipelineSnapshot = (focus: PipelineReturnFocus): PipelineNavigationSnapshot => {
    const boardColumns = document.querySelector<HTMLElement>(".cd-board-columns");
    const tableScroll = document.querySelector<HTMLElement>(".cd-table-scroll");
    return Object.freeze({
      boardColumnsScroll:
        boardColumns === null
          ? null
          : Object.freeze({ left: boardColumns.scrollLeft, top: boardColumns.scrollTop }),
      boardScroll: Object.freeze(
        Array.from(document.querySelectorAll<HTMLElement>("[data-board-stage]")).flatMap(
          (stage) => {
            const scroll = stage.querySelector<HTMLElement>(".cd-board-column-scroll");
            const stageId = stage.dataset["boardStage"];
            return scroll === null || stageId === undefined
              ? []
              : [
                  Object.freeze({
                    left: scroll.scrollLeft,
                    stageId,
                    top: scroll.scrollTop,
                  }),
                ];
          },
        ),
      ),
      filters: Object.freeze(pipelineFilters.map((filter) => Object.freeze({ ...filter }))),
      focus: Object.freeze(focus),
      savedViewId: pipelineSavedViewId,
      searchQuery: pipelineSearchQuery,
      selectedJobIds: Object.freeze([...pipelineSelectedJobIds]),
      tableScroll:
        tableScroll === null
          ? null
          : Object.freeze({ left: tableScroll.scrollLeft, top: tableScroll.scrollTop }),
      view: pipelineView,
      windowScrollY: window.scrollY,
    });
  };

  const restorePipelineSnapshot = (snapshot: PipelineNavigationSnapshot): void => {
    setPipelineFilters(snapshot.filters);
    setPipelineSavedViewId(
      PIPELINE_SAVED_VIEWS.some(({ id }) => id === snapshot.savedViewId)
        ? snapshot.savedViewId
        : "active-search",
    );
    setPipelineSearchQuery(snapshot.searchQuery);
    setPipelineSelectedJobIds(snapshot.selectedJobIds);
    setPipelineView(snapshot.view);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const boardColumns = document.querySelector<HTMLElement>(".cd-board-columns");
        if (boardColumns !== null && snapshot.boardColumnsScroll !== null) {
          boardColumns.scrollTo(snapshot.boardColumnsScroll);
        }
        for (const position of snapshot.boardScroll) {
          const stage = Array.from(
            document.querySelectorAll<HTMLElement>("[data-board-stage]"),
          ).find((candidate) => candidate.dataset["boardStage"] === position.stageId);
          stage?.querySelector<HTMLElement>(".cd-board-column-scroll")?.scrollTo(position);
        }
        const tableScroll = document.querySelector<HTMLElement>(".cd-table-scroll");
        if (tableScroll !== null && snapshot.tableScroll !== null) {
          tableScroll.scrollTo(snapshot.tableScroll);
        }
        window.scrollTo({ top: snapshot.windowScrollY });
        const recordAttribute = snapshot.focus.source === "board" ? "boardJob" : "tableJob";
        const record = Array.from(
          document.querySelectorAll<HTMLElement>(
            snapshot.focus.source === "board" ? "[data-board-job]" : "[data-table-job]",
          ),
        ).find((candidate) => candidate.dataset[recordAttribute] === snapshot.focus.jobId);
        record
          ?.querySelector<HTMLElement>(
            snapshot.focus.source === "board" ? ".cd-board-card-title" : ".cd-table-open-job",
          )
          ?.focus();
      });
    });
  };

  const openJobWorkspace = (jobId: string, source: PipelineReturnFocus["source"]): void => {
    const snapshot = capturePipelineSnapshot({ jobId, source });
    const mode: JobWorkspaceMode = window.matchMedia("(min-width: 80rem)").matches
      ? "contextual"
      : "full-page";
    window.history.replaceState(
      { kind: PIPELINE_HISTORY_KIND, snapshot },
      "",
      pipelineUrl(pipelineView, pipelineSavedViewId),
    );
    window.history.pushState(
      { kind: JOB_HISTORY_KIND, mode, snapshot },
      "",
      jobUrl(jobId, "overview"),
    );
    setWorkspaceRoute({
      jobId,
      mode,
      responsiveContextual: mode === "contextual",
      returnSnapshot: snapshot,
      tab: "overview",
    });
    setLastActivity(
      `Opened ${mode === "contextual" ? "contextual" : "full-page"} local Job workspace.`,
    );
  };

  const navigateToPipelineFallback = (): void => {
    const url = pipelineUrl(pipelineView, pipelineSavedViewId);
    window.history.pushState({ kind: PIPELINE_HISTORY_KIND, snapshot: null }, "", url);
    setActiveDestination("pipeline");
    setWorkspaceRoute(null);
    setLastActivity("Returned to the local Pipeline.");
  };

  const closeWorkspace = (): void => {
    if (workspaceRoute?.returnSnapshot === null || workspaceRoute === null) {
      navigateToPipelineFallback();
      return;
    }
    window.history.back();
  };

  const changeWorkspaceTab = (tab: JobWorkspaceTabId): void => {
    if (workspaceRoute === null || tab === workspaceRoute.tab) return;
    window.history.pushState(
      {
        kind: JOB_HISTORY_KIND,
        mode: workspaceRoute.mode,
        snapshot: workspaceRoute.returnSnapshot,
      },
      "",
      jobUrl(workspaceRoute.jobId, tab),
    );
    setWorkspaceRoute({ ...workspaceRoute, tab });
    setLastActivity(`Opened local Job workspace tab: ${tab}.`);
  };

  const recordWorkspaceAction = (action: JobWorkspaceActionId): void => {
    if (action === "open-source") {
      changeWorkspaceTab("source");
      return;
    }
    setLastActivity(`Job workspace action selected: ${action}. No external request was made.`);
  };

  const recordWorkspaceContentAction = (request: JobWorkspaceContentActionRequest): void => {
    if (request.id === "open-timeline") {
      changeWorkspaceTab("timeline");
      return;
    }
    if (request.id === "add-timeline-note") {
      setLastActivity(
        `Prepared a ${String(request.value.length)}-character local timeline note. No durable write occurs in this proof host.`,
      );
      return;
    }
    setLastActivity(
      `Job content action selected: ${request.id}. No durable write or external request occurred.`,
    );
  };

  const changeNetworkTab = (tab: NetworkTabId): void => {
    if (tab === networkTab) return;
    window.history.pushState(null, "", networkUrl(tab));
    setNetworkTab(tab);
    setLastActivity(`Opened local Network view: ${tab}.`);
  };

  const recordNetworkAction = (request: NetworkActionRequest): void => {
    if (request.id === "select-company" && request.targetId !== undefined) {
      setNetworkSelectedCompanyId(request.targetId);
      if (networkTab === "companies") {
        window.history.replaceState(null, "", networkUrl("companies", request.targetId));
      }
    }
    if (request.id === "select-contact" && request.targetId !== undefined) {
      setNetworkSelectedContactId(request.targetId);
      if (networkTab === "contacts") {
        window.history.replaceState(null, "", networkUrl("contacts", request.targetId));
      }
    }
    if (request.id === "log-interaction") {
      setNetworkInteractionDraftCount((count) => count + 1);
      setLastActivity(
        `Prepared a ${String(request.draft.summary.length)}-character ${request.draft.type} interaction for local logging. No durable write or message send occurs in this proof host.`,
      );
      return;
    }
    if (request.id === "snooze-reminder") {
      setLastActivity("Prepared a local reminder snooze. The relationship record was not changed.");
      return;
    }
    if (request.id === "disable-reminder") {
      setLastActivity(
        "Prepared a local reminder opt-out. The relationship record was not changed.",
      );
      return;
    }
    setLastActivity(
      `Network action selected: ${request.id}. No durable write, enrichment, outreach, or external request occurred.`,
    );
  };

  const openGlobalSearchResult = (result: LocalSearchResult): void => {
    if (result.kind === "job") {
      const match = JOB_ROUTE.exec(result.href);
      const jobId = match?.groups?.["jobId"];
      const tab = match?.groups?.["tab"];
      if (
        jobId === undefined ||
        !isJobWorkspaceTab(tab) ||
        !tableRows.some(({ id }) => id === jobId)
      ) {
        setLastActivity("The selected local job destination is unavailable.");
        return;
      }
      window.history.pushState(
        { kind: JOB_HISTORY_KIND, mode: "full-page", snapshot: null },
        "",
        result.href,
      );
      setActiveDestination("pipeline");
      setWorkspaceRoute({
        jobId,
        mode: "full-page",
        responsiveContextual: false,
        returnSnapshot: null,
        tab,
      });
    } else if (result.kind === "company") {
      const companyId = result.href.split("/").filter(Boolean).at(-1) ?? "";
      if (!NETWORK_MODEL.companies.some(({ id }) => id === companyId)) {
        setLastActivity("The selected local company destination is unavailable.");
        return;
      }
      window.history.pushState(null, "", result.href);
      setWorkspaceRoute(null);
      setActiveDestination("network");
      setNetworkSelectedCompanyId(companyId);
      setNetworkTab("companies");
    } else if (result.kind === "contact") {
      const contactId = result.href.split("/").filter(Boolean).at(-1) ?? "";
      if (!NETWORK_MODEL.contacts.some(({ id }) => id === contactId)) {
        setLastActivity("The selected local contact destination is unavailable.");
        return;
      }
      window.history.pushState(null, "", result.href);
      setWorkspaceRoute(null);
      setActiveDestination("network");
      setNetworkSelectedContactId(contactId);
      setNetworkTab("contacts");
    } else {
      window.history.pushState(null, "", result.href);
      setWorkspaceRoute(null);
      setActiveDestination("documents");
    }
    setLastActivity(`Opened local ${result.kind}: ${result.title}.`);
  };

  const navigateDestination = (destination: ShellDestinationId): void => {
    setWorkspaceRoute(null);
    setActiveDestination(destination);
    if (destination === "pipeline") {
      window.history.pushState(
        { kind: PIPELINE_HISTORY_KIND, snapshot: null },
        "",
        pipelineUrl(pipelineView, pipelineSavedViewId),
      );
    } else if (destination === "network") {
      setNetworkSelectedCompanyId(null);
      setNetworkSelectedContactId(null);
      setNetworkTab("companies");
      window.history.pushState(null, "", networkUrl("companies"));
    } else {
      window.history.pushState(null, "", DESTINATION_URLS[destination]);
    }
    setLastActivity(`Opened ${PAGE_COPY[destination].title} locally.`);
  };

  useEffect(() => {
    const handlePopState = (event: PopStateEvent): void => {
      const location = readInitialLocation();
      if (location.kind === "job") {
        const historyState = readJobHistoryState(event.state);
        const mode: JobWorkspaceMode =
          historyState?.mode === "contextual" && window.matchMedia("(min-width: 80rem)").matches
            ? "contextual"
            : "full-page";
        setActiveDestination("pipeline");
        setWorkspaceRoute({
          jobId: location.jobId,
          mode,
          responsiveContextual: historyState?.mode === "contextual",
          returnSnapshot: historyState?.returnSnapshot ?? null,
          tab: location.tab,
        });
        setLastActivity(`Restored local Job workspace history at ${location.tab}.`);
        return;
      }
      setWorkspaceRoute(null);
      if (location.kind === "network") {
        setActiveDestination("network");
        setNetworkSelectedCompanyId(
          location.tab === "companies" &&
            NETWORK_MODEL.companies.some(({ id }) => id === location.recordId)
            ? location.recordId
            : null,
        );
        setNetworkSelectedContactId(
          location.tab === "contacts" &&
            NETWORK_MODEL.contacts.some(({ id }) => id === location.recordId)
            ? location.recordId
            : null,
        );
        setNetworkTab(location.tab);
        setLastActivity(`Restored local Network history at ${location.tab}.`);
      } else if (location.kind === "pipeline") {
        setActiveDestination("pipeline");
        const snapshot = readPipelineSnapshot(event.state);
        if (snapshot === null) {
          setPipelineView(location.view);
          setPipelineSavedViewId(
            PIPELINE_SAVED_VIEWS.some(({ id }) => id === location.savedViewId)
              ? location.savedViewId
              : "active-search",
          );
        } else {
          restorePipelineSnapshot(snapshot);
        }
        setLastActivity("Restored the exact local Pipeline return context.");
      } else if (location.kind === "destination") {
        setActiveDestination(location.destination);
        setLastActivity(`Restored ${PAGE_COPY[location.destination].title} locally.`);
      } else {
        setActiveDestination("home");
        setLastActivity("Returned to Home locally.");
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  });

  useEffect(() => {
    if (workspaceRoute?.mode !== "contextual") return undefined;
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") closeWorkspace();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
    };
  });

  useEffect(() => {
    const widePipeline = window.matchMedia("(min-width: 80rem)");
    const updateWorkspaceMode = (): void => {
      if (workspaceRoute?.responsiveContextual !== true) return;
      const mode: JobWorkspaceMode = widePipeline.matches ? "contextual" : "full-page";
      if (mode !== workspaceRoute.mode) setWorkspaceRoute({ ...workspaceRoute, mode });
    };
    widePipeline.addEventListener("change", updateWorkspaceMode);
    return () => {
      widePipeline.removeEventListener("change", updateWorkspaceMode);
    };
  });

  const requestTableEdit = (request: PipelineTableEditRequest): PipelineTableEditResult => {
    const current = tableRows.find(({ id }) => id === request.jobId);
    if (
      current?.rowVersion !== request.expectedRowVersion ||
      appearance.tableEditMode === "conflict"
    ) {
      const error =
        "This job changed before the edit could commit. Review the current local value and try again.";
      setLastActivity(error);
      return { error, ok: false };
    }

    let updated: PipelineTableJob;
    let message: string;
    if (request.field === "status") {
      const target = TABLE_STATUS_OPTIONS.find(({ id }) => id === request.value);
      if (
        target === undefined ||
        target.id === current.status?.id ||
        (current.status?.terminal === true && !target.terminal && !request.reopenConfirmed)
      ) {
        const error = "The requested status change was rejected without changing the local job.";
        setLastActivity(error);
        return { error, ok: false };
      }
      updated = Object.freeze({ ...current, rowVersion: current.rowVersion + 1, status: target });
      message = `Changed ${current.title} to ${target.name}. A timeline-event and undo intent were requested locally.`;
      const fromStageId = current.status?.id;
      if (fromStageId !== undefined) {
        const moved = moveBoardJob(boardColumns, {
          fromStageId,
          jobId: current.id,
          method: "keyboard",
          requiresReopenConfirmation: false,
          toStageId: target.id,
        });
        if (moved !== null) {
          setBoardColumns(moved.columns);
          setBoardTimelineEventCount((count) => count + 1);
          setBoardUndo({
            fromStageId,
            jobId: current.id,
            title: current.title,
            toStageId: target.id,
          });
        }
      }
    } else if (request.field === "priority") {
      updated = Object.freeze({
        ...current,
        priority: request.value,
        rowVersion: current.rowVersion + 1,
      });
      message = `Changed ${current.title} priority to ${request.value} locally.`;
      setBoardColumns((columns) =>
        Object.freeze(
          columns.map((column) =>
            Object.freeze({
              ...column,
              items: Object.freeze(
                column.items.map((job) =>
                  job.id === current.id ? Object.freeze({ ...job, priority: request.value }) : job,
                ),
              ),
            }),
          ),
        ),
      );
    } else if (request.field === "tags") {
      updated = Object.freeze({
        ...current,
        rowVersion: current.rowVersion + 1,
        tags: Object.freeze([...request.value]),
      });
      message = `Changed ${current.title} tags locally.`;
    } else {
      updated = Object.freeze({
        ...current,
        nextActionDate: request.value,
        rowVersion: current.rowVersion + 1,
      });
      message = `Changed ${current.title} next-action date locally.`;
    }

    setTableRows((rows) =>
      Object.freeze(rows.map((row) => (row.id === current.id ? updated : row))),
    );
    setTableEditCount((count) => count + 1);
    setLastActivity(message);
    return { announcement: message, ok: true };
  };

  const requestBoardMove = (request: BoardMoveRequest): void => {
    const sourceName = boardColumns.find(({ stage }) => stage.id === request.fromStageId)?.stage
      .name;
    const targetName = boardColumns.find(({ stage }) => stage.id === request.toStageId)?.stage.name;
    const jobTitle = boardColumns
      .find(({ stage }) => stage.id === request.fromStageId)
      ?.items.find(({ id }) => id === request.jobId)?.title;
    if (request.requiresReopenConfirmation) {
      const message = `Reopening ${jobTitle ?? "this job"} from ${sourceName ?? "a closed stage"} requires explicit confirmation. No move was made.`;
      setBoardAnnouncement(message);
      setLastActivity(message);
      return;
    }
    const result = moveBoardJob(boardColumns, request);
    if (result === null) return;
    const message = `Moved ${result.job.title} from ${sourceName ?? "its prior stage"} to ${targetName ?? "the selected stage"} by ${request.method}. Timeline event recorded; undo is available.`;
    setBoardColumns(result.columns);
    const targetStatus = TABLE_STATUS_OPTIONS.find(({ id }) => id === request.toStageId);
    if (targetStatus !== undefined) {
      setTableRows((rows) =>
        Object.freeze(
          rows.map((row) =>
            row.id === request.jobId
              ? Object.freeze({ ...row, rowVersion: row.rowVersion + 1, status: targetStatus })
              : row,
          ),
        ),
      );
    }
    setBoardTimelineEventCount((count) => count + 1);
    setBoardUndo({
      fromStageId: request.fromStageId,
      jobId: request.jobId,
      title: result.job.title,
      toStageId: request.toStageId,
    });
    setBoardAnnouncement(message);
    setLastActivity(message);
  };

  const undoBoardMove = (): void => {
    if (boardUndo === null) return;
    const result = moveBoardJob(boardColumns, {
      fromStageId: boardUndo.toStageId,
      jobId: boardUndo.jobId,
      method: "keyboard",
      requiresReopenConfirmation: false,
      toStageId: boardUndo.fromStageId,
    });
    if (result === null) return;
    const message = `Restored ${boardUndo.title} to its prior stage. The original timeline event remains and a reversal was recorded.`;
    setBoardColumns(result.columns);
    const restoredStatus = TABLE_STATUS_OPTIONS.find(({ id }) => id === boardUndo.fromStageId);
    if (restoredStatus !== undefined) {
      setTableRows((rows) =>
        Object.freeze(
          rows.map((row) =>
            row.id === boardUndo.jobId
              ? Object.freeze({ ...row, rowVersion: row.rowVersion + 1, status: restoredStatus })
              : row,
          ),
        ),
      );
    }
    setBoardTimelineEventCount((count) => count + 1);
    setBoardUndo(null);
    setBoardAnnouncement(message);
    setLastActivity(message);
  };

  return (
    <ApplicationShell
      activeDestination={activeDestination}
      inboxCount={3}
      onAction={recordAction}
      onNavigate={navigateDestination}
      onSearchResult={openGlobalSearchResult}
      outboxCount={2}
      searchResults={SEARCH_RESULTS}
      vault={{
        health: appearance.workspaceState === "offline" ? "offline" : appearance.vaultHealth,
        kind: "browser",
        name: "Job search 2026",
      }}
    >
      <div className="mx-auto grid max-w-[90rem] gap-5">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="m-0 text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-text-subtle)]">
              {page.eyebrow}
            </p>
            <h1 className="cd-shell-page-title mt-1" data-testid="page-title">
              {page.title}
            </h1>
          </div>
          <p className="m-0 max-w-xl text-sm text-[var(--color-text-muted)]" role="status">
            {lastActivity}
          </p>
        </header>

        {appearance.workspaceState !== null ? (
          <PhaseOneWorkspaceState
            model={PHASE_ONE_WORKSPACE_STATE_CATALOG[appearance.workspaceState]}
            onAction={recordWorkspaceStateAction}
          />
        ) : activeDestination === "home" ? (
          <HomeDashboard
            model={homeModel}
            onAction={recordHomeAction}
            onDismissSnapshot={() => {
              setHomeSnapshotVisible(false);
              setLastActivity(
                "Optional Home snapshot hidden. Core attention items remain visible.",
              );
            }}
            onNavigateRecent={openRecent}
          />
        ) : activeDestination === "pipeline" ? (
          workspaceRoute?.mode === "full-page" && workspaceModel !== null ? (
            <JobWorkspaceFrame
              activeTab={workspaceRoute.tab}
              mode="full-page"
              model={workspaceModel}
              onAction={recordWorkspaceAction}
              onRequestClose={closeWorkspace}
              onTabChange={changeWorkspaceTab}
            >
              {workspaceContentModel !== null && isJobWorkspaceContentTab(workspaceRoute.tab) ? (
                <JobWorkspaceContent
                  activeTab={workspaceRoute.tab}
                  model={workspaceContentModel}
                  onAction={recordWorkspaceContentAction}
                />
              ) : undefined}
            </JobWorkspaceFrame>
          ) : (
            <div
              className={
                workspaceRoute?.mode === "contextual" && workspaceModel !== null
                  ? "cd-pipeline-workspace-layout"
                  : undefined
              }
            >
              <PipelineShell
                model={pipelineModel}
                onAction={recordPipelineAction}
                onBulkAction={recordPipelineBulkAction}
                onClearFilters={() => {
                  setPipelineFilters(Object.freeze([]));
                  setLastActivity("Cleared the visible Pipeline filters locally.");
                }}
                onClearSelection={() => {
                  setPipelineSelectedJobIds(Object.freeze([]));
                  setLastActivity("Cleared the local Pipeline selection.");
                }}
                onRemoveFilter={(filter) => {
                  setPipelineFilters((current) =>
                    Object.freeze(current.filter(({ id }) => id !== filter.id)),
                  );
                  setLastActivity(`Removed local filter: ${filter.label}.`);
                }}
                onSavedViewChange={(savedView) => {
                  setPipelineSavedViewId(savedView.id);
                  if (workspaceRoute === null) {
                    window.history.replaceState(
                      window.history.state,
                      "",
                      pipelineUrl(pipelineView, savedView.id),
                    );
                  }
                  setLastActivity(`Opened saved local view: ${savedView.label}.`);
                }}
                onSearchQueryChange={(query) => {
                  setPipelineSearchQuery(query);
                  setLastActivity(
                    query === "" ? "Cleared Pipeline search." : `Searched local jobs: ${query}.`,
                  );
                }}
                onViewChange={(view) => {
                  setPipelineView(view);
                  if (workspaceRoute === null) {
                    window.history.replaceState(
                      window.history.state,
                      "",
                      pipelineUrl(view, pipelineSavedViewId),
                    );
                  }
                  setLastActivity(
                    `Changed Pipeline presentation to ${view}. The record set remains unchanged.`,
                  );
                }}
              >
                {pipelineView === "board" ? (
                  <PipelineBoard
                    announcement={boardAnnouncement}
                    columns={filteredBoardColumns}
                    onMoveRequest={requestBoardMove}
                    onOpenJob={(job) => {
                      openJobWorkspace(job.id, "board");
                    }}
                    onUndo={undoBoardMove}
                    undo={
                      boardUndo === null
                        ? null
                        : {
                            description: `${boardUndo.title} moved. The original timeline event will remain if you undo.`,
                          }
                    }
                  />
                ) : (
                  <PipelineTable
                    columnConfiguration={tableConfiguration}
                    onColumnConfigurationChange={(configuration) => {
                      setTableConfigurations((current) =>
                        Object.freeze({ ...current, [pipelineSavedViewId]: configuration }),
                      );
                      setTableColumnSaveCount((count) => count + 1);
                      setLastActivity(
                        `Saved Table columns for ${PIPELINE_SAVED_VIEWS.find(({ id }) => id === pipelineSavedViewId)?.label ?? "this local view"}.`,
                      );
                    }}
                    onEditRequest={requestTableEdit}
                    onOpenJob={(job) => {
                      openJobWorkspace(job.id, "table");
                    }}
                    onSelectionChange={(job, selected) => {
                      setPipelineSelectedJobIds((current) =>
                        selected
                          ? Object.freeze([...new Set([...current, job.id])])
                          : Object.freeze(current.filter((id) => id !== job.id)),
                      );
                      setLastActivity(
                        `${selected ? "Selected" : "Cleared"} ${job.title} for local bulk actions.`,
                      );
                    }}
                    rows={filteredTableRows}
                    selectedJobIds={visiblePipelineSelectedJobIds}
                    statusOptions={TABLE_STATUS_OPTIONS}
                    viewName={
                      PIPELINE_SAVED_VIEWS.find(({ id }) => id === pipelineSavedViewId)?.label ??
                      "Current view"
                    }
                  />
                )}
              </PipelineShell>
              {workspaceRoute?.mode === "contextual" && workspaceModel !== null ? (
                <JobWorkspaceFrame
                  activeTab={workspaceRoute.tab}
                  contextualWidth={workspaceWidth}
                  mode="contextual"
                  model={workspaceModel}
                  onAction={recordWorkspaceAction}
                  onContextualWidthChange={setWorkspaceWidth}
                  onRequestClose={closeWorkspace}
                  onTabChange={changeWorkspaceTab}
                >
                  {workspaceContentModel !== null &&
                  isJobWorkspaceContentTab(workspaceRoute.tab) ? (
                    <JobWorkspaceContent
                      activeTab={workspaceRoute.tab}
                      model={workspaceContentModel}
                      onAction={recordWorkspaceContentAction}
                    />
                  ) : undefined}
                </JobWorkspaceFrame>
              ) : null}
            </div>
          )
        ) : activeDestination === "network" ? (
          <NetworkWorkspace
            activeTab={networkTab}
            model={NETWORK_MODEL}
            onAction={recordNetworkAction}
            onTabChange={changeNetworkTab}
            selectedCompanyId={networkSelectedCompanyId}
            selectedContactId={networkSelectedContactId}
          />
        ) : (
          <section className="cd-shell-page-card min-h-72" aria-labelledby="destination-heading">
            <p className="m-0 text-xs font-bold uppercase tracking-wider text-[var(--color-text-subtle)]">
              Responsive shell destination
            </p>
            <h2 className="mt-2 text-xl font-bold" id="destination-heading">
              {page.title} remains inside the shared workspace
            </h2>
            <p className="mt-3 max-w-2xl text-[var(--color-text-muted)]">
              The route link, active state, global search, command menu, Add menu, vault health, and
              responsive navigation remain available without an account or network connection.
            </p>
          </section>
        )}
      </div>
    </ApplicationShell>
  );
};

const rootElement = document.querySelector<HTMLElement>("#root");
if (rootElement === null) throw new Error("Application shell root is missing.");
createRoot(rootElement).render(<AppShellCatalog />);
