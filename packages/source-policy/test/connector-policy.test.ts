import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  CHECKED_IN_CONNECTOR_POLICY_RECORDS_V1,
  ConnectorPolicyError,
  GREENHOUSE_JOB_BOARD_CONNECTOR_ID,
  GREENHOUSE_JOB_BOARD_CONNECTOR_POLICY_V1,
  LEVER_POSTINGS_CONNECTOR_ID,
  LEVER_POSTINGS_CONNECTOR_POLICY_V1,
  checkedInConnectorPolicyRegistryV1,
  createConnectorPolicyRegistryV1,
  parseConnectorPolicyRecordV1,
  type ConnectorPolicyErrorCode,
  type ConnectorPolicyRecordV1,
  type ConnectorRuntimeControlV1,
} from "../src/index.js";

const ENABLED_RECORD: ConnectorPolicyRecordV1 = {
  specVersion: 1,
  id: "synthetic-jobs-api",
  owner: "Coredrill policy fixture",
  status: "enabled",
  allowedMethods: ["documented_public_api"],
  baseDomains: ["api.jobs.example"],
  termsUrl: "https://policy.jobs.example/terms",
  privacyUrl: "https://policy.jobs.example/privacy",
  licenseOrReuseBasis: "Synthetic published-job fixture with no production content.",
  reviewedAt: "2026-08-01T00:00:00.000Z",
  reviewDueAt: "2026-09-01T00:00:00.000Z",
  ratePolicy: "Synthetic requests are cached and bounded.",
  retention: "Normalized fixture record plus review snapshot.",
  attribution: "required",
  credentials: "none",
  userVisibleDataFlow: "Fetch one synthetic job payload after an explicit user action.",
  killSwitch: true,
};

const CLEAR_RUNTIME: ConnectorRuntimeControlV1 = {
  disableAllNetworkConnectors: false,
  disabledConnectorIds: [],
};

const NETWORK_REQUEST = {
  kind: "network_connector" as const,
  connectorId: ENABLED_RECORD.id,
  method: "documented_public_api",
  destinationUrl: "https://api.jobs.example/v1/jobs/fixture",
  now: "2026-08-30T12:00:00.000Z",
};

function expectErrorCode(operation: () => unknown, code: ConnectorPolicyErrorCode): void {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(ConnectorPolicyError);
    expect((error as ConnectorPolicyError).code).toBe(code);
    expect((error as Error).message).not.toContain(ENABLED_RECORD.id);
    return;
  }
  throw new Error(`Expected connector policy error ${code}.`);
}

describe("connector policy records", () => {
  it("strictly parses and freezes a complete version-1 policy record", () => {
    const parsed = parseConnectorPolicyRecordV1(ENABLED_RECORD);

    expect(parsed).toEqual(ENABLED_RECORD);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.allowedMethods)).toBe(true);
    expect(Object.isFrozen(parsed.baseDomains)).toBe(true);
  });

  it("rejects extra fields, unsafe URLs/domains, stale ordering, and a missing kill switch", () => {
    const invalidRecords: unknown[] = [
      { ...ENABLED_RECORD, extra: true },
      { ...ENABLED_RECORD, termsUrl: "http://policy.jobs.example/terms" },
      { ...ENABLED_RECORD, privacyUrl: "https://user:secret@policy.jobs.example/privacy" },
      { ...ENABLED_RECORD, baseDomains: ["*.jobs.example"] },
      { ...ENABLED_RECORD, baseDomains: ["api.jobs.example", "api.jobs.example"] },
      { ...ENABLED_RECORD, reviewedAt: ENABLED_RECORD.reviewDueAt },
      { ...ENABLED_RECORD, killSwitch: false },
      { ...ENABLED_RECORD, allowedMethods: ["general_crawl"] },
    ];

    for (const invalid of invalidRecords) {
      expectErrorCode(() => parseConnectorPolicyRecordV1(invalid), "record_invalid");
    }
  });

  it("rejects duplicate connector IDs and oversized registries before authorization", () => {
    expectErrorCode(
      () => createConnectorPolicyRegistryV1([ENABLED_RECORD, ENABLED_RECORD]),
      "duplicate_record_id",
    );
    expectErrorCode(
      () =>
        createConnectorPolicyRegistryV1(
          Array.from({ length: 65 }, (_, index) => ({
            ...ENABLED_RECORD,
            id: `synthetic-${index}`,
          })),
        ),
      "record_limit_exceeded",
    );
  });
});

