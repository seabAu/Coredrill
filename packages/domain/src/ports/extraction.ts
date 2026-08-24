import type { Confidence } from "../confidence.js";
import type { SourceReference } from "../source-reference.js";
import type { Instant } from "../temporal.js";
import type { PortRequestContext, PortWarning } from "./context.js";

export const EXTRACTION_INPUT_KINDS = ["capture", "career-document"] as const;

export type ExtractionInputKind = (typeof EXTRACTION_INPUT_KINDS)[number];

export interface ExtractionInput<Payload> {
  readonly kind: ExtractionInputKind;
  readonly source: SourceReference;
  readonly capturedAt: Instant;
  /** Validated boundary payload; the port never fetches an arbitrary URL on its behalf. */
  readonly payload: Payload;
}

export interface ExtractionSupport {
  readonly score: Confidence;
  readonly reasonCode: string;
}

export interface ExtractionResult<Candidate> {
  readonly extractor: {
    readonly id: string;
    readonly version: string;
  };
  readonly candidates: readonly Candidate[];
  readonly warnings: readonly PortWarning[];
}

/** Deterministic, policy-gated extraction; LLM normalization remains a separate AI step. */
export interface ExtractionPort<Payload, Candidate> {
  readonly id: string;
  readonly version: string;
  supports(input: ExtractionInput<Payload>): ExtractionSupport;
  extract(
    input: ExtractionInput<Payload>,
    context: PortRequestContext,
  ): Promise<ExtractionResult<Candidate>>;
}
