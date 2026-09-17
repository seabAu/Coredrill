import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  GENERIC_JOB_DOCUMENT_EXTRACTOR,
  GENERIC_JOB_DOCUMENT_FIELD_NAMES,
  GREENHOUSE_PUBLIC_POSTING_EXTRACTOR,
  GREENHOUSE_PUBLIC_POSTING_FIELD_NAMES,
  JOB_POSTING_JSON_LD_EXTRACTOR,
  JOB_POSTING_JSON_LD_FIELD_NAMES,
  LEVER_PUBLIC_POSTING_EXTRACTOR,
  LEVER_PUBLIC_POSTING_FIELD_NAMES,
  SELECTED_TEXT_EXTRACTOR,
  USAJOBS_SEARCH_ITEM_EXTRACTOR,
  USAJOBS_SEARCH_ITEM_FIELD_NAMES,
  extractGenericJobDocumentV1,
  extractGreenhousePublicPostingV1,
  extractJobPostingJsonLdV1,
  extractLeverPublicPostingV1,
  extractSelectedTextV1,
  extractUsaJobsSearchItemV1,
} from "../../packages/extractors/dist/index.js";
import { buildExtractionQualityReport } from "../extraction-quality/report.mjs";

const repositoryRoot = process.cwd();
const fixtureRoot = path.join(repositoryRoot, "packages", "extractors", "test", "fixtures");
const manifestPath = path.join(
  repositoryRoot,
  "docs",
  "evals",
  "extraction-quality-evaluation.v1.json",
);
const reportPath = path.join(repositoryRoot, "docs", "evals", "extraction-quality-report.v1.json");
const requireFromExtractors = createRequire(
  path.join(repositoryRoot, "packages", "extractors", "package.json"),
);
const { parseHTML } = requireFromExtractors("linkedom");

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

async function fixture(name) {
  return JSON.parse(await readFile(path.join(fixtureRoot, name), "utf8"));
}

function candidateId({ index }) {
  return `018f0f4e-7b8c-7d00-8000-${String(index + 700).padStart(12, "0")}`;
}

function projectCandidate(candidate, projectionKeys) {
  return Object.fromEntries(
    projectionKeys.map((key) => {
      if (key === "pointer") return [key, candidate.provenance.source.pointer];
      if (key === "method") return [key, candidate.provenance.method];
      if (key === "confidence") return [key, candidate.provenance.confidence];
      return [key, candidate[key]];
    }),
  );
}

function evaluateAdapter({ extractor, supportedFields, cases, projectionKeys, run }) {
  const fieldSet = new Set(supportedFields);
  const fields = Object.fromEntries(
    supportedFields.map((fieldName) => [fieldName, { expectedCount: 0, observations: [] }]),
  );

  for (const fixtureCase of cases) {
    const expectedCounts = new Map();
    for (const expected of fixtureCase.expectedCandidates) {
      if (!fieldSet.has(expected.fieldName)) {
        throw new Error(
          `${extractor.name} fixture contains unsupported field ${expected.fieldName}.`,
        );
      }
      fields[expected.fieldName].expectedCount += 1;
      const key = JSON.stringify(expected);
      expectedCounts.set(key, (expectedCounts.get(key) ?? 0) + 1);
    }

    for (const candidate of run(fixtureCase)) {
      if (!fieldSet.has(candidate.fieldName)) {
        throw new Error(`${extractor.name} produced unsupported field ${candidate.fieldName}.`);
      }
      const key = JSON.stringify(projectCandidate(candidate, projectionKeys));
      const remaining = expectedCounts.get(key) ?? 0;
      const exactMatch = remaining > 0;
      if (exactMatch) expectedCounts.set(key, remaining - 1);
      fields[candidate.fieldName].observations.push({
        confidence: candidate.provenance.confidence,
        exactMatch,
      });
    }
  }

  return { extractor, supportedFields, fixtureCaseCount: cases.length, fields };
}

const genericFixture = await fixture("generic-job-document.golden.json");
const jsonLdFixture = await fixture("job-posting-jsonld.golden.json");
const greenhouseFixture = await fixture("greenhouse-public-posting.golden.json");
const leverFixture = await fixture("lever-public-posting.golden.json");
const usaJobsFixture = await fixture("usajobs-search-item.golden.json");

