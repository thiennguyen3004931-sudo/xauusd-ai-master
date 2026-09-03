param(
  [Parameter(Mandatory = $true)] [string]$ExpectedCommit,
  [int]$TimeoutSeconds = 120
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ConfigPath = Join-Path $ProjectRoot ".runtime\phase7c-executor-task-config.json"
$AccountLibrary = Join-Path $PSScriptRoot "lib\phase7c-account-mode.ps1"
$WebApiDeploy = Join-Path $PSScriptRoot "deploy-phase7c-web-ui-local.ps1"
$ReadyStableMs = 5000

if ($ExpectedCommit -notmatch '^[0-9a-fA-F]{40}$') {
  throw "ExpectedCommit must be an exact 40-character Git SHA."
}
if ($TimeoutSeconds -lt 30 -or $TimeoutSeconds -gt 600) {
  throw "TimeoutSeconds must be between 30 and 600."
}
foreach ($required in @($ConfigPath, $AccountLibrary, $WebApiDeploy)) {
  if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
    throw "Runtime-ready stable recovery deploy required file not found: $required"
  }
}

. $AccountLibrary
$ExpectedCommit = $ExpectedCommit.ToLowerInvariant()
$gitExe = (Get-Command git -ErrorAction Stop).Source

function Resolve-ConfigPath([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return "" }
  if ([System.IO.Path]::IsPathRooted($Value)) { return [System.IO.Path]::GetFullPath($Value) }
  return [System.IO.Path]::GetFullPath((Join-Path $ProjectRoot $Value))
}

function Read-JsonFile([string]$Path, [string]$Label) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "$Label file is missing: $Path"
  }
  try { return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json }
  catch { throw "$Label file is invalid: $Path. $($_.Exception.Message)" }
}

function Invoke-ApiGet([string]$Path) {
  return Invoke-RestMethod -Uri "$ControlApiUrl$Path" -Method Get -TimeoutSec 8
}

function Invoke-ApiPost([string]$Path, [object]$Body) {
  $json = $Body | ConvertTo-Json -Depth 8 -Compress
  return Invoke-RestMethod `
    -Uri "$ControlApiUrl$Path" `
    -Method Post `
    -ContentType "application/json" `
    -Body $json `
    -TimeoutSec 55
}

function Set-Pause([string]$Source) {
  $result = Invoke-ApiPost "/api/v1/phase7c/bot-mode" @{ mode = "PAUSE"; source = $Source }
  if ([string]$result.state.mode -ne "PAUSE") {
    throw "Control API did not confirm PAUSE."
  }
}

function Invoke-CanonicalDisarm {
  $preflight = Invoke-ApiPost "/api/v1/phase7c-live-arm-control/preflight" @{ action = "DISARM_LIVE" }
  if (-not [bool]$preflight.approved -or [string]::IsNullOrWhiteSpace([string]$preflight.preflightToken)) {
    throw "DISARM_LIVE preflight rejected. blockedBy=$(@($preflight.blockedBy) -join ',')"
  }

  $request = Invoke-ApiPost "/api/v1/phase7c-live-arm-control/execute" @{
    action = "DISARM_LIVE"
    preflightToken = [string]$preflight.preflightToken
    confirmation = "DISARM_LIVE"
  }
  $requestId = [string]$request.requestId
  if ([string]::IsNullOrWhiteSpace($requestId)) {
    throw "DISARM_LIVE execute did not return requestId."
  }

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 500
    try {
      $status = Invoke-ApiGet "/api/v1/phase7c-live-arm-control/status?requestId=$requestId"
    } catch { continue }
    if ([string]$status.status -eq "PASS") { return }
    if ([string]$status.status -eq "FAIL") {
      throw "DISARM_LIVE failed. phase=$($status.phase) message=$($status.message)"
    }
  }
  throw "DISARM_LIVE timed out after $TimeoutSeconds seconds."
}

function Read-BridgeArray([string]$Path) {
  $response = Invoke-WebRequest `
    -Uri "$BridgeBase$Path" `
    -Headers $BridgeHeaders `
    -Method Get `
    -UseBasicParsing `
    -TimeoutSec 8
  $raw = ([string]$response.Content).Trim()
  if ([string]::IsNullOrWhiteSpace($raw) -or $raw -eq "[]") { return @() }
  return @($raw | ConvertFrom-Json | Where-Object { $null -ne $_ })
}

function Assert-FlatBroker([string]$Stage) {
  $positions = @(Read-BridgeArray "/v1/positions?symbol=XAUUSD")
  $orders = @(Read-BridgeArray "/v1/orders?symbol=XAUUSD")
  if ($positions.Count -ne 0) {
    throw "$Stage requires zero XAUUSD positions. current=$($positions.Count)"
  }
  if ($orders.Count -ne 0) {
    throw "$Stage requires zero pending XAUUSD orders. current=$($orders.Count)"
  }
  Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_${Stage}_POSITIONS=0"
  Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_${Stage}_PENDING_ORDERS=0"
}

