import { describe, expect, it, vi } from "vitest";

import { guardApplicationAnswerTemplateDraft } from "../src/index.js";

describe("application answer template drafting policy", () => {
  it.each([
    ["Describe your TypeScript experience.", "experience-evidence"],
    ["Why are you interested in this company?", "motivation-company"],
    ["Tell us about a time you resolved a conflict.", "behavioral-star"],
  ] as const)("derives the draftable category for %s", (questionText, questionKind) => {
    const render = vi.fn((input: { readonly questionKind: string }) => ({
      template: input.questionKind,
    }));

    expect(
      guardApplicationAnswerTemplateDraft(
        { context: { jobId: "job-1" }, questionText },
        { render },
      ),
    ).toMatchObject({
      draft: { template: questionKind },
      policy: { kind: questionKind },
      status: "drafted",
    });
    expect(render).toHaveBeenCalledWith({
      context: { jobId: "job-1" },
      questionKind,
      questionText,
    });
  });

  it.each([
    ["Are you legally authorized to work here?", "direct-private-answer"],
    ["Please provide your race for EEO reporting.", "direct-private-answer"],
    ["Are you willing to relocate?", "explicit-profile-proposal"],
    ["What are your salary expectations?", "user-choice"],
    ["Type your electronic signature.", "manual-attestation"],
    ["What else should we know?", "direct-review"],
  ] as const)("does not invoke a renderer for %s", (questionText, reason) => {
    const render = vi.fn(() => ({ forbidden: true }));

    expect(
      guardApplicationAnswerTemplateDraft(
        { context: { jobId: "job-1" }, questionText },
        { render },
      ),
    ).toMatchObject({ draft: null, reason, status: "not-draftable" });
    expect(render).not.toHaveBeenCalled();
  });

  it("validates the renderer before classifying content", () => {
    expect(() =>
      guardApplicationAnswerTemplateDraft(
        { context: null, questionText: "Describe your experience." },
        null as never,
      ),
    ).toThrow(/renderer is invalid/u);
  });
});
