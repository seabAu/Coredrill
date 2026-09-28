import { describe, expect, it } from "vitest";

import {
  parseDocumentIr,
  renderDeterministicApplicationAnswerTemplate,
  renderDeterministicCoverLetterTemplate,
  type DeterministicTemplateContextInput,
  type DeterministicTemplateDraft,
  type DraftableApplicationQuestionKind,
} from "../src/index.js";
import golden from "./fixtures/deterministic-templates.golden.json" with { type: "json" };

const context = Object.freeze({
  evidence: Object.freeze([
    Object.freeze({
      evidenceId: "story-private",
      evidenceKind: "story",
      label: "Private story",
      privacyTags: Object.freeze(["health"]),
      requirementIds: Object.freeze(["req-collaboration"]),
      story: Object.freeze({
        action: "This must not appear.",
        result: "This must not appear.",
        situation: "This must not appear.",
      }),
      summary: "This private summary must not appear.",
      updatedAt: "2026-09-20T12:00:00.000Z",
      verificationState: "user_confirmed" as const,
    }),
    Object.freeze({
      evidenceId: "story-incident",
      evidenceKind: "story",
      label: "Production incident response",
      privacyTags: Object.freeze([]),
      requirementIds: Object.freeze(["req-collaboration"]),
      sourceVersion: null,
      story: Object.freeze({
        action:
          "I coordinated a rollback, documented the failure mode, and paired with the service owner on a guarded fix.",
        result:
          "The service recovered, and the team added a regression check for the failure mode.",
        situation: "A deployment caused a production service regression during an on-call shift.",
      }),
      summary:
        "Coordinated a rollback and guarded fix after a production service regression, then added a regression check.",
      updatedAt: "2026-09-19T12:00:00.000Z",
      verificationState: "source_backed" as const,
    }),
    Object.freeze({
      evidenceId: "skill-imported",
      evidenceKind: "skill",
      label: "Kubernetes",
      privacyTags: Object.freeze([]),
      requirementIds: Object.freeze(["req-platform"]),
      summary: "Imported skill that has not been reviewed.",
      updatedAt: "2026-09-18T12:00:00.000Z",
      verificationState: "imported" as const,
    }),
    Object.freeze({
      evidenceId: "acc-release",
      evidenceKind: "accomplishment",
      label: "Faster releases",
      privacyTags: Object.freeze([]),
      requirementIds: Object.freeze(["req-platform"]),
      sourceVersion: Object.freeze({
        contentHash: "a".repeat(64),
        documentId: "doc-resume",
        versionId: "doc-version-3",
        versionNumber: 3,
      }),
      summary:
        "Reduced release lead time from two days to four hours by introducing repeatable deployment checks.",
      updatedAt: "2026-09-21T12:00:00.000Z",
      verificationState: "user_confirmed" as const,
    }),
  ]),
  job: Object.freeze({
    companyName: "Example Systems",
    id: "job-platform",
    title: "Senior Platform Engineer",
  }),
  requirements: Object.freeze([
    Object.freeze({ id: "req-collaboration", sortOrder: 1, text: "Coordinate incident response." }),
    Object.freeze({ id: "req-platform", sortOrder: 0, text: "Improve delivery systems." }),
  ]),
}) satisfies DeterministicTemplateContextInput;

const publicOutput = (draft: DeterministicTemplateDraft) => ({
  content: draft.content,
  context: draft.context,
  engineVersion: draft.engineVersion,
  exclusions: draft.exclusions,
  plainText: draft.plainText,
  sections: draft.sections,
  status: "drafted",
  templateId: draft.templateId,
  templateVersion: draft.templateVersion,
});

