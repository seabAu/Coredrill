import { useId, useState, type CSSProperties } from "react";

export const PIPELINE_TABLE_COLUMN_IDS = Object.freeze([
  "title",
  "company",
  "status",
  "priority",
  "location-work-mode",
  "disclosed-salary",
  "market-band",
  "match-summary",
  "source",
  "captured-date",
  "applied-date",
  "next-action-date",
  "last-interaction",
  "tags",
] as const);
export type PipelineTableColumnId = (typeof PIPELINE_TABLE_COLUMN_IDS)[number];

export const PIPELINE_TABLE_EDIT_FIELDS = Object.freeze([
  "status",
  "priority",
  "tags",
  "next-action-date",
] as const);
export type PipelineTableEditField = (typeof PIPELINE_TABLE_EDIT_FIELDS)[number];
export type PipelineTablePriority = "high" | "normal" | "low";

export interface PipelineTableStatusOption {
  readonly id: string;
  readonly name: string;
  readonly terminal: boolean;
}

export interface PipelineTableJob {
  readonly appliedDate: string | null;
  readonly capturedDate: string;
  readonly company: string;
  readonly disclosedSalary: string | null;
  readonly id: string;
  readonly lastInteraction: string | null;
  readonly location: string;
  readonly marketBand: string | null;
  /** Transparent evidence-oriented summary; never an opaque hiring-probability score. */
  readonly matchSummary: string | null;
  readonly nextActionDate: string | null;
  readonly priority: PipelineTablePriority;
  readonly rowVersion: number;
  readonly source: string;
  readonly status: PipelineTableStatusOption | null;
  readonly tags: readonly string[];
  readonly title: string;
  readonly workMode: string;
}

export interface PipelineTableColumnConfiguration {
  readonly id: PipelineTableColumnId;
  readonly pinned: boolean;
  readonly visible: boolean;
  readonly width: number;
}

interface PipelineTableEditRequestBase {
  readonly expectedRowVersion: number;
  readonly jobId: string;
}

export type PipelineTableEditRequest =
  | (PipelineTableEditRequestBase & {
      readonly field: "status";
      readonly reopenConfirmed: boolean;
      readonly value: string;
    })
  | (PipelineTableEditRequestBase & {
      readonly field: "priority";
      readonly value: PipelineTablePriority;
    })
  | (PipelineTableEditRequestBase & {
      readonly field: "tags";
      readonly value: readonly string[];
    })
  | (PipelineTableEditRequestBase & {
      readonly field: "next-action-date";
      readonly value: string | null;
    });

export type PipelineTableEditResult =
  | { readonly announcement: string; readonly ok: true }
  | { readonly error: string; readonly ok: false };

export interface PipelineTableProps {
  readonly columnConfiguration: readonly PipelineTableColumnConfiguration[];
  readonly onColumnConfigurationChange?: (
    configuration: readonly PipelineTableColumnConfiguration[],
  ) => void;
  readonly onEditRequest: (
    request: PipelineTableEditRequest,
  ) => PipelineTableEditResult | Promise<PipelineTableEditResult>;
  readonly onOpenJob?: (job: PipelineTableJob) => void;
  readonly onSelectionChange?: (job: PipelineTableJob, selected: boolean) => void;
  readonly rows: readonly PipelineTableJob[];
  readonly selectedJobIds?: readonly string[];
  readonly statusOptions: readonly PipelineTableStatusOption[];
  readonly viewName: string;
}

const COLUMN_LABELS: Readonly<Record<PipelineTableColumnId, string>> = Object.freeze({
  "applied-date": "Applied",
  "captured-date": "Captured",
  company: "Company",
  "disclosed-salary": "Disclosed salary",
  "last-interaction": "Last interaction",
  "location-work-mode": "Location / work mode",
  "market-band": "Market band",
  "match-summary": "Evidence coverage",
  "next-action-date": "Next action",
  priority: "Priority",
  source: "Source",
  status: "Status",
  tags: "Tags",
  title: "Title",
});

const DEFAULT_WIDTHS: Readonly<Record<PipelineTableColumnId, number>> = Object.freeze({
  "applied-date": 136,
  "captured-date": 136,
  company: 208,
  "disclosed-salary": 176,
  "last-interaction": 176,
  "location-work-mode": 208,
  "market-band": 176,
  "match-summary": 240,
  "next-action-date": 176,
  priority: 128,
  source: 176,
  status: 160,
  tags: 240,
  title: 256,
});

