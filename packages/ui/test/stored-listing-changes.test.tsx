import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  RETAINED_LISTING_ANALYSIS_V1,
  type JobSourceComparisonDto,
  type RetainedListingFact,
  type RetainedListingField,
  type RetainedListingFieldDiff,
} from "@coredrill/application";
import {
  StoredListingChanges,
  type ComparisonLiteralValue,
  type StoredListingChangesProps,
} from "../src/index.js";

const fact = (): RetainedListingFact => ({
  key: "requirement-slot",
  valueJson: JSON.stringify({
    category: "qualification",
    content: "<script>neverExecute()</script>",
  }),
  sourceValueJson: JSON.stringify("original source"),
  rawValueJson: null,
  candidateId: null,
  sourcePointer: "/content/apiPayload/qualifications/0",
  sourceType: "capture",
  sourceId: "original-capture",
  capturedAt: "2026-10-19T12:00:00.000Z",
  licenseNote: "Synthetic fixture license",
  sourceExcerpt: "<img src=x onerror=neverExecute()>",
  method: "jsonld",
  confidence: 0.84,
  extractor: { name: "synthetic.jsonld", version: "1.0.0" },
  origin: "current_jsonld_analysis",
});
const field = (state: RetainedListingField["state"] = "known"): RetainedListingField => ({
  state,
  reason: state === "known" ? null : "no_candidates",
  items: state === "known" ? [fact()] : [],
  absenceEvidence: [],
});
const diff = (state: RetainedListingField["state"] = "known"): RetainedListingFieldDiff => ({
  kind: state === "known" ? "changed" : "not_comparable",
  reason: state === "known" ? null : "incomplete_evidence",
  before: field(state),
  after: field(state),
  added: [],
  removed: [],
  changed: state === "known" ? [fact().key] : [],
});
const changes = (
  fields: Partial<JobSourceComparisonDto["fields"]> = {},
): JobSourceComparisonDto => ({
  specVersion: 1,
  jobId: "job",
  baselineSnapshotId: "earlier-snapshot",
  currentSnapshotId: "later-snapshot",
  baselineCapturedAt: "2026-10-18T12:00:00.000Z",
  currentCapturedAt: "2026-10-19T12:00:00.000Z",
  baselineEnvelopeId: "earlier-capture",
  currentEnvelopeId: "later-capture",
  analyzedAt: "2026-10-20T04:00:00.000Z",
  analysis: RETAINED_LISTING_ANALYSIS_V1,
  fields: {
    requirements: diff(),
    compensation: diff("missing"),
    deadline: diff("missing"),
    locations: diff("missing"),
    ...fields,
  },
  content: { kind: "changed", beforeHash: "a".repeat(64), afterHash: "b".repeat(64) },
  refreshPerformed: false,
  trustedFieldMutationPerformed: false,
});
const literal = (text: string | null): ComparisonLiteralValue => ({
  analysisTime: changes().analyzedAt,
  side: "after",
  field: "requirements",
  index: 0,
  key: fact().key,
  part: "raw",
  snapshotId: "later-snapshot",
  sourceType: "capture",
  sourceId: "later-capture",
  sourcePointer: fact().sourcePointer,
  text,
  byteOffset: 0,
  byteLength: text === null ? null : new TextEncoder().encode(text).byteLength,
  bytesRead: text === null ? 0 : new TextEncoder().encode(text).byteLength,
  hasMore: false,
});
const render = (patch: Partial<StoredListingChangesProps> = {}) =>
  renderToStaticMarkup(
    createElement(StoredListingChanges, {
      changes: changes(),
      literal: null,
      busy: false,
      chronological: true,
      onCompare: () => undefined,
      onInspect: () => undefined,
      onPart: () => undefined,
      ...patch,
    }),
  );

