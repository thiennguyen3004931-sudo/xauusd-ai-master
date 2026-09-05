from pathlib import Path

path = Path("scripts/recover-phase7c-runtime-ready-stable-deploy-local.ps1")
text = path.read_text(encoding="utf-8")

function_anchor = "function Get-Phase7CBrokerPidFromHeartbeat {"
function_marker = "function Get-Phase7CCanonicalTaskProcessCount($Task) {"
if function_marker in text:
    raise SystemExit("canonical process-count helper already exists before patch")
if text.count(function_anchor) != 1:
    raise SystemExit(f"expected exactly one function anchor, got {text.count(function_anchor)}")

functions = r'''function Get-Phase7CCanonicalTaskProcessCount($Task) {
  try {
    $actions = @($Task.Actions)
    if ($actions.Count -ne 1) { return -1 }
    $tokens = @(ConvertFrom-Phase7CCommandLineTokens ([string]$actions[0].Arguments))
    if ($tokens.Count -ne 5 -or -not $tokens[3].Equals('-EncodedCommand', [System.StringComparison]::OrdinalIgnoreCase)) {
      return -1
    }
    $encodedToken = [string]$tokens[4]
    if ([string]::IsNullOrWhiteSpace($encodedToken)) { return -1 }
    $matches = @(
      Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction Stop |
        Where-Object {
          -not [string]::IsNullOrWhiteSpace([string]$_.CommandLine) -and
          ([string]$_.CommandLine).Contains($encodedToken)
        }
    )
    return [int]$matches.Count
  } catch {
    return -1
  }
}

function Get-Phase7CRunningTaskInstanceCount([string]$Name) {
  try {
    $service = New-Object -ComObject 'Schedule.Service'
    $service.Connect()
    $root = $service.GetFolder('\')
    $registered = $root.GetTask($Name)
    $instances = $registered.GetInstances(0)
    return [int]$instances.Count
  } catch {
    return -1
  }
}

'''
text = text.replace(function_anchor, functions + function_anchor, 1)

throw_line = '      throw "Canonical pre-Web source generation task restart did not produce a fresh new lifecycle broker. previousPid=$preWebBrokerPidBeforeStop currentPid=$preWebBrokerPid"'
if text.count(throw_line) != 1:
    raise SystemExit(f"expected exactly one unique pre-Web throw line, got {text.count(throw_line)}")
throw_index = text.index(throw_line)
start_marker = "    if (-not $preWebTaskRestarted) {"
start = text.rfind(start_marker, 0, throw_index)
if start < 0:
    raise SystemExit("could not locate enclosing pre-Web restart failure if block")
end_marker = "\n    }"
end = text.find(end_marker, throw_index)
if end < 0:
    raise SystemExit("could not locate closing brace for pre-Web restart failure if block")
end += len(end_marker)
old_block = text[start:end]
if throw_line not in old_block or old_block.count("\n") > 3:
    raise SystemExit("pre-Web failure block shape changed unexpectedly; refusing patch")

