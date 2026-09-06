$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Get-Phase7CRuntimeSourceGenerationRoute {
  param(
    [Parameter(Mandatory = $true)] $Snapshot,
    [Parameter(Mandatory = $true)] [string]$ExpectedCommit,
    [Parameter(Mandatory = $true)] [string]$DeploymentId
  )

  $requiredNames = @(
    'api',
    'web',
    'lifecycle-broker',
    'supervisor',
    'trend',
    'sideway',
    'telegram',
    'regime-notifier'
  )
  $executorNames = @('supervisor','trend','sideway','telegram','regime-notifier')
  $generationReasons = @('SOURCE_COMMIT_MISMATCH','SOURCE_TREE_MISMATCH','DEPLOYMENT_ID_MISMATCH')

  if ($ExpectedCommit -notmatch '^[0-9a-fA-F]{40}$') {
    throw 'Runtime source generation routing requires an exact 40-character Git SHA.'
  }
  if ([string]::IsNullOrWhiteSpace($DeploymentId)) {
    throw 'Runtime source generation routing requires deploymentId.'
  }
  if ($null -eq $Snapshot) {
    throw 'Runtime source generation routing snapshot is missing.'
  }

  $components = @($Snapshot.components | Where-Object { $null -ne $_ })
  if ($components.Count -ne $requiredNames.Count) {
    throw "Runtime source generation routing requires exactly 8 attestation components. actual=$($components.Count)"
  }

  $byName = @{}
  foreach ($component in $components) {
    $name = [string]$component.component
    if ($name -notin $requiredNames) {
      throw "Runtime source generation routing found unexpected component: $name"
    }
    if ($byName.ContainsKey($name)) {
      throw "Runtime source generation routing found duplicate component: $name"
    }
    $byName[$name] = $component
  }
  foreach ($name in $requiredNames) {
    if (-not $byName.ContainsKey($name)) {
      throw "Runtime source generation routing is missing component: $name"
    }
  }

  $ExpectedCommit = $ExpectedCommit.ToLowerInvariant()

  function Test-ExactTargetComponent($Component) {
    return `
      [string]$Component.verdict -eq 'EXACT_MATCH' -and `
      ([string]$Component.sourceCommit).ToLowerInvariant() -eq $ExpectedCommit -and `
      [string]$Component.deploymentId -eq $DeploymentId
  }

  function Assert-GenerationMismatchComponent($Component,[string]$Name) {
    if ([string]$Component.verdict -ne 'MISMATCH') {
      throw "Runtime source generation routing requires $Name generation MISMATCH. actual=$([string]$Component.verdict)"
    }
    $reasons = @($Component.reasonCodes | ForEach-Object { [string]$_ })
    foreach ($required in $generationReasons) {
      if ($required -notin $reasons) {
        throw "Runtime source generation routing $Name mismatch is missing $required. reasons=$($reasons -join ',')"
      }
    }
    $unexpected = @($reasons | Where-Object { $_ -notin $generationReasons })
    if ($unexpected.Count -ne 0) {
      throw "Runtime source generation routing refuses non-generation mismatch for $Name. unexpected=$($unexpected -join ',')"
    }
    if ([string]::IsNullOrWhiteSpace([string]$Component.sourceCommit) -or [string]::IsNullOrWhiteSpace([string]$Component.deploymentId)) {
      throw "Runtime source generation routing requires complete previous generation identity for $Name."
    }
  }

  $allExact = $true
  foreach ($name in $requiredNames) {
    if (-not (Test-ExactTargetComponent $byName[$name])) {
      $allExact = $false
      break
    }
  }
  if ($allExact) {
    if ([string]$Snapshot.overall -ne 'EXACT_MATCH') {
      throw "Runtime source generation routing exact components require overall EXACT_MATCH. actual=$([string]$Snapshot.overall)"
    }
    return [pscustomobject]@{
      route = 'NONE'
      reconciliationRequired = $false
    }
  }

  foreach ($name in @('api','web')) {
    if (-not (Test-ExactTargetComponent $byName[$name])) {
      throw "Runtime source generation routing requires $name EXACT_MATCH on accepted deployment identity before executor-generation reconciliation."
    }
  }

  $broker = $byName['lifecycle-broker']
  $brokerExact = Test-ExactTargetComponent $broker

  if ($brokerExact) {
    if (-not [bool]$broker.alive -or [int]$broker.pid -le 0) {
      throw 'Runtime source generation routing exact lifecycle-broker must be alive with a positive PID.'
    }

    $previousCommits = @()
    $previousDeployments = @()
    foreach ($name in $executorNames) {
      $component = $byName[$name]
      Assert-GenerationMismatchComponent $component $name
      $previousCommits += ([string]$component.sourceCommit).ToLowerInvariant()
      $previousDeployments += [string]$component.deploymentId
    }
    $uniqueCommits = @($previousCommits | Sort-Object -Unique)
    $uniqueDeployments = @($previousDeployments | Sort-Object -Unique)
    if ($uniqueCommits.Count -ne 1 -or $uniqueDeployments.Count -ne 1) {
      throw 'Runtime source generation routing requires all stale executors to share one previous generation.'
    }
    if ([string]$uniqueCommits[0] -eq $ExpectedCommit -or [string]$uniqueDeployments[0] -eq $DeploymentId) {
      throw 'Runtime source generation routing requires stale executors to have a distinct previous generation identity.'
    }

    return [pscustomobject]@{
      route = 'EXACT_BROKER_CONTINUATION'
      reconciliationRequired = $true
    }
  }

  Assert-GenerationMismatchComponent $broker 'lifecycle-broker'
  foreach ($name in $executorNames) {
    Assert-GenerationMismatchComponent $byName[$name] $name
  }

  return [pscustomobject]@{
    route = 'FULL_GENERATION_RELOAD'
    reconciliationRequired = $true
  }
}