describe("connector policy authorization", () => {
  it("allows only an enabled, current, exact HTTPS destination and reviewed method", () => {
    const registry = createConnectorPolicyRegistryV1([ENABLED_RECORD]);

    expect(registry.authorize(NETWORK_REQUEST, CLEAR_RUNTIME)).toEqual({
      allowed: true,
      reason: "connector_allowed",
      connectorId: ENABLED_RECORD.id,
    });
    expect(
      registry.authorize(
        { ...NETWORK_REQUEST, destinationUrl: "https://sub.api.jobs.example/v1/jobs/fixture" },
        CLEAR_RUNTIME,
      ),
    ).toMatchObject({ allowed: false, reason: "destination_not_allowed" });
    expect(
      registry.authorize(
        { ...NETWORK_REQUEST, destinationUrl: "https://api.jobs.example:444/v1/jobs/fixture" },
        CLEAR_RUNTIME,
      ),
    ).toMatchObject({ allowed: false, reason: "destination_not_allowed" });
    expect(
      registry.authorize(
        { ...NETWORK_REQUEST, destinationUrl: "http://api.jobs.example/v1/jobs/fixture" },
        CLEAR_RUNTIME,
      ),
    ).toMatchObject({ allowed: false, reason: "destination_not_allowed" });
    expect(
      registry.authorize({ ...NETWORK_REQUEST, method: "configured_official_api" }, CLEAR_RUNTIME),
    ).toMatchObject({ allowed: false, reason: "method_not_allowed" });
  });

  it("fails closed for unknown, checked-in-disabled, not-yet-current, and expired policies", () => {
    const registry = createConnectorPolicyRegistryV1([
      ENABLED_RECORD,
      { ...ENABLED_RECORD, id: "disabled-api", status: "disabled" },
    ]);

    expect(
      registry.authorize({ ...NETWORK_REQUEST, connectorId: "unknown-api" }, CLEAR_RUNTIME),
    ).toMatchObject({ allowed: false, reason: "unknown_connector" });
    expect(
      registry.authorize({ ...NETWORK_REQUEST, connectorId: "disabled-api" }, CLEAR_RUNTIME),
    ).toMatchObject({ allowed: false, reason: "connector_disabled" });
    expect(
      registry.authorize({ ...NETWORK_REQUEST, now: "2026-07-31T23:59:59.999Z" }, CLEAR_RUNTIME),
    ).toMatchObject({ allowed: false, reason: "review_not_current" });
    expect(
      registry.authorize({ ...NETWORK_REQUEST, now: ENABLED_RECORD.reviewDueAt }, CLEAR_RUNTIME),
    ).toMatchObject({ allowed: false, reason: "review_not_current" });
  });

  it("applies targeted and global runtime kill switches without disabling manual capture", () => {
    const registry = createConnectorPolicyRegistryV1([ENABLED_RECORD]);
    const targeted = {
      disableAllNetworkConnectors: false,
      disabledConnectorIds: [ENABLED_RECORD.id],
    } as const;
    const global = {
      disableAllNetworkConnectors: true,
      disabledConnectorIds: [],
    } as const;

    expect(registry.authorize(NETWORK_REQUEST, targeted)).toMatchObject({
      allowed: false,
      reason: "runtime_kill_switch",
    });
    expect(registry.authorize(NETWORK_REQUEST, global)).toMatchObject({
      allowed: false,
      reason: "runtime_kill_switch",
    });
    expect(registry.authorize({ kind: "manual_capture" }, global)).toEqual({
      allowed: true,
      reason: "manual_capture",
      connectorId: null,
    });
    expect(registry.authorize({ kind: "manual_capture" })).toEqual({
      allowed: true,
      reason: "manual_capture",
      connectorId: null,
    });
  });

  it("rejects malformed requests and runtime controls with content-free errors", () => {
    const registry = createConnectorPolicyRegistryV1([ENABLED_RECORD]);
    expectErrorCode(() => registry.authorize(NETWORK_REQUEST), "runtime_control_invalid");
    expectErrorCode(
      () => registry.authorize({ ...NETWORK_REQUEST, now: "not-an-instant" }, CLEAR_RUNTIME),
      "request_invalid",
    );
    expectErrorCode(
      () =>
        registry.authorize(NETWORK_REQUEST, {
          disableAllNetworkConnectors: false,
          disabledConnectorIds: [ENABLED_RECORD.id, ENABLED_RECORD.id],
        }),
      "runtime_control_invalid",
    );
    expectErrorCode(
      () =>
        registry.authorize(
          { kind: "manual_capture", connectorId: ENABLED_RECORD.id } as never,
          CLEAR_RUNTIME,
        ),
      "request_invalid",
    );
  });

  it("never expands an exact destination into attacker-controlled subdomains", () => {
    const registry = createConnectorPolicyRegistryV1([ENABLED_RECORD]);
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z]{1,20}$/u), (prefix) => {
        const decision = registry.authorize(
          {
            ...NETWORK_REQUEST,
            destinationUrl: `https://${prefix}.api.jobs.example/v1/jobs/fixture`,
          },
          CLEAR_RUNTIME,
        );
        expect(decision).toMatchObject({ allowed: false, reason: "destination_not_allowed" });
      }),
    );
  });

  it("registers only reviewed connectors while preserving fail-closed defaults", () => {
    expect(CHECKED_IN_CONNECTOR_POLICY_RECORDS_V1).toEqual([
      GREENHOUSE_JOB_BOARD_CONNECTOR_POLICY_V1,
      LEVER_POSTINGS_CONNECTOR_POLICY_V1,
    ]);
    expect(GREENHOUSE_JOB_BOARD_CONNECTOR_POLICY_V1.id).toBe(GREENHOUSE_JOB_BOARD_CONNECTOR_ID);
    expect(
      checkedInConnectorPolicyRegistryV1.authorize(NETWORK_REQUEST, CLEAR_RUNTIME),
    ).toMatchObject({ allowed: false, reason: "unknown_connector" });
    expect(
      checkedInConnectorPolicyRegistryV1.authorize(
        { kind: "manual_capture" },
        {
          disableAllNetworkConnectors: true,
          disabledConnectorIds: [],
        },
      ),
    ).toMatchObject({ allowed: true, reason: "manual_capture" });
  });

  it("emits the retained XTR-001 proof record", () => {
    const registry = createConnectorPolicyRegistryV1([ENABLED_RECORD]);
    const proof = {
      strictRecordAccepted: registry.records.length === 1,
      exactDestinationAllowed: registry.authorize(NETWORK_REQUEST, CLEAR_RUNTIME).allowed,
      unknownConnectorDenied:
        registry.authorize({ ...NETWORK_REQUEST, connectorId: "unknown-api" }, CLEAR_RUNTIME)
          .reason === "unknown_connector",
      targetedKillSwitchDenied:
        registry.authorize(NETWORK_REQUEST, {
          disableAllNetworkConnectors: false,
          disabledConnectorIds: [ENABLED_RECORD.id],
        }).reason === "runtime_kill_switch",
      globalKillSwitchDenied:
        registry.authorize(NETWORK_REQUEST, {
          disableAllNetworkConnectors: true,
          disabledConnectorIds: [],
        }).reason === "runtime_kill_switch",
      manualCaptureUnaffected:
        registry.authorize(
          { kind: "manual_capture" },
          { disableAllNetworkConnectors: true, disabledConnectorIds: [] },
        ).reason === "manual_capture",
      productionNetworkRecords: CHECKED_IN_CONNECTOR_POLICY_RECORDS_V1.length,
    };
    expect(proof).toEqual({
      strictRecordAccepted: true,
      exactDestinationAllowed: true,
      unknownConnectorDenied: true,
      targetedKillSwitchDenied: true,
      globalKillSwitchDenied: true,
      manualCaptureUnaffected: true,
      productionNetworkRecords: 2,
    });
    const runtimeProcess = (
      globalThis as typeof globalThis & {
        readonly process?: { readonly stdout?: { write(value: string): unknown } };
      }
    ).process;
    runtimeProcess?.stdout?.write(`XTR001_PROOF ${JSON.stringify(proof)}\n`);
  });
});
