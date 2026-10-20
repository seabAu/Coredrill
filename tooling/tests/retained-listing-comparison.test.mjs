import { describe, expect, it, vi } from "vitest";
import {
  createJobSourceComparisonQuery,
  RetainedListingAnalysisLimitError,
} from "../../packages/application/src/job-source-comparison.ts";
import { analyzeRetainedListing } from "../../apps/web/src/retained-listing-analysis.ts";
import fixture from "../../packages/contracts/test/fixtures/capture-envelope.valid.json" with { type: "json" };

const jobId = "0198e208-0000-7000-8000-000000000001";
const baselineSnapshotId = "0198e208-0000-7000-8000-000000000002";
const currentSnapshotId = "0198e208-0000-7000-8000-000000000003";
const context = {
  operationId: "0198e208-0000-7000-8000-000000000004",
  initiatedAt: "2026-10-19T12:00:00.000Z",
};
const request = { jobId, baselineSnapshotId, currentSnapshotId };
const posting = (patch = {}) => ({
  "@context": "https://schema.org",
  "@type": "JobPosting",
  title: "Synthetic engineer",
  hiringOrganization: { "@type": "Organization", name: "Synthetic lab" },
  description: "Build reliable tools.",
  datePosted: "2026-09-01",
  validThrough: "2026-12-01",
  baseSalary: {
    "@type": "MonetaryAmount",
    currency: "USD",
    value: { "@type": "QuantitativeValue", minValue: 100000, maxValue: 120000, unitText: "YEAR" },
  },
  jobLocation: {
    "@type": "Place",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Austin",
      addressRegion: "TX",
      addressCountry: "US",
    },
  },
  qualifications: ["Build APIs", "Maintain tests"],
  ...patch,
});
const dto = (index, content = { jsonLd: [posting()] }, fields = []) => {
  const capture = globalThis.structuredClone(fixture);
  capture.id = `0198e208-0000-7000-8000-00000000001${String(index)}`;
  capture.capturedAt = `2026-10-0${String(index)}T12:00:00.000Z`;
  capture.expiresAt = "2026-12-31T12:00:00.000Z";
  capture.content = content;
  capture.fieldCandidates = fields.map((field, offset) => ({
    ...globalThis.structuredClone(fixture.fieldCandidates[0]),
    id: `0198e208-0000-7000-8000-${String(100 + offset).padStart(12, "0")}`,
    fieldName: field.name,
    value: field.value,
    provenance: {
      ...globalThis.structuredClone(fixture.fieldCandidates[0].provenance),
      capturedAt: capture.capturedAt,
      source: {
        sourceType: "capture",
        sourceId: capture.id,
        pointer: field.pointer ?? `/fields/${field.name}/${String(offset)}`,
      },
    },
  }));
  return {
    jobId,
    snapshotId: index === 1 ? baselineSnapshotId : currentSnapshotId,
    includeArchived: false,
    asOf: context.initiatedAt,
    capturedAt: capture.capturedAt,
    contentHash: capture.contentHash,
    availability: "retained",
    capture,
  };
};
const setup = (before = dto(1), after = dto(2), analyze = analyzeRetainedListing) => {
  const readCapture = vi.fn(async ({ snapshotId }) => ({
    ok: true,
    value: snapshotId === baselineSnapshotId ? before : after,
  }));
  return {
    readCapture,
    query: createJobSourceComparisonQuery({ readCapture, analyze }),
    before,
    after,
  };
};
const run = async (before, after, analyze) => {
  const result = await setup(before, after, analyze).query.execute(request, context);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
};

