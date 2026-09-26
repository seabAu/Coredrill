import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ConnectorRegistrySettings, type ConnectorRegistrySettingsModel } from "../src/index.js";

const connector = (
  overrides: Partial<ConnectorRegistrySettingsModel> = {},
): ConnectorRegistrySettingsModel => ({
  connectorId: "greenhouse-job-board",
  label: "Greenhouse Job Board",
  effectiveState: "off",
  reviewState: "current",
  reviewedAt: "2026-09-26T00:00:00.000Z",
  reviewDueAt: "2026-10-26T00:00:00.000Z",
  reviewAgeDays: 0,
  reviewDueInDays: 30,
  lastUsedAt: null,
  destinationDomains: ["boards-api.greenhouse.io"],
  attributionLabel: "Greenhouse Job Board API",
  termsUrl: "https://www.greenhouse.com/legal",
  privacyUrl: "https://www.greenhouse.com/privacy-policy",
  credentials: "none",
  ratePolicy: "One user-initiated request per board per second with bounded retry.",
  retention: "A 24-hour in-memory cache; selected evidence remains until user deletion.",
  userVisibleDataFlow: "Retrieve one published posting after an explicit user action.",
  ...overrides,
});

describe("ConnectorRegistrySettings", () => {
  it("shows default-off state, exact attribution, destination, and visible review age", () => {
    const markup = renderToStaticMarkup(
      createElement(ConnectorRegistrySettings, { connectors: [connector()] }),
    );

    expect(markup).toContain('data-testid="connector-registry-settings"');
    expect(markup).toContain('data-effective-state="off"');
    expect(markup).toContain("Network sources are off by default");
    expect(markup).toContain("Reviewed today · 30 days until review");
    expect(markup).toContain("Reviewed 2026-09-26 · due 2026-10-26");
    expect(markup).toContain("Never on this device");
    expect(markup).toContain("boards-api.greenhouse.io");
    expect(markup).toContain("Greenhouse Job Board API");
  });

  it("renders blocked and credential-bound disclosures without exposing a secret", () => {
    const markup = renderToStaticMarkup(
      createElement(ConnectorRegistrySettings, {
        connectors: [
          connector({
            connectorId: "usajobs-search",
            label: "USAJOBS Search",
            effectiveState: "blocked",
            reviewState: "expired",
            reviewAgeDays: 31,
            reviewDueInDays: -1,
            credentials: "user_configured",
            attributionLabel: "USAJOBS",
            destinationDomains: ["data.usajobs.gov"],
          }),
        ],
      }),
    );

    expect(markup).toContain('data-effective-state="blocked"');
    expect(markup).toContain('data-review-state="expired"');
    expect(markup).toContain("Review expired 1 day ago");
    expect(markup).toContain("User configured; bound only at the privileged connector");
    expect(markup).not.toMatch(/api[-_ ]?key/i);
  });
});
