const STATUS = Object.freeze({
  fail: "fail",
  insufficientData: "insufficient_data",
  noData: "no_data",
  pass: "pass",
});

function round(value) {
  return Number(value.toFixed(6));
}

function ratio(numerator, denominator) {
  return denominator === 0 ? null : round(numerator / denominator);
}

function assertCount(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative safe integer.`);
  }
}

function assertProbability(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be a finite number from 0 through 1.`);
  }
}

function metricStatus(value, sampleCount, minimumSamples, threshold, comparison) {
  if (value === null) return STATUS.noData;
  if (sampleCount < minimumSamples) return STATUS.insufficientData;
  return comparison(value, threshold) ? STATUS.pass : STATUS.fail;
}

function combinedStatus(statuses, hasAnyData) {
  if (!hasAnyData) return STATUS.noData;
  if (statuses.includes(STATUS.fail)) return STATUS.fail;
  if (statuses.includes(STATUS.insufficientData) || statuses.includes(STATUS.noData)) {
    return STATUS.insufficientData;
  }
  return STATUS.pass;
}

function summarizeStatuses(statuses) {
  const counts = {
    [STATUS.pass]: 0,
    [STATUS.fail]: 0,
    [STATUS.insufficientData]: 0,
    [STATUS.noData]: 0,
  };
  statuses.forEach((status) => {
    if (!(status in counts)) throw new Error(`Unknown quality status ${String(status)}.`);
    counts[status] += 1;
  });
  const status =
    counts.fail > 0
      ? STATUS.fail
      : counts.insufficient_data > 0 || counts.no_data > 0
        ? STATUS.insufficientData
        : STATUS.pass;
  return { status, counts };
}

function validateBins(bins) {
  if (!Array.isArray(bins) || bins.length === 0) {
    throw new Error("confidenceBins must be a non-empty array.");
  }

  let expectedLower = 0;
  bins.forEach((bin, index) => {
    assertProbability(bin.lowerInclusive, `confidenceBins[${index}].lowerInclusive`);
    assertProbability(bin.upperBound, `confidenceBins[${index}].upperBound`);
    if (typeof bin.upperBoundIncluded !== "boolean") {
      throw new Error(`confidenceBins[${index}].upperBoundIncluded must be a boolean.`);
    }
    const isLast = index === bins.length - 1;
    if (bin.upperBoundIncluded !== isLast) {
      throw new Error("Only the final confidence bin may include its upper bound.");
    }
    if (bin.lowerInclusive !== expectedLower || bin.upperBound <= bin.lowerInclusive) {
      throw new Error("confidenceBins must be contiguous, ascending, and non-empty.");
    }
    expectedLower = bin.upperBound;
  });
  if (expectedLower !== 1) throw new Error("confidenceBins must cover 0 through 1.");
}

function calibration(observations, bins, thresholds) {
  if (observations.length === 0) {
    return {
      predictionCount: 0,
      meanConfidence: null,
      observedAccuracy: null,
      expectedCalibrationError: null,
      brierScore: null,
      status: STATUS.noData,
      bins: bins.map((bin) => ({ ...bin, count: 0, meanConfidence: null, observedAccuracy: null })),
    };
  }

  const scoredBins = bins.map((bin) => {
    const values = observations.filter(({ confidence }) => {
      return (
        confidence >= bin.lowerInclusive &&
        (bin.upperBoundIncluded ? confidence <= bin.upperBound : confidence < bin.upperBound)
      );
    });
    const correct = values.filter(({ exactMatch }) => exactMatch).length;
    return {
      ...bin,
      count: values.length,
      meanConfidence:
        values.length === 0
          ? null
          : round(values.reduce((sum, item) => sum + item.confidence, 0) / values.length),
      observedAccuracy: ratio(correct, values.length),
    };
  });
  const predictionCount = observations.length;
  const meanConfidence = round(
    observations.reduce((sum, item) => sum + item.confidence, 0) / predictionCount,
  );
  const observedAccuracy = ratio(
    observations.filter(({ exactMatch }) => exactMatch).length,
    predictionCount,
  );
  const expectedCalibrationError = round(
    scoredBins.reduce((sum, bin) => {
      if (bin.count === 0) return sum;
      return (
        sum + (bin.count / predictionCount) * Math.abs(bin.meanConfidence - bin.observedAccuracy)
      );
    }, 0),
  );
  const brierScore = round(
    observations.reduce(
      (sum, item) => sum + (item.confidence - (item.exactMatch ? 1 : 0)) ** 2,
      0,
    ) / predictionCount,
  );
  const status =
    predictionCount < thresholds.minimumPredictions
      ? STATUS.insufficientData
      : expectedCalibrationError <= thresholds.maximumExpectedCalibrationError &&
          brierScore <= thresholds.maximumBrierScore
        ? STATUS.pass
        : STATUS.fail;

  return {
    predictionCount,
    meanConfidence,
    observedAccuracy,
    expectedCalibrationError,
    brierScore,
    status,
    bins: scoredBins,
  };
}

