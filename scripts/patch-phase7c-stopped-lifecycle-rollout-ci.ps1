param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$HelperPath = Join-Path $PSScriptRoot 'rollout-phase7c-production-source-transition-local.ps1'
if (-not (Test-Path -LiteralPath $HelperPath -PathType Leaf)) { throw "Helper missing: $HelperPath" }

$source = Get-Content -LiteralPath $HelperPath -Raw
if ($source -match "ValidateSet\('HEALTHY','ORPHAN_QUEUED','STOPPED_LIFECYCLE'\)") {
    Write-Host 'PHASE7C_STOPPED_LIFECYCLE_SELF_PATCH=ALREADY_APPLIED'
    exit 0
}

function Replace-Exact([string]$Text, [string]$Old, [string]$New, [string]$Label) {
    $first = $Text.IndexOf($Old, [System.StringComparison]::Ordinal)
    if ($first -lt 0) { throw "Self-patch needle missing: $Label" }
    $second = $Text.IndexOf($Old, $first + $Old.Length, [System.StringComparison]::Ordinal)
    if ($second -ge 0) { throw "Self-patch needle is ambiguous: $Label" }
    return $Text.Substring(0, $first) + $New + $Text.Substring($first + $Old.Length)
}

$source = Replace-Exact $source `
    "    [ValidateSet('HEALTHY','ORPHAN_QUEUED')] [string]`$ExpectedInitialRuntimeState = 'HEALTHY'," `
    "    [ValidateSet('HEALTHY','ORPHAN_QUEUED','STOPPED_LIFECYCLE')] [string]`$ExpectedInitialRuntimeState = 'HEALTHY'," `
    'runtime-state ValidateSet'

$source = Replace-Exact $source `
    "`$RunnerRepoPath = 'scripts/run-phase7c-executor-task-runner-local.ps1'`r`n`$ExpectedOriginUrls = @(" `
    "`$RunnerRepoPath = 'scripts/run-phase7c-executor-task-runner-local.ps1'`r`n`$StoppedLifecycleMismatchComponents = @('api','web','supervisor','trend','sideway','telegram','regime-notifier')`r`n`$ExpectedGenerationMismatchReasons = @('SOURCE_COMMIT_MISMATCH','SOURCE_TREE_MISMATCH','DEPLOYMENT_ID_MISMATCH')`r`n`$ExpectedOriginUrls = @(" `
    'stopped lifecycle constants'

