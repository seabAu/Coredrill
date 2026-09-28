import type { DocumentEditorSessionDto } from "@coredrill/application";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { DocumentEditorWorkspace } from "../src/index.js";

const content = (text: string) => ({
  specVersion: 1 as const,
  document: {
    type: "doc" as const,
    content: [{ type: "paragraph" as const, content: [{ type: "text" as const, text }] }],
  },
});

const session = Object.freeze({
  documentId: "0199b320-0000-7000-8000-000000000001",
  title: "Northstar resume",
  versions: Object.freeze([
    Object.freeze({
      id: "0199b320-0000-7000-8000-000000000002",
      versionNumber: 1,
      content: content("Original evidence"),
      plainText: "Original evidence",
      label: "Initial version",
      createdAt: "2026-09-27T20:00:00.000Z",
      parentVersionId: null,
      contentHash: "a".repeat(64),
    }),
  ]),
  currentVersion: Object.freeze({
    id: "0199b320-0000-7000-8000-000000000002",
    versionNumber: 1,
    content: content("Original evidence"),
    plainText: "Original evidence",
    label: "Initial version",
    createdAt: "2026-09-27T20:00:00.000Z",
    parentVersionId: null,
    contentHash: "a".repeat(64),
  }),
  draft: Object.freeze({
    baseVersionId: "0199b320-0000-7000-8000-000000000002",
    content: content("Recovered evidence"),
    plainText: "Recovered evidence",
    updatedAt: "2026-09-27T20:30:00.000Z",
    rowVersion: 2,
  }),
}) as unknown as DocumentEditorSessionDto;

describe("DocumentEditorWorkspace", () => {
  it("renders recovered-draft, structured editing, explicit version, and comparison semantics", () => {
    const markup = renderToStaticMarkup(
      createElement(DocumentEditorWorkspace, {
        session,
        onClose: vi.fn(),
        onSaveDraft: vi.fn(),
        onCreateVersion: vi.fn(),
      }),
    );

    expect(markup).toContain("Structured local editor");
    expect(markup).toContain("Recovered a local draft saved");
    expect(markup).toContain('role="toolbar"');
    expect(markup).toContain("Undo");
    expect(markup).toContain("Redo");
    expect(markup).toContain(
      "Paste is reduced to paragraphs, headings, lists, bold, italic, and safe links",
    );
    expect(markup).toContain("Create version");
    expect(markup).toContain("Version history and comparison");
    expect(markup).toContain("Selected immutable version compared with the current local draft");
    expect(markup).toContain("1 changed line");
  });

  it("states the local-only, AI-disabled capability boundary", () => {
    const markup = renderToStaticMarkup(
      createElement(DocumentEditorWorkspace, {
        session,
        onClose: vi.fn(),
        onSaveDraft: vi.fn(),
        onCreateVersion: vi.fn(),
      }),
    );

    expect(markup).toContain("Local editing only");
    expect(markup).toContain("no account, network request, AI provider");
    expect(markup).toContain("no account, network request, AI provider, generation");
  });
});
