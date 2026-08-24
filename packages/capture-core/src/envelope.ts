import {
  CAPTURE_ENVELOPE_SPEC_VERSION,
  FIELD_EVIDENCE_SPEC_VERSION,
  safeParseCaptureEnvelopeV1,
  type CaptureEnvelopeV1,
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
  field: PageFieldCapture,
  sourceId: string,
  capturedAt: string,
  timestamp: number,
  randomBytes: (length: number) => Uint8Array,
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
      extractor: {
        name: "coredrill.extension.capture",
        version: "0.1.0",
      },
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

function hashableContent(snapshot: PageCaptureSnapshot): unknown {
  return {
    source: {
      url: snapshot.url,
      ...(snapshot.canonicalUrl === undefined ? {} : { canonicalUrl: snapshot.canonicalUrl }),
      ...(snapshot.pageTitle === undefined ? {} : { pageTitle: snapshot.pageTitle }),
      sourceKind: "job_page",
    },
    content: {
      ...(snapshot.jsonLd === undefined ? {} : { jsonLd: snapshot.jsonLd }),
      ...(snapshot.selectedText === undefined ? {} : { selectedText: snapshot.selectedText }),
    },
    fields: fieldEntries(snapshot)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([fieldName, field]) => ({
        fieldName,
        value: field.value,
        ...(field.rawValue === undefined ? {} : { rawValue: field.rawValue }),
        pointer: field.pointer,
        method: field.method,
      })),
  };
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
  let envelopeId: string;
  let nonce: string;
  let fieldCandidates: FieldCandidateV1[];
  try {
    envelopeId = uuidV7(timestamp, requireRandomBytes(16, randomBytes));
    nonce = base64Url(requireRandomBytes(18, randomBytes));
    const capturedAt = now.toISOString();
    fieldCandidates = fieldEntries(snapshot).map(([fieldName, field]) =>
      createCandidate(fieldName, field, envelopeId, capturedAt, timestamp, randomBytes),
    );
  } catch (error) {
    return {
      success: false,
      code: "envelope_invalid",
      issue: error instanceof Error ? error.message : "Envelope entropy failed.",
    };
  }

  const capturedAt = now.toISOString();
  const contentHash = await sha256CanonicalJson(hashableContent(snapshot));
  const envelope = {
    specVersion: CAPTURE_ENVELOPE_SPEC_VERSION,
    id: envelopeId,
    capturedAt,
    expiresAt: new Date(expiryTimestamp).toISOString(),
    captureMethod: "extension",
    sender: {
      kind: "browser_extension",
      id: options.senderId,
    },
    sequence: options.sequence,
    nonce,
    source: {
      url: snapshot.url,
      ...(snapshot.canonicalUrl === undefined ? {} : { canonicalUrl: snapshot.canonicalUrl }),
      ...(snapshot.pageTitle === undefined ? {} : { pageTitle: snapshot.pageTitle }),
      sourceKind: "job_page",
    },
    content: {
      ...(snapshot.jsonLd === undefined ? {} : { jsonLd: snapshot.jsonLd }),
      ...(snapshot.selectedText === undefined ? {} : { selectedText: snapshot.selectedText }),
    },
    fieldCandidates,
    captureClient: {
      name: "coredrill.extension",
      version: "0.1.0",
    },
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
}
