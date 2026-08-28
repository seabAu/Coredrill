import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { entityId, instant } from "@coredrill/domain";

import {
  VAULT_DIAGNOSTIC_ISSUE_CODES,
  VaultLifecycleError,
  createVaultOperations,
  type ApplicationOperationContext,
  type ApplicationResult,
  type VaultLifecyclePort,
  type VaultSessionDto,
} from "../src/index.js";

const VAULT_ID = entityId("vault", "0198e201-0000-7000-8000-000000000001");
const CREATED_AT = instant("2026-08-28T13:00:00.000Z");
const OPENED_AT = instant("2026-08-28T14:00:00.000Z");
const context: ApplicationOperationContext = {
  operationId: entityId("application-operation", "0198e201-0000-7000-8000-000000000002"),
  initiatedAt: CREATED_AT,
};

const readySession = (): VaultSessionDto => ({
  vault: {
    id: VAULT_ID,
    name: "Local search",
    schemaVersion: 84,
    createdAt: CREATED_AT,
    lastOpenedAt: CREATED_AT,
  },
  diagnostics: {
    health: "ready",
    persistence: "durable",
    readOnly: false,
    schemaVersion: 84,
    issueCodes: [],
  },
});

const lifecyclePort = (): VaultLifecyclePort => ({
  create: vi.fn(async () => readySession()),
  open: vi.fn(async () => readySession()),
  diagnostics: vi.fn(async () => readySession().diagnostics),
});

