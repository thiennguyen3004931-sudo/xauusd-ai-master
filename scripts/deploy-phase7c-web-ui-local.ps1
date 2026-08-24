param(
  [string]$WorkDir = ".runtime",
  [string]$WebTask = "XAUUSD-Phase7B-Web",
  [int]$ApiPort = 3711,
  [int]$WebPort = 5717,
  [int]$StartupTimeoutSeconds = 90,
  [string]$RequiredCommit = "ecf784047b5c573cb3a2083df92714f3fdad1986"
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
  if ($LASTEXITCODE -ne 0 -or $branch -ne "fix/phase7c-legacy-background-cleanup") {
    throw "Web UI deploy requires branch fix/phase7c-legacy-background-cleanup. Current=$branch"
  }

  $dirty = @(& $git.Source status --porcelain)
  if ($LASTEXITCODE -ne 0) { throw "Could not inspect git working tree." }
  if ($dirty.Count -gt 0) {
    throw "Web UI deploy requires a clean working tree. No runtime process was restarted."
  }

  if (-not [string]::IsNullOrWhiteSpace($RequiredCommit)) {
    & $git.Source cat-file -e "$RequiredCommit^{commit}" 2>$null
    if ($LASTEXITCODE -ne 0) {
      throw "Required web UI commit is not present locally: $RequiredCommit. Sync the integration branch first."
    }
    & $git.Source merge-base --is-ancestor $RequiredCommit HEAD 2>$null
    if ($LASTEXITCODE -ne 0) {
      throw "Current branch does not contain required web UI commit: $RequiredCommit. Sync the integration branch first."
    }
  }

  Write-Host "PHASE7C_WEB_UI_DEPLOY=START"
  Write-Host "PHASE7C_WEB_UI_DEPLOY_BRANCH=$branch"
  Write-Host "PHASE7C_WEB_UI_DEPLOY_REQUIRED_COMMIT=$RequiredCommit"
  Write-Host "PHASE7C_WEB_UI_DEPLOY_GIT_CLEAN=PASS"

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
