import {
  COLOR_TOKENS,
  DENSITY_MODES,
  Icon,
  THEME_PREFERENCES,
  buildContrastReport,
  getRootAppearanceAttributes,
  type DensityMode,
  type RootAppearanceAttributes,
  type ThemePreference,
  type UiContrastReport,
} from "@coredrill/ui";
import "@coredrill/ui/styles.css";
import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

interface UiFoundationsCatalogApi {
  getAppearance(): RootAppearanceAttributes;
  getContrastReport(): UiContrastReport;
}

declare global {
  var coredrillUiFoundations: UiFoundationsCatalogApi | undefined;
}

const contrastReport = buildContrastReport();

const SWATCHES = [
  "canvas",
  "surface",
  "surface-raised",
  "text",
  "text-muted",
  "accent",
  "success",
  "warning",
  "danger",
  "info",
  "border",
  "focus",
] as const;

const capitalize = (value: string): string => `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;

const Catalog = () => {
  const [theme, setTheme] = useState<ThemePreference>("system");
  const [density, setDensity] = useState<DensityMode>("comfortable");
  const [prefersDark, setPrefersDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  const appearance = useMemo(
    () =>
      getRootAppearanceAttributes({
        density,
        prefersDark,
        prefersReducedMotion,
        theme,
      }),
    [density, prefersDark, prefersReducedMotion, theme],
  );

  useEffect(() => {
    const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleColorScheme = (event: MediaQueryListEvent): void => {
      setPrefersDark(event.matches);
    };
    const handleReducedMotion = (event: MediaQueryListEvent): void => {
      setPrefersReducedMotion(event.matches);
    };
    colorScheme.addEventListener("change", handleColorScheme);
    reducedMotion.addEventListener("change", handleReducedMotion);
    return () => {
      colorScheme.removeEventListener("change", handleColorScheme);
      reducedMotion.removeEventListener("change", handleReducedMotion);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset["theme"] = appearance["data-theme"];
    root.dataset["density"] = appearance["data-density"];
    root.dataset["motion"] = appearance["data-motion"];
    globalThis.coredrillUiFoundations = {
      getAppearance: () => appearance,
      getContrastReport: () => contrastReport,
    };
  }, [appearance]);

  const activeTokens = COLOR_TOKENS[appearance["data-theme"]];

  return (
    <main className="cd-foundation-catalog">
      <header className="cd-catalog-header">
        <div>
          <div className="cd-eyebrow">Coredrill interface system</div>
          <h1>UI foundation catalog</h1>
          <p>
            A local proof surface for the product tokens, readable themes, durable density, clear
            focus, semantic icons, and respectful motion.
          </p>
        </div>
        <div className="cd-catalog-controls" aria-label="Catalog appearance controls">
          <div className="cd-field-group">
            <label htmlFor="theme-preference">Theme</label>
            <select
              className="cd-field"
              id="theme-preference"
              onChange={(event) => {
                setTheme(event.target.value as ThemePreference);
              }}
              value={theme}
            >
              {THEME_PREFERENCES.map((option) => (
                <option key={option} value={option}>
                  {capitalize(option)}
                </option>
              ))}
            </select>
          </div>
          <div className="cd-field-group">
            <label htmlFor="density-preference">Density</label>
            <select
              className="cd-field"
              id="density-preference"
              onChange={(event) => {
                setDensity(event.target.value as DensityMode);
              }}
              value={density}
            >
              {DENSITY_MODES.map((option) => (
                <option key={option} value={option}>
                  {capitalize(option)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <div className="cd-catalog-grid">
        <section className="cd-panel" aria-labelledby="tokens-heading">
          <div className="cd-metadata">Theme: {appearance["data-theme"]}</div>
          <h2 id="tokens-heading">Semantic color tokens</h2>
          <div className="cd-token-grid">
            {SWATCHES.map((name) => (
              <div
                className="cd-swatch"
                key={name}
                style={{ "--swatch-color": activeTokens[name] } as CSSProperties}
              >
                <span className="cd-swatch-label">{name}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="cd-panel" aria-labelledby="type-heading">
          <div className="cd-metadata">System-first, no remote font request</div>
          <h2 id="type-heading">Typography and rhythm</h2>
          <div className="cd-type-sample-display">Evidence over guesswork.</div>
          <p>
            Body copy remains readable in both density modes. Metadata never drops below twelve
            pixels, and controls retain a forty-four-pixel hit target.
          </p>
          <p className="cd-type-sample-mono">source_snapshot.sha256 = verified</p>
        </section>

        <section className="cd-panel" aria-labelledby="controls-heading">
          <div className="cd-metadata">Keyboard-visible focus</div>
          <h2 id="controls-heading">Controls and icons</h2>
          <div className="cd-row">
            <button className="cd-button cd-button-primary" type="button">
              <Icon decorative name="check" size={18} />
              Save evidence
            </button>
            <button className="cd-button" type="button">
              <Icon decorative name="settings" size={18} />
              Settings
            </button>
            <button className="cd-button cd-button-danger" type="button">
              <Icon decorative name="x" size={18} />
              Remove
            </button>
          </div>
          <div className="cd-field-group">
            <label htmlFor="search-sample">Search label</label>
            <input
              className="cd-field"
              id="search-sample"
              placeholder="Company, role, or contact"
              type="search"
            />
          </div>
        </section>

        <section className="cd-panel" aria-labelledby="status-heading">
          <div className="cd-metadata">Icon and text, never color alone</div>
          <h2 id="status-heading">Semantic states</h2>
          <div className="cd-status-list">
            <span className="cd-status cd-status-success">
              <Icon decorative name="check" size={16} /> Verified
            </span>
            <span className="cd-status cd-status-warning">
              <Icon decorative name="alert-triangle" size={16} /> Needs review
            </span>
            <span className="cd-status cd-status-danger">
              <Icon decorative name="x" size={16} /> Failed
            </span>
            <span className="cd-status cd-status-info">
              <Icon decorative name="info" size={16} /> Informational
            </span>
          </div>
        </section>

        <section className="cd-panel" aria-labelledby="contrast-heading">
          <div className="cd-metadata">WCAG 2.2 AA</div>
          <h2 id="contrast-heading">Reviewed contrast</h2>
          <dl className="cd-contrast-summary">
            <div>
              <dt>Cases</dt>
              <dd>{contrastReport.cases.length}</dd>
            </div>
            <div>
              <dt>Passing</dt>
              <dd>{contrastReport.cases.filter(({ passed }) => passed).length}</dd>
            </div>
            <div>
              <dt>Minimum</dt>
              <dd>{contrastReport.minimumRatio}:1</dd>
            </div>
          </dl>
        </section>

        <section className="cd-panel" aria-labelledby="motion-heading">
          <div className="cd-metadata">Preference: {appearance["data-motion"]}</div>
          <h2 id="motion-heading">Reduced motion</h2>
          <p>
            Motion is brief and causal. The system preference removes repeating animation and
            reduces transitions to an effectively instantaneous duration.
          </p>
          <div className="cd-motion-demo" aria-hidden="true" />
          <span className="cd-visually-hidden">Decorative motion sample</span>
        </section>
      </div>
    </main>
  );
};

const rootElement = document.querySelector<HTMLElement>("#root");
if (rootElement === null) throw new Error("UI foundation catalog root is missing.");
createRoot(rootElement).render(<Catalog />);
