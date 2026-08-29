import { useId, useRef, useState, type DragEvent } from "react";

import { Icon } from "./icon.js";

export const BOARD_SEMANTIC_CATEGORIES = Object.freeze([
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
] as const);
export type BoardSemanticCategory = (typeof BOARD_SEMANTIC_CATEGORIES)[number];

export const BOARD_WARNING_KINDS = Object.freeze([
  "missing-document",
  "unreviewed-source",
  "unsupported-claim",
] as const);
export type BoardWarningKind = (typeof BOARD_WARNING_KINDS)[number];

export const BOARD_MOVE_METHODS = Object.freeze(["drag", "keyboard"] as const);
export type BoardMoveMethod = (typeof BOARD_MOVE_METHODS)[number];

export interface BoardStage {
  readonly id: string;
  readonly name: string;
  readonly semanticCategories: readonly BoardSemanticCategory[];
  readonly terminal: boolean;
}

export interface BoardJobCard {
  readonly company: string;
  readonly id: string;
  readonly lastActivity: string;
  readonly location: string;
  readonly nextAction: string | null;
  readonly priority: "high" | "normal" | "low";
  readonly title: string;
  readonly warnings: readonly BoardWarningKind[];
  readonly workMode: "hybrid" | "onsite" | "remote" | "unspecified";
}

export interface BoardColumn {
  readonly items: readonly BoardJobCard[];
  readonly stage: BoardStage;
}

export interface BoardMoveRequest {
  readonly fromStageId: string;
  readonly jobId: string;
  readonly method: BoardMoveMethod;
  readonly requiresReopenConfirmation: boolean;
  readonly toStageId: string;
}

export interface BoardUndoState {
  readonly description: string;
}

export interface PipelineBoardProps {
  readonly announcement?: string;
  readonly columns: readonly BoardColumn[];
  readonly onMoveRequest?: (request: BoardMoveRequest) => void;
  readonly onOpenJob?: (job: BoardJobCard) => void;
  readonly onUndo?: () => void;
  readonly undo?: BoardUndoState | null;
}

const BOARD_ROW_HEIGHT_PX = 208;
const BOARD_WINDOW_SIZE = 8;
const BOARD_OVERSCAN = 2;
const BOARD_TRANSFER_TYPE = "application/x-coredrill-board-job";
const BOARD_STAGE_TRANSFER_TYPE = "application/x-coredrill-board-stage";

const WARNING_COPY: Readonly<Record<BoardWarningKind, string>> = Object.freeze({
  "missing-document": "Missing document",
  "unreviewed-source": "Unreviewed source",
  "unsupported-claim": "Unsupported claim",
});

const assertUnique = (values: readonly string[], label: string): void => {
  if (new Set(values).size !== values.length) throw new RangeError(`${label} must be unique.`);
};

const validateColumns = (columns: readonly BoardColumn[]): void => {
  if (columns.length === 0) throw new RangeError("Pipeline Board requires at least one stage.");
  assertUnique(
    columns.map(({ stage }) => stage.id),
    "Pipeline Board stage IDs",
  );
  assertUnique(
    columns.flatMap(({ items }) => items.map(({ id }) => id)),
    "Pipeline Board job IDs",
  );
  for (const { stage } of columns) {
    if (
      !/^[a-z0-9][a-z0-9-]{0,63}$/.test(stage.id) ||
      stage.name.trim().length === 0 ||
      stage.semanticCategories.length === 0 ||
      stage.semanticCategories.some((category) => !BOARD_SEMANTIC_CATEGORIES.includes(category))
    ) {
      throw new RangeError("Every Pipeline Board stage needs a name and semantic category.");
    }
    assertUnique(stage.semanticCategories, `Pipeline Board stage ${stage.id} categories`);
  }
};

interface VirtualBoardColumnProps {
  readonly activeDrag: BoardMoveRequest | null;
  readonly column: BoardColumn;
  readonly columns: readonly BoardColumn[];
  readonly onDragChange: (request: BoardMoveRequest | null) => void;
  readonly onMoveRequest: PipelineBoardProps["onMoveRequest"];
  readonly onOpenJob: PipelineBoardProps["onOpenJob"];
  readonly readActiveDrag: () => BoardMoveRequest | null;
}

