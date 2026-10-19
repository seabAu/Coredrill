import type { DatabasePort } from "@coredrill/storage-core";

export type RuntimeKind = "browser" | "native";
export class RuntimeCapabilityError extends Error {
  public constructor() {
    super("This capability is unavailable in the current storage runtime.");
    this.name = "RuntimeCapabilityError";
  }
}
interface RuntimeDatabase extends DatabasePort {
  close(): Promise<void>;
}

/** Host-selected once: a failed native open never invokes the browser adapter. */
export const createRuntimeDatabase = <
  Browser extends RuntimeDatabase,
  Native extends RuntimeDatabase,
>(options: {
  readonly kind: RuntimeKind;
  readonly openBrowser: (expectedExisting: boolean) => Promise<Browser>;
  readonly openNative: () => Promise<Native>;
}) => {
  const kind = options.kind;
  type Opened =
    | { readonly kind: "browser"; readonly database: Browser }
    | { readonly kind: "native"; readonly database: Native };
  let pending: Promise<Opened> | undefined;
  const open = async (expectedExisting = false): Promise<Opened> => {
    if (pending === undefined) {
      const attempt =
        kind === "native"
          ? Promise.resolve()
              .then(options.openNative)
              .then((database): Opened => ({ kind: "native", database }))
          : Promise.resolve()
              .then(() => options.openBrowser(expectedExisting))
              .then((database): Opened => ({ kind: "browser", database }));
      pending = attempt;
      void attempt.catch(() => {
        if (pending === attempt) pending = undefined;
      });
    }
    return pending;
  };
  return Object.freeze({
    kind,
    database: async (expectedExisting = false) => (await open(expectedExisting)).database,
    browser: async (expectedExisting = false): Promise<Browser> => {
      if (kind !== "browser") throw new RuntimeCapabilityError();
      const result = await open(expectedExisting);
      if (result.kind !== "browser") throw new RuntimeCapabilityError();
      return result.database;
    },
    native: async (): Promise<Native> => {
      if (kind !== "native") throw new RuntimeCapabilityError();
      const result = await open();
      if (result.kind !== "native") throw new RuntimeCapabilityError();
      return result.database;
    },
    forget: async (database: RuntimeDatabase) => {
      const current = pending;
      if (current !== undefined && (await current).database === database && pending === current)
        pending = undefined;
    },
    close: async () => {
      const current = pending;
      if (current === undefined) return;
      await (await current).database.close();
      if (pending === current) pending = undefined;
    },
  });
};
