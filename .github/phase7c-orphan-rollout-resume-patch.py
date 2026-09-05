from pathlib import Path

path = Path('scripts/rollout-phase7c-production-source-transition-local.ps1')
text = path.read_text(encoding='utf-8')

def replace_once(old: str, new: str, label: str):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one anchor, got {count}')
    text = text.replace(old, new, 1)

replace_once(
    "    [ValidateSet('ARMED','DISARMED')] [string]$ExpectedInitialArm = 'ARMED',\n    [int]$TimeoutSeconds = 180",
    "    [ValidateSet('ARMED','DISARMED')] [string]$ExpectedInitialArm = 'ARMED',\n    [ValidateSet('HEALTHY','ORPHAN_QUEUED')] [string]$ExpectedInitialRuntimeState = 'HEALTHY',\n    [int]$TimeoutSeconds = 180",
    'parameter insertion'
)

replace_once(
    "$HelperRepoPath = 'scripts/rollout-phase7c-production-source-transition-local.ps1'",
    "$HelperRepoPath = 'scripts/rollout-phase7c-production-source-transition-local.ps1'\n$RunnerRepoPath = 'scripts/run-phase7c-executor-task-runner-local.ps1'",
    'runner repo path'
)

replace_once(
    "$OwnershipLibrary = Join-Path $ScriptsRoot 'lib\\phase7c-scheduled-task-ownership.ps1'\n$RecoveryPath",
    "$OwnershipLibrary = Join-Path $ScriptsRoot 'lib\\phase7c-scheduled-task-ownership.ps1'\n$RuntimeOwnershipLibrary = Join-Path $ScriptsRoot 'lib\\phase7c-runtime-ownership-probe.ps1'\n$RecoveryPath",
    'runtime ownership library path'
)

replace_once(
    "foreach ($required in @($ConfigPath, $AccountLibrary, $OwnershipLibrary)) {\n    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw \"Required current-generation rollout dependency is missing: $required\" }\n}\n. $AccountLibrary\n. $OwnershipLibrary",
    "foreach ($required in @($ConfigPath, $AccountLibrary, $OwnershipLibrary, $RuntimeOwnershipLibrary)) {\n    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw \"Required current-generation rollout dependency is missing: $required\" }\n}\n. $AccountLibrary\n. $OwnershipLibrary\n. $RuntimeOwnershipLibrary",
    'runtime ownership library load'
)

function_anchor = "# Git/remote provenance and target-object staging happen before any LIVE runtime mutation."
if text.count(function_anchor) != 1:
    raise SystemExit('helper-function anchor missing or ambiguous')