describe("vault application operations", () => {
  it("creates an accountless local vault and returns an immutable redacted session DTO", async () => {
    const lifecycle = lifecyclePort();
    const operations = createVaultOperations({
      lifecycle,
      createVaultId: () => VAULT_ID,
    });

    expect(operations.createVaultCommand).toMatchObject({
      kind: "command",
      name: "CreateVaultCommand",
      transactional: true,
    });
    await expect(
      operations.createVaultCommand.execute({ name: "Local search" }, context),
    ).resolves.toEqual({ ok: true, value: readySession() });
    expect(lifecycle.create).toHaveBeenCalledWith({
      vaultId: VAULT_ID,
      name: "Local search",
      createdAt: CREATED_AT,
    });

    const result = await operations.createVaultCommand.execute({ name: "Local search" }, context);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.isFrozen(result.value)).toBe(true);
      expect(Object.isFrozen(result.value.vault)).toBe(true);
      expect(Object.isFrozen(result.value.diagnostics)).toBe(true);
      expect(Object.isFrozen(result.value.diagnostics.issueCodes)).toBe(true);
      expect(result.value.diagnostics).not.toHaveProperty("adapterName");
      expect(result.value.diagnostics).not.toHaveProperty("details");
    }
    expectTypeOf(operations.createVaultCommand.execute).returns.toEqualTypeOf<
      Promise<ApplicationResult<VaultSessionDto>>
    >();
  });

  it.each([
    ["empty", ""],
    ["whitespace", "   "],
    ["control characters", "Unsafe\nname"],
    ["overlong text", "v".repeat(513)],
  ])("rejects %s vault names before storage is called", async (_label, name) => {
    const lifecycle = lifecyclePort();
    const { createVaultCommand } = createVaultOperations({
      lifecycle,
      createVaultId: () => VAULT_ID,
    });

    await expect(createVaultCommand.execute({ name }, context)).resolves.toEqual({
      ok: false,
      error: {
        code: "validation",
        message: "Enter a vault name between 1 and 512 characters without control characters.",
        retryable: false,
      },
    });
    expect(lifecycle.create).not.toHaveBeenCalled();
  });

  it("opens a vault by validated UUIDv7 and uses the operation instant for the durable touch", async () => {
    const lifecycle = lifecyclePort();
    const { openVaultCommand } = createVaultOperations({
      lifecycle,
      createVaultId: () => VAULT_ID,
    });
    const openContext = { ...context, initiatedAt: OPENED_AT };
    const openedSession: VaultSessionDto = {
      ...readySession(),
      vault: { ...readySession().vault, lastOpenedAt: OPENED_AT },
    };
    vi.mocked(lifecycle.open).mockResolvedValueOnce(openedSession);

    expect(openVaultCommand).toMatchObject({
      kind: "command",
      name: "OpenVaultCommand",
      transactional: true,
    });
    await expect(openVaultCommand.execute({ vaultId: VAULT_ID }, openContext)).resolves.toEqual({
      ok: true,
      value: openedSession,
    });
    expect(lifecycle.open).toHaveBeenCalledWith({ vaultId: VAULT_ID, openedAt: OPENED_AT });

    await expect(
      openVaultCommand.execute({ vaultId: "not-a-vault-id" }, openContext),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "validation",
        message: "Choose a valid local vault.",
        retryable: false,
      },
    });
    expect(lifecycle.open).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["already_exists", "conflict", "A local vault with this identity already exists.", false],
    ["not_found", "not_found", "The local vault could not be found.", false],
    ["busy", "conflict", "The vault is open elsewhere. Close it there, then retry.", true],
    ["unavailable", "unavailable", "Local vault storage is unavailable.", true],
    [
      "permission_denied",
      "permission_denied",
      "Coredrill cannot access local vault storage.",
      true,
    ],
    ["read_only", "permission_denied", "The local vault is read-only.", false],
    ["invalid_state", "internal", "The local vault is not in a usable state.", false],
  ] as const)(
    "maps the %s lifecycle failure to a stable content-free application error",
    async (portCode, applicationCode, message, retryable) => {
      const lifecycle = lifecyclePort();
      vi.mocked(lifecycle.open).mockRejectedValueOnce(new VaultLifecycleError(portCode));
      const { openVaultCommand } = createVaultOperations({
        lifecycle,
        createVaultId: () => VAULT_ID,
      });

      await expect(openVaultCommand.execute({ vaultId: VAULT_ID }, context)).resolves.toEqual({
        ok: false,
        error: { code: applicationCode, message, retryable },
      });
    },
  );

  it("redacts unknown adapter failures instead of returning paths, SQL, or user content", async () => {
    const lifecycle = lifecyclePort();
    vi.mocked(lifecycle.create).mockRejectedValueOnce(
      new Error("C:\\Users\\Candidate\\private.sqlite contains resume text and SQL"),
    );
    const { createVaultCommand } = createVaultOperations({
      lifecycle,
      createVaultId: () => VAULT_ID,
    });

    const result = await createVaultCommand.execute({ name: "Local search" }, context);
    expect(result).toEqual({
      ok: false,
      error: {
        code: "internal",
        message: "The local vault operation failed safely.",
        retryable: false,
      },
    });
    expect(JSON.stringify(result)).not.toContain("Candidate");
    expect(JSON.stringify(result)).not.toContain("resume");
    expect(JSON.stringify(result)).not.toContain("SQL");
  });

  it("returns only reviewed diagnostic issue codes and omits adapter details", async () => {
    const lifecycle = lifecyclePort();
    vi.mocked(lifecycle.diagnostics).mockResolvedValueOnce({
      health: "degraded",
      persistence: "best-effort",
      readOnly: false,
      schemaVersion: 84,
      issueCodes: ["persistence-denied", "quota-low"],
      adapterName: "must-not-survive",
      details: ["C:\\Users\\Candidate\\private.sqlite"],
    } as Awaited<ReturnType<VaultLifecyclePort["diagnostics"]>> & {
      adapterName: string;
      details: readonly string[];
    });
    const { getVaultDiagnosticsQuery } = createVaultOperations({
      lifecycle,
      createVaultId: () => VAULT_ID,
    });

    expect(getVaultDiagnosticsQuery).toMatchObject({
      kind: "query",
      name: "GetVaultDiagnosticsQuery",
      readOnly: true,
    });
    const result = await getVaultDiagnosticsQuery.execute(undefined, context);
    expect(result).toEqual({
      ok: true,
      value: {
        health: "degraded",
        persistence: "best-effort",
        readOnly: false,
        schemaVersion: 84,
        issueCodes: ["persistence-denied", "quota-low"],
      },
    });
    expect(JSON.stringify(result)).not.toContain("adapterName");
    expect(JSON.stringify(result)).not.toContain("Candidate");
    expect(VAULT_DIAGNOSTIC_ISSUE_CODES).toContain("persistence-denied");
  });

  it.each([
    [{ health: "unknown" }, "unreviewed health"],
    [{ persistence: "cloud" }, "unreviewed persistence"],
    [{ schemaVersion: -1 }, "invalid schema version"],
    [{ issueCodes: ["raw-path"] }, "unreviewed issue code"],
    [{ issueCodes: ["quota-low", "quota-low"] }, "duplicate issue code"],
  ])("fails closed for %s returned by the lifecycle port", async (override, _label) => {
    const lifecycle = lifecyclePort();
    vi.mocked(lifecycle.diagnostics).mockResolvedValueOnce({
      ...readySession().diagnostics,
      ...override,
    } as never);
    const { getVaultDiagnosticsQuery } = createVaultOperations({
      lifecycle,
      createVaultId: () => VAULT_ID,
    });

    await expect(getVaultDiagnosticsQuery.execute(undefined, context)).resolves.toEqual({
      ok: false,
      error: {
        code: "internal",
        message: "The local vault operation failed safely.",
        retryable: false,
      },
    });
  });

  it("fails closed when a port returns a mismatched or malformed vault session", async () => {
    const lifecycle = lifecyclePort();
    vi.mocked(lifecycle.create).mockResolvedValueOnce({
      ...readySession(),
      vault: {
        ...readySession().vault,
        id: entityId("vault", "0198e201-0000-7000-8000-000000000099"),
      },
    });
    const { createVaultCommand } = createVaultOperations({
      lifecycle,
      createVaultId: () => VAULT_ID,
    });

    await expect(createVaultCommand.execute({ name: "Local search" }, context)).resolves.toEqual({
      ok: false,
      error: {
        code: "internal",
        message: "The local vault operation failed safely.",
        retryable: false,
      },
    });
  });
});
