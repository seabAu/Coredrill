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
  .meta({
    title: "Coredrill CaptureEnvelopeV1",
    description:
      "A size-bounded, checksummed, replay-identifiable envelope for user-invoked capture inputs and their source-backed field candidates.",
    "x-coredrill-maxBytes": CAPTURE_ENVELOPE_LIMITS.maxBytes,
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

export type CaptureMethod = (typeof CAPTURE_METHODS)[number];
export type CaptureSenderKind = (typeof CAPTURE_SENDER_KINDS)[number];
export type CaptureEnvelopeV1 = z.infer<typeof captureEnvelopeV1Schema>;
