import { COLOR_TOKENS, type ColorTokenName, type ResolvedTheme } from "./foundations.js";

export const UI_CONTRAST_REPORT_SPEC_VERSION = 1 as const;

export interface ContrastCaseDefinition {
  readonly id: string;
  readonly theme: ResolvedTheme;
  readonly foreground: ColorTokenName;
  readonly background: ColorTokenName;
  readonly kind: "normal-text" | "non-text";
  readonly requiredRatio: 4.5 | 3;
}

export interface ContrastCaseResult extends ContrastCaseDefinition {
  readonly ratio: number;
  readonly passed: boolean;
}

export interface UiContrastReport {
  readonly specVersion: typeof UI_CONTRAST_REPORT_SPEC_VERSION;
  readonly standard: "WCAG 2.2 AA";
  readonly minimumRatio: number;
  readonly cases: readonly ContrastCaseResult[];
}

const PAIRS = [
  ["text", "surface", "normal-text", 4.5],
  ["text-muted", "surface", "normal-text", 4.5],
  ["text-subtle", "surface", "normal-text", 4.5],
  ["accent", "surface", "non-text", 3],
  ["focus", "canvas", "non-text", 3],
  ["border", "surface", "non-text", 3],
  ["on-accent", "accent", "normal-text", 4.5],
  ["on-success", "success", "normal-text", 4.5],
  ["on-warning", "warning", "normal-text", 4.5],
  ["on-danger", "danger", "normal-text", 4.5],
  ["on-info", "info", "normal-text", 4.5],
] as const satisfies readonly (readonly [
  ColorTokenName,
  ColorTokenName,
  ContrastCaseDefinition["kind"],
  ContrastCaseDefinition["requiredRatio"],
])[];

export const UI_CONTRAST_CASES: readonly ContrastCaseDefinition[] = Object.freeze(
  (["light", "dark"] as const).flatMap((theme) =>
    PAIRS.map(([foreground, background, kind, requiredRatio]) =>
      Object.freeze({
        id: `${theme}-${foreground}-on-${background}`,
        theme,
        foreground,
        background,
        kind,
        requiredRatio,
      }),
    ),
  ),
);

const linearChannel = (channel: number): number => {
  const normalized = channel / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
};

const relativeLuminance = (hexColor: string): number => {
  const match = /^#(?<red>[0-9a-f]{2})(?<green>[0-9a-f]{2})(?<blue>[0-9a-f]{2})$/iu.exec(hexColor);
  if (match?.groups === undefined) throw new TypeError("Contrast colors must use six-digit hex.");
  const red = linearChannel(Number.parseInt(match.groups["red"] ?? "", 16));
  const green = linearChannel(Number.parseInt(match.groups["green"] ?? "", 16));
  const blue = linearChannel(Number.parseInt(match.groups["blue"] ?? "", 16));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

export const calculateContrastRatio = (foreground: string, background: string): number => {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
};

const roundRatio = (ratio: number): number => Math.round(ratio * 100) / 100;

export const buildContrastReport = (): UiContrastReport => {
  const cases = Object.freeze(
    UI_CONTRAST_CASES.map((definition) => {
      const themeTokens = COLOR_TOKENS[definition.theme];
      const ratio = roundRatio(
        calculateContrastRatio(
          themeTokens[definition.foreground],
          themeTokens[definition.background],
        ),
      );
      return Object.freeze({ ...definition, ratio, passed: ratio >= definition.requiredRatio });
    }),
  );
  return Object.freeze({
    specVersion: UI_CONTRAST_REPORT_SPEC_VERSION,
    standard: "WCAG 2.2 AA",
    minimumRatio: Math.min(...cases.map(({ ratio }) => ratio)),
    cases,
  });
};
