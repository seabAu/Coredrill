import {
  documentIrToPlainText,
  normalizeDocumentIr,
  type DocumentBlock,
  type DocumentIntermediateRepresentationV1,
} from "./document-ir.js";

export const DETERMINISTIC_TEMPLATE_ENGINE_VERSION = "deterministic-template-engine-v1" as const;
export const COVER_LETTER_TEMPLATE_ID = "cover-letter-template-v1" as const;
export const APPLICATION_ANSWER_TEMPLATE_ID = "application-answer-template-v1" as const;

export const DRAFTABLE_APPLICATION_QUESTION_KINDS = Object.freeze([
  "experience-evidence",
  "motivation-company",
  "behavioral-star",
] as const);
export type DraftableApplicationQuestionKind =
  (typeof DRAFTABLE_APPLICATION_QUESTION_KINDS)[number];

export const DETERMINISTIC_TEMPLATE_EVIDENCE_KINDS = Object.freeze([
  "employment",
  "education",
  "project",
  "skill",
  "accomplishment",
  "certification",
  "publication",
  "volunteer",
  "story",
] as const);
export type DeterministicTemplateEvidenceKind =
  (typeof DETERMINISTIC_TEMPLATE_EVIDENCE_KINDS)[number];

export const TEMPLATE_EVIDENCE_VERIFICATION_STATES = Object.freeze([
  "disputed",
  "imported",
  "source_backed",
  "stale",
  "user_confirmed",
] as const);
export type TemplateEvidenceVerificationState =
  (typeof TEMPLATE_EVIDENCE_VERIFICATION_STATES)[number];

export interface DeterministicTemplateJobInput {
  readonly companyName: string;
  readonly id: string;
  readonly title: string;
}

export interface DeterministicTemplateSourceVersionInput {
  readonly contentHash: string;
  readonly documentId: string;
  readonly versionId: string;
  readonly versionNumber: number;
}

export interface DeterministicTemplateEvidenceInput {
  readonly evidenceId: string;
  readonly evidenceKind: DeterministicTemplateEvidenceKind;
  readonly label: string;
  readonly privacyTags: readonly string[];
  readonly requirementIds: readonly string[];
  readonly sourceVersion?: DeterministicTemplateSourceVersionInput | null;
  readonly story?: {
    readonly action: string;
    readonly result: string;
    readonly situation: string;
  } | null;
  readonly summary: string;
  readonly updatedAt: string;
  readonly verificationState: TemplateEvidenceVerificationState;
}

export interface DeterministicTemplateRequirementInput {
  readonly id: string;
  readonly sortOrder: number;
  readonly text: string;
}

export interface DeterministicTemplateContextInput {
  readonly evidence: readonly DeterministicTemplateEvidenceInput[];
  readonly job: DeterministicTemplateJobInput;
  readonly requirements: readonly DeterministicTemplateRequirementInput[];
}

export type DeterministicTemplateExclusionReason =
  "duplicate" | "missing-story-structure" | "not-reviewed" | "private";

export interface DeterministicTemplateExclusion {
  readonly evidenceId: string;
  readonly evidenceKind: DeterministicTemplateEvidenceKind;
  readonly reason: DeterministicTemplateExclusionReason;
}

export interface DeterministicTemplateEvidenceReference {
  readonly evidenceId: string;
  readonly evidenceKind: DeterministicTemplateEvidenceKind;
  readonly requirementIds: readonly string[];
  readonly sourceVersion: DeterministicTemplateSourceVersionInput | null;
  readonly updatedAt: string;
  readonly verificationState: "source_backed" | "user_confirmed";
}

export interface DeterministicTemplateContextManifest {
  readonly evidence: readonly DeterministicTemplateEvidenceReference[];
  readonly jobId: string;
  readonly requirementIds: readonly string[];
}

export type DeterministicTemplateSectionSupport =
  | {
      readonly kind: "job-context";
      readonly jobId: string;
    }
  | {
      readonly evidenceIds: readonly string[];
      readonly kind: "selected-evidence";
      readonly requirementIds: readonly string[];
    }
  | {
      readonly kind: "style-only";
    };

export interface DeterministicTemplateSection {
  readonly kind: "answer" | "closing" | "evidence" | "opening" | "salutation";
  readonly support: DeterministicTemplateSectionSupport;
  readonly text: string;
}

