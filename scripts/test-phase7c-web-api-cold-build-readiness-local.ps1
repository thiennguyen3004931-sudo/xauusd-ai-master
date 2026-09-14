$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$DeployPath = Join-Path $PSScriptRoot 'deploy-phase7c-web-ui-local.ps1'

if (-not (Test-Path -LiteralPath $DeployPath -PathType Leaf)) {
  throw "Deploy script not found: $DeployPath"
}

$source = Get-Content -LiteralPath $DeployPath -Raw

function Assert-Contains([string]$Needle, [string]$Label) {
  if ($source.IndexOf($Needle, [System.StringComparison]::Ordinal) -lt 0) {
    throw "Missing contract: $Label"
  }
}

Assert-Contains "build '--filter=@xauusd/api...'" 'API transitive dependency prebuild'
Assert-Contains 'PHASE7C_WEB_UI_DEPLOY_API_BUILD=PASS' 'API prebuild success marker'
Assert-Contains 'API dependency build failed' 'API prebuild fail-closed error'
Assert-Contains 'Runtime was not restarted' 'API prebuild failure preserves existing runtime'

$apiBuildIndex = $source.IndexOf("build '--filter=@xauusd/api...'", [System.StringComparison]::Ordinal)
$dashboardInvokeIndex = $source.IndexOf('-File $DashboardDeploy', [System.StringComparison]::Ordinal)

if ($apiBuildIndex -lt 0 -or $dashboardInvokeIndex -lt 0) {
  throw 'Unable to resolve API-build/dashboard-restart ordering markers.'
}
if ($apiBuildIndex -ge $dashboardInvokeIndex) {
  throw 'API dependency prebuild must complete before dashboard runtime restart.'
}

# The runtime launcher intentionally retains its own build for boot/recovery self-containment.
$RuntimePath = Join-Path $PSScriptRoot 'run-phase7b-api-runtime-local.ps1'
if (-not (Test-Path -LiteralPath $RuntimePath -PathType Leaf)) {
  throw "API runtime launcher not found: $RuntimePath"
}
$runtimeSource = Get-Content -LiteralPath $RuntimePath -Raw
if ($runtimeSource.IndexOf("build '--filter=@xauusd/api...'", [System.StringComparison]::Ordinal) -lt 0) {
  throw 'Runtime launcher must retain the API transitive build fallback.'
}

Write-Host 'PHASE7C_WEB_API_COLD_BUILD_READINESS_CONTRACT=PASS'
Write-Host 'API_PREBUILD_BEFORE_RUNTIME_RESTART=PASS'
Write-Host 'RUNTIME_BUILD_FALLBACK_PRESERVED=PASS'
