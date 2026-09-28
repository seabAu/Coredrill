import type {
  ApplicationDocumentCandidateDto,
  ApplicationDocumentPreparationDto,
} from "@coredrill/application";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { JobDocumentPreparation, type JobDocumentPreparationModel } from "../src/index.js";

const resume = Object.freeze({
  documentId: "0199c200-0000-7000-8000-000000000001",
  documentVersionId: "0199c200-0000-7000-8000-000000000002",
  kind: "resume" as const,
  title: "Northstar resume",
  versionNumber: 2,
  versionLabel: "Reviewed",
  lineageRole: "job_derivative" as const,
  relatedJobId: "0199c200-0000-7000-8000-000000000003",
  latestVersion: true,
  hasDraft: false,
  claimStatus: "not_evaluated" as const,
}) as unknown as ApplicationDocumentCandidateDto;

const answer = Object.freeze({
  ...resume,
  documentId: "0199c200-0000-7000-8000-000000000004",
  documentVersionId: "0199c200-0000-7000-8000-000000000005",
  kind: "application_answer" as const,
  title: "Why Northstar?",
  versionNumber: 1,
  versionLabel: null,
}) as unknown as ApplicationDocumentCandidateDto;

const coverLetter = Object.freeze({
  ...resume,
  documentId: "0199c200-0000-7000-8000-000000000007",
  documentVersionId: "0199c200-0000-7000-8000-000000000008",
  kind: "cover_letter" as const,
  title: "Northstar cover letter",
  versionNumber: 1,
  versionLabel: "Reviewed base",
}) as unknown as ApplicationDocumentCandidateDto;

const preparation = Object.freeze({
  applicationId: "0199c200-0000-7000-8000-000000000006",
  jobId: resume.relatedJobId,
  applicationRowVersion: 2,
  submitted: false,
  status: "ready" as const,
  reasons: Object.freeze([]),
  selected: Object.freeze({
    resume,
    coverLetter: null,
    answers: Object.freeze([answer]),
  }),
  candidates: Object.freeze({
    resumes: Object.freeze([resume]),
    coverLetters: Object.freeze([coverLetter]),
    answers: Object.freeze([answer]),
  }),
}) as unknown as ApplicationDocumentPreparationDto;

const render = (model: JobDocumentPreparationModel) =>
  renderToStaticMarkup(createElement(JobDocumentPreparation, { model }));

describe("JobDocumentPreparation", () => {
  it("renders exact selected versions, lineage, and a truthful ready boundary", () => {
    const markup = render({ preparation, loading: false, saving: false, error: null });

    expect(markup).toContain('data-job-content-tab="documents"');
    expect(markup).toContain('data-preparation-status="ready"');
    expect(markup).toContain("Ready for export review");
    expect(markup).toContain("Northstar resume");
    expect(markup).toContain("Version 2 · Reviewed");
    expect(markup).toContain("Job derivative");
    expect(markup).toContain("Why Northstar?");
    expect(markup).toContain("Claims remain unevaluated");
    expect(markup).toContain("nothing has been exported or submitted");
    expect(markup).toContain("This status is not a hiring or ATS score");
  });

  it("names missing, loading, error, and immutable submitted states", () => {
    const missing = {
      ...preparation,
      status: "missing" as const,
      reasons: Object.freeze(["resume_missing" as const]),
      selected: Object.freeze({ ...preparation.selected, resume: null }),
    } as ApplicationDocumentPreparationDto;
    expect(render({ preparation: missing, loading: false, saving: false, error: null })).toContain(
      "Missing required selection",
    );
    expect(render({ preparation: null, loading: true, saving: false, error: null })).toContain(
      "Loading local application documents",
    );
    expect(
      render({
        preparation: null,
        loading: false,
        saving: false,
        error: "Local vault unavailable",
      }),
    ).toContain('role="alert"');
    expect(
      render({
        preparation: { ...preparation, submitted: true },
        loading: false,
        saving: false,
        error: null,
      }),
    ).toContain("immutable submitted snapshot");
  });

  it("offers selection only and keeps export and Mark Applied separate", () => {
    const markup = render({ preparation, loading: false, saving: false, error: null });
    expect(markup).toContain("Save exact selections");
    expect(markup).toContain("Selection never exports, uploads, or submits a file");
    expect(markup).toContain("Export and Mark Applied are separate reviewed steps");
    expect(markup).not.toContain("Export now");
    expect(markup).not.toContain("Submit application");
  });

  it("offers a separate export review for every exact selected version", () => {
    const markup = renderToStaticMarkup(
      createElement(JobDocumentPreparation, {
        model: { preparation, loading: false, saving: false, error: null },
        onLoadDocument: async () => ({
          ok: false as const,
          error: {
            code: "not_found" as const,
            message: "Not loaded in static proof.",
            retryable: false,
          },
        }),
      }),
    );

    expect(markup).toContain("Review export for Northstar resume version 2");
    expect(markup).toContain("Review export for Why Northstar? version 1");
    expect(markup).not.toContain("Print or save PDF");
  });

  it("names the local AI-disabled template boundary and exact evidence identity", () => {
    const markup = renderToStaticMarkup(
      createElement(JobDocumentPreparation, {
        model: { preparation, loading: false, saving: false, error: null },
        onCreateTemplateCoverLetter: () => undefined,
        templateCoverLetterModel: {
          creating: false,
          error: null,
          result: {
            aiMode: "disabled",
            claimStatus: "not_evaluated",
            contentHash: "b".repeat(64),
            engineVersion: "deterministic-template-engine-v1",
            evidence: [
              {
                evidenceId: "0199c200-0000-7000-8000-000000000009",
                evidenceKind: "employment",
                sourceVersion: {
                  contentHash: "a".repeat(64),
                  documentId: resume.documentId,
                  versionId: resume.documentVersionId,
                  versionNumber: 2,
                },
                verificationState: "source_backed",
              },
            ],
            networkAccess: "none",
            templateId: "cover-letter-template-v1",
            templateVersion: 1,
            versionId: "0199c200-0000-7000-8000-00000000000a",
            versionNumber: 2,
          },
        },
      }),
    );

    expect(markup).toContain("Truthful template-only draft");
    expect(markup).toContain("AI stays disabled");
    expect(markup).toContain("Create truthful template-only version");
    expect(markup).toContain("Created immutable version 2");
    expect(markup).toContain("network access none");
    expect(markup).toContain("claims not evaluated");
    expect(markup).toContain(resume.documentVersionId);
    expect(markup).toContain("Review the new immutable version");
    expect(markup).toContain("Nothing is uploaded or submitted");
  });
});
