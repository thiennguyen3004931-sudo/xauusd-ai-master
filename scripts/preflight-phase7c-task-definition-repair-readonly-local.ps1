[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[A-Fa-f0-9]{40}$')]
    [string]$ExpectedMainCommit,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[A-Fa-f0-9]{64}$')]
    [string]$ExpectedEmbeddedRunnerSha256,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[A-Fa-f0-9]{64}$')]
    [string]$ExpectedRunnerSha256
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Write-Output 'READ_ONLY=True'
Write-Output 'MUTATION=NONE'
Write-Output 'GIT_MUTATION=NONE'
Write-Output 'TASK_MUTATION=NONE'
Write-Output 'PROCESS_MUTATION=NONE'
Write-Output 'SERVICE_MUTATION=NONE'
Write-Output 'LIFECYCLE_MUTATION=NONE'
Write-Output 'MODE_MUTATION=NONE'
Write-Output 'ARM_MUTATION=NONE'
Write-Output 'ORDER_MUTATION=NONE'
Write-Output 'POSITION_MUTATION=NONE'

$projectRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$TaskName = 'XAUUSD-Phase7C-Executors'
$TaskPath = '\'
$ExpectedOriginUrls = @(
    'https://github.com/thiennguyen3004931-sudo/xauusd-ai-master',
    'https://github.com/thiennguyen3004931-sudo/xauusd-ai-master.git',
    'git@github.com:thiennguyen3004931-sudo/xauusd-ai-master.git'
)

$expectedMain = $ExpectedMainCommit.Trim().ToLowerInvariant()
$expectedEmbeddedSha = $ExpectedEmbeddedRunnerSha256.Trim().ToUpperInvariant()
$expectedRunnerSha = $ExpectedRunnerSha256.Trim().ToUpperInvariant()
if ($expectedEmbeddedSha -eq $expectedRunnerSha) {
    throw 'EXPECTED_HASHES_MUST_DIFFER'
}

$ownershipLibrary = Join-Path $PSScriptRoot 'lib\phase7c-scheduled-task-ownership.ps1'
if (-not (Test-Path -LiteralPath $ownershipLibrary -PathType Leaf)) {
    throw "OWNERSHIP_LIBRARY_NOT_FOUND path=$ownershipLibrary"
}
. $ownershipLibrary

$gitCommand = Get-Command git -CommandType Application -ErrorAction Stop | Select-Object -First 1
$gitExe = [string]$gitCommand.Source

function Invoke-Phase7CReadOnlyGit {
    param([Parameter(Mandatory = $true)] [string[]]$Arguments)

    $output = @(& $gitExe -C $projectRoot @Arguments 2>&1)
    $exitCode = [int]$LASTEXITCODE
    if ($exitCode -ne 0) {
        throw "READ_ONLY_GIT_COMMAND_FAILED args=$($Arguments -join ' ') exitCode=$exitCode output=$($output -join ' | ')"
    }
    return @($output | ForEach-Object { [string]$_ })
}

# Read-only Git proof: branch --show-current
$branchOutput = @(Invoke-Phase7CReadOnlyGit -Arguments @('branch', '--show-current'))
$localBranch = if ($branchOutput.Count -gt 0) { ([string]$branchOutput[-1]).Trim() } else { '' }
if ($localBranch -ne 'main') {
    throw "LOCAL_BRANCH_NOT_MAIN actual=$localBranch"
}

# Read-only Git proof: rev-parse HEAD
$headOutput = @(Invoke-Phase7CReadOnlyGit -Arguments @('rev-parse', 'HEAD'))
$localHead = if ($headOutput.Count -gt 0) { ([string]$headOutput[-1]).Trim().ToLowerInvariant() } else { '' }
if ($localHead -ne $expectedMain) {
    throw "LOCAL_HEAD_NOT_EXPECTED_MAIN expected=$expectedMain actual=$localHead"
}

# Read-only Git proof: status --porcelain --untracked-files=normal
$dirtyOutput = @(Invoke-Phase7CReadOnlyGit -Arguments @('status', '--porcelain', '--untracked-files=normal'))
$localDirtyCount = @($dirtyOutput | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) }).Count
if ($localDirtyCount -ne 0) {
    throw "LOCAL_WORKTREE_NOT_CLEAN dirtyCount=$localDirtyCount"
}

# Read-only Git proof: remote get-url origin
$originOutput = @(Invoke-Phase7CReadOnlyGit -Arguments @('remote', 'get-url', 'origin'))
$originUrl = if ($originOutput.Count -gt 0) { ([string]$originOutput[-1]).Trim() } else { '' }
$originCanonical = $ExpectedOriginUrls -contains $originUrl
if (-not $originCanonical) {
    throw "ORIGIN_REMOTE_NOT_CANONICAL actual=$originUrl"
}

