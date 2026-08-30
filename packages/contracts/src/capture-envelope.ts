import * as z from "zod";

import { fieldCandidateV1Schema } from "./field-evidence.js";
import {
  instantSchema,
  jsonValueSchema,
  safeHttpUrlSchema,
  safeIdentifierSchema,
  semanticVersionSchema,
  sha256Schema,
  uuidV7Schema,
} from "./primitives.js";

export const CAPTURE_ENVELOPE_SPEC_VERSION = 1 as const;
export const CAPTURE_ENVELOPE_ACCEPTED_SPEC_VERSIONS = [CAPTURE_ENVELOPE_SPEC_VERSION] as const;
export const CAPTURE_ENVELOPE_COMPATIBILITY = Object.freeze({
  policy: "current-and-previous" as const,
  currentSpecVersion: CAPTURE_ENVELOPE_SPEC_VERSION,
  acceptedSpecVersions: CAPTURE_ENVELOPE_ACCEPTED_SPEC_VERSIONS,
});
export const CAPTURE_ENVELOPE_V1_SCHEMA_ID =
  "https://schemas.coredrill.local/capture-envelope/v1.json" as const;

export const CAPTURE_ENVELOPE_LIMITS = Object.freeze({
  maxBytes: 2 * 1024 * 1024,
  maxFieldCandidates: 256,
  maxJsonLdItems: 64,
  maxReadableTextCharacters: 512 * 1024,
  maxSanitizedHtmlCharacters: 1024 * 1024,
  maxSelectedTextCharacters: 64 * 1024,
});

export const CAPTURE_METHODS = ["extension", "paste", "file", "connector", "manual"] as const;
export const CAPTURE_SENDER_KINDS = [
  "browser_extension",
  "web_app",
  "desktop_app",
  "import_tool",
] as const;

const senderIdSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(new RegExp(String.raw`^(?!\s)(?![\s\S]*[\u0000-\u001f\u007f])[\s\S]*\S$`));
const nonceSchema = z.string().regex(/^[A-Za-z0-9_-]{22,128}$/);

export const captureEnvelopeV1Schema = z
  .strictObject({
    specVersion: z.literal(CAPTURE_ENVELOPE_SPEC_VERSION),
    id: uuidV7Schema,
    capturedAt: instantSchema,
    expiresAt: instantSchema,
    captureMethod: z.enum(CAPTURE_METHODS),
    sender: z.strictObject({
      kind: z.enum(CAPTURE_SENDER_KINDS),
      id: senderIdSchema,
    }),
    sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    nonce: nonceSchema,
    source: z.strictObject({
      url: safeHttpUrlSchema.optional(),
      canonicalUrl: safeHttpUrlSchema.optional(),
      pageTitle: z.string().max(1024).optional(),
      sourceKind: safeIdentifierSchema.optional(),
      externalId: z.string().max(512).optional(),
    }),
    content: z.strictObject({
      jsonLd: z.array(jsonValueSchema).max(CAPTURE_ENVELOPE_LIMITS.maxJsonLdItems).optional(),
      selectedText: z.string().max(CAPTURE_ENVELOPE_LIMITS.maxSelectedTextCharacters).optional(),
      readableText: z.string().max(CAPTURE_ENVELOPE_LIMITS.maxReadableTextCharacters).optional(),
      sanitizedHtml: z.string().max(CAPTURE_ENVELOPE_LIMITS.maxSanitizedHtmlCharacters).optional(),
      apiPayload: jsonValueSchema.optional(),
    }),
    fieldCandidates: z
      .array(fieldCandidateV1Schema)
      .max(CAPTURE_ENVELOPE_LIMITS.maxFieldCandidates),
    captureClient: z.strictObject({
      name: safeIdentifierSchema,
      version: semanticVersionSchema,
    }),
    contentHash: sha256Schema,
  })
  .superRefine((envelope, context) => {
    if (Date.parse(envelope.expiresAt) <= Date.parse(envelope.capturedAt)) {
      context.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "Capture expiry must be later than capture time.",
      });
    }

    const candidateIds = new Set<string>();
    envelope.fieldCandidates.forEach((candidate, index) => {
      if (candidateIds.has(candidate.id)) {
        context.addIssue({
          code: "custom",
          path: ["fieldCandidates", index, "id"],
          message: "Capture field-candidate IDs must be unique.",
        });
      }
      candidateIds.add(candidate.id);

      if (
        candidate.provenance.source.sourceType !== "capture" ||
        candidate.provenance.source.sourceId !== envelope.id
      ) {
        context.addIssue({
          code: "custom",
          path: ["fieldCandidates", index, "provenance", "source"],
          message: "Capture field provenance must reference this source snapshot.",
        });
      }
      if (candidate.provenance.capturedAt !== envelope.capturedAt) {
        context.addIssue({
          code: "custom",
          path: ["fieldCandidates", index, "provenance", "capturedAt"],
          message: "Capture field provenance must use the source snapshot capture time.",
        });
      }
    });
  })
  .meta({
    title: "Coredrill CaptureEnvelopeV1",
    description:
      "A size-bounded, checksummed, replay-identifiable envelope for user-invoked capture inputs and their source-backed field candidates.",
    "x-coredrill-maxBytes": CAPTURE_ENVELOPE_LIMITS.maxBytes,
    "x-coredrill-compatibility": CAPTURE_ENVELOPE_COMPATIBILITY,
  });

