import type { BrowserStorageError } from "./protocol.js";

export class BrowserStorageUnavailableError extends Error {
  public readonly code = "storage_unavailable";

  public constructor(message: string) {
    super(message);
    this.name = "BrowserStorageUnavailableError";
  }
}

export class BrowserVaultBusyError extends Error {
  public readonly code = "vault_busy";
  public readonly retryable = true;

  public constructor() {
    super("This Coredrill vault is open in another tab. Close it there, then retry.");
    this.name = "BrowserVaultBusyError";
  }
}

export class BrowserSqliteBusyError extends Error {
  public readonly code = "sqlite_busy";
  public readonly retryable = true;
  public readonly resultCode: number | undefined;

  public constructor(message: string, resultCode?: number) {
    super(message);
    this.name = "BrowserSqliteBusyError";
    this.resultCode = resultCode;
  }
}

export const deserializeBrowserStorageError = (wire: BrowserStorageError): Error => {
  const resultCode = wire.resultCode;
  if (
    (resultCode !== undefined && (resultCode & 0xff) === 5) ||
    /\bSQLITE_BUSY\b|database is (?:busy|locked)/iu.test(wire.message)
  ) {
    return new BrowserSqliteBusyError(wire.message, resultCode);
  }
  const error = new Error(wire.message);
  error.name = wire.name;
  return error;
};
