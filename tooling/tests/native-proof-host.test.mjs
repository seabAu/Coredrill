import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { attachNativeHost } from "../../e2e/native-proof-host.mjs";

const setup = async (
  invoke = vi.fn(async () => ({ protocolVersion: 1, data: { bytes: [0, 127, 255] } })),
) => {
  const scope = {
    crypto: { randomUUID: () => "synthetic-document-identity" },
    navigator: { storage: {}, serviceWorker: {} },
  };
  const page = {
    exposeFunction: vi.fn(async (name, work) => {
      scope[name] = vi.fn(async (...args) => work(...globalThis.structuredClone(args)));
    }),
    addInitScript: vi.fn(async (work) => {
      runInNewContext(`(${work.toString()})()`, scope);
    }),
  };
  await attachNativeHost(page, invoke);
  return { scope, page, invoke };
};
const request = {
  request: {
    protocolVersion: 1,
    requestId: "synthetic-request",
    operation: { type: "portable_inspect", database: { bytes: [0, 83, 127, 255] } },
  },
};

describe("lossless simulated native-host proof transport", () => {
  it("crosses the browser binding as one JSON string, not a recursively marshalled byte array", async () => {
    const { scope } = await setup();
    await scope.__TAURI_INTERNALS__.invoke("native_archive_invoke", request);
    const wire = scope.coredrillNativeProofInvoke.mock.calls[0];
    expect(wire).toHaveLength(1);
    expect(typeof wire[0]).toBe("string");
  });

  it.each([
    request,
    {
      request: {
        operation: { type: "execute", params: [null, true, false, 0, -2.5, "literal 🧭 <tag>\n"] },
      },
    },
    {
      request: { unknown: "must survive for production rejection", nested: [{ bytes: [0, 255] }] },
    },
  ])("preserves exact JSON request/response values and document identity (%j)", async (args) => {
    const response = {
      data: { bytes: [0, 255, 83], values: [null, false, "literal 🧭"] },
      metadata: { ok: true },
    };
    const invoke = vi.fn(async () => response);
    const { scope } = await setup(invoke);
    const actual = await scope.__TAURI_INTERNALS__.invoke("native_archive_invoke", args);
    expect(JSON.parse(JSON.stringify(actual))).toEqual(response);
    expect(invoke).toHaveBeenCalledExactlyOnceWith(
      "native_archive_invoke",
      args,
      "synthetic-document-identity",
    );
  });

  it("propagates actual dispatcher failure instead of manufacturing successful protocol data", async () => {
    const failure = new Error("Synthetic dispatcher unavailable");
    const { scope } = await setup(
      vi.fn(async () => {
        throw failure;
      }),
    );
    await expect(scope.__TAURI_INTERNALS__.invoke("native_archive_invoke", request)).rejects.toBe(
      failure,
    );
  });

  it("keeps every browser fallback forbidden and observable", async () => {
    const { scope } = await setup();
    expect(scope.isTauri).toBe(true);
    await expect(scope.navigator.storage.getDirectory()).rejects.toThrow("OPFS forbidden");
    await expect(scope.navigator.storage.persist()).rejects.toThrow("persistence forbidden");
    await expect(scope.navigator.serviceWorker.register()).rejects.toThrow("SW forbidden");
    expect(() => new scope.Worker()).toThrow("worker forbidden");
    expect(JSON.parse(JSON.stringify(scope.coredrillBrowserCapabilityProbe))).toEqual({
      opfs: 1,
      persistent: 1,
      serviceWorker: 1,
      worker: 1,
    });
  });
});