function Get-BridgeHealth {
  return Invoke-RestMethod -Uri "$BridgeBase/health" -Headers $BridgeHeaders -Method Get -TimeoutSec 8
}

function Assert-BridgeSession([string]$ExpectedSession, [string]$Stage) {
  $health = Get-BridgeHealth
  if (-not [bool]$health.connected -or [string]$health.status -ne "ok") {
    throw "$Stage bridge is not healthy."
  }
  if ([string]$health.configuredAccountMode -ne "LIVE" -or [string]$health.accountMode -ne "real") {
    throw "$Stage bridge is not LIVE/real."
  }
  $actualSession = [string]$health.bridgeSessionId
  if ([string]::IsNullOrWhiteSpace($actualSession) -or $actualSession -ne $ExpectedSession) {
    throw "$Stage bridge session changed. expected=$ExpectedSession actual=$actualSession"
  }
}

function Assert-PauseDisarmed([string]$Stage) {
  $mode = Invoke-ApiGet "/api/v1/phase7c/bot-mode"
  if ([string]$mode.state.mode -ne "PAUSE") {
    throw "$Stage current bot mode PAUSE is required. actual=$($mode.state.mode)"
  }

  $arm = Invoke-ApiGet "/api/v1/phase7c-live-arm-control/capability"
  if ([string]$arm.accountMode -ne "LIVE" -or [string]$arm.liveArmStatus -ne "DISARMED" -or [bool]$arm.liveExecutionArmed) {
    throw "$Stage canonical LIVE ARM=DISARMED is required."
  }
}

function Wait-LifecycleStopped {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 500
    try {
      $state = Invoke-ApiGet "/api/v1/phase7c/lifecycle"
      if (-not [bool]$state.running) { return }
    } catch {}
  }
  throw "Lifecycle did not stop within $TimeoutSeconds seconds."
}

