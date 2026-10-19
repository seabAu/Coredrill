import { describe, expect, it, vi } from "vitest";
import { entityId, instant } from "@coredrill/domain";
import {
  createVaultBootstrapOperations,
  VaultLifecycleError,
  type VaultBootstrapPort,
  type VaultBootstrapStateDto,
} from "../src/index.js";

const id = entityId("vault", "0199a200-0000-7000-8000-000000000001");
const at = instant("2026-10-19T12:00:00.000Z");
const context = {
  operationId: entityId("application-operation", "0199a200-0000-7000-8000-000000000002"),
  initiatedAt: at,
};
const state = (): VaultBootstrapStateDto => ({
  vault: {
    id,
    name: "My literal local vault",
    schemaVersion: 158,
    createdAt: at,
    lastOpenedAt: at,
  },
  diagnostics: {
    health: "ready",
    persistence: "durable",
    readOnly: false,
    schemaVersion: 158,
    issueCodes: [],
  },
});
const fixture = () => {
  const port: VaultBootstrapPort = {
    inspect: vi.fn(async () => state()),
    create: vi.fn(async () => ({ ...state(), vault: state().vault! })),
    open: vi.fn(async () => ({ ...state(), vault: state().vault! })),
    diagnostics: vi.fn(async () => state().diagnostics),
  };
  return {
    port,
    operations: createVaultBootstrapOperations({ lifecycle: port, createVaultId: () => id }),
  };
};

describe("production vault bootstrap", () => {
  it("inspects absence without inventing an identity or invoking create/open", async () => {
    const { port, operations } = fixture();
    vi.mocked(port.inspect).mockResolvedValue({ ...state(), vault: null });
    const result = await operations.inspectVaultQuery.execute(undefined, context);
    expect(result).toEqual({ ok: true, value: { ...state(), vault: null } });
    expect(port.create).not.toHaveBeenCalled();
    expect(port.open).not.toHaveBeenCalled();
    expect(operations.inspectVaultQuery.kind).toBe("query");
  });
  it("copies known fields immutably and omits arbitrary diagnostic/private fields", async () => {
    const { port, operations } = fixture();
    const input = {
      ...state(),
      privatePath: "synthetic private path",
      diagnostics: { ...state().diagnostics, details: ["synthetic exception text"] },
    };
    vi.mocked(port.inspect).mockResolvedValue(input);
    const result = await operations.inspectVaultQuery.execute(undefined, context);
    expect(result).toEqual({ ok: true, value: state() });
    if (!result.ok) throw new Error("Inspection failed");
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.vault)).toBe(true);
    expect(Object.isFrozen(result.value.diagnostics.issueCodes)).toBe(true);
  });
  it.each([1, 159])(
    "reports stored schema %s mismatch as degraded, without rewriting the identity",
    async (version) => {
      const { port, operations } = fixture();
      const input = state();
      vi.mocked(port.inspect).mockResolvedValue({
        ...input,
        vault: { ...input.vault!, schemaVersion: version },
      });
      expect(await operations.inspectVaultQuery.execute(undefined, context)).toMatchObject({
        ok: true,
        value: {
          vault: { schemaVersion: version },
          diagnostics: { health: "degraded", issueCodes: ["schema-mismatch"] },
        },
      });
      expect(port.open).not.toHaveBeenCalled();
    },
  );
  it("does not upgrade unavailable health when schema metadata differs", async () => {
    const { port, operations } = fixture();
    vi.mocked(port.inspect).mockResolvedValue({
      ...state(),
      vault: { ...state().vault!, schemaVersion: 1 },
      diagnostics: { ...state().diagnostics, health: "unavailable" },
    });
    expect(await operations.inspectVaultQuery.execute(undefined, context)).toMatchObject({
      ok: true,
      value: { diagnostics: { health: "unavailable" } },
    });
  });
  it.each([
    undefined,
    {},
    { ...state(), vault: undefined },
    { ...state(), diagnostics: { ...state().diagnostics, issueCodes: ["private path"] } },
  ])("rejects malformed inspection facts safely", async (value) => {
    const { port, operations } = fixture();
    vi.mocked(port.inspect).mockResolvedValue(value as unknown as VaultBootstrapStateDto);
    expect(await operations.inspectVaultQuery.execute(undefined, context)).toMatchObject({
      ok: false,
      error: { code: "internal" },
    });
  });
  it("reuses name validation before calling the atomic create port", async () => {
    const { port, operations } = fixture();
    expect(await operations.createVaultCommand.execute({ name: "\n" }, context)).toMatchObject({
      ok: false,
      error: { code: "validation" },
    });
    expect(port.create).not.toHaveBeenCalled();
    expect(
      await operations.createVaultCommand.execute({ name: "My literal local vault" }, context),
    ).toEqual({ ok: true, value: state() });
    expect(port.create).toHaveBeenCalledWith({
      vaultId: id,
      name: "My literal local vault",
      createdAt: at,
    });
  });
  it("preserves typed ambiguity failures and redacts unknown exceptions", async () => {
    const { port, operations } = fixture();
    for (const error of [
      new VaultLifecycleError("invalid_state"),
      new Error("synthetic private exception"),
    ]) {
      vi.mocked(port.inspect).mockRejectedValue(error);
      const result = await operations.inspectVaultQuery.execute(undefined, context);
      expect(result).toMatchObject({ ok: false, error: { code: "internal" } });
      expect(JSON.stringify(result)).not.toContain("synthetic private exception");
    }
  });
});
