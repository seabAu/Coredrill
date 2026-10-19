import { BrowserSqliteBusyError } from "./errors.js";

const HANDLE_RELEASE_DELAYS_MS = Object.freeze([25, 75, 150]);

/** Retry only initial OPFS handle acquisition, never a query, transaction, or restore. */
export const openAfterOpfsHandleRelease = async <Value>(
  open: () => Promise<Value>,
  wait: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    }),
): Promise<Value> => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await open();
    } catch (error) {
      if (!(error instanceof Error) || error.name !== "NoModificationAllowedError") throw error;
      const delay = HANDLE_RELEASE_DELAYS_MS[attempt];
      if (delay === undefined) {
        throw new BrowserSqliteBusyError(
          "The browser is still releasing local vault file handles. Wait for the previous page to close, then retry.",
        );
      }
      await wait(delay);
    }
  }
};
