import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StoredJobSource, type StoredJobSourceModel } from "../src/index.js";

const id = "0198e207-0000-7000-8000-000000000001";
const provenance = {
  id,
  method: "heuristic",
  confidence: 0.8,
  pointer: "/retained/title",
  excerpt: "<img src=x onerror=neverExecute()>",
  capturedAt: "2026-10-19T12:00:00.000Z",
  licenseNote: null,
};
const field = {
  kind: "field-value",
  id,
  fieldName: "title",
  createdAt: "2026-10-19T12:00:00.000Z",
  provenance,
  normalized: {
    text: '"<script>neverExecute()</script>',
    format: "json",
    byteLength: 2048,
    complete: false,
  },
  raw: null,
  currentReview: {
    updatedAt: "2026-10-19T13:00:00.000Z",
    rowVersion: 1,
    confirmation: {
      id: "0198e207-0000-7000-8000-000000000005",
      confirmedAt: "2026-10-19T12:00:00.000Z",
      confirmedValueHash: "b".repeat(64),
    },
    supersededBy: {
      id: "0198e207-0000-7000-8000-000000000006",
      snapshotId: "0198e207-0000-7000-8000-000000000003",
    },
  },
};
const fixture = () => ({
  jobId: id,
  busy: false,
  error: null,
  history: { items: [], hasMore: false },
  comparison: null,
  primary: {
    snapshot: {
      id,
      jobId: id,
      capturedAt: "2026-10-19T12:00:00.000Z",
      createdAt: "2026-10-19T12:05:00.000Z",
      extractorId: "synthetic.fixture",
      extractorVersion: "1.0.0",
      contentHash: "a".repeat(64),
      retentionClass: "synthetic",
      currentSource: {
        id,
        connectorId: "manual",
        externalId: null,
        canonicalUrl: "https://jobs.example.test/source",
        applyUrl: null,
        firstSeenAt: "2026-10-19T12:00:00.000Z",
        lastSeenAt: "2026-10-19T14:00:00.000Z",
        primary: false,
      },
    },
    content: {
      kind: "text",
      text: "<script>neverExecute()</script>",
      byteOffset: 0,
      bytesRead: 31,
      byteLength: 2048,
      hasMore: true,
    },
    evidence: { items: [field], hasMore: true },
    value: {
      evidenceKind: "field-value",
      evidenceId: id,
      part: "raw",
      format: "json",
      provenanceId: id,
      rowVersion: 2,
      text: "null",
      byteOffset: 0,
      bytesRead: 4,
      byteLength: 4,
      hasMore: false,
    },
  },
});
const render = (model: unknown) =>
  renderToStaticMarkup(
    createElement(StoredJobSource, {
      model: model as StoredJobSourceModel,
      onReload: () => undefined,
      onRetry: () => undefined,
      onHistoryMore: () => undefined,
      onSelect: () => undefined,
      onContent: () => undefined,
      onEvidencePage: () => undefined,
      onValue: () => undefined,
    }),
  );

describe("inert normal Source presentation", () => {
  it("renders exact evidence/current annotations and explicit part boundaries without markup execution or source links", () => {
    const html = render(fixture());
    expect(html).toContain("&lt;script&gt;neverExecute()&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=neverExecute()&gt;");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).not.toContain('href="https://');
    expect(html).toContain("Incomplete preview");
    expect(html).toContain("Current source metadata at history read time");
    expect(html).toContain("not a historical snapshot");
    expect(html).toContain("Recorded confirmed-value hash");
    expect(html).toContain("Superseded by candidate");
    expect(html).toContain("one bounded part");
    expect(html).toContain("Review annotations changed since this evidence page");
    expect(html).toContain("not verification");
  });
  it("shows requirement origin/current categories and a confirmation boolean without inventing field-confirmation identity", () => {
    const model = fixture();
    const requirement = {
      ...field,
      kind: "requirement",
      sourceCategory: "required",
      currentReview: {
        updatedAt: "2026-10-19T13:00:00.000Z",
        rowVersion: 1,
        category: "desired",
        userConfirmed: true,
      },
    };
    const html = render({
      ...model,
      primary: {
        ...model.primary,
        value: null,
        evidence: { items: [requirement], hasMore: false },
      },
    });
    expect(html).toContain("Requirement source category: required");
    expect(html).toContain("Current reviewed category");
    expect(html).toContain("desired");
    expect(html).toContain("User confirmed");
    expect(html).not.toContain("Confirmation ID");
    expect(html).not.toContain("Confirmed at");
  });
  it("separates explicit paired fingerprint inspection from the still-pending structured comparison", () => {
    const model = fixture();
    const html = render({
      ...model,
      comparison: {
        ...model.primary,
        snapshot: {
          ...model.primary.snapshot,
          id: "0198e207-0000-7000-8000-000000000003",
          contentHash: "b".repeat(64),
        },
      },
    });
    expect(html).toContain("Recorded capture fingerprints differ");
    expect(html).toContain("not newly calculated body-integrity certificates");
    expect(html).toContain("Structured field-by-field Listing changes is not connected yet");
    expect(html).toContain("no absent field is inferred to be unchanged");
  });
  it.each([
    { jobId: id, history: null, primary: null, comparison: null, busy: true, error: null },
    {
      jobId: id,
      history: null,
      primary: null,
      comparison: null,
      busy: false,
      error: "Safe local read failure",
    },
    {
      jobId: id,
      history: { items: [], hasMore: false },
      primary: null,
      comparison: null,
      busy: false,
      error: null,
    },
  ])("keeps loading/error/empty distinct without a reference-catalog substitute", (model) => {
    const html = render(model);
    expect(html).not.toContain("<article");
    if (model.busy) expect(html).toContain("Loading local Source evidence");
    else if (model.error !== null) expect(html).toContain("Retry Source read");
    else expect(html).toContain("No retained snapshots");
  });
});
