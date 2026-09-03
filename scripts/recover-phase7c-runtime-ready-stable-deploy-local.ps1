param(
  [Parameter(Mandatory = $true)] [string]$ExpectedCommit,
  [int]$TimeoutSeconds = 120
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ConfigPath = Join-Path $ProjectRoot ".runtime\phase7c-executor-task-config.json"
$AccountLibrary = Join-Path $PSScriptRoot "lib\phase7c-account-mode.ps1"
$OwnershipLibrary = Join-Path $PSScriptRoot "lib\phase7c-scheduled-task-ownership.ps1"
$RuntimeOwnershipLibrary = Join-Path $PSScriptRoot "lib\phase7c-runtime-ownership-probe.ps1"
$WebApiDeploy = Join-Path $PSScriptRoot "deploy-phase7c-web-ui-local.ps1"
$TaskInstaller = Join-Path $PSScriptRoot "register-phase7c-executor-task-local.ps1"
$TaskName = "XAUUSD-Phase7C-Executors"
$BrokerState = Join-Path $ProjectRoot ".runtime\phase7c-lifecycle-broker\state"
$BrokerHeartbeat = Join-Path $BrokerState "heartbeat.json"
$ApiSidRecord = Join-Path $BrokerState "api-user-sid.txt"
$ReadyStableMs = 5000

if ($ExpectedCommit -notmatch '^[0-9a-fA-F]{40}$') {
  throw "ExpectedCommit must be an exact 40-character Git SHA."
}
if ($TimeoutSeconds -lt 30 -or $TimeoutSeconds -gt 600) {
  throw "TimeoutSeconds must be between 30 and 600."
}
foreach ($required in @($ConfigPath, $AccountLibrary, $OwnershipLibrary, $RuntimeOwnershipLibrary, $WebApiDeploy, $TaskInstaller)) {
  if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
    throw "Runtime-ready stable recovery deploy required file not found: $required"
  }
}

. $AccountLibrary
. $OwnershipLibrary
. $RuntimeOwnershipLibrary
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

function Get-Phase7CRecordedApiUserSid {
  if (-not (Test-Path -LiteralPath $ApiSidRecord -PathType Leaf)) {
    throw "Lifecycle broker API SID record is missing before task repair: $ApiSidRecord"
  }
  $value = ([string](Get-Content -LiteralPath $ApiSidRecord -Raw)).Trim()
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "Lifecycle broker API SID record is empty before task repair: $ApiSidRecord"
  }
  try {
    $sid = New-Object System.Security.Principal.SecurityIdentifier($value)
  } catch {
    throw "Lifecycle broker API SID record is invalid before task repair: $value"
  }
  return [string]$sid.Value
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

function Test-Phase7CLifecycleHasAliveProcess {
  param([Parameter(Mandatory = $true)] $State)

  if ($null -eq $State) { return $true }
  if ($null -eq $State.processes) { return $true }
  foreach ($property in @($State.processes.PSObject.Properties)) {
    if ($null -ne $property.Value -and [bool]$property.Value.alive) {
      return $true
    }
  }
  return $false
}

function Wait-LifecycleStopped {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 500
    try {
      $state = Invoke-ApiGet "/api/v1/phase7c/lifecycle"
      if (-not [bool]$state.running -and -not (Test-Phase7CLifecycleHasAliveProcess -State $state)) { return }
    } catch {}
  }
  throw "Lifecycle did not stop within $TimeoutSeconds seconds."
}

function Assert-LifecycleExecutorsStopped([string]$Stage) {
  $state = Invoke-ApiGet "/api/v1/phase7c/lifecycle"
  if ([bool]$state.running) {
    throw "$Stage requires lifecycle running=false before Scheduled Task repair."
  }
  if ($null -eq $state.processes) {
    throw "$Stage lifecycle process status is unavailable."
  }
  $alive = @()
  foreach ($property in @($state.processes.PSObject.Properties)) {
    if ($null -ne $property.Value -and [bool]$property.Value.alive) {
      $alive += [string]$property.Name
    }
  }
  if ($alive.Count -ne 0) {
    throw "$Stage requires every executor process stopped before Scheduled Task repair. alive=$($alive -join ',')"
  }
  Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_${Stage}_EXECUTORS_STOPPED=PASS"
}

