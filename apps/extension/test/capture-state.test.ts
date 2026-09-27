import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  PRODUCTION_EXTENSION_STATE_CATALOG_V1,
  PRODUCTION_EXTENSION_STATE_KINDS,
  ProductionExtensionState,
  assertProductionExtensionStateModelV1,
  classifyCapturedPageV1,
  resolveProductionExtensionStateV1,
} from "../src/capture-state";
import fixture from "./fixtures/job-posting.capture.json" with { type: "json" };

const recognizedSnapshot = Object.freeze({
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
});

describe("production extension state catalog", () => {
  it("covers all six reviewed states with immutable local-first recovery semantics", () => {
    expect(Object.keys(PRODUCTION_EXTENSION_STATE_CATALOG_V1)).toEqual(
      PRODUCTION_EXTENSION_STATE_KINDS,
    );

    for (const model of Object.values(PRODUCTION_EXTENSION_STATE_CATALOG_V1)) {
      expect(() => assertProductionExtensionStateModelV1(model)).not.toThrow();
      expect(Object.isFrozen(model)).toBe(true);
      expect(Object.isFrozen(model.actions)).toBe(true);
      expect(model.localStatus.toLowerCase()).toMatch(/local|extension|acknowledged/u);
      expect(model.actions.some(({ label }) => /apply/iu.test(label))).toBe(false);
    }

    expect(PRODUCTION_EXTENSION_STATE_CATALOG_V1["permission-needed"].permission).toEqual({
      exactAccess: "Temporary activeTab access plus scripting on only the current HTTP(S) page.",
      reason: "Coredrill needs that access only after your click to build a local capture preview.",
    });
    expect(PRODUCTION_EXTENSION_STATE_CATALOG_V1.queued.localStatus).toContain(
      "until acknowledgement or expiry",
    );
    expect(PRODUCTION_EXTENSION_STATE_CATALOG_V1.transferred.localStatus).toContain(
      "no longer retained",
    );
  });

  it("resolves permission and transfer precedence from exact versioned facts", () => {
    expect(
      resolveProductionExtensionStateV1({
        specVersion: 1,
        permission: "available",
        recognition: "recognized",
        transfer: "idle",
      }),
    ).toBe("recognized");
    expect(
      resolveProductionExtensionStateV1({
        specVersion: 1,
        permission: "available",
        recognition: "needs-input",
        transfer: "queued",
      }),
    ).toBe("queued");
    expect(
      resolveProductionExtensionStateV1({
        specVersion: 1,
        permission: "available",
        recognition: "unrecognized",
        transfer: "transferred",
      }),
    ).toBe("transferred");
    expect(
      resolveProductionExtensionStateV1({
        specVersion: 1,
        permission: "needed",
        recognition: "recognized",
        transfer: "transferred",
      }),
    ).toBe("permission-needed");

    for (const invalid of [
      { specVersion: 1, permission: "available", recognition: "recognized" },
      {
        specVersion: 1,
        permission: "available",
        recognition: "recognized",
        transfer: "idle",
        extra: true,
      },
      {
        specVersion: 2,
        permission: "available",
        recognition: "recognized",
        transfer: "idle",
      },
    ]) {
      expect(() => resolveProductionExtensionStateV1(invalid)).toThrowError(
        "Production extension state facts are invalid.",
      );
    }
  });

  it("classifies only a validated job signal with minimum fields as recognized", () => {
    expect(classifyCapturedPageV1(recognizedSnapshot)).toBe("recognized");
    expect(
      classifyCapturedPageV1({
        ...recognizedSnapshot,
        fields: { title: recognizedSnapshot.fields.title },
      }),
    ).toBe("needs-input");
    expect(
      classifyCapturedPageV1({
        ...recognizedSnapshot,
        jsonLd: undefined,
      }),
    ).toBe("unrecognized");
    expect(() => classifyCapturedPageV1({ ...recognizedSnapshot, specVersion: 2 })).toThrowError(
      "Capture preview is invalid.",
    );
  });

  it("renders named semantic status, local-work notes, permission detail, and actions", () => {
    for (const kind of PRODUCTION_EXTENSION_STATE_KINDS) {
      const model = PRODUCTION_EXTENSION_STATE_CATALOG_V1[kind];
      const markup = renderToStaticMarkup(createElement(ProductionExtensionState, { model }));
      expect(markup).toContain(`data-capture-state="${kind}"`);
      expect(markup).toContain(model.title);
      expect(markup).toContain(model.localStatus);
      expect(markup).toContain('role="note"');
      for (const action of model.actions) expect(markup).toContain(action.label);
    }

    const permissionMarkup = renderToStaticMarkup(
      createElement(ProductionExtensionState, {
        model: PRODUCTION_EXTENSION_STATE_CATALOG_V1["permission-needed"],
      }),
    );
    expect(permissionMarkup).toContain("Exact access");
    expect(permissionMarkup).toContain("No site-wide host permission");
    console.info(
      `PEX001_STATE_CATALOG_PROOF ${JSON.stringify({ states: PRODUCTION_EXTENSION_STATE_KINDS.length, recognized: true, unrecognized: true, needsInput: true, queued: true, transferred: true, permission: true, applyLabels: 0, hostPermissionsAdded: 0 })}`,
    );
  });

  it("fails closed when a state's required actions or bounded copy are incomplete", () => {
    const { permission: _permission, ...permissionMissing } =
      PRODUCTION_EXTENSION_STATE_CATALOG_V1["permission-needed"];
    expect(() =>
      assertProductionExtensionStateModelV1({
        ...PRODUCTION_EXTENSION_STATE_CATALOG_V1.queued,
        actions: PRODUCTION_EXTENSION_STATE_CATALOG_V1.queued.actions.filter(
          ({ id }) => id !== "export-capture",
        ),
      }),
    ).toThrowError("Queued state requires retry, export, and workspace paths.");
    expect(() => assertProductionExtensionStateModelV1(permissionMissing)).toThrowError(
      "Permission state requires exact access and a manual fallback.",
    );
    expect(() =>
      assertProductionExtensionStateModelV1({
        ...PRODUCTION_EXTENSION_STATE_CATALOG_V1.recognized,
        title: "x".repeat(97),
      }),
    ).toThrowError("Production extension state copy is invalid.");
  });
});