export const DEFAULT_PIPELINE_TABLE_COLUMNS: readonly PipelineTableColumnConfiguration[] =
  Object.freeze(
    PIPELINE_TABLE_COLUMN_IDS.map((id) =>
      Object.freeze({
        id,
        pinned: id === "title" || id === "company",
        visible: true,
        width: DEFAULT_WIDTHS[id],
      }),
    ),
  );

const TABLE_ROW_HEIGHT_PX = 56;
const TABLE_WINDOW_SIZE = 12;
const TABLE_OVERSCAN = 2;
const SELECTION_COLUMN_WIDTH_PX = 44;
const MINIMUM_COLUMN_WIDTH_PX = 96;
const MAXIMUM_COLUMN_WIDTH_PX = 480;

interface EditorState {
  readonly draft: string;
  readonly error: string | null;
  readonly field: PipelineTableEditField;
  readonly jobId: string;
  readonly pending: boolean;
  readonly reopenConfirmed: boolean;
}

const controlFreeText = (value: string): boolean => {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || codePoint === 0x7f) return false;
  }
  return true;
};

const validateModel = (
  rows: readonly PipelineTableJob[],
  statusOptions: readonly PipelineTableStatusOption[],
  configuration: readonly PipelineTableColumnConfiguration[],
): void => {
  const rowIds = rows.map(({ id }) => id);
  if (new Set(rowIds).size !== rowIds.length) {
    throw new RangeError("Pipeline Table job IDs must be unique.");
  }
  if (
    rows.some(
      ({ id, rowVersion, tags, title }) =>
        id.length === 0 ||
        title.trim().length === 0 ||
        !Number.isSafeInteger(rowVersion) ||
        rowVersion < 1 ||
        new Set(tags.map((tag) => tag.toLocaleLowerCase())).size !== tags.length,
    )
  ) {
    throw new RangeError("Pipeline Table rows require valid identity, version, title, and tags.");
  }
  const statusIds = statusOptions.map(({ id }) => id);
  if (
    new Set(statusIds).size !== statusIds.length ||
    statusOptions.some(({ id, name }) => id.length === 0 || name.trim().length === 0)
  ) {
    throw new RangeError("Pipeline Table status options must be uniquely named records.");
  }
  if (
    rows.some(({ status }) => status !== null && !statusOptions.some(({ id }) => id === status.id))
  ) {
    throw new RangeError("Pipeline Table row status must use a provided status option.");
  }
  const configuredIds = configuration.map(({ id }) => id);
  if (
    configuration.length !== PIPELINE_TABLE_COLUMN_IDS.length ||
    new Set(configuredIds).size !== configuredIds.length ||
    PIPELINE_TABLE_COLUMN_IDS.some((id) => !configuredIds.includes(id))
  ) {
    throw new RangeError("Pipeline Table configuration must include every column exactly once.");
  }
  if (
    configuration.some(
      ({ width }) =>
        !Number.isSafeInteger(width) ||
        width < MINIMUM_COLUMN_WIDTH_PX ||
        width > MAXIMUM_COLUMN_WIDTH_PX,
    )
  ) {
    throw new RangeError("Pipeline Table column widths must stay within reviewed bounds.");
  }
  const title = configuration.find(({ id }) => id === "title");
  const company = configuration.find(({ id }) => id === "company");
  if (
    configuredIds[0] !== "title" ||
    configuredIds[1] !== "company" ||
    title?.visible !== true ||
    !title.pinned ||
    company?.visible !== true ||
    !company.pinned
  ) {
    throw new RangeError("Pipeline Table title and company must remain leading pinned columns.");
  }
  let foundVisibleUnpinned = false;
  for (const column of configuration) {
    if (!column.visible) continue;
    if (!column.pinned) foundVisibleUnpinned = true;
    if (column.pinned && foundVisibleUnpinned) {
      throw new RangeError("Pipeline Table pinned columns must form a leading visible group.");
    }
  }
};

const columnStyle = (width: number, left: number | null): CSSProperties => ({
  inlineSize: `${String(width)}px`,
  left: left === null ? undefined : `${String(left)}px`,
  maxInlineSize: `${String(width)}px`,
  minInlineSize: `${String(width)}px`,
});

