import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ADD_ACTIONS,
  ApplicationShell,
  COMMAND_ACTIONS,
  PRIMARY_NAVIGATION_ITEMS,
  VAULT_HEALTH_STATES,
  type VaultHealthState,
} from "../src/index.js";

const renderShell = (health: VaultHealthState = "healthy") =>
  renderToStaticMarkup(
    createElement(ApplicationShell, {
      activeDestination: "pipeline",
      children: createElement("h1", null, "Pipeline"),
      inboxCount: 3,
      outboxCount: 2,
      searchResults: [],
      vault: { health, kind: "browser", name: "Synthetic vault" },
    }),
  );

describe("ApplicationShell contract", () => {
  it("keeps the reviewed six-item navigation and stable local routes", () => {
    expect(PRIMARY_NAVIGATION_ITEMS.map(({ id, href }) => [id, href])).toEqual([
      ["home", "/"],
      ["pipeline", "/pipeline?view=board"],
      ["documents", "/documents"],
      ["profile", "/profile/basics"],
      ["network", "/network/companies"],
      ["insights", "/insights/pipeline"],
    ]);
  });

  it("exposes the complete reviewed Add and global-command inventories", () => {
    expect(ADD_ACTIONS.map(({ id }) => id)).toEqual([
      "add-job",
      "paste-listing",
      "import-tracker",
      "new-interaction",
      "new-contact",
      "new-document",
    ]);
    expect(COMMAND_ACTIONS.map(({ id }) => id)).toEqual([
      "search",
      "add-job",
      "paste-listing",
      "capture-url",
      "new-interaction",
      "generate-draft",
      "create-follow-up",
      "export-backup",
    ]);
  });

  it("renders an active destination, inbox/outbox counts, and explicit local-only state", () => {
    const markup = renderShell();
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain("3 captures need review");
    expect(markup).toContain("2 extension captures queued");
    expect(markup).toContain("Local only");
    expect(markup).toContain("Search local vault");
  });

  it("names every vault health state without relying on color", () => {
    const expectedLabels = [
      "Vault healthy",
      "Backup due",
      "Storage risk",
      "Offline · local work available",
      "Migration required",
    ];
    expect(VAULT_HEALTH_STATES).toHaveLength(expectedLabels.length);
    for (const [index, health] of VAULT_HEALTH_STATES.entries()) {
      expect(renderShell(health)).toContain(expectedLabels[index]);
    }
  });
});
