$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$RuntimeSource = Join-Path $ProjectRoot "apps\web\src\ui\VietnameseLocalizationRuntime.tsx"
$AppSource = Join-Path $ProjectRoot "apps\web\src\App.tsx"

if (-not (Test-Path -LiteralPath $RuntimeSource)) { throw "Vietnamese localization runtime source missing." }
if (-not (Test-Path -LiteralPath $AppSource)) { throw "App source missing." }

$Runtime = Get-Content -LiteralPath $RuntimeSource -Raw
$App = Get-Content -LiteralPath $AppSource -Raw

function Assert-Literal([string]$Source, [string]$Text, [string]$Label) {
  if ($Source.IndexOf($Text, [System.StringComparison]::Ordinal) -lt 0) {
    throw "Missing localization performance marker: $Label"
  }
}

Assert-Literal $Runtime 'data-no-vi-localize' 'legacy full-body observer suppression'
Assert-Literal $Runtime 'requestIdleCallback' 'idle-time localization scheduling'
Assert-Literal $Runtime 'new Set<Node>()' 'mutation deduplication queue'
Assert-Literal $Runtime 'performance.now() - started > 6' 'short main-thread processing budget'
Assert-Literal $Runtime 'observer.observe(root' 'root-scoped observer'
Assert-Literal $App 'VietnameseLocalizationRuntime' 'runtime wrapper enabled'

if ($Runtime -match 'observer\.observe\(document\.body') {
  throw "Client localization runtime must not observe the whole document body."
}

Write-Host "PHASE7C_WEB_CLIENT_LOCALIZATION_RUNTIME_TEST=PASS"