functions = r'''function Get-Phase7CCanonicalTaskProcessCount($Task) {
    try {
        $actions = @($Task.Actions)
        if ($actions.Count -ne 1) { return -1 }
        $tokens = @(ConvertFrom-Phase7CCommandLineTokens ([string]$actions[0].Arguments))
        if ($tokens.Count -ne 5 -or -not $tokens[3].Equals('-EncodedCommand', [System.StringComparison]::OrdinalIgnoreCase)) { return -1 }
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
    } catch { return -1 }
}
function Get-Phase7CRunningTaskInstanceCount([string]$Name) {
    try {
        $service = New-Object -ComObject 'Schedule.Service'
        $service.Connect()
        $root = $service.GetFolder('\')
        $registered = $root.GetTask($Name)
        return [int]$registered.GetInstances(0).Count
    } catch { return -1 }
}
function Assert-LifecycleAlreadyStopped([string]$Stage) {
    $state = Invoke-ApiGet '/api/v1/phase7c/lifecycle'
    if ([bool]$state.running -or (Test-LifecycleHasAliveProcess -State $state)) {
        throw "$Stage ORPHAN_QUEUED lifecycle must already be stopped with no executor process alive."
    }
}
function Assert-CanonicalTaskDefinition($Task, [string]$Stage) {
    $runnerPath = Get-Phase7CExecutorTaskRunnerPath -ProjectRoot $ProjectRoot
    $runnerSha = Get-Phase7CTrustedGitFileSha256 -ProjectRoot $ProjectRoot -Path $runnerPath
    $ownership = Test-Phase7CExecutorTaskActionOwnership -Actions $Task.Actions -ExpectedRunnerPath $runnerPath -ExpectedRunnerSha256 $runnerSha
    $drift = @(Get-Phase7CExecutorTaskDrift -Task $Task)
    if (-not [bool]$ownership.owned -or -not [bool]$ownership.canonical -or [bool]$ownership.repairRequired -or $drift.Count -ne 0) {
        throw "$Stage Scheduled Task is not exact canonical. ownership=$($ownership.reason) drift=$($drift -join ',')"
    }
    if (-not (Test-SystemTaskPrincipal $Task.Principal)) { throw "$Stage Scheduled Task principal is not SYSTEM + ServiceAccount + Highest." }
}
function Assert-OrphanQueuedRuntimeState([string]$Stage) {
    Import-Module ScheduledTasks -ErrorAction Stop
    if ($ExpectedInitialArm -ne 'DISARMED') { throw 'ORPHAN_QUEUED requires initial DISARMED ARM state.' }
    Assert-LifecycleAlreadyStopped -Stage $Stage
    $orphanTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
    Assert-CanonicalTaskDefinition -Task $orphanTask -Stage $Stage
    $orphanCanonicalProcessCount = Get-Phase7CCanonicalTaskProcessCount -Task $orphanTask
    $orphanRunningInstanceCount = Get-Phase7CRunningTaskInstanceCount -Name $TaskName
    $orphanGeneration = Get-Phase7CRuntimeGenerationSnapshot -WorkDir $WorkDir
    $eligible = `
        [string]$orphanTask.State -eq 'Queued' -and `
        $orphanCanonicalProcessCount -eq 0 -and `
        $orphanRunningInstanceCount -eq 0 -and `
        [string]$orphanGeneration.statusReadState -eq 'OK' -and `
        [string]$orphanGeneration.heartbeatReadState -eq 'OK' -and `
        [bool]$orphanGeneration.brokerStatusPidMatch -and `
        -not [bool]$orphanGeneration.brokerProcessAlive -and `
        -not [bool]$orphanGeneration.brokerHeartbeatFresh -and `
        [string]$orphanGeneration.startupRunnerLockState -in @('MISSING','RELEASED')
    if (-not $eligible) {
        throw "$Stage ORPHAN_QUEUED state mismatch. taskState=$($orphanTask.State) canonicalProcesses=$orphanCanonicalProcessCount runningInstances=$orphanRunningInstanceCount brokerAlive=$($orphanGeneration.brokerProcessAlive) heartbeatFresh=$($orphanGeneration.brokerHeartbeatFresh) lock=$($orphanGeneration.startupRunnerLockState)"
    }
    return [pscustomobject]@{
        task = $orphanTask
        previousBrokerPid = [int]$orphanGeneration.heartbeatBrokerPid
    }
}
function Assert-RuntimeSourceDeploymentIdentity([string]$ExpectedCommit, [string]$ExpectedTree, [string]$Stage) {
    $snapshot = Invoke-ApiGet '/api/v1/phase7c/runtime-source-attestation'
    if ($null -eq $snapshot.deployment) { throw "$Stage runtime-source deployment is missing." }
    if ([string]$snapshot.deployment.sourceCommit -ne $ExpectedCommit -or [string]$snapshot.deployment.sourceTree -ne $ExpectedTree) {
        throw "$Stage runtime-source deployment identity mismatch. commit=$($snapshot.deployment.sourceCommit) tree=$($snapshot.deployment.sourceTree)"
    }
    $deploymentId = [string]$snapshot.deployment.deploymentId
    if ([string]::IsNullOrWhiteSpace($deploymentId)) { throw "$Stage runtime-source deploymentId is missing." }
    Write-Host "PHASE7C_PRODUCTION_SOURCE_TRANSITION_${Stage}_DEPLOYMENT_IDENTITY=PASS|DEPLOYMENT_ID=$deploymentId"
    return $deploymentId
}
function Clear-OrphanQueueAndBootBroker([int]$PreviousBrokerPid, [string]$ExpectedBridgeSession) {
    $orphanEvidence = Assert-OrphanQueuedRuntimeState -Stage 'ORPHAN_QUEUED_PRE_CLEAR'
    Assert-Pause -Stage 'ORPHAN_QUEUED_PRE_CLEAR'
    Assert-Arm -Expected 'DISARMED' -Stage 'ORPHAN_QUEUED_PRE_CLEAR'
    Assert-BridgeSession -ExpectedSession $ExpectedBridgeSession -Stage 'ORPHAN_QUEUED_PRE_CLEAR'
    Assert-FlatBroker -Stage 'ORPHAN_QUEUED_PRE_CLEAR'
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction Stop
    $clearDeadline = [DateTime]::UtcNow.AddSeconds([Math]::Min($TimeoutSeconds, 30))
    $cleared = $false
    do {
        Start-Sleep -Milliseconds 250
        $taskNow = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
        $processCount = Get-Phase7CCanonicalTaskProcessCount -Task $taskNow
        $instanceCount = Get-Phase7CRunningTaskInstanceCount -Name $TaskName
        $generationNow = Get-Phase7CRuntimeGenerationSnapshot -WorkDir $WorkDir
        if ([string]$taskNow.State -notin @('Running','Queued') -and $processCount -eq 0 -and $instanceCount -eq 0 -and -not [bool]$generationNow.brokerProcessAlive -and [string]$generationNow.startupRunnerLockState -in @('MISSING','RELEASED')) {
            $cleared = $true
            break
        }
    } while ([DateTime]::UtcNow -lt $clearDeadline)
    if (-not $cleared) { throw 'ORPHAN_QUEUED request did not clear to an inactive, process-free, released-lock state.' }
    Write-Host 'PHASE7C_PRODUCTION_SOURCE_TRANSITION_ORPHAN_QUEUED_CLEAR=PASS'

    $taskBeforeStart = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
    Assert-CanonicalTaskDefinition -Task $taskBeforeStart -Stage 'ORPHAN_QUEUED_PRE_BROKER_BOOT'
    Assert-Pause -Stage 'ORPHAN_QUEUED_PRE_BROKER_BOOT'
    Assert-Arm -Expected 'DISARMED' -Stage 'ORPHAN_QUEUED_PRE_BROKER_BOOT'
    Assert-BridgeSession -ExpectedSession $ExpectedBridgeSession -Stage 'ORPHAN_QUEUED_PRE_BROKER_BOOT'
    Assert-FlatBroker -Stage 'ORPHAN_QUEUED_PRE_BROKER_BOOT'
    Start-ScheduledTask -TaskName $TaskName -ErrorAction Stop
    $bootDeadline = [DateTime]::UtcNow.AddSeconds([Math]::Min($TimeoutSeconds, 60))
    $brokerPid = 0
    do {
        Start-Sleep -Milliseconds 250
        $taskNow = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
        $generationNow = Get-Phase7CRuntimeGenerationSnapshot -WorkDir $WorkDir
        $processCount = Get-Phase7CCanonicalTaskProcessCount -Task $taskNow
        $instanceCount = Get-Phase7CRunningTaskInstanceCount -Name $TaskName
        if ([string]$taskNow.State -eq 'Running' -and [bool]$generationNow.brokerProcessAlive -and [bool]$generationNow.brokerHeartbeatFresh -and [bool]$generationNow.brokerStatusPidMatch -and [string]$generationNow.startupRunnerLockState -eq 'HELD' -and $processCount -eq 1 -and $instanceCount -eq 1) {
            $brokerPid = [int]$generationNow.heartbeatBrokerPid
            if ($brokerPid -gt 0 -and $brokerPid -ne $PreviousBrokerPid) { break }
        }
        $brokerPid = 0
    } while ([DateTime]::UtcNow -lt $bootDeadline)
    if ($brokerPid -le 0) { throw "ORPHAN_QUEUED broker boot did not produce one fresh canonical task instance. previousPid=$PreviousBrokerPid" }
    Assert-CanonicalTask -Stage 'ORPHAN_QUEUED_POST_BROKER_BOOT'
    Assert-Pause -Stage 'ORPHAN_QUEUED_POST_BROKER_BOOT'
    Assert-Arm -Expected 'DISARMED' -Stage 'ORPHAN_QUEUED_POST_BROKER_BOOT'
    Assert-BridgeSession -ExpectedSession $ExpectedBridgeSession -Stage 'ORPHAN_QUEUED_POST_BROKER_BOOT'
    Assert-FlatBroker -Stage 'ORPHAN_QUEUED_POST_BROKER_BOOT'
    Write-Host "PHASE7C_PRODUCTION_SOURCE_TRANSITION_ORPHAN_QUEUED_BROKER_BOOT=PASS|BROKER_PID=$brokerPid"
}

'''
text = text.replace(function_anchor, functions + function_anchor, 1)

