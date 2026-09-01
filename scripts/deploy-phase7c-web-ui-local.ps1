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
$LifecycleBrokerRunner = Join-Path $PSScriptRoot "run-phase7c-executor-task-runner-local.ps1"
$LifecycleBrokerGuardLibrary = Join-Path $PSScriptRoot "lib\phase7c-startup-runner-guard.ps1"
$LifecycleBrokerAccountLibrary = Join-Path $PSScriptRoot "lib\phase7c-account-mode.ps1"
$LifecycleBrokerLibrary = Join-Path $PSScriptRoot "lib\phase7c-lifecycle-broker.ps1"

foreach ($required in @(
  $DashboardDeploy,
  $LifecycleBrokerRunner,
  $LifecycleBrokerGuardLibrary,
  $LifecycleBrokerAccountLibrary,
  $LifecycleBrokerLibrary
)) {
  if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
    throw "Web UI deploy required file missing: $required"
  }
}

function Read-JsonFile([string]$Path, [string]$Label) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "$Label file is missing: $Path"
  }
  try {
    return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
  } catch {
    throw "$Label file is invalid: $Path. $($_.Exception.Message)"
  }
}

function Assert-LifecycleBrokerSourceFresh([string]$WorkDir) {
  $resolvedWorkDir = if ([System.IO.Path]::IsPathRooted($WorkDir)) {
    [System.IO.Path]::GetFullPath($WorkDir)
  } else {
    [System.IO.Path]::GetFullPath((Join-Path $ProjectRoot $WorkDir))
  }

  $heartbeatPath = Join-Path $resolvedWorkDir "phase7c-lifecycle-broker\state\heartbeat.json"
  $brokerLogPath = Join-Path $resolvedWorkDir "phase7c-lifecycle-broker\logs\broker.log"
  $heartbeat = Read-JsonFile -Path $heartbeatPath -Label "Lifecycle broker heartbeat"
  $brokerPid = [int]$heartbeat.brokerPid
  if ($brokerPid -le 0) {
    throw "Lifecycle broker heartbeat is missing brokerPid."
  }
  if (-not (Test-Path -LiteralPath $brokerLogPath -PathType Leaf)) {
    throw "Lifecycle broker log is missing: $brokerLogPath"
  }

  $bootMarker = "Lifecycle broker starting. PID=$brokerPid "
  $bootMatch = Select-String -LiteralPath $brokerLogPath -SimpleMatch $bootMarker | Select-Object -Last 1
  if ($null -eq $bootMatch) {
    throw "Lifecycle broker boot marker is missing for brokerPid=$brokerPid."
  }
  $bootLine = [string]$bootMatch.Line
  if ($bootLine -notmatch '^\[(?<stamp>[^\]]+)\]\s+Lifecycle broker starting\. PID=') {
    throw "Lifecycle broker boot marker has an invalid timestamp format. brokerPid=$brokerPid"
  }

  try {
    $brokerStartedUtc = [DateTimeOffset]::Parse(
      [string]$Matches['stamp'],
      [System.Globalization.CultureInfo]::InvariantCulture,
      [System.Globalization.DateTimeStyles]::RoundtripKind
    ).UtcDateTime
  } catch {
    throw "Lifecycle broker boot timestamp is invalid. brokerPid=$brokerPid"
  }

  $startupLoadedSources = @(
    $LifecycleBrokerRunner,
    $LifecycleBrokerGuardLibrary,
    $LifecycleBrokerAccountLibrary,
    $LifecycleBrokerLibrary
  )
  $latestSourceWriteUtc = @(
    $startupLoadedSources | ForEach-Object {
      (Get-Item -LiteralPath $_ -ErrorAction Stop).LastWriteTimeUtc
    }
  ) | Sort-Object -Descending | Select-Object -First 1

  if ($brokerStartedUtc -lt $latestSourceWriteUtc) {
    throw "Web UI deploy blocked: lifecycle broker process is stale relative to source loaded at broker startup. brokerPid=$brokerPid startedUtc=$($brokerStartedUtc.ToString('o')) sourceUpdatedUtc=$($latestSourceWriteUtc.ToString('o')). Use the controlled executor runtime reload path before Web/API deploy."
  }

  Write-Host "PHASE7C_WEB_UI_DEPLOY_BROKER_PID=$brokerPid"
  Write-Host "PHASE7C_WEB_UI_DEPLOY_BROKER_SOURCE_FRESH=PASS"
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

  [void](Assert-LifecycleBrokerSourceFresh -WorkDir $WorkDir)

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
