export const APPLICATION_QUESTION_POLICY_VERSION = "application-question-policy-v1" as const;

export const APPLICATION_QUESTION_KINDS = Object.freeze([
  "experience-evidence",
  "motivation-company",
  "behavioral-star",
  "logistics",
  "compensation",
  "work-authorization-legal",
  "demographic-eeo-medical",
  "acknowledgment-signature",
  "unknown",
] as const);
export type ApplicationQuestionKind = (typeof APPLICATION_QUESTION_KINDS)[number];

export const APPLICATION_QUESTION_HANDLING = Object.freeze([
  "draftable",
  "explicit-profile-proposal",
  "user-choice",
  "direct-private-answer",
  "manual-attestation",
  "direct-review",
] as const);
export type ApplicationQuestionHandling = (typeof APPLICATION_QUESTION_HANDLING)[number];

export type ApplicationAnswerSource =
  | "direct-user"
  | "explicit-profile-setting"
  | "career-profile"
  | "career-evidence"
  | "document"
  | "answer-library"
  | "generated";

export interface ApplicationQuestionPolicyDto {
  readonly allowsGeneratedDraft: boolean;
  readonly allowsProfileProposal: boolean;
  readonly handling: ApplicationQuestionHandling;
  readonly kind: ApplicationQuestionKind;
  readonly requiresDirectUserAnswer: boolean;
  readonly ruleVersion: typeof APPLICATION_QUESTION_POLICY_VERSION;
}

export interface ApplicationAnswerCandidateInput {
  readonly source: Exclude<ApplicationAnswerSource, "direct-user">;
  readonly value: string;
}

export interface ResolveApplicationQuestionAnswerInput {
  readonly candidates?: readonly ApplicationAnswerCandidateInput[];
  readonly directUserAnswer?: string | null;
  readonly questionText: string;
}

export interface ApplicationQuestionAnswerResolutionDto {
  readonly answer: string | null;
  readonly answerSource: "direct-user" | null;
  readonly ignoredCandidateCount: number;
  readonly policy: ApplicationQuestionPolicyDto;
  readonly proposal: {
    readonly source: "explicit-profile-setting";
    readonly value: string;
  } | null;
  readonly requiresConfirmation: boolean;
}

const MAX_QUESTION_LENGTH = 20_000;
const normalizeQuestion = (value: string): string =>
  value.normalize("NFKC").toLocaleLowerCase("en-US").replaceAll(/\s+/gu, " ").trim();

const policy = (
  kind: ApplicationQuestionKind,
  handling: ApplicationQuestionHandling,
): ApplicationQuestionPolicyDto =>
  Object.freeze({
    allowsGeneratedDraft: handling === "draftable",
    allowsProfileProposal: handling === "explicit-profile-proposal",
    handling,
    kind,
    requiresDirectUserAnswer:
      handling === "direct-private-answer" || handling === "manual-attestation",
    ruleVersion: APPLICATION_QUESTION_POLICY_VERSION,
  });

const contains = (text: string, expressions: readonly RegExp[]): boolean =>
  expressions.some((expression) => expression.test(text));