ancestry_anchor = "    & $gitExe merge-base --is-ancestor $TargetCommit $ExpectedRemoteMainCommit\n    if ($LASTEXITCODE -ne 0) { throw 'Target commit is not reachable from pinned remote main.' }"
if text.count(ancestry_anchor) != 1:
    raise SystemExit('ancestry anchor missing or ambiguous')
runner_guard = ancestry_anchor + r'''
    if ($ExpectedInitialRuntimeState -eq 'ORPHAN_QUEUED') {
        $currentRunnerBlob = ([string](& $gitExe rev-parse "$ExpectedCurrentCommit`:$RunnerRepoPath")).Trim().ToLowerInvariant()
        if ($LASTEXITCODE -ne 0 -or $currentRunnerBlob -notmatch '^[0-9a-f]{40}$') { throw 'ORPHAN_QUEUED could not resolve current runner blob.' }
        $targetRunnerBlob = ([string](& $gitExe rev-parse "$TargetCommit`:$RunnerRepoPath")).Trim().ToLowerInvariant()
        if ($LASTEXITCODE -ne 0 -or $targetRunnerBlob -notmatch '^[0-9a-f]{40}$') { throw 'ORPHAN_QUEUED could not resolve target runner blob.' }
        if ($currentRunnerBlob -ne $targetRunnerBlob) { throw "ORPHAN_QUEUED guarded runner blob must remain unchanged across source transition. current=$currentRunnerBlob target=$targetRunnerBlob" }
        Write-Host "PHASE7C_PRODUCTION_SOURCE_TRANSITION_ORPHAN_QUEUED_RUNNER_BLOB_UNCHANGED=PASS|BLOB=$currentRunnerBlob"
    }'''
