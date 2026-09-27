import { safeParsePageCaptureSnapshot, type PageCaptureSnapshot } from "./page-capture.js";

export const EXTENSION_CAPTURE_DRAFT_SPEC_VERSION = 1 as const;
export const EXTENSION_CAPTURE_DRAFT_LIMITS = Object.freeze({
  maxCorrectionCharacters: 1024,
  maxNoteCharacters: 4096,
});

export interface ExtensionCaptureDraftV1 {
  readonly specVersion: typeof EXTENSION_CAPTURE_DRAFT_SPEC_VERSION;
  readonly capturedAt: string;
  readonly snapshot: PageCaptureSnapshot;
  readonly corrections?: {
    readonly title?: string;
    readonly company?: string;
  };
  readonly note?: string;
}

export type ExtensionCaptureDraftValidationResult =
  | { readonly success: true; readonly data: ExtensionCaptureDraftV1 }
  | { readonly success: false; readonly code: "draft_invalid"; readonly issue: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(record).every((key) => allowed.has(key));
}

function isInstant(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) {
    return false;
  }
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function isBoundedUserText(value: unknown, maximum: number): value is string {
  const hasForbiddenControl =
    typeof value === "string" &&
    Array.from(value).some((character) => {
      const code = character.charCodeAt(0);
      return (code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127;
    });
  return (
    typeof value === "string" &&
    value.trim() === value &&
    value.length > 0 &&
    value.length <= maximum &&
    !hasForbiddenControl
  );
}

/** Strict boundary for the in-memory side-panel preview and explicit queue action. */
export function safeParseExtensionCaptureDraftV1(
  input: unknown,
): ExtensionCaptureDraftValidationResult {
  if (
    !isRecord(input) ||
    !hasOnlyKeys(input, ["specVersion", "capturedAt", "snapshot", "corrections", "note"]) ||
    input["specVersion"] !== EXTENSION_CAPTURE_DRAFT_SPEC_VERSION ||
    !isInstant(input["capturedAt"])
  ) {
    return { success: false, code: "draft_invalid", issue: "Capture draft metadata is invalid." };
  }

  const parsedSnapshot = safeParsePageCaptureSnapshot(input["snapshot"]);
  if (!parsedSnapshot.success) {
    return { success: false, code: "draft_invalid", issue: parsedSnapshot.issue };
  }

  const corrections = input["corrections"];
  let parsedCorrections: ExtensionCaptureDraftV1["corrections"];
  if (corrections !== undefined) {
    if (!isRecord(corrections) || !hasOnlyKeys(corrections, ["title", "company"])) {
      return { success: false, code: "draft_invalid", issue: "Capture corrections are invalid." };
    }
    const title = corrections["title"];
    const company = corrections["company"];
    if (
      (title !== undefined &&
        !isBoundedUserText(title, EXTENSION_CAPTURE_DRAFT_LIMITS.maxCorrectionCharacters)) ||
      (company !== undefined &&
        !isBoundedUserText(company, EXTENSION_CAPTURE_DRAFT_LIMITS.maxCorrectionCharacters)) ||
      (title === undefined && company === undefined)
    ) {
      return { success: false, code: "draft_invalid", issue: "Capture corrections are invalid." };
    }
    parsedCorrections = {
      ...(title === undefined ? {} : { title }),
      ...(company === undefined ? {} : { company }),
    };
  }

  const note = input["note"];
  if (
    note !== undefined &&
    !isBoundedUserText(note, EXTENSION_CAPTURE_DRAFT_LIMITS.maxNoteCharacters)
  ) {
    return { success: false, code: "draft_invalid", issue: "Capture note is invalid." };
  }

  return {
    success: true,
    data: {
      specVersion: EXTENSION_CAPTURE_DRAFT_SPEC_VERSION,
      capturedAt: input["capturedAt"],
      snapshot: parsedSnapshot.data,
      ...(parsedCorrections === undefined ? {} : { corrections: parsedCorrections }),
      ...(note === undefined ? {} : { note }),
    },
  };
}
