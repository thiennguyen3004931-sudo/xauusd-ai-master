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

# Production API TypeScript resolves workspace packages through package dist/*.d.ts.
# Runtime startup must therefore force-refresh the entire API dependency build graph
# instead of trusting a persistent local Turborepo cache from an older source generation.
Assert-True ($source.Contains("& pnpm build '--filter=@xauusd/api...' '--force'")) `
  "API runtime must force a fresh @xauusd/api dependency-graph build before tsc."
Assert-True (-not $source.Contains("& pnpm build '--filter=@xauusd/api...'`n")) `
  "API runtime must not retain the cache-eligible workspace build invocation."

$buildIndex = $source.IndexOf("& pnpm build '--filter=@xauusd/api...' '--force'", [System.StringComparison]::Ordinal)
$startIndex = $source.IndexOf("& pnpm --filter '@xauusd/api' start", [System.StringComparison]::Ordinal)
Assert-True ($buildIndex -ge 0) "Fresh workspace build invocation is missing."
Assert-True ($startIndex -gt $buildIndex) "API start must occur only after the forced dependency build."

Write-Host "PHASE7B_API_RUNTIME_FRESH_WORKSPACE_BUILD_SOURCE_CONTRACT=PASS"