describe("structured retained listing comparison and current local analysis", () => {
  it.each(["requirements", "locations", "deadline"])(
    "retains incomplete sibling coverage for %s",
    async (name) => {
      const data = posting();
      if (name === "requirements") data.qualifications = ["Build APIs", {}];
      if (name === "locations") data.jobLocation = [data.jobLocation, { invalid: true }];
      if (name === "deadline") data.validThrough = [data.validThrough, "invalid"];
      const result = await run(dto(1), dto(2, { jsonLd: [data] }));
      expect(result.fields[name]).toMatchObject({
        kind: "not_comparable",
        after: { state: "ambiguous", reason: "extraction_uncertain" },
      });
    },
  );
  it("distinguishes explicitly empty requirement arrays from missing fields and reports complete removal", async () => {
    const result = await run(dto(1), dto(2, { jsonLd: [posting({ qualifications: [] })] }));
    expect(result.fields.requirements).toMatchObject({
      kind: "changed",
      after: { state: "known", items: [] },
      added: [],
      changed: [],
    });
    expect(result.fields.requirements.removed).toHaveLength(2);
    expect(result.fields.requirements.after.absenceEvidence[0]).toMatchObject({
      valueJson: "[]",
      sourcePointer: "/content/jsonLd/0/qualifications",
      confidence: null,
      candidateId: null,
    });
  });
  it("keeps two explicit empty arrays unchanged with their absence evidence", async () => {
    const result = await run(
      dto(1, { apiPayload: posting({ qualifications: [] }) }),
      dto(2, { apiPayload: posting({ qualifications: [] }) }),
    );
    expect(result.fields.requirements).toMatchObject({
      kind: "unchanged",
      before: { state: "known", items: [] },
      after: { state: "known", items: [] },
    });
  });
  it("does not prefer an empty structured array over conflicting retained plain-text requirements", async () => {
    const result = await run(
      dto(1),
      dto(2, {
        jsonLd: [posting({ qualifications: [] })],
        readableText: "Requirements:\n- Build APIs",
      }),
    );
    expect(result.fields.requirements).toMatchObject({
      kind: "not_comparable",
      after: { state: "ambiguous", reason: "conflicting_candidates" },
    });
  });
  it("rejects forged explicit absence pointers that do not name retained empty arrays", async () => {
    const analyze = (capture) => ({
      ...analyzeRetainedListing(capture),
      emptyRequirementPointers: ["/content/jsonLd/0/qualifications"],
    });
    expect(await setup(dto(1), dto(2), analyze).query.execute(request, context)).toMatchObject({
      ok: false,
      error: { code: "internal" },
    });
  });
  it("retains conflicting and incomplete original compensation without guessing", async () => {
    const conflict = dto(2, { jsonLd: [posting()] }, [
      {
        name: "salary",
        value: { currency: "USD", value: { minValue: 50000, maxValue: 60000, unitText: "YEAR" } },
      },
    ]);
    expect((await run(dto(1), conflict)).fields.compensation).toMatchObject({
      kind: "not_comparable",
      after: { state: "ambiguous", reason: "conflicting_candidates" },
    });
    const partial = dto(2, {}, [
      { name: "salary", value: { value: { minValue: 50000, maxValue: 60000, unitText: "YEAR" } } },
    ]);
    expect((await run(dto(1), partial)).fields.compensation).toMatchObject({
      kind: "not_comparable",
      after: { state: "ambiguous", reason: "incomplete_normalization" },
    });
  });
  it("reports changed/added/removed retained requirement slots, salary, deadline and locations with exact provenance", async () => {
    const before = dto(1);
    const after = dto(2, {
      jsonLd: [
        posting({
          qualifications: ["Build local APIs"],
          responsibilities: ["Review security"],
          validThrough: "2026-12-20",
          baseSalary: {
            "@type": "MonetaryAmount",
            currency: "USD",
            value: { minValue: 110000, maxValue: 140000, unitText: "YEAR" },
          },
          jobLocation: {
            "@type": "Place",
            address: { addressLocality: "Boston", addressRegion: "MA", addressCountry: "US" },
          },
        }),
      ],
    });
    const saved = JSON.stringify([before, after]);
    const result = await run(before, after);
    expect(result.fields.requirements).toMatchObject({
      kind: "changed",
      before: { state: "known" },
      after: { state: "known" },
    });
    expect(result.fields.requirements.added).toHaveLength(1);
    expect(result.fields.requirements.removed).toHaveLength(1);
    expect(result.fields.requirements.changed).toHaveLength(1);
    for (const name of ["compensation", "deadline", "locations"])
      expect(result.fields[name].kind).toBe("changed");
    expect(JSON.parse(result.fields.compensation.after.items[0].valueJson)).toMatchObject({
      minimumMinorUnits: 11000000,
      currencyScale: 2,
      interval: "year",
    });
    expect(result.fields.requirements.after.items[0]).toMatchObject({
      candidateId: null,
      origin: "current_jsonld_analysis",
      method: "jsonld",
      sourcePointer: "/content/jsonLd/0/qualifications/0",
    });
    expect(result.fields.requirements.after.items[0].sourceValueJson).toContain("Build local APIs");
    expect(JSON.stringify([before, after])).toBe(saved);
    expect(result).toMatchObject({
      specVersion: 1,
      refreshPerformed: false,
      trustedFieldMutationPerformed: false,
    });
    expect(result).not.toHaveProperty("changeCount");
    expect(Object.isFrozen(result.fields.requirements.after.items[0])).toBe(true);
  });
  it("is reproducible despite ephemeral extraction IDs and object-key ordering", async () => {
    const first = await run(dto(1), dto(2));
    const second = await run(dto(1), dto(2));
    expect(second).toEqual(first);
    for (const value of Object.values(first.fields)) expect(value.kind).toBe("unchanged");
  });
  it("does not infer unchanged or removed fields when both captures lack evidence", async () => {
    const result = await run(dto(1, {}), dto(2, {}));
    for (const value of Object.values(result.fields))
      expect(value).toMatchObject({
        kind: "not_comparable",
        before: { state: "missing" },
        after: { state: "missing" },
      });
  });
  it("does not infer removal when a field disappears from extraction", async () => {
    const current = posting();
    delete current.baseSalary;
    delete current.validThrough;
    const result = await run(dto(1), dto(2, { jsonLd: [current] }));
    expect(result.fields.compensation).toMatchObject({
      kind: "not_comparable",
      after: { state: "missing" },
      removed: [],
    });
    expect(result.fields.deadline.kind).toBe("not_comparable");
  });
  it("preserves date precision instead of truncating instants to dates", async () => {
    const result = await run(
      dto(1),
      dto(2, { jsonLd: [posting({ validThrough: "2026-12-01T10:00:00Z" })] }),
    );
    expect(result.fields.deadline.kind).toBe("changed");
    expect(JSON.parse(result.fields.deadline.after.items[0].valueJson)).toMatchObject({
      precision: "instant",
      instant: "2026-12-01T10:00:00.000Z",
    });
  });
  it.each([
    ["JPY", 0, 125],
    ["BHD", 3, 125000],
  ])("retains the exact %s currency scale", async (currency, scale, minor) => {
    const data = posting({
      baseSalary: { currency, value: { minValue: 125, maxValue: 150, unitText: "MONTH" } },
    });
    const result = await run(dto(1, { jsonLd: [data] }), dto(2, { jsonLd: [data] }));
    expect(JSON.parse(result.fields.compensation.after.items[0].valueJson)).toMatchObject({
      currency,
      currencyScale: scale,
      minimumMinorUnits: minor,
      interval: "month",
    });
    expect(result.fields.compensation.kind).toBe("unchanged");
  });
  it("keeps remote eligibility separate from physical country/location", async () => {
    const remote = posting({
      jobLocation: undefined,
      jobLocationType: "TELECOMMUTE",
      applicantLocationRequirements: { "@type": "Country", name: "United States" },
    });
    delete remote.jobLocation;
    const result = await run(dto(1), dto(2, { jsonLd: [remote] }));
    expect(result.fields.locations.kind).toBe("changed");
    expect(JSON.parse(result.fields.locations.after.items[0].valueJson).locationKind).toBe(
      "remote_region",
    );
  });
  it("preserves invalid sibling field warnings instead of comparing only surviving valid values", async () => {
    const data = posting({
      baseSalary: [posting().baseSalary, { currency: "USD", value: { minValue: "invalid" } }],
    });
    const result = await run(dto(1), dto(2, { jsonLd: [data] }));
    expect(result.fields.compensation).toMatchObject({
      kind: "not_comparable",
      after: { state: "ambiguous", reason: "extraction_uncertain" },
    });
  });
  it("keeps multiple postings explicitly uncertain even when all their values agree", async () => {
    const result = await run(dto(1), dto(2, { jsonLd: [posting(), posting()] }));
    for (const value of Object.values(result.fields)) expect(value.kind).toBe("not_comparable");
  });
  it("compares saved JSON-LD payloads while retaining their actual apiPayload pointers", async () => {
    const result = await run(
      dto(1, { apiPayload: posting() }),
      dto(2, { apiPayload: posting({ qualifications: ["Changed"] }) }),
    );
    expect(result.fields.requirements.kind).toBe("changed");
    expect(result.fields.requirements.after.items[0].sourcePointer).toBe(
      "/content/apiPayload/qualifications/0",
    );
  });
  it("parses manual retained text without consulting current accepted requirements", async () => {
    const result = await run(
      dto(1, { readableText: "Requirements:\n- Build APIs\n- Maintain tests" }),
      dto(2, { readableText: "Requirements:\n- Build local APIs" }),
    );
    expect(result.fields.requirements).toMatchObject({
      kind: "changed",
      changed: [JSON.stringify(["coredrill.requirement-parser", "1.0.0", "/raw_text/lines/2"])],
    });
    expect(result.fields.requirements.removed).toHaveLength(1);
    expect(result.fields.requirements.before.items[0]).toMatchObject({
      origin: "current_text_analysis",
      candidateId: null,
      sourcePointer: "/raw_text/lines/2",
    });
    expect(result.fields.compensation.kind).toBe("not_comparable");
  });
  it("refuses to infer requirement identity across different extraction bases", async () => {
    const result = await run(dto(1), dto(2, { readableText: "Requirements:\n- Build APIs" }));
    expect(result.fields.requirements).toMatchObject({
      kind: "not_comparable",
      reason: "different_requirement_basis",
    });
  });
  it("shows parser and analysis limits as unavailable rather than empty/unchanged", async () => {
    const parsed = await run(dto(1), dto(2, { readableText: "line\n".repeat(513) }));
    expect(parsed.fields.requirements.after).toMatchObject({
      state: "unavailable",
      reason: "parser_limit",
    });
    const limited = await run(dto(1), dto(2), () => {
      throw new RetainedListingAnalysisLimitError();
    });
    for (const value of Object.values(limited.fields))
      expect(value).toMatchObject({
        kind: "not_comparable",
        before: { state: "unavailable", reason: "analysis_limit" },
      });
  });
  it("keeps a missing retained capture distinct and never analyzes invented empty facts", async () => {
    const missing = { ...dto(1), capture: null, availability: "not_retained" };
    const analyze = vi.fn(analyzeRetainedListing);
    const result = await run(missing, dto(2), analyze);
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(result.fields.requirements.before).toMatchObject({
      state: "missing",
      reason: "missing_capture",
    });
  });
  it.each([
    null,
    {},
    { ...request, baselineSnapshotId: currentSnapshotId },
    { ...request, includeArchived: "yes" },
    { ...request, extra: true },
  ])("rejects invalid query input before reads", async (input) => {
    const { query, readCapture } = setup();
    expect(await query.execute(input, context)).toMatchObject({
      ok: false,
      error: { code: "validation" },
    });
    expect(readCapture).not.toHaveBeenCalled();
  });
  it.each(["same", "reversed"])(
    "rejects %s capture order without invented chronology",
    async (mode) => {
      const before = dto(1);
      const after = dto(2);
      if (mode === "same") {
        after.capturedAt = before.capturedAt;
        after.capture.capturedAt = before.capturedAt;
      } else {
        before.capturedAt = after.capturedAt;
        before.capture.capturedAt = after.capturedAt;
        after.capturedAt = "2026-10-01T12:00:00.000Z";
        after.capture.capturedAt = after.capturedAt;
      }
      expect(await setup(before, after).query.execute(request, context)).toMatchObject({
        ok: false,
        error: { code: "validation" },
      });
    },
  );
  it.each(["jobId", "snapshotId", "asOf", "includeArchived", "contentHash"])(
    "rejects invalid read echo %s",
    async (name) => {
      const before = { ...dto(1), [name]: "invalid/private" };
      const result = await setup(before).query.execute(request, context);
      expect(result).toMatchObject({ ok: false, error: { code: "internal" } });
      expect(JSON.stringify(result)).not.toContain("private");
    },
  );
  it("waits for both reads to settle even after an early synchronous failure", async () => {
    let release;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    const readCapture = vi.fn((input) => {
      if (input.snapshotId === baselineSnapshotId) throw new Error("private/path");
      return held;
    });
    const query = createJobSourceComparisonQuery({ readCapture, analyze: analyzeRetainedListing });
    let completed = false;
    const pending = query.execute(request, context).then((value) => {
      completed = true;
      return value;
    });
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    expect(completed).toBe(false);
    release({ ok: true, value: dto(2) });
    const result = await pending;
    expect(result).toMatchObject({ ok: false, error: { code: "unavailable" } });
    expect(JSON.stringify(result)).not.toContain("private");
  });
  it("rejects normalization that drops or mutates original captured candidates", async () => {
    const capture = dto(1, {}, [{ name: "salary", value: posting().baseSalary }]);
    for (const mode of ["drop", "mutate"]) {
      const analyze = (input) => {
        const data = analyzeRetainedListing(input);
        if (input.id !== capture.capture.id) return data;
        const clone = globalThis.structuredClone(data);
        if (mode === "drop") {
          clone.normalization.candidates = [];
          clone.normalization.summary = {
            inputCandidates: 0,
            normalized: 0,
            partial: 0,
            ambiguous: 0,
            notApplicable: 0,
          };
        } else clone.normalization.candidates[0].sourceCandidate.value = "forged";
        return clone;
      };
      expect(await setup(capture, dto(2), analyze).query.execute(request, context)).toMatchObject({
        ok: false,
        error: { code: "internal" },
      });
    }
  });
});
