export const NAVIGATION_ENTRY_KEY = "coredrillNavigationIndexV1";

export interface NavigationHistoryPort {
  readonly read: () => { readonly href: string; readonly state: unknown };
  readonly push: (state: unknown, href: string) => void;
  readonly replace: (state: unknown, href: string) => void;
  readonly go: (delta: number) => void;
}

const entryIndex = (state: unknown): number | null => {
  if (state === null || typeof state !== "object" || Array.isArray(state)) return null;
  const index = (state as Record<string, unknown>)[NAVIGATION_ENTRY_KEY];
  return typeof index === "number" && Number.isSafeInteger(index) && index >= 0 ? index : null;
};
const stamped = (state: unknown, index: number) => ({
  ...(state !== null && typeof state === "object" && !Array.isArray(state) ? state : {}),
  [NAVIGATION_ENTRY_KEY]: index,
});

/** Route changes are committed only after the active editor's durable flush succeeds. */
export const createGuardedNavigation = (options: {
  readonly history: NavigationHistoryPort;
  readonly getLeaveGuard: () => (() => Promise<void>) | null;
  readonly onBlocked: () => void;
}) => {
  let committed = options.history.read();
  let index = entryIndex(committed.state) ?? 0;
  let initialized = false;
  let restoring = false;
  let latestAction: (() => void) | null = null;
  let draining: Promise<void> | null = null;

  const initialize = () => {
    if (initialized) return;
    initialized = true;
    committed = { href: committed.href, state: stamped(committed.state, index) };
    options.history.replace(committed.state, committed.href);
  };
  const restoreCommitted = () => {
    const cursor = options.history.read();
    const cursorIndex = entryIndex(cursor.state);
    if (cursorIndex !== null && cursorIndex !== index) {
      restoring = true;
      options.history.go(index - cursorIndex);
    } else {
      // Legacy same-document entries lack an index. Preserve text and history length.
      options.history.replace(committed.state, committed.href);
    }
  };
  const run = (action: () => void): Promise<void> => {
    initialize();
    if (restoring) return Promise.resolve();
    latestAction = action;
    if (draining !== null) return draining;
    const guard = options.getLeaveGuard();
    if (guard === null) {
      latestAction = null;
      action();
      return Promise.resolve();
    }
    const pending = Promise.resolve()
      .then(guard)
      .then(() => {
        const next = latestAction;
        latestAction = null;
        next?.();
      })
      .catch(() => {
        latestAction = null;
        restoreCommitted();
        options.onBlocked();
      })
      .finally(() => {
        draining = null;
      });
    draining = pending;
    return pending;
  };
  return Object.freeze({
    initialize,
    run,
    pushState: (state: unknown, _unused: string, href: string) => {
      initialize();
      const cursorIndex = entryIndex(options.history.read().state);
      index = (cursorIndex ?? index) + 1;
      const nextState = stamped(state, index);
      options.history.push(nextState, href);
      committed = options.history.read();
    },
    replaceState: (state: unknown, _unused: string, href: string) => {
      initialize();
      options.history.replace(stamped(state, index), href);
      committed = options.history.read();
    },
    pop: (applyRoute: () => void): Promise<void> => {
      if (restoring) {
        restoring = false;
        return Promise.resolve();
      }
      const cursor = options.history.read();
      if (
        cursor.href !== committed.href &&
        cursor.href.split("#")[0] === committed.href.split("#")[0]
      ) {
        // Skip links and fragment history move focus, not the editor's document route.
        index = entryIndex(cursor.state) ?? index + 1;
        committed = { href: cursor.href, state: stamped(cursor.state, index) };
        options.history.replace(committed.state, committed.href);
        return Promise.resolve();
      }
      return run(() => {
        const destination = options.history.read();
        index = entryIndex(destination.state) ?? index;
        committed = { href: destination.href, state: stamped(destination.state, index) };
        options.history.replace(committed.state, committed.href);
        applyRoute();
      });
    },
  });
};
