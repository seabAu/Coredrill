import {
  DEFAULT_PIPELINE_TABLE_COLUMNS,
  PipelineBoard,
  PipelineTable,
  type BoardColumn,
  type BoardJobCard,
  type BoardMoveRequest,
  type PipelineTableJob,
} from "@coredrill/ui";
import { useEffect, useState } from "react";

const card = (id: string, title: string): BoardJobCard => ({
  id,
  title,
  company: "Synthetic component company",
  location: "Not specified",
  lastActivity: "Synthetic fixture",
  nextAction: null,
  priority: "normal",
  warnings: [],
  workMode: "unspecified",
});
const columns: readonly BoardColumn[] = [
  {
    stage: {
      id: "unassigned",
      name: "Unassigned",
      semanticCategories: [],
      terminal: false,
      unassigned: true,
    },
    items: [card("synthetic-unassigned", "Synthetic unassigned role")],
  },
  {
    stage: {
      id: "local-stage",
      name: "Explicit local stage",
      semanticCategories: ["saved"],
      terminal: false,
    },
    items: [card("synthetic-assigned", "Synthetic assigned role")],
  },
];
const row: PipelineTableJob = {
  id: "synthetic-unassigned",
  title: "Synthetic unassigned role",
  company: "Synthetic component company",
  status: null,
  rowVersion: 1,
  priority: "normal",
  tags: [],
  workMode: "Unspecified",
  location: "Not specified",
  appliedDate: null,
  capturedDate: "2026-10-19",
  disclosedSalary: null,
  marketBand: null,
  matchSummary: null,
  nextActionDate: null,
  lastInteraction: null,
  source: "Synthetic fixture",
};
declare global {
  var coredrillPipelinePresentation: { getMoves(): readonly BoardMoveRequest[] } | undefined;
}

/** Explicit UI-only proof surface. No vault, runtime command, or durable write is composed. */
export const PipelinePresentationCatalog = () => {
  const [moves, setMoves] = useState<readonly BoardMoveRequest[]>([]);
  const [editingAvailable, setEditingAvailable] = useState(true);
  const [removableRows, setRemovableRows] = useState<readonly PipelineTableJob[]>([
    row,
    { ...row, id: "synthetic-other", rowVersion: 2 },
  ]);
  useEffect(() => {
    globalThis.coredrillPipelinePresentation = { getMoves: () => moves };
    return () => {
      globalThis.coredrillPipelinePresentation = undefined;
    };
  }, [moves]);
  return (
    <main className="cd-foundation-catalog">
      <h1>Pipeline presentation capability proof</h1>
      <p>
        Synthetic component fixtures only. No vault is opened and no move, selection or edit is
        persisted.
      </p>
      <section aria-label="Read-only Board example">
        <h2>Read-only Board</h2>
        <PipelineBoard
          viewName="Read-only example"
          columns={columns}
          undo={{ description: "Synthetic undo unavailable" }}
        />
      </section>
      <section aria-label="Handler-backed Board example">
        <h2>Handler-backed Board</h2>
        <PipelineBoard
          viewName="Handler-backed example"
          columns={columns}
          onMoveRequest={(request) => {
            setMoves((current) => [...current, request]);
          }}
        />
        <p role="status">{String(moves.length)} move requests observed; zero persisted.</p>
      </section>
      <section aria-label="Read-only Table example">
        <h2>Read-only Table</h2>
        <PipelineTable
          columnConfiguration={DEFAULT_PIPELINE_TABLE_COLUMNS}
          rows={[row]}
          statusOptions={[{ id: "local-stage", name: "Explicit local stage", terminal: false }]}
          viewName="Synthetic read-only view"
          editUnavailableReason="Editing requires a local command adapter; this example is read-only."
        />
      </section>
      <section aria-label="Temporary edit availability example">
        <h2>Temporary edit availability</h2>
        <button
          type="button"
          onClick={() => {
            setEditingAvailable((current) => !current);
          }}
        >
          {editingAvailable ? "Disable editing" : "Enable editing"}
        </button>
        <PipelineTable
          columnConfiguration={DEFAULT_PIPELINE_TABLE_COLUMNS}
          rows={[row]}
          statusOptions={[{ id: "local-stage", name: "Explicit local stage", terminal: false }]}
          viewName="Synthetic capability transition"
          editUnavailableReason="Editing is temporarily unavailable."
          {...(editingAvailable
            ? {
                onEditRequest: () => ({
                  ok: false as const,
                  error: "Synthetic save not persisted.",
                }),
              }
            : {})}
        />
      </section>
      <section aria-label="Removed edit origin example">
        <h2>Removed edit origin</h2>
        <p>
          Presentation-only row removal. Identical titles must not redirect focus to another job.
        </p>
        <PipelineTable
          columnConfiguration={DEFAULT_PIPELINE_TABLE_COLUMNS}
          rows={removableRows}
          statusOptions={[{ id: "local-stage", name: "Explicit local stage", terminal: false }]}
          viewName="Removed origin fixture"
          editableFields={["status"]}
          onEditRequest={(input) => {
            setRemovableRows((current) => current.filter(({ id }) => id !== input.jobId));
            return {
              ok: true,
              announcement: "Presentation-only row removal; no storage operation.",
            };
          }}
        />
      </section>
    </main>
  );
};
