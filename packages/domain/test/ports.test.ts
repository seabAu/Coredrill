import { describe, expect, expectTypeOf, it } from "vitest";

import {
  AI_MODES,
  AI_PURPOSES,
  DEFERRED_SYNC_AVAILABILITY,
  DOCUMENT_EXPORT_FORMATS,
  DOCUMENT_IMPORT_FORMATS,
  EXTRACTION_INPUT_KINDS,
  LABOR_STATISTIC_KINDS,
  confidence,
  entityId,
  instant,
  moneyRate,
  sourceReference,
  webUrl,
  type AiPort,
  type DocumentPort,
  type ExtractionPort,
  type LaborDataPort,
  type PortRequestContext,
  type SyncPort,
} from "../src/index.js";

const operationContext: PortRequestContext = {
  operationId: entityId("port-operation", "019539af-8b01-7dd4-8b54-395d8f3fe501"),
  initiatedAt: instant("2026-08-24T16:00:00.000Z"),
};

describe("domain port API", () => {
  it("publishes the reviewed capability vocabularies", () => {
    expect(EXTRACTION_INPUT_KINDS).toEqual(["capture", "career-document"]);
    expect(AI_MODES).toEqual(["disabled", "local", "byok", "hosted"]);
    expect(AI_PURPOSES).toContain("cover-letter-draft");
    expect(LABOR_STATISTIC_KINDS).toEqual(["percentile", "mean", "employment-count"]);
    expect(DOCUMENT_IMPORT_FORMATS).toEqual(["pdf", "docx", "markdown", "plain-text"]);
    expect(DOCUMENT_EXPORT_FORMATS).toEqual(["pdf", "docx", "markdown", "plain-text"]);
  });

  it("keeps extraction deterministic, generic over validated payload/candidate contracts, and source-backed", async () => {
    type Candidate = { readonly field: string; readonly value: string };
    const port: ExtractionPort<{ readonly selectedText: string }, Candidate> = {
      id: "synthetic-selection",
      version: "1.0.0",
      supports: () => ({ score: confidence(1), reasonCode: "selected_text" }),
      extract: async (_input, context) => ({
        extractor: { id: "synthetic-selection", version: "1.0.0" },
        candidates: [{ field: "title", value: "Synthetic role" }],
        warnings: context.cancellation?.aborted === true ? [{ code: "cancelled" }] : [],
      }),
    };
    const input = {
      kind: "capture",
      source: sourceReference({
        sourceType: "capture",
        sourceId: "019539af-8b02-7dd4-8b54-395d8f3fe502",
        pointer: "selectedText",
      }),
      capturedAt: instant("2026-08-24T16:00:00.000Z"),
      payload: { selectedText: "Synthetic role" },
    } as const;

    expect(port.supports(input)).toEqual({ score: 1, reasonCode: "selected_text" });
    await expect(port.extract(input, operationContext)).resolves.toMatchObject({
      candidates: [{ field: "title", value: "Synthetic role" }],
    });
    expectTypeOf(port).toMatchTypeOf<ExtractionPort<typeof input.payload, Candidate>>();
  });

  it("makes AI-disabled capability discovery complete without a provider call", async () => {
    let generationCalls = 0;
    const port: AiPort = {
      capabilities: async () => ({
        mode: "disabled",
        available: false,
        structuredGeneration: false,
        embeddings: false,
        destination: "none",
      }),
      generateStructured: async () => {
        generationCalls += 1;
        throw new Error("Generation must not be called while AI is disabled.");
      },
    };

    await expect(port.capabilities()).resolves.toMatchObject({
      mode: "disabled",
      available: false,
    });
    expect(generationCalls).toBe(0);
  });

  it("keeps labor results dataset-attributed and occupation-wide", async () => {
    const dataset = {
      provider: "synthetic-bls",
      datasetName: "synthetic-oe-ws",
      releaseVersion: "2026-test",
      retrievedAt: instant("2026-08-24T16:00:00.000Z"),
      sourceUrl: webUrl("https://example.test/labor/source"),
      licenseUrl: webUrl("https://example.test/labor/license"),
    };
    const port: LaborDataPort = {
      searchOccupations: async () => [
        {
          occupationCode: "15-1252",
          title: "Software Developers",
          confidence: confidence(0.9),
          dataset,
        },
      ],
      salaryStatistics: async (request) => ({
        occupationCode: request.occupationCode,
        geographyCode: request.geographyCode,
        period: "2026",
        statistics: [
          {
            kind: "percentile",
            percentile: 50,
            value: moneyRate({ minorUnits: 12_000_000, currency: "USD", interval: "year" }),
          },
        ],
        dataset,
        warnings: [{ code: "occupation_wide_not_employer_specific" }],
      }),
    };

    await expect(
      port.searchOccupations({
        title: "Software Engineer",
        alternateTitles: [],
        skills: ["typescript"],
        limit: 5,
        context: operationContext,
      }),
    ).resolves.toMatchObject([{ occupationCode: "15-1252" }]);
    await expect(
      port.salaryStatistics({
        occupationCode: "15-1252",
        geographyCode: "US",
        context: operationContext,
      }),
    ).resolves.toMatchObject({
      warnings: [{ code: "occupation_wide_not_employer_specific" }],
    });
  });

  it("keeps imported evidence provisional and exports immutable-version input", async () => {
    const port: DocumentPort = {
      importDocument: async () => ({
        evidenceStatus: "proposal",
        plainText: "Synthetic resume text",
        pages: [{ page: 1, text: "Synthetic resume text" }],
        warnings: [],
      }),
      exportDocument: async () => ({
        bytes: new Uint8Array([1, 2, 3]),
        mediaType: "text/markdown",
        fileExtension: ".md",
        sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        warnings: [],
      }),
    };

    await expect(
      port.importDocument({
        format: "plain-text",
        fileName: "synthetic.txt",
        bytes: new TextEncoder().encode("Synthetic resume text"),
        context: operationContext,
      }),
    ).resolves.toMatchObject({ evidenceStatus: "proposal" });
    await expect(
      port.exportDocument({
        documentVersionId: entityId("document-version", "019539af-8b03-7dd4-8b54-395d8f3fe503"),
        title: "Synthetic letter",
        blocks: [{ kind: "paragraph", text: "Synthetic content" }],
        format: "markdown",
        suggestedFileName: "synthetic-letter.md",
        context: operationContext,
      }),
    ).resolves.toMatchObject({ fileExtension: ".md" });
  });

  it("exposes sync as capability-only and explicitly deferred", async () => {
    const port: SyncPort = {
      availability: async () => DEFERRED_SYNC_AVAILABILITY,
    };

    await expect(port.availability()).resolves.toEqual({
      state: "deferred",
      reason: "not-available-in-baseline",
      networkRequired: false,
    });
    expect("push" in port).toBe(false);
    expect("pull" in port).toBe(false);
    expect(Object.isFrozen(DEFERRED_SYNC_AVAILABILITY)).toBe(true);
  });
});
