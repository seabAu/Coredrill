import {
  compareDocumentEditorText,
  type ApplicationResult,
  type CreateDocumentEditorVersionInput,
  type DocumentEditorSessionDto,
  type SaveDocumentEditorDraftInput,
} from "@coredrill/application";
import {
  createDocumentAutosaveCoordinator,
  documentIrToPlainText,
  parseDocumentIr,
  type DocumentAutosaveCoordinator,
  type DocumentAutosaveStatus,
  type DocumentIntermediateRepresentationV1,
} from "@coredrill/documents";
import {
  createRestrictedDocumentEditor,
  runRestrictedDocumentEditorCommand,
  type RestrictedDocumentEditorOptions,
  type RestrictedDocumentEditorCommand,
} from "@coredrill/documents/editor";
import { useEffect, useMemo, useRef, useState } from "react";

export interface DocumentEditorWorkspaceProps {
  readonly session: DocumentEditorSessionDto;
  readonly onClose: () => void;
  readonly onSaveDraft: (
    input: SaveDocumentEditorDraftInput,
  ) => Promise<ApplicationResult<DocumentEditorSessionDto>>;
  readonly onCreateVersion: (
    input: CreateDocumentEditorVersionInput,
  ) => Promise<ApplicationResult<DocumentEditorSessionDto>>;
}

const STATUS_COPY: Readonly<Record<DocumentAutosaveStatus, string>> = Object.freeze({
  idle: "No draft changes",
  pending: "Local changes waiting to save",
  saving: "Saving locally…",
  saved: "Saved locally",
  failed: "Local save failed; your text remains in this editor",
});

const versionLabel = (version: DocumentEditorSessionDto["currentVersion"]): string =>
  `Version ${String(version.versionNumber)}${version.label === null ? "" : ` · ${version.label}`}`;

