import {
  confidence,
  entityId,
  jobRequirementCategory,
  type Confidence,
  type EntityId,
  type JobRequirementCategory,
} from "@coredrill/domain";

export const JOB_REQUIREMENT_PARSE_SPEC_VERSION = 1 as const;

export const JOB_REQUIREMENT_PARSE_LIMITS = Object.freeze({
  maxBlocks: 512,
  maxProposals: 256,
  maxTextCharacters: 16_384,
  maxSourceExcerptCharacters: 4_096,
  maxSourcePointerCharacters: 2_048,
});

export const JOB_REQUIREMENT_SOURCE_BLOCK_KINDS = Object.freeze([
  "heading",
  "item",
  "paragraph",
] as const);
export type JobRequirementSourceBlockKind = (typeof JOB_REQUIREMENT_SOURCE_BLOCK_KINDS)[number];

export interface JobRequirementSourceBlockInput {
  readonly kind: JobRequirementSourceBlockKind;
  readonly provenanceId: string;
  readonly sourceExcerpt: string;
  readonly sourcePointer: string;
  readonly text: string;
}

export interface ParseJobRequirementsInput {
  readonly blocks: readonly JobRequirementSourceBlockInput[];
  readonly jobId: string;
}

export interface JobRequirementProposalDto {
  readonly category: JobRequirementCategory;
  readonly confidence: Confidence;
  readonly evidenceStatus: "proposal";
  readonly id: string;
  readonly jobId: EntityId<"job">;
  readonly normalizedText: string;
  readonly provenanceId: EntityId<"provenance">;
  readonly rawText: string;
  readonly reviewState: "pending";
  readonly sortOrder: number;
  readonly sourceCategory: JobRequirementCategory;
  readonly sourceExcerpt: string;
  readonly sourcePointer: string;
}

export interface JobRequirementParseResultDto {
  readonly jobId: EntityId<"job">;
  readonly proposals: readonly JobRequirementProposalDto[];
  readonly specVersion: 1;
}

const HEADING_CATEGORIES: Readonly<Record<string, JobRequirementCategory>> = Object.freeze({
  "about the role": "context",
  "about the team": "context",
  "basic qualifications": "required",
  bonus: "desired",
  constraints: "constraint",
  duties: "responsibility",
  eligibility: "constraint",
  "key responsibilities": "responsibility",
  "location and schedule": "constraint",
  "minimum qualifications": "required",
  "must have": "required",
  "nice to have": "desired",
  overview: "context",
  preferred: "desired",
  "preferred qualifications": "desired",
  qualifications: "required",
  requirements: "required",
  responsibilities: "responsibility",
  "role overview": "context",
  travel: "constraint",
  "what we are looking for": "required",
  "what we’re looking for": "required",
  "what you bring": "required",
  "what you will do": "responsibility",
  "what you’ll do": "responsibility",
  "work authorization": "constraint",
  "working conditions": "constraint",
});

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const exactText = (value: unknown, maximum: number): string => {
  if (
    typeof value !== "string" ||
    value.includes("\u0000") ||
    value.length > maximum ||
    value.trim().length === 0
  ) {
    throw new TypeError("Requirement source text is invalid.");
  }
  return value;
};

const boundedText = (value: unknown, maximum: number): string => exactText(value, maximum).trim();

const headingKey = (value: string): string =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[.:]+$/u, "")
    .replaceAll(/\s+/gu, " ")
    .trim();

const withoutListMarker = (value: string): string =>
  value.replace(/^\s*(?:(?:[-*•‣▪◦])|(?:\d{1,3}[.)]))\s+/u, "").trim();

const normalizedMeaning = (value: string): string => {
  const withoutMarker = withoutListMarker(value);
  const withoutPrefix = withoutMarker.replace(
    /^(?:(?:required|preferred|desired|minimum qualification|nice to have)\s*:\s*|(?:you will|you’ll|responsible for|responsibilities include)\s+)/iu,
    "",
  );
  return withoutPrefix.replaceAll(/\s+/gu, " ").trim();
};

interface Classification {
  readonly category: JobRequirementCategory;
  readonly confidence: Confidence;
}

