import { describe, expect, it } from "vitest";

import {
  APPLICATION_QUESTION_POLICY_VERSION,
  classifyApplicationQuestion,
  resolveApplicationQuestionAnswer,
} from "../src/index.js";

const unrelatedCandidates = Object.freeze([
  Object.freeze({ source: "career-profile" as const, value: "United States" }),
  Object.freeze({ source: "career-evidence" as const, value: "Worked in New York" }),
  Object.freeze({ source: "document" as const, value: "US-based engineering role" }),
  Object.freeze({ source: "answer-library" as const, value: "Yes" }),
  Object.freeze({ source: "generated" as const, value: "Yes" }),
]);

describe("application question policy", () => {
  it.each([
    ["Are you legally authorized to work in the United States?", "work-authorization-legal"],
    ["Will you now or in the future require visa sponsorship?", "work-authorization-legal"],
    ["What is your citizenship status?", "work-authorization-legal"],
    ["Please provide your race for EEO reporting.", "demographic-eeo-medical"],
    ["What is your gender identity?", "demographic-eeo-medical"],
    ["Do you identify as a protected veteran?", "demographic-eeo-medical"],
    ["Do you have a disability or medical condition?", "demographic-eeo-medical"],
  ] as const)("keeps %s a direct private answer", (questionText, kind) => {
    expect(classifyApplicationQuestion(questionText)).toEqual({
      allowsGeneratedDraft: false,
      allowsProfileProposal: false,
      handling: "direct-private-answer",
      kind,
      requiresDirectUserAnswer: true,
      ruleVersion: APPLICATION_QUESTION_POLICY_VERSION,
    });

    expect(
      resolveApplicationQuestionAnswer({ questionText, candidates: unrelatedCandidates }),
    ).toMatchObject({
      answer: null,
      answerSource: null,
      ignoredCandidateCount: unrelatedCandidates.length,
      proposal: null,
      requiresConfirmation: false,
    });
  });

  it("accepts a direct user answer without treating inferred candidates as its source", () => {
    expect(
      resolveApplicationQuestionAnswer({
        questionText: "Are you legally authorized to work in the United States?",
        candidates: unrelatedCandidates,
        directUserAnswer: "I prefer to answer directly in the application.",
      }),
    ).toMatchObject({
      answer: "I prefer to answer directly in the application.",
      answerSource: "direct-user",
      ignoredCandidateCount: unrelatedCandidates.length,
      proposal: null,
    });
  });

  it("offers explicit logistics settings only as an unconfirmed proposal", () => {
    expect(
      resolveApplicationQuestionAnswer({
        questionText: "Are you willing to travel quarterly?",
        candidates: [
          { source: "career-profile", value: "Yes" },
          { source: "explicit-profile-setting", value: "Up to 25%" },
        ],
      }),
    ).toMatchObject({
      answer: null,
      answerSource: null,
      ignoredCandidateCount: 1,
      proposal: { source: "explicit-profile-setting", value: "Up to 25%" },
      requiresConfirmation: true,
      policy: { handling: "explicit-profile-proposal", kind: "logistics" },
    });
  });

  it.each([
    ["What are your salary expectations?", "compensation", "user-choice"],
    ["Type your electronic signature.", "acknowledgment-signature", "manual-attestation"],
    ["What would you like us to know?", "unknown", "direct-review"],
  ] as const)("leaves %s unset", (questionText, kind, handling) => {
    expect(
      resolveApplicationQuestionAnswer({ questionText, candidates: unrelatedCandidates }),
    ).toMatchObject({
      answer: null,
      proposal: null,
      policy: { kind, handling },
    });
  });

  it.each([
    ["Describe a time you resolved a difficult conflict.", "behavioral-star"],
    ["Why are you interested in this company?", "motivation-company"],
    ["Describe your TypeScript experience.", "experience-evidence"],
  ] as const)("classifies %s as a reviewable drafting category", (questionText, kind) => {
    expect(classifyApplicationQuestion(questionText)).toMatchObject({
      allowsGeneratedDraft: true,
      handling: "draftable",
      kind,
      requiresDirectUserAnswer: false,
    });
  });
});
