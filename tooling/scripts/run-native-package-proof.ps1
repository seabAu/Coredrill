[CmdletBinding()]
param(
    [string]$InstallerPath,
    [string]$OutputPath,
    [ValidateRange(0, 20)]
    [int]$WarmupRuns = 5,
    [ValidateRange(20, 100)]
    [int]$MeasuredRuns = 20,
    [ValidateRange(1000, 30000)]
    [int]$ReadyTimeoutMilliseconds = 15000
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($env:OS -ne "Windows_NT") {
    throw "NAT-007 package proof requires Windows."
}

$securityModulePath = Join-Path $PSHOME "Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1"
Import-Module -Name $securityModulePath -ErrorAction Stop

$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
$tauriRoot = Join-Path $repositoryRoot "apps\desktop\src-tauri"
$fixturePath = Join-Path $repositoryRoot "docs\testing\fixtures\native-package-empty-shell.v1.json"

if ([string]::IsNullOrWhiteSpace($InstallerPath)) {
    $installerCandidates = @(
        Get-ChildItem -LiteralPath (Join-Path $tauriRoot "target\release\bundle\nsis") -Filter "*-setup.exe" -File
    )
    if ($installerCandidates.Count -ne 1) {
        throw "Expected exactly one NSIS installer, found $($installerCandidates.Count)."
    }
    $InstallerPath = $installerCandidates[0].FullName
}
$InstallerPath = (Resolve-Path -LiteralPath $InstallerPath).Path

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path $tauriRoot "target\nat007\native-package-proof.json"
}
$OutputPath = [IO.Path]::GetFullPath($OutputPath)
$outputDirectory = Split-Path -Parent $OutputPath
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class CoredrillNativeWindow
{
    private delegate bool EnumWindowsProc(IntPtr window, IntPtr parameter);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr parameter);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowTextW(IntPtr window, StringBuilder text, int maximumCount);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr window, int command);

    [DllImport("user32.dll")]
    private static extern bool PostMessageW(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);

    public static IntPtr FindWindow(int processId, string expectedTitle)
    {
        IntPtr found = IntPtr.Zero;
        EnumWindows((window, parameter) =>
        {
            uint ownerProcessId;
            GetWindowThreadProcessId(window, out ownerProcessId);
            if (ownerProcessId != processId)
            {
                return true;
            }

            StringBuilder title = new StringBuilder(256);
            GetWindowTextW(window, title, title.Capacity);
            if (String.Equals(title.ToString(), expectedTitle, StringComparison.Ordinal))
            {
                found = window;
                return false;
            }
            return true;
        }, IntPtr.Zero);
        return found;
    }

    public static void Hide(IntPtr window)
    {
        ShowWindow(window, 0);
    }

    public static void Close(IntPtr window)
    {
        PostMessageW(window, 0x0010, IntPtr.Zero, IntPtr.Zero);
    }
}
"@

function Get-Percentile {
    param(
        [Parameter(Mandatory)]
        [double[]]$Values,
        [Parameter(Mandatory)]
        [ValidateRange(0.01, 1.0)]
        [double]$Percentile
    )
    if ($Values.Count -eq 0) {
        throw "Cannot calculate a percentile without values."
    }
    $sorted = @($Values | Sort-Object)
    $index = [Math]::Max(0, [Math]::Ceiling($Percentile * $sorted.Count) - 1)
    return [Math]::Round([double]$sorted[$index], 1)
}

function Get-Sha256 {
    param([Parameter(Mandatory)][string]$Path)

    $stream = [IO.File]::OpenRead($Path)
    $sha256 = [Security.Cryptography.SHA256]::Create()
    try {
        $hash = $sha256.ComputeHash($stream)
        return ([BitConverter]::ToString($hash)).Replace("-", "").ToLowerInvariant()
    }
    finally {
        $sha256.Dispose()
        $stream.Dispose()
    }
}

function Get-ProcessTreeRecords {
    param([Parameter(Mandatory)][int]$RootProcessId)

    $allRecords = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name, ExecutablePath)
    $processIds = [Collections.Generic.HashSet[uint32]]::new()
    [void]$processIds.Add([uint32]$RootProcessId)
    do {
        $added = $false
        foreach ($record in $allRecords) {
            if ($processIds.Contains([uint32]$record.ParentProcessId) -and -not $processIds.Contains([uint32]$record.ProcessId)) {
                [void]$processIds.Add([uint32]$record.ProcessId)
                $added = $true
            }
        }
    } while ($added)
    return @($allRecords | Where-Object { $processIds.Contains([uint32]$_.ProcessId) })
}

