$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$Verifier = Join-Path $PSScriptRoot "verify-phase7c-account-runtime-local.ps1"
$SourceTest = Join-Path $PSScriptRoot "test-phase7c-recovery-migration-verifier-window-source.ps1"

function Replace-ExactBlock {
  param(
    [Parameter(Mandatory = $true)] [string]$Path,
    [Parameter(Mandatory = $true)] [string]$Old,
    [Parameter(Mandatory = $true)] [string]$New,
    [Parameter(Mandatory = $true)] [string]$Marker
  )
  $text = [System.IO.File]::ReadAllText($Path).Replace("`r`n", "`n").Replace("`r", "`n")
  $oldNormalized = $Old.Replace("`r`n", "`n").Replace("`r", "`n")
  $newNormalized = $New.Replace("`r`n", "`n").Replace("`r", "`n")
  if ($text.Contains($newNormalized)) {
    Write-Host "PHASE7C_DEV_HARDEN_${Marker}=ALREADY_APPLIED"
    return
  }
  $count = ([regex]::Matches($text, [regex]::Escape($oldNormalized))).Count
  if ($count -ne 1) { throw "Hardening marker $Marker expected one old block but found $count in $Path." }
  [System.IO.File]::WriteAllText($Path, $text.Replace($oldNormalized, $newNormalized), $Utf8NoBom)
  Write-Host "PHASE7C_DEV_HARDEN_${Marker}=APPLIED"
}