$functions = @'
function Get-AttestationComponent($Snapshot, [string]$Name) {
    return @($Snapshot.components | Where-Object { [string]$_.component -eq $Name }) | Select-Object -First 1
}
function Assert-StoppedLifecycleAttestationShape($Snapshot, [string]$ExpectedCommit, [string]$ExpectedDeploymentId, [string]$Stage) {
    $components = @($Snapshot.components)
    if ($components.Count -ne 8) { throw "$Stage STOPPED_LIFECYCLE requires exactly 8 runtime-source components. actual=$($components.Count)" }

    $brokerComponent = Get-AttestationComponent -Snapshot $Snapshot -Name 'lifecycle-broker'
    if ($null -eq $brokerComponent -or [string]$brokerComponent.verdict -ne 'EXACT_MATCH') {
        throw "$Stage STOPPED_LIFECYCLE requires lifecycle-broker EXACT_MATCH."
    }
    if ([string]$brokerComponent.sourceCommit -ne $ExpectedCommit -or [string]$brokerComponent.deploymentId -ne $ExpectedDeploymentId) {
        throw "$Stage STOPPED_LIFECYCLE lifecycle-broker deployment identity mismatch. commit=$($brokerComponent.sourceCommit) deployment=$($brokerComponent.deploymentId)"
    }

    $oldCommits = @()
    $oldDeployments = @()
    foreach ($name in $StoppedLifecycleMismatchComponents) {
        $component = Get-AttestationComponent -Snapshot $Snapshot -Name $name
        if ($null -eq $component -or [string]$component.verdict -ne 'MISMATCH') {
            throw "$Stage STOPPED_LIFECYCLE requires generation MISMATCH for $name. actual=$([string]$component.verdict)"
        }
        $reasons = @($component.reasonCodes | ForEach-Object { [string]$_ })
        foreach ($requiredReason in $ExpectedGenerationMismatchReasons) {
            if ($requiredReason -notin $reasons) {
                throw "$Stage STOPPED_LIFECYCLE $name mismatch is missing $requiredReason. reasons=$($reasons -join ',')"
            }
        }
        $unexpectedReasons = @($reasons | Where-Object { $_ -notin $ExpectedGenerationMismatchReasons })
        if ($unexpectedReasons.Count -ne 0) {
            throw "$Stage STOPPED_LIFECYCLE refuses non-generation mismatch for $name. unexpected=$($unexpectedReasons -join ',')"
        }
        if ([string]::IsNullOrWhiteSpace([string]$component.sourceCommit) -or [string]::IsNullOrWhiteSpace([string]$component.deploymentId)) {
            throw "$Stage STOPPED_LIFECYCLE requires complete previous generation identity for $name."
        }
        $oldCommits += [string]$component.sourceCommit
        $oldDeployments += [string]$component.deploymentId
    }
    $uniqueOldCommits = @($oldCommits | Sort-Object -Unique)
    $uniqueOldDeployments = @($oldDeployments | Sort-Object -Unique)
    if ($uniqueOldCommits.Count -ne 1 -or $uniqueOldDeployments.Count -ne 1) {
        throw "$Stage STOPPED_LIFECYCLE requires all seven non-broker components on one previous generation."
    }
    if ($uniqueOldCommits[0] -eq $ExpectedCommit -or $uniqueOldDeployments[0] -eq $ExpectedDeploymentId) {
        throw "$Stage STOPPED_LIFECYCLE previous generation must differ from the accepted lifecycle-broker generation."
    }
    Write-Host "PHASE7C_PRODUCTION_SOURCE_TRANSITION_${Stage}_STOPPED_LIFECYCLE_ATTESTATION=PASS|PREVIOUS_COMMIT=$($uniqueOldCommits[0])|PREVIOUS_DEPLOYMENT_ID=$($uniqueOldDeployments[0])"
    return [pscustomobject]@{ previousCommit = $uniqueOldCommits[0]; previousDeploymentId = $uniqueOldDeployments[0] }
}
function Assert-StoppedLifecycleRuntimeState([string]$ExpectedCommit, [string]$ExpectedTree, [string]$Stage) {
    Import-Module ScheduledTasks -ErrorAction Stop
    if ($ExpectedInitialArm -ne 'DISARMED') { throw 'STOPPED_LIFECYCLE requires initial DISARMED ARM state.' }

    $lifecycle = Invoke-ApiGet '/api/v1/phase7c/lifecycle'
    if ([bool]$lifecycle.running -or (Test-LifecycleHasAliveProcess -State $lifecycle)) {
        throw "$Stage STOPPED_LIFECYCLE lifecycle must already be stopped with no executor process alive."
    }
    if (-not [bool]$lifecycle.broker.ready -or $null -eq $lifecycle.broker.heartbeat) {
        throw "$Stage STOPPED_LIFECYCLE requires a ready lifecycle broker with heartbeat evidence."
    }
    if ([string]$lifecycle.broker.heartbeat.state -ne 'IDLE' -or [string]$lifecycle.broker.heartbeat.desiredExecutorState -ne 'STOPPED') {
        throw "$Stage STOPPED_LIFECYCLE broker must be IDLE with desiredExecutorState=STOPPED. state=$($lifecycle.broker.heartbeat.state) desired=$($lifecycle.broker.heartbeat.desiredExecutorState)"
    }
    if ([string]$lifecycle.mode.mode -ne 'PAUSE' -or [string]$lifecycle.accountMode.accountMode -ne 'LIVE' -or -not [bool]$lifecycle.accountMode.valid) {
        throw "$Stage STOPPED_LIFECYCLE requires PAUSE + valid LIVE account state."
    }

    $stoppedTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
    Assert-CanonicalTaskDefinition -Task $stoppedTask -Stage $Stage
    $stoppedCanonicalProcessCount = Get-Phase7CCanonicalTaskProcessCount -Task $stoppedTask
    $stoppedRunningInstanceCount = Get-Phase7CRunningTaskInstanceCount -Name $TaskName
    $stoppedGeneration = Get-Phase7CRuntimeGenerationSnapshot -WorkDir $WorkDir
    $lifecycleBrokerPid = [int]$lifecycle.broker.heartbeat.brokerPid
    $eligible = `
        [string]$stoppedTask.State -eq 'Running' -and `
        $stoppedCanonicalProcessCount -eq 1 -and `
        $stoppedRunningInstanceCount -eq 1 -and `
        [string]$stoppedGeneration.statusReadState -eq 'OK' -and `
        [string]$stoppedGeneration.heartbeatReadState -eq 'OK' -and `
        [bool]$stoppedGeneration.brokerStatusPidMatch -and `
        [bool]$stoppedGeneration.brokerProcessAlive -and `
        [bool]$stoppedGeneration.brokerHeartbeatFresh -and `
        [string]$stoppedGeneration.startupRunnerLockState -eq 'HELD' -and `
        $lifecycleBrokerPid -gt 0 -and `
        $lifecycleBrokerPid -eq [int]$stoppedGeneration.heartbeatBrokerPid
    if (-not $eligible) {
        throw "$Stage STOPPED_LIFECYCLE state mismatch. taskState=$($stoppedTask.State) canonicalProcesses=$stoppedCanonicalProcessCount runningInstances=$stoppedRunningInstanceCount brokerAlive=$($stoppedGeneration.brokerProcessAlive) heartbeatFresh=$($stoppedGeneration.brokerHeartbeatFresh) lock=$($stoppedGeneration.startupRunnerLockState) lifecycleBrokerPid=$lifecycleBrokerPid generationBrokerPid=$($stoppedGeneration.heartbeatBrokerPid)"
    }

    $snapshot = Invoke-ApiGet '/api/v1/phase7c/runtime-source-attestation'
    if ($null -eq $snapshot.deployment) { throw "$Stage STOPPED_LIFECYCLE runtime-source deployment is missing." }
    if ([string]$snapshot.deployment.sourceCommit -ne $ExpectedCommit -or [string]$snapshot.deployment.sourceTree -ne $ExpectedTree) {
        throw "$Stage STOPPED_LIFECYCLE deployment identity mismatch. commit=$($snapshot.deployment.sourceCommit) tree=$($snapshot.deployment.sourceTree)"
    }
    $deploymentId = [string]$snapshot.deployment.deploymentId
    if ([string]::IsNullOrWhiteSpace($deploymentId)) { throw "$Stage STOPPED_LIFECYCLE deploymentId is missing." }
    $attestationEvidence = Assert-StoppedLifecycleAttestationShape -Snapshot $snapshot -ExpectedCommit $ExpectedCommit -ExpectedDeploymentId $deploymentId -Stage $Stage
    Write-Host "PHASE7C_PRODUCTION_SOURCE_TRANSITION_${Stage}_STOPPED_LIFECYCLE=PASS|BROKER_PID=$lifecycleBrokerPid|DEPLOYMENT_ID=$deploymentId"
    return [pscustomobject]@{
        deploymentId = $deploymentId
        brokerPid = $lifecycleBrokerPid
        previousCommit = [string]$attestationEvidence.previousCommit
        previousDeploymentId = [string]$attestationEvidence.previousDeploymentId
    }
}
'@
$source = Replace-Exact $source `
    "function Assert-RuntimeSourceDeploymentIdentity([string]`$ExpectedCommit, [string]`$ExpectedTree, [string]`$Stage) {" `
    ($functions + "`r`nfunction Assert-RuntimeSourceDeploymentIdentity([string]`$ExpectedCommit, [string]`$ExpectedTree, [string]`$Stage) {") `
    'stopped lifecycle proof functions'

$orphanRunnerBlock = @'
    if ($ExpectedInitialRuntimeState -eq 'ORPHAN_QUEUED') {
        $currentRunnerBlob = ([string](& $gitExe rev-parse "$ExpectedCurrentCommit`:$RunnerRepoPath")).Trim().ToLowerInvariant()
        if ($LASTEXITCODE -ne 0 -or $currentRunnerBlob -notmatch '^[0-9a-f]{40}$') { throw 'ORPHAN_QUEUED could not resolve current runner blob.' }
        $targetRunnerBlob = ([string](& $gitExe rev-parse "$TargetCommit`:$RunnerRepoPath")).Trim().ToLowerInvariant()
        if ($LASTEXITCODE -ne 0 -or $targetRunnerBlob -notmatch '^[0-9a-f]{40}$') { throw 'ORPHAN_QUEUED could not resolve target runner blob.' }
        if ($currentRunnerBlob -ne $targetRunnerBlob) { throw "ORPHAN_QUEUED guarded runner blob must remain unchanged across source transition. current=$currentRunnerBlob target=$targetRunnerBlob" }
        Write-Host "PHASE7C_PRODUCTION_SOURCE_TRANSITION_ORPHAN_QUEUED_RUNNER_BLOB_UNCHANGED=PASS|BLOB=$currentRunnerBlob"
    }
'@
$expandedRunnerBlock = $orphanRunnerBlock + @'
    elseif ($ExpectedInitialRuntimeState -eq 'STOPPED_LIFECYCLE') {
        $currentRunnerBlob = ([string](& $gitExe rev-parse "$ExpectedCurrentCommit`:$RunnerRepoPath")).Trim().ToLowerInvariant()
        if ($LASTEXITCODE -ne 0 -or $currentRunnerBlob -notmatch '^[0-9a-f]{40}$') { throw 'STOPPED_LIFECYCLE could not resolve current runner blob.' }
        $targetRunnerBlob = ([string](& $gitExe rev-parse "$TargetCommit`:$RunnerRepoPath")).Trim().ToLowerInvariant()
        if ($LASTEXITCODE -ne 0 -or $targetRunnerBlob -notmatch '^[0-9a-f]{40}$') { throw 'STOPPED_LIFECYCLE could not resolve target runner blob.' }
        if ($currentRunnerBlob -ne $targetRunnerBlob) { throw "STOPPED_LIFECYCLE guarded runner blob must remain unchanged across source transition. current=$currentRunnerBlob target=$targetRunnerBlob" }
        Write-Host "PHASE7C_PRODUCTION_SOURCE_TRANSITION_STOPPED_LIFECYCLE_RUNNER_BLOB_UNCHANGED=PASS|BLOB=$currentRunnerBlob"
    }
'@
$source = Replace-Exact $source $orphanRunnerBlock $expandedRunnerBlock 'runner blob guard expansion'

$preflightOld = @'
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
'@
$preflightNew = @'
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
} elseif ($ExpectedInitialRuntimeState -eq 'STOPPED_LIFECYCLE') {
    $stoppedEvidence = Assert-StoppedLifecycleRuntimeState -ExpectedCommit $ExpectedCurrentCommit -ExpectedTree $currentTree -Stage 'PREFLIGHT'
    $oldDeploymentId = [string]$stoppedEvidence.deploymentId
    Write-Host 'PHASE7C_PRODUCTION_SOURCE_TRANSITION_PREFLIGHT_RUNTIME_STATE=STOPPED_LIFECYCLE'
}
'@
$source = Replace-Exact $source $preflightOld $preflightNew 'preflight runtime state expansion'

