$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Launcher = Join-Path $PSScriptRoot "run-phase7b-api-runtime-local.ps1"

function Assert-True([bool]$Value, [string]$Message) {
  if (-not $Value) { throw $Message }
}

if (-not (Test-Path -LiteralPath $Launcher -PathType Leaf)) {
  throw "Missing API runtime launcher: $Launcher"
}

$source = (Get-Content -LiteralPath $Launcher -Raw).Replace("`r`n", "`n").Replace("`r", "`n")

# API TypeScript resolves workspace package types from package dist/*.d.ts.
# Runtime startup must therefore build the API dependency closure so source changes
# in strategy/execution packages are materialized before API tsc runs.
$dependencyBuild = "& pnpm build '--filter=@xauusd/api...'"
$apiOnlyBuild = "& pnpm --filter '@xauusd/api' build"

Assert-True ($source.Contains($dependencyBuild)) `
  "API runtime must build @xauusd/api and its workspace dependencies before tsc."
Assert-True (-not $source.Contains($apiOnlyBuild)) `
  "API runtime must not build only @xauusd/api because workspace dist declarations may be stale."

$buildIndex = $source.IndexOf($dependencyBuild, [System.StringComparison]::Ordinal)
$startIndex = $source.IndexOf("& pnpm --filter '@xauusd/api' start", [System.StringComparison]::Ordinal)
Assert-True ($buildIndex -ge 0) "API dependency-closure build invocation is missing."
Assert-True ($startIndex -gt $buildIndex) "API start must occur only after dependency-closure build."

Write-Host "PHASE7B_API_RUNTIME_FRESH_WORKSPACE_BUILD_SOURCE_CONTRACT=PASS"
