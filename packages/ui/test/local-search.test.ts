import { describe, expect, it } from "vitest";

import {
  LOCAL_SEARCH_LIMITS,
  matchesLocalSearchQuery,
  searchLocalResults,
  tokenizeLocalSearchQuery,
  validateLocalSearchResults,
  type LocalSearchResult,
} from "../src/index.js";

const RESULT = Object.freeze({
  context: "Northstar Health · Interviewing",
  href: "/jobs/job-northstar/overview",
  id: "search-job-northstar",
  kind: "job" as const,
  title: "Product Operations Lead",
});

describe("local search contract", () => {
  it("uses normalized all-token matching across local result fields without a score", () => {
    expect(searchLocalResults([RESULT], "ＮＯＲＴＨＳＴＡＲ lead")).toEqual([RESULT]);
    expect(searchLocalResults([RESULT], "lead canvas")).toEqual([]);
    expect(matchesLocalSearchQuery(["Canvas Works", "Platform Engineer"], "canvas engineer")).toBe(
      true,
    );
  });

  it("bounds hostile queries to the reviewed character, token, and token-length limits", () => {
    const query = `${"x".repeat(80)} ${Array.from({ length: 20 }, (_, index) => `token${String(index)}`).join(" ")} ${"ignored".repeat(100)}`;
    const tokens = tokenizeLocalSearchQuery(query);

    expect(tokens).toHaveLength(LOCAL_SEARCH_LIMITS.maximumTokens);
    expect(tokens[0]).toHaveLength(LOCAL_SEARCH_LIMITS.maximumTokenCharacters);
    expect(tokens).not.toContain("token15");
  });

  it("keeps deterministic source order and caps an unscored result set at 100", () => {
    const results = Object.freeze(
      Array.from({ length: 101 }, (_, index) =>
        Object.freeze({
          ...RESULT,
          href: `/jobs/job-${String(index)}/overview`,
          id: `search-job-${String(index)}`,
          title: `Job ${String(index)}`,
        }),
      ),
    );

    const matches = searchLocalResults(results, "");
    expect(matches).toHaveLength(LOCAL_SEARCH_LIMITS.maximumResults);
    expect(matches[0]?.id).toBe("search-job-0");
    expect(matches.at(-1)?.id).toBe("search-job-99");
  });

  it("rejects duplicate IDs, unsafe URLs, and kind-route mismatches", () => {
    expect(() => validateLocalSearchResults([RESULT, RESULT])).toThrowError(
      "Local search result contract is invalid.",
    );
    expect(() =>
      validateLocalSearchResults([
        { ...RESULT, href: "https://example.test/jobs/job-northstar/overview" },
      ]),
    ).toThrowError("Local search result contract is invalid.");
    expect(() =>
      validateLocalSearchResults([
        { ...RESULT, href: "/network/companies/company-northstar" } as LocalSearchResult,
      ]),
    ).toThrowError("Local search result contract is invalid.");
  });
});
