import { describe, expect, it } from "vitest";

import {
  CONNECTOR_TRANSPORT_LIMITS_V1,
  ConnectorTransportError,
  GREENHOUSE_JOB_BOARD_CONNECTOR_ID,
  LEVER_POSTINGS_CONNECTOR_ID,
  USAJOBS_SEARCH_CONNECTOR_ID,
  createConnectorPolicyDisclosuresV1,
  createConnectorTransportV1,
  createGreenhouseJobBoardRequestV1,
  createLeverPostingRequestV1,
  createUsaJobsSearchConfigurationV1,
  createUsaJobsSearchRequestV1,
  type ConnectorTransportExecutionV1,
  type ConnectorTransportRequestV1,
} from "../src/index.js";

const START = Date.parse("2026-09-26T12:00:00.000Z");
const OK = Object.freeze({
  status: 200,
  headers: Object.freeze({ "content-type": "application/json" }),
  body: '{"ok":true}',
});

const greenhouseRequest = createGreenhouseJobBoardRequestV1({
  specVersion: 1,
  boardToken: "example-board",
  jobId: 123,
});

const leverRequest = createLeverPostingRequestV1({
  specVersion: 1,
  region: "global",
  site: "example-site",
  postingId: "5ac21346-8e0c-4494-8e7a-3eb92ff77902",
});

const usaJobsConfiguration = createUsaJobsSearchConfigurationV1({
  specVersion: 1,
  registrationOwner: "user",
  registeredEmailConfigured: true,
  apiKeyConfigured: true,
  termsAccepted: true,
  termsAcceptedAt: "2026-09-26T00:00:00.000Z",
});

const usaJobsRequest = createUsaJobsSearchRequestV1(usaJobsConfiguration, {
  specVersion: 1,
  keyword: "software",
  positionTitle: null,
  locations: [],
  jobCategoryCodes: [],
  remoteIndicator: null,
  datePosted: 7,
  page: 1,
  resultsPerPage: 25,
});

const execution = (
  request: ConnectorTransportRequestV1,
  enabledConnectorIds: readonly string[] = [request.connectorId],
): ConnectorTransportExecutionV1 => ({
  request,
  userInitiated: true,
  enabledConnectorIds,
});

const errorCode = async (promise: Promise<unknown>): Promise<string | undefined> => {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error instanceof ConnectorTransportError ? error.code : undefined;
  }
};