export interface DeterministicTemplateDraft {
  readonly content: DocumentIntermediateRepresentationV1;
  readonly context: DeterministicTemplateContextManifest;
  readonly engineVersion: typeof DETERMINISTIC_TEMPLATE_ENGINE_VERSION;
  readonly exclusions: readonly DeterministicTemplateExclusion[];
  readonly plainText: string;
  readonly sections: readonly DeterministicTemplateSection[];
  readonly templateId: typeof APPLICATION_ANSWER_TEMPLATE_ID | typeof COVER_LETTER_TEMPLATE_ID;
  readonly templateVersion: 1;
}

export interface DeterministicTemplateInsufficientEvidence {
  readonly context: DeterministicTemplateContextManifest;
  readonly engineVersion: typeof DETERMINISTIC_TEMPLATE_ENGINE_VERSION;
  readonly exclusions: readonly DeterministicTemplateExclusion[];
  readonly reason: "no-reviewed-selected-evidence" | "no-reviewed-selected-story";
  readonly status: "insufficient-evidence";
  readonly templateId: typeof APPLICATION_ANSWER_TEMPLATE_ID | typeof COVER_LETTER_TEMPLATE_ID;
  readonly templateVersion: 1;
}

export type DeterministicTemplateResult =
  | (DeterministicTemplateDraft & { readonly status: "drafted" })
  | DeterministicTemplateInsufficientEvidence;

const MAX_TEXT = 20_000;
const MAX_ITEMS = 100;
const SHA256 = /^[a-f0-9]{64}$/u;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

const deepFreeze = <T>(value: T): T => {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

const boundedText = (value: string, name: string): string => {
  if (typeof value !== "string") throw new TypeError(`${name} is invalid.`);
  const normalized = value.normalize("NFKC").replaceAll(/\s+/gu, " ").trim();
  if (normalized.length === 0 || normalized.length > MAX_TEXT) {
    throw new TypeError(`${name} is invalid.`);
  }
  return normalized;
};

const boundedId = (value: string, name: string): string => {
  const normalized = boundedText(value, name);
  if (normalized.length > 256) throw new TypeError(`${name} is invalid.`);
  return normalized;
};

const checkedInstant = (value: string, name: string): string => {
  if (typeof value !== "string" || !INSTANT.test(value) || Number.isNaN(Date.parse(value))) {
    throw new TypeError(`${name} is invalid.`);
  }
  return value;
};

const checkedArray = <T>(values: readonly T[], name: string): readonly T[] => {
  if (!Array.isArray(values) || values.length > MAX_ITEMS) {
    throw new TypeError(`${name} is invalid.`);
  }
  return values as readonly T[];
};

const normalizedStringList = (values: readonly string[], name: string): readonly string[] => {
  const checkedValues = checkedArray(values, name);
  return Object.freeze(
    [...new Set(checkedValues.map((value) => boundedId(value, name)))].sort((left, right) =>
      left.localeCompare(right),
    ),
  );
};

const paragraph = (text: string): DocumentBlock => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});

const bulletList = (items: readonly string[]): DocumentBlock => ({
  type: "bulletList",
  content: items.map((item) => ({
    type: "listItem",
    content: [{ type: "paragraph", content: [{ type: "text", text: item }] }],
  })),
});

interface NormalizedEvidence {
  readonly evidenceId: string;
  readonly evidenceKind: DeterministicTemplateEvidenceKind;
  readonly label: string;
  readonly requirementIds: readonly string[];
  readonly sourceVersion: DeterministicTemplateSourceVersionInput | null;
  readonly story: {
    readonly action: string;
    readonly result: string;
    readonly situation: string;
  } | null;
  readonly summary: string;
  readonly updatedAt: string;
  readonly verificationState: "source_backed" | "user_confirmed";
}

interface NormalizedContext {
  readonly eligibleEvidence: readonly NormalizedEvidence[];
  readonly exclusions: readonly DeterministicTemplateExclusion[];
  readonly job: DeterministicTemplateJobInput;
  readonly manifest: DeterministicTemplateContextManifest;
}

const sourceVersion = (
  value: DeterministicTemplateSourceVersionInput | null | undefined,
): DeterministicTemplateSourceVersionInput | null => {
  if (value === null || value === undefined) return null;
  const contentHash = boundedText(value.contentHash, "Source version content hash");
  if (!SHA256.test(contentHash)) throw new TypeError("Source version content hash is invalid.");
  if (!Number.isSafeInteger(value.versionNumber) || value.versionNumber < 1) {
    throw new TypeError("Source version number is invalid.");
  }
  return Object.freeze({
    contentHash,
    documentId: boundedId(value.documentId, "Source document ID"),
    versionId: boundedId(value.versionId, "Source version ID"),
    versionNumber: value.versionNumber,
  });
};

