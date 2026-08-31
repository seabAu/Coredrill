import { describe, expect, it } from "vitest";

import {
  USAJOBS_SEARCH_API_ENDPOINT,
  USAJOBS_SEARCH_API_HOST,
  USAJOBS_SEARCH_CONNECTOR_ID,
  USAJOBS_SEARCH_CONNECTOR_POLICY_V1,
  USAJOBS_SEARCH_LIMITS,
  USAJOBS_SEARCH_POLICY_METHOD,
  UsaJobsSearchError,
  checkedInConnectorPolicyRegistryV1,
  createUsaJobsSearchConfigurationV1,
  createUsaJobsSearchRequestV1,
  type UsaJobsPublicSearchQueryV1,
  type UsaJobsSearchConfigurationV1,
} from "../src/index.js";

const CLEAR_RUNTIME = Object.freeze({
  disableAllNetworkConnectors: false,
  disabledConnectorIds: Object.freeze([]),
});

function configuration(): UsaJobsSearchConfigurationV1 {
  return createUsaJobsSearchConfigurationV1({
    specVersion: 1,
    registrationOwner: "user",
    registeredEmailConfigured: true,
    apiKeyConfigured: true,
    termsAccepted: true,
    termsAcceptedAt: "2026-08-30T12:00:00.000Z",
  });
}

function query(overrides: Partial<UsaJobsPublicSearchQueryV1> = {}): UsaJobsPublicSearchQueryV1 {
  return {
    specVersion: 1,
    keyword: "cyber security",
    positionTitle: "IT Specialist",
    locations: ["Atlanta, Georgia", "Washington DC, District of Columbia"],
    jobCategoryCodes: ["2210", "1550"],
    remoteIndicator: true,
    datePosted: 30,
    page: 2,
    resultsPerPage: 50,
    ...overrides,
  };
}

function expectError(operation: () => unknown, code: UsaJobsSearchError["code"]): void {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(UsaJobsSearchError);
    expect((error as UsaJobsSearchError).code).toBe(code);
    expect((error as Error).message).not.toContain("secret@example.test");
    expect((error as Error).message).not.toContain("api-key-value");
    return;
  }
  throw new Error(`Expected USAJOBS search error ${code}.`);
}

describe("USAJOBS user-owned configuration", () => {
  it("records only readiness and opaque required-header bindings", () => {
    const configured = configuration();

    expect(configured).toEqual({
      specVersion: 1,
      connectorId: USAJOBS_SEARCH_CONNECTOR_ID,
      registrationOwner: "user",
      credentialMode: "user_configured",
      termsAccepted: true,
      termsAcceptedAt: "2026-08-30T12:00:00.000Z",
      requiredHeaderBindings: {
        Host: { binding: "destination_host" },
        "User-Agent": { binding: "registered_email" },
        "Authorization-Key": { binding: "api_key" },
      },
      publicJobsOnly: true,
      executionBoundary: "privileged_connector_only",
    });
    expect(Object.isFrozen(configured)).toBe(true);
    expect(Object.isFrozen(configured.requiredHeaderBindings)).toBe(true);
    expect(JSON.stringify(configured)).not.toContain("@");
    expect(JSON.stringify(configured)).not.toContain("api-key-value");
  });

  it("rejects incomplete, stale, extended, or credential-bearing attestations content-free", () => {
    const base = {
      specVersion: 1,
      registrationOwner: "user",
      registeredEmailConfigured: true,
      apiKeyConfigured: true,
      termsAccepted: true,
      termsAcceptedAt: "2026-08-30T12:00:00.000Z",
    } as const;
    const invalid: unknown[] = [
      { ...base, registeredEmailConfigured: false },
      { ...base, apiKeyConfigured: false },
      { ...base, termsAccepted: false },
      { ...base, termsAcceptedAt: "2026-08-29T23:59:59.999Z" },
      { ...base, termsAcceptedAt: "2026-09-29T00:00:00.000Z" },
      { ...base, registeredEmail: "secret@example.test" },
      { ...base, authorizationKey: "api-key-value" },
    ];

    for (const input of invalid) {
      expectError(
        () => createUsaJobsSearchConfigurationV1(input as never),
        "configuration_invalid",
      );
    }
  });
});

