import {
  CAPTURE_ENVELOPE_SPEC_VERSION,
  FIELD_EVIDENCE_SPEC_VERSION,
  safeParseCaptureEnvelopeV1,
  type CaptureEnvelopeV1,
  type ExtractionMethod,
  type FieldCandidateV1,
} from "@coredrill/contracts";

import { sha256CanonicalJson } from "./canonical-json.js";
import {
  safeParsePageCaptureSnapshot,
  type PageCaptureSnapshot,
  type PageFieldCapture,
} from "./page-capture.js";

const DEFAULT_RETENTION_MILLISECONDS = 7 * 24 * 60 * 60 * 1000;
const MAX_FOUR_DIGIT_YEAR_MILLISECONDS = 253_402_300_799_999;
const BASE64_URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export interface CaptureEnvelopeBuildOptions {
  readonly senderId: string;
  readonly sequence: number;
  readonly now?: Date;
  readonly retentionMilliseconds?: number;
  readonly randomBytes?: (length: number) => Uint8Array;
}

export interface SuppliedCaptureFieldV1 {
  readonly value: string;
  readonly rawValue?: string;
}

export interface SuppliedCaptureDraftV1 {
  readonly captureMethod: "manual" | "paste" | "file";
  readonly senderKind: "web_app" | "desktop_app" | "import_tool";
  readonly source: {
    readonly url?: string;
    readonly canonicalUrl?: string;
    readonly pageTitle?: string;
    readonly sourceKind:
      "manual_entry" | "pasted_listing" | "saved_text" | "saved_html" | "saved_json";
  };
  readonly content: {
    readonly selectedText?: string;
    readonly readableText?: string;
    readonly apiPayload?: CaptureEnvelopeV1["content"]["apiPayload"];
  };
  readonly fields?: {
    readonly title?: SuppliedCaptureFieldV1;
    readonly company?: SuppliedCaptureFieldV1;
  };
  readonly captureClient: {
    readonly name: string;
    readonly version: string;
  };
}

export type CaptureEnvelopeBuildResult =
  | { readonly success: true; readonly envelope: CaptureEnvelopeV1; readonly encodedBytes: number }
  | {
      readonly success: false;
      readonly code: "snapshot_invalid" | "envelope_invalid";
      readonly issue: string;
    };

function secureRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

function requireRandomBytes(
  length: number,
  randomBytes: (length: number) => Uint8Array,
): Uint8Array {
  const bytes = randomBytes(length);
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== length) {
    throw new TypeError(`Random source must return exactly ${String(length)} bytes.`);
  }
  return bytes.slice();
}

function uuidV7(timestamp: number, entropy: Uint8Array): string {
  if (!Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp > 0xffffffffffff) {
    throw new RangeError("UUIDv7 timestamp is outside its 48-bit range.");
  }
  if (entropy.byteLength !== 16) throw new TypeError("UUIDv7 requires 16 entropy bytes.");

  const bytes = entropy.slice();
  let remaining = timestamp;
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = remaining % 256;
    remaining = Math.floor(remaining / 256);
  }
  const byte6 = bytes[6];
  const byte8 = bytes[8];
  if (byte6 === undefined || byte8 === undefined)
    throw new TypeError("UUID entropy is incomplete.");
  bytes[6] = (byte6 & 0x0f) | 0x70;
  bytes[8] = (byte8 & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function base64Url(bytes: Uint8Array): string {
  const alphabetAt = (index: number): string => {
    const character = BASE64_URL_ALPHABET[index];
    if (character === undefined) throw new RangeError("Base64url index is invalid.");
    return character;
  };
  let result = "";
  for (let offset = 0; offset < bytes.length; offset += 3) {
    const first = bytes[offset];
    if (first === undefined) break;
    const second = bytes[offset + 1];
    const third = bytes[offset + 2];
    const combined = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);
    result += alphabetAt((combined >>> 18) & 63);
    result += alphabetAt((combined >>> 12) & 63);
    if (second !== undefined) result += alphabetAt((combined >>> 6) & 63);
    if (third !== undefined) result += alphabetAt(combined & 63);
  }
  return result;
}