Replace-ExactBlock -Path $Verifier -Marker "TRUSTED_SHA_INIT" -Old @'
$expectedMigrationRunnerSha256 = ""
if ($AllowOwnedTaskProvenanceMigration) {
'@ -New @'
$expectedMigrationRunnerSha256 = ""
$trustedMigrationRunnerSha256 = ""
if ($AllowOwnedTaskProvenanceMigration) {
'@

Replace-ExactBlock -Path $Verifier -Marker "TRUSTED_SHA_PROOF" -Old @'
  $expectedRunnerPath = `
    Get-Phase7CExecutorTaskRunnerPath `
      -ProjectRoot $ProjectRoot

  $ownership = if ($AllowOwnedTaskProvenanceMigration) {
    Test-Phase7CExecutorTaskActionOwnership `
      -Actions $task.Actions `
      -ExpectedRunnerPath $expectedRunnerPath `
      -ExpectedRunnerSha256 $expectedMigrationRunnerSha256
'@ -New @'
  $expectedRunnerPath = `
    Get-Phase7CExecutorTaskRunnerPath `
      -ProjectRoot $ProjectRoot

  if ($AllowOwnedTaskProvenanceMigration) {
    $trustedMigrationRunnerSha256 = Get-Phase7CTrustedGitFileSha256 `
      -ProjectRoot $ProjectRoot `
      -Path $expectedRunnerPath
    if (-not [string]::Equals(
      $expectedMigrationRunnerSha256,
      $trustedMigrationRunnerSha256,
      [System.StringComparison]::Ordinal
    )) {
      throw "Owned task provenance migration ExpectedRunnerSha256 does not match accepted Git HEAD bytes."
    }
    Write-Host "PHASE7C_ACCOUNT_VERIFY_TASK_MIGRATION_TRUSTED_GIT_SHA=PASS"
  }

  $ownership = if ($AllowOwnedTaskProvenanceMigration) {
    Test-Phase7CExecutorTaskActionOwnership `
      -Actions $task.Actions `
      -ExpectedRunnerPath $expectedRunnerPath `
      -ExpectedRunnerSha256 $trustedMigrationRunnerSha256
'@

Replace-ExactBlock -Path $SourceTest -Marker "TEST_PARSE_HELPER" -Old @'
$verifier = Get-Content -LiteralPath $VerifierPath -Raw

function Assert-Contains {
'@ -New @'
$verifier = Get-Content -LiteralPath $VerifierPath -Raw

function Assert-PowerShellSyntax([string]$Path) {
  $tokens = $null
  $errors = $null
  [void][System.Management.Automation.Language.Parser]::ParseFile($Path, [ref]$tokens, [ref]$errors)
  if ($errors.Count -ne 0) {
    throw "PowerShell syntax error in ${Path}: $($errors[0].Message)"
  }
}
foreach ($sourcePath in @($RecoveryPath, $WebDeployPath, $DashboardDeployPath, $VerifierPath)) {
  Assert-PowerShellSyntax $sourcePath
}

function Assert-Contains {
'@

Replace-ExactBlock -Path $SourceTest -Marker "TEST_TRUSTED_SHA" -Old @'
Assert-Contains $verifier 'Normalize-Phase7CRunnerSha256\s+-Sha256\s+\$ExpectedRunnerSha256' `
  'Account verifier must validate the migration SHA256 through the canonical ownership helper.'
Assert-Contains $verifier 'Test-Phase7CExecutorTaskActionOwnership[\s\S]*-ExpectedRunnerSha256\s+\$expectedMigrationRunnerSha256' `
  'Account verifier must recompute task ownership against the exact trusted runner SHA256.'
'@ -New @'
Assert-Contains $verifier 'Normalize-Phase7CRunnerSha256\s+-Sha256\s+\$ExpectedRunnerSha256' `
  'Account verifier must validate the migration SHA256 through the canonical ownership helper.'
Assert-Contains $verifier 'Get-Phase7CTrustedGitFileSha256[\s\S]*-ProjectRoot\s+\$ProjectRoot[\s\S]*-Path\s+\$expectedRunnerPath' `
  'Account verifier must independently derive the trusted runner SHA256 from accepted Git HEAD bytes.'
Assert-Contains $verifier '\[string\]::Equals\([\s\S]*\$expectedMigrationRunnerSha256[\s\S]*\$trustedMigrationRunnerSha256[\s\S]*Ordinal' `
  'Account verifier must bind caller expected SHA256 to the independently derived trusted Git SHA256.'
Assert-Contains $verifier 'PHASE7C_ACCOUNT_VERIFY_TASK_MIGRATION_TRUSTED_GIT_SHA=PASS' `
  'Account verifier must emit trusted Git SHA proof before using the migration window.'
Assert-Contains $verifier 'Test-Phase7CExecutorTaskActionOwnership[\s\S]*-ExpectedRunnerSha256\s+\$trustedMigrationRunnerSha256' `
  'Account verifier must recompute task ownership against the independently trusted Git runner SHA256.'
'@

Replace-ExactBlock -Path $SourceTest -Marker "TEST_NATIVE_SPLAT" -Old @'
# Recovery may open the migration window only after it has already classified
'@ -New @'
# Prove the argument-splat shape used by powershell.exe -File on the same Windows
# shells that execute this contract. This protects LIVE PS5.1 propagation from a
# source-only syntax false positive.
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("phase7c-migration-splat-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
try {
  $child = Join-Path $tempRoot "child.ps1"
  $out = Join-Path $tempRoot "out.txt"
  $childLines = @(
    'param(',
    '  [switch]$AllowOwnedTaskProvenanceMigration,',
    '  [string]$ExpectedRunnerSha256 = ""',
    ')',
    '[System.IO.File]::WriteAllText($env:PHASE7C_SPLAT_OUT, "$([bool]$AllowOwnedTaskProvenanceMigration)|$ExpectedRunnerSha256")'
  )
  $childLines | Set-Content -LiteralPath $child -Encoding UTF8
  $expectedSplatHash = ('A' * 64)
  $nativeArgs = @('-AllowOwnedTaskProvenanceMigration', '-ExpectedRunnerSha256', $expectedSplatHash)
  $env:PHASE7C_SPLAT_OUT = $out
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $child @nativeArgs
  if ($LASTEXITCODE -ne 0) { throw "powershell.exe migration argument splat failed with exit code $LASTEXITCODE" }
  $splatResult = (Get-Content -LiteralPath $out -Raw).Trim()
  if ($splatResult -ne "True|$expectedSplatHash") {
    throw "powershell.exe migration argument splat did not preserve switch/hash. actual=$splatResult"
  }
} finally {
  Remove-Item Env:PHASE7C_SPLAT_OUT -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}

# Recovery may open the migration window only after it has already classified
'@

Write-Host "PHASE7C_DEV_RECOVERY_MIGRATION_VERIFIER_HARDEN=PASS"