const normalizeContext = (input: DeterministicTemplateContextInput): NormalizedContext => {
  const inputRequirements = checkedArray(input.requirements, "Template requirements");
  const inputEvidence = checkedArray(input.evidence, "Template evidence");
  const job = Object.freeze({
    companyName: boundedText(input.job.companyName, "Company name"),
    id: boundedId(input.job.id, "Job ID"),
    title: boundedText(input.job.title, "Job title"),
  });
  const requirements = inputRequirements
    .map((requirement) => {
      if (!Number.isSafeInteger(requirement.sortOrder) || requirement.sortOrder < 0) {
        throw new TypeError("Requirement sort order is invalid.");
      }
      return Object.freeze({
        id: boundedId(requirement.id, "Requirement ID"),
        sortOrder: requirement.sortOrder,
        text: boundedText(requirement.text, "Requirement text"),
      });
    })
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));
  if (new Set(requirements.map(({ id }) => id)).size !== requirements.length) {
    throw new TypeError("Template requirement IDs must be unique.");
  }
  const requirementIds = Object.freeze(requirements.map(({ id }) => id));
  const requirementIdSet = new Set(requirementIds);
  const exclusions: DeterministicTemplateExclusion[] = [];
  const eligibleEvidence: NormalizedEvidence[] = [];
  const seenEvidence = new Set<string>();

  for (const evidence of inputEvidence) {
    const evidenceId = boundedId(evidence.evidenceId, "Evidence ID");
    const rawEvidenceKind = boundedId(evidence.evidenceKind, "Evidence kind");
    if (
      !DETERMINISTIC_TEMPLATE_EVIDENCE_KINDS.includes(
        rawEvidenceKind as DeterministicTemplateEvidenceKind,
      )
    ) {
      throw new TypeError("Evidence kind is invalid.");
    }
    const evidenceKind = rawEvidenceKind as DeterministicTemplateEvidenceKind;
    if (!TEMPLATE_EVIDENCE_VERIFICATION_STATES.includes(evidence.verificationState)) {
      throw new TypeError("Evidence verification state is invalid.");
    }
    const exclusion = (reason: DeterministicTemplateExclusionReason): void => {
      exclusions.push(Object.freeze({ evidenceId, evidenceKind, reason }));
    };
    const key = `${evidenceKind}:${evidenceId}`;
    if (seenEvidence.has(key)) {
      exclusion("duplicate");
      continue;
    }
    seenEvidence.add(key);
    const privacyTags = checkedArray(evidence.privacyTags, "Evidence privacy tags");
    if (privacyTags.length > 0) {
      privacyTags.forEach((tag) => boundedText(tag, "Evidence privacy tag"));
      exclusion("private");
      continue;
    }
    if (
      evidence.verificationState !== "source_backed" &&
      evidence.verificationState !== "user_confirmed"
    ) {
      exclusion("not-reviewed");
      continue;
    }
    const evidenceRequirementIds = normalizedStringList(
      evidence.requirementIds,
      "Evidence requirement ID",
    );
    if (
      evidenceRequirementIds.length === 0 ||
      evidenceRequirementIds.some((id) => !requirementIdSet.has(id))
    ) {
      throw new TypeError("Evidence requirement IDs are invalid.");
    }
    const story =
      evidence.story === null || evidence.story === undefined
        ? null
        : Object.freeze({
            action: boundedText(evidence.story.action, "Story action"),
            result: boundedText(evidence.story.result, "Story result"),
            situation: boundedText(evidence.story.situation, "Story situation"),
          });
    eligibleEvidence.push(
      Object.freeze({
        evidenceId,
        evidenceKind,
        label: boundedText(evidence.label, "Evidence label"),
        requirementIds: evidenceRequirementIds,
        sourceVersion: sourceVersion(evidence.sourceVersion),
        story,
        summary: boundedText(evidence.summary, "Evidence summary"),
        updatedAt: checkedInstant(evidence.updatedAt, "Evidence update time"),
        verificationState: evidence.verificationState,
      }),
    );
  }

  eligibleEvidence.sort(
    (left, right) =>
      Math.min(...left.requirementIds.map((id) => requirementIds.indexOf(id))) -
        Math.min(...right.requirementIds.map((id) => requirementIds.indexOf(id))) ||
      left.evidenceKind.localeCompare(right.evidenceKind) ||
      left.label.localeCompare(right.label) ||
      left.evidenceId.localeCompare(right.evidenceId),
  );
  exclusions.sort(
    (left, right) =>
      left.evidenceKind.localeCompare(right.evidenceKind) ||
      left.evidenceId.localeCompare(right.evidenceId) ||
      left.reason.localeCompare(right.reason),
  );
  const frozenEvidence = Object.freeze(eligibleEvidence);
  return Object.freeze({
    eligibleEvidence: frozenEvidence,
    exclusions: Object.freeze(exclusions),
    job,
    manifest: Object.freeze({
      evidence: Object.freeze(
        frozenEvidence.map((evidence) =>
          Object.freeze({
            evidenceId: evidence.evidenceId,
            evidenceKind: evidence.evidenceKind,
            requirementIds: evidence.requirementIds,
            sourceVersion: evidence.sourceVersion,
            updatedAt: evidence.updatedAt,
            verificationState: evidence.verificationState,
          }),
        ),
      ),
      jobId: job.id,
      requirementIds,
    }),
  });
};

