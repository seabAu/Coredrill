import { describe, expect, it } from "vitest";

import {
  GREENHOUSE_JOB_BOARD_API_HOST,
  GREENHOUSE_JOB_BOARD_CONNECTOR_ID,
  GREENHOUSE_JOB_BOARD_CONNECTOR_POLICY_V1,
  GREENHOUSE_JOB_BOARD_POLICY_METHOD,
  GreenhouseJobBoardRequestError,
  checkedInConnectorPolicyRegistryV1,
  createGreenhouseJobBoardRequestV1,
  recognizeGreenhouseJobPostUrlV1,
} from "../src/index.js";

const CLEAR_RUNTIME = Object.freeze({
  disableAllNetworkConnectors: false,
  disabledConnectorIds: Object.freeze([]),
});

describe("Greenhouse hosted-job URL recognition", () => {
  it("recognizes current, legacy, and gh_jid hosted URL forms without retaining tracking input", () => {
    expect(
      recognizeGreenhouseJobPostUrlV1(
        "https://job-boards.greenhouse.io/acme/jobs/123456?gh_src=source-token#application",
      ),
    ).toEqual({ specVersion: 1, boardToken: "acme", jobId: 123456 });
    expect(
      recognizeGreenhouseJobPostUrlV1("https://boards.greenhouse.io/acme/jobs/123456/"),
    ).toEqual({ specVersion: 1, boardToken: "acme", jobId: 123456 });
    expect(
      recognizeGreenhouseJobPostUrlV1(
        "https://boards.greenhouse.io/acme?gh_jid=123456&gh_src=source-token",
      ),
    ).toEqual({ specVersion: 1, boardToken: "acme", jobId: 123456 });
  });

  it("rejects custom, insecure, credentialed, ambiguous, and malformed URLs", () => {
    const rejected: unknown[] = [
      "https://careers.example/jobs?gh_jid=123456",
      "http://boards.greenhouse.io/acme/jobs/123456",
      "https://user:secret@boards.greenhouse.io/acme/jobs/123456",
      "https://sub.boards.greenhouse.io/acme/jobs/123456",
      "https://boards.greenhouse.io:444/acme/jobs/123456",
      "https://boards.greenhouse.io/acme/jobs/0",
      "https://boards.greenhouse.io/acme/jobs/123456?gh_jid=654321",
      "https://boards.greenhouse.io/acme?gh_jid=123456&gh_jid=654321",
      "https://boards.greenhouse.io/acme%2Fother/jobs/123456",
      " https://boards.greenhouse.io/acme/jobs/123456",
      123456,
    ];

    for (const source of rejected) {
      expect(recognizeGreenhouseJobPostUrlV1(source)).toBeNull();
    }
  });
});