describe("deterministic AI-disabled templates", () => {
  it("matches the cover-letter golden and emits canonical IR", () => {
    const before = JSON.stringify(context);
    const result = renderDeterministicCoverLetterTemplate(context);

    expect(result.status).toBe("drafted");
    if (result.status !== "drafted") throw new Error("Expected a cover-letter draft.");
    expect(publicOutput(result)).toEqual(golden.coverLetter);
    expect(parseDocumentIr(result.content)).toEqual(result.content);
    expect(Object.isFrozen(result.content.document.content)).toBe(true);
    expect(Object.isFrozen(result.content.document.content[3])).toBe(true);
    expect(JSON.stringify(context)).toBe(before);
  });

  it.each([
    ["experience-evidence", "Describe your platform delivery experience.", golden.experienceAnswer],
    ["motivation-company", "Why are you interested in this role?", golden.motivationAnswer],
    ["behavioral-star", "Tell us about a time you handled an incident.", golden.behavioralAnswer],
  ] as const)("matches the %s answer golden", (questionKind, questionText, expected) => {
    const result = renderDeterministicApplicationAnswerTemplate({
      context,
      questionKind,
      questionText,
    });

    expect(result.status).toBe("drafted");
    if (result.status !== "drafted") throw new Error("Expected an application-answer draft.");
    expect(publicOutput(result)).toEqual(expected);
    expect(parseDocumentIr(result.content)).toEqual(result.content);
  });

  it("is stable under input ordering and never emits excluded evidence", () => {
    const reordered = {
      ...context,
      evidence: [...context.evidence].reverse(),
      requirements: [...context.requirements].reverse(),
    };
    const first = renderDeterministicCoverLetterTemplate(context);
    const second = renderDeterministicCoverLetterTemplate(reordered);

    expect(second).toEqual(first);
    expect(JSON.stringify(first)).not.toContain("This must not appear");
    expect(JSON.stringify(first)).not.toContain("Imported skill that has not been reviewed");
  });

  it("fails closed without reviewed evidence or a reviewed structured story", () => {
    const noReviewedEvidence = {
      ...context,
      evidence: context.evidence.filter(
        ({ verificationState }) => verificationState === "imported",
      ),
    };
    expect(renderDeterministicCoverLetterTemplate(noReviewedEvidence)).toMatchObject({
      reason: "no-reviewed-selected-evidence",
      status: "insufficient-evidence",
    });

    const noStory = {
      ...context,
      evidence: context.evidence.filter(({ evidenceKind }) => evidenceKind === "accomplishment"),
    };
    expect(
      renderDeterministicApplicationAnswerTemplate({
        context: noStory,
        questionKind: "behavioral-star",
        questionText: "Describe a time you handled an incident.",
      }),
    ).toMatchObject({ reason: "no-reviewed-selected-story", status: "insufficient-evidence" });
  });

  it("rejects non-draftable application-question categories at the renderer boundary", () => {
    expect(() =>
      renderDeterministicApplicationAnswerTemplate({
        context,
        questionKind: "work-authorization-legal" as DraftableApplicationQuestionKind,
        questionText: "Are you authorized to work here?",
      }),
    ).toThrow(/not draftable/u);
  });

  it("rejects evidence outside the versioned input vocabulary", () => {
    expect(() =>
      renderDeterministicCoverLetterTemplate({
        ...context,
        evidence: [{ ...context.evidence[3]!, evidenceKind: "profile-note" as never }],
      }),
    ).toThrow(/evidence kind is invalid/iu);
    expect(() =>
      renderDeterministicCoverLetterTemplate({
        ...context,
        evidence: [{ ...context.evidence[3]!, verificationState: "verified" as never }],
      }),
    ).toThrow(/verification state is invalid/iu);
    expect(() =>
      renderDeterministicCoverLetterTemplate({
        ...context,
        evidence: [{ ...context.evidence[3]!, updatedAt: "yesterday" }],
      }),
    ).toThrow(/update time is invalid/iu);
  });

  it("maps every emitted section to job context, selected evidence, or style-only text", () => {
    const supportKinds = new Set<string>();
    for (const result of [
      renderDeterministicCoverLetterTemplate(context),
      renderDeterministicApplicationAnswerTemplate({
        context,
        questionKind: "experience-evidence",
        questionText: "Describe your platform delivery experience.",
      }),
    ]) {
      expect(result.status).toBe("drafted");
      if (result.status !== "drafted") continue;
      for (const { support } of result.sections) {
        expect(["job-context", "selected-evidence", "style-only"]).toContain(support.kind);
        supportKinds.add(support.kind);
      }
    }
    expect(supportKinds).toEqual(new Set(["job-context", "selected-evidence", "style-only"]));
  });
});