$lifecycleOld = @'
    } elseif ($ExpectedInitialRuntimeState -eq 'ORPHAN_QUEUED') {
        [void](Assert-OrphanQueuedRuntimeState -Stage 'POST_DISARM')
        Write-Host 'PHASE7C_PRODUCTION_SOURCE_TRANSITION_LIFECYCLE_STOP=SKIPPED_ALREADY_STOPPED'
    }
'@
$lifecycleNew = @'
    } elseif ($ExpectedInitialRuntimeState -eq 'ORPHAN_QUEUED') {
        [void](Assert-OrphanQueuedRuntimeState -Stage 'POST_DISARM')
        Write-Host 'PHASE7C_PRODUCTION_SOURCE_TRANSITION_LIFECYCLE_STOP=SKIPPED_ALREADY_STOPPED'
    } elseif ($ExpectedInitialRuntimeState -eq 'STOPPED_LIFECYCLE') {
        [void](Assert-StoppedLifecycleRuntimeState -ExpectedCommit $ExpectedCurrentCommit -ExpectedTree $currentTree -Stage 'POST_DISARM')
        Write-Host 'PHASE7C_PRODUCTION_SOURCE_TRANSITION_STOPPED_LIFECYCLE_LIFECYCLE_STOP=SKIPPED_ALREADY_STOPPED'
    }
