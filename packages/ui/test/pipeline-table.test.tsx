import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_PIPELINE_TABLE_COLUMNS,
  PIPELINE_TABLE_COLUMN_IDS,
  PIPELINE_TABLE_EDIT_FIELDS,
  PipelineTable,
  type PipelineTableColumnConfiguration,
  type PipelineTableEditResult,
  type PipelineTableJob,
  type PipelineTableStatusOption,
} from "../src/index.js";

const STATUSES = Object.freeze([
  { id: "saved", name: "Saved", terminal: false },
  { id: "closed", name: "Closed", terminal: true },
] as const satisfies readonly PipelineTableStatusOption[]);

const row = (index: number): PipelineTableJob =>
  Object.freeze({
    appliedDate: index % 2 === 0 ? "2026-08-20" : null,
    capturedDate: "2026-08-19",
    company: `Company ${String(index)}`,
    disclosedSalary: index === 0 ? "$120k–$145k" : null,
    id: `job-${String(index)}`,
    lastInteraction: index === 0 ? "Yesterday" : null,
    location: "United States",
    marketBand: index === 0 ? "$118k–$151k local estimate" : null,
    matchSummary: index === 0 ? "6 of 8 requirements have linked evidence" : null,
    nextActionDate: index === 0 ? "2026-09-02" : null,
    priority: index === 0 ? "high" : "normal",
    rowVersion: index + 1,
    source: "Company careers page",
    status: index === 14 ? STATUSES[1] : STATUSES[0],
    tags: index === 0 ? Object.freeze(["research", "remote"]) : Object.freeze([]),
    title: `Role ${String(index)}`,
    workMode: "Remote",
  });

const ROWS = Object.freeze(Array.from({ length: 15 }, (_, index) => row(index)));

const renderTable = (
  rows: readonly PipelineTableJob[] = ROWS,
  configuration: readonly PipelineTableColumnConfiguration[] = DEFAULT_PIPELINE_TABLE_COLUMNS,
) =>
  renderToStaticMarkup(
    createElement(PipelineTable, {
      columnConfiguration: configuration,
      onEditRequest: (): PipelineTableEditResult => ({ announcement: "Saved locally.", ok: true }),
      rows,
      statusOptions: STATUSES,
      viewName: "Active search",
    }),
  );

describe("PipelineTable contract", () => {
  it("freezes the reviewed column and editable-field vocabularies", () => {
    expect(PIPELINE_TABLE_COLUMN_IDS).toHaveLength(14);
    expect(PIPELINE_TABLE_EDIT_FIELDS).toEqual(["status", "priority", "tags", "next-action-date"]);
    expect(DEFAULT_PIPELINE_TABLE_COLUMNS.slice(0, 2)).toEqual([
      { id: "title", pinned: true, visible: true, width: 256 },
      { id: "company", pinned: true, visible: true, width: 208 },
    ]);
  });

  it("renders a semantic, contextual table with only low-risk inline edit controls", () => {
    const markup = renderTable();

    expect(markup).toContain("<table");
    expect(markup).toContain("<caption");
    expect(markup).toContain('data-table-pinned="true"');
    expect(markup).toContain("$120k–$145k");
    expect(markup).toContain("6 of 8 requirements have linked evidence");
    expect(markup).toContain("Edit status for Role 0");
    expect(markup).toContain("Edit priority for Role 0");
    expect(markup).toContain("Edit tags for Role 0");
    expect(markup).toContain("Edit next action for Role 0");
    expect(markup).not.toContain("Edit title for Role 0");
    expect(markup).not.toContain("Edit company for Role 0");
  });

  it("windows large datasets and exposes local scroll ownership", () => {
    const markup = renderTable();

    expect(markup).toContain('role="region"');
    expect(markup).toContain('data-table-total="15"');
    expect(markup).toContain('data-table-rendered="12"');
    expect(markup).toContain('data-table-job="job-11"');
    expect(markup).not.toContain('data-table-job="job-12"');
  });

  it("rejects duplicate rows and unsafe column layouts", () => {
    expect(() => renderTable(Object.freeze([row(0), row(0)]))).toThrowError(
      "Pipeline Table job IDs must be unique.",
    );
    expect(() => renderTable(ROWS, DEFAULT_PIPELINE_TABLE_COLUMNS.slice(0, -1))).toThrowError(
      "Pipeline Table configuration must include every column exactly once.",
    );
    expect(() =>
      renderTable(
        ROWS,
        Object.freeze(
          DEFAULT_PIPELINE_TABLE_COLUMNS.map((column) =>
            column.id === "title" ? { ...column, pinned: false } : column,
          ),
        ),
      ),
    ).toThrowError("Pipeline Table title and company must remain leading pinned columns.");
  });
});