const classificationFromText = (value: string): Classification | null => {
  const text = headingKey(withoutListMarker(value));
  if (
    /\b(?:background check|clearance|driver['’]s license|hybrid|location|on[- ]site|schedule|shift|travel|visa sponsorship|work authorization)\b/iu.test(
      text,
    ) ||
    /^(?:authorized to work|must be authorized to work|must reside|must be located)\b/iu.test(text)
  ) {
    return { category: "constraint", confidence: confidence(0.9) };
  }
  if (/^(?:bonus|desired|nice to have|preferred|a plus)\b/iu.test(text)) {
    return { category: "desired", confidence: confidence(0.88) };
  }
  if (
    /^(?:you will|you’ll|responsible for|responsibilities include|duties include)\b/iu.test(text)
  ) {
    return { category: "responsibility", confidence: confidence(0.86) };
  }
  if (/^(?:minimum|required|must|need to)\b/iu.test(text)) {
    return { category: "required", confidence: confidence(0.88) };
  }
  return null;
};

const proposalId = (blockIndex: number): string => `requirement-proposal-${String(blockIndex + 1)}`;

const copyProposal = (value: JobRequirementProposalDto): JobRequirementProposalDto =>
  Object.freeze({ ...value });

export const parseJobRequirementProposals = (
  input: ParseJobRequirementsInput,
): JobRequirementParseResultDto => {
  if (!isRecord(input) || !Array.isArray(input.blocks)) {
    throw new TypeError("Requirement parsing input is invalid.");
  }
  if (input.blocks.length > JOB_REQUIREMENT_PARSE_LIMITS.maxBlocks) {
    throw new TypeError("Requirement parsing input has too many blocks.");
  }

  const jobId = entityId("job", input.jobId);
  const proposals: JobRequirementProposalDto[] = [];
  const seen = new Set<string>();
  let sectionCategory: JobRequirementCategory | null = null;

  input.blocks.forEach((candidate, blockIndex) => {
    if (!isRecord(candidate)) {
      throw new TypeError("Requirement source block is invalid.");
    }
    const kind = candidate["kind"];
    if (!JOB_REQUIREMENT_SOURCE_BLOCK_KINDS.includes(kind as JobRequirementSourceBlockKind)) {
      throw new TypeError("Requirement source block is invalid.");
    }
    const text = boundedText(candidate["text"], JOB_REQUIREMENT_PARSE_LIMITS.maxTextCharacters);
    const sourcePointer = exactText(
      candidate["sourcePointer"],
      JOB_REQUIREMENT_PARSE_LIMITS.maxSourcePointerCharacters,
    );
    const sourceExcerpt = exactText(
      candidate["sourceExcerpt"],
      JOB_REQUIREMENT_PARSE_LIMITS.maxSourceExcerptCharacters,
    );
    const provenanceId = entityId("provenance", candidate["provenanceId"] as string);

    if (kind === "heading") {
      sectionCategory = HEADING_CATEGORIES[headingKey(text)] ?? null;
      return;
    }

    const explicit = classificationFromText(text);
    const classification =
      explicit ??
      (sectionCategory === null
        ? kind === "item"
          ? { category: "required" as const, confidence: confidence(0.55) }
          : null
        : { category: sectionCategory, confidence: confidence(0.82) });
    if (classification === null) return;

    const normalizedText = normalizedMeaning(text);
    if (normalizedText.length === 0 || normalizedText.length > 4_096) {
      throw new TypeError("Normalized requirement text is invalid.");
    }
    const duplicateKey = normalizedText.normalize("NFKC").toLocaleLowerCase("en-US");
    if (seen.has(duplicateKey)) return;
    seen.add(duplicateKey);
    if (proposals.length >= JOB_REQUIREMENT_PARSE_LIMITS.maxProposals) {
      throw new TypeError("Requirement parsing produced too many proposals.");
    }
    const category = jobRequirementCategory(classification.category);
    proposals.push(
      copyProposal({
        category,
        confidence: classification.confidence,
        evidenceStatus: "proposal",
        id: proposalId(blockIndex),
        jobId,
        normalizedText,
        provenanceId,
        rawText: text,
        reviewState: "pending",
        sortOrder: proposals.length,
        sourceCategory: category,
        sourceExcerpt,
        sourcePointer,
      }),
    );
  });

  return Object.freeze({
    jobId,
    proposals: Object.freeze(proposals),
    specVersion: JOB_REQUIREMENT_PARSE_SPEC_VERSION,
  });
};

export const validateJobRequirementProposal = (value: unknown): JobRequirementProposalDto => {
  if (
    !isRecord(value) ||
    value["evidenceStatus"] !== "proposal" ||
    value["reviewState"] !== "pending" ||
    typeof value["id"] !== "string" ||
    !/^requirement-proposal-[1-9]\d*$/u.test(value["id"]) ||
    !Number.isSafeInteger(value["sortOrder"]) ||
    (value["sortOrder"] as number) < 0
  ) {
    throw new TypeError("Requirement proposal is invalid.");
  }
  const normalizedText = boundedText(value["normalizedText"], 4_096);
  const rawText = boundedText(value["rawText"], JOB_REQUIREMENT_PARSE_LIMITS.maxTextCharacters);
  const sourceExcerpt = exactText(
    value["sourceExcerpt"],
    JOB_REQUIREMENT_PARSE_LIMITS.maxSourceExcerptCharacters,
  );
  const sourcePointer = exactText(
    value["sourcePointer"],
    JOB_REQUIREMENT_PARSE_LIMITS.maxSourcePointerCharacters,
  );
  return copyProposal({
    category: jobRequirementCategory(value["category"] as string),
    confidence: confidence(value["confidence"] as number),
    evidenceStatus: "proposal",
    id: value["id"],
    jobId: entityId("job", value["jobId"] as string),
    normalizedText,
    provenanceId: entityId("provenance", value["provenanceId"] as string),
    rawText,
    reviewState: "pending",
    sortOrder: value["sortOrder"] as number,
    sourceCategory: jobRequirementCategory(value["sourceCategory"] as string),
    sourceExcerpt,
    sourcePointer,
  });
};
