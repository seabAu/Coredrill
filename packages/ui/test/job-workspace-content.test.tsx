import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { compareListingSnapshotsV1 } from "@coredrill/application";

import {
  JOB_WORKSPACE_CONTENT_ACTIONS,
  JOB_WORKSPACE_CONTENT_TABS,
  JobWorkspaceContent,
  isJobWorkspaceContentTab,
  type JobWorkspaceContentModel,
} from "../src/index.js";

const MODEL = Object.freeze({
  company: Object.freeze({
    canonicalName: "Northstar Health",
    contactCount: 2,
    domain: "northstar.example",
    notes: "Review the product operating model before outreach.",
    otherActiveJobCount: 1,
    outcomeCount: 3,
    salaryObservationCount: 2,
    websiteUrl: "https://northstar.example",
  }),
  jobId: "job-northstar",
  requirementEvidence: Object.freeze([
    Object.freeze({
      coverage: Object.freeze({
        decidedAt: null,
        explanation: "No evidence is selected. Coverage is Unknown—not a Gap—until review.",
        rowVersion: null,
        ruleVersion: "requirement-coverage-v1",
        source: "deterministic-rule" as const,
        stale: false,
        state: "unknown" as const,
      }),
      requirementId: "requirement-delivery",
      retrievalMode: "fts5" as const,
      queryTerms: Object.freeze(["cross-functional", "delivery"]),
      selectedEvidence: Object.freeze([]),
      candidates: Object.freeze([
        Object.freeze({
          id: "evidence-project-1",
          kind: "project",
          label: "Portfolio launch",
          summary: "Led product and operations through a coordinated launch.",
          verificationState: "user_confirmed",
          privacyTags: Object.freeze([]),
          reasons: Object.freeze(["lexical", "skill-relation"]),
          matchedTerms: Object.freeze(["delivery"]),
        }),
      ]),
    }),
  ]),
  requirementProposals: Object.freeze([
    Object.freeze({
      id: "requirement-proposal-1",
      category: "desired" as const,
      sourceCategory: "desired" as const,
      normalizedText: "Healthcare domain experience",
      rawText: "Preferred: healthcare domain experience.",
      sourcePointer: "/description/qualifications/2",
      sourceExcerpt: "Preferred: healthcare domain experience.",
      confidence: 0.88,
    }),
  ]),
  requirements: Object.freeze([
    Object.freeze({
      id: "requirement-delivery",
      category: "responsibility" as const,
      sourceCategory: "required" as const,
      normalizedText: "Lead cross-functional delivery",
      rawText: "You will lead cross-functional delivery.",
      sourcePointer: "/description/requirements/0",
      sourceExcerpt: "You will lead cross-functional delivery.",
      extractionMethod: "jsonld",
      confidence: 0.91,
      userConfirmed: true,
      rowVersion: 2,
    }),
  ]),
  overview: Object.freeze({
    application: Object.freeze({
      appliedAtLabel: "2026-08-21",
      channel: "Company careers page",
      notes: "Used the product operations resume.",
    }),
    datePosted: "2026-08-17",
    descriptionText: "Lead product operations across a distributed team.",
    disclosedCompensation: "$120k–$145k disclosed",
    employmentType: "Full-time",
    locationLabel: "United States",
    nextAction: Object.freeze({
      dueAtLabel: "Due 2026-09-03",
      timeZone: null,
      title: "Review source fields",
    }),
    notes: "Strong operating cadence overlap.",
    seniority: "Lead",
    tags: Object.freeze(["reviewed", "remote"]),
    validThrough: "2026-09-12",
    workplaceType: "Remote",
  }),
  source: Object.freeze({
    applyUrl: "https://northstar.example/jobs/123/apply",
    canonicalUrl: "https://northstar.example/jobs/123",
    comparison: null,
    comparisonLabel: "Two source snapshots can be compared.",
    extractionLabel: "Three candidates await confirmation.",
    firstSeenAtLabel: "2026-08-18",
    freshnessLabel: "Reviewed today",
    id: "source-northstar",
    lastSeenAtLabel: "2026-08-29",
    provenance: Object.freeze([
      Object.freeze({
        basis: "Source snapshot · user confirmed",
        field: "Title",
        value: "Product Operations Lead",
      }),
      Object.freeze({
        basis: "Source snapshot · unconfirmed",
        field: "Compensation",
        value: "$120k–$145k",
      }),
    ]),
    refreshPolicy: "Manual, user-invoked refresh only.",
    snapshotLabel: "Sanitized local snapshot captured 2026-08-29.",
  }),
  timeline: Object.freeze({
    itemCount: 3,
    items: Object.freeze([
      Object.freeze({
        detail: "Asked whether the role owns portfolio reporting.",
        editable: true,
        id: "note-1",
        kind: "note" as const,
        occurredAtLabel: "Today",
        title: "Research question",
      }),
      Object.freeze({
        detail: "Application status recorded locally.",
        editable: false,
        id: "status-1",
        kind: "status" as const,
        occurredAtLabel: "2026-08-21",
        title: "Marked applied",
      }),
    ]),
    lastInteractionAtLabel: "Today",
    pendingReminderCount: 1,
    upcomingInterviewCount: 0,
  }),
} as const satisfies JobWorkspaceContentModel);

