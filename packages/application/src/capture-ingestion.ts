import { safeParseCaptureEnvelope, type CaptureEnvelopeV1 } from "@coredrill/contracts";
import { entityId, type EntityId } from "@coredrill/domain";

export const CAPTURE_DUPLICATE_LIMITS = Object.freeze({
  maxCandidates: 10_000,
  maxSourcesPerCandidate: 256,
  maxContentHashesPerSource: 256,
  maxSuggestions: 20,
  minimumTitleSimilarity: 0.75,
  minimumCompanySimilarity: 0.8,
});

export const CAPTURE_DUPLICATE_REASONS = [
  "source_id",
  "canonical_url",
  "content_hash",
  "fuzzy_title_company",
] as const;

export type CaptureDuplicateReason = (typeof CAPTURE_DUPLICATE_REASONS)[number];

export interface CaptureDuplicateSourceCandidateV1 {
  readonly sourceKind: string | null;
  readonly externalId: string | null;
  readonly canonicalUrl: string | null;
  readonly contentHashes: readonly string[];
}

export interface CaptureDuplicateJobCandidateV1 {
  readonly jobId: string;
  readonly title: string;
  readonly companyName: string | null;
  readonly sources: readonly CaptureDuplicateSourceCandidateV1[];
}

export interface CaptureDuplicateSimilarityV1 {
  readonly title: number;
  readonly company: number;
}

export interface CaptureDuplicateSuggestionV1 {
  readonly jobId: EntityId<"job">;
  readonly reasons: readonly CaptureDuplicateReason[];
  readonly similarity: CaptureDuplicateSimilarityV1 | null;
}

export const CAPTURE_INGESTION_ERROR_CODES = [
  "capture_invalid",
  "candidate_invalid",
  "candidate_limit_exceeded",
] as const;
export type CaptureIngestionErrorCode = (typeof CAPTURE_INGESTION_ERROR_CODES)[number];

/** Content-free failure for untrusted capture or durable candidate data. */
export class CaptureIngestionError extends Error {
  public constructor(public readonly code: CaptureIngestionErrorCode) {
    super("Capture duplicate analysis rejected invalid input.");
    this.name = "CaptureIngestionError";
  }
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const TITLE_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  dev: "developer",
  eng: "engineer",
  engineering: "engineer",
  jr: "junior",
  sr: "senior",
});
const COMPANY_SUFFIXES = new Set([
  "co",
  "company",
  "corp",
  "corporation",
  "inc",
  "incorporated",
  "limited",
  "llc",
  "ltd",
  "plc",
]);

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.charCodeAt(0);
    if (codePoint <= 0x1f || codePoint === 0x7f) return true;
  }
  return false;
}

function requireNullableText(value: unknown, maximum: number): string | null {
  if (value === null) return null;
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximum ||
    hasControlCharacter(value) ||
    value.trim().length === 0
  ) {
    throw new CaptureIngestionError("candidate_invalid");
  }
  return value;
}

function normalizedCanonicalUrl(value: string | null): string | null {
  if (value === null) return null;
  try {
    const parsed = new URL(value);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.username !== "" ||
      parsed.password !== ""
    ) {
      throw new TypeError("Unsafe URL.");
    }
    parsed.hash = "";
    return parsed.toString();
  } catch {
    throw new CaptureIngestionError("candidate_invalid");
  }
}

function normalizedTokens(value: string, kind: "title" | "company"): readonly string[] {
  const rawTokens = value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replaceAll("&", " and ")
    .replaceAll(/[\p{P}\p{S}]+/gu, " ")
    .trim()
    .split(/\s+/u)
    .filter((token) => token.length > 0)
    .map((token) => (kind === "title" ? (TITLE_ALIASES[token] ?? token) : token));
  const withoutSuffixes =
    kind === "company" ? rawTokens.filter((token) => !COMPANY_SUFFIXES.has(token)) : rawTokens;
  return Object.freeze(withoutSuffixes.length > 0 ? withoutSuffixes : rawTokens);
}

function tokenDice(left: string, right: string, kind: "title" | "company"): number {
  const leftTokens = new Set(normalizedTokens(left, kind));
  const rightTokens = new Set(normalizedTokens(right, kind));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let intersection = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) intersection += 1;
  return Math.round(((2 * intersection) / (leftTokens.size + rightTokens.size)) * 10_000) / 10_000;
}

function captureValues(envelope: CaptureEnvelopeV1, fieldName: "title" | "company"): string[] {
  return [
    ...new Set(
      envelope.fieldCandidates
        .filter(
          (candidate) => candidate.fieldName === fieldName && typeof candidate.value === "string",
        )
        .map((candidate) => candidate.value as string),
    ),
  ];
}

function bestSimilarity(
  incoming: readonly string[],
  existing: string | null,
  kind: "title" | "company",
): number {
  if (existing === null) return 0;
  let best = 0;
  for (const value of incoming) best = Math.max(best, tokenDice(value, existing, kind));
  return best;
}

