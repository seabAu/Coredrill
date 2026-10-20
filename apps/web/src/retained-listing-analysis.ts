import {
  RetainedListingAnalysisLimitError,
  LISTING_COMPARISON_FIELDS,
  type RetainedCaptureAnalysis,
  type ListingComparisonField,
  type JobSourceComparisonDependencies,
} from "@coredrill/application";
import { canonicalJsonStringify } from "@coredrill/capture-core";
import { generateEntityId } from "@coredrill/domain";
import {
  extractJobPostingJsonLdV1,
  normalizeJobCandidatesV1,
  JobPostingJsonLdError,
  JobCandidateNormalizationError,
} from "@coredrill/extractors";

type Capture = Parameters<JobSourceComparisonDependencies["analyze"]>[0];
/** Current local analysis of retained content, never a claim of historical extraction or truth. */
export const analyzeRetainedListing = (capture: Capture): RetainedCaptureAnalysis => {
  const candidates = [...capture.fieldCandidates];
  const derivedCandidateIds: string[] = [];
  const uncertain = new Set<ListingComparisonField>();
  const emptyRequirementPointers: string[] = [];
  const fieldMap: Readonly<Record<string, ListingComparisonField>> = {
    requirements: "requirements",
    salary: "compensation",
    valid_through: "deadline",
    locations: "locations",
  };
  let postingCount = 0;
  const analyze = (jsonLd: readonly unknown[], fromPayload: boolean) => {
    const extraction = extractJobPostingJsonLdV1({
      specVersion: 1,
      sourceId: capture.id,
      capturedAt: capture.capturedAt,
      jsonLd,
      createCandidateId: () => generateEntityId("field-value"),
    });
    // Existing extraction may omit an invalid sibling when another entry is valid.
    // Inspect coverage of retained coordinates, not a second value interpretation.
    const emitted = new Set(
      extraction.candidates.map((candidate) =>
        JSON.stringify([candidate.fieldName, candidate.provenance.source.pointer]),
      ),
    );
    const slots: Readonly<Record<string, readonly [string, ListingComparisonField]>> = {
      baseSalary: ["salary", "compensation"],
      validThrough: ["valid_through", "deadline"],
      jobLocation: ["locations", "locations"],
      applicantLocationRequirements: ["locations", "locations"],
      qualifications: ["requirements", "requirements"],
      responsibilities: ["requirements", "requirements"],
      skills: ["requirements", "requirements"],
      educationRequirements: ["requirements", "requirements"],
      experienceRequirements: ["requirements", "requirements"],
    };
    const coverage = (value: unknown, pointer: string): void => {
      if (Array.isArray(value)) {
        value.forEach((child, index) => {
          coverage(child, `${pointer}/${String(index)}`);
        });
        return;
      }
      if (typeof value !== "object" || value === null) return;
      const record = value as Record<string, unknown>;
      const type = record["@type"];
      if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) {
        for (const [name, [fieldName, field]] of Object.entries(slots)) {
          if (!Object.hasOwn(record, name)) continue;
          const raw = record[name];
          if (field === "requirements" && Array.isArray(raw) && raw.length === 0)
            emptyRequirementPointers.push(
              fromPayload
                ? `${pointer}/${name}`.replace(/^\/content\/jsonLd\/0/u, "/content/apiPayload")
                : `${pointer}/${name}`,
            );
          const pointers = Array.isArray(raw)
            ? raw.map((_, index) => `${pointer}/${name}/${String(index)}`)
            : [`${pointer}/${name}`];
          if (pointers.some((coordinate) => !emitted.has(JSON.stringify([fieldName, coordinate]))))
            uncertain.add(field);
        }
      }
      for (const [name, child] of Object.entries(record))
        coverage(child, `${pointer}/${name.replaceAll("~", "~0").replaceAll("/", "~1")}`);
    };
    // The extractor has already checked the shared traversal budgets before this walk.
    jsonLd.forEach((value, index) => {
      coverage(value, `/content/jsonLd/${String(index)}`);
    });
    postingCount += extraction.summary.discoveredJobPostings;
    if (postingCount > 1) for (const name of LISTING_COMPARISON_FIELDS) uncertain.add(name);
    for (const warning of extraction.warnings) {
      const name = warning.fieldName === null ? undefined : fieldMap[warning.fieldName];
      if (name !== undefined) uncertain.add(name);
      if (warning.code === "context_missing_or_unsupported")
        for (const field of LISTING_COMPARISON_FIELDS) uncertain.add(field);
    }
    for (const candidate of extraction.candidates) {
      const pointer = fromPayload
        ? candidate.provenance.source.pointer.replace(
            /^\/content\/jsonLd\/0/u,
            "/content/apiPayload",
          )
        : candidate.provenance.source.pointer;
      const derived = {
        ...candidate,
        provenance: {
          ...candidate.provenance,
          source: { ...candidate.provenance.source, pointer },
        },
      };
      // Keep every original; avoid a second identical projection from the same exact adapter/slot.
      if (
        capture.fieldCandidates.some(
          (original) =>
            original.fieldName === derived.fieldName &&
            original.provenance.source.pointer === pointer &&
            canonicalJsonStringify(original.provenance.extractor) ===
              canonicalJsonStringify(derived.provenance.extractor) &&
            canonicalJsonStringify(original.value) === canonicalJsonStringify(derived.value),
        )
      )
        continue;
      candidates.push(derived);
      derivedCandidateIds.push(derived.id);
    }
  };
  try {
    if (capture.content.jsonLd !== undefined) analyze(capture.content.jsonLd, false);
    if (capture.content.apiPayload !== undefined) analyze([capture.content.apiPayload], true);
    return {
      normalization: normalizeJobCandidatesV1({ specVersion: 1, candidates, source: null }),
      uncertainFields: [...uncertain],
      derivedCandidateIds,
      emptyRequirementPointers,
    };
  } catch (error) {
    if (
      (error instanceof JobPostingJsonLdError &&
        ["traversal_limit_exceeded", "candidate_limit_exceeded"].includes(error.code)) ||
      (error instanceof JobCandidateNormalizationError &&
        ["input_too_large", "candidate_limit_exceeded"].includes(error.code))
    )
      throw new RetainedListingAnalysisLimitError();
    throw error;
  }
};
