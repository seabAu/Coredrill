import { describe, expect, it } from "vitest";

import { buildExtractionQualityReport, scoreQualitySlice } from "../extraction-quality/report.mjs";

const confidenceBins = [
  { lowerInclusive: 0, upperBound: 0.5, upperBoundIncluded: false },
  { lowerInclusive: 0.5, upperBound: 0.8, upperBoundIncluded: false },
  { lowerInclusive: 0.8, upperBound: 1, upperBoundIncluded: true },
];
const thresholds = {
  precision: { minimumValue: 0.9, minimumProducedSamples: 1 },
  coverage: { minimumValue: 0.9, minimumExpectedSamples: 1 },
  calibration: {
    maximumExpectedCalibrationError: 0.2,
    maximumBrierScore: 0.2,
    minimumPredictions: 3,
  },
};

describe("extraction quality scoring", () => {
  it("reports false positives, false negatives, precision, coverage, and recall", () => {
    const result = scoreQualitySlice({
      expectedCount: 3,
      observations: [
        { confidence: 0.9, exactMatch: true },
        { confidence: 0.8, exactMatch: true },
        { confidence: 0.7, exactMatch: false },
      ],
      confidenceBins,
      thresholds,
    });

    expect(result.counts).toEqual({
      expected: 3,
      produced: 3,
      exactMatches: 2,
      falsePositives: 1,
      falseNegatives: 1,
    });
    expect(result.metrics.precision).toEqual({ value: 0.666667, status: "fail" });
    expect(result.metrics.coverage).toEqual({ value: 0.666667, status: "fail" });
    expect(result.metrics.recall).toEqual(result.metrics.coverage);
    expect(result.status).toBe("fail");
  });

  it("uses explicit null and no-data states instead of synthetic perfect scores", () => {
    const result = scoreQualitySlice({
      expectedCount: 0,
      observations: [],
      confidenceBins,
      thresholds,
    });

    expect(result.metrics.precision).toEqual({ value: null, status: "no_data" });
    expect(result.metrics.coverage).toEqual({ value: null, status: "no_data" });
    expect(result.metrics.calibration.expectedCalibrationError).toBeNull();
    expect(result.metrics.calibration.bins.every((bin) => bin.count === 0)).toBe(true);
    expect(result.status).toBe("no_data");
  });

  it("reports one-sided missing data without hiding false negatives or false positives", () => {
    const missing = scoreQualitySlice({
      expectedCount: 1,
      observations: [],
      confidenceBins,
      thresholds,
    });
    const unexpected = scoreQualitySlice({
      expectedCount: 0,
      observations: [{ confidence: 0.5, exactMatch: false }],
      confidenceBins,
      thresholds,
    });

    expect(missing.counts.falseNegatives).toBe(1);
    expect(missing.metrics.precision).toEqual({ value: null, status: "no_data" });
    expect(missing.metrics.coverage).toEqual({ value: 0, status: "fail" });
    expect(missing.status).toBe("fail");
    expect(unexpected.counts.falsePositives).toBe(1);
    expect(unexpected.metrics.precision).toEqual({ value: 0, status: "fail" });
    expect(unexpected.metrics.coverage).toEqual({ value: null, status: "no_data" });
    expect(unexpected.status).toBe("fail");
  });

  it("places confidence values on declared half-open and closed bin boundaries", () => {
    const result = scoreQualitySlice({
      expectedCount: 3,
      observations: [
        { confidence: 0.5, exactMatch: true },
        { confidence: 0.8, exactMatch: true },
        { confidence: 1, exactMatch: true },
      ],
      confidenceBins,
      thresholds,
    });

    expect(result.metrics.calibration.bins.map(({ count }) => count)).toEqual([0, 1, 2]);
  });

  it("keeps false negatives out of confidence calibration and names small samples", () => {
    const result = scoreQualitySlice({
      expectedCount: 2,
      observations: [{ confidence: 0.9, exactMatch: true }],
      confidenceBins,
      thresholds,
    });

    expect(result.counts.falseNegatives).toBe(1);
    expect(result.metrics.calibration.predictionCount).toBe(1);
    expect(result.metrics.calibration.status).toBe("insufficient_data");
    expect(result.status).toBe("fail");
  });

  it("rejects duplicate or drifting extractor identities", () => {
    const manifest = {
      specVersion: 1,
      candidateContractVersion: 1,
      corpus: {},
      thresholds,
      confidenceBins,
      interpretation: {},
      adapters: [
        {
          extractor: { name: "example", version: "1.0.0" },
          fixtureSuite: "fixture.json",
          supportedFields: ["title"],
        },
      ],
    };
    const evaluated = [
      {
        extractor: { name: "different", version: "1.0.0" },
        supportedFields: ["title"],
        fixtureCaseCount: 1,
        fields: {},
      },
    ];

    expect(() => buildExtractionQualityReport(manifest, evaluated)).toThrow(/exactly match/);
  });

  it("surfaces failing adapter and field thresholds above pooled metrics", () => {
    const manifest = {
      specVersion: 1,
      candidateContractVersion: 1,
      corpus: {},
      thresholds,
      confidenceBins,
      interpretation: {},
      adapters: [
        {
          extractor: { name: "example", version: "1.0.0" },
          fixtureSuite: "fixture.json",
          supportedFields: ["title"],
        },
      ],
    };
    const evaluated = [
      {
        extractor: { name: "example", version: "1.0.0" },
        supportedFields: ["title"],
        fixtureCaseCount: 1,
        fields: {
          title: {
            expectedCount: 1,
            observations: [{ confidence: 0.95, exactMatch: false }],
          },
        },
      },
    ];

    const report = buildExtractionQualityReport(manifest, evaluated);
    expect(report.thresholdSummary.adapters).toEqual({
      status: "fail",
      counts: { pass: 0, fail: 1, insufficient_data: 0, no_data: 0 },
    });
    expect(report.thresholdSummary.fields).toEqual(report.thresholdSummary.adapters);
  });
});
