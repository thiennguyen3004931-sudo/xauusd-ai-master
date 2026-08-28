param(
    [string]$LauncherPath = (Join-Path $PSScriptRoot "run-phase7b-api-runtime-local.ps1")
)

$ErrorActionPreference = "Stop"

function Fail-Contract {
    param(
        [string]$Reason
    )

    Write-Host "PHASE7B_API_RUNTIME_LAUNCHER_SOURCE_CONTRACT=FAIL"
    Write-Host "REASON=$Reason"
    exit 1
}

if (-not (Test-Path -LiteralPath $LauncherPath)) {
    Fail-Contract "LAUNCHER_NOT_FOUND"
}

$launcher = [System.IO.File]::ReadAllText($LauncherPath)

if ($launcher.Contains("pnpm --filter @xauusd/api dev")) {
    Fail-Contract "FORBIDDEN_API_DEV_COMMAND_PRESENT"
}

if ($launcher -match '(?i)\btsx\s+watch\b') {
    Fail-Contract "FORBIDDEN_TSX_WATCH_PRESENT"
}

$buildCommand = "pnpm --filter @xauusd/api build"
$startCommand = "pnpm --filter @xauusd/api start"
$buildIndex = $launcher.IndexOf($buildCommand, [System.StringComparison]::Ordinal)
$startIndex = $launcher.IndexOf($startCommand, [System.StringComparison]::Ordinal)

if ($buildIndex -lt 0) {
    Fail-Contract "PRODUCTION_BUILD_COMMAND_MISSING"
}

if ($startIndex -lt 0) {
    Fail-Contract "PRODUCTION_START_COMMAND_MISSING"
}

if ($buildIndex -ge $startIndex) {
    Fail-Contract "PRODUCTION_BUILD_MUST_PRECEDE_START"
}

Write-Host "PHASE7B_API_RUNTIME_LAUNCHER_SOURCE_CONTRACT=PASS"
exit 0