function Wait-LifecycleReadyStable([int]$ProbeTimeoutSeconds) {
  Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_READY_STABLE_MS=5000"
  $deadline = (Get-Date).AddSeconds($ProbeTimeoutSeconds)
  $stableSinceMs = 0L

  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 500
    $sampleReady = $false
    try {
      $state = Invoke-ApiGet "/api/v1/phase7c/lifecycle"
      $sampleReady = `
        [bool]$state.running -and `
        [bool]$state.ready -and `
        [string]$state.mode.mode -eq "PAUSE" -and `
        [string]$state.accountMode.accountMode -eq "LIVE" -and `
        [bool]$state.accountMode.valid
    } catch {
      $sampleReady = $false
    }

    $nowMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    if ($sampleReady) {
      if ($stableSinceMs -le 0) {
        $stableSinceMs = $nowMs
      }
      if (($nowMs - $stableSinceMs) -ge $ReadyStableMs) {
        return $true
      }
    } else {
      if ($stableSinceMs -gt 0) {
        Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_READY_STABLE_RESET=TRUE"
      }
      $stableSinceMs = 0L
    }
  }
  return $false
}

Push-Location $ProjectRoot
try {
  $branch = ([string](& $gitExe branch --show-current)).Trim()
  if ($LASTEXITCODE -ne 0 -or $branch -ne "main") {
    throw "Runtime-ready stable recovery deploy requires branch main. actual=$branch"
  }

  $dirty = @(& $gitExe status --porcelain)
  if ($LASTEXITCODE -ne 0 -or $dirty.Count -ne 0) {
    throw "Runtime-ready stable recovery deploy requires a clean worktree."
  }

  $actualCommit = ([string](& $gitExe rev-parse HEAD)).Trim().ToLowerInvariant()
  if ($LASTEXITCODE -ne 0 -or $actualCommit -ne $ExpectedCommit) {
    throw "Runtime-ready stable recovery deploy exact commit mismatch. expected=$ExpectedCommit actual=$actualCommit"
  }
} finally {
  Pop-Location
}
Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_GIT_GUARD=PASS"
Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_EXPECTED_COMMIT=$ExpectedCommit"

$config = Read-JsonFile -Path $ConfigPath -Label "Executor task config"
if ([int]$config.version -ne 2) {
  throw "Runtime-ready stable recovery deploy requires executor task config version 2."
}
if ((ConvertTo-Phase7CAccountMode ([string]$config.accountMode)) -ne "LIVE") {
  throw "Runtime-ready stable recovery deploy requires configured LIVE account mode."
}
if (-not [bool]$config.liveExecutionEnabled) {
  throw "Runtime-ready stable recovery deploy requires liveExecutionEnabled=true."
}
if (-not [bool]$config.armed) {
  throw "Runtime-ready stable recovery deploy requires executor task config armed=true."
}

$WorkDir = Resolve-ConfigPath ([string]$config.workDir)
$EnvFile = Resolve-ConfigPath ([string]$config.envFile)
$ControlApiUrl = ([string]$config.controlApiUrl).TrimEnd('/')
if ([string]::IsNullOrWhiteSpace($ControlApiUrl)) {
  throw "Executor task controlApiUrl is missing."
}

$envInfo = Assert-Phase7CAccountEnv -EnvFile $EnvFile -AccountMode "LIVE" -RequireTrading
$BridgeBase = "http://$($envInfo.bridgeHost):$($envInfo.bridgePort)"
$BridgeHeaders = @{ "x-mt5-api-key" = $envInfo.apiKey }

Assert-PauseDisarmed -Stage "PREFLIGHT"
$healthBefore = Get-BridgeHealth
if (-not [bool]$healthBefore.connected -or [string]$healthBefore.status -ne "ok") {
  throw "PREFLIGHT bridge is not healthy."
}
if ([string]$healthBefore.configuredAccountMode -ne "LIVE" -or [string]$healthBefore.accountMode -ne "real") {
  throw "PREFLIGHT bridge is not LIVE/real."
}
$bridgeSessionId = [string]$healthBefore.bridgeSessionId
if ([string]::IsNullOrWhiteSpace($bridgeSessionId)) {
  throw "PREFLIGHT bridge health is missing bridgeSessionId."
}
Assert-BridgeSession -ExpectedSession $bridgeSessionId -Stage "PREFLIGHT"
Assert-FlatBroker -Stage "PREFLIGHT"
Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_PREFLIGHT_MODE=PAUSE"
Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_PREFLIGHT_ARM=DISARMED"

$mutationStarted = $false
try {
  $mutationStarted = $true

  # PR #236 changes API lifecycle readiness. Load that exact source first while
  # preserving executor PIDs, bot mode, LIVE arm state and Bridge ownership.
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $WebApiDeploy `
    -WorkDir $WorkDir `
    -ExpectedCommit $ExpectedCommit
  if ($LASTEXITCODE -ne 0) {
    throw "Canonical Web/API deploy failed with exit code $LASTEXITCODE."
  }
  Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_WEB_API_DEPLOY=PASS"

  Assert-PauseDisarmed -Stage "POST_WEB_API_DEPLOY"
  Assert-BridgeSession -ExpectedSession $bridgeSessionId -Stage "POST_WEB_API_DEPLOY"
  Assert-FlatBroker -Stage "POST_WEB_API_DEPLOY"

  $stableBeforeRecovery = Wait-LifecycleReadyStable -ProbeTimeoutSeconds 8
  if ($stableBeforeRecovery) {
    Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_LIFECYCLE_RECOVERY=SKIPPED_ALREADY_STABLE"
  } else {
    Assert-PauseDisarmed -Stage "PRE_LIFECYCLE_RECOVERY"
    Assert-BridgeSession -ExpectedSession $bridgeSessionId -Stage "PRE_LIFECYCLE_RECOVERY"
    Assert-FlatBroker -Stage "PRE_LIFECYCLE_RECOVERY"

    $currentLifecycle = Invoke-ApiGet "/api/v1/phase7c/lifecycle"
    if ([bool]$currentLifecycle.running) {
      [void](Invoke-ApiPost "/api/v1/phase7c/lifecycle/stop" @{})
      Wait-LifecycleStopped
      Assert-PauseDisarmed -Stage "POST_STOP"
      Assert-BridgeSession -ExpectedSession $bridgeSessionId -Stage "POST_STOP"
      Assert-FlatBroker -Stage "POST_STOP"
    }

    [void](Invoke-ApiPost "/api/v1/phase7c/lifecycle/start" @{})
    if (-not (Wait-LifecycleReadyStable -ProbeTimeoutSeconds ([Math]::Min($TimeoutSeconds, 30)))) {
      throw "Lifecycle did not remain continuously READY for 5000ms after controlled recovery."
    }
    Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_LIFECYCLE_RECOVERY=PERFORMED"
  }

  Assert-PauseDisarmed -Stage "FINAL"
  Assert-BridgeSession -ExpectedSession $bridgeSessionId -Stage "FINAL"
  Assert-FlatBroker -Stage "FINAL"

  Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_STATUS=PASS"
  Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_FINAL_MODE=PAUSE"
  Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_FINAL_ARM=DISARMED"
  Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_BRIDGE_SESSION_UNCHANGED=PASS"
  Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_BRIDGE_RESTART=NONE"
  Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_ORDER_MUTATION=NONE"
  Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_LIVE_TEST_ORDER=NONE"
  Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_NEXT_ACTION=VERIFY_THEN_EXPLICIT_ARM_ONLY"
} catch {
  $originalError = $_.Exception.Message
  if ($mutationStarted) {
    try { Set-Pause "runtime-ready-stable-recovery-fail-closed" } catch {}
    try {
      $armNow = Invoke-ApiGet "/api/v1/phase7c-live-arm-control/capability"
      if ([string]$armNow.liveArmStatus -ne "DISARMED" -or [bool]$armNow.liveExecutionArmed) {
        Invoke-CanonicalDisarm
      }
    } catch {}
  }
  Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_FAIL_CLOSED_MODE=PAUSE"
  Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_FAIL_CLOSED_ARM=DISARMED_BEST_EFFORT"
  Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_BRIDGE_RESTART=NONE"
  Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_ORDER_MUTATION=NONE"
  Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_LIVE_TEST_ORDER=NONE"
  throw $originalError
}
