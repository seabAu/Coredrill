import { BrowserStorageUnavailableError, BrowserVaultBusyError } from "./errors.js";

export interface BrowserLock {
  readonly name: string;
}

export interface BrowserLockManager {
  request<Result>(
    name: string,
    options: { readonly ifAvailable: true; readonly mode: "exclusive" },
    callback: (lock: BrowserLock | null) => Promise<Result>,
  ): Promise<Result>;
}

export interface BrowserVaultLease {
  release(): void;
}

const SAH_POOL_LOCK_NAME = "coredrill:sqlite:opfs-sahpool";

const currentLockManager = (): BrowserLockManager | undefined => {
  if (typeof navigator === "undefined") return undefined;
  return navigator.locks;
};

export const acquireBrowserVaultLease = async (
  lockManager: BrowserLockManager | undefined = currentLockManager(),
): Promise<BrowserVaultLease> => {
  if (lockManager === undefined) {
    throw new BrowserStorageUnavailableError(
      "This browser cannot coordinate the Coredrill vault safely across tabs.",
    );
  }

  let releaseHold: (() => void) | undefined;
  let settleAcquisition: ((lease: BrowserVaultLease) => void) | undefined;
  let rejectAcquisition: ((error: unknown) => void) | undefined;
  const hold = new Promise<void>((resolve) => {
    releaseHold = resolve;
  });
  const acquisition = new Promise<BrowserVaultLease>((resolve, reject) => {
    settleAcquisition = resolve;
    rejectAcquisition = reject;
  });

  void lockManager
    .request(SAH_POOL_LOCK_NAME, { ifAvailable: true, mode: "exclusive" }, async (lock) => {
      if (lock === null) throw new BrowserVaultBusyError();
      let released = false;
      settleAcquisition?.(
        Object.freeze({
          release: () => {
            if (released) return;
            released = true;
            releaseHold?.();
          },
        }),
      );
      await hold;
    })
    .catch((error: unknown) => {
      rejectAcquisition?.(error);
    });

  return acquisition;
};