# Read-only Git proof: ls-remote --heads origin refs/heads/main
$remoteOutput = @(Invoke-Phase7CReadOnlyGit -Arguments @('ls-remote', '--heads', 'origin', 'refs/heads/main'))
if ($remoteOutput.Count -ne 1) {
    throw "REMOTE_MAIN_UNAVAILABLE lineCount=$($remoteOutput.Count)"
}
$remoteMain = ([string]$remoteOutput[0]).Split([char]9)[0].Trim().ToLowerInvariant()
if ($remoteMain -ne $expectedMain) {
    throw "REMOTE_MAIN_NOT_EXPECTED expected=$expectedMain actual=$remoteMain"
}

$resolvedRunnerPath = Get-Phase7CExecutorTaskRunnerPath -ProjectRoot $projectRoot
$actualRunnerSha = (Get-FileHash -LiteralPath $resolvedRunnerPath -Algorithm SHA256 -ErrorAction Stop).Hash.ToUpperInvariant()
$trustedRunnerSha = (Get-Phase7CTrustedGitFileSha256 -ProjectRoot $projectRoot -Path $resolvedRunnerPath).ToUpperInvariant()
if ($actualRunnerSha -ne $trustedRunnerSha) {
    throw "RUNNER_TRUSTED_SHA_MISMATCH trusted=$trustedRunnerSha actual=$actualRunnerSha"
}
if ($actualRunnerSha -ne $expectedRunnerSha) {
    throw "RUNNER_ACTUAL_SHA_MISMATCH expected=$expectedRunnerSha actual=$actualRunnerSha"
}

Import-Module ScheduledTasks -ErrorAction Stop
$task = Get-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath -ErrorAction Stop
$taskState = ([string]$task.State).Trim()
if ($taskState.Equals('Running', [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'TASK_STATE_RUNNING_REJECTED'
}

function Test-Phase7CCanonicalSystemPrincipal {
    param([Parameter(Mandatory = $true)] $Principal)

    if ($null -eq $Principal) { return $false }
    $user = ([string]$Principal.UserId).Trim()
    $systemUser = $user -in @('SYSTEM', 'NT AUTHORITY\SYSTEM', 'S-1-5-18')
    return $systemUser -and `
        [string]$Principal.LogonType -eq 'ServiceAccount' -and `
        [string]$Principal.RunLevel -eq 'Highest'
}

if (-not (Test-Phase7CCanonicalSystemPrincipal -Principal $task.Principal)) {
    throw 'PRE_REPAIR_PRINCIPAL_NOT_CANONICAL_SYSTEM'
}

$ownership = Test-Phase7CExecutorTaskActionOwnership `
    -Actions $task.Actions `
    -ExpectedRunnerPath $resolvedRunnerPath `
    -ExpectedRunnerSha256 $expectedRunnerSha
$taskDrift = @(Get-Phase7CExecutorTaskDrift -Task $task)

if ($taskDrift.Count -ne 0) {
    throw "PRE_REPAIR_TASK_DRIFT drift=$($taskDrift -join ',')"
}
if (-not $ownership.owned) {
    throw "TASK_NOT_PHASE7C_OWNED reason=$($ownership.reason)"
}
if ($ownership.canonical) {
    throw 'TASK_ALREADY_CANONICAL'
}
if (-not $ownership.repairRequired) {
    throw "REPAIR_SCOPE_REJECTED reason=$($ownership.reason) repairRequired=False"
}
if ([string]$ownership.reason -ne 'OWNED_HASH_DRIFT_REPAIR_REQUIRED') {
    throw "REPAIR_SCOPE_REJECTED reason=$($ownership.reason)"
}

$embeddedSha = Normalize-Phase7CRunnerSha256 -Sha256 ([string]$ownership.runnerSha256)
if ($embeddedSha -ne $expectedEmbeddedSha) {
    throw "PRE_REPAIR_EMBEDDED_SHA_MISMATCH expected=$expectedEmbeddedSha actual=$embeddedSha"
}

Write-Output "EXPECTED_MAIN=$expectedMain"
Write-Output "LOCAL_BRANCH=$localBranch"
Write-Output "LOCAL_HEAD=$localHead"
Write-Output "REMOTE_MAIN=$remoteMain"
Write-Output "LOCAL_DIRTY_COUNT=$localDirtyCount"
Write-Output 'ORIGIN_CANONICAL=True'
Write-Output "RUNNER_ACTUAL_SHA=$actualRunnerSha"
Write-Output "RUNNER_TRUSTED_SHA=$trustedRunnerSha"
Write-Output "TASK_EMBEDDED_SHA=$embeddedSha"
Write-Output "TASK_STATE=$taskState"
Write-Output 'OWNERSHIP_OWNED=True'
Write-Output 'OWNERSHIP_CANONICAL=False'
Write-Output 'OWNERSHIP_REPAIRREQUIRED=True'
Write-Output 'OWNERSHIP_REASON=OWNED_HASH_DRIFT_REPAIR_REQUIRED'
Write-Output 'TASK_DRIFT=NONE'
Write-Output 'PRINCIPAL_CANONICAL_SYSTEM=True'
Write-Output 'ONLY_CONFIRMED_DRIFT=RUNNER_HASH'
Write-Output 'TASK_DEFINITION_REPAIR_ALLOWED=True'
Write-Output 'MUTATION=NONE'
