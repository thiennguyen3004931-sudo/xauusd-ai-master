from pathlib import Path

path = Path("scripts/recover-phase7c-runtime-ready-stable-deploy-local.ps1")
text = path.read_text(encoding="utf-8")
marker = "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_GENERATION_PRE_WEB_RUNNING_HELD_LOCK=ELIGIBLE_QUIESCE_REQUIRED"
if marker in text:
    raise SystemExit("Held-lock source fix already present; refusing duplicate patch.")

needle = "  $preWebRunningReleasedLockObserved = `\n"
if text.count(needle) != 1:
    raise SystemExit(f"Expected exactly one released-lock observation insertion point, found {text.count(needle)}")

held_block = r'''  $preWebRunningHeldLockObserved = `
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
  $preWebRunningHeldAttestedLauncherSha256 = ''
  $preWebRunningHeldOwnership = $null
  $preWebRunningHeldDrift = @('UNREAD')
  $preWebRunningHeldLockReloadEligible = $false
  if ($preWebRunningHeldLockCandidate) {
    try {
      $preWebRunningHeldCanonicalProcessIds = @(Get-Phase7CCanonicalTaskProcessIds -Task $preWebTask)
      $preWebRunningHeldInstanceCount = Get-Phase7CRunningTaskInstanceCount -Name $TaskName
      $preWebRunningHeldBrokerAttestation = Read-JsonFile -Path $preWebBrokerAttestationPath -Label "Lifecycle broker source attestation before RUNNING+READY held-lock generation quiesce"
      $preWebRunningHeldAttestedLauncherSha256 = ([string]$preWebRunningHeldBrokerAttestation.launcherSha256).Trim().ToLowerInvariant()
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
        $preWebRunningHeldAttestedLauncherSha256 -eq $preWebExpectedLauncherSha256 -and `
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
      throw "RUNNING+READY lifecycle with HELD startup lock requires an exact canonical SYSTEM broker tuple before generation quiesce. taskState=$($preWebTask.State) brokerAlive=$($preWebRuntimeGeneration.brokerProcessAlive) heartbeatFresh=$($preWebRuntimeGeneration.brokerHeartbeatFresh) lock=$($preWebRuntimeGeneration.startupRunnerLockState) canonicalProcesses=$($preWebRunningHeldCanonicalProcessIds.Count) taskInstances=$preWebRunningHeldInstanceCount"
    }

    Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_GENERATION_PRE_WEB_RUNNING_HELD_LOCK=ELIGIBLE_QUIESCE_REQUIRED"
    Assert-PauseDisarmed -Stage "GENERATION_PRE_WEB_RUNNING_HELD_LOCK"
    Assert-BridgeSession -ExpectedSession $bridgeSessionId -Stage "GENERATION_PRE_WEB_RUNNING_HELD_LOCK"
    Assert-FlatBroker -Stage "GENERATION_PRE_WEB_RUNNING_HELD_LOCK"

    $preWebTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
    $preWebRuntimeGeneration = Get-Phase7CRuntimeGenerationSnapshot -WorkDir $WorkDir
    $preWebLifecycle = Invoke-ApiGet "/api/v1/phase7c/lifecycle"
    $preWebRunningHeldCanonicalProcessIds = @(Get-Phase7CCanonicalTaskProcessIds -Task $preWebTask)
    $preWebRunningHeldInstanceCount = Get-Phase7CRunningTaskInstanceCount -Name $TaskName
    $preWebRunningHeldBrokerAttestation = Read-JsonFile -Path $preWebBrokerAttestationPath -Label "Lifecycle broker source attestation during RUNNING+READY held-lock safety recheck"
    $preWebRunningHeldAttestedLauncherSha256 = ([string]$preWebRunningHeldBrokerAttestation.launcherSha256).Trim().ToLowerInvariant()
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
      $preWebRunningHeldAttestedLauncherSha256 -eq $preWebExpectedLauncherSha256 -and `
      [bool]$preWebRunningHeldOwnership.owned -and `
      [bool]$preWebRunningHeldOwnership.canonical -and `
      -not [bool]$preWebRunningHeldOwnership.repairRequired -and `
      $preWebRunningHeldDrift.Count -eq 0 -and `
      (Test-Phase7CSystemTaskPrincipal $preWebTask.Principal)
    if (-not $preWebRunningHeldLockStillEligible) {
      throw "RUNNING+READY held-lock canonical broker tuple changed during safety recheck; lifecycle stop blocked."
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

    $preWebRuntimeGeneration = Get-Phase7CRuntimeGenerationSnapshot -WorkDir $WorkDir
    $preWebLifecycle = Invoke-ApiGet "/api/v1/phase7c/lifecycle"
    $preWebTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
    $preWebLifecycleRunningReady = $false
  }

'''

path.write_text(text.replace(needle, held_block + needle), encoding="utf-8", newline="\n")
