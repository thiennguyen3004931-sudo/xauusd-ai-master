$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$path = Join-Path $PSScriptRoot 'scripts\recover-phase7c-runtime-ready-stable-deploy-local.ps1'
$text = Get-Content -LiteralPath $path -Raw

if ($text.Contains('$batteryHealthyBrokerStoppedLifecycleEligible =')) {
  Write-Host 'DEV_BATTERY_STOPPED_LIFECYCLE_PATCH=ALREADY_APPLIED'
  exit 0
}

$old = @'
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
'@

$new = @'
  $lockStateBeforeBatteryRepair = [string]$runtimeGenerationBeforeBatteryRepair.startupRunnerLockState
  $lockAbsentBeforeBatteryRepair = $lockStateBeforeBatteryRepair -in @('MISSING', 'RELEASED')
  $lockHeldBeforeBatteryRepair = $lockStateBeforeBatteryRepair -eq 'HELD'
  $batteryRuntimeUnavailable = `
    [string]$taskBeforeBatteryRepair.State -ne 'Running' -or `
    -not [bool]$runtimeGenerationBeforeBatteryRepair.brokerProcessAlive -or `
    -not [bool]$runtimeGenerationBeforeBatteryRepair.brokerHeartbeatFresh -or `
    $lockAbsentBeforeBatteryRepair

  $batteryLifecycleStoppedNoExecutors = `
    -not [bool]$lifecycleBeforeBatteryRepair.running -and `
    -not (Test-Phase7CLifecycleHasAliveProcess -State $lifecycleBeforeBatteryRepair)

  $batteryStrandedOutageEligible = `
    [string]$taskBeforeBatteryRepair.State -ne 'Running' -and `
    [string]$runtimeGenerationBeforeBatteryRepair.statusReadState -eq 'OK' -and `
    [string]$runtimeGenerationBeforeBatteryRepair.heartbeatReadState -eq 'OK' -and `
    [bool]$runtimeGenerationBeforeBatteryRepair.brokerStatusPidMatch -and `
    -not [bool]$runtimeGenerationBeforeBatteryRepair.brokerProcessAlive -and `
    -not [bool]$runtimeGenerationBeforeBatteryRepair.brokerHeartbeatFresh -and `
    $lockAbsentBeforeBatteryRepair -and `
    $batteryLifecycleStoppedNoExecutors

  $batteryHealthyBrokerStoppedLifecycleEligible = `
    [string]$taskBeforeBatteryRepair.State -eq 'Running' -and `
    [string]$runtimeGenerationBeforeBatteryRepair.statusReadState -eq 'OK' -and `
    [string]$runtimeGenerationBeforeBatteryRepair.heartbeatReadState -eq 'OK' -and `
    [bool]$runtimeGenerationBeforeBatteryRepair.brokerStatusPidMatch -and `
    [bool]$runtimeGenerationBeforeBatteryRepair.brokerProcessAlive -and `
    [bool]$runtimeGenerationBeforeBatteryRepair.brokerHeartbeatFresh -and `
    $lockHeldBeforeBatteryRepair -and `
    $batteryLifecycleStoppedNoExecutors

  $batteryPreWebRepairEligible = `
    $batteryStrandedOutageEligible -or `
    $batteryHealthyBrokerStoppedLifecycleEligible

  $batteryPreWebRepairRequired = `
    $batteryRuntimeUnavailable -or `
    -not [bool]$lifecycleBeforeBatteryRepair.running

  if ($batteryPreWebRepairRequired -and -not $batteryPreWebRepairEligible) {
    throw "Battery-settings task drift is paired with an unproven runtime/lifecycle state; pre-Web repair blocked. taskState=$($taskBeforeBatteryRepair.State) lifecycleRunning=$($lifecycleBeforeBatteryRepair.running) brokerAlive=$($runtimeGenerationBeforeBatteryRepair.brokerProcessAlive) heartbeatFresh=$($runtimeGenerationBeforeBatteryRepair.brokerHeartbeatFresh) lock=$lockStateBeforeBatteryRepair"
  }
'@

if (-not $text.Contains($old)) {
  throw 'Exact pre-Web battery eligibility block not found; refusing blind patch.'
}
$text = $text.Replace($old, $new)

$oldStop = @'
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
'@

$newStop = @'
    $brokerPidBeforeBatteryRepair = Get-Phase7CBrokerPidFromHeartbeat
    if ($batteryHealthyBrokerStoppedLifecycleEligible -and $brokerPidBeforeBatteryRepair -le 0) {
      throw "Healthy-broker battery repair could not capture the current broker PID before task stop."
    }

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
      throw "Battery Scheduled Task did not quiesce before canonical settings repair. state=$($taskAfterStop.State)"
    }

    $brokerProcessStopped = $brokerPidBeforeBatteryRepair -le 0
    $brokerStopDeadline = [DateTime]::UtcNow.AddSeconds([Math]::Min($TimeoutSeconds, 30))
    while (-not $brokerProcessStopped -and [DateTime]::UtcNow -lt $brokerStopDeadline) {
      if ($null -eq (Get-Process -Id $brokerPidBeforeBatteryRepair -ErrorAction SilentlyContinue)) {
        $brokerProcessStopped = $true
        break
      }
      Start-Sleep -Milliseconds 250
    }
    if (-not $brokerProcessStopped) {
      throw "Previous lifecycle broker process remained alive after battery Scheduled Task stop. pid=$brokerPidBeforeBatteryRepair"
    }
    Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_BATTERY_PRE_WEB_PREVIOUS_BROKER_EXIT=PASS|PREVIOUS_PID=$brokerPidBeforeBatteryRepair"

    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $TaskInstaller `
'@

if (-not $text.Contains($oldStop)) {
  throw 'Exact pre-Web battery task-stop block not found; refusing blind patch.'
}
$text = $text.Replace($oldStop, $newStop)

Set-Content -LiteralPath $path -Value $text -Encoding utf8
Write-Host 'DEV_BATTERY_STOPPED_LIFECYCLE_PATCH=APPLIED'
