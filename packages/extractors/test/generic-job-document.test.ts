import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import type { ExtractionMethod, FieldCandidateV1, JsonValue } from "@coredrill/contracts";
import { describe, expect, it } from "vitest";

import {
  extractGenericJobDocumentV1,
  extractSelectedTextV1,
  GENERIC_JOB_DOCUMENT_EXTRACTOR,
  GENERIC_JOB_DOCUMENT_FIELD_NAMES,
  GENERIC_JOB_DOCUMENT_LIMITS,
  GenericJobDocumentError,
  SELECTED_TEXT_EXTRACTOR,
  type GenericJobCandidateIdContextV1,
  type GenericJobDocumentErrorCode,
  type GenericJobDocumentFieldName,
  type GenericJobDocumentInputV1,
  type GenericJobDocumentSummaryV1,
  type GenericJobDocumentWarningV1,
  type SelectedTextInputV1,
} from "../src/index.js";

interface GoldenCandidate {
  readonly fieldName: GenericJobDocumentFieldName;
  readonly value: JsonValue;
  readonly rawValue: JsonValue;
  readonly pointer: string;
  readonly method: Extract<ExtractionMethod, "readability" | "selector">;
  readonly confidence: number;
}

interface SelectedTextGoldenCase {
  readonly id: string;
  readonly selectedText: string;
  readonly expectedCandidates: readonly GoldenCandidate[];
}

interface DocumentGoldenCase {
  readonly id: string;
  readonly fixture: string;
  readonly expectedReadableText: string | null;
  readonly forbiddenOutput: readonly string[];
  readonly expectedCandidates: readonly GoldenCandidate[];
  readonly expectedWarnings: readonly GenericJobDocumentWarningV1[];
  readonly expectedSummary: GenericJobDocumentSummaryV1;
}

interface GoldenFixture {
  readonly specVersion: 1;
  readonly sourceId: string;
  readonly capturedAt: string;
  readonly selectedTextCases: readonly SelectedTextGoldenCase[];
  readonly documentCases: readonly DocumentGoldenCase[];
}

interface AccuracyCounts {
  readonly expected: number;
  readonly produced: number;
  readonly exactMatches: number;
  readonly precision: number;
  readonly recall: number;
}

interface LinkedomModule {
  readonly parseHTML: (html: string) => { readonly document: unknown };
}

const linkedomModule: unknown = createRequire(import.meta.url)("linkedom");

function isLinkedomModule(value: unknown): value is LinkedomModule {
  return (
    typeof value === "object" &&
    value !== null &&
    "parseHTML" in value &&
    typeof value.parseHTML === "function"
  );
}

if (!isLinkedomModule(linkedomModule)) {
  throw new TypeError("The LinkeDOM test adapter is unavailable.");
}

const { parseHTML } = linkedomModule;

const goldenFixture = JSON.parse(
  readFileSync(new URL("./fixtures/generic-job-document.golden.json", import.meta.url), "utf8"),
) as unknown as GoldenFixture;
const retainedAccuracyReport = JSON.parse(
  readFileSync(
    new URL("./fixtures/generic-job-document.accuracy-report.json", import.meta.url),
    "utf8",
  ),
) as unknown;

function candidateId({ index }: GenericJobCandidateIdContextV1): string {
  return `018f0f4e-7b8c-7d00-8000-${String(index + 500).padStart(12, "0")}`;
}

function selectedInput(
  selectedText: string,
  createCandidateId: SelectedTextInputV1["createCandidateId"] = candidateId,
): SelectedTextInputV1 {
  return {
    specVersion: 1,
    sourceId: goldenFixture.sourceId,
    capturedAt: goldenFixture.capturedAt,
    selectedText,
    createCandidateId,
  };
}

function documentInput(
  document: Document,
  createCandidateId: GenericJobDocumentInputV1["createCandidateId"] = candidateId,
): GenericJobDocumentInputV1 {
  return {
    specVersion: 1,
    sourceId: goldenFixture.sourceId,
    capturedAt: goldenFixture.capturedAt,
    document,
    createCandidateId,
  };
}