describe("Greenhouse GET-only request and checked-in policy", () => {
  it("builds one immutable public-detail GET without questions, credentials, or arbitrary hosts", () => {
    const request = createGreenhouseJobBoardRequestV1({
      specVersion: 1,
      boardToken: "acme_jobs",
      jobId: 123456,
    });

    expect(request).toEqual({
      specVersion: 1,
      connectorId: GREENHOUSE_JOB_BOARD_CONNECTOR_ID,
      policyMethod: GREENHOUSE_JOB_BOARD_POLICY_METHOD,
      httpMethod: "GET",
      destinationUrl:
        "https://boards-api.greenhouse.io/v1/boards/acme_jobs/jobs/123456?pay_transparency=true",
      credentials: "omit",
      headers: { accept: "application/json" },
    });
    expect(Object.isFrozen(request)).toBe(true);
    expect(Object.isFrozen(request.headers)).toBe(true);
    expect(request.destinationUrl).not.toContain("questions");
    expect(request.destinationUrl).not.toContain("callback");
  });

  it("rejects malformed or extended references with content-free errors", () => {
    const invalidReferences: unknown[] = [
      { specVersion: 2, boardToken: "acme", jobId: 123456 },
      { specVersion: 1, boardToken: "acme/other", jobId: 123456 },
      { specVersion: 1, boardToken: "acme", jobId: 0 },
      { specVersion: 1, boardToken: "acme", jobId: Number.MAX_SAFE_INTEGER + 1 },
      { specVersion: 1, boardToken: "acme", jobId: 123456, method: "POST" },
    ];

    for (const reference of invalidReferences) {
      expect(() => createGreenhouseJobBoardRequestV1(reference as never)).toThrowError(
        GreenhouseJobBoardRequestError,
      );
      try {
        createGreenhouseJobBoardRequestV1(reference as never);
      } catch (error) {
        expect((error as GreenhouseJobBoardRequestError).code).toBe("reference_invalid");
        expect((error as Error).message).not.toContain("acme");
      }
    }
  });

  it("authorizes only the exact reviewed API destination and remains kill-switchable", () => {
    const request = createGreenhouseJobBoardRequestV1({
      specVersion: 1,
      boardToken: "acme",
      jobId: 123456,
    });
    const acquisition = {
      kind: "network_connector" as const,
      connectorId: request.connectorId,
      method: request.policyMethod,
      destinationUrl: request.destinationUrl,
      now: "2026-08-30T12:00:00.000Z",
    };

    expect(checkedInConnectorPolicyRegistryV1.authorize(acquisition, CLEAR_RUNTIME)).toEqual({
      allowed: true,
      reason: "connector_allowed",
      connectorId: GREENHOUSE_JOB_BOARD_CONNECTOR_ID,
    });
    expect(
      checkedInConnectorPolicyRegistryV1.authorize(
        { ...acquisition, destinationUrl: `https://sub.${GREENHOUSE_JOB_BOARD_API_HOST}/v1/jobs` },
        CLEAR_RUNTIME,
      ),
    ).toMatchObject({ allowed: false, reason: "destination_not_allowed" });
    expect(
      checkedInConnectorPolicyRegistryV1.authorize(acquisition, {
        disableAllNetworkConnectors: false,
        disabledConnectorIds: [GREENHOUSE_JOB_BOARD_CONNECTOR_ID],
      }),
    ).toMatchObject({ allowed: false, reason: "runtime_kill_switch" });
    expect(
      checkedInConnectorPolicyRegistryV1.authorize(
        { ...acquisition, now: GREENHOUSE_JOB_BOARD_CONNECTOR_POLICY_V1.reviewDueAt },
        CLEAR_RUNTIME,
      ),
    ).toMatchObject({ allowed: false, reason: "review_not_current" });
  });

  it("retains the reviewed no-credential, attribution, retention, and review controls", () => {
    expect(GREENHOUSE_JOB_BOARD_CONNECTOR_POLICY_V1).toMatchObject({
      id: GREENHOUSE_JOB_BOARD_CONNECTOR_ID,
      status: "enabled",
      allowedMethods: [GREENHOUSE_JOB_BOARD_POLICY_METHOD],
      baseDomains: [GREENHOUSE_JOB_BOARD_API_HOST],
      attribution: "required",
      credentials: "none",
      reviewedAt: "2026-08-30T00:00:00.000Z",
      reviewDueAt: "2026-09-29T00:00:00.000Z",
      killSwitch: true,
    });
    expect(GREENHOUSE_JOB_BOARD_CONNECTOR_POLICY_V1.ratePolicy).toContain(
      "one user-initiated GET per second",
    );
    expect(GREENHOUSE_JOB_BOARD_CONNECTOR_POLICY_V1.retention).toContain(
      "Never retain application questions",
    );
  });

  it("emits the retained XTR-004 policy proof record", () => {
    const request = createGreenhouseJobBoardRequestV1({
      specVersion: 1,
      boardToken: "proof-board",
      jobId: 987654,
    });
    const proof = {
      connectorId: GREENHOUSE_JOB_BOARD_CONNECTOR_ID,
      reviewedAt: GREENHOUSE_JOB_BOARD_CONNECTOR_POLICY_V1.reviewedAt,
      reviewDueAt: GREENHOUSE_JOB_BOARD_CONNECTOR_POLICY_V1.reviewDueAt,
      exactApiHost: new URL(request.destinationUrl).hostname === GREENHOUSE_JOB_BOARD_API_HOST,
      getOnly: request.httpMethod === "GET",
      credentialsOmitted: request.credentials === "omit",
      questionsExcluded: !request.destinationUrl.includes("questions"),
      payTransparencyRequested: request.destinationUrl.endsWith("pay_transparency=true"),
      attributionRequired: GREENHOUSE_JOB_BOARD_CONNECTOR_POLICY_V1.attribution === "required",
      killSwitchRequired: GREENHOUSE_JOB_BOARD_CONNECTOR_POLICY_V1.killSwitch,
    };
    expect(proof).toEqual({
      connectorId: "greenhouse-job-board",
      reviewedAt: "2026-08-30T00:00:00.000Z",
      reviewDueAt: "2026-09-29T00:00:00.000Z",
      exactApiHost: true,
      getOnly: true,
      credentialsOmitted: true,
      questionsExcluded: true,
      payTransparencyRequested: true,
      attributionRequired: true,
      killSwitchRequired: true,
    });
    const runtimeProcess = (
      globalThis as typeof globalThis & {
        readonly process?: { readonly stdout?: { write(value: string): unknown } };
      }
    ).process;
    runtimeProcess?.stdout?.write(`XTR004_POLICY_PROOF ${JSON.stringify(proof)}\n`);
  });
});
