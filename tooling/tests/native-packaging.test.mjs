import { readFile } from "node:fs/promises";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "..", "..");

let cargoManifest;
let desktopPackage;
let linuxConfig;
let macosConfig;
let packageProof;
let platformPackageProof;
let tauriConfig;
let windowsConfig;
let workflow;

beforeAll(async () => {
  const desktopRoot = path.join(repositoryRoot, "apps", "desktop");
  const tauriRoot = path.join(desktopRoot, "src-tauri");
  [
    cargoManifest,
    desktopPackage,
    linuxConfig,
    macosConfig,
    packageProof,
    platformPackageProof,
    tauriConfig,
    windowsConfig,
    workflow,
  ] = await Promise.all([
    readFile(path.join(tauriRoot, "Cargo.toml"), "utf8"),
    readFile(path.join(desktopRoot, "package.json"), "utf8").then(JSON.parse),
    readFile(path.join(tauriRoot, "tauri.linux.conf.json"), "utf8").then(JSON.parse),
    readFile(path.join(tauriRoot, "tauri.macos.conf.json"), "utf8").then(JSON.parse),
    readFile(
      path.join(repositoryRoot, "tooling", "scripts", "run-native-package-proof.ps1"),
      "utf8",
    ),
    readFile(
      path.join(repositoryRoot, "tooling", "scripts", "run-native-platform-package-proof.mjs"),
      "utf8",
    ),
    readFile(path.join(tauriRoot, "tauri.conf.json"), "utf8").then(JSON.parse),
    readFile(path.join(tauriRoot, "tauri.windows.conf.json"), "utf8").then(JSON.parse),
    readFile(path.join(repositoryRoot, ".github", "workflows", "foundation.yml"), "utf8"),
  ]);
});

describe("native Windows package boundary", () => {
  it("keeps the contract-only storage probe behind an opt-in Cargo feature", () => {
    expect(cargoManifest).toMatch(
      /name = "coredrill-native-storage-probe"[\s\S]*?required-features = \["native-storage-probe"\]/,
    );
    expect(desktopPackage.scripts["build:native-probe"]).toContain(
      "--features native-storage-probe",
    );
    expect(desktopPackage.scripts["build:installer:windows"]).not.toContain("native-storage-probe");
  });

  it("pins the first package slice to a current-user NSIS installer", () => {
    expect(tauriConfig.bundle.active).toBe(true);
    expect(tauriConfig.bundle.targets).toBeUndefined();
    expect(windowsConfig.bundle.targets).toEqual(["nsis"]);
    expect(macosConfig.bundle.targets).toEqual(["app"]);
    expect(linuxConfig.bundle.targets).toEqual(["appimage"]);
    expect(tauriConfig.bundle.useLocalToolsDir).toBe(true);
    expect(tauriConfig.bundle.windows.allowDowngrades).toBe(false);
    expect(tauriConfig.bundle.windows.webviewInstallMode).toEqual({
      type: "downloadBootstrapper",
      silent: true,
    });
    expect(tauriConfig.bundle.windows.nsis.installMode).toBe("currentUser");
  });

  it("target-confines reviewed secure stores and package formats", () => {
    expect(cargoManifest).toContain(
      '[target.\'cfg(target_os = "macos")\'.dependencies]\napple-native-keyring-store = { version = "=1.0.2", default-features = false, features = ["keychain"] }',
    );
    expect(cargoManifest).toContain(
      '[target.\'cfg(target_os = "linux")\'.dependencies]\nzbus-secret-service-keyring-store = { version = "=1.0.1", default-features = false, features = ["crypto-rust"] }',
    );
    expect(macosConfig.bundle.macOS.signingIdentity).toBe("-");
    expect(desktopPackage.scripts["build:bundle:macos"]).toContain("--bundles app");
    expect(desktopPackage.scripts["build:bundle:linux"]).toContain("--bundles appimage");
    expect(desktopPackage.scripts["lint:desktop"]).toContain("--no-default-features --all-targets");
    expect(desktopPackage.scripts["lint:desktop"]).toContain("--all-features --lib --bins");
    expect(desktopPackage.scripts["lint:desktop"]).not.toContain("--all-targets --all-features");
    expect(workflow).toContain("runs-on: macos-26");
    expect(workflow).toContain("runs-on: ubuntu-26.04");
  });

  it("proves isolated installation and rejects a probe leaked into the package", () => {
    expect(packageProof).toContain('$installArguments = @("/S", "/D=$installRoot")');
    expect(packageProof).toContain(
      "Refusing to run while the default Coredrill install directory exists",
    );
    expect(packageProof).toContain(
      "The contract-only native storage probe leaked into the production package.",
    );
    expect(packageProof).toContain("nativeStorageProbeExcluded = $true");
  });

  it("inspects extracted cross-platform packages before retaining them", () => {
    expect(platformPackageProof).toContain("nativeStorageProbeExcluded: true");
    expect(platformPackageProof).toContain("fiveSecondLaunchAlive");
    expect(platformPackageProof).toContain("Package proof refuses a link that escapes");
    expect(platformPackageProof).toContain("Signature=adhoc");
  });
});
