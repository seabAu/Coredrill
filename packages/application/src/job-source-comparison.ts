import {
  jobNormalizationV1Schema,
  safeParseCaptureEnvelope,
  type CaptureEnvelopeV1,
  type JobNormalizationV1,
  type JobCandidateNormalizationV1,
  type JsonValue,
} from "@coredrill/contracts";
import { entityId, instant } from "@coredrill/domain";
import { defineQuery, type ApplicationOperationContext } from "./operation.js";
import { applicationFailure, applicationSuccess, type ApplicationResult } from "./result.js";
import type { GetJobSourceCaptureInput, JobSourceCaptureDto } from "./job-source-capture.js";
import { isJobRequirementHeading, parseJobRequirementProposals } from "./job-requirement-parser.js";

export const RETAINED_LISTING_ANALYSIS_V1 = Object.freeze({
  name: "coredrill.retained-listing-analysis",
  version: "1.0.0",
  normalizationSpecVersion: 1,
  requirementParserSpecVersion: 1,
});
export const LISTING_COMPARISON_FIELDS = [
  "requirements",
  "compensation",
  "deadline",
  "locations",
] as const;
export type ListingComparisonField = (typeof LISTING_COMPARISON_FIELDS)[number];
export interface RetainedCaptureAnalysis {
  readonly normalization: JobNormalizationV1;
  /** Invalid/multiple posting evidence must not disappear when valid candidates survive. */
  readonly uncertainFields: readonly ListingComparisonField[];
  readonly derivedCandidateIds: readonly string[];
  readonly emptyRequirementPointers: readonly string[];
}
export interface RetainedListingFact {
  /** Retained extraction coordinate, not inferred semantic requirement identity. */
  readonly key: string;
  readonly valueJson: string;
  readonly sourceValueJson: string;
  readonly rawValueJson: string | null;
  readonly candidateId: string | null;
  readonly sourcePointer: string;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly capturedAt: string;
  readonly licenseNote: string | null;
  readonly sourceExcerpt: string | null;
  readonly method: string;
  readonly confidence: number | null;
  readonly extractor: { readonly name: string; readonly version: string };
  readonly origin: "original_candidate" | "current_jsonld_analysis" | "current_text_analysis";
}
export interface RetainedListingField {
  readonly state: "known" | "missing" | "ambiguous" | "unavailable";
  readonly reason:
    | "missing_capture"
    | "no_candidates"
    | "incomplete_normalization"
    | "conflicting_candidates"
    | "extraction_uncertain"
    | "duplicate_slots"
    | "parser_limit"
    | "analysis_limit"
    | null;
  readonly items: readonly RetainedListingFact[];
  readonly absenceEvidence: readonly RetainedListingFact[];
}
export interface RetainedListingFieldDiff {
  readonly kind: "unchanged" | "changed" | "not_comparable";
  readonly reason: "incomplete_evidence" | "different_requirement_basis" | null;
  readonly before: RetainedListingField;
  readonly after: RetainedListingField;
  /** Keys refer to the complete facts above, avoiding duplicate value payloads. */
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly changed: readonly string[];
}
export interface CompareJobSourceSnapshotsInput {
  readonly jobId: string;
  readonly baselineSnapshotId: string;
  readonly currentSnapshotId: string;
  readonly includeArchived?: boolean;
}
export interface JobSourceComparisonDto {
  readonly specVersion: 1;
  readonly jobId: string;
  readonly baselineSnapshotId: string;
  readonly currentSnapshotId: string;
  readonly baselineCapturedAt: string;
  readonly currentCapturedAt: string;
  readonly baselineEnvelopeId: string | null;
  readonly currentEnvelopeId: string | null;
  readonly analyzedAt: string;
  readonly analysis: typeof RETAINED_LISTING_ANALYSIS_V1;
  readonly fields: Readonly<Record<ListingComparisonField, RetainedListingFieldDiff>>;
  /** Recorded capture fingerprints, not newly calculated body checksums. */
  readonly content: {
    readonly kind: "changed" | "unchanged";
    readonly beforeHash: string;
    readonly afterHash: string;
  };
  readonly refreshPerformed: false;
  readonly trustedFieldMutationPerformed: false;
}
export interface JobSourceComparisonDependencies {
  readonly readCapture: (
    input: GetJobSourceCaptureInput,
    context: ApplicationOperationContext,
  ) => Promise<ApplicationResult<JobSourceCaptureDto>>;
  readonly analyze: (capture: CaptureEnvelopeV1) => RetainedCaptureAnalysis;
}
export class RetainedListingAnalysisLimitError extends Error {
  public constructor() {
    super("Retained listing analysis exceeded its local limits.");
    this.name = "RetainedListingAnalysisLimitError";
  }
}
const object = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError();
  return value as Record<string, unknown>;
};
const canonical = (value: JsonValue): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => {
        const child = value[key];
        if (child === undefined) throw new TypeError();
        return `${JSON.stringify(key)}:${canonical(child)}`;
      })
      .join(",")}}`;
  return JSON.stringify(value);
};
const freeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
};
const validList = (value: unknown, maximum: number, allowed?: ReadonlySet<string>): boolean =>
  Array.isArray(value) &&
  value.length <= maximum &&
  new Set(value).size === value.length &&
  value.every(
    (item: unknown) => typeof item === "string" && (allowed === undefined || allowed.has(item)),
  );
const field = (
  state: RetainedListingField["state"],
  reason: RetainedListingField["reason"],
  items: readonly RetainedListingFact[] = [],
  absenceEvidence: readonly RetainedListingFact[] = [],
): RetainedListingField => ({ state, reason, items, absenceEvidence });
const candidateFact = (
  candidate: JobCandidateNormalizationV1,
  derived: ReadonlySet<string>,
  raw = false,
): RetainedListingFact => {
  const source = candidate.sourceCandidate;
  return {
    key: JSON.stringify([
      source.provenance.extractor.name,
      source.provenance.extractor.version,
      source.provenance.source.pointer,
    ]),
    valueJson: canonical(raw ? source.value : (candidate.normalizedValue as JsonValue)),
    sourceValueJson: canonical(source.value),
    rawValueJson: source.rawValue === undefined ? null : canonical(source.rawValue),
    candidateId: derived.has(source.id) ? null : source.id,
    sourcePointer: source.provenance.source.pointer,
    sourceType: source.provenance.source.sourceType,
    sourceId: source.provenance.source.sourceId,
    capturedAt: source.provenance.capturedAt,
    licenseNote: source.provenance.licenseNote ?? null,
    sourceExcerpt: source.provenance.sourceExcerpt ?? null,
    method: source.provenance.method,
    confidence: source.provenance.confidence,
    extractor: source.provenance.extractor,
    origin: derived.has(source.id) ? "current_jsonld_analysis" : "original_candidate",
  };
};
const sourceFields = {
  requirements: "requirements",
  compensation: "salary",
  deadline: "valid_through",
  locations: "locations",
} as const;

const normalizedField = (
  name: Exclude<ListingComparisonField, "requirements">,
  analysis: RetainedCaptureAnalysis,
): RetainedListingField => {
  const candidates = analysis.normalization.candidates.filter(
    ({ sourceCandidate }) => sourceCandidate.fieldName === sourceFields[name],
  );
  const derived = new Set(analysis.derivedCandidateIds);
  const items = candidates.map((candidate) =>
    candidateFact(candidate, derived, candidate.status !== "normalized"),
  );
  if (analysis.uncertainFields.includes(name))
    return field("ambiguous", "extraction_uncertain", items);
  if (items.length === 0) return field("missing", "no_candidates");
  if (candidates.some(({ status }) => status !== "normalized"))
    return field("ambiguous", "incomplete_normalization", items);
  if (
    name === "compensation" &&
    candidates.some(
      ({ normalizedValue: value }) =>
        value?.kind !== "salary" ||
        value.currency === null ||
        value.currencyScale === null ||
        value.minimumMinorUnits === null ||
        value.maximumMinorUnits === null ||
        value.interval === null,
    )
  )
    return field("ambiguous", "incomplete_normalization", items);
  if (name !== "locations" && new Set(items.map(({ valueJson }) => valueJson)).size !== 1)
    return field("ambiguous", "conflicting_candidates", items);
  return field("known", null, items);
};
const requirements = (
  capture: JobSourceCaptureDto,
  analysis: RetainedCaptureAnalysis,
): RetainedListingField => {
  const original = capture.capture;
  if (original === null) throw new TypeError();
  const candidates = analysis.normalization.candidates.filter(
    ({ sourceCandidate }) => sourceCandidate.fieldName === "requirements",
  );
  const items = candidates.map((candidate) =>
    candidateFact(candidate, new Set(analysis.derivedCandidateIds), true),
  );
  const absence = analysis.emptyRequirementPointers.map((pointer): RetainedListingFact => ({
    key: JSON.stringify(["explicit_empty_requirement_array", pointer]),
    valueJson: "[]",
    sourceValueJson: "[]",
    rawValueJson: null,
    candidateId: null,
    sourcePointer: pointer,
    sourceType: "capture",
    sourceId: original.id,
    capturedAt: capture.capturedAt,
    licenseNote: null,
    sourceExcerpt: "[]",
    method: "literal",
    confidence: null,
    extractor: {
      name: RETAINED_LISTING_ANALYSIS_V1.name,
      version: RETAINED_LISTING_ANALYSIS_V1.version,
    },
    origin: "current_jsonld_analysis",
  }));
  if (analysis.uncertainFields.includes("requirements"))
    return field("ambiguous", "extraction_uncertain", items, absence);
  if (items.length > 0) {
    if (new Set(items.map(({ key }) => key)).size !== items.length)
      return field("ambiguous", "duplicate_slots", items, absence);
    return field("known", null, items, absence);
  }
  const text = original.content.readableText ?? original.content.selectedText;
  if (text === undefined || text.trim().length === 0)
    return absence.length > 0
      ? field("known", null, [], absence)
      : field("missing", "no_candidates");
  try {
    if (text.length > 524_288) throw new TypeError();
    const lines = text.split(/\r\n|\n|\r/u);
    if (lines.length > 512) throw new TypeError();
    const parsed = parseJobRequirementProposals({
      jobId: capture.jobId,
      blocks: lines
        .map((line, index) => ({
          kind: isJobRequirementHeading(line)
            ? ("heading" as const)
            : /^\s*(?:[-*•‣▪◦]|\d{1,3}[.)])\s/u.test(line)
              ? ("item" as const)
              : ("paragraph" as const),
          provenanceId: capture.snapshotId,
          sourcePointer: `/raw_text/lines/${String(index + 1)}`,
          sourceExcerpt: line,
          text: isJobRequirementHeading(line) ? line.replace(/^\s*#{1,3}\s+/u, "") : line,
        }))
        .filter(({ text: line }) => line.trim().length !== 0),
    });
    const facts = parsed.proposals.map((proposal): RetainedListingFact => ({
      key: JSON.stringify(["coredrill.requirement-parser", "1.0.0", proposal.sourcePointer]),
      valueJson: canonical({
        category: proposal.sourceCategory,
        text: proposal.normalizedText,
        rawText: proposal.rawText,
      }),
      sourceValueJson: canonical(proposal.rawText),
      rawValueJson: null,
      candidateId: null,
      sourcePointer: proposal.sourcePointer,
      sourceType: "source_snapshot",
      sourceId: capture.snapshotId,
      capturedAt: capture.capturedAt,
      licenseNote: null,
      sourceExcerpt: proposal.sourceExcerpt,
      method: "heuristic",
      confidence: proposal.confidence,
      extractor: { name: "coredrill.requirement-parser", version: "1.0.0" },
      origin: "current_text_analysis",
    }));
    if (facts.length > 0 && absence.length > 0)
      return field("ambiguous", "conflicting_candidates", facts, absence);
    return facts.length === 0
      ? absence.length > 0
        ? field("known", null, [], absence)
        : field("missing", "no_candidates")
      : field("known", null, facts);
  } catch {
    return field("unavailable", "parser_limit");
  }
};
const project = (
  capture: JobSourceCaptureDto,
  analyze: JobSourceComparisonDependencies["analyze"],
): Readonly<Record<ListingComparisonField, RetainedListingField>> => {
  if (capture.capture === null)
    return Object.fromEntries(
      LISTING_COMPARISON_FIELDS.map((name) => [name, field("missing", "missing_capture")]),
    ) as Record<ListingComparisonField, RetainedListingField>;
  let output: RetainedCaptureAnalysis;
  try {
    output = analyze(capture.capture);
  } catch (error) {
    if (!(error instanceof RetainedListingAnalysisLimitError)) throw error;
    return Object.fromEntries(
      LISTING_COMPARISON_FIELDS.map((name) => [name, field("unavailable", "analysis_limit")]),
    ) as Record<ListingComparisonField, RetainedListingField>;
  }
  // Normalization is an existing versioned boundary. Reject a forged adapter echo.
  const serialized = JSON.stringify(output.normalization);
  if (
    serialized.length > 4 * 1024 * 1024 ||
    new TextEncoder().encode(serialized).byteLength > 4 * 1024 * 1024
  )
    throw new TypeError();
  const normalization = jobNormalizationV1Schema.parse(output.normalization);
  if (!validList(output.uncertainFields, 4, new Set(LISTING_COMPARISON_FIELDS)))
    throw new TypeError();
  if (!validList(output.derivedCandidateIds, 256)) throw new TypeError();
  if (!validList(output.emptyRequirementPointers, 256)) throw new TypeError();
  for (const pointer of output.emptyRequirementPointers) {
    if (
      pointer.length > 2_048 ||
      !/^\/content\/(?:jsonLd\/|apiPayload\/)/u.test(pointer) ||
      !/\/(?:qualifications|responsibilities|skills|educationRequirements|experienceRequirements)$/u.test(
        pointer,
      )
    )
      throw new TypeError();
    let retained: unknown = capture.capture;
    let parent: unknown = null;
    for (const key of pointer.slice(1).split("/")) {
      const decoded = key.replaceAll("~1", "/").replaceAll("~0", "~");
      if (typeof retained !== "object" || retained === null || !Object.hasOwn(retained, decoded))
        throw new TypeError();
      parent = retained;
      retained = (retained as Record<string, unknown>)[decoded];
    }
    if (!Array.isArray(retained) || retained.length !== 0) throw new TypeError();
    const type = object(parent)["@type"];
    if (type !== "JobPosting" && !(Array.isArray(type) && type.includes("JobPosting")))
      throw new TypeError();
  }
  const ids = new Set(normalization.candidates.map(({ sourceCandidate }) => sourceCandidate.id));
  if (
    output.derivedCandidateIds.some((id) => !ids.has(id)) ||
    normalization.candidates.some(
      ({ sourceCandidate }) =>
        sourceCandidate.provenance.source.sourceId !== capture.capture?.id ||
        sourceCandidate.provenance.capturedAt !== capture.capturedAt,
    )
  )
    throw new TypeError();
  const original = new Map(
    capture.capture.fieldCandidates.map((candidate) => [candidate.id, candidate]),
  );
  const derived = new Set(output.derivedCandidateIds);
  if (
    [...original.keys()].some((id) => !ids.has(id)) ||
    normalization.candidates.some(({ sourceCandidate }) => {
      if (derived.has(sourceCandidate.id))
        return (
          original.has(sourceCandidate.id) ||
          sourceCandidate.provenance.method !== "jsonld" ||
          sourceCandidate.provenance.source.sourceType !== "capture"
        );
      const retained = original.get(sourceCandidate.id);
      return (
        retained === undefined ||
        canonical(retained as JsonValue) !== canonical(sourceCandidate as JsonValue)
      );
    })
  )
    throw new TypeError();
  const analysis = { ...output, normalization };
  return {
    requirements: requirements(capture, analysis),
    compensation: normalizedField("compensation", analysis),
    deadline: normalizedField("deadline", analysis),
    locations: normalizedField("locations", analysis),
  };
};
const difference = (
  name: ListingComparisonField,
  before: RetainedListingField,
  after: RetainedListingField,
): RetainedListingFieldDiff => {
  const base = { before, after, added: [], removed: [], changed: [] };
  if (before.state !== "known" || after.state !== "known")
    return { ...base, kind: "not_comparable", reason: "incomplete_evidence" };
  if (name === "requirements") {
    const basis = (value: RetainedListingField) =>
      JSON.stringify(
        [
          ...new Set(
            [...value.items, ...value.absenceEvidence].map(({ extractor, origin }) =>
              JSON.stringify([
                origin === "current_jsonld_analysis" ? RETAINED_LISTING_ANALYSIS_V1 : extractor,
                origin,
              ]),
            ),
          ),
        ].sort(),
      );
    if (basis(before) !== basis(after))
      return { ...base, kind: "not_comparable", reason: "different_requirement_basis" };
  }
  const by = (fact: RetainedListingFact) => (name === "requirements" ? fact.key : fact.valueJson);
  const left = new Map(before.items.map((item) => [by(item), item]));
  const right = new Map(after.items.map((item) => [by(item), item]));
  const added = [...right.keys()].filter((key) => !left.has(key)).sort();
  const removed = [...left.keys()].filter((key) => !right.has(key)).sort();
  const changed =
    name === "requirements"
      ? [...right]
          .filter(([key, item]) => left.has(key) && left.get(key)?.valueJson !== item.valueJson)
          .map(([key]) => key)
          .sort()
      : [];
  return {
    before,
    after,
    added,
    removed,
    changed,
    kind: added.length + removed.length + changed.length === 0 ? "unchanged" : "changed",
    reason: null,
  };
};
const checkedCapture = (
  value: JobSourceCaptureDto,
  jobId: string,
  snapshotId: string,
  includeArchived: boolean,
  now: string,
): JobSourceCaptureDto => {
  if (
    value.jobId !== jobId ||
    value.snapshotId !== snapshotId ||
    value.includeArchived !== includeArchived ||
    value.asOf !== now ||
    !/^[a-f0-9]{64}$/u.test(value.contentHash)
  )
    throw new TypeError();
  instant(value.capturedAt);
  if (value.capture === null) {
    if (value.availability !== "not_retained") throw new TypeError();
    return value;
  }
  const parsed = safeParseCaptureEnvelope(value.capture);
  if (
    !parsed.success ||
    value.availability !== "retained" ||
    parsed.data.capturedAt !== value.capturedAt ||
    parsed.data.contentHash !== value.contentHash
  )
    throw new TypeError();
  return { ...value, capture: parsed.data };
};
export const createJobSourceComparisonQuery = (dependencies: JobSourceComparisonDependencies) =>
  defineQuery<CompareJobSourceSnapshotsInput, JobSourceComparisonDto>(
    "CompareJobSourceSnapshotsQuery",
    async (request, context) => {
      let jobId: string;
      let baselineSnapshotId: string;
      let currentSnapshotId: string;
      let includeArchived: boolean;
      let now: string;
      try {
        const raw = object(request);
        if (
          Object.keys(raw).some(
            (key) =>
              !["jobId", "baselineSnapshotId", "currentSnapshotId", "includeArchived"].includes(
                key,
              ),
          )
        )
          throw new TypeError();
        jobId = entityId("job", raw["jobId"] as string);
        baselineSnapshotId = entityId("source-snapshot", raw["baselineSnapshotId"] as string);
        currentSnapshotId = entityId("source-snapshot", raw["currentSnapshotId"] as string);
        if (
          baselineSnapshotId === currentSnapshotId ||
          (raw["includeArchived"] !== undefined && typeof raw["includeArchived"] !== "boolean")
        )
          throw new TypeError();
        includeArchived = raw["includeArchived"] === true;
        now = instant(context.initiatedAt);
      } catch {
        return applicationFailure({
          code: "validation",
          message: "Choose two distinct retained snapshots in chronological order.",
          retryable: false,
        });
      }
      const results = await Promise.allSettled(
        [baselineSnapshotId, currentSnapshotId].map((snapshotId) =>
          Promise.resolve().then(() =>
            dependencies.readCapture({ jobId, snapshotId, includeArchived }, context),
          ),
        ),
      );
      const values: JobSourceCaptureDto[] = [];
      for (const result of results) {
        if (result.status !== "fulfilled" || !result.value.ok)
          return applicationFailure({
            code:
              result.status === "fulfilled" &&
              !result.value.ok &&
              result.value.error.code === "not_found"
                ? "not_found"
                : "unavailable",
            message:
              "Local comparison evidence could not be read. Reload the selected snapshots and retry.",
            retryable: true,
          });
        values.push(result.value.value);
      }
      try {
        const baselineValue = values[0];
        const currentValue = values[1];
        if (baselineValue === undefined || currentValue === undefined) throw new TypeError();
        const baseline = checkedCapture(
          baselineValue,
          jobId,
          baselineSnapshotId,
          includeArchived,
          now,
        );
        const current = checkedCapture(
          currentValue,
          jobId,
          currentSnapshotId,
          includeArchived,
          now,
        );
        if (baseline.capturedAt >= current.capturedAt)
          return applicationFailure({
            code: "validation",
            message:
              "The baseline must have an earlier capture time; equal capture instants cannot establish change order.",
            retryable: false,
          });
        const before = project(baseline, dependencies.analyze);
        const after = project(current, dependencies.analyze);
        return applicationSuccess(
          freeze({
            specVersion: 1 as const,
            jobId,
            baselineSnapshotId,
            currentSnapshotId,
            baselineCapturedAt: baseline.capturedAt,
            currentCapturedAt: current.capturedAt,
            baselineEnvelopeId: baseline.capture?.id ?? null,
            currentEnvelopeId: current.capture?.id ?? null,
            analyzedAt: now,
            analysis: RETAINED_LISTING_ANALYSIS_V1,
            fields: {
              requirements: difference("requirements", before.requirements, after.requirements),
              compensation: difference("compensation", before.compensation, after.compensation),
              deadline: difference("deadline", before.deadline, after.deadline),
              locations: difference("locations", before.locations, after.locations),
            },
            content: {
              kind:
                baseline.contentHash === current.contentHash
                  ? ("unchanged" as const)
                  : ("changed" as const),
              beforeHash: baseline.contentHash,
              afterHash: current.contentHash,
            },
            refreshPerformed: false as const,
            trustedFieldMutationPerformed: false as const,
          }),
        );
      } catch {
        return applicationFailure({
          code: "internal",
          message:
            "Retained listing analysis did not pass validation. Saved jobs and sources are unchanged.",
          retryable: false,
        });
      }
    },
  );
