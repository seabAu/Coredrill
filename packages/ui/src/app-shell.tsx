import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

import { Icon, type UiIconName } from "./icon.js";

export const PRIMARY_DESTINATION_IDS = Object.freeze([
  "home",
  "pipeline",
  "documents",
  "profile",
  "network",
  "insights",
] as const);
export type PrimaryDestinationId = (typeof PRIMARY_DESTINATION_IDS)[number];
export type ShellDestinationId = PrimaryDestinationId | "settings";

export interface ShellNavigationItem {
  readonly href: string;
  readonly icon: UiIconName;
  readonly id: ShellDestinationId;
  readonly label: string;
  readonly shortcut?: string;
}

export const PRIMARY_NAVIGATION_ITEMS = Object.freeze([
  { href: "/", icon: "home", id: "home", label: "Home", shortcut: "G then H" },
  {
    href: "/pipeline?view=board",
    icon: "briefcase",
    id: "pipeline",
    label: "Pipeline",
    shortcut: "G then P",
  },
  {
    href: "/documents",
    icon: "files",
    id: "documents",
    label: "Documents",
    shortcut: "G then D",
  },
  {
    href: "/profile/basics",
    icon: "user",
    id: "profile",
    label: "Career Profile",
    shortcut: "G then R",
  },
  {
    href: "/network/companies",
    icon: "building",
    id: "network",
    label: "Network",
  },
  {
    href: "/insights/pipeline",
    icon: "chart",
    id: "insights",
    label: "Insights",
    shortcut: "G then I",
  },
] as const satisfies readonly ShellNavigationItem[]);

export const SETTINGS_NAVIGATION_ITEM = Object.freeze({
  href: "/settings/vault-backup",
  icon: "settings",
  id: "settings",
  label: "Settings",
} as const satisfies ShellNavigationItem);

export const ADD_ACTIONS = Object.freeze([
  { id: "add-job", icon: "briefcase", label: "Add job", hint: "Create a job manually" },
  {
    id: "paste-listing",
    icon: "file-plus",
    label: "Paste listing",
    hint: "Review pasted text locally",
  },
  {
    id: "import-tracker",
    icon: "file-up",
    label: "Import tracker",
    hint: "Preview before committing",
  },
  {
    id: "new-interaction",
    icon: "handshake",
    label: "Log interaction",
    hint: "Call, email, meeting, or note",
  },
  {
    id: "new-contact",
    icon: "user-plus",
    label: "Add contact",
    hint: "User-entered or sourced details",
  },
  {
    id: "new-document",
    icon: "file-plus",
    label: "Create document",
    hint: "Resume, letter, or answer",
  },
] as const);

export const COMMAND_ACTIONS = Object.freeze([
  { id: "search", icon: "search", label: "Search all local data", shortcut: "Mod+/" },
  { id: "add-job", icon: "briefcase", label: "Add job", shortcut: "C" },
  { id: "paste-listing", icon: "file-plus", label: "Paste listing" },
  { id: "capture-url", icon: "file-plus", label: "Capture URL" },
  { id: "new-interaction", icon: "handshake", label: "Log interaction" },
  { id: "generate-draft", icon: "files", label: "Create a draft" },
  { id: "create-follow-up", icon: "check", label: "Create follow-up" },
  { id: "export-backup", icon: "hard-drive-download", label: "Export or back up vault" },
] as const);

export type AddActionId = (typeof ADD_ACTIONS)[number]["id"];
export type CommandActionId = (typeof COMMAND_ACTIONS)[number]["id"];
export type ShellActionId =
  AddActionId | Exclude<CommandActionId, "search"> | "help" | "open-vault";

export const VAULT_HEALTH_STATES = Object.freeze([
  "healthy",
  "backup-due",
  "storage-risk",
  "offline",
  "migration-required",
] as const);
export type VaultHealthState = (typeof VAULT_HEALTH_STATES)[number];
export type VaultKind = "browser" | "desktop";

export interface VaultStatus {
  readonly health: VaultHealthState;
  readonly kind: VaultKind;
  readonly name: string;
}

export interface LocalSearchResult {
  readonly context: string;
  readonly href: string;
  readonly id: string;
  readonly kind: "company" | "contact" | "document" | "job";
  readonly title: string;
}