new_block = r'''    if (-not $preWebTaskRestarted) {
      $orphanQueuedTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
      $orphanRuntimeGeneration = Get-Phase7CRuntimeGenerationSnapshot -WorkDir $WorkDir
      $orphanCanonicalProcessCount = Get-Phase7CCanonicalTaskProcessCount -Task $orphanQueuedTask
      $orphanRunningInstanceCount = Get-Phase7CRunningTaskInstanceCount -Name $TaskName
      $orphanOwnership = Test-Phase7CExecutorTaskActionOwnership `
        -Actions $orphanQueuedTask.Actions `
        -ExpectedRunnerPath $runnerPath `
        -ExpectedRunnerSha256 $trustedRunnerSha256
      $orphanDrift = @(Get-Phase7CExecutorTaskDrift -Task $orphanQueuedTask)
      $orphanQueuedEligible = `
        [string]$orphanQueuedTask.State -eq 'Queued' -and `
        $orphanCanonicalProcessCount -eq 0 -and `
        $orphanRunningInstanceCount -eq 0 -and `
        [string]$orphanRuntimeGeneration.statusReadState -eq 'OK' -and `
        [string]$orphanRuntimeGeneration.heartbeatReadState -eq 'OK' -and `
        [bool]$orphanRuntimeGeneration.brokerStatusPidMatch -and `
        -not [bool]$orphanRuntimeGeneration.brokerProcessAlive -and `
        -not [bool]$orphanRuntimeGeneration.brokerHeartbeatFresh -and `
        [string]$orphanRuntimeGeneration.startupRunnerLockState -in @('MISSING', 'RELEASED') -and `
        [bool]$orphanOwnership.owned -and `
        [bool]$orphanOwnership.canonical -and `
        -not [bool]$orphanOwnership.repairRequired -and `
        $orphanDrift.Count -eq 0 -and `
        (Test-Phase7CSystemTaskPrincipal $orphanQueuedTask.Principal)

      if ($orphanQueuedEligible) {
        Assert-PauseDisarmed -Stage "GENERATION_PRE_WEB_ORPHAN_QUEUED"
        Assert-BridgeSession -ExpectedSession $bridgeSessionId -Stage "GENERATION_PRE_WEB_ORPHAN_QUEUED"
        Assert-FlatBroker -Stage "GENERATION_PRE_WEB_ORPHAN_QUEUED"

        # Re-sample the exact production tuple immediately before the only new
        # mutation. Any unreadable/changed evidence fails closed instead of clearing
        # an unproven Scheduler state.
        $orphanQueuedTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
        $orphanRuntimeGeneration = Get-Phase7CRuntimeGenerationSnapshot -WorkDir $WorkDir
        $orphanCanonicalProcessCount = Get-Phase7CCanonicalTaskProcessCount -Task $orphanQueuedTask
        $orphanRunningInstanceCount = Get-Phase7CRunningTaskInstanceCount -Name $TaskName
        $orphanOwnership = Test-Phase7CExecutorTaskActionOwnership `
          -Actions $orphanQueuedTask.Actions `
          -ExpectedRunnerPath $runnerPath `
          -ExpectedRunnerSha256 $trustedRunnerSha256
        $orphanDrift = @(Get-Phase7CExecutorTaskDrift -Task $orphanQueuedTask)
        $orphanStillEligible = `
          [string]$orphanQueuedTask.State -eq 'Queued' -and `
          $orphanCanonicalProcessCount -eq 0 -and `
          $orphanRunningInstanceCount -eq 0 -and `
          [string]$orphanRuntimeGeneration.statusReadState -eq 'OK' -and `
          [string]$orphanRuntimeGeneration.heartbeatReadState -eq 'OK' -and `
          [bool]$orphanRuntimeGeneration.brokerStatusPidMatch -and `
          -not [bool]$orphanRuntimeGeneration.brokerProcessAlive -and `
          -not [bool]$orphanRuntimeGeneration.brokerHeartbeatFresh -and `
          [string]$orphanRuntimeGeneration.startupRunnerLockState -in @('MISSING', 'RELEASED') -and `
          [bool]$orphanOwnership.owned -and `
          [bool]$orphanOwnership.canonical -and `
          -not [bool]$orphanOwnership.repairRequired -and `
          $orphanDrift.Count -eq 0 -and `
          (Test-Phase7CSystemTaskPrincipal $orphanQueuedTask.Principal)
        if (-not $orphanStillEligible) {
          throw "Canonical pre-Web orphan queue changed during safety recheck; bounded retry blocked."
        }

        Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_GENERATION_PRE_WEB_ORPHAN_QUEUED=ELIGIBLE"
        Stop-ScheduledTask -TaskName $TaskName -ErrorAction Stop
        $orphanClearDeadline = [DateTime]::UtcNow.AddSeconds([Math]::Min($TimeoutSeconds, 30))
        $orphanQueueCleared = $false
        do {
          Start-Sleep -Milliseconds 250
          $orphanAfterClear = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
          $orphanAfterClearGeneration = Get-Phase7CRuntimeGenerationSnapshot -WorkDir $WorkDir
          $orphanAfterClearProcessCount = Get-Phase7CCanonicalTaskProcessCount -Task $orphanAfterClear
          $orphanAfterClearInstanceCount = Get-Phase7CRunningTaskInstanceCount -Name $TaskName
          if (`
            [string]$orphanAfterClear.State -notin @('Running', 'Queued') -and `
            $orphanAfterClearProcessCount -eq 0 -and `
            $orphanAfterClearInstanceCount -eq 0 -and `
            -not [bool]$orphanAfterClearGeneration.brokerProcessAlive -and `
            [string]$orphanAfterClearGeneration.startupRunnerLockState -in @('MISSING', 'RELEASED')
          ) {
            $orphanQueueCleared = $true
            break
          }
        } while ([DateTime]::UtcNow -lt $orphanClearDeadline)
        if (-not $orphanQueueCleared) {
          throw "Canonical pre-Web orphan queued request did not clear safely. taskState=$($orphanAfterClear.State) canonicalProcesses=$orphanAfterClearProcessCount taskInstances=$orphanAfterClearInstanceCount lock=$($orphanAfterClearGeneration.startupRunnerLockState)"
        }
        Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_GENERATION_PRE_WEB_ORPHAN_QUEUED_CLEAR=PASS"

        $orphanRetryTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
        $orphanRetryOwnership = Test-Phase7CExecutorTaskActionOwnership `
          -Actions $orphanRetryTask.Actions `
          -ExpectedRunnerPath $runnerPath `
          -ExpectedRunnerSha256 $trustedRunnerSha256
        $orphanRetryDrift = @(Get-Phase7CExecutorTaskDrift -Task $orphanRetryTask)
        if (-not [bool]$orphanRetryOwnership.owned -or -not [bool]$orphanRetryOwnership.canonical -or [bool]$orphanRetryOwnership.repairRequired -or $orphanRetryDrift.Count -ne 0 -or -not (Test-Phase7CSystemTaskPrincipal $orphanRetryTask.Principal)) {
          throw "Canonical pre-Web orphan queue clear changed task definition; retry blocked."
        }
        Assert-PauseDisarmed -Stage "GENERATION_PRE_WEB_ORPHAN_QUEUED_PRE_RETRY"
        Assert-BridgeSession -ExpectedSession $bridgeSessionId -Stage "GENERATION_PRE_WEB_ORPHAN_QUEUED_PRE_RETRY"
        Assert-FlatBroker -Stage "GENERATION_PRE_WEB_ORPHAN_QUEUED_PRE_RETRY"

        Start-ScheduledTask -TaskName $TaskName -ErrorAction Stop
        Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_GENERATION_PRE_WEB_ORPHAN_QUEUED_RESTART_RETRY=ONCE"
        $orphanRetryDeadline = [DateTime]::UtcNow.AddSeconds([Math]::Min($TimeoutSeconds, 30))
        do {
          Start-Sleep -Milliseconds 250
          $preWebTaskAfterStart = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
          if ([string]$preWebTaskAfterStart.State -eq 'Running' -and (Test-Phase7CBrokerHeartbeatFresh)) {
            $preWebBrokerPid = Get-Phase7CBrokerPidFromHeartbeat
            if ($preWebBrokerPid -gt 0 -and $preWebBrokerPid -ne $preWebBrokerPidBeforeStop) {
              $preWebTaskRestarted = $true
              break
            }
          }
        } while ([DateTime]::UtcNow -lt $orphanRetryDeadline)
      }
    }
    if (-not $preWebTaskRestarted) {
      $failureTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
      $failureGeneration = Get-Phase7CRuntimeGenerationSnapshot -WorkDir $WorkDir
      $failureCanonicalProcessCount = if ($null -ne $failureTask) { Get-Phase7CCanonicalTaskProcessCount -Task $failureTask } else { -1 }
      $failureRunningInstanceCount = Get-Phase7CRunningTaskInstanceCount -Name $TaskName
      throw "Canonical pre-Web source generation task restart did not produce a fresh new lifecycle broker. previousPid=$preWebBrokerPidBeforeStop currentPid=$preWebBrokerPid taskState=$([string]$failureTask.State) canonicalProcesses=$failureCanonicalProcessCount taskInstances=$failureRunningInstanceCount brokerAlive=$($failureGeneration.brokerProcessAlive) heartbeatFresh=$($failureGeneration.brokerHeartbeatFresh) lock=$($failureGeneration.startupRunnerLockState)"
    }'''

text = text[:start] + new_block + text[end:]
path.write_text(text, encoding="utf-8", newline="\n")
print("PATCH_APPLIED=TRUE")
