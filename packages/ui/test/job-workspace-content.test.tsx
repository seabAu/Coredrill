import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

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
    expect(JOB_WORKSPACE_CONTENT_TABS).toEqual(["overview", "timeline", "company", "source"]);
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
    ]);
    expect(isJobWorkspaceContentTab("source")).toBe(true);
    expect(isJobWorkspaceContentTab("documents")).toBe(false);
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