export interface ApplicationShellProps {
  readonly activeDestination: ShellDestinationId;
  readonly children: ReactNode;
  readonly inboxCount?: number;
  readonly onAction?: ((action: ShellActionId) => void) | undefined;
  readonly onNavigate?: ((destination: ShellDestinationId) => void) | undefined;
  readonly onSearchResult?: (result: LocalSearchResult) => void;
  readonly outboxCount?: number;
  readonly searchResults?: readonly LocalSearchResult[];
  readonly vault: VaultStatus;
}

const VAULT_HEALTH_COPY: Readonly<
  Record<
    VaultHealthState,
    { readonly detail: string; readonly icon: UiIconName; readonly label: string }
  >
> = Object.freeze({
  healthy: {
    detail: "Local storage is ready.",
    icon: "check",
    label: "Vault healthy",
  },
  "backup-due": {
    detail: "Your local work is safe; a fresh backup is recommended.",
    icon: "hard-drive-download",
    label: "Backup due",
  },
  "storage-risk": {
    detail: "Storage durability is reduced. Export a backup before relying on this profile.",
    icon: "alert-triangle",
    label: "Storage risk",
  },
  offline: {
    detail: "Local work remains available. Network actions will wait.",
    icon: "cloud-off",
    label: "Offline · local work available",
  },
  "migration-required": {
    detail: "Review the vault upgrade before editing records.",
    icon: "alert-triangle",
    label: "Migration required",
  },
});

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement
  );
};

const NavigationLink = ({
  active,
  inboxCount,
  item,
  onNavigate,
}: {
  readonly active: boolean;
  readonly inboxCount?: number;
  readonly item: ShellNavigationItem;
  readonly onNavigate?: ((destination: ShellDestinationId) => void) | undefined;
}) => {
  const handleClick = (event: ReactMouseEvent<HTMLAnchorElement>): void => {
    if (onNavigate === undefined) return;
    event.preventDefault();
    onNavigate(item.id);
  };

  return (
    <a
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      className="cd-shell-nav-link"
      data-destination={item.id}
      href={item.href}
      onClick={handleClick}
    >
      <Icon decorative name={item.icon} size={20} />
      <span className="cd-shell-nav-label">{item.label}</span>
      {item.id === "pipeline" && (inboxCount ?? 0) > 0 ? (
        <span
          aria-label={`${String(inboxCount)} captures need review`}
          className="cd-shell-nav-badge"
        >
          {inboxCount}
        </span>
      ) : null}
    </a>
  );
};

const VaultControl = ({
  compact = false,
  onAction,
  vault,
}: {
  readonly compact?: boolean;
  readonly onAction?: ((action: ShellActionId) => void) | undefined;
  readonly vault: VaultStatus;
}) => {
  const health = VAULT_HEALTH_COPY[vault.health];
  const kindLabel = vault.kind === "browser" ? "Browser vault" : "Desktop vault";
  return (
    <button
      aria-label={`${kindLabel}: ${vault.name}. ${health.label}`}
      aria-describedby={`vault-health-detail-${compact ? "compact" : "rail"}`}
      className="cd-vault-control"
      data-health={vault.health}
      onClick={() => {
        onAction?.("open-vault");
      }}
      type="button"
    >
      <Icon decorative name={health.icon} size={19} />
      <span className="cd-vault-control-copy">
        <span className="cd-vault-kind">{kindLabel}</span>
        <span className="cd-vault-name">{vault.name}</span>
        <span className="cd-vault-health">{health.label}</span>
        <span
          className="cd-visually-hidden"
          id={`vault-health-detail-${compact ? "compact" : "rail"}`}
        >
          {health.detail}
        </span>
      </span>
      <Icon decorative name="chevron-right" size={17} />
    </button>
  );
};

const MenuItemIcon = ({ name }: { readonly name: UiIconName }) => (
  <Icon decorative name={name} size={18} />
);

