import { applicationFailure, type CareerProfileEntryDto } from "@coredrill/application";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  CAREER_PROFILE_EDITOR_SECTIONS,
  CareerProfileWorkspace,
  type CareerProfileWorkspaceModel,
} from "../src/index.js";

const ENTRY: CareerProfileEntryDto = Object.freeze({
  id: "0199a100-0000-7000-8000-000000000002" as CareerProfileEntryDto["id"],
  kind: "employment",
  primaryLabel: "Operations Lead",
  secondaryLabel: "Northstar Health",
  startDate: "2024-02-29" as CareerProfileEntryDto["startDate"],
  endDate: null,
  current: true,
  verificationState: "user_confirmed",
  createdAt: "2026-09-27T12:00:00.000Z" as CareerProfileEntryDto["createdAt"],
  rowVersion: 1,
});

const MODEL = Object.freeze({
  loading: false,
  entries: Object.freeze([ENTRY]),
} as const satisfies CareerProfileWorkspaceModel);

const renderWorkspace = (model: CareerProfileWorkspaceModel = MODEL) =>
  renderToStaticMarkup(
    createElement(CareerProfileWorkspace, {
      model,
      onSave: async () =>
        applicationFailure({ code: "internal", message: "unused", retryable: false }),
    }),
  );

describe("CareerProfileWorkspace", () => {
  it("freezes the manual section vocabulary without pulling later story or AI work forward", () => {
    expect(CAREER_PROFILE_EDITOR_SECTIONS.map(({ id }) => id)).toEqual([
      "basics",
      "employment",
      "education",
      "project",
      "skill",
      "accomplishment",
      "certification",
      "publication",
      "volunteer",
    ]);
    const markup = renderWorkspace();
    expect(markup).toContain("resume-import proposals");
    expect(markup).toContain("story/evidence linking");
    expect(markup).toContain("AI-assisted drafting");
  });

  it("renders an accessible local-only editor with explicit verification behavior", () => {
    const markup = renderWorkspace();
    expect(markup).toContain('data-testid="career-profile-workspace"');
    expect(markup).toContain('aria-label="Career Profile sections"');
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('role="tabpanel"');
    expect(markup).toContain("Manual entries stay on this device");
    expect(markup).toContain("User-confirmed on save");
    expect(markup).toContain('name="displayName"');
    expect(markup).toContain('name="targetRoles"');
    expect(markup).toContain('name="workModes"');
  });

  it("fails closed for duplicate identities, unsupported kinds, and excessive records", () => {
    expect(() => renderWorkspace({ ...MODEL, entries: [ENTRY, ENTRY] })).toThrowError(
      "Career Profile workspace model is invalid.",
    );
    expect(() =>
      renderWorkspace({
        ...MODEL,
        entries: [{ ...ENTRY, kind: "story" as never }],
      }),
    ).toThrowError("Career Profile workspace model is invalid.");
    expect(() =>
      renderWorkspace({
        ...MODEL,
        entries: Array.from({ length: 10_001 }, (_, index) => ({
          ...ENTRY,
          id: `0199a100-0000-7000-8000-${String(index).padStart(12, "0")}` as CareerProfileEntryDto["id"],
        })),
      }),
    ).toThrowError("Career Profile workspace model is invalid.");
  });
});