export function scoreQualitySlice({ expectedCount, observations, confidenceBins, thresholds }) {
  assertCount(expectedCount, "expectedCount");
  if (!Array.isArray(observations)) throw new Error("observations must be an array.");
  validateBins(confidenceBins);
  observations.forEach((observation, index) => {
    assertProbability(observation.confidence, `observations[${index}].confidence`);
    if (typeof observation.exactMatch !== "boolean") {
      throw new Error(`observations[${index}].exactMatch must be a boolean.`);
    }
  });

  const producedCount = observations.length;
  const exactMatches = observations.filter(({ exactMatch }) => exactMatch).length;
  if (exactMatches > expectedCount) {
    throw new Error("exact matches cannot exceed the expected candidate count.");
  }
  const falsePositives = producedCount - exactMatches;
  const falseNegatives = expectedCount - exactMatches;
  const precision = ratio(exactMatches, producedCount);
  const coverage = ratio(exactMatches, expectedCount);
  const precisionStatus = metricStatus(
    precision,
    producedCount,
    thresholds.precision.minimumProducedSamples,
    thresholds.precision.minimumValue,
    (value, threshold) => value >= threshold,
  );
  const coverageStatus = metricStatus(
    coverage,
    expectedCount,
    thresholds.coverage.minimumExpectedSamples,
    thresholds.coverage.minimumValue,
    (value, threshold) => value >= threshold,
  );
  const calibrationResult = calibration(observations, confidenceBins, thresholds.calibration);

  return {
    counts: {
      expected: expectedCount,
      produced: producedCount,
      exactMatches,
      falsePositives,
      falseNegatives,
    },
    metrics: {
      precision: { value: precision, status: precisionStatus },
      coverage: { value: coverage, status: coverageStatus },
      recall: { value: coverage, status: coverageStatus },
      calibration: calibrationResult,
    },
    status: combinedStatus(
      [precisionStatus, coverageStatus, calibrationResult.status],
      expectedCount > 0 || producedCount > 0,
    ),
  };
}

export function buildExtractionQualityReport(manifest, evaluatedAdapters) {
  if (manifest.specVersion !== 1)
    throw new Error("Unsupported extraction quality manifest specVersion.");
  if (manifest.candidateContractVersion !== 1) {
    throw new Error("Unsupported candidate contract version in extraction quality manifest.");
  }
  if (!Array.isArray(manifest.adapters) || !Array.isArray(evaluatedAdapters)) {
    throw new Error("Manifest adapters and evaluated adapters must be arrays.");
  }
  const manifestIds = manifest.adapters.map(({ extractor }) => extractor.name);
  if (new Set(manifestIds).size !== manifestIds.length)
    throw new Error("Manifest extractor names must be unique.");
  const evaluatedIds = evaluatedAdapters.map(({ extractor }) => extractor.name);
  if (new Set(evaluatedIds).size !== evaluatedIds.length)
    throw new Error("Evaluated extractor names must be unique.");
  if (JSON.stringify(manifestIds) !== JSON.stringify(evaluatedIds)) {
    throw new Error("Evaluated extractors must exactly match manifest order and identity.");
  }

  const allObservations = [];
  let allExpected = 0;
  const adapters = manifest.adapters.map((definition, index) => {
    const evaluated = evaluatedAdapters[index];
    if (definition.extractor.version !== evaluated.extractor.version) {
      throw new Error(`Extractor version mismatch for ${definition.extractor.name}.`);
    }
    if (JSON.stringify(definition.supportedFields) !== JSON.stringify(evaluated.supportedFields)) {
      throw new Error(`Supported fields mismatch for ${definition.extractor.name}.`);
    }

    const fields = definition.supportedFields.map((fieldName) => {
      const field = evaluated.fields[fieldName] ?? { expectedCount: 0, observations: [] };
      return {
        fieldName,
        ...scoreQualitySlice({
          ...field,
          confidenceBins: manifest.confidenceBins,
          thresholds: manifest.thresholds,
        }),
      };
    });
    const expectedCount = fields.reduce((sum, field) => sum + field.counts.expected, 0);
    const observations = definition.supportedFields.flatMap(
      (fieldName) => evaluated.fields[fieldName]?.observations ?? [],
    );
    allExpected += expectedCount;
    allObservations.push(...observations);
    return {
      extractor: definition.extractor,
      fixtureSuite: definition.fixtureSuite,
      fixtureCaseCount: evaluated.fixtureCaseCount,
      ...scoreQualitySlice({
        expectedCount,
        observations,
        confidenceBins: manifest.confidenceBins,
        thresholds: manifest.thresholds,
      }),
      fields,
    };
  });

  return {
    artifact: "coredrill-extraction-quality-report",
    specVersion: manifest.specVersion,
    candidateContractVersion: manifest.candidateContractVersion,
    evaluationInput: "docs/evals/extraction-quality-evaluation.v1.json",
    corpus: manifest.corpus,
    thresholds: manifest.thresholds,
    confidenceBins: manifest.confidenceBins,
    overall: scoreQualitySlice({
      expectedCount: allExpected,
      observations: allObservations,
      confidenceBins: manifest.confidenceBins,
      thresholds: manifest.thresholds,
    }),
    thresholdSummary: {
      adapters: summarizeStatuses(adapters.map(({ status }) => status)),
      fields: summarizeStatuses(
        adapters.flatMap(({ fields }) => fields.map(({ status }) => status)),
      ),
    },
    adapters,
    interpretation: manifest.interpretation,
  };
}