text = text.replace(ancestry_anchor, runner_guard, 1)

preflight_old = r'''Assert-CanonicalTask -Stage 'PREFLIGHT'
Assert-Pause -Stage 'PREFLIGHT'
Assert-Arm -Expected $ExpectedInitialArm -Stage 'PREFLIGHT'
$healthBefore = Get-BridgeHealth
if (-not [bool]$healthBefore.connected -or [string]$healthBefore.status -ne 'ok' -or [string]$healthBefore.configuredAccountMode -ne 'LIVE' -or [string]$healthBefore.accountMode -ne 'real') {
    throw 'PREFLIGHT Bridge must be healthy LIVE/real.'
}
$bridgeSessionId = [string]$healthBefore.bridgeSessionId
if ([string]::IsNullOrWhiteSpace($bridgeSessionId)) { throw 'PREFLIGHT bridgeSessionId is missing.' }
Assert-BridgeSession -ExpectedSession $bridgeSessionId -Stage 'PREFLIGHT'
Assert-FlatBroker -Stage 'PREFLIGHT'
Wait-LifecycleReadyStable -Stage 'PREFLIGHT'
$oldDeploymentId = Assert-RuntimeSourceExact -ExpectedCommit $ExpectedCurrentCommit -ExpectedTree $currentTree -Stage 'PREFLIGHT'
Write-Host "PHASE7C_PRODUCTION_SOURCE_TRANSITION_PREVIOUS_DEPLOYMENT_ID=$oldDeploymentId"
Write-Host 'PHASE7C_PRODUCTION_SOURCE_TRANSITION_PREFLIGHT_MODE=PAUSE'
Write-Host "PHASE7C_PRODUCTION_SOURCE_TRANSITION_PREFLIGHT_ARM=$ExpectedInitialArm"
Write-Host 'PHASE7C_PRODUCTION_SOURCE_TRANSITION_ORDER_MUTATION=NONE'
Write-Host 'PHASE7C_PRODUCTION_SOURCE_TRANSITION_POSITION_MUTATION=NONE'
Write-Host 'PHASE7C_PRODUCTION_SOURCE_TRANSITION_LIVE_TEST_ORDER=NONE' '''.rstrip()
if text.count(preflight_old) != 1:
    raise SystemExit(f'preflight block count={text.count(preflight_old)}')
