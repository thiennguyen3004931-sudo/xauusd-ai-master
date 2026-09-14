[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$TaskName,

    [Parameter(Mandatory = $false)]
    [ValidateNotNullOrEmpty()]
    [string]$TaskPath = "\",

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$OwnedTaskMarker,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$ExpectedDescription,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$RunnerPath,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[A-Fa-f0-9]{64}$')]
    [string]$ExpectedEmbeddedRunnerSha256,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[A-Fa-f0-9]{64}$')]
    [string]$ExpectedRunnerSha256
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ownershipLibrary = Join-Path $PSScriptRoot "lib\phase7c-scheduled-task-ownership.ps1"
if (-not (Test-Path -LiteralPath $ownershipLibrary)) {
    throw "OWNERSHIP_LIBRARY_NOT_FOUND path=$ownershipLibrary"
}
. $ownershipLibrary

$resolvedRunnerPath = (Resolve-Path -LiteralPath $RunnerPath -ErrorAction Stop).Path
$expectedEmbeddedSha = $ExpectedEmbeddedRunnerSha256.Trim().ToUpperInvariant()
$expectedSha = $ExpectedRunnerSha256.Trim().ToUpperInvariant()
$actualRunnerSha256 = (Get-FileHash -LiteralPath $resolvedRunnerPath -Algorithm SHA256 -ErrorAction Stop).Hash.ToUpperInvariant()
if ($actualRunnerSha256 -ne $expectedSha) {
    throw "RUNNER_ACTUAL_SHA_MISMATCH expected=$expectedSha actual=$actualRunnerSha256"
}

$pre = Get-Phase7CScheduledTaskOwnershipVerdict `
    -TaskName $TaskName `
    -TaskPath $TaskPath `
    -OwnedTaskMarker $OwnedTaskMarker `
    -ExpectedDescription $ExpectedDescription `
    -ExpectedRunnerPath $resolvedRunnerPath `
    -ExpectedRunnerSha256 $expectedSha
if (-not $pre.Owned) {
    throw "TASK_NOT_PHASE7C_OWNED reason=$($pre.Reason)"
}

if ($pre.Canonical) {
    if ($pre.RepairRequired) {
        throw "OWNERSHIP_CONTRACT_INCONSISTENT canonical=True repairRequired=True"
    }
    Write-Output "SKIP=OWNED_CANONICAL"
    Write-Output "OWNERSHIP_OWNED=True"
    Write-Output "OWNERSHIP_CANONICAL=True"
    Write-Output "OWNERSHIP_REPAIRREQUIRED=False"
    Write-Output "OWNERSHIP_RUNNERSHA256=$($pre.RunnerSha256)"
    Write-Output "TASK_DRIFT=NONE"
    Write-Output "MUTATION=NONE"
    Write-Output "REPAIR_SCOPE=RUNNER_HASH_ONLY"
    exit 0
}

if (-not $pre.RepairRequired) {
    throw "REPAIR_NOT_REQUIRED_BUT_NONCANONICAL reason=$($pre.Reason)"
}
if ($pre.Reason -ne "OWNED_HASH_DRIFT_REPAIR_REQUIRED") {
    throw "REPAIR_SCOPE_REJECTED reason=$($pre.Reason)"
}

$preReasons = @($pre.Reasons | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) })
if ($preReasons.Count -ne 1) {
    throw "REPAIR_SCOPE_REJECTED reasons=$($preReasons -join ',')"
}
if ($preReasons[0] -ne "RUNNER_HASH_DRIFT") {
    throw "REPAIR_SCOPE_REJECTED reason=$($preReasons[0])"
}

$preEmbeddedSha = ([string]$pre.RunnerSha256).Trim().ToUpperInvariant()
if ($preEmbeddedSha -ne $expectedEmbeddedSha) {
    throw "PRE_REPAIR_EMBEDDED_SHA_MISMATCH expected=$expectedEmbeddedSha actual=$preEmbeddedSha"
}
Write-Output "PRE_REPAIR_RUNNERSHA256=$preEmbeddedSha"

$workingDirectory = Split-Path -Parent $resolvedRunnerPath
$arguments = '-NoProfile -ExecutionPolicy Bypass -File "{0}" -ExpectedRunnerSha256 "{1}"' -f $resolvedRunnerPath, $expectedSha
$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument $arguments `
    -WorkingDirectory $workingDirectory

Set-ScheduledTask `
    -TaskName $TaskName `
    -TaskPath $TaskPath `
    -Action $action `
    -ErrorAction Stop | Out-Null

$post = Get-Phase7CScheduledTaskOwnershipVerdict `
    -TaskName $TaskName `
    -TaskPath $TaskPath `
    -OwnedTaskMarker $OwnedTaskMarker `
    -ExpectedDescription $ExpectedDescription `
    -ExpectedRunnerPath $resolvedRunnerPath `
    -ExpectedRunnerSha256 $expectedSha
if (-not $post.Owned) {
    throw "POST_REPAIR_OWNERSHIP_FAILED owned=False reason=$($post.Reason)"
}
if (-not $post.Canonical) {
    throw "POST_REPAIR_CANONICAL_FAILED reason=$($post.Reason) reasons=$(@($post.Reasons) -join ',')"
}
if ($post.RepairRequired) {
    throw "POST_REPAIR_STILL_REQUIRED reason=$($post.Reason)"
}
$postSha = ([string]$post.RunnerSha256).Trim().ToUpperInvariant()
if ($postSha -ne $expectedSha) {
    throw "POST_REPAIR_RUNNER_SHA_MISMATCH expected=$expectedSha actual=$postSha"
}
$postReasons = @($post.Reasons | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) })
if ($postReasons.Count -ne 0) {
    throw "POST_REPAIR_TASK_DRIFT reasons=$($postReasons -join ',')"
}

Write-Output "OWNERSHIP_OWNED=True"
Write-Output "OWNERSHIP_CANONICAL=True"
Write-Output "OWNERSHIP_REPAIRREQUIRED=False"
Write-Output "OWNERSHIP_RUNNERSHA256=$postSha"
Write-Output "TASK_DRIFT=NONE"
Write-Output "MUTATION=TASK_DEFINITION_ONLY"
Write-Output "REPAIR_SCOPE=RUNNER_HASH_ONLY"
