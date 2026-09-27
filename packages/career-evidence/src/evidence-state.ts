import { sourceReference, type SourceReference } from "@coredrill/domain";

export const CAREER_EVIDENCE_VERIFICATION_STATES = Object.freeze([
  "imported",
  "user_confirmed",
  "source_backed",
  "stale",
  "disputed",
] as const);

export type CareerEvidenceVerificationState = (typeof CAREER_EVIDENCE_VERIFICATION_STATES)[number];

export type CareerPrivacyTag = string & { readonly __brand: "career-privacy-tag" };

export interface CareerEvidenceState {
  readonly source: SourceReference | null;
  readonly verificationState: CareerEvidenceVerificationState;
  readonly privacyTags: readonly CareerPrivacyTag[];
}

export interface CareerEvidenceStateInput {
  readonly source: SourceReference | null;
  readonly verificationState: CareerEvidenceVerificationState;
  readonly privacyTags?: readonly string[];
}

export const CAREER_EVIDENCE_STATE_LIMITS = Object.freeze({
  maxPrivacyTagLength: 64,
  maxPrivacyTags: 16,
});

const PRIVACY_TAG_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;
const VERIFICATION_STATES = new Set<string>(CAREER_EVIDENCE_VERIFICATION_STATES);

export const careerPrivacyTag = (value: string): CareerPrivacyTag => {
  if (
    value.length > CAREER_EVIDENCE_STATE_LIMITS.maxPrivacyTagLength ||
    !PRIVACY_TAG_PATTERN.test(value)
  ) {
    throw new TypeError(
      "Career privacy tags must be lowercase content-free identifiers of at most 64 characters.",
    );
  }
  return value as CareerPrivacyTag;
};

const normalizeSource = (value: SourceReference | null): SourceReference | null => {
  if (value === null) return null;
  return sourceReference({
    sourceType: value.sourceType,
    sourceId: value.sourceId,
    ...(value.pointer === undefined ? {} : { pointer: value.pointer }),
  });
};

const normalizePrivacyTags = (
  values: readonly string[] | undefined,
): readonly CareerPrivacyTag[] => {
  if (values === undefined) return Object.freeze([]);
  if (values.length > CAREER_EVIDENCE_STATE_LIMITS.maxPrivacyTags) {
    throw new TypeError("Career evidence has too many privacy tags.");
  }
  const normalized = values.map(careerPrivacyTag);
  if (new Set(normalized).size !== normalized.length) {
    throw new TypeError("Career privacy tags cannot contain duplicates.");
  }
  return Object.freeze([...normalized].sort());
};

export const createCareerEvidenceState = (input: CareerEvidenceStateInput): CareerEvidenceState => {
  if (!VERIFICATION_STATES.has(input.verificationState)) {
    throw new TypeError("Career evidence verification state is invalid.");
  }

  const source = normalizeSource(input.source);
  if (input.verificationState === "source_backed" && source === null) {
    throw new TypeError("Source-backed career evidence requires a durable source reference.");
  }

  return Object.freeze({
    source,
    verificationState: input.verificationState,
    privacyTags: normalizePrivacyTags(input.privacyTags),
  });
};

export const transitionCareerEvidenceVerification = (
  current: CareerEvidenceState,
  verificationState: CareerEvidenceVerificationState,
): CareerEvidenceState =>
  createCareerEvidenceState({
    source: current.source,
    verificationState,
    privacyTags: current.privacyTags,
  });

export const markCareerEvidenceStale = (current: CareerEvidenceState): CareerEvidenceState =>
  transitionCareerEvidenceVerification(current, "stale");

/**
 * This is a conservative default for later prompt/context selection. Evidence
 * still requires an explicit user action before any provider receives it.
 */
export const isCareerEvidenceEligibleForExternalContext = (state: CareerEvidenceState): boolean =>
  state.privacyTags.length === 0 &&
  (state.verificationState === "user_confirmed" || state.verificationState === "source_backed");
