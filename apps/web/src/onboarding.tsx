import {
  FirstRunExperience,
  getRootAppearanceAttributes,
  type DensityMode,
  type DisposableDemoVaultRequest,
  type FirstRunCompletion,
  type FirstRunRuntimeKind,
  type ThemePreference,
} from "@coredrill/ui";
import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

import "./onboarding.css";

interface UserVaultPreview {
  readonly jobCount: number;
  readonly name: string;
  readonly runtime: FirstRunRuntimeKind;
}

interface OnboardingCatalogState {
  readonly activeVaultKind: "demo" | "none" | "user";
  readonly completedDestination: FirstRunCompletion["destination"] | null;
  readonly demoVault: DisposableDemoVaultRequest | null;
  readonly lastActivity: string;
  readonly lastCompletion: FirstRunCompletion | null;
  readonly skipped: boolean;
  readonly userVault: UserVaultPreview | null;
}

interface OnboardingCatalogApi {
  getState(): OnboardingCatalogState;
}

declare global {
  var coredrillOnboarding: OnboardingCatalogApi | undefined;
}

const readAppearance = (): {
  readonly density: DensityMode;
  readonly runtime: FirstRunRuntimeKind;
  readonly theme: ThemePreference;
} => {
  const parameters = new URLSearchParams(window.location.search);
  const requestedDensity = parameters.get("density");
  const requestedRuntime = parameters.get("runtime");
  const requestedTheme = parameters.get("theme");
  return {
    density: requestedDensity === "compact" ? "compact" : "comfortable",
    runtime: requestedRuntime === "desktop" ? "desktop" : "browser",
    theme: requestedTheme === "dark" || requestedTheme === "system" ? requestedTheme : "light",
  };
};

const OnboardingCatalog = () => {
  const appearance = useMemo(readAppearance, []);
  const [activeVaultKind, setActiveVaultKind] = useState<"demo" | "none" | "user">("none");
  const [completedDestination, setCompletedDestination] = useState<
    FirstRunCompletion["destination"] | null
  >(null);
  const [demoVault, setDemoVault] = useState<DisposableDemoVaultRequest | null>(null);
  const [lastActivity, setLastActivity] = useState(
    "First-run experience ready. No external request was made.",
  );
  const [lastCompletion, setLastCompletion] = useState<FirstRunCompletion | null>(null);
  const [skipped, setSkipped] = useState(false);
  const [userVault, setUserVault] = useState<UserVaultPreview | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    const attributes = getRootAppearanceAttributes({
      density: appearance.density,
      prefersDark: window.matchMedia("(prefers-color-scheme: dark)").matches,
      prefersReducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      theme: appearance.theme,
    });
    root.dataset["theme"] = attributes["data-theme"];
    root.dataset["density"] = attributes["data-density"];
    root.dataset["motion"] = attributes["data-motion"];
  }, [appearance]);

  useEffect(() => {
    globalThis.coredrillOnboarding = Object.freeze({
      getState: () =>
        Object.freeze({
          activeVaultKind,
          completedDestination,
          demoVault,
          lastActivity,
          lastCompletion,
          skipped,
          userVault,
        }),
    });
  }, [
    activeVaultKind,
    completedDestination,
    demoVault,
    lastActivity,
    lastCompletion,
    skipped,
    userVault,
  ]);

  return (
    <main>
      <FirstRunExperience
        initialRuntime={appearance.runtime}
        onComplete={(completion) => {
          setDemoVault(null);
          setLastCompletion(completion);
          setSkipped(false);
          setUserVault(
            Object.freeze({
              jobCount: completion.track === "quick" ? 1 : 0,
              name: completion.vaultName,
              runtime: completion.runtime,
            }),
          );
          setActiveVaultKind("user");
          setLastActivity(`Completed ${completion.track} setup locally.`);
        }}
        onDiscardDemoVault={() => {
          setDemoVault(null);
          setActiveVaultKind(userVault === null ? "none" : "user");
          setLastActivity("Discarded the isolated demo vault.");
        }}
        onNavigate={(destination) => {
          setCompletedDestination(destination);
          setLastActivity(`Opened ${destination} locally.`);
        }}
        onOpenDemoVault={(request) => {
          setDemoVault(request);
          setActiveVaultKind("demo");
          setLastActivity("Opened an isolated, session-only demo vault.");
        }}
        onSkip={() => {
          setSkipped(true);
          setActiveVaultKind(userVault === null ? "none" : "user");
          setLastActivity("Skipped setup and kept safe local defaults.");
        }}
      />
    </main>
  );
};

const rootElement = document.querySelector<HTMLElement>("#root");
if (rootElement === null) throw new Error("Onboarding root is missing.");
createRoot(rootElement).render(<OnboardingCatalog />);
