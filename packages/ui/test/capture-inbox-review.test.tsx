import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  CaptureInboxReview,
  type CaptureInboxEvidence,
  type CaptureInboxPreviewItem,
} from "../src/index.js";

const HOSTILE_EVIDENCE = Object.freeze({
  id: "018f4e87-2bf3-7cc3-98c8-978e8b4c9a56",
  fieldName: "title",
  value: "<svg onload=globalThis.__ran=true>",
  method: "user",
  confidence: 1,
  pointer: "/fields/title",
  sourceExcerpt: "<svg onload=globalThis.__ran=true>",
  targetSectionId: null,
}) satisfies CaptureInboxEvidence;

const HOSTILE_ITEM = Object.freeze({
  envelopeId: "018f4e87-2bf3-7cc3-98c8-978e8b4c9a55",
  label: '<img src="https://tracker.invalid/title" onerror="globalThis.__ran=true">',
  capturedAt: "2026-08-30T13:30:00.000Z",
  captureMethod: "file",
  sourceKind: "saved_json",
  sourceUrl: "https://jobs.example.test/role",
  sections: Object.freeze([
    Object.freeze({
      id: "api-payload",
      label: "Structured JSON",
      pointer: "/content/apiPayload",
      format: "json" as const,
      text: '{"description":"<script>globalThis.__ran=true</script>"}',
    }),
  ]),
  evidence: Object.freeze([HOSTILE_EVIDENCE]),
} as const satisfies CaptureInboxPreviewItem);

describe("CaptureInboxReview", () => {
  it("renders source and evidence strings as escaped inert text", () => {
    const markup = renderToStaticMarkup(
      createElement(CaptureInboxReview, { items: [HOSTILE_ITEM] }),
    );

    expect(markup).toContain("Review captured evidence");
    expect(markup).toContain("&lt;img src=&quot;https://tracker.invalid/title&quot;");
    expect(markup).toContain("&lt;script&gt;globalThis.__ran=true&lt;/script&gt;");
    expect(markup).not.toContain("<script>");
    expect(markup).not.toContain("<img");
    expect(markup).not.toContain("dangerouslySetInnerHTML");
  });

  it("renders loading, error, and empty states without source content", () => {
    expect(
      renderToStaticMarkup(createElement(CaptureInboxReview, { items: [], state: "loading" })),
    ).toContain("Reading validated local captures");
    expect(
      renderToStaticMarkup(createElement(CaptureInboxReview, { items: [], state: "error" })),
    ).toContain("No source content was rendered");
    expect(renderToStaticMarkup(createElement(CaptureInboxReview, { items: [] }))).toContain(
      "No durable captures yet",
    );
  });

  it("fails closed for unsafe URLs and dangling evidence targets", () => {
    expect(() =>
      renderToStaticMarkup(
        createElement(CaptureInboxReview, {
          items: [{ ...HOSTILE_ITEM, sourceUrl: "javascript:alert(1)" }],
        }),
      ),
    ).toThrowError("Capture preview item is invalid.");
    expect(() =>
      renderToStaticMarkup(
        createElement(CaptureInboxReview, {
          items: [
            {
              ...HOSTILE_ITEM,
              evidence: [{ ...HOSTILE_EVIDENCE, targetSectionId: "missing" }],
            },
          ],
        }),
      ),
    ).toThrowError("Capture preview evidence is invalid.");
  });
});
