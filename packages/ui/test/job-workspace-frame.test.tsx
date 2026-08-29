import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  JOB_WORKSPACE_ACTIONS,
  JOB_WORKSPACE_TABS,
  JobWorkspaceFrame,
  type JobWorkspaceFrameModel,
} from "../src/index.js";

const MODEL = Object.freeze({
  company: "Northstar Health",
  id: "job-northstar",
  nextAction: "Review source fields",
  priority: "high",
  sourceFreshness: "Captured today",
  sourceLabel: "Company careers page",
  status: "Saved",
  title: "Product Operations Lead",
} as const satisfies JobWorkspaceFrameModel);

const renderFrame = (overrides: Partial<Parameters<typeof JobWorkspaceFrame>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(JobWorkspaceFrame, {
      activeTab: "overview",
      mode: "contextual",
      model: MODEL,
      onRequestClose: () => undefined,
      ...overrides,
    }),
  );

describe("JobWorkspaceFrame contract", () => {
  it("freezes the reviewed tabs and always-reachable actions", () => {
    expect(JOB_WORKSPACE_TABS).toEqual([
      "overview",
      "requirements",
      "documents",
      "timeline",
      "company",
      "source",
    ]);
    expect(JOB_WORKSPACE_ACTIONS).toEqual([
      "change-status",
      "set-next-action",
      "prepare-application",
      "open-source",
      "open-more",
    ]);
  });

  it("renders the same identifying context, tabs, and important actions in contextual mode", () => {
    const markup = renderFrame();

    expect(markup).toContain('data-workspace-mode="contextual"');
    expect(markup).toContain("Product Operations Lead");
    expect(markup).toContain("Northstar Health");
    expect(markup).toContain("Company careers page");
    expect(markup).toContain("Captured today");
    expect(markup).toContain("Change status");
    expect(markup).toContain("Set next action");
    expect(markup).toContain("Prepare application");
    expect(markup).toContain("Job workspace width");
    expect(markup).toContain('aria-current="page"');
  });

  it("reuses the frame as a full page without the contextual resize control", () => {
    const markup = renderFrame({ activeTab: "source", mode: "full-page" });

    expect(markup).toContain('data-workspace-mode="full-page"');
    expect(markup).toContain('data-job-workspace-panel="source"');
    expect(markup).toContain("Back to Pipeline");
    expect(markup).not.toContain("Job workspace width");
  });

  it("rejects unsafe model identity and out-of-range contextual widths", () => {
    expect(() => renderFrame({ model: { ...MODEL, title: " " } })).toThrowError(
      "Job workspace frame requires bounded identifying context.",
    );
    expect(() => renderFrame({ contextualWidth: 780 })).toThrowError(
      "Contextual Job workspace width must be between 560 and 760 pixels.",
    );
  });
});