const PRIVATE_LEGAL_PATTERNS = Object.freeze([
  /\b(?:legally\s+)?authori[sz](?:ed|ation)\s+to\s+work\b/u,
  /\bwork\s+authori[sz]ation\b/u,
  /\b(?:employment|immigration)\s+(?:eligibility|status)\b/u,
  /\b(?:citizen|citizenship|visa|green\s+card|permanent\s+resident|sponsorship)\b/u,
  /\brequire\s+(?:now\s+or\s+in\s+the\s+future\s+)?sponsorship\b/u,
  /\blegal\s+attestation\b/u,
]);
const PRIVATE_DEMOGRAPHIC_PATTERNS = Object.freeze([
  /\b(?:equal\s+employment\s+opportunity|eeo)\b/u,
  /\b(?:race|racial|ethnicity|ethnic\s+origin)\b/u,
  /\b(?:gender|gender\s+identity|sex|sexual\s+orientation|pronouns?)\b/u,
  /\b(?:veteran|military\s+status)\b/u,
  /\b(?:disability|disabled|medical\s+condition|medical\s+history|health\s+condition)\b/u,
  /\b(?:religion|religious\s+belief|marital\s+status|national\s+origin)\b/u,
  /\b(?:date\s+of\s+birth|age|demographic)\b/u,
]);
const ATTESTATION_PATTERNS = Object.freeze([
  /\b(?:electronic\s+)?signature\b/u,
  /\b(?:sign|certify|attest|acknowledge|consent)\b/u,
  /\bterms\s+and\s+conditions\b/u,
]);
const COMPENSATION_PATTERNS = Object.freeze([
  /\b(?:salary|compensation|pay|wage|hourly\s+rate)\b/u,
  /\b(?:desired|expected)\s+(?:salary|compensation|pay|rate)\b/u,
]);
const LOGISTICS_PATTERNS = Object.freeze([
  /\b(?:start\s+date|available\s+to\s+start|notice\s+period|availability)\b/u,
  /\b(?:remote|hybrid|on[ -]?site|relocat(?:e|ion)|commut(?:e|ing)|travel)\b/u,
  /\b(?:time\s*zone|work\s+schedule|shift|hours)\b/u,
]);
const BEHAVIORAL_PATTERNS = Object.freeze([
  /\btell\s+(?:me|us)\s+about\s+a\s+time\b/u,
  /\bdescribe\s+a\s+(?:time|situation|challenge|conflict)\b/u,
  /\b(?:situation|task|action|result)\b/u,
  /\bbehavioral\b/u,
]);
const MOTIVATION_PATTERNS = Object.freeze([
  /\bwhy\s+(?:do\s+you\s+want|are\s+you\s+interested|this\s+company|this\s+role)\b/u,
  /\b(?:motivat(?:e|ed|ion)|interest(?:ed)?\s+in)\b/u,
  /\bwhy\s+(?:should\s+we\s+hire|would\s+you\s+like\s+to\s+work)\b/u,
]);
const EXPERIENCE_PATTERNS = Object.freeze([
  /\b(?:experience|skill|qualification|proficien(?:t|cy)|expertise)\b/u,
  /\b(?:project|accomplishment|achievement|portfolio|example)\b/u,
  /\bhow\s+many\s+years\b/u,
]);

export const classifyApplicationQuestion = (questionText: string): ApplicationQuestionPolicyDto => {
  if (typeof questionText !== "string" || questionText.length > MAX_QUESTION_LENGTH) {
    throw new TypeError("Application question text is invalid.");
  }
  const text = normalizeQuestion(questionText);
  if (contains(text, PRIVATE_LEGAL_PATTERNS)) {
    return policy("work-authorization-legal", "direct-private-answer");
  }
  if (contains(text, PRIVATE_DEMOGRAPHIC_PATTERNS)) {
    return policy("demographic-eeo-medical", "direct-private-answer");
  }
  if (contains(text, ATTESTATION_PATTERNS)) {
    return policy("acknowledgment-signature", "manual-attestation");
  }
  if (contains(text, COMPENSATION_PATTERNS)) {
    return policy("compensation", "user-choice");
  }
  if (contains(text, LOGISTICS_PATTERNS)) {
    return policy("logistics", "explicit-profile-proposal");
  }
  if (contains(text, BEHAVIORAL_PATTERNS)) {
    return policy("behavioral-star", "draftable");
  }
  if (contains(text, MOTIVATION_PATTERNS)) {
    return policy("motivation-company", "draftable");
  }
  if (contains(text, EXPERIENCE_PATTERNS)) {
    return policy("experience-evidence", "draftable");
  }
  return policy("unknown", "direct-review");
};

const normalizedAnswer = (value: string | null | undefined): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || value.length > MAX_QUESTION_LENGTH) {
    throw new TypeError("Application answer text is invalid.");
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};

export const resolveApplicationQuestionAnswer = (
  input: ResolveApplicationQuestionAnswerInput,
): ApplicationQuestionAnswerResolutionDto => {
  const answerPolicy = classifyApplicationQuestion(input.questionText);
  const directUserAnswer = normalizedAnswer(input.directUserAnswer);
  const candidates = input.candidates ?? Object.freeze([]);

  let proposal: ApplicationQuestionAnswerResolutionDto["proposal"] = null;
  if (answerPolicy.handling === "explicit-profile-proposal") {
    for (const candidate of candidates) {
      if (candidate.source !== "explicit-profile-setting") continue;
      const value = normalizedAnswer(candidate.value);
      if (value === null) continue;
      proposal = Object.freeze({ source: "explicit-profile-setting", value });
      break;
    }
  }

  return Object.freeze({
    answer: directUserAnswer,
    answerSource: directUserAnswer === null ? null : ("direct-user" as const),
    ignoredCandidateCount: candidates.length - (proposal === null ? 0 : 1),
    policy: answerPolicy,
    proposal,
    requiresConfirmation: directUserAnswer === null && proposal !== null,
  });
};