describe("normal retained Listing changes presentation", () => {
  it("requires an explicit action and does not invent unchanged fields before a result", () => {
    const html = render({ changes: null });
    expect(html).toContain("Compare retained listing fields");
    expect(html).toContain("Missing evidence is never inferred to be unchanged");
    expect(html).not.toContain("Unchanged comparable values");
    expect(html).not.toContain("Compensation changes");
  });
  it("explains equal-time uncertainty and disables comparison", () => {
    const html = render({ changes: null, chronological: false });
    expect(html).toContain("change order is unknown");
    expect(html).toMatch(/disabled=""[^>]*>Compare retained listing fields/u);
  });
  it("discloses exact pair/analysis identities and escapes every source-shaped value", () => {
    const html = render();
    expect(html).toContain("earlier-snapshot");
    expect(html).toContain("later-snapshot");
    expect(html).toContain("Current local analysis");
    expect(html).toContain("not inferred semantic identities");
    expect(html).toContain("Reordering can change slots");
    expect(html).toContain("&lt;script&gt;neverExecute()&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=neverExecute()&gt;");
    expect(html).not.toMatch(/<(?:script|img|iframe)\b/u);
    expect(html).not.toContain('href="https://');
    expect(html).toContain("Not a stored candidate — current analysis");
    expect(html).toContain("Synthetic fixture license");
    expect(html).toContain("Extraction confidence (not verification)");
    expect(html).toContain("not verified employer facts");
  });
  it("keeps missing/ambiguous/unavailable evidence out of zero-change totals", () => {
    const value = changes({
      requirements: diff("missing"),
      compensation: diff("ambiguous"),
      deadline: diff("unavailable"),
      locations: diff("missing"),
    });
    const html = render({ changes: value });
    expect(html).toContain("Unknown — no retained value");
    expect(html).toContain("Uncertain retained evidence");
    expect(html).toContain("Local analysis unavailable");
    expect(html).not.toContain("0 added");
    expect(html).not.toContain("Unchanged comparable values");
  });
  it("shows explicit empty-array evidence without inventing confidence or a stored candidate", () => {
    const absence = {
      ...fact(),
      valueJson: "[]",
      sourceValueJson: "[]",
      confidence: null,
      method: "literal",
    };
    const value = changes({
      requirements: {
        ...diff(),
        after: {
          state: "known",
          reason: null,
          items: [],
          absenceEvidence: [absence],
        },
      },
    });
    const html = render({ changes: value });
    expect(html).toContain("Explicitly empty retained array");
    expect(html).toContain("literal");
    expect(html).toContain("Not a stored candidate");
  });
  it.each([null, "null", '""'])(
    "keeps raw absence, JSON null and empty-string serialization distinct: %j",
    (text) => {
      const html = render({ literal: literal(text) });
      expect(html).toContain("Comparison value inspector");
      if (text === null) {
        expect(html).toContain("No separate raw-candidate value");
        expect(html).not.toContain("Comparison value literal part");
      } else {
        expect(html).toContain("Comparison value literal part");
        expect(html).toContain("This part contains the complete value");
        expect(html).not.toContain("No separate raw-candidate value");
      }
    },
  );
  it("does not mount full large literals in the fact list or imply that previews are complete", () => {
    const value = changes({
      requirements: {
        ...diff(),
        after: {
          ...field(),
          items: [
            {
              ...fact(),
              valueJson: JSON.stringify({ text: `${"x".repeat(100000)}END_LARGE_VALUE` }),
            },
          ],
        },
      },
    });
    const html = render({ changes: value });
    expect(html).toContain("preview; inspect the complete value");
    expect(html).not.toContain("END_LARGE_VALUE");
  });
  it("formats salary decimals and date precision without conversion or a percentage", () => {
    const value = changes({
      compensation: {
        ...diff(),
        after: {
          ...field(),
          items: [
            {
              ...fact(),
              valueJson: JSON.stringify({
                kind: "salary",
                currency: "BHD",
                minimumDecimal: "125.001",
                maximumDecimal: "150.125",
                interval: "month",
              }),
            },
          ],
        },
      },
      deadline: {
        ...diff(),
        after: {
          ...field(),
          items: [
            {
              ...fact(),
              valueJson: JSON.stringify({
                kind: "date",
                date: "2026-12-01",
                precision: "date",
                instant: null,
              }),
            },
          ],
        },
      },
    });
    const html = render({ changes: value });
    expect(html).toContain("BHD 125.001–150.125 / month");
    expect(html).toContain("2026-12-01 (date only)");
    expect(html).not.toContain("100%");
  });
});
