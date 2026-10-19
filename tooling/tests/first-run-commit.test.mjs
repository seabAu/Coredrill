import { describe, expect, it, vi } from "vitest";
import { createFirstRunCommitter } from "../../apps/web/src/first-run-commit.ts";
import { prepareSuppliedCaptureDraft } from "../../apps/web/src/supplied-capture.ts";
import { storedVaultHealth } from "../../apps/web/src/vault-presentation.ts";

const diagnostics = {
  health: "ready",
  persistence: "durable",
  readOnly: false,
  schemaVersion: 158,
  issueCodes: [],
};
const quick = () => ({
  track: "quick",
  destination: "home",
  runtime: "browser",
  vaultName: "Literal local name",
  firstJob: {
    method: "manual",
    title: "Synthetic first role",
    company: "Synthetic Setup Lab",
    sourceText: "",
  },
});
const guided = () => ({
  track: "guided",
  destination: "home",
  runtime: "browser",
  vaultName: "Guided local name",
  aiMode: "disabled",
  backup: "remind-later",
  extension: "later",
  imports: [],
  optionalLock: false,
});
const fixture = () => {
  let current = null;
  const api = {
    inspect: vi.fn(async () => ({
      ok: true,
      value: { vault: current?.vault ?? null, diagnostics },
    })),
    create: vi.fn(async ({ name }) => {
      current = {
        vault: {
          id: "0199a200-0000-7000-8000-000000000001",
          name,
          schemaVersion: 158,
          createdAt: "2026-10-19T12:00:00.000Z",
          lastOpenedAt: "2026-10-19T12:00:00.000Z",
        },
        diagnostics,
      };
      return { ok: true, value: current };
    }),
  };
  const saveCapture = vi.fn(async () => undefined);
  const onVaultSaved = vi.fn();
  const committer = createFirstRunCommitter({
    runtimeKind: "browser",
    getVaultApi: () => api,
    prepareCapture: (job) =>
      prepareSuppliedCaptureDraft({
        mode: job.method,
        title: job.title,
        company: job.company,
        sourceUrl: "",
        text: job.sourceText,
        file: null,
      }),
    saveCapture,
    onVaultSaved,
  });
  return {
    api,
    committer,
    saveCapture,
    onVaultSaved,
    remove: () => {
      current = null;
    },
  };
};

describe("durable first-run orchestration", () => {
  it("explicit defaults create a real named identity without seeding a capture", async () => {
    const { api, committer, saveCapture } = fixture();
    expect(await committer.skip()).toEqual({ ok: true, value: undefined });
    expect(api.create).toHaveBeenCalledExactlyOnceWith({ name: "My job search" });
    expect(saveCapture).not.toHaveBeenCalled();
  });
  it("retains acknowledged vault progress after capture failure and retries without a second identity", async () => {
    const { api, committer, saveCapture, onVaultSaved } = fixture();
    saveCapture.mockRejectedValueOnce(new Error("synthetic private exception"));
    const request = quick();
    const before = globalThis.structuredClone(request);
    const failed = await committer.complete(request);
    expect(failed.ok).toBe(false);
    expect(JSON.stringify(failed)).not.toContain("synthetic private exception");
    expect(await committer.complete(request)).toEqual({ ok: true, value: undefined });
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(onVaultSaved).toHaveBeenCalledTimes(1);
    expect(saveCapture).toHaveBeenCalledTimes(2);
    expect(request).toEqual(before);
  });
  it("does not rename a saved vault and allows explicit deferral with that saved name", async () => {
    const { api, committer, saveCapture } = fixture();
    saveCapture.mockRejectedValue(new Error("synthetic write failure"));
    await committer.complete(quick());
    expect((await committer.complete({ ...quick(), vaultName: "Different name" })).ok).toBe(false);
    expect(await committer.skip()).toEqual({ ok: true, value: undefined });
    expect(api.create).toHaveBeenCalledTimes(1);
    expect((await api.inspect()).value.vault.name).toBe("Literal local name");
  });
  it("does not replace an identity initialized by another owner", async () => {
    const { api, committer, saveCapture } = fixture();
    await api.create({ name: "Already here" });
    api.create.mockClear();
    expect((await committer.complete(quick())).ok).toBe(false);
    expect(api.create).not.toHaveBeenCalled();
    expect(saveCapture).not.toHaveBeenCalled();
  });
  it("does not create another root when an acknowledged one disappears", async () => {
    const { api, committer, remove } = fixture();
    await committer.skip();
    remove();
    expect((await committer.skip()).ok).toBe(false);
    expect(api.create).toHaveBeenCalledTimes(1);
  });
  it.each([
    { runtime: "desktop" },
    { track: "unsupported" },
    { aiMode: "local" },
    { aiMode: "byok" },
    { optionalLock: true },
    { backup: "configure-now" },
    { extension: "pair" },
    { imports: ["resume"] },
  ])("rejects unavailable setup intent before any storage mutation: %j", async (change) => {
    const { api, committer } = fixture();
    expect(await committer.complete({ ...guided(), ...change })).toMatchObject({
      ok: false,
      error: { code: "validation" },
    });
    expect(api.inspect).not.toHaveBeenCalled();
    expect(api.create).not.toHaveBeenCalled();
  });
  it("validates capture input before creating a vault", async () => {
    const { api, committer } = fixture();
    expect(
      await committer.complete({ ...quick(), firstJob: { ...quick().firstJob, title: "" } }),
    ).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(api.create).not.toHaveBeenCalled();
  });
  it("snapshots the request and rejects simultaneous second commits", async () => {
    const { api, committer, saveCapture } = fixture();
    let release;
    api.inspect.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const request = quick();
    const first = committer.complete(request);
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    request.vaultName = "Mutated while pending";
    request.firstJob.title = "Mutated title";
    expect((await committer.skip()).ok).toBe(false);
    release({ ok: true, value: { vault: null, diagnostics } });
    expect((await first).ok).toBe(true);
    expect(api.create).toHaveBeenCalledWith({ name: "Literal local name" });
    expect(saveCapture.mock.calls[0][0].fields.title.value).toBe("Synthetic first role");
  });
});

describe("observed vault presentation", () => {
  it("requires ready durable writable storage with no warning before saying healthy", () => {
    expect(storedVaultHealth(diagnostics)).toBe("healthy");
    for (const change of [
      { persistence: "best-effort" },
      { persistence: "memory" },
      { readOnly: true },
      { health: "degraded" },
      { health: "unavailable" },
      { issueCodes: ["quota-low"] },
    ]) {
      expect(storedVaultHealth({ ...diagnostics, ...change })).toBe("storage-risk");
    }
    expect(storedVaultHealth({ ...diagnostics, issueCodes: ["schema-mismatch"] })).toBe(
      "migration-required",
    );
    expect(
      storedVaultHealth({ ...diagnostics, health: "unavailable", issueCodes: ["schema-mismatch"] }),
    ).toBe("storage-risk");
  });
});