const evidenceSupport = (
  evidence: readonly NormalizedEvidence[],
): DeterministicTemplateSectionSupport =>
  Object.freeze({
    evidenceIds: Object.freeze(evidence.map(({ evidenceId }) => evidenceId)),
    kind: "selected-evidence" as const,
    requirementIds: Object.freeze([
      ...new Set(evidence.flatMap(({ requirementIds }) => requirementIds)),
    ]),
  });

const drafted = (
  templateId: DeterministicTemplateDraft["templateId"],
  context: NormalizedContext,
  sections: readonly DeterministicTemplateSection[],
  blocks: readonly DocumentBlock[],
): DeterministicTemplateResult => {
  const content = deepFreeze(
    normalizeDocumentIr({
      specVersion: 1,
      document: { type: "doc", content: [...blocks] },
    }),
  );
  return Object.freeze({
    content,
    context: context.manifest,
    engineVersion: DETERMINISTIC_TEMPLATE_ENGINE_VERSION,
    exclusions: context.exclusions,
    plainText: documentIrToPlainText(content),
    sections: Object.freeze(sections),
    status: "drafted" as const,
    templateId,
    templateVersion: 1 as const,
  });
};

const insufficient = (
  templateId: DeterministicTemplateInsufficientEvidence["templateId"],
  context: NormalizedContext,
  reason: DeterministicTemplateInsufficientEvidence["reason"],
  exclusions: readonly DeterministicTemplateExclusion[] = context.exclusions,
): DeterministicTemplateInsufficientEvidence =>
  Object.freeze({
    context: context.manifest,
    engineVersion: DETERMINISTIC_TEMPLATE_ENGINE_VERSION,
    exclusions,
    reason,
    status: "insufficient-evidence" as const,
    templateId,
    templateVersion: 1 as const,
  });

export const renderDeterministicCoverLetterTemplate = (
  input: DeterministicTemplateContextInput,
): DeterministicTemplateResult => {
  const context = normalizeContext(input);
  if (context.eligibleEvidence.length === 0) {
    return insufficient(COVER_LETTER_TEMPLATE_ID, context, "no-reviewed-selected-evidence");
  }
  const evidenceLines = context.eligibleEvidence.map(
    ({ label, summary }) => `${label}: ${summary}`,
  );
  const sections = Object.freeze([
    Object.freeze({
      kind: "salutation" as const,
      support: Object.freeze({ kind: "style-only" as const }),
      text: "Dear Hiring Team,",
    }),
    Object.freeze({
      kind: "opening" as const,
      support: Object.freeze({ kind: "job-context" as const, jobId: context.job.id }),
      text: `I am applying for the ${context.job.title} role at ${context.job.companyName}.`,
    }),
    Object.freeze({
      kind: "evidence" as const,
      support: evidenceSupport(context.eligibleEvidence),
      text: [
        "My relevant selected evidence includes:",
        ...evidenceLines.map((line) => `- ${line}`),
      ].join("\n"),
    }),
    Object.freeze({
      kind: "closing" as const,
      support: Object.freeze({ kind: "style-only" as const }),
      text: "I would welcome the opportunity to discuss how this experience could support the role.",
    }),
  ]);
  return drafted(COVER_LETTER_TEMPLATE_ID, context, sections, [
    paragraph("Dear Hiring Team,"),
    paragraph(`I am applying for the ${context.job.title} role at ${context.job.companyName}.`),
    paragraph("My relevant selected evidence includes:"),
    bulletList(evidenceLines),
    paragraph(
      "I would welcome the opportunity to discuss how this experience could support the role.",
    ),
  ]);
};