export const DocumentEditorWorkspace = ({
  session: initialSession,
  onClose,
  onSaveDraft,
  onCreateVersion,
}: DocumentEditorWorkspaceProps) => {
  const [session, setSession] = useState(initialSession);
  const [autosaveStatus, setAutosaveStatus] = useState<DocumentAutosaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [editorReady, setEditorReady] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string>(session.currentVersion.id);
  const initialContent = useMemo(
    () => parseDocumentIr(initialSession.draft?.content ?? initialSession.currentVersion.content),
    [initialSession],
  );
  const [currentContent, setCurrentContent] = useState(initialContent);
  const editorElementRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<ReturnType<typeof createRestrictedDocumentEditor> | null>(null);
  const coordinatorRef =
    useRef<DocumentAutosaveCoordinator<DocumentIntermediateRepresentationV1> | null>(null);
  const sessionRef = useRef(session);
  const currentContentRef = useRef(currentContent);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  useEffect(() => {
    currentContentRef.current = currentContent;
  }, [currentContent]);

  useEffect(() => {
    const element = editorElementRef.current;
    if (element === null) return undefined;
    const coordinator = createDocumentAutosaveCoordinator<DocumentIntermediateRepresentationV1>({
      delayMilliseconds: 600,
      onStatusChange: setAutosaveStatus,
      save: async (content) => {
        const active = sessionRef.current;
        const result = await onSaveDraft({
          documentId: active.documentId,
          baseVersionId: active.currentVersion.id,
          content,
          expectedRowVersion: active.draft?.rowVersion ?? null,
        });
        if (!result.ok) {
          setError(result.error.message);
          throw new Error(result.error.code);
        }
        setError(null);
        sessionRef.current = result.value;
        setSession(result.value);
      },
    });
    coordinatorRef.current = coordinator;
    const options: RestrictedDocumentEditorOptions = {
      element,
      content: initialContent,
      onUpdate: (content) => {
        currentContentRef.current = content;
        setCurrentContent(content);
        coordinator.queue(content);
      },
    };
    const editor = createRestrictedDocumentEditor(options);
    editorRef.current = editor;
    setEditorReady(true);
    return () => {
      coordinator.cancelTimer();
      editor.destroy();
      coordinatorRef.current = null;
      editorRef.current = null;
    };
  }, [initialContent, onSaveDraft]);

  const selectedVersion =
    session.versions.find((version) => version.id === selectedVersionId) ?? session.currentVersion;
  const comparison = useMemo(
    () =>
      compareDocumentEditorText(selectedVersion.plainText, documentIrToPlainText(currentContent)),
    [currentContent, selectedVersion],
  );

  const runEditorCommand = (command: RestrictedDocumentEditorCommand): void => {
    const editor = editorRef.current;
    if (editor === null) return;
    runRestrictedDocumentEditorCommand(editor, command);
  };

  const createVersion = async (): Promise<void> => {
    const coordinator = coordinatorRef.current;
    if (coordinator === null) return;
    try {
      await coordinator.flush();
      const active = sessionRef.current;
      if (active.draft === null) return;
      const result = await onCreateVersion({
        documentId: active.documentId,
        baseVersionId: active.currentVersion.id,
        content: currentContentRef.current,
        expectedDraftRowVersion: active.draft.rowVersion,
        label: label.trim() === "" ? null : label,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      sessionRef.current = result.value;
      setSession(result.value);
      setSelectedVersionId(result.value.currentVersion.id);
      setLabel("");
      setError(null);
      setAutosaveStatus("idle");
    } catch {
      setError("Save the recovered local draft before creating a version.");
    }
  };

  const closeEditor = async (): Promise<void> => {
    try {
      await coordinatorRef.current?.flush();
    } catch {
      return;
    }
    onClose();
  };

  return (
    <section aria-labelledby="document-editor-heading" className="cd-document-editor-workspace">
      <header className="cd-document-editor-header">
        <div>
          <p className="cd-eyebrow">Structured local editor</p>
          <h2 id="document-editor-heading">{session.title}</h2>
          <p>
            {versionLabel(session.currentVersion)} is immutable. Autosave keeps a recoverable local
            draft; only Create version adds to history.
          </p>
        </div>
        <button
          onClick={() => {
            void closeEditor();
          }}
          type="button"
        >
          Back to documents
        </button>
      </header>

      {initialSession.draft === null ? null : (
        <p className="cd-document-editor-recovered" role="status">
          Recovered a local draft saved {initialSession.draft.updatedAt.slice(0, 16)}.
        </p>
      )}
      {error === null ? null : (
        <div className="cd-document-editor-error" role="alert">
          <span>{error}</span>
          <button
            onClick={() => {
              void coordinatorRef.current?.retry();
            }}
            type="button"
          >
            Retry local save
          </button>
        </div>
      )}

      <div className="cd-document-editor-layout">
        <section aria-label="Document editing surface" className="cd-document-editor-main">
          <div
            aria-label="Document formatting"
            className="cd-document-editor-toolbar"
            role="toolbar"
          >
            {(
              [
                ["undo", "Undo"],
                ["redo", "Redo"],
                ["bold", "Bold"],
                ["italic", "Italic"],
                ["bullet", "Bullet list"],
                ["ordered", "Numbered list"],
              ] as const
            ).map(([command, actionLabel]) => (
              <button
                disabled={!editorReady}
                key={command}
                onClick={() => {
                  runEditorCommand(command);
                }}
                type="button"
              >
                {actionLabel}
              </button>
            ))}
          </div>
          <p id="editor-help">
            Paste is reduced to paragraphs, headings, lists, bold, italic, and safe links. Undo and
            redo remain local until autosave records the resulting draft.
          </p>
          <div className="cd-document-editor-surface" ref={editorElementRef} />
          <div className="cd-document-editor-save-row">
            <span aria-live="polite" data-document-autosave={autosaveStatus} role="status">
              {STATUS_COPY[autosaveStatus]}
            </span>
            <label>
              <span>Version label (optional)</span>
              <input
                maxLength={256}
                onChange={(event) => {
                  setLabel(event.currentTarget.value);
                }}
                value={label}
              />
            </label>
            <button
              disabled={autosaveStatus === "saving" || session.draft === null}
              onClick={() => {
                void createVersion();
              }}
              type="button"
            >
              Create version
            </button>
          </div>
        </section>

        <aside aria-labelledby="document-history-heading" className="cd-document-editor-history">
          <h3 id="document-history-heading">Version history and comparison</h3>
          <label>
            <span>Compare draft with</span>
            <select
              onChange={(event) => {
                setSelectedVersionId(event.currentTarget.value);
              }}
              value={selectedVersionId}
            >
              {[...session.versions].reverse().map((version) => (
                <option key={version.id} value={version.id}>
                  {versionLabel(version)}
                </option>
              ))}
            </select>
          </label>
          <p>
            {comparison.changedLineCount === 0
              ? "No line changes from the selected version."
              : `${String(comparison.changedLineCount)} changed line${comparison.changedLineCount === 1 ? "" : "s"}.`}
          </p>
          <div className="cd-document-comparison-scroll">
            <table>
              <caption>Selected immutable version compared with the current local draft</caption>
              <thead>
                <tr>
                  <th scope="col">Line</th>
                  <th scope="col">Before</th>
                  <th scope="col">Current draft</th>
                </tr>
              </thead>
              <tbody>
                {comparison.rows.map((row) => (
                  <tr data-changed={row.changed} key={row.lineNumber}>
                    <th scope="row">{row.lineNumber}</th>
                    <td>{row.before ?? "—"}</td>
                    <td>{row.after ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </aside>
      </div>

      <aside aria-label="Document editor capability boundary" className="cd-documents-boundary">
        <strong>Local editing only:</strong> no account, network request, AI provider, generation,
        export orchestration, or application submission is involved.
      </aside>
    </section>
  );
};