function createCandidate(
  fieldName: "title" | "company",
  field: {
    readonly value: string;
    readonly rawValue?: string;
    readonly pointer: string;
    readonly method: ExtractionMethod;
    readonly confidence: number;
  },
  sourceId: string,
  capturedAt: string,
  timestamp: number,
  randomBytes: (length: number) => Uint8Array,
  extractor: CaptureEnvelopeV1["captureClient"],
): FieldCandidateV1 {
  return {
    specVersion: FIELD_EVIDENCE_SPEC_VERSION,
    id: uuidV7(timestamp, requireRandomBytes(16, randomBytes)),
    fieldName,
    value: field.value,
    ...(field.rawValue === undefined ? {} : { rawValue: field.rawValue }),
    provenance: {
      specVersion: FIELD_EVIDENCE_SPEC_VERSION,
      source: {
        sourceType: "capture",
        sourceId,
        pointer: field.pointer,
      },
      method: field.method,
      extractor,
      capturedAt,
      confidence: field.confidence,
      sourceExcerpt: (field.rawValue ?? field.value).slice(0, 4096),
    },
  };
}

function fieldEntries(snapshot: PageCaptureSnapshot): ["title" | "company", PageFieldCapture][] {
  const entries: ["title" | "company", PageFieldCapture][] = [];
  if (snapshot.fields.title !== undefined) entries.push(["title", snapshot.fields.title]);
  if (snapshot.fields.company !== undefined) entries.push(["company", snapshot.fields.company]);
  return entries;
}

export type CaptureEnvelopeContentV1 = Pick<
  CaptureEnvelopeV1,
  "source" | "content" | "fieldCandidates"
>;

/** Canonical semantic source snapshot used for deduplication and integrity checks. */
export function captureEnvelopeContentProjectionV1(envelope: CaptureEnvelopeContentV1): unknown {
  return {
    source: envelope.source,
    content: envelope.content,
    fields: [...envelope.fieldCandidates]
      .sort((left, right) => left.fieldName.localeCompare(right.fieldName))
      .map((candidate) => ({
        fieldName: candidate.fieldName,
        value: candidate.value,
        ...(candidate.rawValue === undefined ? {} : { rawValue: candidate.rawValue }),
        pointer: candidate.provenance.source.pointer,
        method: candidate.provenance.method,
      })),
  };
}

export function createCaptureEnvelopeContentHashV1(
  envelope: CaptureEnvelopeContentV1,
): Promise<string> {
  return sha256CanonicalJson(captureEnvelopeContentProjectionV1(envelope));
}

interface EnvelopeDefinitionV1 {
  readonly captureMethod: CaptureEnvelopeV1["captureMethod"];
  readonly senderKind: CaptureEnvelopeV1["sender"]["kind"];
  readonly source: CaptureEnvelopeV1["source"];
  readonly content: CaptureEnvelopeV1["content"];
  readonly fields: readonly (readonly [
    "title" | "company",
    {
      readonly value: string;
      readonly rawValue?: string;
      readonly pointer: string;
      readonly method: ExtractionMethod;
      readonly confidence: number;
    },
  ])[];
  readonly captureClient: CaptureEnvelopeV1["captureClient"];
}

async function buildEnvelopeV1(
  definition: EnvelopeDefinitionV1,
  options: CaptureEnvelopeBuildOptions,
): Promise<CaptureEnvelopeBuildResult> {
  const now = options.now ?? new Date();
  const timestamp = now.getTime();
  const retentionMilliseconds = options.retentionMilliseconds ?? DEFAULT_RETENTION_MILLISECONDS;
  const expiryTimestamp = timestamp + retentionMilliseconds;
  if (
    !Number.isSafeInteger(timestamp) ||
    timestamp < 0 ||
    timestamp > MAX_FOUR_DIGIT_YEAR_MILLISECONDS ||
    !Number.isSafeInteger(options.sequence) ||
    options.sequence < 0 ||
    !Number.isSafeInteger(retentionMilliseconds) ||
    retentionMilliseconds <= 0 ||
    !Number.isSafeInteger(expiryTimestamp) ||
    expiryTimestamp > MAX_FOUR_DIGIT_YEAR_MILLISECONDS
  ) {
    return {
      success: false,
      code: "envelope_invalid",
      issue: "Envelope sequence, timestamp, or retention is invalid.",
    };
  }

  const randomBytes = options.randomBytes ?? secureRandomBytes;
  try {
    const envelopeId = uuidV7(timestamp, requireRandomBytes(16, randomBytes));
    const nonce = base64Url(requireRandomBytes(18, randomBytes));
    const capturedAt = now.toISOString();
    const fieldCandidates = definition.fields.map(([fieldName, field]) =>
      createCandidate(
        fieldName,
        field,
        envelopeId,
        capturedAt,
        timestamp,
        randomBytes,
        definition.captureClient,
      ),
    );
    const semanticContent = {
      source: definition.source,
      content: definition.content,
      fieldCandidates,
    } satisfies CaptureEnvelopeContentV1;
    const contentHash = await createCaptureEnvelopeContentHashV1(semanticContent);
    const envelope = {
      specVersion: CAPTURE_ENVELOPE_SPEC_VERSION,
      id: envelopeId,
      capturedAt,
      expiresAt: new Date(expiryTimestamp).toISOString(),
      captureMethod: definition.captureMethod,
      sender: { kind: definition.senderKind, id: options.senderId },
      sequence: options.sequence,
      nonce,
      ...semanticContent,
      captureClient: definition.captureClient,
      contentHash,
    };
    const validated = safeParseCaptureEnvelopeV1(envelope);
    if (!validated.success) {
      return {
        success: false,
        code: "envelope_invalid",
        issue:
          validated.issues?.map((issue) => `${issue.path}: ${issue.message}`).join("; ") ??
          validated.code,
      };
    }
    return { success: true, envelope: validated.data, encodedBytes: validated.encodedBytes };
  } catch (error) {
    return {
      success: false,
      code: "envelope_invalid",
      issue: error instanceof Error ? error.message : "Capture envelope construction failed.",
    };
  }
}

