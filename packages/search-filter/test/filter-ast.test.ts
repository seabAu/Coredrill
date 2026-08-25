import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  JOB_FILTER_LIMITS,
  JOB_FILTER_SPEC_VERSION,
  JobFilterValidationError,
  compileJobFilter,
  parseJobFilter,
  parseJobFilterJson,
  serializeJobFilter,
  type JobFilterDocumentV1,
  type JobFilterPredicate,
} from "../src/index.js";

const boundedText = fc
  .string({ minLength: 1, maxLength: 80 })
  .filter((value) => !value.includes("\u0000"));

const date = fc
  .tuple(
    fc.integer({ min: 2000, max: 2099 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }),
  )
  .map(([year, month, day]) =>
    [year, String(month).padStart(2, "0"), String(day).padStart(2, "0")].join("-"),
  );

const predicate: fc.Arbitrary<JobFilterPredicate> = fc.oneof(
  boundedText.map<JobFilterPredicate>((value) => ({
    type: "predicate",
    field: "title",
    operator: "contains",
    value,
  })),
  fc.constantFrom("hybrid", "on_site", "remote", "unknown").map<JobFilterPredicate>((value) => ({
    type: "predicate",
    field: "workplace_type",
    operator: "equals",
    value,
  })),
  fc
    .subarray(
      [
        "viewed",
        "saved",
        "preparing",
        "applied",
        "response",
        "interview",
        "offer",
        "rejected",
        "withdrawn",
        "archived",
      ],
      { minLength: 1, maxLength: 10 },
    )
    .map<JobFilterPredicate>((value) => ({
      type: "predicate",
      field: "status_category",
      operator: "one_of",
      value,
    })),
  fc.tuple(date, date).map<JobFilterPredicate>(([first, second]) => ({
    type: "predicate",
    field: "date_posted",
    operator: "between",
    value: first <= second ? [first, second] : [second, first],
  })),
  fc.constant<JobFilterPredicate>({
    type: "predicate",
    field: "tag_id",
    operator: "equals",
    value: "0198e104-0000-7000-8000-000000000002",
  }),
  fc.constant<JobFilterPredicate>({
    type: "predicate",
    field: "next_action_at",
    operator: "is_not_set",
    value: null,
  }),
);

const filterDocument = fc
  .array(predicate, { minLength: 1, maxLength: 12 })
  .map((children): JobFilterDocumentV1 => ({
    specVersion: JOB_FILTER_SPEC_VERSION,
    root: { type: "group", op: "and", negated: false, children },
  }));

describe("job filter AST", () => {
  it("round-trips generated valid documents without changing their meaning", () => {
    fc.assert(
      fc.property(filterDocument, (document) => {
        const parsed = parseJobFilter(document);
        expect(parseJobFilterJson(serializeJobFilter(parsed))).toEqual(parsed);
        expect(compileJobFilter(parsed).whereSql).not.toHaveLength(0);
      }),
      { numRuns: 500 },
    );
  });

  it("returns only typed validation errors for arbitrary JSON input", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (input) => {
        try {
          parseJobFilter(input);
        } catch (error) {
          expect(error).toBeInstanceOf(JobFilterValidationError);
        }
      }),
      { numRuns: 1_000 },
    );
  });

  it("enforces depth, predicate-count, and serialized-size limits", () => {
    let root: unknown = {
      type: "predicate",
      field: "title",
      operator: "equals",
      value: "engineer",
    };
    for (let depth = 1; depth <= JOB_FILTER_LIMITS.maximumDepth; depth += 1) {
      root = { type: "group", op: "and", negated: false, children: [root] };
    }
    expect(() => parseJobFilter({ specVersion: 1, root })).toThrowError(
      expect.objectContaining({ code: "limit_exceeded" }),
    );

    const predicates = Array.from(
      { length: JOB_FILTER_LIMITS.maximumPredicates + 1 },
      (_, index) => ({
        type: "predicate",
        field: "title",
        operator: "equals",
        value: `role-${String(index)}`,
      }),
    );
    expect(() =>
      parseJobFilter({
        specVersion: 1,
        root: {
          type: "group",
          op: "and",
          negated: false,
          children: [
            { type: "group", op: "and", negated: false, children: predicates.slice(0, 32) },
            { type: "group", op: "and", negated: false, children: predicates.slice(32) },
          ],
        },
      }),
    ).toThrowError(expect.objectContaining({ code: "limit_exceeded" }));

    expect(() =>
      parseJobFilterJson(" ".repeat(JOB_FILTER_LIMITS.maximumSerializedCharacters + 1)),
    ).toThrowError(expect.objectContaining({ code: "limit_exceeded" }));
  });
});

describe("safe SQL compiler", () => {
  it("compiles nested boolean, scalar, and relation filters deterministically", () => {
    const compiled = compileJobFilter({
      specVersion: 1,
      root: {
        type: "group",
        op: "and",
        negated: false,
        children: [
          { type: "predicate", field: "title", operator: "contains", value: "platform" },
          {
            type: "group",
            op: "or",
            negated: true,
            children: [
              { type: "predicate", field: "workplace_type", operator: "equals", value: "remote" },
              {
                type: "predicate",
                field: "tag_id",
                operator: "equals",
                value: "0198e104-0000-7000-8000-000000000002",
              },
            ],
          },
        ],
      },
    });

    expect(compiled.whereSql).toBe(
      "((job.title LIKE ? ESCAPE '\\') AND (NOT ((job.workplace_type = ?) OR (EXISTS (SELECT 1 FROM job_tag AS filter_job_tag WHERE filter_job_tag.job_id = job.id AND filter_job_tag.tag_id IN (?))))))",
    );
    expect(compiled.parameters).toEqual([
      "%platform%",
      "remote",
      "0198e104-0000-7000-8000-000000000002",
    ]);
  });

  it("keeps every adversarial text value out of SQL and binds an escaped LIKE pattern", () => {
    fc.assert(
      fc.property(boundedText, (suffix) => {
        const value = `x' OR 1=1 -- %_\\${suffix}`;
        const compiled = compileJobFilter({
          specVersion: 1,
          root: { type: "predicate", field: "company_name", operator: "contains", value },
        });
        expect(compiled.whereSql).not.toContain(value);
        expect(compiled.whereSql).toContain("LIKE ? ESCAPE");
        expect(compiled.parameters).toEqual([
          `%x' OR 1=1 -- \\%\\_\\\\${suffix.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`,
        ]);
      }),
      { numRuns: 500 },
    );
  });

  it("rejects unknown fields and incompatible operators instead of emitting SQL", () => {
    expect(() =>
      compileJobFilter({
        specVersion: 1,
        root: { type: "predicate", field: "salary", operator: "equals", value: "100000" },
      } as unknown as JobFilterDocumentV1),
    ).toThrowError(expect.objectContaining({ code: "unknown_field" }));
    expect(() =>
      compileJobFilter({
        specVersion: 1,
        root: { type: "predicate", field: "tag_id", operator: "contains", value: "tag" },
      } as unknown as JobFilterDocumentV1),
    ).toThrowError(expect.objectContaining({ code: "incompatible_operator" }));
  });
});