function Get-ResourceSample {
    param([Parameter(Mandatory)][int]$RootProcessId)

    $records = @(Get-ProcessTreeRecords -RootProcessId $RootProcessId)
    [int64]$workingSetBytes = 0
    [int64]$privateBytes = 0
    $webviewVersion = $null
    foreach ($record in $records) {
        try {
            $process = Get-Process -Id ([int]$record.ProcessId) -ErrorAction Stop
            $process.Refresh()
            $workingSetBytes += [int64]$process.WorkingSet64
            $privateBytes += [int64]$process.PrivateMemorySize64
            if ($record.Name -ieq "msedgewebview2.exe" -and -not [string]::IsNullOrWhiteSpace($record.ExecutablePath)) {
                $webviewVersion = [Diagnostics.FileVersionInfo]::GetVersionInfo($record.ExecutablePath).FileVersion
            }
        }
        catch [System.Management.Automation.ProcessCommandException] {
            continue
        }
    }
    return [ordered]@{
        processCount = $records.Count
        workingSetBytes = $workingSetBytes
        privateBytes = $privateBytes
        webviewVersion = $webviewVersion
    }
}

function Stop-CoredrillProcessTree {
    param(
        [Parameter(Mandatory)][Diagnostics.Process]$RootProcess,
        [Parameter(Mandatory)][IntPtr]$WindowHandle,
        [Parameter(Mandatory)][string]$ExpectedExecutable
    )

    if ($RootProcess.HasExited) {
        return
    }
    $RootProcess.Refresh()
    if ([IO.Path]::GetFullPath($RootProcess.Path) -ne [IO.Path]::GetFullPath($ExpectedExecutable)) {
        throw "Refusing to close an unexpected process."
    }

    if ($WindowHandle -ne [IntPtr]::Zero) {
        [CoredrillNativeWindow]::Close($WindowHandle)
    }
    if ($RootProcess.WaitForExit(5000)) {
        return
    }

    $records = @(Get-ProcessTreeRecords -RootProcessId $RootProcess.Id | Sort-Object ProcessId -Descending)
    foreach ($record in $records) {
        try {
            Stop-Process -Id ([int]$record.ProcessId) -Force -ErrorAction Stop
        }
        catch [System.Management.Automation.ProcessCommandException] {
            continue
        }
    }
}

function Invoke-StartupRun {
    param(
        [Parameter(Mandatory)][string]$ExecutablePath,
        [Parameter(Mandatory)][int]$TimeoutMilliseconds,
        [switch]$MeasureResources
    )

    $stopwatch = [Diagnostics.Stopwatch]::StartNew()
    $process = Start-Process -FilePath $ExecutablePath -ArgumentList "--coredrill-startup-benchmark" -PassThru -WindowStyle Hidden
    $windowHandle = [IntPtr]::Zero
    try {
        while ($stopwatch.ElapsedMilliseconds -lt $TimeoutMilliseconds) {
            if ($process.HasExited) {
                throw "Installed Coredrill exited before its local shell became ready."
            }
            $windowHandle = [CoredrillNativeWindow]::FindWindow($process.Id, "Coredrill")
            if ($windowHandle -ne [IntPtr]::Zero) {
                break
            }
            Start-Sleep -Milliseconds 20
            $process.Refresh()
        }
        if ($windowHandle -eq [IntPtr]::Zero) {
            throw "Installed Coredrill did not report page-load readiness within $TimeoutMilliseconds ms."
        }

        $stopwatch.Stop()
        [CoredrillNativeWindow]::Hide($windowHandle)
        $resourceSample = $null
        if ($MeasureResources) {
            Start-Sleep -Milliseconds 500
            $resourceSample = Get-ResourceSample -RootProcessId $process.Id
        }
        return [ordered]@{
            startupMilliseconds = [Math]::Round($stopwatch.Elapsed.TotalMilliseconds, 1)
            resources = $resourceSample
        }
    }
    finally {
        Stop-CoredrillProcessTree -RootProcess $process -WindowHandle $windowHandle -ExpectedExecutable $ExecutablePath
        $process.Dispose()
    }
}

$temporaryBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$testRoot = [IO.Path]::GetFullPath((Join-Path $temporaryBase ("coredrill-nat007-" + [Guid]::NewGuid().ToString("N"))))
$temporaryPrefix = $temporaryBase.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
if (-not $testRoot.StartsWith($temporaryPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to create the package proof outside the operating-system temporary directory."
}

$installRoot = Join-Path $testRoot "install"
$uninstallerPath = Join-Path $installRoot "uninstall.exe"
$appPath = Join-Path $installRoot "Coredrill.exe"
$probePath = Join-Path $installRoot "coredrill-native-storage-probe.exe"
$defaultInstallRoot = Join-Path $env:LOCALAPPDATA "Coredrill"
$defaultUninstallerPath = Join-Path $defaultInstallRoot "uninstall.exe"
$defaultAppPath = Join-Path $defaultInstallRoot "Coredrill.exe"
$defaultInstallExistedBeforeRun = Test-Path -LiteralPath $defaultInstallRoot
$installerInfo = Get-Item -LiteralPath $InstallerPath
$workingTreeStatus = (& git -C $repositoryRoot status --porcelain --untracked-files=all | Out-String).Trim()
$commitSha = (& git -C $repositoryRoot rev-parse HEAD).Trim()
$startTimestamp = [DateTimeOffset]::UtcNow
$warmupMeasurements = [Collections.Generic.List[double]]::new()
$startupMeasurements = [Collections.Generic.List[double]]::new()
$workingSetMeasurements = [Collections.Generic.List[double]]::new()
$privateMemoryMeasurements = [Collections.Generic.List[double]]::new()
$processCountMeasurements = [Collections.Generic.List[double]]::new()
$webviewVersions = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
$uninstallPreservedData = $false
$hardwareTargetId = if ($env:GITHUB_ACTIONS -eq "true") { "GH-HOSTED-WINDOWS-DIAGNOSTIC" } else { "HW-LOCAL-DIAG" }
$operatingSystemTargetId = if ($env:GITHUB_ACTIONS -eq "true") { "GH-WINDOWS-DIAGNOSTIC" } else { "OS-WIN10-LOCAL" }

New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
try {
    if ($defaultInstallExistedBeforeRun) {
        throw "Refusing to run while the default Coredrill install directory exists: $defaultInstallRoot"
    }

    $installArguments = @("/S", "/D=$installRoot")
    $installerProcess = Start-Process -FilePath $InstallerPath -ArgumentList $installArguments -PassThru -Wait -WindowStyle Hidden
    if ($installerProcess.ExitCode -ne 0) {
        throw "NSIS installer exited with code $($installerProcess.ExitCode)."
    }
    if (-not (Test-Path -LiteralPath $appPath -PathType Leaf)) {
        if (Test-Path -LiteralPath $defaultAppPath -PathType Leaf) {
            throw "NSIS ignored the isolated installation directory and wrote to the default Coredrill directory."
        }
        throw "NSIS installer did not create the expected Coredrill executable."
    }
    if (-not (Test-Path -LiteralPath $uninstallerPath -PathType Leaf)) {
        throw "NSIS installer did not create an uninstaller."
    }
    if (Test-Path -LiteralPath $probePath -PathType Leaf) {
        throw "The contract-only native storage probe leaked into the production package."
    }
    $installedAppInfo = Get-Item -LiteralPath $appPath
    $installedAppBytes = [int64]$installedAppInfo.Length
    $installedAppVersion = [Diagnostics.FileVersionInfo]::GetVersionInfo($appPath).ProductVersion
    $installedAppSha256 = Get-Sha256 -Path $appPath
    $installedAppSignatureStatus = [string](Get-AuthenticodeSignature -LiteralPath $appPath).Status

    $minimumColdStartTimeoutMilliseconds = if ($env:GITHUB_ACTIONS -eq "true") { 60000 } else { 30000 }
    $coldStartTimeoutMilliseconds = [Math]::Max($minimumColdStartTimeoutMilliseconds, $ReadyTimeoutMilliseconds)
    for ($index = 0; $index -lt $WarmupRuns; $index += 1) {
        $warmupTimeoutMilliseconds = if ($index -eq 0) { $coldStartTimeoutMilliseconds } else { $ReadyTimeoutMilliseconds }
        $run = Invoke-StartupRun -ExecutablePath $appPath -TimeoutMilliseconds $warmupTimeoutMilliseconds
        $warmupMeasurements.Add([double]$run.startupMilliseconds)
    }

    for ($index = 0; $index -lt $MeasuredRuns; $index += 1) {
        $run = Invoke-StartupRun -ExecutablePath $appPath -TimeoutMilliseconds $ReadyTimeoutMilliseconds -MeasureResources
        $startupMeasurements.Add([double]$run.startupMilliseconds)
        $workingSetMeasurements.Add([double]$run.resources.workingSetBytes)
        $privateMemoryMeasurements.Add([double]$run.resources.privateBytes)
        $processCountMeasurements.Add([double]$run.resources.processCount)
        if (-not [string]::IsNullOrWhiteSpace($run.resources.webviewVersion)) {
            [void]$webviewVersions.Add([string]$run.resources.webviewVersion)
        }
    }

    $appDataRoot = Join-Path $env:APPDATA "app.coredrill.desktop"
    $appDataExistedBeforeUninstall = Test-Path -LiteralPath $appDataRoot
    $uninstallArguments = @("/S", "_?=$installRoot")
    $uninstallerProcess = Start-Process -FilePath $uninstallerPath -ArgumentList $uninstallArguments -PassThru -Wait -WindowStyle Hidden
    if ($uninstallerProcess.ExitCode -ne 0) {
        throw "NSIS uninstaller exited with code $($uninstallerProcess.ExitCode)."
    }
    $uninstallDeadline = [DateTimeOffset]::UtcNow.AddSeconds(10)
    while ((Test-Path -LiteralPath $appPath) -and [DateTimeOffset]::UtcNow -lt $uninstallDeadline) {
        Start-Sleep -Milliseconds 100
    }
    if (Test-Path -LiteralPath $appPath) {
        throw "NSIS uninstaller did not remove the installed executable."
    }
    $uninstallPreservedData = $appDataExistedBeforeUninstall -and (Test-Path -LiteralPath $appDataRoot)

    $os = Get-CimInstance Win32_OperatingSystem
    $processor = Get-CimInstance Win32_Processor | Select-Object -First 1
    $computer = Get-CimInstance Win32_ComputerSystem
    $fixture = Get-Content -LiteralPath $fixturePath -Raw | ConvertFrom-Json
    $installerSignature = Get-AuthenticodeSignature -LiteralPath $InstallerPath
    $manifest = [ordered]@{
        schemaVersion = 1
        proofId = "NAT007-WINDOWS-PACKAGE"
        matrixId = "JW-TM-001"
        matrixVersion = "1.2.0"
        executionTargetId = "DESK-WIN"
        targetConformant = $false
        targetLimitation = "Phase 0 diagnostics are not the required Windows 11 25H2 / HW-WIN-REF release-performance gate."
        hardwareTargetId = $hardwareTargetId
        operatingSystemTargetId = $operatingSystemTargetId
        commitSha = $commitSha
        dirtyWorktreeAtStart = -not [string]::IsNullOrEmpty($workingTreeStatus)
        pnpmLockSha256 = Get-Sha256 -Path (Join-Path $repositoryRoot "pnpm-lock.yaml")
        fixture = [ordered]@{
            id = $fixture.fixtureId
            version = $fixture.version
            seed = $fixture.seed
            sha256 = Get-Sha256 -Path $fixturePath
            containsUserData = $fixture.containsUserData
        }
        environment = [ordered]@{
            osCaption = $os.Caption
            osVersion = $os.Version
            osBuild = $os.BuildNumber
            architecture = $env:PROCESSOR_ARCHITECTURE
            cpu = $processor.Name.Trim()
            logicalProcessors = $computer.NumberOfLogicalProcessors
            memoryBytes = [int64]$computer.TotalPhysicalMemory
            webview2Versions = @($webviewVersions | Sort-Object)
            powerProfile = "not controlled; diagnostic only"
        }
        package = [ordered]@{
            format = "nsis-current-user"
            version = $installedAppVersion
            installerFileName = $installerInfo.Name
            installerBytes = [int64]$installerInfo.Length
            installerSha256 = Get-Sha256 -Path $InstallerPath
            installerSignatureStatus = [string]$installerSignature.Status
            webviewInstallMode = "downloadBootstrapper"
            appBytes = $installedAppBytes
            appSha256 = $installedAppSha256
            appSignatureStatus = $installedAppSignatureStatus
            nativeStorageProbeExcluded = $true
            uninstallRemovedProgram = $true
            uninstallPreservedAppData = $uninstallPreservedData
        }
        measurement = [ordered]@{
            readySignal = "native window title set after Tauri PageLoadEvent.Finished"
            coldStartTimeoutMilliseconds = $coldStartTimeoutMilliseconds
            warmAndMeasuredTimeoutMilliseconds = $ReadyTimeoutMilliseconds
            warmupsDiscarded = $WarmupRuns
            measuredRuns = $MeasuredRuns
            failureCount = 0
            startupMilliseconds = [ordered]@{
                p50 = Get-Percentile -Values $startupMeasurements.ToArray() -Percentile 0.50
                p95 = Get-Percentile -Values $startupMeasurements.ToArray() -Percentile 0.95
                maximum = [Math]::Round(($startupMeasurements | Measure-Object -Maximum).Maximum, 1)
                raw = $startupMeasurements.ToArray()
            }
            aggregateWorkingSetBytes = [ordered]@{
                p50 = Get-Percentile -Values $workingSetMeasurements.ToArray() -Percentile 0.50
                p95 = Get-Percentile -Values $workingSetMeasurements.ToArray() -Percentile 0.95
                maximum = [int64]($workingSetMeasurements | Measure-Object -Maximum).Maximum
                raw = @($workingSetMeasurements | ForEach-Object { [int64]$_ })
            }
            aggregatePrivateBytes = [ordered]@{
                p50 = Get-Percentile -Values $privateMemoryMeasurements.ToArray() -Percentile 0.50
                p95 = Get-Percentile -Values $privateMemoryMeasurements.ToArray() -Percentile 0.95
                maximum = [int64]($privateMemoryMeasurements | Measure-Object -Maximum).Maximum
                raw = @($privateMemoryMeasurements | ForEach-Object { [int64]$_ })
            }
            processCount = [ordered]@{
                p50 = Get-Percentile -Values $processCountMeasurements.ToArray() -Percentile 0.50
                maximum = [int]($processCountMeasurements | Measure-Object -Maximum).Maximum
                raw = @($processCountMeasurements | ForEach-Object { [int]$_ })
            }
            warmupMilliseconds = $warmupMeasurements.ToArray()
        }
        startedAt = $startTimestamp.ToString("o")
        completedAt = [DateTimeOffset]::UtcNow.ToString("o")
        reviewer = "automated-phase-0-diagnostic"
    }

    $manifestJson = $manifest | ConvertTo-Json -Depth 10
    $utf8WithoutBom = New-Object Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($OutputPath, $manifestJson, $utf8WithoutBom)
    $proof = [ordered]@{
        format = $manifest.package.format
        installerBytes = $manifest.package.installerBytes
        installerSha256 = $manifest.package.installerSha256
        startupP95Ms = $manifest.measurement.startupMilliseconds.p95
        workingSetP95Bytes = $manifest.measurement.aggregateWorkingSetBytes.p95
        measuredRuns = $manifest.measurement.measuredRuns
        uninstallPreservedAppData = $manifest.package.uninstallPreservedAppData
        targetConformant = $manifest.targetConformant
    }
    Write-Output ("NAT007_PACKAGE_PROOF " + ($proof | ConvertTo-Json -Compress))
}
finally {
    if (Test-Path -LiteralPath $uninstallerPath -PathType Leaf) {
        try {
            $cleanupUninstaller = Start-Process -FilePath $uninstallerPath -ArgumentList @("/S", "_?=$installRoot") -PassThru -Wait -WindowStyle Hidden
            $cleanupUninstaller.Dispose()
        }
        catch {
            Write-Warning "The scoped NAT-007 test installation could not be uninstalled during cleanup."
        }
    }
    if (-not $defaultInstallExistedBeforeRun -and (Test-Path -LiteralPath $defaultUninstallerPath -PathType Leaf)) {
        try {
            $defaultCleanupUninstaller = Start-Process -FilePath $defaultUninstallerPath -ArgumentList @("/S", "_?=$defaultInstallRoot") -PassThru -Wait -WindowStyle Hidden
            $defaultCleanupUninstaller.Dispose()
        }
        catch {
            Write-Warning "The unexpected default Coredrill installation could not be uninstalled during cleanup."
        }
    }
    if ($testRoot.StartsWith($temporaryPrefix, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path -Leaf $testRoot).StartsWith("coredrill-nat007-", [StringComparison]::Ordinal)) {
        $cleanupDeadline = [DateTimeOffset]::UtcNow.AddSeconds(10)
        do {
            Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue
            if (-not (Test-Path -LiteralPath $testRoot)) {
                break
            }
            Start-Sleep -Milliseconds 100
        } while ([DateTimeOffset]::UtcNow -lt $cleanupDeadline)
        if (Test-Path -LiteralPath $testRoot) {
            Write-Warning "The scoped NAT-007 test directory could not be removed during cleanup."
        }
    }
}