const VirtualBoardColumn = ({
  activeDrag,
  column,
  columns,
  onDragChange,
  onMoveRequest,
  onOpenJob,
  readActiveDrag,
}: VirtualBoardColumnProps) => {
  const [visibleStart, setVisibleStart] = useState(0);
  const safeStart = Math.min(visibleStart, Math.max(0, column.items.length - 1));
  const visibleEnd = Math.min(column.items.length, safeStart + BOARD_WINDOW_SIZE);
  const visibleItems = column.items.slice(safeStart, visibleEnd);
  const topSpacer = safeStart * BOARD_ROW_HEIGHT_PX;
  const bottomSpacer = Math.max(0, column.items.length - visibleEnd) * BOARD_ROW_HEIGHT_PX;

  const createDragRequest = (job: BoardJobCard): BoardMoveRequest => ({
    fromStageId: column.stage.id,
    jobId: job.id,
    method: "drag",
    requiresReopenConfirmation: false,
    toStageId: column.stage.id,
  });

  const beginNativeDrag = (event: DragEvent<HTMLElement>, job: BoardJobCard): void => {
    const request = createDragRequest(job);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(BOARD_TRANSFER_TYPE, job.id);
    event.dataTransfer.setData(BOARD_STAGE_TRANSFER_TYPE, column.stage.id);
    event.dataTransfer.setData("text/plain", `${column.stage.id}:${job.id}`);
    onDragChange(request);
  };

  const moveActiveDragToColumn = (): void => {
    const currentDrag = readActiveDrag();
    const fromStage = columns.find(({ stage }) => stage.id === currentDrag?.fromStageId)?.stage;
    if (currentDrag !== null && currentDrag.fromStageId !== column.stage.id) {
      onMoveRequest?.({
        fromStageId: currentDrag.fromStageId,
        jobId: currentDrag.jobId,
        method: "drag",
        requiresReopenConfirmation: fromStage?.terminal === true && !column.stage.terminal,
        toStageId: column.stage.id,
      });
    }
    onDragChange(null);
  };

  const receiveDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    const currentDrag = readActiveDrag();
    const plainTransfer = event.dataTransfer.getData("text/plain").split(":");
    const transferredJobId = event.dataTransfer.getData(BOARD_TRANSFER_TYPE);
    const plainJobId = plainTransfer[1];
    const jobId =
      transferredJobId === ""
        ? plainJobId === undefined || plainJobId === ""
          ? currentDrag?.jobId
          : plainJobId
        : transferredJobId;
    const transferredStageId = event.dataTransfer.getData(BOARD_STAGE_TRANSFER_TYPE);
    const plainStageId = plainTransfer[0];
    const fromStageId =
      transferredStageId === ""
        ? plainStageId === undefined || plainStageId === ""
          ? currentDrag?.fromStageId
          : plainStageId
        : transferredStageId;
    const fromStage = columns.find(({ stage }) => stage.id === fromStageId)?.stage;
    if (
      jobId !== undefined &&
      jobId !== "" &&
      fromStageId !== undefined &&
      fromStageId !== column.stage.id
    ) {
      onMoveRequest?.({
        fromStageId,
        jobId,
        method: "drag",
        requiresReopenConfirmation: fromStage?.terminal === true && !column.stage.terminal,
        toStageId: column.stage.id,
      });
    }
    onDragChange(null);
  };

  return (
    <section
      aria-labelledby={`board-stage-${column.stage.id}`}
      className="cd-board-column"
      data-board-stage={column.stage.id}
      data-drop-active={activeDrag !== null && activeDrag.fromStageId !== column.stage.id}
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDrop={receiveDrop}
      onPointerUp={(event) => {
        if (event.button === 0) moveActiveDragToColumn();
      }}
    >
      <header className="cd-board-column-heading">
        <div>
          <h4 id={`board-stage-${column.stage.id}`}>{column.stage.name}</h4>
          <small>{column.stage.semanticCategories.join(" · ")}</small>
        </div>
        <span aria-label={`${String(column.items.length)} jobs`}>
          {String(column.items.length)}
        </span>
      </header>
      <div
        aria-label={`${column.stage.name} jobs`}
        className="cd-board-column-scroll"
        data-board-rendered={String(visibleItems.length)}
        data-board-total={String(column.items.length)}
        onScroll={(event) => {
          const nextStart = Math.max(
            0,
            Math.floor(event.currentTarget.scrollTop / BOARD_ROW_HEIGHT_PX) - BOARD_OVERSCAN,
          );
          if (nextStart !== visibleStart) setVisibleStart(nextStart);
        }}
        role="list"
        tabIndex={0}
      >
        <div aria-hidden="true" style={{ blockSize: `${String(topSpacer)}px` }} />
        {visibleItems.map((job) => (
          <li className="cd-board-card" data-board-job={job.id} key={job.id}>
            <div className="cd-board-card-heading">
              <button
                className="cd-board-card-title"
                onClick={() => {
                  onOpenJob?.(job);
                }}
                type="button"
              >
                {job.title}
              </button>
              <span data-priority={job.priority}>{job.priority}</span>
              <span
                aria-hidden="true"
                className="cd-board-drag-handle"
                data-board-drag-handle
                draggable
                onDragEnd={() => {
                  onDragChange(null);
                }}
                onDragStart={(event) => {
                  beginNativeDrag(event, job);
                }}
                onPointerCancel={() => {
                  onDragChange(null);
                }}
                onPointerDown={(event) => {
                  if (event.button === 0) onDragChange(createDragRequest(job));
                }}
              >
                ⋮⋮
              </span>
            </div>
            <strong>{job.company}</strong>
            <p>
              {job.workMode === "unspecified" ? "Work mode not set" : job.workMode} · {job.location}
            </p>
            <p className="cd-board-card-action">
              {job.nextAction ?? "No next action"} · {job.lastActivity}
            </p>
            {job.warnings.length === 0 ? null : (
              <ul aria-label="Job warnings" className="cd-board-card-warnings">
                {job.warnings.map((warning) => (
                  <li key={warning}>
                    <Icon decorative name="alert-triangle" size={13} />
                    {WARNING_COPY[warning]}
                  </li>
                ))}
              </ul>
            )}
            <label className="cd-board-move-control">
              <span>Move</span>
              <select
                aria-label={`Move ${job.title} to stage`}
                onChange={(event) => {
                  if (event.target.value !== column.stage.id) {
                    const targetStage = columns.find(
                      ({ stage }) => stage.id === event.target.value,
                    )?.stage;
                    onMoveRequest?.({
                      fromStageId: column.stage.id,
                      jobId: job.id,
                      method: "keyboard",
                      requiresReopenConfirmation:
                        column.stage.terminal && targetStage?.terminal === false,
                      toStageId: event.target.value,
                    });
                  }
                }}
                value={column.stage.id}
              >
                {columns.map(({ stage }) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                  </option>
                ))}
              </select>
            </label>
          </li>
        ))}
        <div aria-hidden="true" style={{ blockSize: `${String(bottomSpacer)}px` }} />
      </div>
    </section>
  );
};

