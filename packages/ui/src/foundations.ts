export const THEME_PREFERENCES = Object.freeze(["system", "light", "dark"] as const);
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const RESOLVED_THEMES = Object.freeze(["light", "dark"] as const);
export type ResolvedTheme = (typeof RESOLVED_THEMES)[number];

export const DENSITY_MODES = Object.freeze(["comfortable", "compact"] as const);
export type DensityMode = (typeof DENSITY_MODES)[number];

export const COLOR_TOKENS = Object.freeze({
  light: Object.freeze({
    canvas: "#f7f5f0",
    surface: "#fffdfa",
    "surface-raised": "#ffffff",
    text: "#202522",
    "text-muted": "#4f5b55",
    "text-subtle": "#626d67",
    accent: "#495a92",
    "accent-hover": "#384778",
    "accent-soft": "#e5e8f4",
    "on-accent": "#ffffff",
    success: "#1f6f50",
    "success-soft": "#e0f2e9",
    "on-success": "#ffffff",
    warning: "#825300",
    "warning-soft": "#f7ecd0",
    "on-warning": "#ffffff",
    danger: "#a3312a",
    "danger-soft": "#f8e4e1",
    "on-danger": "#ffffff",
    info: "#285f8f",
    "info-soft": "#e0edf8",
    "on-info": "#ffffff",
    border: "#858f89",
    focus: "#4f60a8",
  }),
  dark: Object.freeze({
    canvas: "#141715",
    surface: "#1c211e",
    "surface-raised": "#252b27",
    text: "#f4f5f2",
    "text-muted": "#c4cac5",
    "text-subtle": "#aab2ac",
    accent: "#b8c3ff",
    "accent-hover": "#ced5ff",
    "accent-soft": "#303653",
    "on-accent": "#17213f",
    success: "#79d9aa",
    "success-soft": "#1f4938",
    "on-success": "#102d21",
    warning: "#f2bd60",
    "warning-soft": "#4b3516",
    "on-warning": "#2a1b00",
    danger: "#ff9b92",
    "danger-soft": "#572b28",
    "on-danger": "#351210",
    info: "#8ecaff",
    "info-soft": "#203f5a",
    "on-info": "#102638",
    border: "#6f7a72",
    focus: "#c8ceff",
  }),
});

export type ColorTokenName = keyof (typeof COLOR_TOKENS)["light"];

export interface AppearancePreferenceInput {
  readonly theme: ThemePreference;
  readonly density: DensityMode;
  readonly prefersDark: boolean;
  readonly prefersReducedMotion: boolean;
}

export interface RootAppearanceAttributes {
  readonly "data-theme": ResolvedTheme;
  readonly "data-density": DensityMode;
  readonly "data-motion": "full" | "reduced";
}

const includes = <Value extends string>(values: readonly Value[], value: unknown): value is Value =>
  typeof value === "string" && values.includes(value as Value);

export const parseThemePreference = (value: unknown): ThemePreference => {
  if (!includes(THEME_PREFERENCES, value)) {
    throw new TypeError("Theme preference is invalid.");
  }
  return value;
};

export const parseDensityMode = (value: unknown): DensityMode => {
  if (!includes(DENSITY_MODES, value)) {
    throw new TypeError("Density mode is invalid.");
  }
  return value;
};

export const resolveThemePreference = (
  preference: ThemePreference,
  prefersDark: boolean,
): ResolvedTheme => (preference === "system" ? (prefersDark ? "dark" : "light") : preference);

export const getRootAppearanceAttributes = (
  input: AppearancePreferenceInput,
): RootAppearanceAttributes =>
  Object.freeze({
    "data-theme": resolveThemePreference(parseThemePreference(input.theme), input.prefersDark),
    "data-density": parseDensityMode(input.density),
    "data-motion": input.prefersReducedMotion ? "reduced" : "full",
  });
