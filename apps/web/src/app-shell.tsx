import {
  ApplicationShell,
  VAULT_HEALTH_STATES,
  getRootAppearanceAttributes,
  type DensityMode,
  type LocalSearchResult,
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
  readonly density: DensityMode;
  readonly lastActivity: string;
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
  readonly density: DensityMode;
  readonly theme: ThemePreference;
  readonly vaultHealth: VaultHealthState;
} => {
  const parameters = new URLSearchParams(window.location.search);
  const requestedDensity = parameters.get("density");
  const requestedTheme = parameters.get("theme");
  const requestedHealth = parameters.get("health");
  return {
    density: requestedDensity === "compact" ? "compact" : "comfortable",
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

const HomeContent = ({ onAction }: { readonly onAction: (action: ShellActionId) => void }) => (
  <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.6fr)]">
    <section className="cd-shell-page-card xl:row-span-2" aria-labelledby="now-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="m-0 text-xs font-bold uppercase tracking-wider text-[var(--color-text-subtle)]">
            Now
          </p>
          <h2 className="mt-1 text-xl font-bold" id="now-heading">
            Prepare for Northstar Health
          </h2>
          <p className="mt-2 max-w-2xl text-[var(--color-text-muted)]">
            Interview tomorrow at 10:30 AM. Review the submitted resume and three evidence stories.
          </p>
        </div>
        <span className="cd-status cd-status-warning">Tomorrow</span>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          className="cd-button cd-button-primary"
          onClick={() => {
            onAction("create-follow-up");
          }}
          type="button"
        >
          Open interview plan
        </button>
        <button
          className="cd-shell-page-action"
          onClick={() => {
            onAction("export-backup");
          }}
          type="button"
        >
          View submitted files
        </button>
      </div>
    </section>

    <section className="cd-shell-page-card" aria-labelledby="attention-heading">
      <p className="m-0 text-xs font-bold uppercase tracking-wider text-[var(--color-text-subtle)]">
        Needs attention
      </p>
      <h2 className="mt-1 text-lg font-bold" id="attention-heading">
        3 captures need review
      </h2>
      <ul className="mt-3 grid gap-2 pl-5 text-[var(--color-text-muted)]">
        <li>One title conflict</li>
        <li>One salary range is uncertain</li>
        <li>One source snapshot is stale</li>
      </ul>
    </section>

    <section className="cd-shell-page-card" aria-labelledby="vault-card-heading">
      <p className="m-0 text-xs font-bold uppercase tracking-wider text-[var(--color-text-subtle)]">
        Vault
      </p>
      <h2 className="mt-1 text-lg font-bold" id="vault-card-heading">
        Stored on this device
      </h2>
      <p className="mt-2 text-[var(--color-text-muted)]">
        No account, remote database, or AI connection is required.
      </p>
    </section>

    <section className="cd-shell-page-card xl:col-span-2" aria-labelledby="week-heading">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="m-0 text-xs font-bold uppercase tracking-wider text-[var(--color-text-subtle)]">
            This week
          </p>
          <h2 className="mt-1 text-lg font-bold" id="week-heading">
            A focused local plan
          </h2>
        </div>
        <span className="text-sm text-[var(--color-text-muted)]">
          4 next actions · 2 interviews
        </span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
        {[
          ["Today", "Review 3 captures"],
          ["Tomorrow", "Northstar interview"],
          ["Thursday", "Follow up with Canvas"],
          ["Friday", "Verify a fresh backup"],
        ].map(([date, task]) => (
          <div
            className="rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-3"
            key={date}
          >
            <div className="text-xs font-bold uppercase text-[var(--color-text-subtle)]">
              {date}
            </div>
            <div className="mt-1 font-semibold">{task}</div>
          </div>
        ))}
      </div>
    </section>
  </div>
);

const AppShellCatalog = () => {
  const appearance = useMemo(readAppearance, []);
  const [activeDestination, setActiveDestination] = useState<ShellDestinationId>("home");
  const [lastActivity, setLastActivity] = useState(
    "Shell ready. All displayed records are synthetic.",
  );
  const page = PAGE_COPY[activeDestination];

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
          density: appearance.density,
          lastActivity,
          theme: appearance.theme,
          vaultHealth: appearance.vaultHealth,
        }),
    });
  }, [activeDestination, appearance, lastActivity]);

  const recordAction = (action: ShellActionId): void => {
    setLastActivity(`Action selected: ${action}. No external request was made.`);
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
          <HomeContent onAction={recordAction} />
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