export const PipelineBoard = ({
  announcement = "",
  columns,
  onMoveRequest,
  onOpenJob,
  onUndo,
  undo = null,
}: PipelineBoardProps) => {
  validateColumns(columns);
  const headingId = useId();
  const [activeDrag, setActiveDrag] = useState<BoardMoveRequest | null>(null);
  const activeDragReference = useRef<BoardMoveRequest | null>(null);
  const updateActiveDrag = (request: BoardMoveRequest | null): void => {
    activeDragReference.current = request;
    setActiveDrag(request);
  };

  return (
    <section aria-labelledby={headingId} className="cd-board" data-testid="pipeline-board">
      <div className="cd-board-heading">
        <div>
          <p className="cd-eyebrow">Board</p>
          <h3 id={headingId}>Move opportunities with context intact</h3>
        </div>
        <p>Drag a card or use its Move control. Every durable move requires a timeline event.</p>
      </div>

      <p aria-live="polite" className="cd-board-announcement" role="status">
        {announcement}
      </p>

      {undo === null ? null : (
        <div className="cd-board-undo" role="region" aria-label="Undo status move">
          <span>{undo.description}</span>
          <button className="cd-button cd-button-secondary" onClick={onUndo} type="button">
            Undo move
          </button>
        </div>
      )}

      <div aria-label="Pipeline Board" className="cd-board-columns">
        {columns.map((column) => (
          <VirtualBoardColumn
            activeDrag={activeDrag}
            column={column}
            columns={columns}
            key={column.stage.id}
            onDragChange={updateActiveDrag}
            onMoveRequest={onMoveRequest}
            onOpenJob={onOpenJob}
            readActiveDrag={() => activeDragReference.current}
          />
        ))}
      </div>
    </section>
  );
};
