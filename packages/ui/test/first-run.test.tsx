import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  DISPOSABLE_DEMO_VAULT,
  FIRST_JOB_METHODS,
  FIRST_RUN_AI_MODES,
  FIRST_RUN_RUNTIME_KINDS,
  FIRST_RUN_TRACKS,
  FirstRunExperience,
  GUIDED_SETUP_STEPS,
  SAFE_DEFAULT_VAULT_NAME,
} from "../src/index.js";

const renderFirstRun = () => renderToStaticMarkup(createElement(FirstRunExperience));

describe("FirstRunExperience contract", () => {
  it("offers quick, guided, demo, and skip paths from an accountless local-first chooser", () => {
    const markup = renderFirstRun();

    expect(markup).toContain("Quick start");
    expect(markup).toContain("Guided setup");
    expect(markup).toContain("Explore demo");
    expect(markup).toContain("Skip setup and go to Home");
    expect(markup).toContain("No account · local first");
    expect(markup).toContain("AI stays disabled unless you choose otherwise");
  });

  it("keeps the reviewed paths, modes, and guided steps explicit", () => {
    expect(FIRST_RUN_TRACKS).toEqual(["quick", "guided"]);
    expect(FIRST_RUN_RUNTIME_KINDS).toEqual(["browser", "desktop"]);
    expect(FIRST_JOB_METHODS).toEqual(["manual", "paste", "capture"]);
    expect(FIRST_RUN_AI_MODES).toEqual(["disabled", "local", "byok"]);
    expect(GUIDED_SETUP_STEPS).toEqual([
      "device-scope",
      "vault-and-backup",
      "imports",
      "evidence-review",
      "ai-mode",
      "extension",
    ]);
    expect(SAFE_DEFAULT_VAULT_NAME).toBe("My job search");
  });

  it("defines demo data as synthetic, disposable, and isolated from a user vault", () => {
    expect(DISPOSABLE_DEMO_VAULT).toEqual({
      isolatedFromUserVault: true,
      kind: "demo",
      lifetime: "session",
      sampleData: "synthetic-v1",
      sampleJobCount: 3,
    });
    expect(Object.isFrozen(DISPOSABLE_DEMO_VAULT)).toBe(true);
  });
});