preflight_new = r'''Assert-Pause -Stage 'PREFLIGHT'
Assert-Arm -Expected $ExpectedInitialArm -Stage 'PREFLIGHT'
$healthBefore = Get-BridgeHealth
if (-not [bool]$healthBefore.connected -or [string]$healthBefore.status -ne 'ok' -or [string]$healthBefore.configuredAccountMode -ne 'LIVE' -or [string]$healthBefore.accountMode -ne 'real') {
    throw 'PREFLIGHT Bridge must be healthy LIVE/real.'
}
$bridgeSessionId = [string]$healthBefore.bridgeSessionId
if ([string]::IsNullOrWhiteSpace($bridgeSessionId)) { throw 'PREFLIGHT bridgeSessionId is missing.' }
Assert-BridgeSession -ExpectedSession $bridgeSessionId -Stage 'PREFLIGHT'
Assert-FlatBroker -Stage 'PREFLIGHT'
$orphanPreviousBrokerPid = 0
if ($ExpectedInitialRuntimeState -eq 'HEALTHY') {
    Assert-CanonicalTask -Stage 'PREFLIGHT'
    Wait-LifecycleReadyStable -Stage 'PREFLIGHT'
    $oldDeploymentId = Assert-RuntimeSourceExact -ExpectedCommit $ExpectedCurrentCommit -ExpectedTree $currentTree -Stage 'PREFLIGHT'
    Write-Host 'PHASE7C_PRODUCTION_SOURCE_TRANSITION_PREFLIGHT_RUNTIME_STATE=HEALTHY'
} elseif ($ExpectedInitialRuntimeState -eq 'ORPHAN_QUEUED') {
    $orphanEvidence = Assert-OrphanQueuedRuntimeState -Stage 'PREFLIGHT'
    $orphanPreviousBrokerPid = [int]$orphanEvidence.previousBrokerPid
    $oldDeploymentId = Assert-RuntimeSourceDeploymentIdentity -ExpectedCommit $ExpectedCurrentCommit -ExpectedTree $currentTree -Stage 'PREFLIGHT'
    Write-Host 'PHASE7C_PRODUCTION_SOURCE_TRANSITION_PREFLIGHT_RUNTIME_STATE=ORPHAN_QUEUED'
}
Write-Host "PHASE7C_PRODUCTION_SOURCE_TRANSITION_PREVIOUS_DEPLOYMENT_ID=$oldDeploymentId"
Write-Host 'PHASE7C_PRODUCTION_SOURCE_TRANSITION_PREFLIGHT_MODE=PAUSE'
Write-Host "PHASE7C_PRODUCTION_SOURCE_TRANSITION_PREFLIGHT_ARM=$ExpectedInitialArm"
Write-Host 'PHASE7C_PRODUCTION_SOURCE_TRANSITION_ORDER_MUTATION=NONE'
Write-Host 'PHASE7C_PRODUCTION_SOURCE_TRANSITION_POSITION_MUTATION=NONE'
Write-Host 'PHASE7C_PRODUCTION_SOURCE_TRANSITION_LIVE_TEST_ORDER=NONE' '''.rstrip()
text = text.replace(preflight_old, preflight_new, 1)

