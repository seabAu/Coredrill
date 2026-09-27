import type { DocumentWorkspaceItemDto } from "@coredrill/application";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  DOCUMENTS_WORKSPACE_VIEWS,
  DocumentsWorkspace,
  type DocumentsWorkspaceModel,
} from "../src/index.js";

const resume = Object.freeze({
  id: "0199b200-0000-7000-8000-000000000001",
  kind: "resume" as const,
  title: "Northstar resume",
  lineageRole: "job_derivative" as const,
  baseDocumentId: "0199b200-0000-7000-8000-000000000002",
  baseDocumentTitle: "Product operations base",
  templateDocumentId: "0199b200-0000-7000-8000-000000000003",
  templateDocumentTitle: "Concise resume template",
  relatedJob: Object.freeze({
    id: "0199b200-0000-7000-8000-000000000004",
    title: "Product Operations Lead",
    companyName: "Northstar Health",
  }),
  lastEditedAt: "2026-09-27T20:00:00.000Z",
  searchText: "Post-submission document body and linked evidence.",
  latestVersion: Object.freeze({
    id: "0199b200-0000-7000-8000-000000000005",
    versionNumber: 3,
    label: "Application ready",
  }),
  exportStatus: "exported" as const,
  claimStatus: "not_evaluated" as const,
  submission: Object.freeze({
    applicationId: "0199b200-0000-7000-8000-000000000006",
    versionId: "0199b200-0000-7000-8000-000000000007",
    versionNumber: 2,
    submittedAt: "2026-09-26T18:00:00.000Z",
    channel: "company_portal",
    role: "resume" as const,
    format: "file" as const,
  }),
}) as unknown as DocumentWorkspaceItemDto;

const template = Object.freeze({
  ...resume,
  id: "0199b200-0000-7000-8000-000000000008",
  title: "Concise resume template",
  lineageRole: "template" as const,
  baseDocumentId: null,
  baseDocumentTitle: null,
  templateDocumentId: null,
  templateDocumentTitle: null,
  relatedJob: null,
  exportStatus: "not_exported" as const,
  submission: null,
}) as unknown as DocumentWorkspaceItemDto;

const model: DocumentsWorkspaceModel = {
  items: Object.freeze([resume, template]),
  loading: false,
  error: null,
};

describe("DocumentsWorkspace", () => {
  it("freezes the six accepted views and exposes their local counts", () => {
    expect(DOCUMENTS_WORKSPACE_VIEWS.map(({ id }) => id)).toEqual([
      "all",
      "resumes",
      "cover_letters",
      "answers",
      "templates",
      "submitted",
    ]);
    const markup = renderToStaticMarkup(createElement(DocumentsWorkspace, { model }));
    for (const label of ["All", "Resumes", "Cover letters", "Answers", "Templates", "Submitted"]) {
      expect(markup).toContain(label);
    }
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('role="tabpanel"');
  });

  it("renders lineage, related job, version, export, claim, and exact submitted state", () => {
    const markup = renderToStaticMarkup(createElement(DocumentsWorkspace, { model }));

    expect(markup).toContain("Northstar resume");
    expect(markup).toContain("Job derivative");
    expect(markup).toContain("Base: Product operations base");
    expect(markup).toContain("Template: Concise resume template");
    expect(markup).toContain("Product Operations Lead · Northstar Health");
    expect(markup).toContain("Version 3");
    expect(markup).toContain("Export available");
    expect(markup).toContain("Claims not evaluated");
    expect(markup).toContain("Submitted version 2");
    expect(markup).toContain("exact file");
  });

  it("keeps the no-network and later-capability boundary explicit", () => {
    const markup = renderToStaticMarkup(createElement(DocumentsWorkspace, { model }));

    expect(markup).toContain("Nothing here uploads or submits a document.");
    expect(markup).toContain("Local read-only view");
    expect(markup).toContain("Mark Applied remain separate reviewed steps");
  });
});
