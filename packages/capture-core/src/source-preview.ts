import {
  safeParseCaptureEnvelopeV1,
  type CaptureEnvelopeV1,
  type JsonValue,
} from "@coredrill/contracts";

import { verifyCaptureEnvelopeContentHashV1 } from "./envelope.js";

export interface CaptureSourcePreviewSectionV1 {
  readonly id: string;
  readonly label: string;
  readonly pointer: string;
  readonly format: "text" | "json";
  readonly text: string;
}

export interface CaptureSourceEvidenceV1 {
  readonly id: string;
  readonly fieldName: string;
  readonly value: string;
  readonly rawValue?: string;
  readonly method: string;
  readonly confidence: number;
  readonly pointer: string;
  readonly sourceExcerpt: string;
  readonly targetSectionId: string | null;
}

export interface CaptureSourcePreviewV1 {
  readonly envelopeId: string;
  readonly label: string;
  readonly capturedAt: string;
  readonly captureMethod: string;
  readonly sourceKind: string;
  readonly sourceUrl: string | null;
  readonly sections: readonly CaptureSourcePreviewSectionV1[];
  readonly evidence: readonly CaptureSourceEvidenceV1[];
}

export interface CaptureSourcePreviewOptions {
  readonly sanitizedHtmlToText?: (html: string) => string;
}

export type CaptureSourcePreviewResultV1 =
  | { readonly success: true; readonly preview: CaptureSourcePreviewV1 }
  | {
      readonly success: false;
      readonly code: "preview_invalid" | "content_hash_mismatch" | "html_renderer_unavailable";
      readonly issue: string;
    };

function jsonText(value: JsonValue | readonly JsonValue[]): string {
  return JSON.stringify(value, null, 2);
}

function candidateText(value: JsonValue): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function sectionTarget(pointer: string): string | null {
  if (pointer === "/content/selectedText" || pointer.startsWith("/content/selectedText/")) {
    return "selected-text";
  }
  if (pointer === "/content/readableText" || pointer.startsWith("/content/readableText/")) {
    return "readable-text";
  }
  if (pointer === "/content/sanitizedHtml" || pointer.startsWith("/content/sanitizedHtml/")) {
    return "sanitized-html";
  }
  if (pointer === "/content/jsonLd" || pointer.startsWith("/content/jsonLd/")) {
    return "json-ld";
  }
  if (pointer === "/content/apiPayload" || pointer.startsWith("/content/apiPayload/")) {
    return "api-payload";
  }
  return null;
}

function previewLabel(envelope: CaptureEnvelopeV1): string {
  const title = envelope.fieldCandidates.find(({ fieldName }) => fieldName === "title")?.value;
  if (title !== undefined) return candidateText(title);
  if (envelope.source.pageTitle !== undefined && envelope.source.pageTitle.trim().length > 0) {
    return envelope.source.pageTitle;
  }
  if (envelope.source.url !== undefined) return new URL(envelope.source.url).hostname;
  return envelope.source.sourceKind ?? `${envelope.captureMethod} capture`;
}

function buildSections(
  envelope: CaptureEnvelopeV1,
  options: CaptureSourcePreviewOptions,
): readonly CaptureSourcePreviewSectionV1[] | "html_renderer_unavailable" {
  const sections: CaptureSourcePreviewSectionV1[] = [];
  if (envelope.content.selectedText !== undefined) {
    sections.push({
      id: "selected-text",
      label: "Selected text",
      pointer: "/content/selectedText",
      format: "text",
      text: envelope.content.selectedText,
    });
  }
  if (envelope.content.readableText !== undefined) {
    sections.push({
      id: "readable-text",
      label: "Captured text",
      pointer: "/content/readableText",
      format: "text",
      text: envelope.content.readableText,
    });
  }
  if (envelope.content.sanitizedHtml !== undefined) {
    if (options.sanitizedHtmlToText === undefined) return "html_renderer_unavailable";
    const text = options.sanitizedHtmlToText(envelope.content.sanitizedHtml).trim();
    sections.push({
      id: "sanitized-html",
      label: "Captured HTML text",
      pointer: "/content/sanitizedHtml",
      format: "text",
      text: text.length === 0 ? "No readable text was retained from this HTML snapshot." : text,
    });
  }
  if (envelope.content.jsonLd !== undefined) {
    sections.push({
      id: "json-ld",
      label: "Structured job data",
      pointer: "/content/jsonLd",
      format: "json",
      text: jsonText(envelope.content.jsonLd),
    });
  }
  if (envelope.content.apiPayload !== undefined) {
    sections.push({
      id: "api-payload",
      label: "Structured JSON",
      pointer: "/content/apiPayload",
      format: "json",
      text: jsonText(envelope.content.apiPayload),
    });
  }
  return Object.freeze(sections.map((section) => Object.freeze(section)));
}

async function fromEnvelope(
  envelopeInput: unknown,
  options: CaptureSourcePreviewOptions,
): Promise<CaptureSourcePreviewResultV1> {
  const parsed = safeParseCaptureEnvelopeV1(envelopeInput);
  if (!parsed.success) {
    return {
      success: false,
      code: "preview_invalid",
      issue: "The stored capture envelope is not valid preview input.",
    };
  }
  if (!(await verifyCaptureEnvelopeContentHashV1(parsed.data))) {
    return {
      success: false,
      code: "content_hash_mismatch",
      issue: "The stored capture content hash does not match its preview evidence.",
    };
  }
  try {
    const sections = buildSections(parsed.data, options);
    if (sections === "html_renderer_unavailable") {
      return {
        success: false,
        code: "html_renderer_unavailable",
        issue: "Captured HTML needs an inert text renderer before preview.",
      };
    }
    const evidence = Object.freeze(
      parsed.data.fieldCandidates.map((candidate) =>
        Object.freeze({
          id: candidate.id,
          fieldName: candidate.fieldName,
          value: candidateText(candidate.value),
          ...(candidate.rawValue === undefined
            ? {}
            : { rawValue: candidateText(candidate.rawValue) }),
          method: candidate.provenance.method,
          confidence: candidate.provenance.confidence,
          pointer: candidate.provenance.source.pointer,
          sourceExcerpt:
            candidate.provenance.sourceExcerpt ??
            candidateText(candidate.rawValue ?? candidate.value).slice(0, 4096),
          targetSectionId: sectionTarget(candidate.provenance.source.pointer),
        }),
      ),
    );
    return {
      success: true,
      preview: Object.freeze({
        envelopeId: parsed.data.id,
        label: previewLabel(parsed.data),
        capturedAt: parsed.data.capturedAt,
        captureMethod: parsed.data.captureMethod,
        sourceKind: parsed.data.source.sourceKind ?? "unspecified_source",
        sourceUrl: parsed.data.source.canonicalUrl ?? parsed.data.source.url ?? null,
        sections,
        evidence,
      }),
    };
  } catch {
    return {
      success: false,
      code: "preview_invalid",
      issue: "The stored capture could not be converted into an inert preview.",
    };
  }
}

/** Revalidates and hash-checks durable envelope JSON before creating inert preview data. */
export async function parseCaptureSourcePreviewJsonV1(
  envelopeJson: string,
  options: CaptureSourcePreviewOptions = {},
): Promise<CaptureSourcePreviewResultV1> {
  try {
    return await fromEnvelope(JSON.parse(envelopeJson) as unknown, options);
  } catch {
    return {
      success: false,
      code: "preview_invalid",
      issue: "The stored capture envelope JSON is not valid preview input.",
    };
  }
}
