$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$target = Join-Path $PSScriptRoot 'recover-phase7c-runtime-ready-stable-deploy-local.ps1'
if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {
  throw "Recovery helper missing: $target"
}

$source = Get-Content -LiteralPath $target -Raw
if (-not $source.Contains('function Get-Phase7CCanonicalTaskProcessIds')) {
  throw 'Expected initial released-lock GREEN implementation is missing.'
}

$oldEligibility = @'
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

  $preWebCanonicalProcessIds = @()
  $preWebRunningInstanceCount = -1
  $preWebExpectedLauncherSha256 = 'sha256:' + $trustedRunnerSha256.ToLowerInvariant()
  $preWebBrokerAttestationPath = Join-Path $WorkDir "phase7c-source-attestation\components\lifecycle-broker.json"
  $preWebBrokerAttestation = $null
  $preWebAttestedLauncherSha256 = ''
  $preWebReleasedOwnership = $null
  $preWebReleasedDrift = @('UNREAD')
  $preWebReleasedLockRepairEligible = $false
  $preWebReleasedLockCandidate = `
    $preWebLifecycleStopped -and `
    [string]$preWebTask.State -eq 'Running' -and `
    [string]$preWebRuntimeGeneration.statusReadState -eq 'OK' -and `
    [string]$preWebRuntimeGeneration.heartbeatReadState -eq 'OK' -and `
    [bool]$preWebRuntimeGeneration.brokerStatusPidMatch -and `
    [bool]$preWebRuntimeGeneration.brokerProcessAlive -and `
    [bool]$preWebRuntimeGeneration.brokerHeartbeatFresh -and `
    [string]$preWebRuntimeGeneration.startupRunnerLockState -in @('MISSING', 'RELEASED')

  if ($preWebReleasedLockCandidate) {
    try {
      $preWebCanonicalProcessIds = @(Get-Phase7CCanonicalTaskProcessIds -Task $preWebTask)
      $preWebRunningInstanceCount = Get-Phase7CRunningTaskInstanceCount -Name $TaskName
      $preWebBrokerAttestation = Read-JsonFile -Path $preWebBrokerAttestationPath -Label "Lifecycle broker source attestation before pre-Web generation reload"
      $preWebAttestedLauncherSha256 = ([string]$preWebBrokerAttestation.launcherSha256).Trim().ToLowerInvariant()
      $preWebReleasedOwnership = Test-Phase7CExecutorTaskActionOwnership `
        -Actions $preWebTask.Actions `
        -ExpectedRunnerPath $runnerPath `
        -ExpectedRunnerSha256 $trustedRunnerSha256
      $preWebReleasedDrift = @(Get-Phase7CExecutorTaskDrift -Task $preWebTask)
      $preWebReleasedLockRepairEligible = `
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
    } catch {
      $preWebReleasedLockRepairEligible = $false
    }
  }

  $preWebGenerationEligible = $preWebHealthyGenerationEligible -or $preWebReleasedLockRepairEligible
'@

if (-not $source.Contains($oldEligibility)) {
  throw 'Initial released-lock eligibility block not found for narrowing.'
}
$source = $source.Replace($oldEligibility, $newEligibility)

[System.IO.File]::WriteAllText($target, $source, [System.Text.UTF8Encoding]::new($false))
Write-Host 'PHASE7C_RELEASED_LOCK_RECOVERY_REFINEMENT=APPLIED'