'@
$source = Replace-Exact $source $lifecycleOld $lifecycleNew 'lifecycle stop expansion'

$postFastForwardOld = @'
    if ($ExpectedInitialRuntimeState -eq 'ORPHAN_QUEUED') {
        [void](Assert-OrphanQueuedRuntimeState -Stage 'POST_FAST_FORWARD')
        Clear-OrphanQueueAndBootBroker -PreviousBrokerPid $orphanPreviousBrokerPid -ExpectedBridgeSession $bridgeSessionId
    }
'@
$postFastForwardNew = @'
    if ($ExpectedInitialRuntimeState -eq 'ORPHAN_QUEUED') {
        [void](Assert-OrphanQueuedRuntimeState -Stage 'POST_FAST_FORWARD')
        Clear-OrphanQueueAndBootBroker -PreviousBrokerPid $orphanPreviousBrokerPid -ExpectedBridgeSession $bridgeSessionId
    } elseif ($ExpectedInitialRuntimeState -eq 'STOPPED_LIFECYCLE') {
        [void](Assert-StoppedLifecycleRuntimeState -ExpectedCommit $ExpectedCurrentCommit -ExpectedTree $currentTree -Stage 'POST_FAST_FORWARD')
        Assert-Pause -Stage 'STOPPED_LIFECYCLE_POST_FAST_FORWARD'
        Assert-Arm -Expected 'DISARMED' -Stage 'STOPPED_LIFECYCLE_POST_FAST_FORWARD'
        Assert-BridgeSession -ExpectedSession $bridgeSessionId -Stage 'STOPPED_LIFECYCLE_POST_FAST_FORWARD'
        Assert-FlatBroker -Stage 'STOPPED_LIFECYCLE_POST_FAST_FORWARD'
        Write-Host 'PHASE7C_PRODUCTION_SOURCE_TRANSITION_STOPPED_LIFECYCLE_POST_FAST_FORWARD=PASS'
    }
'@
$source = Replace-Exact $source $postFastForwardOld $postFastForwardNew 'post-fast-forward stopped lifecycle reproof'

Set-Content -LiteralPath $HelperPath -Value $source -Encoding UTF8
Write-Host 'PHASE7C_STOPPED_LIFECYCLE_SELF_PATCH=APPLIED'
