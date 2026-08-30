import { safeParseCaptureEnvelopeV1 } from "@coredrill/contracts";
import { describe, expect, it } from "vitest";

import {
  buildCaptureEnvelopeV1,
  buildSuppliedCaptureEnvelopeV1,
  createCaptureEnvelopeContentHashV1,
  parseCaptureSourcePreviewJsonV1,
} from "../src/index.js";

const now = new Date("2026-08-30T13:30:00.000Z");
const randomBytes = (length: number): Uint8Array =>
  Uint8Array.from({ length }, (_, index) => (index * 17 + 23) % 256);

describe("capture source preview", () => {
  it("maps validated text, JSON paths, and field evidence into inert preview data", async () => {
    const built = await buildCaptureEnvelopeV1(
      {
        specVersion: 1,
        url: "https://jobs.example.test/roles/7",
        pageTitle: "Platform Engineer",
        selectedText: "Build local-first systems.",
        jsonLd: [
          {
            "@type": "JobPosting",
            title: "Platform Engineer",
            hiringOrganization: { name: "Northstar" },
          },
        ],
        fields: {
          title: {
            value: "Platform Engineer",
            pointer: "/content/jsonLd/0/title",
            method: "jsonld",
            confidence: 0.98,
          },
        },
      },
      { senderId: "fixture.extension", sequence: 1, now, randomBytes },
    );
    expect(built.success).toBe(true);
    if (!built.success) throw new Error(built.issue);

    const result = await parseCaptureSourcePreviewJsonV1(JSON.stringify(built.envelope));
    expect(result).toMatchObject({
      success: true,
      preview: {
        label: "Platform Engineer",
        sourceUrl: "https://jobs.example.test/roles/7",
        sections: [
          { id: "selected-text", pointer: "/content/selectedText", format: "text" },
          { id: "json-ld", pointer: "/content/jsonLd", format: "json" },
        ],
        evidence: [
          {
            fieldName: "title",
            pointer: "/content/jsonLd/0/title",
            targetSectionId: "json-ld",
          },
        ],
      },
    });
  });

  it("requires a caller-supplied inert renderer for retained HTML and never exposes the markup", async () => {
    const built = await buildSuppliedCaptureEnvelopeV1(
      {
        captureMethod: "manual",
        senderKind: "web_app",
        source: { sourceKind: "manual_entry" },
        content: { readableText: "temporary" },
        fields: { title: { value: "Security Engineer" } },
        captureClient: { name: "coredrill.web.capture", version: "0.1.0" },
      },
      { senderId: "fixture.web", sequence: 1, now, randomBytes },
    );
    expect(built.success).toBe(true);
    if (!built.success) throw new Error(built.issue);

    const changed = {
      ...built.envelope,
      content: {
        sanitizedHtml:
          '<script>globalThis.__ran=true</script><h1>Security Engineer</h1><img src="https://tracker.invalid/pixel">',
      },
    };
    const contentHash = await createCaptureEnvelopeContentHashV1(changed);
    const envelope = { ...changed, contentHash };
    expect(safeParseCaptureEnvelopeV1(envelope).success).toBe(true);

    await expect(parseCaptureSourcePreviewJsonV1(JSON.stringify(envelope))).resolves.toMatchObject({
      success: false,
      code: "html_renderer_unavailable",
    });
    await expect(
      parseCaptureSourcePreviewJsonV1(JSON.stringify(envelope), {
        sanitizedHtmlToText: () => "Security Engineer",
      }),
    ).resolves.toMatchObject({
      success: true,
      preview: {
        sections: [
          {
            id: "sanitized-html",
            text: "Security Engineer",
          },
        ],
      },
    });
  });

  it("fails closed for malformed JSON and semantic content-hash drift", async () => {
    await expect(parseCaptureSourcePreviewJsonV1('{"broken":')).resolves.toMatchObject({
      success: false,
      code: "preview_invalid",
    });

    const built = await buildSuppliedCaptureEnvelopeV1(
      {
        captureMethod: "paste",
        senderKind: "web_app",
        source: { sourceKind: "pasted_listing" },
        content: { readableText: "Original source text" },
        captureClient: { name: "coredrill.web.capture", version: "0.1.0" },
      },
      { senderId: "fixture.web", sequence: 2, now, randomBytes },
    );
    expect(built.success).toBe(true);
    if (!built.success) throw new Error(built.issue);
    const tampered = {
      ...built.envelope,
      content: { readableText: "Tampered source text" },
    };
    await expect(parseCaptureSourcePreviewJsonV1(JSON.stringify(tampered))).resolves.toMatchObject({
      success: false,
      code: "content_hash_mismatch",
    });
  });
});