function fixtureDocument(fixture: string): Document {
  const { document } = parseHTML(
    readFileSync(new URL(`./fixtures/${fixture}`, import.meta.url), "utf8"),
  );
  return document as unknown as Document;
}

function htmlDocument(html: string): Document {
  return parseHTML(html).document as unknown as Document;
}

function projectCandidate(candidate: FieldCandidateV1): GoldenCandidate {
  return {
    fieldName: candidate.fieldName as GenericJobDocumentFieldName,
    value: candidate.value,
    rawValue: candidate.rawValue!,
    pointer: candidate.provenance.source.pointer,
    method: candidate.provenance.method as GoldenCandidate["method"],
    confidence: candidate.provenance.confidence,
  };
}

function candidateKey(candidate: GoldenCandidate): string {
  return JSON.stringify([
    candidate.fieldName,
    candidate.value,
    candidate.rawValue,
    candidate.pointer,
    candidate.method,
    candidate.confidence,
  ]);
}

function accuracyCounts(
  expected: readonly GoldenCandidate[],
  produced: readonly GoldenCandidate[],
): AccuracyCounts {
  const remaining = produced.map(candidateKey);
  let exactMatches = 0;
  for (const expectedCandidate of expected) {
    const matchIndex = remaining.indexOf(candidateKey(expectedCandidate));
    if (matchIndex < 0) continue;
    remaining.splice(matchIndex, 1);
    exactMatches += 1;
  }
  return {
    expected: expected.length,
    produced: produced.length,
    exactMatches,
    precision: produced.length === 0 ? 1 : exactMatches / produced.length,
    recall: expected.length === 0 ? 1 : exactMatches / expected.length,
  };
}

function expectedExcerpt(rawValue: JsonValue): string | undefined {
  const serialized = typeof rawValue === "string" ? rawValue : JSON.stringify(rawValue);
  return serialized.length === 0
    ? undefined
    : serialized.slice(0, GENERIC_JOB_DOCUMENT_LIMITS.maxSourceExcerptLength);
}

