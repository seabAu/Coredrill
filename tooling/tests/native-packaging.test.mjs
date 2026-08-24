import { readFile } from "node:fs/promises";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "..", "..");

let cargoManifest;
let desktopPackage;
let packageProof;
let tauriConfig;

beforeAll(async () => {
  const desktopRoot = path.join(repositoryRoot, "apps", "desktop");
  const tauriRoot = path.join(desktopRoot, "src-tauri");
  [cargoManifest, desktopPackage, packageProof, tauriConfig] = await Promise.all([
    readFile(path.join(tauriRoot, "Cargo.toml"), "utf8"),
    readFile(path.join(desktopRoot, "package.json"), "utf8").then(JSON.parse),
    readFile(
      path.join(repositoryRoot, "tooling", "scripts", "run-native-package-proof.ps1"),
      "utf8",
    ),
    readFile(path.join(tauriRoot, "tauri.conf.json"), "utf8").then(JSON.parse),
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
    expect(tauriConfig.bundle.targets).toEqual(["nsis"]);
    expect(tauriConfig.bundle.useLocalToolsDir).toBe(true);
    expect(tauriConfig.bundle.windows.allowDowngrades).toBe(false);
    expect(tauriConfig.bundle.windows.webviewInstallMode).toEqual({
      type: "downloadBootstrapper",
      silent: true,
    });
    expect(tauriConfig.bundle.windows.nsis.installMode).toBe("currentUser");
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
});
