import { useSyncExternalStore } from "react";

export interface OfflineShellState {
  readonly controlled: boolean;
  readonly error: boolean;
  readonly offlineReady: boolean;
  readonly registered: boolean;
  readonly updateAvailable: boolean;
}

interface OfflineShellApi {
  readonly applyUpdate: () => boolean;
  readonly checkForUpdate: () => Promise<boolean>;
  readonly dismiss: () => void;
  readonly getState: () => OfflineShellState;
}

declare global {
  var coredrillOfflineShell: OfflineShellApi | undefined;
}

const freezeState = (state: OfflineShellState): OfflineShellState => Object.freeze(state);

let snapshot = freezeState({
  controlled: false,
  error: false,
  offlineReady: false,
  registered: false,
  updateAvailable: false,
});
let registration: ServiceWorkerRegistration | undefined;
let reloadForUpdate = false;
let initialized = false;
const listeners = new Set<() => void>();

const emit = (state: Partial<OfflineShellState>): void => {
  snapshot = freezeState({ ...snapshot, ...state });
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = (): OfflineShellState => snapshot;

const watchInstall = (
  currentRegistration: ServiceWorkerRegistration,
  worker: ServiceWorker,
): void => {
  const replacingActiveWorker = currentRegistration.active !== null;
  const handleStateChange = (): void => {
    if (worker.state !== "installed") return;
    if (replacingActiveWorker || navigator.serviceWorker.controller !== null) {
      emit({ offlineReady: false, updateAvailable: true });
      return;
    }
    emit({ offlineReady: true });
  };
  worker.addEventListener("statechange", handleStateChange);
  handleStateChange();
};

const api: OfflineShellApi = Object.freeze({
  applyUpdate: () => {
    const waiting = registration?.waiting;
    if (waiting === null || waiting === undefined) return false;
    reloadForUpdate = true;
    waiting.postMessage({ type: "SKIP_WAITING" });
    return true;
  },
  checkForUpdate: async () => {
    if (registration === undefined || !navigator.onLine) return false;
    await registration.update();
    return true;
  },
  dismiss: () => {
    emit({ offlineReady: false, updateAvailable: false });
  },
  getState: getSnapshot,
});

export const initializeOfflineShell = (): void => {
  if (initialized) return;
  initialized = true;
  globalThis.coredrillOfflineShell = api;

  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    emit({ controlled: true });
    if (reloadForUpdate) window.location.reload();
  });

  const controlledBeforeRegistration = navigator.serviceWorker.controller !== null;
  void navigator.serviceWorker
    .register("/service-worker.js", { scope: "/", updateViaCache: "none" })
    .then(async (currentRegistration) => {
      registration = currentRegistration;
      emit({
        controlled: navigator.serviceWorker.controller !== null,
        registered: true,
        updateAvailable: currentRegistration.waiting !== null,
      });
      currentRegistration.addEventListener("updatefound", () => {
        const installing = currentRegistration.installing;
        if (installing !== null) watchInstall(currentRegistration, installing);
      });
      if (currentRegistration.installing !== null) {
        watchInstall(currentRegistration, currentRegistration.installing);
      }
      await navigator.serviceWorker.ready;
      if (
        !controlledBeforeRegistration &&
        currentRegistration.waiting === null &&
        !snapshot.updateAvailable
      ) {
        emit({ offlineReady: true });
      }
    })
    .catch(() => {
      emit({ error: true });
    });
};

export const OfflineShellNotice = () => {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  if (!state.offlineReady && !state.updateAvailable && !state.error) return null;

  return (
    <aside className="cd-offline-shell-notice" data-testid="offline-shell-notice" role="status">
      <p>
        {state.updateAvailable
          ? "A Coredrill update is ready. Reload when your current edit is safely saved."
          : state.error
            ? "Offline setup could not finish. Your local vault remains available in this session."
            : "Coredrill is ready for offline work."}
      </p>
      <div className="cd-offline-shell-notice__actions">
        {state.updateAvailable ? (
          <button
            type="button"
            onClick={() => {
              api.applyUpdate();
            }}
          >
            Reload update
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            api.dismiss();
          }}
        >
          Dismiss
        </button>
      </div>
    </aside>
  );
};
