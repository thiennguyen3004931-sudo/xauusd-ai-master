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

$devPattern = '(?im)^\s*&?\s*pnpm\s+--filter\s+[''"]?@xauusd/api[''"]?\s+dev(?:\s|$)'
if ($launcher -match $devPattern) {
    Fail-Contract "FORBIDDEN_API_DEV_COMMAND_PRESENT"
}

if ($launcher -match '(?i)\btsx\s+watch\b') {
    Fail-Contract "FORBIDDEN_TSX_WATCH_PRESENT"
}

$buildPattern = '(?im)^\s*&?\s*pnpm\s+--filter\s+[''"]?@xauusd/api[''"]?\s+build(?:\s|$)'
$startPattern = '(?im)^\s*&?\s*pnpm\s+--filter\s+[''"]?@xauusd/api[''"]?\s+start(?:\s|$)'
$buildMatch = [regex]::Match($launcher, $buildPattern)
$startMatch = [regex]::Match($launcher, $startPattern)

if (-not $buildMatch.Success) {
    Fail-Contract "PRODUCTION_BUILD_COMMAND_MISSING"
}

if (-not $startMatch.Success) {
    Fail-Contract "PRODUCTION_START_COMMAND_MISSING"
}

if ($buildMatch.Index -ge $startMatch.Index) {
    Fail-Contract "PRODUCTION_BUILD_MUST_PRECEDE_START"
}

Write-Host "PHASE7B_API_RUNTIME_LAUNCHER_SOURCE_CONTRACT=PASS"
exit 0
