import { describe, expect, it } from "vitest";

import { createCapturePreviewV1, formatCaptureFreshnessV1 } from "../src/capture-preview";
import fixture from "./fixtures/job-posting.capture.json" with { type: "json" };

const draft = Object.freeze({
  specVersion: 1 as const,
  capturedAt: "2026-09-26T14:00:00.000Z",
  snapshot: Object.freeze({
    specVersion: 1 as const,
    url: fixture.url,
    canonicalUrl: fixture.canonicalUrl,
    pageTitle: fixture.pageTitle,
    selectedText: fixture.selectedText,
    jsonLd: Object.freeze([fixture.jsonLd]),
    fields: Object.freeze({
      title: Object.freeze({
        value: fixture.jsonLd.title,
        pointer: "/content/jsonLd/0/title",
        method: "jsonld" as const,
        confidence: 0.98,
      }),
      company: Object.freeze({
        value: fixture.jsonLd.hiringOrganization.name,
        pointer: "/content/jsonLd/0/hiringOrganization/name",
        method: "jsonld" as const,
        confidence: 0.98,
      }),
    }),
  }),
});

describe("production extension capture preview", () => {
  it("projects bounded job facts, source, confidence, and capture-only freshness", () => {
    expect(createCapturePreviewV1(draft, new Date("2026-09-26T14:00:30.000Z"))).toEqual({
      specVersion: 1,
      title: { value: "Senior Platform Engineer", origin: "detected", confidence: 0.98 },
      company: { value: "Example Systems", origin: "detected", confidence: 0.98 },
      location: "Remote · United States",
      salary: "USD 145,000–180,000 / year",
      selectedText: fixture.selectedText,
      source: {
        hostname: "jobs.example.test",
        signal: "Schema.org JobPosting",
        url: fixture.canonicalUrl,
      },
      confidence: 0.98,
      capturedAt: draft.capturedAt,
      freshness: "Captured just now",
    });
  });

  it("labels user corrections without inventing confidence or verification", () => {
    const preview = createCapturePreviewV1(
      { ...draft, corrections: { title: "Principal Platform Engineer" } },
      new Date("2026-09-26T14:05:00.000Z"),
    );
    expect(preview.title).toEqual({ value: "Principal Platform Engineer", origin: "user" });
    expect(preview.company).toEqual({
      value: "Example Systems",
      origin: "detected",
      confidence: 0.98,
    });
    expect(preview.freshness).toBe("Captured 5 min ago");
  });

  it("uses deterministic freshness buckets and rejects invalid drafts", () => {
    expect(formatCaptureFreshnessV1(draft.capturedAt, new Date("2026-09-26T16:00:00.000Z"))).toBe(
      "Captured 2 hr ago",
    );
    expect(formatCaptureFreshnessV1(draft.capturedAt, new Date("2026-09-28T14:00:00.000Z"))).toBe(
      "Captured 2 days ago",
    );
    expect(() => createCapturePreviewV1({ ...draft, secret: "no" })).toThrowError(
      "Capture draft is invalid.",
    );
  });
});