const parseIsoDate = (value: string): string | null | undefined => {
  if (value === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value
    ? undefined
    : value;
};

const parseTags = (value: string): readonly string[] | undefined => {
  const tags = value === "" ? [] : value.split(",").map((tag) => tag.trim());
  if (
    tags.length > 20 ||
    tags.some((tag) => tag.length === 0 || tag.length > 40 || !controlFreeText(tag)) ||
    new Set(tags.map((tag) => tag.toLocaleLowerCase())).size !== tags.length
  ) {
    return undefined;
  }
  return Object.freeze(tags);
};

const displayValue = (value: string | null, fallback: string): string => value ?? fallback;

export const PipelineTable = ({
  columnConfiguration,
  onColumnConfigurationChange,
  onEditRequest,
  onOpenJob,
  onSelectionChange,
  rows,
  selectedJobIds = Object.freeze([]),
  statusOptions,
  viewName,
}: PipelineTableProps) => {
  validateModel(rows, statusOptions, columnConfiguration);
  const headingId = useId();
  const [visibleStart, setVisibleStart] = useState(0);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const maximumStart = Math.max(0, rows.length - TABLE_WINDOW_SIZE);
  const safeStart = Math.min(visibleStart, maximumStart);
  const visibleEnd = Math.min(rows.length, safeStart + TABLE_WINDOW_SIZE);
  const visibleRows = rows.slice(safeStart, visibleEnd);
  const visibleColumns = columnConfiguration.filter(({ visible }) => visible);
  const topSpacer = safeStart * TABLE_ROW_HEIGHT_PX;
  const bottomSpacer = Math.max(0, rows.length - visibleEnd) * TABLE_ROW_HEIGHT_PX;
  const tableWidth =
    SELECTION_COLUMN_WIDTH_PX + visibleColumns.reduce((sum, { width }) => sum + width, 0);
  const stickyLeft = new Map<PipelineTableColumnId, number>();
  let nextStickyLeft = SELECTION_COLUMN_WIDTH_PX;
  for (const column of visibleColumns) {
    if (!column.pinned) continue;
    stickyLeft.set(column.id, nextStickyLeft);
    nextStickyLeft += column.width;
  }

  const requestConfiguration = (requested: readonly PipelineTableColumnConfiguration[]): void => {
    validateModel(rows, statusOptions, requested);
    onColumnConfigurationChange?.(Object.freeze(requested.map((column) => Object.freeze(column))));
  };

  const updateColumn = (
    id: PipelineTableColumnId,
    change: Partial<Pick<PipelineTableColumnConfiguration, "pinned" | "visible" | "width">>,
  ): void => {
    const changed = columnConfiguration.map((column) =>
      column.id === id ? { ...column, ...change } : { ...column },
    );
    const required = changed.slice(0, 2);
    const optional = changed.slice(2);
    requestConfiguration(
      Object.freeze([
        ...required,
        ...optional.filter(({ visible, pinned }) => visible && pinned),
        ...optional.filter(({ visible, pinned }) => !visible || !pinned),
      ]),
    );
  };

  const moveColumn = (id: PipelineTableColumnId, offset: -1 | 1): void => {
    const index = columnConfiguration.findIndex((column) => column.id === id);
    const target = index + offset;
    if (index < 2 || target < 2 || target >= columnConfiguration.length) return;
    const sourceColumn = columnConfiguration[index];
    const targetColumn = columnConfiguration[target];
    if (sourceColumn === undefined || targetColumn === undefined) return;
    if (
      sourceColumn.pinned !== targetColumn.pinned &&
      sourceColumn.visible &&
      targetColumn.visible
    ) {
      return;
    }
    const next = columnConfiguration.map((column) => ({ ...column }));
    next[index] = targetColumn;
    next[target] = sourceColumn;
    requestConfiguration(Object.freeze(next));
  };

  const openEditor = (row: PipelineTableJob, field: PipelineTableEditField): void => {
    const draft =
      field === "status"
        ? (row.status?.id ?? "")
        : field === "priority"
          ? row.priority
          : field === "tags"
            ? row.tags.join(", ")
            : (row.nextActionDate ?? "");
    setEditor({ draft, error: null, field, jobId: row.id, pending: false, reopenConfirmed: false });
  };

  const submitEdit = async (row: PipelineTableJob): Promise<void> => {
    if (editor?.jobId !== row.id) return;
    let request: PipelineTableEditRequest;
    if (editor.field === "status") {
      const target = statusOptions.find(({ id }) => id === editor.draft);
      if (target === undefined || target.id === row.status?.id) {
        setEditor({ ...editor, error: "Choose a different valid status." });
        return;
      }
      if (row.status?.terminal === true && !target.terminal && !editor.reopenConfirmed) {
        setEditor({ ...editor, error: "Confirm reopening before changing this closed job." });
        return;
      }
      request = {
        expectedRowVersion: row.rowVersion,
        field: "status",
        jobId: row.id,
        reopenConfirmed: editor.reopenConfirmed,
        value: target.id,
      };
    } else if (editor.field === "priority") {
      if (
        (editor.draft !== "high" && editor.draft !== "normal" && editor.draft !== "low") ||
        editor.draft === row.priority
      ) {
        setEditor({ ...editor, error: "Choose a different valid priority." });
        return;
      }
      request = {
        expectedRowVersion: row.rowVersion,
        field: "priority",
        jobId: row.id,
        value: editor.draft,
      };
    } else if (editor.field === "tags") {
      const tags = parseTags(editor.draft);
      if (tags === undefined) {
        setEditor({
          ...editor,
          error: "Use up to 20 unique comma-separated tags of 40 characters or fewer.",
        });
        return;
      }
      request = {
        expectedRowVersion: row.rowVersion,
        field: "tags",
        jobId: row.id,
        value: tags,
      };
    } else {
      const date = parseIsoDate(editor.draft);
      if (date === undefined || date === row.nextActionDate) {
        setEditor({ ...editor, error: "Enter a different valid date or clear the field." });
        return;
      }
      request = {
        expectedRowVersion: row.rowVersion,
        field: "next-action-date",
        jobId: row.id,
        value: date,
      };
    }

    setEditor({ ...editor, error: null, pending: true });
    let result: PipelineTableEditResult;
    try {
      result = await onEditRequest(Object.freeze(request));
    } catch {
      result = { error: "The local edit failed safely. Your previous value remains.", ok: false };
    }
    if (result.ok) {
      setAnnouncement(result.announcement);
      setEditor(null);
    } else {
      setEditor({ ...editor, error: result.error, pending: false });
    }
  };

  const renderEditor = (row: PipelineTableJob, field: PipelineTableEditField) => {
    if (editor?.jobId !== row.id || editor.field !== field) return null;
    const inputId = `${headingId}-${row.id}-${field}`;
    const errorId = `${inputId}-error`;
    const targetStatus =
      field === "status" ? statusOptions.find(({ id }) => id === editor.draft) : undefined;
    const needsReopenConfirmation =
      field === "status" && row.status?.terminal === true && targetStatus?.terminal === false;
    return (
      <div className="cd-table-editor">
        <label className="cd-visually-hidden" htmlFor={inputId}>
          {COLUMN_LABELS[field]} for {row.title}
        </label>
        {field === "status" ? (
          <select
            aria-describedby={editor.error === null ? undefined : errorId}
            disabled={editor.pending}
            id={inputId}
            onChange={(event) => {
              setEditor({
                ...editor,
                draft: event.target.value,
                error: null,
                reopenConfirmed: false,
              });
            }}
            value={editor.draft}
          >
            <option disabled value="">
              Choose status
            </option>
            {statusOptions.map((status) => (
              <option key={status.id} value={status.id}>
                {status.name}
              </option>
            ))}
          </select>
        ) : field === "priority" ? (
          <select
            aria-describedby={editor.error === null ? undefined : errorId}
            disabled={editor.pending}
            id={inputId}
            onChange={(event) => {
              setEditor({ ...editor, draft: event.target.value, error: null });
            }}
            value={editor.draft}
          >
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
        ) : (
          <input
            aria-describedby={editor.error === null ? undefined : errorId}
            disabled={editor.pending}
            id={inputId}
            onChange={(event) => {
              setEditor({ ...editor, draft: event.target.value, error: null });
            }}
            placeholder={field === "tags" ? "research, remote" : undefined}
            type={field === "next-action-date" ? "date" : "text"}
            value={editor.draft}
          />
        )}
        {needsReopenConfirmation ? (
          <label className="cd-table-reopen-confirmation">
            <input
              checked={editor.reopenConfirmed}
              disabled={editor.pending}
              onChange={(event) => {
                setEditor({ ...editor, error: null, reopenConfirmed: event.target.checked });
              }}
              type="checkbox"
            />
            Confirm reopening this closed job
          </label>
        ) : null}
        {editor.error === null ? null : (
          <p className="cd-field-error" id={errorId} role="alert">
            {editor.error}
          </p>
        )}
        <div className="cd-table-editor-actions">
          <button
            className="cd-button cd-button-primary"
            disabled={editor.pending}
            onClick={() => {
              void submitEdit(row);
            }}
            type="button"
          >
            {editor.pending ? "Saving locally…" : "Save"}
          </button>
          <button
            className="cd-button cd-button-secondary"
            disabled={editor.pending}
            onClick={() => {
              setEditor(null);
            }}
            type="button"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  };

  const editableCell = (row: PipelineTableJob, field: PipelineTableEditField, value: string) => {
    const activeEditor = renderEditor(row, field);
    return (
      activeEditor ?? (
        <div className="cd-table-editable-value">
          <span>{value}</span>
          <button
            aria-label={`Edit ${COLUMN_LABELS[field].toLocaleLowerCase()} for ${row.title}`}
            className="cd-table-edit-button"
            onClick={() => {
              openEditor(row, field);
            }}
            type="button"
          >
            Edit
          </button>
        </div>
      )
    );
  };

  const cellContent = (row: PipelineTableJob, column: PipelineTableColumnId) => {
    switch (column) {
      case "title":
      case "company":
        return (
          <button
            className="cd-table-open-job"
            onClick={() => {
              onOpenJob?.(row);
            }}
            type="button"
          >
            {row[column]}
          </button>
        );
      case "status":
        return editableCell(row, column, row.status?.name ?? "Unassigned");
      case "priority":
        return editableCell(row, column, row.priority);
      case "location-work-mode":
        return `${row.workMode} · ${row.location}`;
      case "disclosed-salary":
        return displayValue(row.disclosedSalary, "Not disclosed");
      case "market-band":
        return displayValue(row.marketBand, "No local band");
      case "match-summary":
        return displayValue(row.matchSummary, "Not evaluated");
      case "source":
        return row.source;
      case "captured-date":
        return row.capturedDate;
      case "applied-date":
        return displayValue(row.appliedDate, "Not applied");
      case "next-action-date":
        return editableCell(row, column, displayValue(row.nextActionDate, "Not set"));
      case "last-interaction":
        return displayValue(row.lastInteraction, "No interaction");
      case "tags":
        return editableCell(row, column, row.tags.length === 0 ? "No tags" : row.tags.join(", "));
    }
  };

  return (
    <section aria-labelledby={headingId} className="cd-table-view" data-testid="pipeline-table">
      <div className="cd-table-heading">
        <div>
          <p className="cd-eyebrow">Table</p>
          <h3 id={headingId}>Compare opportunities without losing context</h3>
        </div>
        <details className="cd-table-column-settings">
          <summary className="cd-button cd-button-secondary">Columns</summary>
          <fieldset>
            <legend>Columns for {viewName}</legend>
            <p>
              Title and company remain visible and pinned. Other choices are saved by this view.
            </p>
            <ol>
              {columnConfiguration.map((column, index) => {
                const required = column.id === "title" || column.id === "company";
                const previous = columnConfiguration[index - 1];
                const next = columnConfiguration[index + 1];
                const canMoveEarlier =
                  !required &&
                  index > 2 &&
                  previous !== undefined &&
                  (!column.visible || !previous.visible || column.pinned === previous.pinned);
                const canMoveLater =
                  !required &&
                  next !== undefined &&
                  (!column.visible || !next.visible || column.pinned === next.pinned);
                return (
                  <li data-column-setting={column.id} key={column.id}>
                    <strong>{COLUMN_LABELS[column.id]}</strong>
                    <label>
                      <input
                        checked={column.visible}
                        disabled={required}
                        onChange={(event) => {
                          updateColumn(column.id, {
                            pinned: event.target.checked ? column.pinned : false,
                            visible: event.target.checked,
                          });
                        }}
                        type="checkbox"
                      />
                      Visible
                    </label>
                    <label>
                      <input
                        checked={column.pinned}
                        disabled={required || !column.visible}
                        onChange={(event) => {
                          updateColumn(column.id, { pinned: event.target.checked });
                        }}
                        type="checkbox"
                      />
                      Pinned
                    </label>
                    <label>
                      Width
                      <input
                        aria-label={`${COLUMN_LABELS[column.id]} width in pixels`}
                        max={MAXIMUM_COLUMN_WIDTH_PX}
                        min={MINIMUM_COLUMN_WIDTH_PX}
                        onChange={(event) => {
                          const width = Number(event.target.value);
                          if (Number.isSafeInteger(width)) updateColumn(column.id, { width });
                        }}
                        step="16"
                        type="number"
                        value={column.width}
                      />
                    </label>
                    <button
                      aria-label={`Move ${COLUMN_LABELS[column.id]} earlier`}
                      disabled={!canMoveEarlier}
                      onClick={() => {
                        moveColumn(column.id, -1);
                      }}
                      type="button"
                    >
                      Earlier
                    </button>
                    <button
                      aria-label={`Move ${COLUMN_LABELS[column.id]} later`}
                      disabled={!canMoveLater}
                      onClick={() => {
                        moveColumn(column.id, 1);
                      }}
                      type="button"
                    >
                      Later
                    </button>
                  </li>
                );
              })}
            </ol>
          </fieldset>
        </details>
      </div>

      <p aria-live="polite" className="cd-table-announcement" role="status">
        {announcement}
      </p>

      <div
        aria-label={`Pipeline Table for ${viewName}`}
        className="cd-table-scroll"
        data-table-rendered={String(visibleRows.length)}
        data-table-total={String(rows.length)}
        onScroll={(event) => {
          const { clientHeight, scrollHeight, scrollTop } = event.currentTarget;
          const nextStart =
            scrollTop + clientHeight >= scrollHeight - 1
              ? maximumStart
              : Math.max(0, Math.floor(scrollTop / TABLE_ROW_HEIGHT_PX) - TABLE_OVERSCAN);
          if (nextStart !== visibleStart) setVisibleStart(nextStart);
        }}
        role="region"
        tabIndex={0}
      >
        <table style={{ inlineSize: `${String(tableWidth)}px` }}>
          <caption className="cd-visually-hidden">
            {String(rows.length)} opportunities in {viewName}. Use the edit buttons for low-risk
            scalar fields; open a job for complex fields.
          </caption>
          <thead>
            <tr>
              <th className="cd-table-selection-cell" scope="col">
                <span className="cd-visually-hidden">Select</span>
              </th>
              {visibleColumns.map((column) => (
                <th
                  className={column.pinned ? "cd-table-pinned-cell" : undefined}
                  data-table-column={column.id}
                  data-table-pinned={column.pinned ? "true" : "false"}
                  key={column.id}
                  scope="col"
                  style={columnStyle(column.width, stickyLeft.get(column.id) ?? null)}
                >
                  {COLUMN_LABELS[column.id]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {topSpacer === 0 ? null : (
              <tr aria-hidden="true" className="cd-table-spacer" style={{ blockSize: topSpacer }}>
                <td colSpan={visibleColumns.length + 1} />
              </tr>
            )}
            {visibleRows.map((row) => (
              <tr data-table-job={row.id} key={row.id}>
                <td className="cd-table-selection-cell">
                  <input
                    aria-label={`Select ${row.title}`}
                    checked={selectedJobIds.includes(row.id)}
                    onChange={(event) => {
                      onSelectionChange?.(row, event.target.checked);
                    }}
                    type="checkbox"
                  />
                </td>
                {visibleColumns.map((column) => (
                  <td
                    className={column.pinned ? "cd-table-pinned-cell" : undefined}
                    data-table-column={column.id}
                    data-table-pinned={column.pinned ? "true" : "false"}
                    key={column.id}
                    style={columnStyle(column.width, stickyLeft.get(column.id) ?? null)}
                  >
                    {cellContent(row, column.id)}
                  </td>
                ))}
              </tr>
            ))}
            {bottomSpacer === 0 ? null : (
              <tr
                aria-hidden="true"
                className="cd-table-spacer"
                style={{ blockSize: bottomSpacer }}
              >
                <td colSpan={visibleColumns.length + 1} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};
