/** Versioned serialized boundary contracts; no runtime adapters. */
export {
  CAPTURE_ENVELOPE_LIMITS,
  CAPTURE_ENVELOPE_SPEC_VERSION,
  CAPTURE_ENVELOPE_V1_SCHEMA_ID,
  CAPTURE_METHODS,
  CAPTURE_SENDER_KINDS,
  captureEnvelopeV1JsonSchema,
  captureEnvelopeV1Schema,
  safeParseCaptureEnvelopeV1,
  type BoundaryValidationIssue,
  type CaptureEnvelopeV1,
  type CaptureEnvelopeV1ValidationResult,
  type CaptureMethod,
  type CaptureSenderKind,
} from "./capture-envelope.js";
export {
  EXTRACTION_METHODS,
  FIELD_EVIDENCE_SPEC_VERSION,
  extractorIdentityV1Schema,
  fieldCandidateV1Schema,
  fieldConflictV1Schema,
  fieldProvenanceV1Schema,
  fieldSourceReferenceV1Schema,
  userConfirmationV1Schema,
  type ExtractionMethod,
  type ExtractorIdentityV1,
  type FieldCandidateV1,
  type FieldConflictV1,
  type FieldProvenanceV1,
  type FieldSourceReferenceV1,
  type UserConfirmationV1,
} from "./field-evidence.js";
export { jsonValueSchema, type JsonValue } from "./primitives.js";