const generatedCaptureEnvelopeV1JsonSchema = z.toJSONSchema(captureEnvelopeV1Schema, {
  target: "draft-2020-12",
});
const { $schema: captureEnvelopeDialect, ...captureEnvelopeSchemaBody } =
  generatedCaptureEnvelopeV1JsonSchema;

export const captureEnvelopeV1JsonSchema = Object.freeze({
  $schema: captureEnvelopeDialect,
  $id: CAPTURE_ENVELOPE_V1_SCHEMA_ID,
  ...captureEnvelopeSchemaBody,
});

export interface BoundaryValidationIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export type CaptureEnvelopeV1ValidationResult =
  | { readonly success: true; readonly data: CaptureEnvelopeV1; readonly encodedBytes: number }
  | {
      readonly success: false;
      readonly code: "not_json_serializable" | "too_large" | "schema_invalid";
      readonly encodedBytes?: number;
      readonly issues?: readonly BoundaryValidationIssue[];
    };

export type CaptureEnvelopeValidationResult =
  | CaptureEnvelopeV1ValidationResult
  | {
      readonly success: false;
      readonly code: "unsupported_version";
      readonly receivedSpecVersion: number;
      readonly acceptedSpecVersions: typeof CAPTURE_ENVELOPE_ACCEPTED_SPEC_VERSIONS;
    };

export function safeParseCaptureEnvelopeV1(input: unknown): CaptureEnvelopeV1ValidationResult {
  let serializedValue: unknown;
  try {
    serializedValue = JSON.stringify(input);
  } catch {
    return { success: false, code: "not_json_serializable" };
  }

  if (typeof serializedValue !== "string") {
    return { success: false, code: "not_json_serializable" };
  }

  const encodedBytes = new TextEncoder().encode(serializedValue).byteLength;
  if (encodedBytes > CAPTURE_ENVELOPE_LIMITS.maxBytes) {
    return { success: false, code: "too_large", encodedBytes };
  }

  const result = captureEnvelopeV1Schema.safeParse(input);
  if (!result.success) {
    return {
      success: false,
      code: "schema_invalid",
      encodedBytes,
      issues: result.error.issues.map((issue) => ({
        code: issue.code,
        path: issue.path.join("."),
        message: issue.message,
      })),
    };
  }

  return { success: true, data: result.data, encodedBytes };
}

/**
 * Version-dispatch boundary for persisted or transferred captures. Version 1
 * is both current and the only serialized version so far; when version 2 ships,
 * this dispatcher is the single place that retains the required previous-version
 * reader while builders move to the new current version.
 */
export function safeParseCaptureEnvelope(input: unknown): CaptureEnvelopeValidationResult {
  const parsedV1 = safeParseCaptureEnvelopeV1(input);
  if (parsedV1.success || parsedV1.code !== "schema_invalid") return parsedV1;
  if (typeof input !== "object" || input === null || Array.isArray(input)) return parsedV1;

  const receivedSpecVersion = (input as Record<string, unknown>)["specVersion"];
  if (
    typeof receivedSpecVersion !== "number" ||
    !Number.isSafeInteger(receivedSpecVersion) ||
    CAPTURE_ENVELOPE_ACCEPTED_SPEC_VERSIONS.includes(
      receivedSpecVersion as (typeof CAPTURE_ENVELOPE_ACCEPTED_SPEC_VERSIONS)[number],
    )
  ) {
    return parsedV1;
  }
  return {
    success: false,
    code: "unsupported_version",
    receivedSpecVersion,
    acceptedSpecVersions: CAPTURE_ENVELOPE_ACCEPTED_SPEC_VERSIONS,
  };
}

export type CaptureMethod = (typeof CAPTURE_METHODS)[number];
export type CaptureSenderKind = (typeof CAPTURE_SENDER_KINDS)[number];
export type CaptureEnvelopeV1 = z.infer<typeof captureEnvelopeV1Schema>;
export type CaptureEnvelope = CaptureEnvelopeV1;
