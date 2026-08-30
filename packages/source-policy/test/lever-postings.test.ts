import { describe, expect, it } from "vitest";

import {
  LEVER_POSTINGS_API_HOSTS,
  LEVER_POSTINGS_CONNECTOR_ID,
  LEVER_POSTINGS_CONNECTOR_POLICY_V1,
  LEVER_POSTINGS_POLICY_METHOD,
  LeverPostingsRequestError,
  checkedInConnectorPolicyRegistryV1,
  createLeverPostingRequestV1,
  recognizeLeverHostedPostingUrlV1,
} from "../src/index.js";

const POSTING_ID = "5ac21346-8e0c-4494-8e7a-3eb92ff77902";
const CLEAR_RUNTIME = Object.freeze({
  disableAllNetworkConnectors: false,
  disabledConnectorIds: Object.freeze([]),
});

describe("Lever hosted-posting URL recognition", () => {
  it("recognizes exact global and EU job URLs without retaining tracking input", () => {
    expect(
      recognizeLeverHostedPostingUrlV1(
        `https://jobs.lever.co/leverdemo/${POSTING_ID}?lever-source=example#details`,
      ),
    ).toEqual({ specVersion: 1, region: "global", site: "leverdemo", postingId: POSTING_ID });
    expect(
      recognizeLeverHostedPostingUrlV1(
        `https://jobs.eu.lever.co/eu-demo/${POSTING_ID.toUpperCase()}/`,
      ),
    ).toEqual({ specVersion: 1, region: "eu", site: "eu-demo", postingId: POSTING_ID });
  });

  it("rejects custom, application, insecure, credentialed, keyed, and malformed URLs", () => {
    const rejected: unknown[] = [
      `https://careers.example/leverdemo/${POSTING_ID}`,
      `https://sub.jobs.lever.co/leverdemo/${POSTING_ID}`,
      `http://jobs.lever.co/leverdemo/${POSTING_ID}`,
      `https://user:secret@jobs.lever.co/leverdemo/${POSTING_ID}`,
      `https://jobs.lever.co:444/leverdemo/${POSTING_ID}`,
      `https://jobs.lever.co/leverdemo/${POSTING_ID}/apply`,
      `https://jobs.lever.co/leverdemo/${POSTING_ID}?key=secret`,
      `https://jobs.lever.co/UPPER/${POSTING_ID}`,
      `https://jobs.lever.co/leverdemo/not-a-posting-id`,
      `https://jobs.lever.co/leverdemo%2Fother/${POSTING_ID}`,
      ` https://jobs.lever.co/leverdemo/${POSTING_ID}`,
      42,
    ];

    for (const source of rejected) {
      expect(recognizeLeverHostedPostingUrlV1(source)).toBeNull();
    }
  });
});