export const renderDeterministicApplicationAnswerTemplate = (input: {
  readonly context: DeterministicTemplateContextInput;
  readonly questionKind: DraftableApplicationQuestionKind;
  readonly questionText: string;
}): DeterministicTemplateResult => {
  const questionText = boundedText(input.questionText, "Application question");
  const context = normalizeContext(input.context);
  if (!DRAFTABLE_APPLICATION_QUESTION_KINDS.includes(input.questionKind)) {
    throw new TypeError("Application question kind is not draftable.");
  }
  if (input.questionKind === "behavioral-star") {
    const story = context.eligibleEvidence.find(
      (evidence) => evidence.evidenceKind === "story" && evidence.story !== null,
    );
    const storyDetails = story?.story;
    if (story === undefined || storyDetails === undefined || storyDetails === null) {
      const exclusions = Object.freeze([
        ...context.exclusions,
        ...context.eligibleEvidence
          .filter((evidence) => evidence.evidenceKind === "story" && evidence.story === null)
          .map(({ evidenceId, evidenceKind }) =>
            Object.freeze({
              evidenceId,
              evidenceKind,
              reason: "missing-story-structure" as const,
            }),
          ),
      ]);
      return insufficient(
        APPLICATION_ANSWER_TEMPLATE_ID,
        context,
        "no-reviewed-selected-story",
        exclusions,
      );
    }
    const answer = [
      `Situation: ${storyDetails.situation}`,
      `Action: ${storyDetails.action}`,
      `Result: ${storyDetails.result}`,
    ].join("\n\n");
    const sections = Object.freeze([
      Object.freeze({
        kind: "opening" as const,
        support: Object.freeze({ kind: "style-only" as const }),
        text: questionText,
      }),
      Object.freeze({
        kind: "answer" as const,
        support: evidenceSupport([story]),
        text: answer,
      }),
    ]);
    return drafted(APPLICATION_ANSWER_TEMPLATE_ID, context, sections, [
      paragraph(`Question: ${questionText}`),
      paragraph(`Situation: ${storyDetails.situation}`),
      paragraph(`Action: ${storyDetails.action}`),
      paragraph(`Result: ${storyDetails.result}`),
    ]);
  }

  if (context.eligibleEvidence.length === 0) {
    return insufficient(APPLICATION_ANSWER_TEMPLATE_ID, context, "no-reviewed-selected-evidence");
  }
  const evidenceLines = context.eligibleEvidence.map(
    ({ label, summary }) => `${label}: ${summary}`,
  );
  const introduction =
    input.questionKind === "motivation-company"
      ? `I am interested in the ${context.job.title} role at ${context.job.companyName}. The selected evidence I would bring includes:`
      : "My relevant selected evidence is:";
  const sections = Object.freeze([
    Object.freeze({
      kind: "opening" as const,
      support: Object.freeze({ kind: "style-only" as const }),
      text: questionText,
    }),
    Object.freeze({
      kind: "answer" as const,
      support:
        input.questionKind === "motivation-company"
          ? Object.freeze({ kind: "job-context" as const, jobId: context.job.id })
          : evidenceSupport(context.eligibleEvidence),
      text:
        input.questionKind === "motivation-company"
          ? introduction
          : [introduction, ...evidenceLines.map((line) => `- ${line}`)].join("\n"),
    }),
    ...(input.questionKind === "motivation-company"
      ? [
          Object.freeze({
            kind: "evidence" as const,
            support: evidenceSupport(context.eligibleEvidence),
            text: evidenceLines.map((line) => `- ${line}`).join("\n"),
          }),
        ]
      : []),
  ]);
  return drafted(APPLICATION_ANSWER_TEMPLATE_ID, context, sections, [
    paragraph(`Question: ${questionText}`),
    paragraph(introduction),
    bulletList(evidenceLines),
  ]);
};
