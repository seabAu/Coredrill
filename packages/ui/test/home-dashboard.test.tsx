import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  HOME_ATTENTION_KINDS,
  HOME_URGENCY_LEVELS,
  HomeDashboard,
  type HomeDashboardModel,
} from "../src/index.js";

const READY_MODEL = Object.freeze({
  agendaSummary: "1 action · 1 interview",
  attention: Object.freeze([
    {
      action: { id: "review-captures", label: "Review" },
      detail: "One field remains unconfirmed.",
      id: "attention-1",
      kind: "capture-review",
      title: "Capture needs review",
    },
  ]),
  now: Object.freeze([
    {
      context: "Synthetic company · Interview",
      description: "Review the submitted files.",
      id: "now-1",
      primaryAction: { id: "open-interview-plan", label: "Open plan" },
      secondaryAction: { id: "view-submitted-files", label: "View files" },
      title: "Prepare for the interview",
      urgency: "upcoming",
      when: "Tomorrow",
    },
  ]),
  recent: Object.freeze([
    {
      context: "Opened today",
      href: "/jobs/synthetic/overview",
      id: "recent-1",
      kind: "job",
      title: "Synthetic job",
    },
  ]),
  snapshot: Object.freeze({
    pipeline: Object.freeze([{ count: 2, label: "Applied" }]),
    responseTiming: "Median response: 5 days.",
    weeklyTarget: Object.freeze({ completed: 1, target: 2 }),
  }),
  state: "ready",
  week: Object.freeze([
    {
      context: "Synthetic company",
      day: "Tomorrow",
      id: "agenda-1",
      time: "10:30 AM",
      title: "Interview",
    },
  ]),
} as const satisfies HomeDashboardModel);

const renderHome = (model: HomeDashboardModel) =>
  renderToStaticMarkup(createElement(HomeDashboard, { model }));

describe("HomeDashboard contract", () => {
  it("keeps the reviewed attention-queue order and optional, factual snapshot", () => {
    const markup = renderHome(READY_MODEL);
    const order = ["now", "attention", "week", "snapshot", "continue"].map((section) =>
      markup.indexOf(`data-home-section="${section}"`),
    );

    expect(order.every((position) => position >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((left, right) => left - right));
    expect(markup).toContain("The next moves worth your attention");
    expect(markup).toContain("Capture review");
    expect(markup).toContain("This is a private planning aid, not a streak");
    expect(markup).toContain('href="/jobs/synthetic/overview"');
  });

  it("renders the reviewed empty actions without requiring an account or AI", () => {
    const markup = renderHome({ state: "empty" });

    expect(markup).toContain("Add the first opportunity when you are ready");
    expect(markup).toContain("Add a job");
    expect(markup).toContain("Import existing tracker");
    expect(markup).toContain("Explore sample data");
    expect(markup).toContain("No account, AI connection, or application target is required");
  });

  it("freezes the complete attention and urgency vocabularies", () => {
    expect(HOME_ATTENTION_KINDS).toEqual([
      "backup-risk",
      "capture-review",
      "failed-transfer",
      "stale-follow-up",
      "unsupported-claim",
    ]);
    expect(HOME_URGENCY_LEVELS).toEqual(["overdue", "today", "upcoming"]);
  });

  it("rejects more than three high-priority Now actions", () => {
    const overflowModel: HomeDashboardModel = {
      ...READY_MODEL,
      now: Object.freeze([
        ...READY_MODEL.now,
        { ...READY_MODEL.now[0]!, id: "now-2" },
        { ...READY_MODEL.now[0]!, id: "now-3" },
        { ...READY_MODEL.now[0]!, id: "now-4" },
      ]),
    };

    expect(() => renderHome(overflowModel)).toThrowError(
      "Home supports at most three high-priority Now actions.",
    );
  });
});