const AddMenu = ({
  className,
  onOpenChange,
  onSelect,
  open,
}: {
  readonly className: string;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSelect: (action: AddActionId) => void;
  readonly open: boolean;
}) => (
  <DropdownMenu.Root onOpenChange={onOpenChange} open={open}>
    <DropdownMenu.Trigger asChild>
      <button aria-label="Add" className={`cd-button cd-button-primary ${className}`} type="button">
        <Icon decorative name="plus" size={19} />
        <span>Add</span>
        <Icon decorative name="chevron-down" size={16} />
      </button>
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        align="end"
        aria-label="Add"
        className="cd-dropdown-content"
        collisionPadding={8}
        sideOffset={8}
      >
        <DropdownMenu.Label className="cd-dropdown-label">Add to this vault</DropdownMenu.Label>
        {ADD_ACTIONS.map((action) => (
          <DropdownMenu.Item
            className="cd-dropdown-item"
            key={action.id}
            onSelect={() => {
              onSelect(action.id);
            }}
          >
            <MenuItemIcon name={action.icon} />
            <span>
              <strong>{action.label}</strong>
              <small>{action.hint}</small>
            </span>
          </DropdownMenu.Item>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>
);

export const ApplicationShell = ({
  activeDestination,
  children,
  inboxCount = 0,
  onAction,
  onNavigate,
  onSearchResult,
  outboxCount = 0,
  searchResults = [],
  vault,
}: ApplicationShellProps) => {
  const [activeOverlay, setActiveOverlay] = useState<"command" | "search" | null>(null);
  const [desktopAddMenuOpen, setDesktopAddMenuOpen] = useState(false);
  const [mobileAddMenuOpen, setMobileAddMenuOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const commandTriggerRef = useRef<HTMLButtonElement>(null);
  const dialogReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent): void => {
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "k") {
        event.preventDefault();
        dialogReturnFocusRef.current = commandTriggerRef.current;
        setCommandQuery("");
        setActiveOverlay("command");
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "/") {
        event.preventDefault();
        dialogReturnFocusRef.current = searchTriggerRef.current;
        setSearchQuery("");
        setActiveOverlay("search");
        return;
      }
      if (
        key === "c" &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        !isEditableTarget(event.target)
      ) {
        event.preventDefault();
        if (window.matchMedia("(max-width: 639px)").matches) {
          setMobileAddMenuOpen(true);
        } else {
          setDesktopAddMenuOpen(true);
        }
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => {
      window.removeEventListener("keydown", handleShortcut);
    };
  }, []);

  const visibleSearchResults = useMemo(() => {
    const normalized = searchQuery.trim().toLocaleLowerCase();
    if (normalized.length === 0) return searchResults;
    return searchResults.filter(({ context, kind, title }) =>
      `${kind} ${title} ${context}`.toLocaleLowerCase().includes(normalized),
    );
  }, [searchQuery, searchResults]);

  const visibleCommands = useMemo(() => {
    const normalized = commandQuery.trim().toLocaleLowerCase();
    if (normalized.length === 0) return COMMAND_ACTIONS;
    return COMMAND_ACTIONS.filter(({ label }) => label.toLocaleLowerCase().includes(normalized));
  }, [commandQuery]);

  const invokeAction = (id: ShellActionId): void => {
    setDesktopAddMenuOpen(false);
    setMobileAddMenuOpen(false);
    setActiveOverlay(null);
    onAction?.(id);
  };

  const invokeCommand = (id: CommandActionId): void => {
    if (id === "search") {
      setSearchQuery("");
      setActiveOverlay("search");
      return;
    }
    invokeAction(id);
  };

  const handleNavigationKey = (event: ReactKeyboardEvent<HTMLElement>): void => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const links = [...event.currentTarget.querySelectorAll<HTMLElement>("a[href]")];
    const activeIndex = links.indexOf(document.activeElement as HTMLElement);
    if (activeIndex < 0) return;
    event.preventDefault();
    const offset = event.key === "ArrowDown" ? 1 : -1;
    links[(activeIndex + offset + links.length) % links.length]?.focus();
  };

  const health = VAULT_HEALTH_COPY[vault.health];

  return (
    <div className="cd-app-shell">
      <a className="cd-skip-link" href="#coredrill-main">
        Skip to main content
      </a>

      <aside className="cd-shell-sidebar" aria-label="Coredrill workspace">
        <div className="cd-shell-brand">
          <span aria-hidden="true" className="cd-shell-brand-mark">
            C
          </span>
          <span className="cd-shell-brand-copy">
            <strong>Coredrill</strong>
            <span>Job workspace</span>
          </span>
        </div>

        <nav aria-label="Primary" className="cd-shell-primary-nav" onKeyDown={handleNavigationKey}>
          {PRIMARY_NAVIGATION_ITEMS.map((item) => (
            <NavigationLink
              active={activeDestination === item.id}
              inboxCount={inboxCount}
              item={item}
              key={item.id}
              onNavigate={onNavigate}
            />
          ))}
        </nav>

        <div className="cd-shell-sidebar-footer">
          <VaultControl onAction={onAction} vault={vault} />
          <button
            aria-label="Help"
            className="cd-shell-nav-link"
            onClick={() => {
              onAction?.("help");
            }}
            type="button"
          >
            <Icon decorative name="help" size={20} />
            <span className="cd-shell-nav-label">Help</span>
          </button>
          <NavigationLink
            active={activeDestination === "settings"}
            item={SETTINGS_NAVIGATION_ITEM}
            onNavigate={onNavigate}
          />
        </div>
      </aside>

      <div className="cd-shell-workspace">
        <header className="cd-shell-utility-bar">
          <button
            aria-haspopup="dialog"
            aria-keyshortcuts="Control+/ Meta+/"
            className="cd-global-search-trigger"
            onClick={(event) => {
              dialogReturnFocusRef.current = event.currentTarget;
              setSearchQuery("");
              setActiveOverlay("search");
            }}
            ref={searchTriggerRef}
            type="button"
          >
            <Icon decorative name="search" size={19} />
            <span className="cd-global-search-label">Search local vault…</span>
            <kbd>Mod+/</kbd>
          </button>

          <div className="cd-shell-utility-actions">
            <span className="cd-local-only-indicator">
              <Icon decorative name="database" size={16} />
              <span className="cd-local-only-label">Local only</span>
            </span>
            {outboxCount > 0 ? (
              <span
                aria-label={`${String(outboxCount)} extension captures queued`}
                className="cd-outbox-badge"
              >
                {outboxCount} queued
              </span>
            ) : null}
            <button
              aria-haspopup="dialog"
              aria-keyshortcuts="Control+K Meta+K"
              className="cd-icon-button"
              onClick={(event) => {
                dialogReturnFocusRef.current = event.currentTarget;
                setCommandQuery("");
                setActiveOverlay("command");
              }}
              ref={commandTriggerRef}
              type="button"
            >
              <Icon label="Open command menu" name="command" size={20} />
            </button>

            <AddMenu
              className="cd-add-trigger cd-add-trigger-desktop"
              onOpenChange={setDesktopAddMenuOpen}
              onSelect={invokeAction}
              open={desktopAddMenuOpen}
            />
          </div>
        </header>

        <main className="cd-shell-main" id="coredrill-main" tabIndex={-1}>
          {children}
        </main>
      </div>

      <nav aria-label="Mobile" className="cd-shell-mobile-nav">
        {PRIMARY_NAVIGATION_ITEMS.filter(({ id }) =>
          (["home", "pipeline"] as readonly ShellDestinationId[]).includes(id),
        ).map((item) => (
          <NavigationLink
            active={activeDestination === item.id}
            inboxCount={inboxCount}
            item={item}
            key={item.id}
            onNavigate={onNavigate}
          />
        ))}
        <AddMenu
          className="cd-add-trigger cd-add-trigger-mobile"
          onOpenChange={setMobileAddMenuOpen}
          onSelect={invokeAction}
          open={mobileAddMenuOpen}
        />
        <NavigationLink
          active={activeDestination === "documents"}
          item={PRIMARY_NAVIGATION_ITEMS[2]}
          onNavigate={onNavigate}
        />
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="cd-shell-nav-link" type="button">
              <Icon decorative name="menu" size={20} />
              <span className="cd-shell-nav-label">More</span>
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              aria-label="More destinations"
              className="cd-dropdown-content cd-more-menu"
              collisionPadding={8}
              sideOffset={8}
            >
              {PRIMARY_NAVIGATION_ITEMS.filter(({ id }) =>
                (["profile", "network", "insights"] as readonly ShellDestinationId[]).includes(id),
              ).map((item) => (
                <DropdownMenu.Item asChild className="cd-dropdown-item" key={item.id}>
                  <a
                    aria-current={activeDestination === item.id ? "page" : undefined}
                    href={item.href}
                    onClick={(event) => {
                      if (onNavigate === undefined) return;
                      event.preventDefault();
                      onNavigate(item.id);
                    }}
                  >
                    <MenuItemIcon name={item.icon} />
                    <strong>{item.label}</strong>
                  </a>
                </DropdownMenu.Item>
              ))}
              <DropdownMenu.Separator className="cd-dropdown-separator" />
              <DropdownMenu.Item asChild className="cd-dropdown-item">
                <a
                  aria-current={activeDestination === "settings" ? "page" : undefined}
                  href={SETTINGS_NAVIGATION_ITEM.href}
                  onClick={(event) => {
                    if (onNavigate === undefined) return;
                    event.preventDefault();
                    onNavigate("settings");
                  }}
                >
                  <MenuItemIcon name="settings" />
                  <strong>Settings</strong>
                </a>
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="cd-dropdown-separator" />
              <DropdownMenu.Item
                className="cd-dropdown-item cd-dropdown-vault"
                onSelect={() => {
                  onAction?.("open-vault");
                }}
              >
                <MenuItemIcon name={health.icon} />
                <span>
                  <strong>{health.label}</strong>
                  <small>{vault.name}</small>
                </span>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </nav>

      <Dialog.Root
        onOpenChange={(open) => {
          if (!open) setActiveOverlay(null);
        }}
        open={activeOverlay !== null}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="cd-dialog-overlay" />
          <Dialog.Content
            className="cd-command-dialog"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              dialogReturnFocusRef.current?.focus();
            }}
          >
            <div className="cd-dialog-heading">
              <div>
                <Dialog.Title>
                  {activeOverlay === "search" ? "Search local vault" : "Command menu"}
                </Dialog.Title>
                <Dialog.Description>
                  {activeOverlay === "search"
                    ? "Search jobs, companies, contacts, and documents stored on this device."
                    : "Choose a Coredrill action. Commands do not send data from this device."}
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button className="cd-icon-button" type="button">
                  <Icon label="Close" name="x" size={20} />
                </button>
              </Dialog.Close>
            </div>

            {activeOverlay === "search" ? (
              <div className="cd-dialog-body">
                <label className="cd-visually-hidden" htmlFor="coredrill-global-search">
                  Search local vault
                </label>
                <div className="cd-command-input-wrap">
                  <Icon decorative name="search" size={19} />
                  <input
                    autoComplete="off"
                    autoFocus
                    className="cd-command-input"
                    id="coredrill-global-search"
                    onChange={(event) => {
                      setSearchQuery(event.target.value);
                    }}
                    placeholder="Company, role, contact, or document"
                    type="search"
                    value={searchQuery}
                  />
                </div>
                <div aria-live="polite" className="cd-command-result-count">
                  {visibleSearchResults.length} local result
                  {visibleSearchResults.length === 1 ? "" : "s"}
                </div>
                <div aria-label="Local search results" className="cd-command-list">
                  {visibleSearchResults.map((result) => (
                    <button
                      className="cd-command-result"
                      key={result.id}
                      onClick={() => {
                        setActiveOverlay(null);
                        onSearchResult?.(result);
                      }}
                      type="button"
                    >
                      <span>
                        <strong>{result.title}</strong>
                        <small>{result.context}</small>
                      </span>
                      <span className="cd-result-kind">{result.kind}</span>
                    </button>
                  ))}
                  {visibleSearchResults.length === 0 ? (
                    <p className="cd-command-empty">
                      No local results. Try a company, role, contact, or document name.
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="cd-dialog-body">
                <label className="cd-visually-hidden" htmlFor="coredrill-command-search">
                  Filter commands
                </label>
                <div className="cd-command-input-wrap">
                  <Icon decorative name="command" size={19} />
                  <input
                    autoComplete="off"
                    autoFocus
                    className="cd-command-input"
                    id="coredrill-command-search"
                    onChange={(event) => {
                      setCommandQuery(event.target.value);
                    }}
                    placeholder="Type a command"
                    type="search"
                    value={commandQuery}
                  />
                </div>
                <div aria-label="Available commands" className="cd-command-list">
                  {visibleCommands.map((command) => (
                    <button
                      className="cd-command-result"
                      key={command.id}
                      onClick={() => {
                        invokeCommand(command.id);
                      }}
                      type="button"
                    >
                      <MenuItemIcon name={command.icon} />
                      <strong>{command.label}</strong>
                      {"shortcut" in command ? <kbd>{command.shortcut}</kbd> : null}
                    </button>
                  ))}
                  {visibleCommands.length === 0 ? (
                    <p className="cd-command-empty">No matching command.</p>
                  ) : null}
                </div>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
};
