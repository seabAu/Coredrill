/** Simulated host only. The supplied callback dispatches to the actual Rust process. */
export const attachNativeHost = async (page, invoke) => {
  // Both directions cross Playwright as one string. Decode to the original JSON
  // arguments before dispatch; the actual Rust protocol and its validators are unchanged.
  await page.exposeFunction("coredrillNativeProofInvoke", async (serialized) => {
    const [command, args, documentId] = JSON.parse(serialized);
    return JSON.stringify(await invoke(command, args, documentId));
  });
  await page.addInitScript(() => {
    globalThis.isTauri = true;
    const documentId = globalThis.crypto.randomUUID();
    globalThis.__TAURI_INTERNALS__ = {
      invoke: async (command, args) =>
        JSON.parse(
          await globalThis.coredrillNativeProofInvoke(JSON.stringify([command, args, documentId])),
        ),
    };
    const calls = { opfs: 0, persistent: 0, serviceWorker: 0, worker: 0 };
    globalThis.coredrillBrowserCapabilityProbe = calls;
    globalThis.navigator.storage.getDirectory = async () => {
      calls.opfs += 1;
      throw new Error("OPFS forbidden in native proof");
    };
    globalThis.navigator.storage.persist = async () => {
      calls.persistent += 1;
      throw new Error("Browser persistence forbidden");
    };
    globalThis.navigator.serviceWorker.register = async () => {
      calls.serviceWorker += 1;
      throw new Error("Browser SW forbidden");
    };
    globalThis.Worker = function ForbiddenNativeProofWorker() {
      calls.worker += 1;
      throw new Error("Browser worker forbidden");
    };
  });
};