describe("USAJOBS targeted Public-only request descriptors", () => {
  it("builds an immutable deterministic exact-endpoint GET without credential values", () => {
    const request = createUsaJobsSearchRequestV1(configuration(), query());

    expect(request).toEqual({
      specVersion: 1,
      connectorId: USAJOBS_SEARCH_CONNECTOR_ID,
      policyMethod: USAJOBS_SEARCH_POLICY_METHOD,
      httpMethod: "GET",
      destinationUrl:
        "https://data.usajobs.gov/api/search?Keyword=cyber+security&PositionTitle=IT+Specialist&LocationName=Atlanta%2C+Georgia%3BWashington+DC%2C+District+of+Columbia&JobCategoryCode=2210%3B1550&RemoteIndicator=True&DatePosted=30&Page=2&ResultsPerPage=50&WhoMayApply=Public&Fields=Full",
      credentials: "user_configured",
      headers: { accept: "application/json" },
      requiredHeaderBindings: {
        Host: { binding: "destination_host" },
        "User-Agent": { binding: "registered_email" },
        "Authorization-Key": { binding: "api_key" },
      },
      publicJobsOnly: true,
      executionBoundary: "privileged_connector_only",
    });
    expect(request.destinationUrl.startsWith(`${USAJOBS_SEARCH_API_ENDPOINT}?`)).toBe(true);
    expect(new URL(request.destinationUrl).hostname).toBe(USAJOBS_SEARCH_API_HOST);
    expect(new URL(request.destinationUrl).searchParams.get("WhoMayApply")).toBe("Public");
    expect(new URL(request.destinationUrl).searchParams.get("Fields")).toBe("Full");
    expect(request.destinationUrl).not.toContain("Status");
    expect(request.destinationUrl).not.toContain("All");
    expect(JSON.stringify(request)).not.toContain("@");
    expect(Object.isFrozen(request)).toBe(true);
    expect(Object.isFrozen(request.headers)).toBe(true);
  });

  it("rejects broad, extended, delimiter-injecting, duplicated, and out-of-bound queries", () => {
    const configured = configuration();
    expectError(
      () =>
        createUsaJobsSearchRequestV1(
          configured,
          query({ keyword: null, positionTitle: null, locations: [], jobCategoryCodes: [] }),
        ),
      "query_too_broad",
    );

    const invalid: unknown[] = [
      { ...query(), whoMayApply: "Status" },
      { ...query(), status: true },
      query({ locations: ["Atlanta;Status"] }),
      query({ locations: ["Atlanta", "Atlanta"] }),
      query({ jobCategoryCodes: ["2210", "2210"] }),
      query({ jobCategoryCodes: ["22x0"] }),
      query({ datePosted: USAJOBS_SEARCH_LIMITS.maxDatePostedDays + 1 }),
      query({ page: USAJOBS_SEARCH_LIMITS.maxPage + 1 }),
      query({ resultsPerPage: USAJOBS_SEARCH_LIMITS.maxResultsPerPage + 1 }),
      query({ keyword: " secret@example.test\n" }),
    ];
    for (const input of invalid) {
      expectError(
        () => createUsaJobsSearchRequestV1(configured, input as UsaJobsPublicSearchQueryV1),
        "query_invalid",
      );
    }
  });

  it("authorizes only the exact reviewed host and remains deadline- and kill-switch-bound", () => {
    const request = createUsaJobsSearchRequestV1(configuration(), query());
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
      connectorId: USAJOBS_SEARCH_CONNECTOR_ID,
    });
    expect(
      checkedInConnectorPolicyRegistryV1.authorize(
        { ...acquisition, destinationUrl: request.destinationUrl.replace("data.", "sub.data.") },
        CLEAR_RUNTIME,
      ),
    ).toMatchObject({ allowed: false, reason: "destination_not_allowed" });
    expect(
      checkedInConnectorPolicyRegistryV1.authorize(acquisition, {
        disableAllNetworkConnectors: false,
        disabledConnectorIds: [USAJOBS_SEARCH_CONNECTOR_ID],
      }),
    ).toMatchObject({ allowed: false, reason: "runtime_kill_switch" });
    expect(
      checkedInConnectorPolicyRegistryV1.authorize(
        { ...acquisition, now: USAJOBS_SEARCH_CONNECTOR_POLICY_V1.reviewDueAt },
        CLEAR_RUNTIME,
      ),
    ).toMatchObject({ allowed: false, reason: "review_not_current" });
  });

  it("emits the retained XTR-006 policy proof record", () => {
    const request = createUsaJobsSearchRequestV1(configuration(), query());
    const url = new URL(request.destinationUrl);
    const proof = {
      connectorId: USAJOBS_SEARCH_CONNECTOR_ID,
      reviewedAt: USAJOBS_SEARCH_CONNECTOR_POLICY_V1.reviewedAt,
      reviewDueAt: USAJOBS_SEARCH_CONNECTOR_POLICY_V1.reviewDueAt,
      exactHost: url.hostname === USAJOBS_SEARCH_API_HOST,
      exactPath: `${url.origin}${url.pathname}` === USAJOBS_SEARCH_API_ENDPOINT,
      getOnly: request.httpMethod === "GET",
      publicOnly: url.searchParams.get("WhoMayApply") === "Public",
      fullFields: url.searchParams.get("Fields") === "Full",
      userConfiguredCredentials:
        request.credentials === "user_configured" &&
        USAJOBS_SEARCH_CONNECTOR_POLICY_V1.credentials === "user_configured",
      credentialValuesExcluded: !JSON.stringify(request).includes("@"),
      privilegedBoundary: request.executionBoundary === "privileged_connector_only",
      attributionRequired: USAJOBS_SEARCH_CONNECTOR_POLICY_V1.attribution === "required",
      killSwitchRequired: USAJOBS_SEARCH_CONNECTOR_POLICY_V1.killSwitch,
    };
    expect(proof).toEqual({
      connectorId: "usajobs-search",
      reviewedAt: "2026-08-30T00:00:00.000Z",
      reviewDueAt: "2026-09-29T00:00:00.000Z",
      exactHost: true,
      exactPath: true,
      getOnly: true,
      publicOnly: true,
      fullFields: true,
      userConfiguredCredentials: true,
      credentialValuesExcluded: true,
      privilegedBoundary: true,
      attributionRequired: true,
      killSwitchRequired: true,
    });
    const runtimeProcess = (
      globalThis as typeof globalThis & {
        readonly process?: { readonly stdout?: { write(value: string): unknown } };
      }
    ).process;
    runtimeProcess?.stdout?.write(`XTR006_POLICY_PROOF ${JSON.stringify(proof)}\n`);
  });
});