lifecycle_old = r'''    Assert-Arm -Expected 'DISARMED' -Stage 'POST_DISARM'
    Assert-Pause -Stage 'POST_DISARM'
    Assert-BridgeSession -ExpectedSession $bridgeSessionId -Stage 'POST_DISARM'
    Assert-FlatBroker -Stage 'POST_DISARM'

    [void](Invoke-ApiPost '/api/v1/phase7c/lifecycle/stop' @{})
    Wait-LifecycleStopped
    Assert-Pause -Stage 'POST_LIFECYCLE_STOP'
    Assert-Arm -Expected 'DISARMED' -Stage 'POST_LIFECYCLE_STOP'
    Assert-BridgeSession -ExpectedSession $bridgeSessionId -Stage 'POST_LIFECYCLE_STOP'
    Assert-FlatBroker -Stage 'POST_LIFECYCLE_STOP'
    Assert-CanonicalTask -Stage 'POST_LIFECYCLE_STOP'
    Write-Host 'PHASE7C_PRODUCTION_SOURCE_TRANSITION_LIFECYCLE_STOP=PASS' '''.rstrip()
if text.count(lifecycle_old) != 1:
    raise SystemExit(f'lifecycle block count={text.count(lifecycle_old)}')
lifecycle_new = r'''    Assert-Arm -Expected 'DISARMED' -Stage 'POST_DISARM'
    Assert-Pause -Stage 'POST_DISARM'
    Assert-BridgeSession -ExpectedSession $bridgeSessionId -Stage 'POST_DISARM'
    Assert-FlatBroker -Stage 'POST_DISARM'

    if ($ExpectedInitialRuntimeState -eq 'HEALTHY') {
        [void](Invoke-ApiPost '/api/v1/phase7c/lifecycle/stop' @{})
        Wait-LifecycleStopped
        Assert-Pause -Stage 'POST_LIFECYCLE_STOP'
        Assert-Arm -Expected 'DISARMED' -Stage 'POST_LIFECYCLE_STOP'
        Assert-BridgeSession -ExpectedSession $bridgeSessionId -Stage 'POST_LIFECYCLE_STOP'
        Assert-FlatBroker -Stage 'POST_LIFECYCLE_STOP'
        Assert-CanonicalTask -Stage 'POST_LIFECYCLE_STOP'
        Write-Host 'PHASE7C_PRODUCTION_SOURCE_TRANSITION_LIFECYCLE_STOP=PASS'
    } elseif ($ExpectedInitialRuntimeState -eq 'ORPHAN_QUEUED') {
        [void](Assert-OrphanQueuedRuntimeState -Stage 'POST_DISARM')
        Write-Host 'PHASE7C_PRODUCTION_SOURCE_TRANSITION_LIFECYCLE_STOP=SKIPPED_ALREADY_STOPPED'
    }'''
text = text.replace(lifecycle_old, lifecycle_new, 1)

fast_forward_marker = '    Write-Host "PHASE7C_PRODUCTION_SOURCE_TRANSITION_GIT_FAST_FORWARD=PASS|HEAD=$TargetCommit"'
if text.count(fast_forward_marker) != 1:
    raise SystemExit('fast-forward marker missing or ambiguous')
post_ff = fast_forward_marker + r'''

    if ($ExpectedInitialRuntimeState -eq 'ORPHAN_QUEUED') {
        [void](Assert-OrphanQueuedRuntimeState -Stage 'POST_FAST_FORWARD')
        Clear-OrphanQueueAndBootBroker -PreviousBrokerPid $orphanPreviousBrokerPid -ExpectedBridgeSession $bridgeSessionId
    }'''
text = text.replace(fast_forward_marker, post_ff, 1)

path.write_text(text, encoding='utf-8', newline='\n')
print('PATCH_APPLIED=TRUE')
