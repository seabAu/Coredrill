import * as z from "zod";

import {
  instantSchema,
  jsonValueSchema,
  safeIdentifierSchema,
  semanticVersionSchema,
  sha256Schema,
  sourcePointerSchema,
  uuidV7Schema,
} from "./primitives.js";

export const FIELD_EVIDENCE_SPEC_VERSION = 1 as const;

export const EXTRACTION_METHODS = [
  "api",
  "jsonld",
  "selector",
  "readability",
  "heuristic",
  "llm",
  "user",
] as const;

export const fieldSourceReferenceV1Schema = z.strictObject({
  sourceType: safeIdentifierSchema,
  sourceId: uuidV7Schema,
  pointer: sourcePointerSchema,
});

export const extractorIdentityV1Schema = z.strictObject({
  name: safeIdentifierSchema,
  version: semanticVersionSchema,
});

export const fieldProvenanceV1Schema = z.strictObject({
  specVersion: z.literal(FIELD_EVIDENCE_SPEC_VERSION),
  source: fieldSourceReferenceV1Schema,
  method: z.enum(EXTRACTION_METHODS),
  extractor: extractorIdentityV1Schema,
  capturedAt: instantSchema,
  confidence: z.number().min(0).max(1),
  sourceExcerpt: z.string().max(4096).optional(),
  licenseNote: z.string().max(1024).optional(),
});

export const userConfirmationV1Schema = z.strictObject({
  specVersion: z.literal(FIELD_EVIDENCE_SPEC_VERSION),
  id: uuidV7Schema,
  actor: z.literal("user"),
  confirmedAt: instantSchema,
  confirmedValueHash: sha256Schema,
});

export const fieldCandidateV1Schema = z.strictObject({
  specVersion: z.literal(FIELD_EVIDENCE_SPEC_VERSION),
  id: uuidV7Schema,
  fieldName: safeIdentifierSchema,
  value: jsonValueSchema,
  rawValue: jsonValueSchema.optional(),
  provenance: fieldProvenanceV1Schema,
  userConfirmation: userConfirmationV1Schema.optional(),
});

const fieldConflictBaseV1Schema = z.strictObject({
  specVersion: z.literal(FIELD_EVIDENCE_SPEC_VERSION),
  id: uuidV7Schema,
  fieldName: safeIdentifierSchema,
  candidateIds: z.array(uuidV7Schema).min(2).max(32),
});

const unresolvedFieldConflictV1Schema = fieldConflictBaseV1Schema.extend({
  status: z.literal("unresolved"),
});

const resolvedFieldConflictV1Schema = fieldConflictBaseV1Schema.extend({
  status: z.literal("resolved"),
  resolution: z.strictObject({
    selectedCandidateId: uuidV7Schema,
    resolvedAt: instantSchema,
    resolvedBy: z.literal("user"),
    reason: z.string().max(1024).optional(),
  }),
});

export const fieldConflictV1Schema = z
  .discriminatedUnion("status", [unresolvedFieldConflictV1Schema, resolvedFieldConflictV1Schema])
  .superRefine((conflict, context) => {
    if (new Set(conflict.candidateIds).size !== conflict.candidateIds.length) {
      context.addIssue({
        code: "custom",
        message: "Conflict candidate IDs must be unique.",
        path: ["candidateIds"],
      });
    }
    if (
      conflict.status === "resolved" &&
      !conflict.candidateIds.includes(conflict.resolution.selectedCandidateId)
    ) {
      context.addIssue({
        code: "custom",
        message: "A conflict resolution must select one of the retained candidates.",
        path: ["resolution", "selectedCandidateId"],
      });
    }
  });

export type ExtractionMethod = (typeof EXTRACTION_METHODS)[number];
export type FieldSourceReferenceV1 = z.infer<typeof fieldSourceReferenceV1Schema>;
export type ExtractorIdentityV1 = z.infer<typeof extractorIdentityV1Schema>;
export type FieldProvenanceV1 = z.infer<typeof fieldProvenanceV1Schema>;
export type UserConfirmationV1 = z.infer<typeof userConfirmationV1Schema>;
export type FieldCandidateV1 = z.infer<typeof fieldCandidateV1Schema>;
export type FieldConflictV1 = z.infer<typeof fieldConflictV1Schema>;
