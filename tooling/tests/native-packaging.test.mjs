import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
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
  it.skipIf(process.platform !== "win32")(
    "runs the actual sampler and cleanup through exited-child races without hiding other failures",
    () => {
      const script = `
      Set-StrictMode -Version Latest
      $ErrorActionPreference = 'Stop'
      $tokens = $null
      $parseErrors = $null
      $ast = [System.Management.Automation.Language.Parser]::ParseFile(
        (Join-Path (Get-Location) 'tooling/scripts/run-native-package-proof.ps1'), [ref]$tokens, [ref]$parseErrors)
      if ($parseErrors.Count -ne 0) { throw 'Package proof did not parse.' }
      $definitions = @($ast.FindAll({ param($node)
        $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
        $node.Name -in @('Get-ResourceSample', 'Stop-CoredrillProcessTree')
      }, $true))
      if ($definitions.Count -ne 2) { throw 'Expected the two production functions.' }
      foreach ($definition in $definitions) { Invoke-Expression $definition.Extent.Text }
      $script:taskSampleRootId = $PID
      $taskRootProcess = Get-Process -Id $PID
      function Get-ProcessTreeRecords {
        param([int]$RootProcessId)
        @(
          [pscustomobject]@{ ProcessId = $script:taskSampleRootId; Name = 'pwsh.exe'; ExecutablePath = $null },
          [pscustomobject]@{ ProcessId = 2147483647; Name = 'exited-child.exe'; ExecutablePath = $null }
        )
      }
      $sample = Get-ResourceSample -RootProcessId $PID
      if ($sample.workingSetBytes -le 0 -or $sample.privateBytes -le 0) { throw 'The live root was not sampled.' }
      function Get-ProcessTreeRecords {
        param([int]$RootProcessId)
        @([pscustomobject]@{ ProcessId = 2147483647; Name = 'exited-child.exe'; ExecutablePath = $null })
      }
      Stop-CoredrillProcessTree -RootProcess $taskRootProcess -WindowHandle ([IntPtr]::Zero) -ExpectedExecutable $taskRootProcess.Path
      $confined = $false
      try { Stop-CoredrillProcessTree -RootProcess $taskRootProcess -WindowHandle ([IntPtr]::Zero) -ExpectedExecutable 'C:\\not-the-test-process.exe' }
      catch { $confined = $_.Exception.Message -eq 'Refusing to close an unexpected process.' }
      if (-not $confined) { throw 'Executable confinement did not fail closed.' }
      try { Get-Process -Id 2147483647 -ErrorAction Stop }
      catch { $script:taskProcessException = $_.Exception }
      function Get-Process {
        [CmdletBinding()] param([int]$Id)
        $PSCmdlet.ThrowTerminatingError([System.Management.Automation.ErrorRecord]::new(
          $script:taskProcessException, 'SyntheticPermissionDenied',
          [System.Management.Automation.ErrorCategory]::PermissionDenied, $Id))
      }
      $failedClosed = $false
      try { Get-ResourceSample -RootProcessId $PID }
      catch { $failedClosed = $_.FullyQualifiedErrorId -like 'SyntheticPermissionDenied,*' }
      if (-not $failedClosed) { throw 'A non-exit sampling failure was hidden.' }
      function Stop-Process {
        [CmdletBinding()] param([int]$Id, [switch]$Force)
        $PSCmdlet.ThrowTerminatingError([System.Management.Automation.ErrorRecord]::new(
          $script:taskProcessException, 'SyntheticCleanupPermissionDenied',
          [System.Management.Automation.ErrorCategory]::PermissionDenied, $Id))
      }
      $cleanupFailedClosed = $false
      try { Stop-CoredrillProcessTree -RootProcess $taskRootProcess -WindowHandle ([IntPtr]::Zero) -ExpectedExecutable $taskRootProcess.Path }
      catch { $cleanupFailedClosed = $_.FullyQualifiedErrorId -like 'SyntheticCleanupPermissionDenied,*' }
      if (-not $cleanupFailedClosed) { throw 'A non-exit cleanup failure was hidden.' }
      $taskRootProcess.Dispose()
      Write-Output 'NATIVE_PACKAGE_PROCESS_RACE_PROOF: sampled-live-root; skipped-exited-child; cleaned-exited-child; confined-executable; rejected-other-failure'
    `;
      const result = spawnSync("pwsh", ["-NoProfile", "-NonInteractive", "-Command", script], {
        cwd: repositoryRoot,
        encoding: "utf8",
        timeout: 20_000,
        windowsHide: true,
      });
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain("NATIVE_PACKAGE_PROCESS_RACE_PROOF:");
    },
    25_000,
  );
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
    expect(workflow).toContain("pnpm exec vitest run tooling/tests/native-packaging.test.mjs");
    expect(packageProof).not.toContain("System.Management.Automation.ProcessCommandException");
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
    expect(platformPackageProof).toContain("Package proof refuses a relative link that escapes");
    expect(platformPackageProof).toContain("absoluteSymlinkCount");
    expect(platformPackageProof).toContain("relativeSymlinksConfined: true");
    expect(platformPackageProof).toContain('requireSuccess("uname", ["-srm"])');
    expect(platformPackageProof).not.toContain('requireSuccess("uname", ["-a"])');
    expect(platformPackageProof).toContain("Signature=adhoc");
  });
});
