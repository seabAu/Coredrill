import type { Instant } from "../temporal.js";
import type { PortRequestContext, PortWarning } from "./context.js";

export const AI_MODES = ["disabled", "local", "byok", "hosted"] as const;
export const AI_PURPOSES = [
  "requirement-analysis",
  "evidence-matching",
  "cover-letter-draft",
  "application-answer-draft",
  "normalization",
] as const;

export type AiMode = (typeof AI_MODES)[number];
export type AiPurpose = (typeof AI_PURPOSES)[number];

export interface ModelCapabilities {
  readonly mode: AiMode;
  readonly available: boolean;
  readonly structuredGeneration: boolean;
  readonly embeddings: boolean;
  readonly maxContextTokens?: number;
  /** Human-facing destination identifier; never a credential or SDK object. */
  readonly destination: string;
}

export interface StructuredGenerationRequest<Schema, ContextManifest> {
  readonly purpose: AiPurpose;
  readonly contextManifest: ContextManifest;
  readonly outputSchema: Schema;
  readonly maxOutputTokens: number;
  readonly context: PortRequestContext;
}

export interface GenerationResult<Output> {
  readonly output: Output;
  readonly generatedAt: Instant;
  readonly mode: AiMode;
  readonly model: {
    readonly provider: string;
    readonly id: string;
    readonly version?: string;
  };
  readonly warnings: readonly PortWarning[];
}

export interface EmbeddingRequest {
  readonly purpose: "evidence-retrieval";
  readonly inputs: readonly string[];
  readonly context: PortRequestContext;
}

export interface EmbeddingResult {
  readonly vectors: readonly (readonly number[])[];
  readonly dimensions: number;
  readonly model: {
    readonly provider: string;
    readonly id: string;
    readonly version?: string;
  };
}

/** Provider-neutral AI boundary. Callers must honor disabled capabilities without calling generation. */
export interface AiPort {
  capabilities(): Promise<ModelCapabilities>;
  generateStructured<Output, Schema, ContextManifest>(
    request: StructuredGenerationRequest<Schema, ContextManifest>,
  ): Promise<GenerationResult<Output>>;
  embed?(request: EmbeddingRequest): Promise<EmbeddingResult>;
}
