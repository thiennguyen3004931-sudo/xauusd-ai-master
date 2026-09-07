$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$target = Join-Path $PSScriptRoot 'recover-phase7c-runtime-ready-stable-deploy-local.ps1'
if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {
  throw "Recovery helper missing: $target"
}

$source = Get-Content -LiteralPath $target -Raw

$processCountMarker = 'function Get-Phase7CCanonicalTaskProcessCount($Task) {'
if (-not $source.Contains($processCountMarker)) {
  throw 'Canonical task process count marker not found.'
}
if ($source.Contains('function Get-Phase7CCanonicalTaskProcessIds')) {
  throw 'Released-lock process-id helper already present.'
}

$processIdsFunction = @'
function Get-Phase7CCanonicalTaskProcessIds($Task) {
  try {
    $actions = @($Task.Actions)
    if ($actions.Count -ne 1) { return @(-1) }
    $tokens = @(ConvertFrom-Phase7CCommandLineTokens ([string]$actions[0].Arguments))
    if ($tokens.Count -ne 5 -or -not $tokens[3].Equals('-EncodedCommand', [System.StringComparison]::OrdinalIgnoreCase)) {
      return @(-1)
    }
    $encodedToken = [string]$tokens[4]
    if ([string]::IsNullOrWhiteSpace($encodedToken)) { return @(-1) }
    $matches = @(
      Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction Stop |
        Where-Object {
          -not [string]::IsNullOrWhiteSpace([string]$_.CommandLine) -and
          ([string]$_.CommandLine).Contains($encodedToken)
        }
    )
    return @($matches | ForEach-Object { [int]$_.ProcessId })
  } catch {
    return @(-1)
  }
}

'@
$source = $source.Replace($processCountMarker, $processIdsFunction + $processCountMarker)

