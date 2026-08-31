param(
  [string]$WorkDir = ".runtime",
  [string]$WebTask = "XAUUSD-Phase7B-Web",
  [int]$ApiPort = 3711,
  [int]$WebPort = 5717,
  [int]$StartupTimeoutSeconds = 90,
  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$ExpectedCommit
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$DashboardDeploy = Join-Path $PSScriptRoot "deploy-phase7c-mt5-dashboard-local.ps1"

if (-not (Test-Path -LiteralPath $DashboardDeploy)) {
  throw "Safe dashboard deploy helper missing: $DashboardDeploy"
}

Push-Location $ProjectRoot
try {
  $git = Get-Command git -ErrorAction Stop
  $pnpm = Get-Command pnpm -ErrorAction Stop

  $branch = (& $git.Source branch --show-current).Trim()
  if ($LASTEXITCODE -ne 0 -or $branch -ne "main") {
    throw "Web UI deploy requires branch main. Current=$branch"
  }

  $dirty = @(& $git.Source status --porcelain)
  if ($LASTEXITCODE -ne 0) { throw "Could not inspect git working tree." }
  if ($dirty.Count -gt 0) {
    throw "Web UI deploy requires a clean working tree. No runtime process was restarted."
  }

  $currentCommit = (& $git.Source rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0) {
    throw "Could not resolve current git HEAD. No runtime process was restarted."
  }
  if ($currentCommit -ne $ExpectedCommit) {
    throw "Web UI deploy requires commit '$ExpectedCommit' but found '$currentCommit'. No runtime process was restarted."
  }

  Write-Host "PHASE7C_WEB_UI_DEPLOY=START"
  Write-Host "PHASE7C_WEB_UI_DEPLOY_BRANCH=$branch"
  Write-Host "PHASE7C_WEB_UI_DEPLOY_EXPECTED_COMMIT=$ExpectedCommit"
  Write-Host "PHASE7C_WEB_UI_DEPLOY_GIT_CLEAN=PASS"

  & $pnpm.Source --filter '@xauusd/mt5-broker' build
  if ($LASTEXITCODE -ne 0) {
    throw "Phase7C MT5 broker build failed with exit code $LASTEXITCODE. Runtime was not restarted."
  }

  & $pnpm.Source --filter '@xauusd/web' build
  if ($LASTEXITCODE -ne 0) {
    throw "Phase7C web build failed with exit code $LASTEXITCODE. Runtime was not restarted."
  }
  Write-Host "PHASE7C_WEB_UI_DEPLOY_BUILD=PASS"

  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $DashboardDeploy `
    -WorkDir $WorkDir `
    -WebTask $WebTask `
    -ApiPort $ApiPort `
    -WebPort $WebPort `
    -StartupTimeoutSeconds $StartupTimeoutSeconds `
    -SkipPanelInstall
  if ($LASTEXITCODE -ne 0) {
    throw "Safe Phase7C web runtime restart failed with exit code $LASTEXITCODE."
  }

  Write-Host "PHASE7C_WEB_UI_DEPLOY_RUNTIME_RESTART=PASS"
  Write-Host "PHASE7C_WEB_UI_DEPLOY_STATUS=PASS"
}
finally {
  Pop-Location
}
