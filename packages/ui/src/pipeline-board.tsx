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
  /** Read-only grouping for jobs with no status; never a stored status/category. */
  readonly unassigned?: boolean;
}

export interface BoardJobCard {
  readonly rowVersion?: number;
  readonly company: string;
  readonly id: string;
  readonly lastActivity: string;
  readonly location: string;
  readonly nextAction: string | null;
  readonly priority: "high" | "normal" | "low" | null;
  readonly title: string;
  readonly warnings: readonly BoardWarningKind[];
  readonly workMode: "hybrid" | "onsite" | "remote" | "unspecified";
}

export interface BoardColumn {
  readonly items: readonly BoardJobCard[];
  readonly stage: BoardStage;
}

export interface BoardMoveRequest {
  readonly expectedRowVersion?: number;
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
  readonly viewName?: string;
  readonly announcement?: string;
  readonly columns: readonly BoardColumn[];
  readonly onMoveRequest?: (request: BoardMoveRequest) => void;
  readonly moveUnavailableReason?: string;
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
  if (
    columns.some(({ items }) =>
      items.some(
        ({ rowVersion }) =>
          rowVersion !== undefined && (!Number.isSafeInteger(rowVersion) || rowVersion < 1),
      ),
    )
  )
    throw new RangeError("Board row versions must be positive safe integers.");
  for (const { stage } of columns) {
    if (
      stage.unassigned === true &&
      (stage.id !== "unassigned" || stage.semanticCategories.length !== 0 || stage.terminal)
    ) {
      throw new RangeError("Unassigned must not claim stored status semantics.");
    }
    if (
      !/^[a-z0-9][a-z0-9-]{0,63}$/.test(stage.id) ||
      stage.name.trim().length === 0 ||
      (stage.semanticCategories.length === 0 && stage.unassigned !== true) ||
      (stage.id === "unassigned" && stage.unassigned !== true) ||
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
  readonly moveHelpId: string;
  readonly boardHeadingId: string;
}

const VirtualBoardColumn = ({
  activeDrag,
  column,
  columns,
  onDragChange,
  onMoveRequest,
  onOpenJob,
  readActiveDrag,
  moveHelpId,
  boardHeadingId,
}: VirtualBoardColumnProps) => {
  const stageHeadingId = `${boardHeadingId}-stage-${column.stage.id}`;
  const canMove =
    onMoveRequest !== undefined &&
    columns.some(({ stage }) => stage.id !== column.stage.id && stage.unassigned !== true);
  const canReceive = onMoveRequest !== undefined && column.stage.unassigned !== true;
  const [visibleStart, setVisibleStart] = useState(0);
  const safeStart = Math.min(visibleStart, Math.max(0, column.items.length - 1));
  const visibleEnd = Math.min(column.items.length, safeStart + BOARD_WINDOW_SIZE);
  const visibleItems = column.items.slice(safeStart, visibleEnd);
  const topSpacer = safeStart * BOARD_ROW_HEIGHT_PX;
  const bottomSpacer = Math.max(0, column.items.length - visibleEnd) * BOARD_ROW_HEIGHT_PX;

  const createDragRequest = (job: BoardJobCard): BoardMoveRequest => ({
    ...(job.rowVersion === undefined ? {} : { expectedRowVersion: job.rowVersion }),
    fromStageId: column.stage.id,
    jobId: job.id,
    method: "drag",
    requiresReopenConfirmation: false,
    toStageId: column.stage.id,
  });

  const beginNativeDrag = (event: DragEvent<HTMLElement>, job: BoardJobCard): void => {
    if (!canMove) {
      event.preventDefault();
      return;
    }
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
    if (
      canReceive &&
      currentDrag !== null &&
      currentDrag.fromStageId !== column.stage.id &&
      columns.some(
        ({ stage, items }) =>
          stage.id === currentDrag.fromStageId && items.some(({ id }) => id === currentDrag.jobId),
      )
    ) {
      onMoveRequest({
        ...(currentDrag.expectedRowVersion === undefined
          ? {}
          : { expectedRowVersion: currentDrag.expectedRowVersion }),
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
    const sourceJob = columns
      .find(({ stage }) => stage.id === fromStageId)
      ?.items.find(({ id }) => id === jobId);
    const viewedVersion =
      currentDrag?.jobId === jobId && currentDrag?.fromStageId === fromStageId
        ? currentDrag?.expectedRowVersion
        : undefined;
    if (sourceJob?.rowVersion !== undefined && viewedVersion === undefined) {
      onDragChange(null);
      return;
    }
    if (
      canReceive &&
      jobId !== undefined &&
      jobId !== "" &&
      fromStageId !== undefined &&
      fromStageId !== column.stage.id &&
      columns.some(
        ({ stage, items }) => stage.id === fromStageId && items.some(({ id }) => id === jobId),
      )
    ) {
      onMoveRequest({
        ...(viewedVersion === undefined ? {} : { expectedRowVersion: viewedVersion }),
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
      aria-labelledby={`${boardHeadingId}-view ${stageHeadingId}`}
      className="cd-board-column"
      data-board-stage={column.stage.id}
      data-board-unassigned={column.stage.unassigned === true ? "true" : undefined}
      data-drop-active={
        canReceive && activeDrag !== null && activeDrag.fromStageId !== column.stage.id
      }
      onDragOver={(event) => {
        if (canReceive) event.preventDefault();
      }}
      onDrop={receiveDrop}
      onPointerUp={(event) => {
        if (event.button === 0) moveActiveDragToColumn();
      }}
    >
      <header className="cd-board-column-heading">
        <div>
          <h4 id={stageHeadingId}>{column.stage.name}</h4>
          <small>
            {column.stage.unassigned === true
              ? "No status assigned"
              : column.stage.semanticCategories.join(" · ")}
          </small>
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
                disabled={onOpenJob === undefined}
                onClick={() => {
                  onOpenJob?.(job);
                }}
                type="button"
              >
                {job.title}
              </button>
              <span data-priority={job.priority}>{job.priority ?? "Unknown priority"}</span>
              <span
                aria-hidden="true"
                className="cd-board-drag-handle"
                data-board-drag-handle
                draggable={canMove}
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
                  if (canMove && event.button === 0) onDragChange(createDragRequest(job));
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
                aria-describedby={moveHelpId}
                disabled={!canMove}
                onChange={(event) => {
                  if (event.target.value !== column.stage.id) {
                    const targetStage = columns.find(
                      ({ stage }) => stage.id === event.target.value,
                    )?.stage;
                    if (targetStage === undefined || targetStage.unassigned === true || !canMove)
                      return;
                    onMoveRequest({
                      ...(job.rowVersion === undefined
                        ? {}
                        : { expectedRowVersion: job.rowVersion }),
                      fromStageId: column.stage.id,
                      jobId: job.id,
                      method: "keyboard",
                      requiresReopenConfirmation: column.stage.terminal && !targetStage.terminal,
                      toStageId: event.target.value,
                    });
                  }
                }}
                value={column.stage.id}
              >
                {columns.map(({ stage }) => (
                  <option disabled={stage.unassigned === true} key={stage.id} value={stage.id}>
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
  viewName = "Pipeline",
  announcement = "",
  columns,
  onMoveRequest,
  moveUnavailableReason = "Stage moves are unavailable in this view.",
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
    <section
      aria-labelledby={`${headingId} ${headingId}-view`}
      className="cd-board"
      data-board-total={columns.reduce((count, column) => count + column.items.length, 0)}
      data-testid="pipeline-board"
    >
      <div className="cd-board-heading">
        <span className="cd-visually-hidden" id={`${headingId}-view`}>
          {viewName}
        </span>
        <div>
          <p className="cd-eyebrow">Board</p>
          <h3 id={headingId}>
            {onMoveRequest === undefined ? "Review" : "Move"} opportunities with context intact
          </h3>
        </div>
        <p id={`${headingId}-moves`}>
          {onMoveRequest === undefined
            ? moveUnavailableReason
            : "Drag a card or use its Move control. Every durable move requires a timeline event. Unassigned is not a move destination."}
        </p>
      </div>

      <p aria-live="polite" className="cd-board-announcement" role="status">
        {announcement}
      </p>

      {undo === null ? null : (
        <div className="cd-board-undo" role="region" aria-label="Undo status move">
          <span>{undo.description}</span>
          <button
            className="cd-button cd-button-secondary"
            disabled={onUndo === undefined}
            onClick={onUndo}
            type="button"
          >
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
            moveHelpId={`${headingId}-moves`}
            boardHeadingId={headingId}
          />
        ))}
      </div>
    </section>
  );
};
