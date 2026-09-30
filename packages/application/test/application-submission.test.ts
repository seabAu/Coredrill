import { createHash } from "node:crypto";

import { entityId, instant } from "@coredrill/domain";
import { describe, expect, it } from "vitest";

import {
  APPLICATION_EXPORT_LIMITS,
  ApplicationSubmissionError,
  createApplicationSubmissionOperations,
  type ApplicationSubmissionPort,
  type ApplicationSubmissionReviewDto,
} from "../src/index.js";

const IDS = Object.freeze({
  application: entityId("application", "0199d100-0000-7000-8000-000000000001"),
  job: entityId("job", "0199d100-0000-7000-8000-000000000002"),
  preparingStatus: entityId("status_definition", "0199d100-0000-7000-8000-000000000003"),
  appliedStatus: entityId("status_definition", "0199d100-0000-7000-8000-000000000004"),
  resume: entityId("document", "0199d100-0000-7000-8000-000000000005"),
  resumeVersion: entityId("document-version", "0199d100-0000-7000-8000-000000000006"),
  answer: entityId("document", "0199d100-0000-7000-8000-000000000007"),
  answerVersion: entityId("document-version", "0199d100-0000-7000-8000-000000000008"),
  artifact: entityId("document-export-artifact", "0199d100-0000-7000-8000-000000000009"),
  event: entityId("status-event", "0199d100-0000-7000-8000-00000000000a"),
  snapshot: entityId("submitted-snapshot", "0199d100-0000-7000-8000-00000000000b"),
  resumeItem: entityId("submitted-snapshot-item", "0199d100-0000-7000-8000-00000000000c"),
  answerItem: entityId("submitted-snapshot-item", "0199d100-0000-7000-8000-00000000000d"),
});

const NOW = instant("2026-09-28T18:00:00.000Z");
const context = Object.freeze({
  operationId: entityId("application-operation", "0199d100-0000-7000-8000-00000000000e"),
  initiatedAt: NOW,
});
const bytes = new TextEncoder().encode("exact application export");
const hash = createHash("sha256").update(bytes).digest("hex");
const purpose = `export.docx.${IDS.artifact}`;

const review = (submitted = false): ApplicationSubmissionReviewDto =>
  Object.freeze({
    applicationId: IDS.application,
    jobId: IDS.job,
    applicationRowVersion: submitted ? 4 : 3,
    currentStatusId: submitted ? IDS.appliedStatus : IDS.preparingStatus,
    currentStatusName: submitted ? "Applied" : "Preparing",
    documents: Object.freeze([
      Object.freeze({
        role: "resume" as const,
        documentId: IDS.resume,
        documentVersionId: IDS.resumeVersion,
        title: "Exact resume",
        versionNumber: 2,
        sortOrder: 0,
        artifacts: Object.freeze([
          Object.freeze({
            contentId: hash,
            attachmentPurpose: purpose,
            format: "docx" as const,
            mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            byteLength: bytes.byteLength,
            logicalName: "exact-resume.docx",
            recordedAt: NOW,
          }),
        ]),
      }),
      Object.freeze({
        role: "answer" as const,
        documentId: IDS.answer,
        documentVersionId: IDS.answerVersion,
        title: "Why this role?",
        versionNumber: 1,
        sortOrder: 1,
        artifacts: Object.freeze([]),
      }),
    ]),
    appliedStatuses: Object.freeze([Object.freeze({ id: IDS.appliedStatus, name: "Applied" })]),
    snapshot: submitted
      ? Object.freeze({
          id: IDS.snapshot,
          appliedAt: NOW,
          channel: "Company portal",
          statusId: IDS.appliedStatus,
          statusEventId: IDS.event,
          items: Object.freeze([
            Object.freeze({
              id: IDS.resumeItem,
              role: "resume" as const,
              documentVersionId: IDS.resumeVersion,
              submissionFormat: "file" as const,
              contentId: hash,
              attachmentPurpose: purpose,
              logicalName: "exact-resume.docx",
              mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              sortOrder: 0,
            }),
            Object.freeze({
              id: IDS.answerItem,
              role: "answer" as const,
              documentVersionId: IDS.answerVersion,
              submissionFormat: "plain_text" as const,
              contentId: null,
              attachmentPurpose: null,
              logicalName: null,
              mediaType: null,
              sortOrder: 1,
            }),
          ]),
        })
      : null,
  });

