import { entityId, instant } from "@coredrill/domain";
import { describe, expect, it } from "vitest";

import {
  DocumentPreparationError,
  createApplicationDocumentPreparationOperations,
  deriveDocumentPreparationStatus,
  type ApplicationDocumentCandidateDto,
  type ApplicationDocumentPreparationPort,
} from "../src/index.js";

const IDS = Object.freeze({
  application: entityId("application", "0199c100-0000-7000-8000-000000000001"),
  job: entityId("job", "0199c100-0000-7000-8000-000000000002"),
  resume: entityId("document", "0199c100-0000-7000-8000-000000000003"),
  resumeVersion: entityId("document-version", "0199c100-0000-7000-8000-000000000004"),
  oldResumeVersion: entityId("document-version", "0199c100-0000-7000-8000-000000000005"),
  answer: entityId("document", "0199c100-0000-7000-8000-000000000006"),
  answerVersion: entityId("document-version", "0199c100-0000-7000-8000-000000000007"),
});

const context = Object.freeze({
  operationId: entityId("application-operation", "0199c100-0000-7000-8000-000000000008"),
  initiatedAt: instant("2026-09-27T21:00:00.000Z"),
});

const candidate = (
  overrides: Partial<ApplicationDocumentCandidateDto> = {},
): ApplicationDocumentCandidateDto =>
  Object.freeze({
    documentId: IDS.resume,
    documentVersionId: IDS.resumeVersion,
    kind: "resume" as const,
    title: "Northstar resume",
    versionNumber: 2,
    versionLabel: "Reviewed",
    lineageRole: "job_derivative" as const,
    relatedJobId: IDS.job,
    latestVersion: true,
    hasDraft: false,
    claimStatus: "not_evaluated" as const,
    ...overrides,
  });

const rawPreparation = () => ({
  applicationId: IDS.application,
  jobId: IDS.job,
  applicationRowVersion: 3,
  submitted: false,
  selected: {
    resumeVersionId: IDS.resumeVersion,
    coverLetterVersionId: null,
    answerVersionIds: [IDS.answerVersion],
  },
  candidates: {
    resumes: [candidate()],
    coverLetters: [],
    answers: [
      candidate({
        documentId: IDS.answer,
        documentVersionId: IDS.answerVersion,
        kind: "application_answer",
        title: "Why Northstar?",
        versionNumber: 1,
        versionLabel: null,
      }),
    ],
  },
});

describe("application document preparation", () => {
  it("derives explicit missing, draft, review-needed, and ready states without a score", () => {
    const current = candidate();
    expect(
      deriveDocumentPreparationStatus({ resume: null, coverLetter: null, answers: [] }),
    ).toEqual({ status: "missing", reasons: ["resume_missing"] });
    expect(
      deriveDocumentPreparationStatus({
        resume: candidate({ hasDraft: true }),
        coverLetter: null,
        answers: [],
      }),
    ).toEqual({ status: "draft", reasons: ["selected_document_has_draft"] });
    expect(
      deriveDocumentPreparationStatus({
        resume: candidate({
          documentVersionId: IDS.oldResumeVersion,
          latestVersion: false,
          versionNumber: 1,
        }),
        coverLetter: null,
        answers: [],
      }),
    ).toEqual({ status: "review_needed", reasons: ["selected_version_not_latest"] });
    expect(
      deriveDocumentPreparationStatus({ resume: current, coverLetter: null, answers: [] }),
    ).toEqual({ status: "ready", reasons: [] });
  });

  it("loads and saves exact local versions through the validated port", async () => {
    const saved: unknown[] = [];
    const port: ApplicationDocumentPreparationPort = {
      load: async () => rawPreparation(),
      save: async (input) => {
        saved.push(input);
        return { ...rawPreparation(), applicationRowVersion: 4 };
      },
    };
    const operations = createApplicationDocumentPreparationOperations({ preparation: port });
    const loaded = await operations.loadPreparationQuery.execute(
      { applicationId: IDS.application },
      context,
    );
    expect(loaded).toMatchObject({
      ok: true,
      value: {
        status: "ready",
        selected: { resume: { documentVersionId: IDS.resumeVersion } },
      },
    });

    const result = await operations.savePreparationCommand.execute(
      {
        applicationId: IDS.application,
        expectedApplicationRowVersion: 3,
        resumeVersionId: IDS.resumeVersion,
        coverLetterVersionId: null,
        answerVersionIds: [IDS.answerVersion],
      },
      context,
    );
    expect(result).toMatchObject({ ok: true, value: { applicationRowVersion: 4 } });
    expect(saved).toEqual([
      expect.objectContaining({
        applicationId: IDS.application,
        updatedAt: context.initiatedAt,
        answerVersionIds: [IDS.answerVersion],
      }),
    ]);
  });

  it("fails closed for duplicate answers, stale writes, and submitted identity", async () => {
    const duplicatePort: ApplicationDocumentPreparationPort = {
      load: async () => rawPreparation(),
      save: async () => rawPreparation(),
    };
    const duplicate = await createApplicationDocumentPreparationOperations({
      preparation: duplicatePort,
    }).savePreparationCommand.execute(
      {
        applicationId: IDS.application,
        expectedApplicationRowVersion: 3,
        resumeVersionId: IDS.resumeVersion,
        coverLetterVersionId: null,
        answerVersionIds: [IDS.answerVersion, IDS.answerVersion],
      },
      context,
    );
    expect(duplicate).toMatchObject({ ok: false, error: { code: "validation" } });

    for (const code of ["conflict", "immutable"] as const) {
      const port: ApplicationDocumentPreparationPort = {
        load: async () => rawPreparation(),
        save: async () => {
          throw new DocumentPreparationError(code);
        },
      };
      const result = await createApplicationDocumentPreparationOperations({
        preparation: port,
      }).savePreparationCommand.execute(
        {
          applicationId: IDS.application,
          expectedApplicationRowVersion: 3,
          resumeVersionId: IDS.resumeVersion,
          coverLetterVersionId: null,
          answerVersionIds: [],
        },
        context,
      );
      expect(result).toMatchObject({ ok: false, error: { code: "conflict" } });
    }
  });
});