export async function verifyCaptureEnvelopeContentHashV1(
  envelope: CaptureEnvelopeV1,
): Promise<boolean> {
  return (await createCaptureEnvelopeContentHashV1(envelope)) === envelope.contentHash;
}

export async function buildCaptureEnvelopeV1(
  snapshotInput: unknown,
  options: CaptureEnvelopeBuildOptions,
): Promise<CaptureEnvelopeBuildResult> {
  const parsedSnapshot = safeParsePageCaptureSnapshot(snapshotInput);
  if (!parsedSnapshot.success) {
    return { success: false, code: "snapshot_invalid", issue: parsedSnapshot.issue };
  }
  const snapshot = parsedSnapshot.data;
  return buildEnvelopeV1(
    {
      captureMethod: "extension",
      senderKind: "browser_extension",
      source: {
        url: snapshot.url,
        ...(snapshot.canonicalUrl === undefined ? {} : { canonicalUrl: snapshot.canonicalUrl }),
        ...(snapshot.pageTitle === undefined ? {} : { pageTitle: snapshot.pageTitle }),
        sourceKind: "job_page",
      },
      content: {
        ...(snapshot.jsonLd === undefined ? {} : { jsonLd: [...snapshot.jsonLd] }),
        ...(snapshot.selectedText === undefined ? {} : { selectedText: snapshot.selectedText }),
      },
      fields: fieldEntries(snapshot),
      captureClient: { name: "coredrill.extension", version: "0.1.0" },
    },
    options,
  );
}

/** Builds a validated envelope for explicit local form, paste, or file input. */
export async function buildSuppliedCaptureEnvelopeV1(
  draft: SuppliedCaptureDraftV1,
  options: CaptureEnvelopeBuildOptions,
): Promise<CaptureEnvelopeBuildResult> {
  const title = draft.fields?.title;
  const company = draft.fields?.company;
  const fields: EnvelopeDefinitionV1["fields"] = [
    ...(title === undefined
      ? []
      : [
          ["title", { ...title, pointer: "/fields/title", method: "user", confidence: 1 }] as const,
        ]),
    ...(company === undefined
      ? []
      : [
          [
            "company",
            { ...company, pointer: "/fields/company", method: "user", confidence: 1 },
          ] as const,
        ]),
  ];
  const hasContent =
    (draft.content.selectedText?.trim().length ?? 0) > 0 ||
    (draft.content.readableText?.trim().length ?? 0) > 0 ||
    draft.content.apiPayload !== undefined;
  if (draft.source.url === undefined && fields.length === 0 && !hasContent) {
    return {
      success: false,
      code: "snapshot_invalid",
      issue: "A supplied capture needs a source URL, field, or content.",
    };
  }
  return buildEnvelopeV1(
    {
      captureMethod: draft.captureMethod,
      senderKind: draft.senderKind,
      source: draft.source,
      content: draft.content,
      fields,
      captureClient: draft.captureClient,
    },
    options,
  );
}
