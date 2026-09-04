$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$PSDefaultParameterValues['Get-Content:Encoding'] = 'UTF8'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Helper = Join-Path $ProjectRoot "scripts\lib\phase7c-runtime-source-attestation.ps1"

function Assert-True([bool]$Value, [string]$Message) {
  if (-not $Value) { throw $Message }
}

function Assert-PowerShellSyntax([string]$Path) {
  $tokens = $null
  $errors = $null
  [void][System.Management.Automation.Language.Parser]::ParseFile($Path, [ref]$tokens, [ref]$errors)
  if ($errors.Count -ne 0) {
    throw "PowerShell syntax error in ${Path}: $($errors[0].Message)"
  }
}

if (-not (Test-Path -LiteralPath $Helper -PathType Leaf)) {
  throw "RED: runtime source attestation helper missing: $Helper"
}
Assert-PowerShellSyntax $Helper
. $Helper

$fixtureRoot = "F:\Project\XAUUSD_AI_MASTER\xauusd-ai-master\.runtime"
$identity = Get-Phase7CRuntimeSourceConfigIdentity `
  -RuntimeRoot $fixtureRoot `
  -AccountMode LIVE `
  -LiveExecutionEnabled $true `
  -ControlApiUrl "http://127.0.0.1:3711"
$fingerprint = Get-Phase7CRuntimeSourceConfigFingerprint -ConfigIdentity $identity
Assert-True ($fingerprint -eq "sha256:ad7ecee6a3c038992ba8816bf8ec8235bc2febbdad35fcd07a35c511512445d9") "Cross-language fingerprint mismatch: $fingerprint"

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("phase7c-source-attestation-test-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
try {
  $runtimeRoot = Join-Path $tempRoot ".runtime"
  $launcher = Join-Path $tempRoot "launcher.ps1"
  [System.IO.File]::WriteAllText($launcher, "Write-Host 'launcher'`n", (New-Object System.Text.UTF8Encoding($false)))

  $tempIdentity = Get-Phase7CRuntimeSourceConfigIdentity `
    -RuntimeRoot $runtimeRoot `
    -AccountMode LIVE `
    -LiveExecutionEnabled $true `
    -ControlApiUrl "http://127.0.0.1:3711"

  $first = Initialize-Phase7CRuntimeSourceDeployment `
    -RuntimeRoot $runtimeRoot `
    -SourceCommit "4f156ef1b019ef676cc23ed978c9487eb41f2fe6" `
    -SourceTree "0ab41605d0ccdf0b17210826081ce4bd9e3a5620" `
    -Branch main `
    -ConfigIdentity $tempIdentity

  $second = Initialize-Phase7CRuntimeSourceDeployment `
    -RuntimeRoot $runtimeRoot `
    -SourceCommit "4f156ef1b019ef676cc23ed978c9487eb41f2fe6" `
    -SourceTree "0ab41605d0ccdf0b17210826081ce4bd9e3a5620" `
    -Branch main `
    -ConfigIdentity $tempIdentity

  Assert-True ([string]$first.deploymentId -eq [string]$second.deploymentId) "Same identity must reuse deploymentId"
  Assert-True ([long]$first.createdAt -eq [long]$second.createdAt) "Same identity must reuse createdAt"

  Start-Sleep -Milliseconds 5
  $changedIdentity = Get-Phase7CRuntimeSourceConfigIdentity `
    -RuntimeRoot $runtimeRoot `
    -AccountMode DEMO `
    -LiveExecutionEnabled $false `
    -ControlApiUrl "http://127.0.0.1:3711"
  $third = Initialize-Phase7CRuntimeSourceDeployment `
    -RuntimeRoot $runtimeRoot `
    -SourceCommit "4f156ef1b019ef676cc23ed978c9487eb41f2fe6" `
    -SourceTree "0ab41605d0ccdf0b17210826081ce4bd9e3a5620" `
    -Branch main `
    -ConfigIdentity $changedIdentity

  Assert-True ([string]$third.deploymentId -ne [string]$first.deploymentId) "Changed config must rotate deploymentId"
  Assert-True ([long]$third.createdAt -gt [long]$first.createdAt) "Changed config must rotate createdAt"

  $component = Write-Phase7CRuntimeSourceComponentAttestation `
    -RuntimeRoot $runtimeRoot `
    -Component trend `
    -ProcessId 12345 `
    -LauncherPath $launcher `
    -ConfigIdentity $changedIdentity

  Assert-True ([string]$component.component -eq "trend") "component name mismatch"
  Assert-True ([int]$component.pid -eq 12345) "component PID mismatch"
  Assert-True ([string]$component.deploymentId -eq [string]$third.deploymentId) "component deploymentId mismatch"
  Assert-True ([string]$component.configFingerprint -eq [string]$third.configFingerprint) "component config fingerprint mismatch"
  Assert-True ([string]$component.launcherSha256 -match '^sha256:[0-9a-f]{64}$') "launcher hash invalid"

  $manifestPath = Join-Path $runtimeRoot "phase7c-source-attestation\deployment.json"
  $componentPath = Join-Path $runtimeRoot "phase7c-source-attestation\components\trend.json"
  Assert-True (Test-Path -LiteralPath $manifestPath -PathType Leaf) "deployment manifest missing"
  Assert-True (Test-Path -LiteralPath $componentPath -PathType Leaf) "component attestation missing"
  [void](Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json)
  [void](Get-Content -LiteralPath $componentPath -Raw | ConvertFrom-Json)
} finally {
  Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}

$helperText = Get-Content -LiteralPath $Helper -Raw
Assert-True ($helperText -notmatch '(?i)ARM_LIVE') "P1 helper must not ARM LIVE"
Assert-True ($helperText -notmatch '(?i)mode\s*=\s*["'']AUTO["'']') "P1 helper must not set AUTO"
Assert-True ($helperText -notmatch '(?i)Start-ScheduledTask') "P1 helper must not start Scheduled Tasks"
Assert-True ($helperText -notmatch '(?i)/v1/orders') "P1 helper must not call order endpoints"

Write-Host "PHASE7C_RUNTIME_SOURCE_ATTESTATION_SOURCE_TEST=PASS"
