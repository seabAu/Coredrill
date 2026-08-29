import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  PIPELINE_BULK_ACTION_IDS,
  PIPELINE_VIEW_IDS,
  PipelineShell,
  type PipelineShellModel,
} from "../src/index.js";

const MODEL = Object.freeze({
  activeSavedViewId: "active-search",
  activeView: "board",
  filters: Object.freeze([
    { id: "status", label: "Status · Active" },
    { id: "priority", label: "Priority · High" },
  ]),
  inboxCount: 3,
  matchingCount: 8,
  savedViews: Object.freeze([
    { id: "all", label: "All opportunities" },
    { id: "active-search", label: "Active search" },
  ]),
  searchQuery: "",
  selectedCount: 0,
  sortLabel: "Recently updated",
  totalCount: 12,
} as const satisfies PipelineShellModel);

const renderPipeline = (model: PipelineShellModel) =>
  renderToStaticMarkup(createElement(PipelineShell, { model }));

describe("PipelineShell contract", () => {
  it("freezes peer views and safe bulk actions", () => {
    expect(PIPELINE_VIEW_IDS).toEqual(["inbox", "board", "table", "discover"]);
    expect(PIPELINE_BULK_ACTION_IDS).toEqual(["change-status", "add-tags", "archive"]);
  });

  it("keeps saved views, removable filters, search, and record scope visible", () => {
    const markup = renderPipeline(MODEL);

    expect(markup).toContain("Inbox 3");
    expect(markup).toContain('data-pipeline-view-option="board"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain("Active search");
    expect(markup).toContain("Remove filter Status · Active");
    expect(markup).toContain("Remove filter Priority · High");
    expect(markup).toContain("Search jobs and companies…");
    expect(markup).toContain("Current Pipeline · jobs and companies");
    expect(markup).toContain('maxLength="512"');
    expect(markup).toContain('data-pipeline-view="board"');
    expect(markup).toContain("8</strong> matching of 12");
    expect(markup).not.toContain("jobs selected");
  });

  it("exposes the bulk-action shell only for an explicit selection", () => {
    const markup = renderPipeline({ ...MODEL, selectedCount: 2 });

    expect(markup).toContain('aria-label="Bulk actions"');
    expect(markup).toContain("2 jobs selected");
    expect(markup).toContain("Change status");
    expect(markup).toContain("Add tags");
    expect(markup).toContain("Archive");
    expect(markup).toContain("Clear selection");
  });

  it("rejects impossible counts and missing saved-view state", () => {
    expect(() => renderPipeline({ ...MODEL, matchingCount: 13 })).toThrowError(
      "Pipeline matching count cannot exceed the total count.",
    );
    expect(() => renderPipeline({ ...MODEL, activeSavedViewId: "missing" })).toThrowError(
      "Pipeline active saved view must exist in the supplied saved views.",
    );
  });
});
