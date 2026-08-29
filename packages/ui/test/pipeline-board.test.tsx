import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  BOARD_MOVE_METHODS,
  BOARD_SEMANTIC_CATEGORIES,
  BOARD_WARNING_KINDS,
  PipelineBoard,
  type BoardColumn,
  type BoardJobCard,
} from "../src/index.js";

const job = (index: number): BoardJobCard =>
  Object.freeze({
    company: `Company ${String(index)}`,
    id: `job-${String(index)}`,
    lastActivity: index === 0 ? "1 day ago" : `${String(index + 1)} days ago`,
    location: "Remote",
    nextAction: index === 0 ? "Review source" : null,
    priority: index === 0 ? "high" : "normal",
    title: `Role ${String(index)}`,
    warnings: index === 0 ? Object.freeze(["unreviewed-source"] as const) : Object.freeze([]),
    workMode: "remote",
  });

const COLUMNS = Object.freeze([
  {
    items: Object.freeze(Array.from({ length: 10 }, (_, index) => job(index))),
    stage: {
      id: "saved",
      name: "Saved candidate",
      semanticCategories: Object.freeze(["saved"] as const),
      terminal: false,
    },
  },
  {
    items: Object.freeze([]),
    stage: {
      id: "closed",
      name: "Closed candidate",
      semanticCategories: Object.freeze(["rejected", "withdrawn", "archived"] as const),
      terminal: true,
    },
  },
] as const satisfies readonly BoardColumn[]);

const renderBoard = (columns: readonly BoardColumn[] = COLUMNS) =>
  renderToStaticMarkup(
    createElement(PipelineBoard, {
      announcement: "Moved Role 0. Timeline event recorded.",
      columns,
      undo: { description: "Role 0 moved to Closed candidate." },
    }),
  );

describe("PipelineBoard contract", () => {
  it("freezes semantic, warning, and move-method vocabularies", () => {
    expect(BOARD_SEMANTIC_CATEGORIES).toEqual([
      "viewed",
      "saved",
      "preparing",
      "applied",
      "response",
      "interview",
      "offer",
      "rejected",
      "withdrawn",
      "archived",
    ]);
    expect(BOARD_WARNING_KINDS).toEqual([
      "missing-document",
      "unreviewed-source",
      "unsupported-claim",
    ]);
    expect(BOARD_MOVE_METHODS).toEqual(["drag", "keyboard"]);
  });

  it("renders semantic stage metadata and the minimum contextual card facts", () => {
    const markup = renderBoard();

    expect(markup).toContain("Saved candidate");
    expect(markup).toContain("rejected · withdrawn · archived");
    expect(markup).toContain("Role 0");
    expect(markup).toContain("Company 0");
    expect(markup).toContain("remote · Remote");
    expect(markup).toContain("Review source · 1 day ago");
    expect(markup).toContain("Unreviewed source");
    expect(markup).toContain("Move Role 0 to stage");
  });

  it("windows large columns and exposes announcement plus undo alternatives", () => {
    const markup = renderBoard();

    expect(markup).toContain('data-board-total="10"');
    expect(markup).toContain('data-board-rendered="8"');
    expect(markup).toContain('data-board-job="job-7"');
    expect(markup).not.toContain('data-board-job="job-8"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain("Timeline event recorded");
    expect(markup).toContain("Undo move");
  });

  it("rejects duplicate jobs and stages without semantic metadata", () => {
    expect(() => renderBoard(Object.freeze([...COLUMNS, COLUMNS[1]]))).toThrowError(
      "Pipeline Board stage IDs must be unique.",
    );
    expect(() =>
      renderBoard(Object.freeze([COLUMNS[0], { ...COLUMNS[1], items: Object.freeze([job(0)]) }])),
    ).toThrowError("Pipeline Board job IDs must be unique.");
    expect(() =>
      renderBoard(
        Object.freeze([
          {
            ...COLUMNS[0],
            stage: { ...COLUMNS[0].stage, semanticCategories: Object.freeze([]) },
          },
        ]),
      ),
    ).toThrowError("Every Pipeline Board stage needs a name and semantic category.");
  });
});
