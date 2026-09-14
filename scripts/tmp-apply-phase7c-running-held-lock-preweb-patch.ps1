$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$path = Join-Path $PSScriptRoot 'recover-phase7c-runtime-ready-stable-deploy-local.ps1'
$text = (Get-Content -LiteralPath $path -Raw).Replace("`r`n", "`n").Replace("`r", "`n")
$marker = '  $preWebRunningReleasedLockObserved = `'
$matches = [regex]::Matches($text, [regex]::Escape($marker))
if ($matches.Count -ne 1) {
  throw "Expected exactly one released-lock insertion marker, found $($matches.Count)"
}

$insert = @'
  # Production reproduction 2026-09-14: source generation can be stale while the
  # lifecycle remains RUNNING+READY and the canonical SYSTEM broker still owns a
  # healthy HELD singleton lock. Quiesce that exact tuple before strict Web/API
  # deploy, then reuse the stopped-lifecycle generation reload below. Do not compare
  # the stale broker launcher SHA to the newly repaired task runner SHA: task
  # definition provenance and the live broker process are proven independently.
  $preWebRunningHeldLockObserved = `
    $preWebLifecycleRunningReady -and `
    [string]$preWebRuntimeGeneration.startupRunnerLockState -eq 'HELD'
  $preWebRunningHeldLockCandidate = `
    $preWebRunningHeldLockObserved -and `
    [string]$preWebTask.State -eq 'Running' -and `
    [string]$preWebRuntimeGeneration.statusReadState -eq 'OK' -and `
    [string]$preWebRuntimeGeneration.heartbeatReadState -eq 'OK' -and `
    [bool]$preWebRuntimeGeneration.brokerStatusPidMatch -and `
    [bool]$preWebRuntimeGeneration.brokerProcessAlive -and `
    [bool]$preWebRuntimeGeneration.brokerHeartbeatFresh

  $preWebRunningHeldCanonicalProcessIds = @()
  $preWebRunningHeldInstanceCount = -1
  $preWebRunningHeldBrokerAttestation = $null
  $preWebRunningHeldOwnership = $null
  $preWebRunningHeldDrift = @('UNREAD')
  $preWebRunningHeldLockReloadEligible = $false
  if ($preWebRunningHeldLockCandidate) {
    try {
      $preWebRunningHeldCanonicalProcessIds = @(Get-Phase7CCanonicalTaskProcessIds -Task $preWebTask)
      $preWebRunningHeldInstanceCount = Get-Phase7CRunningTaskInstanceCount -Name $TaskName
      $preWebRunningHeldBrokerAttestation = Read-JsonFile -Path $preWebBrokerAttestationPath -Label "Lifecycle broker source attestation before RUNNING+READY HELD-lock quiesce"
      $preWebRunningHeldOwnership = Test-Phase7CExecutorTaskActionOwnership `
        -Actions $preWebTask.Actions `
        -ExpectedRunnerPath $runnerPath `
        -ExpectedRunnerSha256 $trustedRunnerSha256
      $preWebRunningHeldDrift = @(Get-Phase7CExecutorTaskDrift -Task $preWebTask)
      $preWebRunningHeldLockReloadEligible = `
        $preWebRunningHeldCanonicalProcessIds.Count -eq 1 -and `
        $preWebRunningHeldInstanceCount -eq 1 -and `
        [int]$preWebRunningHeldCanonicalProcessIds[0] -eq [int]$preWebRuntimeGeneration.statusBrokerPid -and `
        [string]$preWebRunningHeldBrokerAttestation.component -eq 'lifecycle-broker' -and `
        [int]$preWebRunningHeldBrokerAttestation.pid -eq [int]$preWebRuntimeGeneration.statusBrokerPid -and `
        [bool]$preWebRunningHeldOwnership.owned -and `
        [bool]$preWebRunningHeldOwnership.canonical -and `
        -not [bool]$preWebRunningHeldOwnership.repairRequired -and `
        $preWebRunningHeldDrift.Count -eq 0 -and `
        (Test-Phase7CSystemTaskPrincipal $preWebTask.Principal)
    } catch {
      $preWebRunningHeldLockReloadEligible = $false
    }
  }

  if ($preWebRunningHeldLockObserved) {
    if (-not $preWebRunningHeldLockReloadEligible) {
      throw "RUNNING+READY lifecycle with HELD startup lock requires an exact canonical SYSTEM broker tuple before lifecycle quiesce. taskState=$($preWebTask.State) brokerAlive=$($preWebRuntimeGeneration.brokerProcessAlive) heartbeatFresh=$($preWebRuntimeGeneration.brokerHeartbeatFresh) lock=$($preWebRuntimeGeneration.startupRunnerLockState) canonicalProcesses=$($preWebRunningHeldCanonicalProcessIds.Count) taskInstances=$preWebRunningHeldInstanceCount"
    }

    Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_GENERATION_PRE_WEB_RUNNING_HELD_LOCK=ELIGIBLE_QUIESCE_REQUIRED"
    Assert-PauseDisarmed -Stage "GENERATION_PRE_WEB_RUNNING_HELD_LOCK"
    Assert-BridgeSession -ExpectedSession $bridgeSessionId -Stage "GENERATION_PRE_WEB_RUNNING_HELD_LOCK"
    Assert-FlatBroker -Stage "GENERATION_PRE_WEB_RUNNING_HELD_LOCK"

    # Re-prove the live stale-generation tuple immediately before lifecycle STOP.
    # The current Scheduled Task definition must be canonical for the accepted source,
    # while the running broker is bound independently by process/PID/heartbeat/attestation.
    $preWebTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
    $preWebRuntimeGeneration = Get-Phase7CRuntimeGenerationSnapshot -WorkDir $WorkDir
    $preWebLifecycle = Invoke-ApiGet "/api/v1/phase7c/lifecycle"
    $preWebRunningHeldCanonicalProcessIds = @(Get-Phase7CCanonicalTaskProcessIds -Task $preWebTask)
    $preWebRunningHeldInstanceCount = Get-Phase7CRunningTaskInstanceCount -Name $TaskName
    $preWebRunningHeldBrokerAttestation = Read-JsonFile -Path $preWebBrokerAttestationPath -Label "Lifecycle broker source attestation during RUNNING+READY HELD-lock safety recheck"
    $preWebRunningHeldOwnership = Test-Phase7CExecutorTaskActionOwnership `
      -Actions $preWebTask.Actions `
      -ExpectedRunnerPath $runnerPath `
      -ExpectedRunnerSha256 $trustedRunnerSha256
    $preWebRunningHeldDrift = @(Get-Phase7CExecutorTaskDrift -Task $preWebTask)
    $preWebRunningHeldLockStillEligible = `
      [bool]$preWebLifecycle.running -and `
      [bool]$preWebLifecycle.ready -and `
      [string]$preWebLifecycle.mode.mode -eq 'PAUSE' -and `
      [string]$preWebLifecycle.accountMode.accountMode -eq 'LIVE' -and `
      [bool]$preWebLifecycle.accountMode.valid -and `
      [string]$preWebTask.State -eq 'Running' -and `
      [string]$preWebRuntimeGeneration.statusReadState -eq 'OK' -and `
      [string]$preWebRuntimeGeneration.heartbeatReadState -eq 'OK' -and `
      [bool]$preWebRuntimeGeneration.brokerStatusPidMatch -and `
      [bool]$preWebRuntimeGeneration.brokerProcessAlive -and `
      [bool]$preWebRuntimeGeneration.brokerHeartbeatFresh -and `
      [string]$preWebRuntimeGeneration.startupRunnerLockState -eq 'HELD' -and `
      $preWebRunningHeldCanonicalProcessIds.Count -eq 1 -and `
      $preWebRunningHeldInstanceCount -eq 1 -and `
      [int]$preWebRunningHeldCanonicalProcessIds[0] -eq [int]$preWebRuntimeGeneration.statusBrokerPid -and `
      [string]$preWebRunningHeldBrokerAttestation.component -eq 'lifecycle-broker' -and `
      [int]$preWebRunningHeldBrokerAttestation.pid -eq [int]$preWebRuntimeGeneration.statusBrokerPid -and `
      [bool]$preWebRunningHeldOwnership.owned -and `
      [bool]$preWebRunningHeldOwnership.canonical -and `
      -not [bool]$preWebRunningHeldOwnership.repairRequired -and `
      $preWebRunningHeldDrift.Count -eq 0 -and `
      (Test-Phase7CSystemTaskPrincipal $preWebTask.Principal)
    if (-not $preWebRunningHeldLockStillEligible) {
      throw "RUNNING+READY HELD-lock canonical broker tuple changed during safety recheck; lifecycle stop blocked."
    }

    Assert-PauseDisarmed -Stage "GENERATION_PRE_WEB_RUNNING_HELD_LOCK"
    Assert-BridgeSession -ExpectedSession $bridgeSessionId -Stage "GENERATION_PRE_WEB_RUNNING_HELD_LOCK"
    Assert-FlatBroker -Stage "GENERATION_PRE_WEB_RUNNING_HELD_LOCK"
    [void](Invoke-ApiPost "/api/v1/phase7c/lifecycle/stop" @{})
    Wait-LifecycleStopped
    Assert-LifecycleExecutorsStopped -Stage "GENERATION_PRE_WEB_RUNNING_HELD_LOCK_POST_STOP"
    Assert-PauseDisarmed -Stage "GENERATION_PRE_WEB_RUNNING_HELD_LOCK_POST_STOP"
    Assert-BridgeSession -ExpectedSession $bridgeSessionId -Stage "GENERATION_PRE_WEB_RUNNING_HELD_LOCK_POST_STOP"
    Assert-FlatBroker -Stage "GENERATION_PRE_WEB_RUNNING_HELD_LOCK_POST_STOP"
    Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_GENERATION_PRE_WEB_RUNNING_HELD_LOCK_LIFECYCLE_STOP=PASS"

    # Re-snapshot after quiesce. The stopped-lifecycle path below must independently
    # authorize the canonical Scheduled Task generation stop/restart.
    $preWebRuntimeGeneration = Get-Phase7CRuntimeGenerationSnapshot -WorkDir $WorkDir
    $preWebLifecycle = Invoke-ApiGet "/api/v1/phase7c/lifecycle"
    $preWebTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
  }

'@

$index = $matches[0].Index
$patched = $text.Substring(0, $index) + $insert + $text.Substring($index)
[System.IO.File]::WriteAllText($path, $patched, [System.Text.UTF8Encoding]::new($false))
Write-Host 'PATCH_PHASE7C_RUNNING_READY_HELD_LOCK_PREWEB=PASS'