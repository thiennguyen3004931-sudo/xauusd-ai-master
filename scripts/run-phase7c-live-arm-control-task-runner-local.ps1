param(
  [string]$WorkDir = ".runtime",
  [string]$ControlApiUrl = "http://127.0.0.1:3711"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
if (-not [System.IO.Path]::IsPathRooted($WorkDir)) { $WorkDir = Join-Path $ProjectRoot $WorkDir }
if (-not (Test-Path -LiteralPath $WorkDir)) { throw "LIVE ARM control WorkDir not found: $WorkDir" }
$WorkDir = (Resolve-Path -LiteralPath $WorkDir).Path

$RequestPath = Join-Path $WorkDir "phase7c-live-arm-control-request.json"
$StatusPath = Join-Path $WorkDir "phase7c-live-arm-control-status.json"
$LockPath = Join-Path $WorkDir "phase7c-live-arm-control.lock"
$ArmScript = Join-Path $PSScriptRoot "arm-phase7c-live-local.ps1"
$DisarmScript = Join-Path $PSScriptRoot "disarm-phase7c-live-local.ps1"
$GetArmStatusScript = Join-Path $PSScriptRoot "get-phase7c-live-arm-local.ps1"

foreach ($required in @($ArmScript, $DisarmScript, $GetArmStatusScript)) {
  if (-not (Test-Path -LiteralPath $required)) { throw "Required LIVE ARM component missing: $required" }
}

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Phase7C LIVE ARM task runner requires Administrator privileges."
}

function Write-AtomicJson([string]$Path, $Value) {
  $tmp = "$Path.tmp.$PID"
  $Value | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $tmp -Encoding UTF8
  Move-Item -LiteralPath $tmp -Destination $Path -Force
}

function Read-Json([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
}

function Write-ControlStatus(
  [string]$RequestId,
  [string]$Action,
  [string]$Status,
  [string]$Phase,
  [string]$Message,
  [long]$StartedAt,
  [Nullable[long]]$CompletedAt = $null,
  [string]$FinalArmStatus = "UNKNOWN"
) {
  Write-AtomicJson $StatusPath ([ordered]@{
    version = 1
    requestId = $RequestId
    action = $Action
    status = $Status
    phase = $Phase
    message = $Message
    startedAt = $StartedAt
    updatedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    completedAt = $CompletedAt
    finalArmStatus = $FinalArmStatus
  })
}

function Read-CanonicalArmStatus() {
  $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $GetArmStatusScript -WorkDir $WorkDir 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) { throw "Canonical LIVE ARM status command failed. $output" }
  $match = [regex]::Match($output, 'PHASE7C_LIVE_ARM_STATUS=([^\r\n]+)')
  if (-not $match.Success) { throw "Canonical LIVE ARM status output is missing PHASE7C_LIVE_ARM_STATUS. $output" }
  return $match.Groups[1].Value.Trim().ToUpperInvariant()
}

$lockStream = $null
$requestId = "UNKNOWN"
$action = "UNKNOWN"
$startedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
try {
  try {
    $lockStream = [System.IO.File]::Open($LockPath, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
  } catch [System.IO.IOException] {
    throw "Another Phase7C LIVE ARM control request is already running."
  }

  $request = Read-Json $RequestPath
  if ($null -eq $request) { throw "LIVE ARM control request is missing or invalid." }
  if ([int]$request.version -ne 1) { throw "LIVE ARM control request version must be 1." }
  $requestId = [string]$request.requestId
  $action = ([string]$request.action).Trim().ToUpperInvariant()
  if ($requestId -notmatch '^[0-9a-fA-F-]{36}$') { throw "LIVE ARM requestId is invalid." }
  if ($action -notin @("ARM_LIVE", "DISARM_LIVE")) { throw "LIVE ARM action must be ARM_LIVE or DISARM_LIVE." }
  if ([string]$request.source -ne "LOCAL_WEB") { throw "LIVE ARM request source is not allowed." }
  if ([string]$request.confirmation -ne $action) { throw "LIVE ARM request confirmation is invalid." }
  $createdAt = [long]$request.createdAt
  $ageMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() - $createdAt
  if ($createdAt -le 0 -or $ageMs -lt -10000 -or $ageMs -gt 60000) { throw "LIVE ARM request expired or has invalid timestamp." }

  Write-ControlStatus $requestId $action "RUNNING" "PREFLIGHT" "Đang chạy canonical LIVE ARM/DISARM guard." $startedAt

  if ($action -eq "ARM_LIVE") {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ArmScript -WorkDir $WorkDir -ControlApiUrl $ControlApiUrl
    if ($LASTEXITCODE -ne 0) { throw "Canonical LIVE ARM failed with exit code $LASTEXITCODE." }
    $finalArmStatus = Read-CanonicalArmStatus
    if ($finalArmStatus -ne "ARMED") { throw "LIVE ARM command completed but bridge did not report ARMED. Actual=$finalArmStatus" }
  } else {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $DisarmScript -WorkDir $WorkDir -Reason "web-live-arm-control"
    if ($LASTEXITCODE -ne 0) { throw "Canonical LIVE DISARM failed with exit code $LASTEXITCODE." }
    $finalArmStatus = Read-CanonicalArmStatus
    if ($finalArmStatus -eq "ARMED") { throw "LIVE DISARM command completed but bridge still reports ARMED." }
  }

  $completedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  Write-ControlStatus $requestId $action "PASS" "COMPLETE" "LIVE ARM control hoàn tất an toàn." $startedAt $completedAt $finalArmStatus
  Write-Host "PHASE7C_WEB_LIVE_ARM_CONTROL_ACTION=$action"
  Write-Host "PHASE7C_WEB_LIVE_ARM_CONTROL_FINAL_STATUS=$finalArmStatus"
  Write-Host "PHASE7C_WEB_LIVE_ARM_CONTROL_ORDER_SEND=False"
  Write-Host "PHASE7C_WEB_LIVE_ARM_CONTROL_STATUS=PASS"
  exit 0
} catch {
  $completedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $message = $_.Exception.Message
  $finalArmStatus = "UNKNOWN"
  try { $finalArmStatus = Read-CanonicalArmStatus } catch {}
  try { Write-ControlStatus $requestId $action "FAIL" "FAILED" $message $startedAt $completedAt $finalArmStatus } catch {}
  Write-Error $message
  exit 1
} finally {
  try { Remove-Item -LiteralPath $RequestPath -Force -ErrorAction SilentlyContinue } catch {}
  if ($null -ne $lockStream) { $lockStream.Dispose() }
}