$oldEligibility = @'
  $preWebGenerationEligible = `
    $preWebLifecycleStopped -and `
    [string]$preWebTask.State -eq 'Running' -and `
    [string]$preWebRuntimeGeneration.statusReadState -eq 'OK' -and `
    [string]$preWebRuntimeGeneration.heartbeatReadState -eq 'OK' -and `
    [bool]$preWebRuntimeGeneration.brokerStatusPidMatch -and `
    [bool]$preWebRuntimeGeneration.brokerProcessAlive -and `
    [bool]$preWebRuntimeGeneration.brokerHeartbeatFresh -and `
    [string]$preWebRuntimeGeneration.startupRunnerLockState -eq 'HELD'

  if ($preWebLifecycleStopped) {
    if (-not $preWebGenerationEligible) {
      throw "Stopped lifecycle requires a proven healthy canonical SYSTEM generation before strict Web/API deploy. taskState=$($preWebTask.State) brokerAlive=$($preWebRuntimeGeneration.brokerProcessAlive) heartbeatFresh=$($preWebRuntimeGeneration.brokerHeartbeatFresh) lock=$($preWebRuntimeGeneration.startupRunnerLockState)"
    }
'@

$newEligibility = @'
  $preWebHealthyGenerationEligible = `
    $preWebLifecycleStopped -and `
    [string]$preWebTask.State -eq 'Running' -and `
    [string]$preWebRuntimeGeneration.statusReadState -eq 'OK' -and `
    [string]$preWebRuntimeGeneration.heartbeatReadState -eq 'OK' -and `
    [bool]$preWebRuntimeGeneration.brokerStatusPidMatch -and `
    [bool]$preWebRuntimeGeneration.brokerProcessAlive -and `
    [bool]$preWebRuntimeGeneration.brokerHeartbeatFresh -and `
    [string]$preWebRuntimeGeneration.startupRunnerLockState -eq 'HELD'

  $preWebCanonicalProcessIds = @(Get-Phase7CCanonicalTaskProcessIds -Task $preWebTask)
  $preWebRunningInstanceCount = Get-Phase7CRunningTaskInstanceCount -Name $TaskName
  $preWebExpectedLauncherSha256 = 'sha256:' + $trustedRunnerSha256.ToLowerInvariant()
  $preWebBrokerAttestationPath = Join-Path $WorkDir "phase7c-source-attestation\components\lifecycle-broker.json"
  $preWebBrokerAttestation = Read-JsonFile -Path $preWebBrokerAttestationPath -Label "Lifecycle broker source attestation before pre-Web generation reload"
  $preWebAttestedLauncherSha256 = ([string]$preWebBrokerAttestation.launcherSha256).Trim().ToLowerInvariant()
  $preWebReleasedOwnership = Test-Phase7CExecutorTaskActionOwnership `
    -Actions $preWebTask.Actions `
    -ExpectedRunnerPath $runnerPath `
    -ExpectedRunnerSha256 $trustedRunnerSha256
  $preWebReleasedDrift = @(Get-Phase7CExecutorTaskDrift -Task $preWebTask)
  $preWebReleasedLockRepairEligible = `
    $preWebLifecycleStopped -and `
    [string]$preWebTask.State -eq 'Running' -and `
    [string]$preWebRuntimeGeneration.statusReadState -eq 'OK' -and `
    [string]$preWebRuntimeGeneration.heartbeatReadState -eq 'OK' -and `
    [bool]$preWebRuntimeGeneration.brokerStatusPidMatch -and `
    [bool]$preWebRuntimeGeneration.brokerProcessAlive -and `
    [bool]$preWebRuntimeGeneration.brokerHeartbeatFresh -and `
    [string]$preWebRuntimeGeneration.startupRunnerLockState -in @('MISSING', 'RELEASED') -and `
    $preWebCanonicalProcessIds.Count -eq 1 -and `
    $preWebRunningInstanceCount -eq 1 -and `
    [int]$preWebCanonicalProcessIds[0] -eq [int]$preWebRuntimeGeneration.statusBrokerPid -and `
    [string]$preWebBrokerAttestation.component -eq 'lifecycle-broker' -and `
    [int]$preWebBrokerAttestation.pid -eq [int]$preWebRuntimeGeneration.statusBrokerPid -and `
    $preWebAttestedLauncherSha256 -eq $preWebExpectedLauncherSha256 -and `
    [bool]$preWebReleasedOwnership.owned -and `
    [bool]$preWebReleasedOwnership.canonical -and `
    -not [bool]$preWebReleasedOwnership.repairRequired -and `
    $preWebReleasedDrift.Count -eq 0 -and `
    (Test-Phase7CSystemTaskPrincipal $preWebTask.Principal)

  $preWebGenerationEligible = $preWebHealthyGenerationEligible -or $preWebReleasedLockRepairEligible

  if ($preWebLifecycleStopped) {
    if (-not $preWebGenerationEligible) {
      throw "Stopped lifecycle requires a proven canonical SYSTEM generation before strict Web/API deploy. taskState=$($preWebTask.State) brokerAlive=$($preWebRuntimeGeneration.brokerProcessAlive) heartbeatFresh=$($preWebRuntimeGeneration.brokerHeartbeatFresh) lock=$($preWebRuntimeGeneration.startupRunnerLockState) canonicalProcesses=$($preWebCanonicalProcessIds.Count) taskInstances=$preWebRunningInstanceCount"
    }
    if ($preWebReleasedLockRepairEligible) {
      Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_GENERATION_PRE_WEB_RELEASED_LOCK=ELIGIBLE_REPAIR_REQUIRED"
      Assert-PauseDisarmed -Stage "GENERATION_PRE_WEB_RELEASED_LOCK"
      Assert-BridgeSession -ExpectedSession $bridgeSessionId -Stage "GENERATION_PRE_WEB_RELEASED_LOCK"
      Assert-FlatBroker -Stage "GENERATION_PRE_WEB_RELEASED_LOCK"
    }
'@

if (-not $source.Contains($oldEligibility)) {
  throw 'Stopped-lifecycle eligibility block not found.'
}
$source = $source.Replace($oldEligibility, $newEligibility)

$oldBeforeStop = @'
    if (-not (Test-Phase7CSystemTaskPrincipal $preWebTask.Principal)) {
      throw "Canonical pre-Web source generation reload requires SYSTEM + ServiceAccount + Highest."
    }

    $preWebBrokerPidBeforeStop = Get-Phase7CBrokerPidFromHeartbeat
'@

$newBeforeStop = @'
    if (-not (Test-Phase7CSystemTaskPrincipal $preWebTask.Principal)) {
      throw "Canonical pre-Web source generation reload requires SYSTEM + ServiceAccount + Highest."
    }

    if ($preWebReleasedLockRepairEligible) {
      # Re-prove the exact abnormal singleton tuple immediately before stopping
      # the only canonical SYSTEM task. A released lock is repair-required and
      # is never normalized to a healthy generation state.
      $preWebTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
      $preWebRuntimeGeneration = Get-Phase7CRuntimeGenerationSnapshot -WorkDir $WorkDir
      $preWebCanonicalProcessIds = @(Get-Phase7CCanonicalTaskProcessIds -Task $preWebTask)
      $preWebRunningInstanceCount = Get-Phase7CRunningTaskInstanceCount -Name $TaskName
      $preWebBrokerAttestation = Read-JsonFile -Path $preWebBrokerAttestationPath -Label "Lifecycle broker source attestation during released-lock safety recheck"
      $preWebAttestedLauncherSha256 = ([string]$preWebBrokerAttestation.launcherSha256).Trim().ToLowerInvariant()
      $preWebReleasedOwnership = Test-Phase7CExecutorTaskActionOwnership `
        -Actions $preWebTask.Actions `
        -ExpectedRunnerPath $runnerPath `
        -ExpectedRunnerSha256 $trustedRunnerSha256
      $preWebReleasedDrift = @(Get-Phase7CExecutorTaskDrift -Task $preWebTask)
      $preWebReleasedLockStillEligible = `
        [string]$preWebTask.State -eq 'Running' -and `
        [string]$preWebRuntimeGeneration.statusReadState -eq 'OK' -and `
        [string]$preWebRuntimeGeneration.heartbeatReadState -eq 'OK' -and `
        [bool]$preWebRuntimeGeneration.brokerStatusPidMatch -and `
        [bool]$preWebRuntimeGeneration.brokerProcessAlive -and `
        [bool]$preWebRuntimeGeneration.brokerHeartbeatFresh -and `
        [string]$preWebRuntimeGeneration.startupRunnerLockState -in @('MISSING', 'RELEASED') -and `
        $preWebCanonicalProcessIds.Count -eq 1 -and `
        $preWebRunningInstanceCount -eq 1 -and `
        [int]$preWebCanonicalProcessIds[0] -eq [int]$preWebRuntimeGeneration.statusBrokerPid -and `
        [string]$preWebBrokerAttestation.component -eq 'lifecycle-broker' -and `
        [int]$preWebBrokerAttestation.pid -eq [int]$preWebRuntimeGeneration.statusBrokerPid -and `
        $preWebAttestedLauncherSha256 -eq $preWebExpectedLauncherSha256 -and `
        [bool]$preWebReleasedOwnership.owned -and `
        [bool]$preWebReleasedOwnership.canonical -and `
        -not [bool]$preWebReleasedOwnership.repairRequired -and `
        $preWebReleasedDrift.Count -eq 0 -and `
        (Test-Phase7CSystemTaskPrincipal $preWebTask.Principal)
      if (-not $preWebReleasedLockStillEligible) {
        throw "Released-lock canonical broker tuple changed during safety recheck; task restart blocked."
      }
      Assert-PauseDisarmed -Stage "GENERATION_PRE_WEB_RELEASED_LOCK"
      Assert-BridgeSession -ExpectedSession $bridgeSessionId -Stage "GENERATION_PRE_WEB_RELEASED_LOCK"
      Assert-FlatBroker -Stage "GENERATION_PRE_WEB_RELEASED_LOCK"
      Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_GENERATION_PRE_WEB_RELEASED_LOCK_RECHECK=PASS"
    }

    $preWebBrokerPidBeforeStop = Get-Phase7CBrokerPidFromHeartbeat
'@

if (-not $source.Contains($oldBeforeStop)) {
  throw 'Pre-Web mutation boundary marker not found.'
}
$source = $source.Replace($oldBeforeStop, $newBeforeStop)

[System.IO.File]::WriteAllText($target, $source, [System.Text.UTF8Encoding]::new($false))
Write-Host 'PHASE7C_RELEASED_LOCK_RECOVERY_PATCH=APPLIED'