describe("application submission", () => {
  it("records a generated local artifact and binds its computed content identity", async () => {
    const recorded: unknown[] = [];
    const port: ApplicationSubmissionPort = {
      load: async () => review(),
      recordExport: async (input) => {
        recorded.push(input);
        return review();
      },
      markApplied: async () => review(true),
    };
    const operations = createApplicationSubmissionOperations({
      submission: port,
      createId: () => IDS.artifact,
      hashBytes: async (value) => createHash("sha256").update(value).digest("hex"),
    });
    const result = await operations.recordExportCommand.execute(
      {
        applicationId: IDS.application,
        expectedApplicationRowVersion: 3,
        documentVersionId: IDS.resumeVersion,
        format: "docx",
        logicalName: "exact-resume.docx",
        mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        bytes,
      },
      context,
    );
    expect(result).toMatchObject({ ok: true });
    expect(recorded).toEqual([
      expect.objectContaining({
        contentId: hash,
        attachmentPurpose: purpose,
        byteLength: bytes.byteLength,
        recordedAt: NOW,
      }),
    ]);
    expect((recorded[0] as { readonly bytes: Uint8Array }).bytes).not.toBe(bytes);
  });

  it("rejects an oversized retained export before hashing or persistence", async () => {
    let hashed = false;
    let recorded = false;
    const operations = createApplicationSubmissionOperations({
      submission: {
        load: async () => review(),
        recordExport: async () => {
          recorded = true;
          return review();
        },
        markApplied: async () => review(true),
      },
      createId: () => IDS.artifact,
      hashBytes: async () => {
        hashed = true;
        return hash;
      },
    });

    const result = await operations.recordExportCommand.execute(
      {
        applicationId: IDS.application,
        expectedApplicationRowVersion: 3,
        documentVersionId: IDS.resumeVersion,
        format: "pdf",
        logicalName: "oversized.pdf",
        mediaType: "application/pdf",
        bytes: new Uint8Array(APPLICATION_EXPORT_LIMITS.maxBytes + 1),
      },
      context,
    );

    expect(result).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(hashed).toBe(false);
    expect(recorded).toBe(false);
  });

  it("creates one explicit applied event and exact ordered snapshot request", async () => {
    const marked: unknown[] = [];
    let itemCursor = 0;
    const port: ApplicationSubmissionPort = {
      load: async () => review(),
      recordExport: async () => review(),
      markApplied: async (input) => {
        marked.push(input);
        return review(true);
      },
    };
    const operations = createApplicationSubmissionOperations({
      submission: port,
      createId: (kind) => {
        if (kind === "status-event") return IDS.event;
        if (kind === "submitted-snapshot") return IDS.snapshot;
        const itemId = [IDS.resumeItem, IDS.answerItem][itemCursor];
        itemCursor += 1;
        return itemId ?? IDS.answerItem;
      },
      hashBytes: async () => hash,
    });
    const result = await operations.markAppliedCommand.execute(
      {
        applicationId: IDS.application,
        expectedApplicationRowVersion: 3,
        appliedStatusId: IDS.appliedStatus,
        channel: " Company portal ",
        confirmed: true,
        items: [
          {
            role: "resume",
            documentVersionId: IDS.resumeVersion,
            submissionFormat: "file",
            contentId: hash,
            attachmentPurpose: purpose,
          },
          {
            role: "answer",
            documentVersionId: IDS.answerVersion,
            submissionFormat: "plain_text",
          },
        ],
      },
      context,
    );
    expect(result).toMatchObject({
      ok: true,
      value: {
        snapshot: { channel: "Company portal", items: [{ role: "resume" }, { role: "answer" }] },
      },
    });
    expect(marked).toEqual([
      expect.objectContaining({
        statusEventId: IDS.event,
        snapshotId: IDS.snapshot,
        appliedAt: NOW,
        channel: "Company portal",
        items: [
          expect.objectContaining({ id: IDS.resumeItem, sortOrder: 0 }),
          expect.objectContaining({ id: IDS.answerItem, sortOrder: 1 }),
        ],
      }),
    ]);
  });

  it("requires explicit confirmation and maps immutable or stale state to stable failures", async () => {
    let called = false;
    const basePort: ApplicationSubmissionPort = {
      load: async () => review(),
      recordExport: async () => review(),
      markApplied: async () => {
        called = true;
        return review(true);
      },
    };
    const dependencies = {
      submission: basePort,
      createId: () => IDS.snapshot,
      hashBytes: async () => hash,
    };
    const unconfirmed = await createApplicationSubmissionOperations(
      dependencies,
    ).markAppliedCommand.execute(
      {
        applicationId: IDS.application,
        expectedApplicationRowVersion: 3,
        appliedStatusId: IDS.appliedStatus,
        channel: "Company portal",
        confirmed: false,
        items: [],
      },
      context,
    );
    expect(unconfirmed).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(called).toBe(false);

    for (const code of ["conflict", "immutable"] as const) {
      const port: ApplicationSubmissionPort = {
        ...basePort,
        markApplied: async () => {
          throw new ApplicationSubmissionError(code);
        },
      };
      const result = await createApplicationSubmissionOperations({
        ...dependencies,
        submission: port,
      }).markAppliedCommand.execute(
        {
          applicationId: IDS.application,
          expectedApplicationRowVersion: 3,
          appliedStatusId: IDS.appliedStatus,
          channel: "Company portal",
          confirmed: true,
          items: [
            {
              role: "resume",
              documentVersionId: IDS.resumeVersion,
              submissionFormat: "plain_text",
            },
          ],
        },
        context,
      );
      expect(result).toMatchObject({ ok: false, error: { code: "conflict" } });
    }
  });
});