describe("connector transport policy", () => {
  it("keeps every connector off until the user explicitly enables it", async () => {
    let calls = 0;
    const transport = createConnectorTransportV1({
      request: async () => {
        calls += 1;
        return OK;
      },
      now: () => START,
    });

    await expect(errorCode(transport.execute(execution(greenhouseRequest, [])))).resolves.toBe(
      "connector_not_enabled",
    );
    await expect(
      errorCode(
        transport.execute({
          ...execution(greenhouseRequest),
          userInitiated: false,
        }),
      ),
    ).resolves.toBe("request_not_user_initiated");
    await expect(
      errorCode(
        transport.execute(
          execution({
            ...greenhouseRequest,
            httpMethod: "POST",
          }),
        ),
      ),
    ).resolves.toBe("request_not_get");
    expect(calls).toBe(0);
    expect(
      transport
        .disclosures(new Date(START).toISOString())
        .every(({ effectiveState }) => effectiveState === "off"),
    ).toBe(true);
  });

  it.each([
    [greenhouseRequest, GREENHOUSE_JOB_BOARD_CONNECTOR_ID, "Greenhouse Job Board API"],
    [leverRequest, LEVER_POSTINGS_CONNECTOR_ID, "Lever Postings API"],
    [usaJobsRequest, USAJOBS_SEARCH_CONNECTOR_ID, "USAJOBS"],
  ] as const)(
    "attaches exact attribution and current review evidence for %s",
    async (request, id, label) => {
      const transport = createConnectorTransportV1({ request: async () => OK, now: () => START });
      const result = await transport.execute(execution(request));

      expect(result.connectorId).toBe(id);
      expect(result.attribution).toEqual({
        label,
        sourceUrl: request.destinationUrl,
        termsUrl: expect.stringMatching(/^https:\/\//),
        reviewedAt: "2026-09-26T00:00:00.000Z",
        reviewDueAt: "2026-10-26T00:00:00.000Z",
        reviewAgeDays: 0,
      });
      expect(result.cache.retention).toBe("memory_only");
      expect(
        transport
          .disclosures(new Date(START).toISOString(), [id])
          .find(({ connectorId }) => connectorId === id)?.lastUsedAt,
      ).toBe(new Date(START).toISOString());
    },
  );

  it("serves an unchanged exact request from bounded memory cache and expires it after 24 hours", async () => {
    let now = START;
    let calls = 0;
    const transport = createConnectorTransportV1({
      request: async () => {
        calls += 1;
        return OK;
      },
      now: () => now,
      delay: async (milliseconds) => {
        now += milliseconds;
      },
    });

    const first = await transport.execute(execution(greenhouseRequest));
    now += CONNECTOR_TRANSPORT_LIMITS_V1.cacheTtlMs - 1;
    const cached = await transport.execute(execution(greenhouseRequest));
    now += 1;
    const refreshed = await transport.execute(execution(greenhouseRequest));

    expect(first.source).toBe("network");
    expect(cached.source).toBe("memory_cache");
    expect(cached.attempts).toBe(0);
    expect(refreshed.source).toBe("network");
    expect(calls).toBe(2);
  });

  it("clears retained response bodies without changing approved policy records", async () => {
    let calls = 0;
    const transport = createConnectorTransportV1({
      request: async () => {
        calls += 1;
        return OK;
      },
      now: () => START,
      delay: async () => undefined,
    });

    await transport.execute(execution(leverRequest));
    transport.clearMemoryCache();
    await transport.execute(execution(leverRequest));

    expect(calls).toBe(2);
    expect(transport.disclosures(new Date(START).toISOString())[1]?.retention).toContain(
      "user-selected published posting snapshot",
    );
  });

  it("evicts the oldest response when the bounded cache reaches its entry limit", async () => {
    let now = START;
    let calls = 0;
    const transport = createConnectorTransportV1({
      request: async () => {
        calls += 1;
        return OK;
      },
      now: () => now,
      delay: async (milliseconds) => {
        now += milliseconds;
      },
    });

    for (let jobId = 1; jobId <= CONNECTOR_TRANSPORT_LIMITS_V1.maxCacheEntries + 1; jobId += 1) {
      await transport.execute(
        execution(
          createGreenhouseJobBoardRequestV1({
            specVersion: 1,
            boardToken: "bounded-board",
            jobId,
          }),
        ),
      );
    }
    const oldest = createGreenhouseJobBoardRequestV1({
      specVersion: 1,
      boardToken: "bounded-board",
      jobId: 1,
    });
    const refreshed = await transport.execute(execution(oldest));

    expect(refreshed.source).toBe("network");
    expect(calls).toBe(CONNECTOR_TRANSPORT_LIMITS_V1.maxCacheEntries + 2);
  });

  it("enforces one in-flight request for each source-specific scope", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const transport = createConnectorTransportV1({
      request: async () => {
        await gate;
        return OK;
      },
      now: () => START,
    });

    const first = transport.execute(execution(greenhouseRequest));
    await Promise.resolve();
    await expect(
      errorCode(
        transport.execute(
          execution({
            ...greenhouseRequest,
            destinationUrl: greenhouseRequest.destinationUrl.replace("/123?", "/124?"),
          }),
        ),
      ),
    ).resolves.toBe("request_in_flight");
    release?.();
    await first;
  });

  it("waits between requests in the same board scope but not a different board scope", async () => {
    let now = START;
    const delays: number[] = [];
    const transport = createConnectorTransportV1({
      request: async () => OK,
      now: () => now,
      delay: async (milliseconds) => {
        delays.push(milliseconds);
        now += milliseconds;
      },
    });
    const secondJob = {
      ...greenhouseRequest,
      destinationUrl: greenhouseRequest.destinationUrl.replace("/123?", "/124?"),
    };
    const otherBoard = createGreenhouseJobBoardRequestV1({
      specVersion: 1,
      boardToken: "another-board",
      jobId: 125,
    });

    await transport.execute(execution(greenhouseRequest));
    await transport.execute(execution(secondJob));
    await transport.execute(execution(otherBoard));

    expect(delays).toEqual([CONNECTOR_TRANSPORT_LIMITS_V1.minRequestIntervalMs]);
  });

  it("honors bounded Retry-After and succeeds on a finite retry", async () => {
    let now = START;
    const delays: number[] = [];
    let calls = 0;
    const transport = createConnectorTransportV1({
      request: async () => {
        calls += 1;
        return calls === 1 ? { status: 429, headers: { "Retry-After": "2" }, body: "busy" } : OK;
      },
      now: () => now,
      delay: async (milliseconds) => {
        delays.push(milliseconds);
        now += milliseconds;
      },
    });

    const result = await transport.execute(execution(usaJobsRequest));

    expect(result.attempts).toBe(2);
    expect(delays).toEqual([2_000]);
  });

  it("fails closed when Retry-After exceeds the bounded wait", async () => {
    const transport = createConnectorTransportV1({
      request: async () => ({ status: 429, headers: { "retry-after": "31" }, body: "busy" }),
      now: () => START,
    });

    await expect(errorCode(transport.execute(execution(usaJobsRequest)))).resolves.toBe(
      "retry_after_exceeds_limit",
    );
  });

  it("rechecks review age after backoff and stops before a newly expired retry", async () => {
    let now = Date.parse("2026-10-25T23:59:59.500Z");
    let calls = 0;
    const transport = createConnectorTransportV1({
      request: async () => {
        calls += 1;
        return { status: 503, headers: {}, body: "unavailable" };
      },
      now: () => now,
      delay: async (milliseconds) => {
        now += milliseconds;
      },
    });

    await expect(errorCode(transport.execute(execution(greenhouseRequest)))).resolves.toBe(
      "policy_denied",
    );
    expect(calls).toBe(1);
  });

  it("stops after three retryable failures and never retries a terminal response", async () => {
    let retryableCalls = 0;
    const retryable = createConnectorTransportV1({
      request: async () => {
        retryableCalls += 1;
        return { status: 503, headers: {}, body: "unavailable" };
      },
      now: () => START,
      delay: async () => undefined,
    });
    await expect(errorCode(retryable.execute(execution(leverRequest)))).resolves.toBe(
      "retry_exhausted",
    );
    expect(retryableCalls).toBe(3);

    let terminalCalls = 0;
    const terminal = createConnectorTransportV1({
      request: async () => {
        terminalCalls += 1;
        return { status: 404, headers: {}, body: "missing" };
      },
      now: () => START,
    });
    await expect(errorCode(terminal.execute(execution(leverRequest)))).resolves.toBe(
      "http_terminal",
    );
    expect(terminalCalls).toBe(1);
  });

  it("rejects oversized bodies atomically and does not cache them", async () => {
    let calls = 0;
    const transport = createConnectorTransportV1({
      request: async () => {
        calls += 1;
        return {
          status: 200,
          headers: {},
          body: "x".repeat(CONNECTOR_TRANSPORT_LIMITS_V1.maxResponseBytes + 1),
        };
      },
      now: () => START,
    });

    await expect(errorCode(transport.execute(execution(greenhouseRequest)))).resolves.toBe(
      "response_too_large",
    );
    await expect(errorCode(transport.execute(execution(greenhouseRequest)))).resolves.toBe(
      "response_too_large",
    );
    expect(calls).toBe(2);
  });

  it("shows review age, due-soon state, and blocks expired records before transport", async () => {
    const current = createConnectorPolicyDisclosuresV1("2026-09-26T12:00:00.000Z");
    expect(current).toHaveLength(3);
    expect(current.every(({ reviewAgeDays }) => reviewAgeDays === 0)).toBe(true);
    expect(current.every(({ reviewState }) => reviewState === "current")).toBe(true);

    let calls = 0;
    const expired = createConnectorTransportV1({
      request: async () => {
        calls += 1;
        return OK;
      },
      now: () => Date.parse("2026-10-26T00:00:00.000Z"),
    });
    await expect(errorCode(expired.execute(execution(greenhouseRequest)))).resolves.toBe(
      "policy_denied",
    );
    expect(calls).toBe(0);
    expect(expired.disclosures("2026-10-26T00:00:00.000Z")[0]?.effectiveState).toBe("blocked");
  });

  it("honors the global and per-connector runtime kill switches", async () => {
    const transport = createConnectorTransportV1({ request: async () => OK, now: () => START });

    await expect(
      errorCode(
        transport.execute({
          ...execution(leverRequest),
          runtimeControl: {
            disableAllNetworkConnectors: false,
            disabledConnectorIds: [LEVER_POSTINGS_CONNECTOR_ID],
          },
        }),
      ),
    ).resolves.toBe("policy_denied");
    expect(
      transport.disclosures(new Date(START).toISOString(), [LEVER_POSTINGS_CONNECTOR_ID], {
        disableAllNetworkConnectors: true,
        disabledConnectorIds: [],
      })[1]?.effectiveState,
    ).toBe("blocked");
  });
});