function Test-Phase7CSystemTaskPrincipal($Principal) {
  if ($null -eq $Principal) { return $false }
  $user = ([string]$Principal.UserId).Trim()
  $systemUser = $user -in @('SYSTEM', 'NT AUTHORITY\SYSTEM', 'S-1-5-18')
  return $systemUser -and ([string]$Principal.LogonType) -eq 'ServiceAccount' -and ([string]$Principal.RunLevel) -eq 'Highest'
}

function Get-Phase7CBrokerPidFromHeartbeat {
  if (-not (Test-Path -LiteralPath $BrokerHeartbeat -PathType Leaf)) { return 0 }
  try {
    $heartbeat = Get-Content -LiteralPath $BrokerHeartbeat -Raw | ConvertFrom-Json
    if ([int]$heartbeat.version -ne 1) { return 0 }
    $brokerPid = [int]$heartbeat.brokerPid
    if ($brokerPid -le 0) { return 0 }
    return $brokerPid
  } catch {
    return 0
  }
}

function Test-Phase7CBrokerHeartbeatFresh {
  if (-not (Test-Path -LiteralPath $BrokerHeartbeat -PathType Leaf)) { return $false }
  try {
    $heartbeat = Get-Content -LiteralPath $BrokerHeartbeat -Raw | ConvertFrom-Json
    if ([int]$heartbeat.version -ne 1) { return $false }
    $brokerPid = [int]$heartbeat.brokerPid
    if ($brokerPid -le 0 -or $null -eq (Get-Process -Id $brokerPid -ErrorAction SilentlyContinue)) { return $false }
    $updatedAt = [long]$heartbeat.updatedAt
    $age = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() - $updatedAt
    return $age -ge 0 -and $age -le 5000
  } catch {
    return $false
  }
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

Import-Module ScheduledTasks -ErrorAction Stop
$runnerPath = Get-Phase7CExecutorTaskRunnerPath -ProjectRoot $ProjectRoot
$trustedRunnerSha256 = Get-Phase7CTrustedGitFileSha256 -ProjectRoot $ProjectRoot -Path $runnerPath
Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_TASK_EXPECTED_RUNNER=$runnerPath"
Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_TASK_EXPECTED_RUNNER_SHA256=$trustedRunnerSha256"

$task = $null
try {
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
} catch {
  $classification = Get-Phase7CScheduledTaskErrorClassification -Exception $_.Exception
  Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_TASK_PROVIDER=$classification"
  Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_TASK_PROVENANCE_REPAIR=BLOCKED_UNPROVEN_OWNERSHIP"
  throw "Cannot prove canonical Scheduled Task ownership before recovery mutation. classification=$classification"
}
if ($null -eq $task) {
  Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_TASK_PROVENANCE_REPAIR=BLOCKED_UNPROVEN_OWNERSHIP"
  throw "Canonical Scheduled Task '$TaskName' is missing; recovery deploy will not create it implicitly."
}

$taskOwnership = Test-Phase7CExecutorTaskActionOwnership `
  -Actions $task.Actions `
  -ExpectedRunnerPath $runnerPath `
  -ExpectedRunnerSha256 $trustedRunnerSha256
if (-not [bool]$taskOwnership.owned) {
  Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_TASK_PROVENANCE_REPAIR=BLOCKED_UNPROVEN_OWNERSHIP"
  throw "Scheduled Task ownership cannot be proven; recovery mutation blocked. reason=$($taskOwnership.reason)"
}
if (-not (Test-Phase7CSystemTaskPrincipal $task.Principal)) {
  Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_TASK_PROVENANCE_REPAIR=BLOCKED_UNPROVEN_OWNERSHIP"
  throw "Owned Scheduled Task is not SYSTEM + ServiceAccount + Highest; automatic principal replacement is blocked."
}

$taskDefinitionDrift = @(Get-Phase7CExecutorTaskDrift -Task $task)
$taskProvenanceRepairRequired = [bool]$taskOwnership.repairRequired -or -not [bool]$taskOwnership.canonical
$taskBatterySettingsRepairRequired = $false
if (-not $taskProvenanceRepairRequired -and $taskDefinitionDrift.Count -gt 0) {
  if (Test-Phase7CBatteryOnlyTaskDrift -Drift $taskDefinitionDrift) {
    $taskBatterySettingsRepairRequired = $true
    Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_TASK_DEFINITION_REPAIR=BATTERY_SETTINGS_REQUIRED"
    Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_TASK_DEFINITION_DRIFT=$($taskDefinitionDrift -join ',')"
  } else {
    throw "Owned canonical Scheduled Task has unsupported definition drift; automatic recovery repair is blocked. drift=$($taskDefinitionDrift -join ',')"
  }
}
$taskRepairRequired = $taskProvenanceRepairRequired -or $taskBatterySettingsRepairRequired

$apiUserSid = ""
if ($taskRepairRequired) {
  if ($taskProvenanceRepairRequired) {
    Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_TASK_PROVENANCE=OWNED_REPAIR_REQUIRED"
    Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_TASK_PROVENANCE_REASON=$($taskOwnership.reason)"
  } else {
    Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_TASK_PROVENANCE=CANONICAL_HASH_GUARD"
  }
  $apiUserSid = Get-Phase7CRecordedApiUserSid
  Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_TASK_API_SID_PREFLIGHT=PASS"
} else {
  Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_TASK_PROVENANCE=CANONICAL_HASH_GUARD"
  Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_TASK_PROVENANCE_REPAIR=SKIPPED_ALREADY_CANONICAL"
}

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

# A previous repair attempt can leave an already-canonical task stranded in
# Queued/STOPPED state solely because the old task definition blocked battery
# starts. Repair that exact outage before Web/API deploy so the ordinary strict
# verifier remains unchanged and never needs a broker/executor outage bypass.
if ($taskBatterySettingsRepairRequired) {
  $runtimeGenerationBeforeBatteryRepair = Get-Phase7CRuntimeGenerationSnapshot -WorkDir $WorkDir
  $lifecycleBeforeBatteryRepair = Invoke-ApiGet "/api/v1/phase7c/lifecycle"
  $taskBeforeBatteryRepair = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
  $lockAbsentBeforeBatteryRepair = [string]$runtimeGenerationBeforeBatteryRepair.startupRunnerLockState -in @('MISSING', 'RELEASED')
  $batteryRuntimeUnavailable = `
    [string]$taskBeforeBatteryRepair.State -ne 'Running' -or `
    -not [bool]$runtimeGenerationBeforeBatteryRepair.brokerProcessAlive -or `
    -not [bool]$runtimeGenerationBeforeBatteryRepair.brokerHeartbeatFresh -or `
    $lockAbsentBeforeBatteryRepair

  $batteryPreWebRepairEligible = `
    [string]$taskBeforeBatteryRepair.State -ne 'Running' -and `
    [string]$runtimeGenerationBeforeBatteryRepair.statusReadState -eq 'OK' -and `
    [string]$runtimeGenerationBeforeBatteryRepair.heartbeatReadState -eq 'OK' -and `
    [bool]$runtimeGenerationBeforeBatteryRepair.brokerStatusPidMatch -and `
    -not [bool]$runtimeGenerationBeforeBatteryRepair.brokerProcessAlive -and `
    -not [bool]$runtimeGenerationBeforeBatteryRepair.brokerHeartbeatFresh -and `
    $lockAbsentBeforeBatteryRepair -and `
    -not [bool]$lifecycleBeforeBatteryRepair.running -and `
    -not (Test-Phase7CLifecycleHasAliveProcess -State $lifecycleBeforeBatteryRepair)

  if ($batteryRuntimeUnavailable -and -not $batteryPreWebRepairEligible) {
    throw "Battery-settings task drift is paired with an unproven runtime outage; pre-Web repair blocked. taskState=$($taskBeforeBatteryRepair.State) brokerAlive=$($runtimeGenerationBeforeBatteryRepair.brokerProcessAlive) heartbeatFresh=$($runtimeGenerationBeforeBatteryRepair.brokerHeartbeatFresh) lock=$($runtimeGenerationBeforeBatteryRepair.startupRunnerLockState)"
  }

  if ($batteryPreWebRepairEligible) {
    Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_BATTERY_PRE_WEB_REPAIR=ELIGIBLE"
    Assert-LifecycleExecutorsStopped -Stage "BATTERY_PRE_WEB_REPAIR"
    Assert-PauseDisarmed -Stage "BATTERY_PRE_WEB_REPAIR"
    Assert-BridgeSession -ExpectedSession $bridgeSessionId -Stage "BATTERY_PRE_WEB_REPAIR"
    Assert-FlatBroker -Stage "BATTERY_PRE_WEB_REPAIR"

    Stop-ScheduledTask -TaskName $TaskName -ErrorAction Stop
    $taskStopDeadline = [DateTime]::UtcNow.AddSeconds([Math]::Min($TimeoutSeconds, 30))
    $taskQuiesced = $false
    do {
      Start-Sleep -Milliseconds 250
      $taskAfterStop = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
      if ([string]$taskAfterStop.State -notin @('Running', 'Queued')) {
        $taskQuiesced = $true
        break
      }
    } while ([DateTime]::UtcNow -lt $taskStopDeadline)
    if (-not $taskQuiesced) {
      throw "Battery-stranded Scheduled Task did not quiesce before canonical settings repair. state=$($taskAfterStop.State)"
    }

    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $TaskInstaller `
      -TaskName $TaskName `
      -ProjectRoot $ProjectRoot `
      -Repair `
      -ApiUserSid $apiUserSid
    if ($LASTEXITCODE -ne 0) {
      throw "Canonical Scheduled Task battery settings repair failed with exit code $LASTEXITCODE."
    }

    $repairedBatteryTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
    $repairedBatteryOwnership = Test-Phase7CExecutorTaskActionOwnership `
      -Actions $repairedBatteryTask.Actions `
      -ExpectedRunnerPath $runnerPath `
      -ExpectedRunnerSha256 $trustedRunnerSha256
    $repairedBatteryDrift = @(Get-Phase7CExecutorTaskDrift -Task $repairedBatteryTask)
    if (-not [bool]$repairedBatteryOwnership.owned -or -not [bool]$repairedBatteryOwnership.canonical -or [bool]$repairedBatteryOwnership.repairRequired -or $repairedBatteryDrift.Count -ne 0) {
      throw "Battery settings repair did not converge to the canonical trusted task definition. ownership=$($repairedBatteryOwnership.reason) drift=$($repairedBatteryDrift -join ',')"
    }
    if (-not (Test-Phase7CSystemTaskPrincipal $repairedBatteryTask.Principal)) {
      throw "Battery settings repair did not preserve SYSTEM + ServiceAccount + Highest."
    }
    if (-not (Test-Phase7CBrokerHeartbeatFresh)) {
      throw "Battery settings repair did not return a fresh lifecycle broker heartbeat."
    }

    $batteryPostRepairLockPath = Join-Path $WorkDir "phase7c-executors\startup-runner.lock"
    $batteryPostRepairLockState = Get-Phase7CReadOnlyLockState -Path $batteryPostRepairLockPath
    if ($batteryPostRepairLockState -ne 'HELD') {
      throw "Battery settings repair did not restore the startup-runner singleton lock. state=$batteryPostRepairLockState"
    }
    Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_BATTERY_PRE_WEB_TASK_REPAIR=PASS"
    Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_BATTERY_PRE_WEB_STARTUP_RUNNER_LOCK=HELD"

    [void](Invoke-ApiPost "/api/v1/phase7c/lifecycle/start" @{})
    if (-not (Wait-LifecycleReadyStable -ProbeTimeoutSeconds ([Math]::Min($TimeoutSeconds, 30)))) {
      throw "Lifecycle did not return to stable READY after battery settings pre-Web repair."
    }
    Assert-PauseDisarmed -Stage "BATTERY_POST_REPAIR"
    Assert-BridgeSession -ExpectedSession $bridgeSessionId -Stage "BATTERY_POST_REPAIR"
    Assert-FlatBroker -Stage "BATTERY_POST_REPAIR"
    Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_BATTERY_PRE_WEB_LIFECYCLE_READY=PASS"

    $taskBatterySettingsRepairRequired = $false
    $taskRepairRequired = $taskProvenanceRepairRequired
  }
}

  # Load the exact accepted Web/API source before any executor or SYSTEM task stop.
  # When an owned legacy/stale-hash task has already passed provenance, principal,
  # API SID, PAUSE/DISARMED, Bridge-session and flat-broker preflight, allow the
  # strict account verifier to exempt only the startup-runner lock until repair.
  $webApiDeployArgs = @()
  if ($taskProvenanceRepairRequired) {
    $webApiDeployArgs += @(
      '-AllowOwnedTaskProvenanceMigration',
      '-ExpectedRunnerSha256', $trustedRunnerSha256
    )
    Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_WEB_API_MIGRATION_WINDOW=ENABLED_OWNED_REPAIR_REQUIRED"
  } else {
    Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_WEB_API_MIGRATION_WINDOW=DISABLED_CANONICAL_TASK"
  }

  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $WebApiDeploy `
    -WorkDir $WorkDir `
    -ExpectedCommit $ExpectedCommit `
    @webApiDeployArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Canonical Web/API deploy failed with exit code $LASTEXITCODE."
  }
  Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_WEB_API_DEPLOY=PASS"

  Assert-PauseDisarmed -Stage "POST_WEB_API_DEPLOY"
  Assert-BridgeSession -ExpectedSession $bridgeSessionId -Stage "POST_WEB_API_DEPLOY"
  Assert-FlatBroker -Stage "POST_WEB_API_DEPLOY"

  $stableBeforeRecovery = Wait-LifecycleReadyStable -ProbeTimeoutSeconds 8
  if ($stableBeforeRecovery -and -not $taskRepairRequired) {
    Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_LIFECYCLE_RECOVERY=SKIPPED_ALREADY_STABLE"
  } else {
    Assert-PauseDisarmed -Stage "PRE_LIFECYCLE_RECOVERY"
    Assert-BridgeSession -ExpectedSession $bridgeSessionId -Stage "PRE_LIFECYCLE_RECOVERY"
    Assert-FlatBroker -Stage "PRE_LIFECYCLE_RECOVERY"

    $currentLifecycle = Invoke-ApiGet "/api/v1/phase7c/lifecycle"
    $currentLifecycleNeedsStop = [bool]$currentLifecycle.running -or (Test-Phase7CLifecycleHasAliveProcess -State $currentLifecycle)
    if ($currentLifecycleNeedsStop) {
      [void](Invoke-ApiPost "/api/v1/phase7c/lifecycle/stop" @{})
      Wait-LifecycleStopped
      Assert-PauseDisarmed -Stage "POST_STOP"
      Assert-BridgeSession -ExpectedSession $bridgeSessionId -Stage "POST_STOP"
      Assert-FlatBroker -Stage "POST_STOP"
    }

    if ($taskRepairRequired) {
      Assert-LifecycleExecutorsStopped -Stage "PRE_TASK_REPAIR"
      Assert-PauseDisarmed -Stage "PRE_TASK_REPAIR"
      Assert-BridgeSession -ExpectedSession $bridgeSessionId -Stage "PRE_TASK_REPAIR"
      Assert-FlatBroker -Stage "PRE_TASK_REPAIR"

      $brokerPidBeforeTaskStop = Get-Phase7CBrokerPidFromHeartbeat
      Stop-ScheduledTask -TaskName $TaskName -ErrorAction Stop
      $taskStopDeadline = [DateTime]::UtcNow.AddSeconds([Math]::Min($TimeoutSeconds, 30))
      $taskStopped = $false
      do {
        Start-Sleep -Milliseconds 250
        $stoppedTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
        if ([string]$stoppedTask.State -ne 'Running') {
          $taskStopped = $true
          break
        }
      } while ([DateTime]::UtcNow -lt $taskStopDeadline)
      if (-not $taskStopped) {
        throw "Owned Scheduled Task did not stop before provenance repair."
      }
      Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_TASK_STOP=PASS"

      $brokerProcessStopped = $brokerPidBeforeTaskStop -le 0
      $brokerStopDeadline = [DateTime]::UtcNow.AddSeconds([Math]::Min($TimeoutSeconds, 30))
      while (-not $brokerProcessStopped -and [DateTime]::UtcNow -lt $brokerStopDeadline) {
        if ($null -eq (Get-Process -Id $brokerPidBeforeTaskStop -ErrorAction SilentlyContinue)) {
          $brokerProcessStopped = $true
          break
        }
        Start-Sleep -Milliseconds 250
      }
      if (-not $brokerProcessStopped) {
        throw "Previous lifecycle broker process remained alive after Scheduled Task stop. pid=$brokerPidBeforeTaskStop"
      }
      Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_BROKER_PROCESS_STOP=PASS|PREVIOUS_PID=$brokerPidBeforeTaskStop"

      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $TaskInstaller `
        -TaskName $TaskName `
        -ProjectRoot $ProjectRoot `
        -Repair `
        -ApiUserSid $apiUserSid
      if ($LASTEXITCODE -ne 0) {
        throw "Canonical Scheduled Task provenance repair failed with exit code $LASTEXITCODE."
      }

      $repairedTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
      $repairedOwnership = Test-Phase7CExecutorTaskActionOwnership `
        -Actions $repairedTask.Actions `
        -ExpectedRunnerPath $runnerPath `
        -ExpectedRunnerSha256 $trustedRunnerSha256
      $repairedDefinitionDrift = @(Get-Phase7CExecutorTaskDrift -Task $repairedTask)
      if (-not [bool]$repairedOwnership.owned -or -not [bool]$repairedOwnership.canonical -or [bool]$repairedOwnership.repairRequired -or $repairedDefinitionDrift.Count -ne 0) {
        throw "Scheduled Task repair did not converge to the canonical trusted definition. ownership=$($repairedOwnership.reason) drift=$($repairedDefinitionDrift -join ',')"
      }
      if (-not (Test-Phase7CSystemTaskPrincipal $repairedTask.Principal)) {
        throw "Scheduled Task provenance repair did not preserve SYSTEM + ServiceAccount + Highest."
      }
      if (-not (Test-Phase7CBrokerHeartbeatFresh)) {
        throw "Scheduled Task provenance repair did not return a fresh lifecycle broker heartbeat."
      }

      $postRepairLockPath = Join-Path $WorkDir "phase7c-executors\startup-runner.lock"
      $postRepairLockState = Get-Phase7CReadOnlyLockState -Path $postRepairLockPath
      if ($postRepairLockState -ne 'HELD') {
        throw "Scheduled Task provenance repair did not restore the startup-runner singleton lock. state=$postRepairLockState"
      }
      Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_POST_REPAIR_STARTUP_RUNNER_LOCK=HELD"

      Assert-PauseDisarmed -Stage "POST_TASK_REPAIR"
      Assert-BridgeSession -ExpectedSession $bridgeSessionId -Stage "POST_TASK_REPAIR"
      Assert-FlatBroker -Stage "POST_TASK_REPAIR"
      Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_TASK_PROVENANCE=CANONICAL_HASH_GUARD"
      if ($taskProvenanceRepairRequired) {
        Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_TASK_PROVENANCE_REPAIR=PERFORMED"
      } else {
        Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_TASK_DEFINITION_REPAIR=PERFORMED_BATTERY_SETTINGS"
      }
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