function expectExtractorError(callback: () => unknown, code: GenericJobDocumentErrorCode): void {
  let thrown: unknown;
  try {
    callback();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(GenericJobDocumentError);
  if (!(thrown instanceof GenericJobDocumentError)) return;
  expect(thrown.code).toBe(code);
  expect(thrown.message).toBe("Generic job-document extraction rejected invalid input.");
}

function allGoldenCandidates(): {
  readonly expected: readonly GoldenCandidate[];
  readonly produced: readonly GoldenCandidate[];
} {
  const expected: GoldenCandidate[] = [];
  const produced: GoldenCandidate[] = [];
  for (const fixture of goldenFixture.selectedTextCases) {
    expected.push(...fixture.expectedCandidates);
    produced.push(
      ...extractSelectedTextV1(selectedInput(fixture.selectedText)).candidates.map(
        projectCandidate,
      ),
    );
  }
  for (const fixture of goldenFixture.documentCases) {
    expected.push(...fixture.expectedCandidates);
    produced.push(
      ...extractGenericJobDocumentV1(
        documentInput(fixtureDocument(fixture.fixture)),
      ).candidates.map(projectCandidate),
    );
  }
  return { expected, produced };
}

describe("selected-text and generic job-document golden extraction", () => {
  it("reproduces every selected-text and detached-DOM golden candidate exactly", () => {
    for (const fixture of goldenFixture.selectedTextCases) {
      const extraction = extractSelectedTextV1(selectedInput(fixture.selectedText));
      expect(extraction.candidates.map(projectCandidate), fixture.id).toEqual(
        fixture.expectedCandidates,
      );
      expect(extraction.summary).toEqual({
        inputCharacters: fixture.selectedText.length,
        normalizedCharacters: String(fixture.expectedCandidates[0]!.value).length,
        candidateCount: fixture.expectedCandidates.length,
      });
      expect(extraction.extractor).toEqual(SELECTED_TEXT_EXTRACTOR);
    }

    for (const fixture of goldenFixture.documentCases) {
      const document = fixtureDocument(fixture.fixture);
      const original = document.documentElement.outerHTML;
      const extraction = extractGenericJobDocumentV1(documentInput(document));
      expect(extraction.candidates.map(projectCandidate), fixture.id).toEqual(
        fixture.expectedCandidates,
      );
      expect(extraction.warnings, fixture.id).toEqual(fixture.expectedWarnings);
      expect(extraction.summary, fixture.id).toEqual(fixture.expectedSummary);
      expect(extraction.readableContent?.textContent ?? null, fixture.id).toBe(
        fixture.expectedReadableText,
      );
      const output = JSON.stringify(extraction);
      for (const forbidden of fixture.forbiddenOutput) expect(output).not.toContain(forbidden);
      expect(document.documentElement.outerHTML).toBe(original);
      expect(extraction.extractor).toEqual(GENERIC_JOB_DOCUMENT_EXTRACTOR);
    }
  });

  it("retains raw evidence, provenance, and immutable independently reviewable candidates", () => {
    const selected = extractSelectedTextV1(
      selectedInput(goldenFixture.selectedTextCases[0]!.selectedText),
    );
    const generic = extractGenericJobDocumentV1(
      documentInput(fixtureDocument(goldenFixture.documentCases[0]!.fixture)),
    );
    for (const extraction of [selected, generic]) {
      expect(Object.isFrozen(extraction)).toBe(true);
      expect(Object.isFrozen(extraction.candidates)).toBe(true);
      for (const candidate of extraction.candidates) {
        expect(Object.isFrozen(candidate)).toBe(true);
        expect(candidate.provenance.source).toEqual({
          sourceType: "capture",
          sourceId: goldenFixture.sourceId,
          pointer: candidate.provenance.source.pointer,
        });
        expect(candidate.provenance.capturedAt).toBe(goldenFixture.capturedAt);
        expect(candidate.provenance.sourceExcerpt).toBe(expectedExcerpt(candidate.rawValue!));
        expect(candidate.userConfirmation).toBeUndefined();
      }
    }
    expect(generic.candidates.filter(({ fieldName }) => fieldName === "title")).toHaveLength(3);
    expect(generic.candidates.filter(({ fieldName }) => fieldName === "requirements")).toHaveLength(
      4,
    );
  });

  it("reproduces the checked-in fixture accuracy and safety report", () => {
    const { expected, produced } = allGoldenCandidates();
    const total = accuracyCounts(expected, produced);
    const perField = Object.fromEntries(
      GENERIC_JOB_DOCUMENT_FIELD_NAMES.map((fieldName) => [
        fieldName,
        accuracyCounts(
          expected.filter((candidate) => candidate.fieldName === fieldName),
          produced.filter((candidate) => candidate.fieldName === fieldName),
        ),
      ]),
    );
    const perMethod = Object.fromEntries(
      (["selector", "readability"] as const).map((method) => [
        method,
        accuracyCounts(
          expected.filter((candidate) => candidate.method === method),
          produced.filter((candidate) => candidate.method === method),
        ),
      ]),
    );
    const report = {
      specVersion: 1,
      extractors: [SELECTED_TEXT_EXTRACTOR, GENERIC_JOB_DOCUMENT_EXTRACTOR],
      fixtureSuite: "generic-job-document.golden.json",
      fixtureCases: goldenFixture.selectedTextCases.length + goldenFixture.documentCases.length,
      ...total,
      falsePositives: produced.length - total.exactMatches,
      falseNegatives: expected.length - total.exactMatches,
      perField,
      perMethod,
      scenarios: {
        explicitSelectedText: true,
        readabilityPlainText: true,
        visibleAndMetadataTitlesRetained: true,
        labeledFieldsRetained: true,
        repeatedConflictingCandidatesRetained: true,
        requirementSectionsRetained: true,
        boilerplateAndHiddenContentRejected: true,
        rawSourceEvidenceRetained: true,
        provenanceRetained: true,
        inputDocumentUnchanged: true,
      },
    };
    expect(report).toEqual(retainedAccuracyReport);
    console.info("XTR003_PROOF", JSON.stringify(report));
  });
});

describe("selected-text and generic job-document boundary hardening", () => {
  it("rejects malformed selected-text inputs and content-bearing ID failures atomically", () => {
    expectExtractorError(
      () => extractSelectedTextV1({ ...selectedInput("evidence"), extra: true } as never),
      "input_invalid",
    );
    expectExtractorError(() => extractSelectedTextV1(selectedInput("   \n\t")), "input_invalid");
    expectExtractorError(
      () =>
        extractSelectedTextV1(
          selectedInput("x".repeat(GENERIC_JOB_DOCUMENT_LIMITS.maxSelectedTextLength + 1)),
        ),
      "input_invalid",
    );
    expectExtractorError(
      () => extractSelectedTextV1(selectedInput("evidence", () => "invalid-id")),
      "candidate_id_invalid",
    );
    expectExtractorError(
      () =>
        extractSelectedTextV1(
          selectedInput("evidence", () => {
            throw new Error("SECRET_SELECTED_VALUE");
          }),
        ),
      "candidate_id_invalid",
    );
  });

  it("rejects malformed document inputs and Readability capability failures", () => {
    const document = htmlDocument("<main><h1>Role</h1></main>");
    expectExtractorError(
      () => extractGenericJobDocumentV1({ ...documentInput(document), extra: true } as never),
      "input_invalid",
    );
    expectExtractorError(
      () => extractGenericJobDocumentV1({ ...documentInput(document), document: {} } as never),
      "input_invalid",
    );
    expectExtractorError(
      () =>
        extractGenericJobDocumentV1({
          ...documentInput(document),
          sourceId: "not-a-source-id",
        }),
      "input_invalid",
    );

    const failingReadabilityDocument = {
      nodeType: 9,
      documentElement: { textContent: "" },
      querySelector: () => null,
      querySelectorAll: () => [],
      cloneNode(): unknown {
        return this;
      },
    } as unknown as Document;
    expectExtractorError(
      () => extractGenericJobDocumentV1(documentInput(failingReadabilityDocument)),
      "readability_failed",
    );
  });

  it("enforces document depth, element, text, and candidate bounds before emitting IDs", () => {
    let idCalls = 0;
    const countingId = (context: GenericJobCandidateIdContextV1): string => {
      idCalls += 1;
      return candidateId(context);
    };
    const tooDeep = htmlDocument(
      `<main>${"<div>".repeat(GENERIC_JOB_DOCUMENT_LIMITS.maxDocumentDepth + 1)}text${"</div>".repeat(GENERIC_JOB_DOCUMENT_LIMITS.maxDocumentDepth + 1)}</main>`,
    );
    expectExtractorError(
      () => extractGenericJobDocumentV1(documentInput(tooDeep, countingId)),
      "document_limit_exceeded",
    );
    const tooManyElements = htmlDocument(
      `<main>${"<i></i>".repeat(GENERIC_JOB_DOCUMENT_LIMITS.maxDocumentElements + 1)}</main>`,
    );
    expectExtractorError(
      () => extractGenericJobDocumentV1(documentInput(tooManyElements, countingId)),
      "document_limit_exceeded",
    );
    const tooMuchText = htmlDocument(
      `<main><p>${"x".repeat(GENERIC_JOB_DOCUMENT_LIMITS.maxDocumentTextLength + 1)}</p></main>`,
    );
    expectExtractorError(
      () => extractGenericJobDocumentV1(documentInput(tooMuchText, countingId)),
      "content_limit_exceeded",
    );
    const tooManyTitles = htmlDocument(
      `<main>${"<h1>Role</h1>".repeat(GENERIC_JOB_DOCUMENT_LIMITS.maxCandidates + 1)}</main>`,
    );
    expectExtractorError(
      () => extractGenericJobDocumentV1(documentInput(tooManyTitles, countingId)),
      "candidate_limit_exceeded",
    );
    const tooManyRequirements = htmlDocument(
      `<main><h2>Requirements</h2><ul>${"<li>Evidence</li>".repeat(GENERIC_JOB_DOCUMENT_LIMITS.maxRequirementCandidates + 1)}</ul></main>`,
    );
    expectExtractorError(
      () => extractGenericJobDocumentV1(documentInput(tooManyRequirements, countingId)),
      "candidate_limit_exceeded",
    );
    expect(idCalls).toBe(0);
  });

  it("rejects reused or failed candidate IDs without returning a partial extraction", () => {
    const document = fixtureDocument("generic-job-document/conflicting-labels.html");
    expectExtractorError(
      () =>
        extractGenericJobDocumentV1(
          documentInput(document, () => "018f0f4e-7b8c-7d00-8000-000000000999"),
        ),
      "candidate_id_invalid",
    );
    expectExtractorError(
      () =>
        extractGenericJobDocumentV1(
          documentInput(document, () => {
            throw new Error("SECRET_DOM_VALUE");
          }),
        ),
      "candidate_id_invalid",
    );
  });

  it("warns on invalid labels and never promotes an unsafe apply URL", () => {
    const document = htmlDocument(`<!doctype html><html><head><title></title></head><body>
      <main>
        <h1>${"x".repeat(GENERIC_JOB_DOCUMENT_LIMITS.maxShortTextLength + 1)}</h1>
        <dl>
          <dt>Company</dt><dd></dd>
          <dt>Apply URL</dt><dd><a href="javascript:alert(1)">Apply</a></dd>
        </dl>
      </main>
    </body></html>`);
    const extraction = extractGenericJobDocumentV1(documentInput(document));
    expect(extraction.candidates.some(({ fieldName }) => fieldName === "apply_url")).toBe(false);
    expect(extraction.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "field_invalid", fieldName: "title" }),
        expect.objectContaining({ code: "labeled_value_missing", fieldName: "company" }),
        expect.objectContaining({ code: "labeled_value_missing", fieldName: "apply_url" }),
      ]),
    );
  });

  it("supports table labels and definition-list requirement values", () => {
    const document = htmlDocument(`<!doctype html><html><body><main>
      <table><tr><th>Company</th><td>Table Works</td></tr></table>
      <dl><dt>Qualifications</dt><dd><ul><li>Careful review</li><li>Clear writing</li></ul></dd></dl>
    </main></body></html>`);
    const extraction = extractGenericJobDocumentV1(documentInput(document));
    expect(extraction.candidates.map(({ fieldName, value }) => ({ fieldName, value }))).toEqual(
      expect.arrayContaining([
        { fieldName: "company", value: "Table Works" },
        {
          fieldName: "requirements",
          value: { category: "qualification", content: "Careful review" },
        },
        {
          fieldName: "requirements",
          value: { category: "qualification", content: "Clear writing" },
        },
      ]),
    );
  });

  it("stops requirement sections at the next heading regardless of heading depth", () => {
    const document = htmlDocument(`<!doctype html><html><body><main>
      <h2>Requirements</h2>
      <p>Ship bounded, reviewable changes.</p>
      <h3>About the company</h3>
      <p>This company profile is not a requirement.</p>
    </main></body></html>`);
    const extraction = extractGenericJobDocumentV1(documentInput(document));
    const requirements = extraction.candidates.filter(
      ({ fieldName }) => fieldName === "requirements",
    );

    expect(requirements).toHaveLength(1);
    expect(requirements[0]?.value).toEqual({
      category: "requirement",
      content: "Ship bounded, reviewable changes.",
    });
    expect(JSON.stringify(requirements)).not.toContain("company profile");
  });
});
