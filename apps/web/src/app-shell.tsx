import {
  ApplicationShell,
  HomeDashboard,
  PipelineBoard,
  PipelineShell,
  VAULT_HEALTH_STATES,
  getRootAppearanceAttributes,
  type DensityMode,
  type HomeDashboardActionId,
  type HomeDashboardModel,
  type HomeRecentItem,
  type LocalSearchResult,
  type PipelineBulkActionId,
  type BoardColumn,
  type BoardJobCard,
  type BoardMoveRequest,
  type PipelineFilterChip,
  type PipelineSavedView,
  type PipelineShellActionId,
  type PipelineShellModel,
  type PipelineViewId,
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
  readonly pipelineFilterCount: number;
  readonly pipelineSavedViewId: string;
  readonly pipelineSearchQuery: string;
  readonly pipelineSelectedCount: number;
  readonly pipelineView: PipelineViewId;
  readonly theme: ThemePreference;
  readonly vaultHealth: VaultHealthState;
}

interface AppShellCatalogApi {
  getState(): AppShellCatalogState;
}

declare global {
  var coredrillAppShell: AppShellCatalogApi | undefined;
}

const SEARCH_RESULTS = Object.freeze([
  {
    context: "Senior Product Designer · Interviewing",
    href: "/jobs/00000000-0000-4000-8000-000000000101/overview",
    id: "search-job-northstar",
    kind: "job",
    title: "Northstar Health",
  },
  {
    context: "Platform Engineer · Preparing",
    href: "/jobs/00000000-0000-4000-8000-000000000102/overview",
    id: "search-job-canvas",
    kind: "job",
    title: "Canvas Works",
  },
  {
    context: "Company · 2 saved roles",
    href: "/network/companies/00000000-0000-4000-8000-000000000201",
    id: "search-company-acme",
    kind: "company",
    title: "Acme Research",
  },
  {
    context: "Resume · Edited 2 days ago",
    href: "/documents/00000000-0000-4000-8000-000000000301",
    id: "search-document-product",
    kind: "document",
    title: "Product leadership base",
  },
] as const satisfies readonly LocalSearchResult[]);

const readAppearance = (): {
  readonly boardMode: "large" | "standard";
  readonly density: DensityMode;
  readonly homeMode: HomeDashboardModel["state"];
  readonly pipelineSelectionCount: number;
  readonly theme: ThemePreference;
  readonly vaultHealth: VaultHealthState;
} => {
  const parameters = new URLSearchParams(window.location.search);
  const requestedBoard = parameters.get("board");
  const requestedDensity = parameters.get("density");
  const requestedHome = parameters.get("home");
  const requestedPipeline = parameters.get("pipeline");
  const requestedTheme = parameters.get("theme");
  const requestedHealth = parameters.get("health");
  return {
    boardMode: requestedBoard === "large" ? "large" : "standard",
    density: requestedDensity === "compact" ? "compact" : "comfortable",
    homeMode: requestedHome === "empty" ? "empty" : "ready",
    pipelineSelectionCount: requestedPipeline === "selected" ? 2 : 0,
    theme: requestedTheme === "dark" || requestedTheme === "system" ? requestedTheme : "light",
    vaultHealth: VAULT_HEALTH_STATES.includes(requestedHealth as VaultHealthState)
      ? (requestedHealth as VaultHealthState)
      : "healthy",
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
  const [activeDestination, setActiveDestination] = useState<ShellDestinationId>("home");
  const [boardAnnouncement, setBoardAnnouncement] = useState("");
  const [boardColumns, setBoardColumns] = useState<readonly BoardColumn[]>(
    appearance.boardMode === "large" ? LARGE_BOARD_COLUMNS : STANDARD_BOARD_COLUMNS,
  );
  const [boardTimelineEventCount, setBoardTimelineEventCount] = useState(0);
  const [boardUndo, setBoardUndo] = useState<BoardUndoRecord | null>(null);
  const [homeSnapshotVisible, setHomeSnapshotVisible] = useState(true);
  const [pipelineFilters, setPipelineFilters] =
    useState<readonly PipelineFilterChip[]>(INITIAL_PIPELINE_FILTERS);
  const [pipelineSavedViewId, setPipelineSavedViewId] = useState("active-search");
  const [pipelineSearchQuery, setPipelineSearchQuery] = useState("");
  const [pipelineSelectedCount, setPipelineSelectedCount] = useState(
    appearance.pipelineSelectionCount,
  );
  const [pipelineView, setPipelineView] = useState<PipelineViewId>("board");
  const [lastActivity, setLastActivity] = useState(
    "Shell ready. All displayed records are synthetic.",
  );
  const page = PAGE_COPY[activeDestination];
  const homeModel: HomeDashboardModel =
    appearance.homeMode === "empty"
      ? EMPTY_HOME_MODEL
      : homeSnapshotVisible
        ? READY_HOME_MODEL
        : Object.freeze({ ...READY_HOME_MODEL, snapshot: null });
  const boardMatchingCount = boardColumns.reduce((count, column) => count + column.items.length, 0);
  const pipelineModel: PipelineShellModel = Object.freeze({
    activeSavedViewId: pipelineSavedViewId,
    activeView: pipelineView,
    filters: pipelineFilters,
    inboxCount: 3,
    matchingCount: boardMatchingCount,
    savedViews: PIPELINE_SAVED_VIEWS,
    searchQuery: pipelineSearchQuery,
    selectedCount: pipelineSelectedCount,
    sortLabel: "Recently updated",
    totalCount: boardMatchingCount + 4,
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
          pipelineFilterCount: pipelineFilters.length,
          pipelineSavedViewId,
          pipelineSearchQuery,
          pipelineSelectedCount,
          pipelineView,
          theme: appearance.theme,
          vaultHealth: appearance.vaultHealth,
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
    pipelineFilters.length,
    pipelineSavedViewId,
    pipelineSearchQuery,
    pipelineSelectedCount,
    pipelineView,
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
      onNavigate={(destination) => {
        setActiveDestination(destination);
        setLastActivity(`Opened ${PAGE_COPY[destination].title} locally.`);
      }}
      onSearchResult={(result) => {
        setLastActivity(`Opened local ${result.kind}: ${result.title}.`);
      }}
      outboxCount={2}
      searchResults={SEARCH_RESULTS}
      vault={{ health: appearance.vaultHealth, kind: "browser", name: "Job search 2026" }}
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

        {activeDestination === "home" ? (
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
          <PipelineShell
            model={pipelineModel}
            onAction={recordPipelineAction}
            onBulkAction={recordPipelineBulkAction}
            onClearFilters={() => {
              setPipelineFilters(Object.freeze([]));
              setLastActivity("Cleared the visible Pipeline filters locally.");
            }}
            onClearSelection={() => {
              setPipelineSelectedCount(0);
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
              setLastActivity(
                `Changed Pipeline presentation to ${view}. The record set remains unchanged.`,
              );
            }}
          >
            {pipelineView === "board" ? (
              <PipelineBoard
                announcement={boardAnnouncement}
                columns={boardColumns}
                onMoveRequest={requestBoardMove}
                onOpenJob={(job) => {
                  setLastActivity(`Opened local Board job: ${job.title} at ${job.company}.`);
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
            ) : null}
          </PipelineShell>
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
