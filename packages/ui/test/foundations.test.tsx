import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  COLOR_TOKENS,
  DENSITY_MODES,
  Icon,
  THEME_PREFERENCES,
  buildContrastReport,
  calculateContrastRatio,
  getRootAppearanceAttributes,
  parseDensityMode,
  parseThemePreference,
  resolveThemePreference,
} from "../src/index.js";

const stylesheet = readFileSync(fileURLToPath(new URL("../styles.css", import.meta.url)), "utf8");

describe("UI foundation preferences", () => {
  it("resolves explicit and system themes into stable root attributes", () => {
    expect(THEME_PREFERENCES).toEqual(["system", "light", "dark"]);
    expect(DENSITY_MODES).toEqual(["comfortable", "compact"]);
    expect(resolveThemePreference("system", true)).toBe("dark");
    expect(resolveThemePreference("system", false)).toBe("light");
    expect(resolveThemePreference("light", true)).toBe("light");
    expect(
      getRootAppearanceAttributes({
        density: "compact",
        prefersDark: true,
        prefersReducedMotion: true,
        theme: "system",
      }),
    ).toEqual({
      "data-density": "compact",
      "data-motion": "reduced",
      "data-theme": "dark",
    });
  });

  it("keeps every declared theme token synchronized with the shipped stylesheet", () => {
    for (const theme of ["light", "dark"] as const) {
      for (const [name, value] of Object.entries(COLOR_TOKENS[theme])) {
        expect(stylesheet).toContain(`--color-${name}: ${value};`);
      }
    }
  });

  it("rejects unknown appearance values at the shared boundary", () => {
    expect(() => parseThemePreference("sepia")).toThrowError("Theme preference is invalid.");
    expect(() => parseDensityMode("dense")).toThrowError("Density mode is invalid.");
  });
});

describe("UI foundation contrast", () => {
  it("passes every reviewed WCAG AA text and non-text pair", () => {
    const report = buildContrastReport();
    expect(report.specVersion).toBe(1);
    expect(report.standard).toBe("WCAG 2.2 AA");
    expect(report.cases.length).toBeGreaterThanOrEqual(20);
    expect(report.cases.every(({ passed }) => passed)).toBe(true);
    expect(report.minimumRatio).toBeGreaterThanOrEqual(3);
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.cases)).toBe(true);
  });

  it("calculates the WCAG endpoints and rejects ambiguous color syntax", () => {
    expect(calculateContrastRatio("#ffffff", "#000000")).toBe(21);
    expect(calculateContrastRatio("#000000", "#ffffff")).toBe(21);
    expect(() => calculateContrastRatio("white", "#000000")).toThrowError(
      "Contrast colors must use six-digit hex.",
    );
  });
});

describe("Icon", () => {
  it("renders named semantic icons with an accessible label and no focus stop", () => {
    const markup = renderToStaticMarkup(
      createElement(Icon, { label: "Search", name: "search", size: 20 }),
    );
    expect(markup).toContain('role="img"');
    expect(markup).toContain('aria-label="Search"');
    expect(markup).toContain('focusable="false"');
    expect(markup).not.toContain("aria-hidden");
  });

  it("renders explicitly decorative icons outside the accessibility tree", () => {
    const markup = renderToStaticMarkup(
      createElement(Icon, { decorative: true, name: "chevron-right" }),
    );
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('focusable="false"');
    expect(markup).not.toContain("aria-label");
    expect(markup).not.toContain('role="img"');
  });

  it("rejects an empty runtime label for a semantic icon", () => {
    expect(() =>
      renderToStaticMarkup(createElement(Icon, { label: " ", name: "search" })),
    ).toThrowError("Semantic icons require a nonempty accessible label.");
  });
});