const renderContent = (
  activeTab: Parameters<typeof JobWorkspaceContent>[0]["activeTab"],
  model: JobWorkspaceContentModel = MODEL,
) => renderToStaticMarkup(createElement(JobWorkspaceContent, { activeTab, model }));

describe("JobWorkspaceContent contract", () => {
  it("freezes the reviewed core tabs and local action vocabulary", () => {
    expect(JOB_WORKSPACE_CONTENT_TABS).toEqual([
      "overview",
      "requirements",
      "timeline",
      "company",
      "source",
    ]);
    expect(JOB_WORKSPACE_CONTENT_ACTIONS).toEqual([
      "add-timeline-note",
      "edit-job-notes",
      "open-timeline",
      "edit-timeline-note",
      "log-interaction",
      "schedule-interview",
      "schedule-follow-up",
      "edit-company-notes",
      "open-company-contacts",
      "open-company-jobs",
      "open-source-snapshot",
      "compare-source",
      "refresh-source",
      "accept-requirement-proposal",
      "reject-requirement-proposal",
      "correct-requirement-category",
      "select-requirement-evidence",
      "remove-requirement-evidence",
      "set-requirement-coverage",
      "reset-requirement-coverage",
    ]);
    expect(isJobWorkspaceContentTab("source")).toBe(true);
    expect(isJobWorkspaceContentTab("documents")).toBe(false);
  });

  it("renders provenance-bound requirements and explicit manual category correction", () => {
    const markup = renderContent("requirements");

    expect(markup).toContain('data-job-content-tab="requirements"');
    expect(markup).toContain('aria-label="Job requirements"');
    expect(markup).toContain('aria-label="Pending requirement proposals"');
    expect(markup).toContain("Healthcare domain experience");
    expect(markup).toContain("88% parse");
    expect(markup).toContain("Accept requirement");
    expect(markup).toContain("Reject proposal");
    expect(markup).toContain("Nothing becomes a recorded requirement until");
    expect(markup).toContain("Lead cross-functional delivery");
    expect(markup).toContain("91% extraction confidence");
    expect(markup).toContain("You will lead cross-functional delivery.");
    expect(markup).toContain("extracted as Required");
    expect(markup).toContain("Category for Lead cross-functional delivery");
    expect(markup).toContain("FTS5");
    expect(markup).toContain("structured relations");
    expect(markup).toContain("Portfolio launch");
    expect(markup).toContain("Suggestions are explainable and read-only");
    expect(markup).toContain("Select evidence");
    expect(markup).toContain("Evidence coverage");
    expect(markup).toContain("Unknown—not a Gap");
    expect(markup).toContain("Use automatic decision");
    expect(markup).toContain("Not Applicable");
    expect(markup).toContain("No aggregate score");
    expect(markup).toContain("not employer verification or hiring probability");
  });

  it("renders normalized facts, attention, notes, and a bounded quick timeline entry", () => {
    const markup = renderContent("overview");

    expect(markup).toContain('data-job-content-tab="overview"');
    expect(markup).toContain("Normalized local record");
    expect(markup).toContain("$120k–$145k disclosed");
    expect(markup).toContain("Application deadline");
    expect(markup).toContain("Review source fields");
    expect(markup).toContain("Strong operating cadence overlap.");
    expect(markup).toContain('maxLength="2000"');
    expect(markup).toContain("disabled");
  });

  it("renders semantic chronology while restricting edits to note events", () => {
    const markup = renderContent("timeline");

    expect(markup).toContain('<ol aria-label="Job timeline items"');
    expect(markup).toContain("status and outcome history is append-only");
    expect(markup).toContain("Research question");
    expect(markup.match(/Edit note/gu)).toHaveLength(1);
    expect(markup.match(/Immutable history event/gu)).toHaveLength(1);
  });

  it("renders company relationships and source provenance without opaque inference", () => {
    const company = renderContent("company");
    const source = renderContent("source");

    expect(company).toContain("Northstar Health");
    expect(company).toContain("Other active roles");
    expect(company).toContain("never guesses an email address");
    expect(source).toContain('aria-label="Field provenance"');
    expect(source).toContain('role="region" tabindex="0"');
    expect(source).toContain("Source snapshot · user confirmed");
    expect(source).toContain("never silently replace user-confirmed values");
    expect(source).toContain("Manual, user-invoked refresh only.");
  });

  it("renders explicit snapshot differences without implying trusted-field mutation", () => {
    const comparison = compareListingSnapshotsV1({
      specVersion: 1,
      baseline: {
        id: "0199a100-0000-7000-8000-000000000011",
        capturedAt: "2026-09-20T12:00:00.000Z",
        contentHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        requirements: [
          { key: "platform", kind: "required", text: "Build web systems" },
          { key: "travel", kind: "preferred", text: "Travel quarterly" },
        ],
        compensation: {
          minMinor: 12000000,
          maxMinor: 14500000,
          currency: "USD",
          interval: "year",
        },
        deadline: "2026-09-12",
        locations: ["New York, NY"],
      },
      current: {
        id: "0199a100-0000-7000-8000-000000000012",
        capturedAt: "2026-09-26T12:00:00.000Z",
        contentHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        requirements: [
          { key: "platform", kind: "required", text: "Build local-first systems" },
          { key: "security", kind: "required", text: "Lead threat modeling" },
        ],
        compensation: {
          minMinor: 13000000,
          maxMinor: 15500000,
          currency: "USD",
          interval: "year",
        },
        deadline: "2026-10-01",
        locations: ["Remote — United States"],
      },
    });
    const markup = renderContent("source", {
      ...MODEL,
      source: { ...MODEL.source, comparison },
    });

    expect(markup).toContain("Read-only snapshot comparison");
    expect(markup).toContain("Listing changes");
    expect(markup).toContain("Added:</strong> Lead threat modeling");
    expect(markup).toContain("Removed:</strong> Travel quarterly");
    expect(markup).toContain("Build web systems");
    expect(markup).toContain("Build local-first systems");
    expect(markup).toContain("USD 120,000");
    expect(markup).toContain("USD 145,000 per year");
    expect(markup).toContain("2026-09-12 to 2026-10-01");
    expect(markup).toContain("did not refresh a source or update any trusted field");
    expect(markup).toContain("Confirmed values remain unchanged");
    console.info(
      `REV006_COMPONENT_PROOF ${JSON.stringify({ requirementsRendered: true, compensationRendered: true, deadlineRendered: true, locationsRendered: true, contentRendered: true, trustedFieldMutations: 0 })}`,
    );
  });

  it("fails closed for duplicate events and editable immutable history", () => {
    expect(() =>
      renderContent("timeline", {
        ...MODEL,
        timeline: {
          ...MODEL.timeline,
          items: Object.freeze([MODEL.timeline.items[0]!, MODEL.timeline.items[0]!]),
        },
      }),
    ).toThrowError("Job workspace content model is invalid.");

    expect(() =>
      renderContent("timeline", {
        ...MODEL,
        timeline: {
          ...MODEL.timeline,
          items: Object.freeze([{ ...MODEL.timeline.items[1]!, editable: true }]),
        },
      }),
    ).toThrowError("Job workspace timeline item is invalid.");
  });
});