function parseCandidate(input: CaptureDuplicateJobCandidateV1): CaptureDuplicateJobCandidateV1 {
  const untrusted = input as unknown;
  if (typeof untrusted !== "object" || untrusted === null || Array.isArray(untrusted)) {
    throw new CaptureIngestionError("candidate_invalid");
  }
  const candidate = untrusted as Record<string, unknown>;
  let jobId: EntityId<"job">;
  try {
    jobId = entityId("job", candidate["jobId"] as string);
  } catch {
    throw new CaptureIngestionError("candidate_invalid");
  }
  const title = requireNullableText(candidate["title"], 1024);
  const companyName = requireNullableText(candidate["companyName"], 1024);
  const sources = candidate["sources"];
  if (
    title === null ||
    !Array.isArray(sources) ||
    sources.length > CAPTURE_DUPLICATE_LIMITS.maxSourcesPerCandidate
  ) {
    throw new CaptureIngestionError("candidate_invalid");
  }

  const parsedSources = sources.map((sourceInput) => {
    if (typeof sourceInput !== "object" || sourceInput === null || Array.isArray(sourceInput)) {
      throw new CaptureIngestionError("candidate_invalid");
    }
    const source = sourceInput as Record<string, unknown>;
    const contentHashes = source["contentHashes"];
    if (
      !Array.isArray(contentHashes) ||
      contentHashes.length > CAPTURE_DUPLICATE_LIMITS.maxContentHashesPerSource ||
      !contentHashes.every((hash) => typeof hash === "string" && SHA256_PATTERN.test(hash))
    ) {
      throw new CaptureIngestionError("candidate_invalid");
    }
    return Object.freeze({
      sourceKind: requireNullableText(source["sourceKind"], 128),
      externalId: requireNullableText(source["externalId"], 1024),
      canonicalUrl: normalizedCanonicalUrl(requireNullableText(source["canonicalUrl"], 8192)),
      contentHashes: Object.freeze([...new Set(contentHashes)]),
    });
  });
  return Object.freeze({ jobId, title, companyName, sources: Object.freeze(parsedSources) });
}

function rankFor(reasons: readonly CaptureDuplicateReason[]): number {
  if (reasons.includes("source_id")) return 4;
  if (reasons.includes("canonical_url")) return 3;
  if (reasons.includes("content_hash")) return 2;
  return 1;
}

/**
 * Produces explainable duplicate suggestions only. It never merges, mutates,
 * confirms, or promotes a captured field into a trusted job record.
 */
export function findCaptureDuplicateSuggestionsV1(
  envelopeInput: unknown,
  candidateInputs: readonly CaptureDuplicateJobCandidateV1[],
): readonly CaptureDuplicateSuggestionV1[] {
  const parsedEnvelope = safeParseCaptureEnvelope(envelopeInput);
  if (!parsedEnvelope.success) throw new CaptureIngestionError("capture_invalid");
  if (!Array.isArray(candidateInputs)) throw new CaptureIngestionError("candidate_invalid");
  if (candidateInputs.length > CAPTURE_DUPLICATE_LIMITS.maxCandidates) {
    throw new CaptureIngestionError("candidate_limit_exceeded");
  }

  const candidates = candidateInputs.map(parseCandidate);
  if (new Set(candidates.map((candidate) => candidate.jobId)).size !== candidates.length) {
    throw new CaptureIngestionError("candidate_invalid");
  }

  const envelope = parsedEnvelope.data;
  const incomingSourceKind = envelope.source.sourceKind ?? null;
  const incomingExternalId = envelope.source.externalId ?? null;
  const incomingCanonicalUrl =
    envelope.source.canonicalUrl === undefined
      ? null
      : normalizedCanonicalUrl(envelope.source.canonicalUrl);
  const incomingTitles = captureValues(envelope, "title");
  const incomingCompanies = captureValues(envelope, "company");

  const suggestions: CaptureDuplicateSuggestionV1[] = [];
  for (const candidate of candidates) {
    const reasons: CaptureDuplicateReason[] = [];
    if (
      incomingSourceKind !== null &&
      incomingExternalId !== null &&
      candidate.sources.some(
        (source) =>
          source.sourceKind === incomingSourceKind && source.externalId === incomingExternalId,
      )
    ) {
      reasons.push("source_id");
    }
    if (
      incomingCanonicalUrl !== null &&
      candidate.sources.some((source) => source.canonicalUrl === incomingCanonicalUrl)
    ) {
      reasons.push("canonical_url");
    }
    if (candidate.sources.some((source) => source.contentHashes.includes(envelope.contentHash))) {
      reasons.push("content_hash");
    }

    const titleSimilarity = bestSimilarity(incomingTitles, candidate.title, "title");
    const companySimilarity = bestSimilarity(incomingCompanies, candidate.companyName, "company");
    const fuzzy =
      titleSimilarity >= CAPTURE_DUPLICATE_LIMITS.minimumTitleSimilarity &&
      companySimilarity >= CAPTURE_DUPLICATE_LIMITS.minimumCompanySimilarity;
    if (fuzzy) reasons.push("fuzzy_title_company");
    if (reasons.length === 0) continue;

    suggestions.push(
      Object.freeze({
        jobId: entityId("job", candidate.jobId),
        reasons: Object.freeze(reasons),
        similarity: fuzzy
          ? Object.freeze({ title: titleSimilarity, company: companySimilarity })
          : null,
      }),
    );
  }

  return Object.freeze(
    suggestions
      .sort((left, right) => {
        const rankDifference = rankFor(right.reasons) - rankFor(left.reasons);
        if (rankDifference !== 0) return rankDifference;
        const reasonDifference = right.reasons.length - left.reasons.length;
        if (reasonDifference !== 0) return reasonDifference;
        const leftSimilarity = left.similarity?.title ?? 0;
        const rightSimilarity = right.similarity?.title ?? 0;
        if (leftSimilarity !== rightSimilarity) return rightSimilarity - leftSimilarity;
        return left.jobId.localeCompare(right.jobId);
      })
      .slice(0, CAPTURE_DUPLICATE_LIMITS.maxSuggestions),
  );
}