const commonProjection = ["fieldName", "value", "rawValue", "pointer", "confidence"];
const evaluatedAdapters = [
  evaluateAdapter({
    extractor: SELECTED_TEXT_EXTRACTOR,
    supportedFields: ["description"],
    cases: genericFixture.selectedTextCases,
    projectionKeys: ["fieldName", "value", "rawValue", "pointer", "method", "confidence"],
    run: (fixtureCase) =>
      extractSelectedTextV1({
        specVersion: 1,
        sourceId: genericFixture.sourceId,
        capturedAt: genericFixture.capturedAt,
        selectedText: fixtureCase.selectedText,
        createCandidateId: candidateId,
      }).candidates,
  }),
  evaluateAdapter({
    extractor: GENERIC_JOB_DOCUMENT_EXTRACTOR,
    supportedFields: [...GENERIC_JOB_DOCUMENT_FIELD_NAMES],
    cases: genericFixture.documentCases,
    projectionKeys: ["fieldName", "value", "rawValue", "pointer", "method", "confidence"],
    run: (fixtureCase) => {
      const html = readFileSync(path.join(fixtureRoot, fixtureCase.fixture), "utf8");
      return extractGenericJobDocumentV1({
        specVersion: 1,
        sourceId: genericFixture.sourceId,
        capturedAt: genericFixture.capturedAt,
        document: parseHTML(html).document,
        createCandidateId: candidateId,
      }).candidates;
    },
  }),
  evaluateAdapter({
    extractor: JOB_POSTING_JSON_LD_EXTRACTOR,
    supportedFields: [...JOB_POSTING_JSON_LD_FIELD_NAMES],
    cases: jsonLdFixture.cases,
    projectionKeys: ["fieldName", "value", "pointer", "confidence"],
    run: (fixtureCase) =>
      extractJobPostingJsonLdV1({
        specVersion: 1,
        sourceId: jsonLdFixture.sourceId,
        capturedAt: jsonLdFixture.capturedAt,
        jsonLd: fixtureCase.jsonLd,
        createCandidateId: candidateId,
      }).candidates,
  }),
  evaluateAdapter({
    extractor: GREENHOUSE_PUBLIC_POSTING_EXTRACTOR,
    supportedFields: [...GREENHOUSE_PUBLIC_POSTING_FIELD_NAMES],
    cases: greenhouseFixture.cases,
    projectionKeys: commonProjection,
    run: (fixtureCase) =>
      extractGreenhousePublicPostingV1({
        specVersion: 1,
        sourceId: greenhouseFixture.sourceId,
        capturedAt: greenhouseFixture.capturedAt,
        boardToken: fixtureCase.boardToken,
        jobId: fixtureCase.jobId,
        payload: fixtureCase.payload,
        createCandidateId: candidateId,
      }).candidates,
  }),
  evaluateAdapter({
    extractor: LEVER_PUBLIC_POSTING_EXTRACTOR,
    supportedFields: [...LEVER_PUBLIC_POSTING_FIELD_NAMES],
    cases: leverFixture.cases,
    projectionKeys: commonProjection,
    run: (fixtureCase) =>
      extractLeverPublicPostingV1({
        specVersion: 1,
        sourceId: leverFixture.sourceId,
        capturedAt: leverFixture.capturedAt,
        region: fixtureCase.region,
        site: fixtureCase.site,
        postingId: fixtureCase.postingId,
        payload: fixtureCase.payload,
        createCandidateId: candidateId,
      }).candidates,
  }),
  evaluateAdapter({
    extractor: USAJOBS_SEARCH_ITEM_EXTRACTOR,
    supportedFields: [...USAJOBS_SEARCH_ITEM_FIELD_NAMES],
    cases: usaJobsFixture.cases,
    projectionKeys: commonProjection,
    run: (fixtureCase) =>
      extractUsaJobsSearchItemV1({
        specVersion: 1,
        sourceId: usaJobsFixture.sourceId,
        capturedAt: usaJobsFixture.capturedAt,
        matchedObjectId: fixtureCase.matchedObjectId,
        payload: fixtureCase.payload,
        createCandidateId: candidateId,
      }).candidates,
  }),
];

const expected = `${JSON.stringify(buildExtractionQualityReport(manifest, evaluatedAdapters), null, 2)}\n`;

if (process.argv.includes("--check")) {
  const actual = await readFile(reportPath, "utf8").catch(() => "");
  if (actual !== expected) {
    console.error(
      "Extraction quality report is missing or stale. Run pnpm generate:extraction-quality-report.",
    );
    process.exitCode = 1;
  } else {
    console.log("Extraction quality report is current.");
  }
} else {
  await writeFile(reportPath, expected, "utf8");
  console.log(`Wrote ${path.relative(repositoryRoot, reportPath)}.`);
}
