import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  PHASE_ONE_WORKSPACE_STATE_CATALOG,
  PHASE_ONE_WORKSPACE_STATE_KINDS,
  PHASE_ONE_WORKSPACE_SURFACES,
  PhaseOneWorkspaceState,
  assertPhaseOneWorkspaceStateCatalogEntry,
  assertPhaseOneWorkspaceStateModel,
} from "../src/index.js";

describe("PhaseOneWorkspaceState catalog", () => {
  it("covers every reviewed Phase 1 state with validated local-first recovery copy", () => {
    expect(Object.keys(PHASE_ONE_WORKSPACE_STATE_CATALOG)).toEqual(PHASE_ONE_WORKSPACE_STATE_KINDS);
    expect(PHASE_ONE_WORKSPACE_STATE_CATALOG.loading.appliesTo).toEqual(
      PHASE_ONE_WORKSPACE_SURFACES,
    );
    expect(PHASE_ONE_WORKSPACE_STATE_CATALOG.error.appliesTo).toEqual(PHASE_ONE_WORKSPACE_SURFACES);
    expect(PHASE_ONE_WORKSPACE_STATE_CATALOG.offline.appliesTo).toEqual(
      PHASE_ONE_WORKSPACE_SURFACES,
    );

    for (const model of Object.values(PHASE_ONE_WORKSPACE_STATE_CATALOG)) {
      expect(() => assertPhaseOneWorkspaceStateCatalogEntry(model)).not.toThrow();
      expect(model.localStatus.toLocaleLowerCase()).toMatch(/local|device|vault|file/u);
      expect(Object.isFrozen(model)).toBe(true);
      expect(Object.isFrozen(model.actions)).toBe(true);
      expect(new Set(model.actions.map(({ id }) => id)).size).toBe(model.actions.length);
    }
  });

  it("requires named loading progress, visible partial boundaries, and exact permission scope", () => {
    expect(PHASE_ONE_WORKSPACE_STATE_CATALOG.loading.progress).toEqual({
      current: 2,
      label: "Reading local job records",
      total: 3,
    });
    expect(PHASE_ONE_WORKSPACE_STATE_CATALOG.partial.available.length).toBeGreaterThan(0);
    expect(PHASE_ONE_WORKSPACE_STATE_CATALOG.partial.unavailable.length).toBeGreaterThan(0);
    expect(PHASE_ONE_WORKSPACE_STATE_CATALOG["permission-denied"].permission).toEqual({
      exactAccess: "Read the single tracker file you choose in the system picker.",
      reason: "Coredrill needs its contents only to build a local import preview.",
    });
    expect(PHASE_ONE_WORKSPACE_STATE_CATALOG.offline.title).toContain("local work is available");
  });

  it("renders accessible state semantics, preserved-work copy, and bounded actions", () => {
    for (const kind of PHASE_ONE_WORKSPACE_STATE_KINDS) {
      const markup = renderToStaticMarkup(
        createElement(PhaseOneWorkspaceState, {
          model: PHASE_ONE_WORKSPACE_STATE_CATALOG[kind],
        }),
      );
      expect(markup).toContain(`data-workspace-state="${kind}"`);
      expect(markup).toContain(PHASE_ONE_WORKSPACE_STATE_CATALOG[kind].title);
      expect(markup).toContain(PHASE_ONE_WORKSPACE_STATE_CATALOG[kind].workStatus);
      expect(markup).toContain('role="note"');
    }

    const loadingMarkup = renderToStaticMarkup(
      createElement(PhaseOneWorkspaceState, {
        model: PHASE_ONE_WORKSPACE_STATE_CATALOG.loading,
      }),
    );
    expect(loadingMarkup).toContain('aria-busy="true"');
    expect(loadingMarkup).toContain("<progress");

    const permissionMarkup = renderToStaticMarkup(
      createElement(PhaseOneWorkspaceState, {
        model: PHASE_ONE_WORKSPACE_STATE_CATALOG["permission-denied"],
      }),
    );
    expect(permissionMarkup).toContain("Exact access");
    expect(permissionMarkup).toContain("Continue manually");
  });

  it("fails closed when recovery semantics are incomplete or fields are unbounded", () => {
    expect(() =>
      assertPhaseOneWorkspaceStateModel({
        ...PHASE_ONE_WORKSPACE_STATE_CATALOG.error,
        actions: PHASE_ONE_WORKSPACE_STATE_CATALOG.error.actions.filter(
          ({ id }) => id !== "copy-diagnostics",
        ),
      }),
    ).toThrowError("Error state requires retry, redacted diagnostics, and fallback.");
    expect(() =>
      assertPhaseOneWorkspaceStateModel({
        ...PHASE_ONE_WORKSPACE_STATE_CATALOG.partial,
        unavailable: [],
      }),
    ).toThrowError("Partial state requires available data and a recovery path.");
    expect(() =>
      assertPhaseOneWorkspaceStateModel({
        ...PHASE_ONE_WORKSPACE_STATE_CATALOG.empty,
        title: "x".repeat(97),
      }),
    ).toThrowError("Phase 1 workspace state copy is invalid.");
    expect(() =>
      assertPhaseOneWorkspaceStateCatalogEntry({
        ...PHASE_ONE_WORKSPACE_STATE_CATALOG.empty,
        appliesTo: ["home", "home"],
      }),
    ).toThrowError("Phase 1 workspace state surface coverage is invalid.");
  });
});
