Set-StrictMode -Version Latest

function Get-Phase7CExecutorTaskRunnerPath {
  param([Parameter(Mandatory = $true)] [string]$ProjectRoot)

  $root = [System.IO.Path]::GetFullPath($ProjectRoot).TrimEnd('\', '/')
  return [System.IO.Path]::GetFullPath((Join-Path $root 'scripts\run-phase7c-executor-task-runner-local.ps1'))
}

function ConvertFrom-Phase7CCommandLineTokens {
  param([AllowEmptyString()] [string]$Arguments)

  if ([string]::IsNullOrWhiteSpace($Arguments)) { return @() }

  $matches = [regex]::Matches($Arguments, '"[^"]*"|''[^'']*''|\S+')
  $tokens = @()
  foreach ($match in $matches) {
    $value = [string]$match.Value
    if ($value.Length -ge 2 -and (($value[0] -eq '"' -and $value[$value.Length - 1] -eq '"') -or ($value[0] -eq "'" -and $value[$value.Length - 1] -eq "'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $tokens += $value
  }
  return @($tokens)
}

function Test-Phase7CPowerShellExecutable {
  param([AllowEmptyString()] [string]$Execute)

  if ([string]::IsNullOrWhiteSpace($Execute)) { return $false }
  $candidate = [Environment]::ExpandEnvironmentVariables($Execute.Trim().Trim('"'))
  if (-not [System.IO.Path]::IsPathRooted($candidate)) {
    return $candidate.Equals('powershell.exe', [System.StringComparison]::OrdinalIgnoreCase)
  }

  try {
    $full = [System.IO.Path]::GetFullPath($candidate).TrimEnd('\')
  } catch {
    return $false
  }

  $allowed = @()
  if (-not [string]::IsNullOrWhiteSpace($env:SystemRoot)) {
    $allowed += [System.IO.Path]::GetFullPath((Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe')).TrimEnd('\')
    $allowed += [System.IO.Path]::GetFullPath((Join-Path $env:SystemRoot 'SysWOW64\WindowsPowerShell\v1.0\powershell.exe')).TrimEnd('\')
  }
  foreach ($path in $allowed) {
    if ($full.Equals($path, [System.StringComparison]::OrdinalIgnoreCase)) { return $true }
  }
  return $false
}

function Test-Phase7CExecutorTaskActionOwnership {
  param(
    [Parameter(Mandatory = $true)] $Actions,
    [Parameter(Mandatory = $true)] [string]$ExpectedRunnerPath
  )

  $items = @($Actions)
  if ($items.Count -ne 1) {
    return [pscustomobject]@{ owned = $false; reason = 'ACTION_COUNT'; actionCount = $items.Count }
  }

  $action = $items[0]
  if (-not (Test-Phase7CPowerShellExecutable ([string]$action.Execute))) {
    return [pscustomobject]@{ owned = $false; reason = 'EXECUTABLE_MISMATCH'; actionCount = 1 }
  }

  $tokens = @(ConvertFrom-Phase7CCommandLineTokens ([string]$action.Arguments))
  if ($tokens.Count -ne 5) {
    return [pscustomobject]@{ owned = $false; reason = 'ARGUMENT_COUNT'; actionCount = 1 }
  }

  $canonicalSwitches =
    $tokens[0].Equals('-NoProfile', [System.StringComparison]::OrdinalIgnoreCase) -and
    $tokens[1].Equals('-ExecutionPolicy', [System.StringComparison]::OrdinalIgnoreCase) -and
    $tokens[2].Equals('Bypass', [System.StringComparison]::OrdinalIgnoreCase) -and
    $tokens[3].Equals('-File', [System.StringComparison]::OrdinalIgnoreCase)
  if (-not $canonicalSwitches) {
    return [pscustomobject]@{ owned = $false; reason = 'ARGUMENTS_MISMATCH'; actionCount = 1 }
  }

  try {
    $actualRunner = [System.IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($tokens[4])).TrimEnd('\', '/')
    $expectedRunner = [System.IO.Path]::GetFullPath($ExpectedRunnerPath).TrimEnd('\', '/')
  } catch {
    return [pscustomobject]@{ owned = $false; reason = 'RUNNER_PATH_INVALID'; actionCount = 1 }
  }

  if (-not $actualRunner.Equals($expectedRunner, [System.StringComparison]::OrdinalIgnoreCase)) {
    return [pscustomobject]@{ owned = $false; reason = 'RUNNER_PATH_MISMATCH'; actionCount = 1 }
  }

  return [pscustomobject]@{ owned = $true; reason = 'OWNED'; actionCount = 1 }
}

function Get-Phase7CTriggerKind {
  param($Trigger)

  if ($null -eq $Trigger) { return '' }
  try {
    if ($null -ne $Trigger.CimClass -and -not [string]::IsNullOrWhiteSpace([string]$Trigger.CimClass.CimClassName)) {
      return [string]$Trigger.CimClass.CimClassName
    }
  } catch { }
  try {
    if (-not [string]::IsNullOrWhiteSpace([string]$Trigger.CimClassName)) { return [string]$Trigger.CimClassName }
  } catch { }
  return ''
}

function Get-Phase7CExecutorTaskDrift {
  param([Parameter(Mandatory = $true)] $Task)

  $drift = New-Object System.Collections.Generic.List[string]
  $triggers = @($Task.Triggers)
  if ($triggers.Count -ne 1 -or (Get-Phase7CTriggerKind $triggers[0]) -ne 'MSFT_TaskBootTrigger') {
    $drift.Add('TRIGGER')
  }

  $settings = $Task.Settings
  if ($null -eq $settings) {
    $drift.Add('SETTINGS')
  } else {
    if ([bool]$settings.AllowDemandStart -ne $true) { $drift.Add('ALLOW_DEMAND_START') }
    if ([bool]$settings.StartWhenAvailable -ne $true) { $drift.Add('START_WHEN_AVAILABLE') }
    if ([string]$settings.MultipleInstances -ne 'IgnoreNew') { $drift.Add('MULTIPLE_INSTANCES') }
    if ([int]$settings.RestartCount -ne 0) { $drift.Add('RESTART_COUNT') }
    if ([string]$settings.ExecutionTimeLimit -ne 'PT0S') { $drift.Add('EXECUTION_TIME_LIMIT') }
  }

  if ($null -eq $Task.Principal -or [string]$Task.Principal.RunLevel -ne 'Highest') {
    $drift.Add('PRINCIPAL_RUN_LEVEL')
  }

  return @($drift)
}

function Get-Phase7CScheduledTaskErrorClassification {
  param([Parameter(Mandatory = $true)] [System.Exception]$Exception)

  if ($Exception -is [System.UnauthorizedAccessException]) { return 'ACCESS_DENIED' }
  $code = $Exception.HResult -band 0xFFFF
  if ($code -eq 5) { return 'ACCESS_DENIED' }
  if ($code -eq 2 -or $code -eq 1168) { return 'NOT_FOUND' }

  $message = [string]$Exception.Message
  if ($message -match '(?i)access\s+is\s+denied|access\s+denied|unauthorized') { return 'ACCESS_DENIED' }
  if ($message -match '(?i)not\s+found|cannot\s+find|no\s+matching\s+MSFT_ScheduledTask') { return 'NOT_FOUND' }
  return 'PROVIDER_ERROR'
}

function Get-Phase7CStartupRunnerLockState {
  param([Parameter(Mandatory = $true)] [string]$LockPath)

  if (-not (Test-Path -LiteralPath $LockPath)) { return 'MISSING' }
  $handle = $null
  try {
    $handle = [System.IO.File]::Open($LockPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
    return 'RELEASED'
  } catch [System.UnauthorizedAccessException] {
    return 'ACCESS_DENIED'
  } catch [System.IO.IOException] {
    $code = $_.Exception.HResult -band 0xFFFF
    if ($code -eq 32 -or $code -eq 33) { return 'HELD' }
    return 'IO_ERROR'
  } catch {
    return 'ERROR'
  } finally {
    if ($null -ne $handle) { $handle.Dispose() }
  }
}
