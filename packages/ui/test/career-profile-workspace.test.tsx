import {
  applicationFailure,
  type CareerProfileEntryDto,
  type ResumeImportQueueItemDto,
} from "@coredrill/application";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  CAREER_PROFILE_EDITOR_SECTIONS,
  CareerProfileWorkspace,
  type CareerProfileWorkspaceModel,
} from "../src/index.js";

const ENTRY: CareerProfileEntryDto = Object.freeze({
  id: "0199a100-0000-7000-8000-000000000002" as CareerProfileEntryDto["id"],
  kind: "employment",
  primaryLabel: "Operations Lead",
  secondaryLabel: "Northstar Health",
  startDate: "2024-02-29" as CareerProfileEntryDto["startDate"],
  endDate: null,
  current: true,
  verificationState: "user_confirmed",
  createdAt: "2026-09-27T12:00:00.000Z" as CareerProfileEntryDto["createdAt"],
  rowVersion: 1,
});

const MODEL = Object.freeze({
  loading: false,
  entries: Object.freeze([ENTRY]),
  imports: Object.freeze([]),
} as const satisfies CareerProfileWorkspaceModel);

const renderWorkspace = (model: CareerProfileWorkspaceModel = MODEL) =>
  renderToStaticMarkup(
    createElement(CareerProfileWorkspace, {
      model,
      onImport: async () =>
        applicationFailure({ code: "internal", message: "unused", retryable: false }),
      onSave: async () =>
        applicationFailure({ code: "internal", message: "unused", retryable: false }),
    }),
  );

describe("CareerProfileWorkspace", () => {
  it("freezes the manual section vocabulary without pulling later story or AI work forward", () => {
    expect(CAREER_PROFILE_EDITOR_SECTIONS.map(({ id }) => id)).toEqual([
      "basics",
      "employment",
      "education",
      "project",
      "skill",
      "accomplishment",
      "certification",
      "publication",
      "volunteer",
    ]);
    const markup = renderWorkspace();
    expect(markup).toContain("accepting or resolving import conflicts");
    expect(markup).toContain("story/evidence linking");
    expect(markup).toContain("AI-assisted drafting");
  });

  it("renders an accessible local-only editor with explicit verification behavior", () => {
    const markup = renderWorkspace();
    expect(markup).toContain('data-testid="career-profile-workspace"');
    expect(markup).toContain('aria-label="Career Profile sections"');
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('role="tabpanel"');
    expect(markup).toContain("Manual entries stay on this device");
    expect(markup).toContain("User-confirmed on save");
    expect(markup).toContain('name="displayName"');
    expect(markup).toContain('name="targetRoles"');
    expect(markup).toContain('name="workModes"');
    expect(markup).toContain('accept=".docx,.pdf,.md,.markdown,.txt');
    expect(markup).toContain("never overwrite saved information");
  });

  it("renders imported evidence as pending source-backed proposals, never verified facts", () => {
    const queued: ResumeImportQueueItemDto = Object.freeze({
      completedAt: "2026-09-27T14:00:00.000Z" as ResumeImportQueueItemDto["completedAt"],
      id: "0199a200-0000-7000-8000-000000000001" as ResumeImportQueueItemDto["id"],
      proposalCount: 1,
      proposals: Object.freeze([
        Object.freeze({
          confidence: 0.82,
          evidenceStatus: "proposal",
          fieldName: "organization",
          groupKey: "block-8",
          id: "0199a200-0000-7000-8000-000000000002" as ResumeImportQueueItemDto["proposals"][number]["id"],
          importRunId:
            "0199a200-0000-7000-8000-000000000001" as ResumeImportQueueItemDto["proposals"][number]["importRunId"],
          proposedValue: "Coredrill Labs",
          reviewState: "pending",
          sourceExcerpt: "Coredrill Labs — Product Engineer — 2024–2026",
          sourcePointer: "/word/document.xml#paragraph=8",
          target: "employment",
        }),
      ]),
      source: Object.freeze({
        byteLength: 4_096,
        fileName: "synthetic-resume.docx",
        format: "docx",
        mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        pageCount: null,
        sha256: "a".repeat(64),
      }),
      status: "completed",
      warnings: Object.freeze([]),
    });
    const markup = renderWorkspace({ ...MODEL, imports: [queued] });

    expect(markup).toContain("Proposal only · not verified");
    expect(markup).toContain("extraction confidence 82%");
    expect(markup).toContain("Coredrill Labs — Product Engineer — 2024–2026");
    expect(markup).toContain("/word/document.xml#paragraph=8");
    expect(markup).not.toContain("Imported as user-confirmed");
  });

  it("fails closed for duplicate identities, unsupported kinds, and excessive records", () => {
    expect(() => renderWorkspace({ ...MODEL, entries: [ENTRY, ENTRY] })).toThrowError(
      "Career Profile workspace model is invalid.",
    );
    expect(() =>
      renderWorkspace({
        ...MODEL,
        entries: [{ ...ENTRY, kind: "story" as never }],
      }),
    ).toThrowError("Career Profile workspace model is invalid.");
    expect(() =>
      renderWorkspace({
        ...MODEL,
        entries: Array.from({ length: 10_001 }, (_, index) => ({
          ...ENTRY,
          id: `0199a100-0000-7000-8000-${String(index).padStart(12, "0")}` as CareerProfileEntryDto["id"],
        })),
      }),
    ).toThrowError("Career Profile workspace model is invalid.");
  });
});
