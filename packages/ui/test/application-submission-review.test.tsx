import type { ApplicationSubmissionReviewDto } from "@coredrill/application";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ApplicationSubmissionReview } from "../src/index.js";

const review = Object.freeze({
  applicationId: "0199d300-0000-7000-8000-000000000001",
  jobId: "0199d300-0000-7000-8000-000000000002",
  applicationRowVersion: 2,
  currentStatusId: "0199d300-0000-7000-8000-000000000003",
  currentStatusName: "Preparing application",
  documents: Object.freeze([
    Object.freeze({
      role: "resume" as const,
      documentId: "0199d300-0000-7000-8000-000000000004",
      documentVersionId: "0199d300-0000-7000-8000-000000000005",
      title: "Northstar resume",
      versionNumber: 2,
      sortOrder: 0,
      artifacts: Object.freeze([
        Object.freeze({
          format: "docx" as const,
          contentId: "a".repeat(64),
          attachmentPurpose: "export.docx.0199d300-0000-7000-8000-000000000006",
          logicalName: "northstar-resume-v2.docx",
          mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          byteLength: 4096,
          recordedAt: "2026-09-28T16:00:00.000Z",
        }),
      ]),
    }),
    Object.freeze({
      role: "answer" as const,
      documentId: "0199d300-0000-7000-8000-000000000007",
      documentVersionId: "0199d300-0000-7000-8000-000000000008",
      title: "Why Northstar?",
      versionNumber: 1,
      sortOrder: 1,
      artifacts: Object.freeze([]),
    }),
  ]),
  appliedStatuses: Object.freeze([
    Object.freeze({
      id: "0199d300-0000-7000-8000-000000000009",
      name: "Applied",
    }),
  ]),
  snapshot: null,
}) as unknown as ApplicationSubmissionReviewDto;

const render = (value: ApplicationSubmissionReviewDto | null) =>
  renderToStaticMarkup(
    createElement(ApplicationSubmissionReview, {
      model: { review: value, loading: false, saving: false, error: null },
    }),
  );

describe("ApplicationSubmissionReview", () => {
  it("requires a separate explicit confirmation of every exact submitted form", () => {
    const markup = render(review);

    expect(markup).toContain("Separate confirmation");
    expect(markup).toContain("This does not upload, autofill, send, or verify receipt");
    expect(markup).toContain("Northstar resume");
    expect(markup).toContain("version 2");
    expect(markup).toContain("northstar-resume-v2.docx");
    expect(markup).toContain("Pasted or entered as exact version text");
    expect(markup).toContain("I confirm that I submitted these exact versions");
    expect(markup).toContain("Mark Applied and freeze submitted set");
    expect(markup).toMatch(
      /<button[^>]*disabled=""[^>]*>Mark Applied and freeze submitted set<\/button>/,
    );
  });

  it("renders the immutable local snapshot without claiming employer receipt", () => {
    const submitted = Object.freeze({
      ...review,
      applicationRowVersion: 3,
      currentStatusId: review.appliedStatuses[0]?.id,
      currentStatusName: "Applied",
      snapshot: Object.freeze({
        id: "0199d300-0000-7000-8000-00000000000a",
        statusEventId: "0199d300-0000-7000-8000-00000000000b",
        statusId: review.appliedStatuses[0]?.id,
        appliedAt: "2026-09-28T16:05:00.000Z",
        channel: "Company portal",
        items: Object.freeze([
          Object.freeze({
            id: "0199d300-0000-7000-8000-00000000000c",
            role: "resume" as const,
            documentVersionId: review.documents[0]?.documentVersionId,
            submissionFormat: "file" as const,
            contentId: "a".repeat(64),
            attachmentPurpose: "export.docx.0199d300-0000-7000-8000-000000000006",
            logicalName: "northstar-resume-v2.docx",
            mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            sortOrder: 0,
          }),
          Object.freeze({
            id: "0199d300-0000-7000-8000-00000000000d",
            role: "answer" as const,
            documentVersionId: review.documents[1]?.documentVersionId,
            submissionFormat: "plain_text" as const,
            contentId: null,
            attachmentPurpose: null,
            logicalName: null,
            mediaType: null,
            sortOrder: 1,
          }),
        ]),
      }),
    }) as unknown as ApplicationSubmissionReviewDto;

    const markup = render(submitted);

    expect(markup).toContain('aria-label="Immutable submitted snapshot"');
    expect(markup).toContain("Applied recorded");
    expect(markup).toContain("Company portal");
    expect(markup).toContain("northstar-resume-v2.docx");
    expect(markup).toContain("SHA-256");
    expect(markup).toContain("does not claim that the employer received it");
    expect(markup).not.toContain("Mark Applied and freeze submitted set");
  });
});