describe("Lever GET-only requests and checked-in policy", () => {
  it("builds immutable exact-host global and EU detail GETs", () => {
    const globalRequest = createLeverPostingRequestV1({
      specVersion: 1,
      region: "global",
      site: "leverdemo",
      postingId: POSTING_ID,
    });
    const euRequest = createLeverPostingRequestV1({
      specVersion: 1,
      region: "eu",
      site: "eu-demo",
      postingId: POSTING_ID,
    });

    expect(globalRequest).toEqual({
      specVersion: 1,
      connectorId: LEVER_POSTINGS_CONNECTOR_ID,
      policyMethod: LEVER_POSTINGS_POLICY_METHOD,
      httpMethod: "GET",
      destinationUrl: `https://api.lever.co/v0/postings/leverdemo/${POSTING_ID}`,
      credentials: "omit",
      headers: { accept: "application/json" },
    });
    expect(euRequest.destinationUrl).toBe(
      `https://api.eu.lever.co/v0/postings/eu-demo/${POSTING_ID}`,
    );
    expect(Object.isFrozen(globalRequest)).toBe(true);
    expect(Object.isFrozen(globalRequest.headers)).toBe(true);
    expect(globalRequest.destinationUrl).not.toContain("/apply");
    expect(globalRequest.destinationUrl).not.toContain("key=");
  });

  it("rejects malformed or extended references with content-free errors", () => {
    const invalidReferences: unknown[] = [
      { specVersion: 2, region: "global", site: "demo", postingId: POSTING_ID },
      { specVersion: 1, region: "other", site: "demo", postingId: POSTING_ID },
      { specVersion: 1, region: "global", site: "demo/other", postingId: POSTING_ID },
      { specVersion: 1, region: "global", site: "demo", postingId: "not-a-uuid" },
      {
        specVersion: 1,
        region: "global",
        site: "demo",
        postingId: POSTING_ID,
        method: "POST",
      },
    ];

    for (const reference of invalidReferences) {
      expect(() => createLeverPostingRequestV1(reference as never)).toThrowError(
        LeverPostingsRequestError,
      );
      try {
        createLeverPostingRequestV1(reference as never);
      } catch (error) {
        expect((error as LeverPostingsRequestError).code).toBe("reference_invalid");
        expect((error as Error).message).not.toContain("demo");
      }
    }
  });

  it("authorizes both exact reviewed regions and remains fail-closed and kill-switchable", () => {
    for (const region of ["global", "eu"] as const) {
      const request = createLeverPostingRequestV1({
        specVersion: 1,
        region,
        site: "demo",
        postingId: POSTING_ID,
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
        connectorId: LEVER_POSTINGS_CONNECTOR_ID,
      });
      expect(
        checkedInConnectorPolicyRegistryV1.authorize(
          {
            ...acquisition,
            destinationUrl: `https://sub.${LEVER_POSTINGS_API_HOSTS[region]}/v0/postings/demo/${POSTING_ID}`,
          },
          CLEAR_RUNTIME,
        ),
      ).toMatchObject({ allowed: false, reason: "destination_not_allowed" });
    }

    const request = createLeverPostingRequestV1({
      specVersion: 1,
      region: "global",
      site: "demo",
      postingId: POSTING_ID,
    });
    const acquisition = {
      kind: "network_connector" as const,
      connectorId: request.connectorId,
      method: request.policyMethod,
      destinationUrl: request.destinationUrl,
      now: "2026-08-30T12:00:00.000Z",
    };
    expect(
      checkedInConnectorPolicyRegistryV1.authorize(acquisition, {
        disableAllNetworkConnectors: false,
        disabledConnectorIds: [LEVER_POSTINGS_CONNECTOR_ID],
      }),
    ).toMatchObject({ allowed: false, reason: "runtime_kill_switch" });
    expect(
      checkedInConnectorPolicyRegistryV1.authorize(
        { ...acquisition, now: LEVER_POSTINGS_CONNECTOR_POLICY_V1.reviewDueAt },
        CLEAR_RUNTIME,
      ),
    ).toMatchObject({ allowed: false, reason: "review_not_current" });
  });

  it("retains the reviewed public-posting, no-credential, attribution, and retention controls", () => {
    expect(LEVER_POSTINGS_CONNECTOR_POLICY_V1).toMatchObject({
      id: LEVER_POSTINGS_CONNECTOR_ID,
      status: "enabled",
      allowedMethods: [LEVER_POSTINGS_POLICY_METHOD],
      baseDomains: [LEVER_POSTINGS_API_HOSTS.global, LEVER_POSTINGS_API_HOSTS.eu],
      attribution: "required",
      credentials: "none",
      reviewedAt: "2026-08-30T00:00:00.000Z",
      reviewDueAt: "2026-09-29T00:00:00.000Z",
      killSwitch: true,
    });
    expect(LEVER_POSTINGS_CONNECTOR_POLICY_V1.licenseOrReuseBasis).toContain(
      "may be scraped by third parties",
    );
    expect(LEVER_POSTINGS_CONNECTOR_POLICY_V1.retention).toContain("Never submit or retain");
  });

  it("emits the retained XTR-005 policy proof record", () => {
    const globalRequest = createLeverPostingRequestV1({
      specVersion: 1,
      region: "global",
      site: "proof-site",
      postingId: POSTING_ID,
    });
    const euRequest = createLeverPostingRequestV1({
      specVersion: 1,
      region: "eu",
      site: "proof-site",
      postingId: POSTING_ID,
    });
    const proof = {
      connectorId: LEVER_POSTINGS_CONNECTOR_ID,
      reviewedAt: LEVER_POSTINGS_CONNECTOR_POLICY_V1.reviewedAt,
      reviewDueAt: LEVER_POSTINGS_CONNECTOR_POLICY_V1.reviewDueAt,
      exactGlobalHost:
        new URL(globalRequest.destinationUrl).hostname === LEVER_POSTINGS_API_HOSTS.global,
      exactEuHost: new URL(euRequest.destinationUrl).hostname === LEVER_POSTINGS_API_HOSTS.eu,
      getOnly: globalRequest.httpMethod === "GET" && euRequest.httpMethod === "GET",
      credentialsOmitted: globalRequest.credentials === "omit" && euRequest.credentials === "omit",
      applicationPathExcluded:
        !globalRequest.destinationUrl.includes("/apply") &&
        !euRequest.destinationUrl.includes("/apply"),
      attributionRequired: LEVER_POSTINGS_CONNECTOR_POLICY_V1.attribution === "required",
      killSwitchRequired: LEVER_POSTINGS_CONNECTOR_POLICY_V1.killSwitch,
    };
    expect(proof).toEqual({
      connectorId: "lever-postings",
      reviewedAt: "2026-08-30T00:00:00.000Z",
      reviewDueAt: "2026-09-29T00:00:00.000Z",
      exactGlobalHost: true,
      exactEuHost: true,
      getOnly: true,
      credentialsOmitted: true,
      applicationPathExcluded: true,
      attributionRequired: true,
      killSwitchRequired: true,
    });
    const runtimeProcess = (
      globalThis as typeof globalThis & {
        readonly process?: { readonly stdout?: { write(value: string): unknown } };
      }
    ).process;
    runtimeProcess?.stdout?.write(`XTR005_POLICY_PROOF ${JSON.stringify(proof)}\n`);
  });
});
