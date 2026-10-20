import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { JobWorkspaceDto } from "@coredrill/application";
import { StoredJobDetails, type StoredJobDetailsProps } from "../src/index.js";

const id = "0198e204-0000-7000-8000-000000000001";
const now = "2026-10-19T12:00:00.000Z" as JobWorkspaceDto["job"]["createdAt"];
const workspace = (): JobWorkspaceDto => ({
  job: {
    id: id as JobWorkspaceDto["job"]["id"],
    title: "Stored role",
    company: null,
    status: null,
    workplaceType: null,
    locationLabel: null,
    datePosted: null,
    validThrough: null,
    nextAction: null,
    lastInteractionAt: null,
    tags: [],
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    rowVersion: 1,
  },
  descriptionText: "<script>privateInput()</script>\nRetained text.",
  employmentType: null,
  seniority: null,
  application: null,
  company: null,
  primarySource: null,
  attention: {
    nextAction: null,
    lastInteractionAt: null,
    upcomingInterviewCount: 0,
    pendingReminderCount: 0,
  },
  timelineItemCount: 0,
});
const render = (input: Partial<StoredJobDetailsProps> = {}) =>
  renderToStaticMarkup(
    createElement(StoredJobDetails, {
      value: null,
      tab: "overview",
      busy: false,
      error: null,
      onRefresh: () => undefined,
      ...input,
    }),
  );

describe("stored job detail presentation", () => {
  it("distinguishes loading, retry and stale retained facts", () => {
    expect(render()).toContain("Loading local job details");
    expect(render({ error: "Safe failure" })).toContain("Retry job details");
    expect(render({ value: workspace(), busy: true })).toContain("Previously loaded facts");
    expect(render({ value: workspace(), error: "Safe failure" })).toContain("Stored role");
  });
  it("renders missing facts and untrusted description as inert text, without invented application data", () => {
    const html = render({ value: workspace() });
    expect(html).toContain("Not recorded");
    expect(html).toContain("Unassigned");
    expect(html).toContain("No unarchived application attempt recorded");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("Northstar");
  });
  it("shows the actual company relationship or its explicit absence", () => {
    expect(render({ value: workspace(), tab: "company" })).toContain("No linked company");
    const value = workspace();
    const html = render({
      tab: "company",
      value: {
        ...value,
        company: {
          id: id as NonNullable<JobWorkspaceDto["company"]>["id"],
          canonicalName: "<img src=x>",
          websiteUrl: null,
          domain: "example.test",
          notes: "Company notes",
          contactCount: 2,
          otherActiveJobCount: 3,
        },
      },
    });
    expect(html).toContain("&lt;img src=x&gt;");
    expect(html).not.toContain("<img");
    expect(html).toContain("Company notes");
    expect(html).toContain("<dd>2</dd>");
    expect(html).toContain("<dd>3</dd>");
    expect(html).toContain("not verified people");
  });
  it("labels the latest unarchived application, UTC instants and scheduled attention without implying employer receipt", () => {
    const value = workspace();
    const html = render({
      value: {
        ...value,
        application: {
          id: id as NonNullable<JobWorkspaceDto["application"]>["id"],
          jobId: value.job.id,
          appliedAt: now,
          channel: "Manual record",
          currentStatus: {
            id: id as NonNullable<JobWorkspaceDto["job"]["status"]>["id"],
            name: "My applied stage",
            category: "applied",
            color: null,
            terminal: false,
          },
          selectedResumeVersionId: null,
          selectedCoverLetterVersionId: null,
          notes: "<b>notes</b>",
          createdAt: now,
          updatedAt: now,
          rowVersion: 1,
        },
        attention: {
          nextAction: {
            id: id as NonNullable<JobWorkspaceDto["attention"]["nextAction"]>["id"],
            jobId: value.job.id,
            title: "Research",
            dueAt: now,
            timeZone: null,
          },
          lastInteractionAt: now,
          upcomingInterviewCount: 1,
          pendingReminderCount: 2,
        },
      },
    });
    expect(html).toContain("Latest unarchived application");
    expect(html).toContain("not employer receipt");
    expect(html).toContain("not completed activity");
    expect(html).toContain("2026-10-19 12:00:00.000 UTC");
    expect(html).toContain("&lt;b&gt;notes&lt;/b&gt;");
    expect(html).toContain("Manual record");
  });
});
