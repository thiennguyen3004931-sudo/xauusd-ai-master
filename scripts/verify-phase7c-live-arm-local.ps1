param(
  [string]$WorkDir = ".runtime",
  [string]$ControlApiUrl = "http://127.0.0.1:3711"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
if (-not [System.IO.Path]::IsPathRooted($WorkDir)) {
  $WorkDir = Join-Path $ProjectRoot $WorkDir
}
if (-not (Test-Path -LiteralPath $WorkDir)) {
  throw "Phase7C work directory not found: $WorkDir"
}
$Runtime = (Resolve-Path -LiteralPath $WorkDir).Path
$Api = $ControlApiUrl.TrimEnd('/')
$ArmFile = Join-Path $Runtime "phase7c-live-arm.json"
$AccountPath = Join-Path $Runtime "phase7c-account-mode.json"
$BridgeStatusPath = Join-Path $Runtime "phase7c-account-bridge\startup-runner-status.json"
$BridgeDir = Join-Path $ProjectRoot "packages\mt5-broker\bridge"
$Python = Join-Path $BridgeDir ".venv\Scripts\python.exe"
$TestPath = Join-Path $BridgeDir "tests\test_live_arm.py"
$GuardPath = Join-Path $BridgeDir "mt5_bridge\guarded_gateway.py"
$GatewayPath = Join-Path $BridgeDir "mt5_bridge\mt5_gateway.py"

function Fail([string]$Message) {
  throw "DUNG: $Message"
}

function Get-EnvValue([string]$Path, [string]$Name) {
  foreach ($raw in Get-Content -LiteralPath $Path) {
    $line = ([string]$raw).Trim()
    if (
      [string]::IsNullOrWhiteSpace($line) -or
      $line.StartsWith("#") -or
      -not $line.Contains("=")
    ) {
      continue
    }

    $index = $line.IndexOf("=")
    $key = $line.Substring(0, $index).Trim().TrimStart([char]0xFEFF)
    if ($key -ne $Name) { continue }

    $value = $line.Substring($index + 1).Trim()
    if (
      ($value.StartsWith('"') -and $value.EndsWith('"')) -or
      ($value.StartsWith("'") -and $value.EndsWith("'"))
    ) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    return $value
  }
  return ""
}

function Get-CanonicalState {
  if (-not (Test-Path -LiteralPath $AccountPath)) {
    Fail "Canonical account state file missing."
  }

  $AccountFile = Get-Content -LiteralPath $AccountPath -Raw | ConvertFrom-Json
  $AccountApi = Invoke-RestMethod `
    -Uri "$Api/api/v1/phase7c/account-mode" `
    -Method Get `
    -TimeoutSec 10
  $Bot = Invoke-RestMethod `
    -Uri "$Api/api/v1/phase7c/bot-mode" `
    -Method Get `
    -TimeoutSec 10
  $Life = Invoke-RestMethod `
    -Uri "$Api/api/v1/phase7c/lifecycle" `
    -Method Get `
    -TimeoutSec 10

  return [pscustomobject]@{
    AccountFile = $AccountFile
    AccountApi = $AccountApi
    Bot = $Bot
    Life = $Life
  }
}

Write-Host ""
Write-Host "============================================================"
Write-Host " XAUUSD AI MASTER - PHASE7C LIVE ARM VERIFIER"
Write-Host "============================================================"

# ============================================================
# 1. SAFE CHECKPOINT - FILE/API SCHEMA + LIVE PAUSE/FLAT
# ============================================================
Write-Host ""
Write-Host "=== 1. SAFE CHECKPOINT ==="

$DirtyBefore = @(git -C $ProjectRoot status --porcelain)
Write-Host "WORKTREE_CHANGE_COUNT_BEFORE=$($DirtyBefore.Count)"
if ($DirtyBefore.Count -ne 0) {
  $DirtyBefore | ForEach-Object { Write-Host $_ }
  Fail "Git worktree is dirty."
}

$State = Get-CanonicalState
$AccountFile = $State.AccountFile
$AccountApi = $State.AccountApi
$Bot = $State.Bot
$Life = $State.Life

$FileFields = @($AccountFile.PSObject.Properties.Name)
$ApiFields = @($AccountApi.PSObject.Properties.Name)
if ('state' -notin $ApiFields -or $null -eq $AccountApi.state) {
  Fail "Account API is missing state."
}
$StateFields = @($AccountApi.state.PSObject.Properties.Name)

Write-Host "ACCOUNT_FILE_FIELDS=$($FileFields -join ',')"
Write-Host "ACCOUNT_API_FIELDS=$($ApiFields -join ',')"
Write-Host "ACCOUNT_STATE_FIELDS=$($StateFields -join ',')"

if ('accountMode' -notin $FileFields) {
  Fail "Canonical account file is missing accountMode."
}
if ('accountMode' -notin $StateFields -or 'valid' -notin $StateFields) {
  Fail "Account API state is missing accountMode/valid."
}

$FileAccountMode = [string]$AccountFile.accountMode
$ApiAccountMode = [string]$AccountApi.state.accountMode
$AccountValid = [bool]$AccountApi.state.valid

Write-Host "FILE_ACCOUNT_MODE=$FileAccountMode"
Write-Host "API_ACCOUNT_MODE=$ApiAccountMode"
Write-Host "ACCOUNT_VALID=$AccountValid"
Write-Host "BOT_MODE=$($Bot.state.mode)"
Write-Host "RUNNING=$($Life.running)"
Write-Host "READY=$($Life.ready)"
Write-Host "TELEGRAM_READY=$($Life.telegramReady)"
Write-Host "BRIDGE=$($Life.bridge.accountMode)"
Write-Host "BRIDGE_MATCH=$($Life.bridge.accountModeMatchesConfigured)"
Write-Host "POSITIONS=$($Life.bridge.openXauusdPositions)"
Write-Host "LIVE_ARM_FILE=$(Test-Path -LiteralPath $ArmFile)"

if ($FileAccountMode -ne $ApiAccountMode) {
  Fail "Canonical account FILE/API mismatch. FILE=$FileAccountMode API=$ApiAccountMode"
}
if ($ApiAccountMode -ne "LIVE" -or -not $AccountValid) {
  Fail "Canonical LIVE account state is not valid."
}
if ([string]$Bot.state.mode -ne "PAUSE") {
  Fail "LIVE bot mode must remain PAUSE."
}
if (
  -not [bool]$Life.running -or
  -not [bool]$Life.ready -or
  -not [bool]$Life.telegramReady
) {
  Fail "LIVE runtime/Telegram is not READY."
}
if (
  [string]$Life.bridge.accountMode -ne "real" -or
  -not [bool]$Life.bridge.accountModeMatchesConfigured
) {
  Fail "LIVE bridge/account mismatch."
}
if ([int]$Life.bridge.openXauusdPositions -ne 0) {
  Fail "LIVE has an open XAUUSD position."
}
if (Test-Path -LiteralPath $ArmFile) {
  Fail "LIVE ARM file is present; verifier requires DISARMED state."
}

Write-Host "ACCOUNT_FILE_API_MATCH=PASS"
Write-Host "LIVE_RECONFIRM=PASS"

# ============================================================
# 2. CANONICAL BRIDGE ARM BINDING
# ============================================================
Write-Host ""
Write-Host "=== 2. CANONICAL BRIDGE ARM BINDING ==="

if (-not (Test-Path -LiteralPath $BridgeStatusPath)) {
  Fail "Canonical bridge runner status file missing."
}
$BridgeStatus = Get-Content -LiteralPath $BridgeStatusPath -Raw | ConvertFrom-Json

Write-Host "BRIDGE_RUNNER_STATUS=$($BridgeStatus.status)"
Write-Host "BRIDGE_RUNNER_ACCOUNT=$($BridgeStatus.accountMode)"
Write-Host "BRIDGE_PROCESS_PID=$($BridgeStatus.bridgeProcessPid)"
Write-Host "BOUND_ARM_PATH=$($BridgeStatus.liveArmStatePath)"

if ([string]$BridgeStatus.accountMode -ne "LIVE") {
  Fail "Canonical bridge runner is not bound to LIVE."
}
if ([string]::IsNullOrWhiteSpace([string]$BridgeStatus.liveArmStatePath)) {
  Fail "Canonical bridge runner does not expose liveArmStatePath."
}

$ExpectedArmPath = [System.IO.Path]::GetFullPath($ArmFile)
$ActualArmPath = [System.IO.Path]::GetFullPath([string]$BridgeStatus.liveArmStatePath)
Write-Host "EXPECTED_ARM_PATH=$ExpectedArmPath"
Write-Host "ACTUAL_ARM_PATH=$ActualArmPath"

if (
  -not [string]::Equals(
    $ExpectedArmPath,
    $ActualArmPath,
    [System.StringComparison]::OrdinalIgnoreCase
  )
) {
  Fail "Canonical bridge is bound to the wrong LIVE ARM path."
}

Write-Host "CANONICAL_ARM_BINDING=PASS"

# ============================================================
# 3. DIRECT BRIDGE HEALTH - READ ONLY
# ============================================================
Write-Host ""
Write-Host "=== 3. DIRECT BRIDGE HEALTH - READ ONLY ==="

$EnvFile = [string]$AccountFile.envFile
if ([string]::IsNullOrWhiteSpace($EnvFile)) {
  Fail "Canonical LIVE envFile is empty."
}
if (-not [System.IO.Path]::IsPathRooted($EnvFile)) {
  $EnvFile = Join-Path $ProjectRoot $EnvFile
}
if (-not (Test-Path -LiteralPath $EnvFile)) {
  Fail "Canonical LIVE env file not found."
}

$ApiKey = Get-EnvValue $EnvFile "MT5_API_KEY"
$BridgeHost = Get-EnvValue $EnvFile "MT5_BRIDGE_HOST"
$BridgePort = Get-EnvValue $EnvFile "MT5_BRIDGE_PORT"
if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  Fail "LIVE MT5_API_KEY is missing."
}
if ([string]::IsNullOrWhiteSpace($BridgeHost)) { $BridgeHost = "127.0.0.1" }
if ([string]::IsNullOrWhiteSpace($BridgePort)) { $BridgePort = "8765" }

$Health = Invoke-RestMethod `
  -Uri "http://${BridgeHost}:${BridgePort}/health" `
  -Headers @{ "x-mt5-api-key" = $ApiKey } `
  -Method Get `
  -TimeoutSec 10

Write-Host "HEALTH_STATUS=$($Health.status)"
Write-Host "CONNECTED=$($Health.connected)"
Write-Host "CONFIGURED_ACCOUNT=$($Health.configuredAccountMode)"
Write-Host "BROKER_ACCOUNT=$($Health.accountMode)"
Write-Host "TRADING_ENABLED=$($Health.tradingEnabled)"
Write-Host "LIVE_ARM_REQUIRED=$($Health.liveArmRequired)"
Write-Host "LIVE_EXECUTION_ARMED=$($Health.liveExecutionArmed)"
Write-Host "LIVE_ARM_STATUS=$($Health.liveArmStatus)"
Write-Host "LIVE_ARM_REASON=$($Health.liveArmReason)"

if ([string]$Health.status -ne "ok" -or -not [bool]$Health.connected) {
  Fail "LIVE bridge health is not healthy."
}
if (
  [string]$Health.configuredAccountMode -ne "LIVE" -or
  [string]$Health.accountMode -ne "real"
) {
  Fail "LIVE bridge configured/actual account contract mismatch."
}
if (-not [bool]$Health.liveArmRequired) {
  Fail "LIVE bridge does not require the arm guard."
}
if ([bool]$Health.liveExecutionArmed) {
  Fail "LIVE execution is unexpectedly ARMED."
}
if ([string]$Health.liveArmStatus -ne "DISARMED") {
  Fail "LIVE bridge must report DISARMED."
}
if ([string]$Health.liveArmReason -ne "ARM_FILE_MISSING") {
  Fail "Expected ARM_FILE_MISSING. Actual=$($Health.liveArmReason)"
}

Write-Host "BRIDGE_RUNTIME_FAIL_CLOSED=PASS"

# ============================================================
# 4. FAKE-MT5 LIVE ARM REGRESSION
# ============================================================
Write-Host ""
Write-Host "=== 4. LIVE ARM REGRESSION TESTS - FAKE MT5 ONLY ==="

if (-not (Test-Path -LiteralPath $Python)) {
  Fail "Bridge Python venv not found: $Python"
}
if (-not (Test-Path -LiteralPath $TestPath)) {
  Fail "LIVE ARM regression test not found: $TestPath"
}

$TestSource = Get-Content -LiteralPath $TestPath -Raw
if (-not $TestSource.Contains("class RealFakeMt5")) {
  Fail "LIVE ARM regression no longer uses RealFakeMt5."
}
if (-not $TestSource.Contains("tempfile.TemporaryDirectory")) {
  Fail "LIVE ARM regression no longer uses temporary arm storage."
}

Push-Location $BridgeDir
try {
  $SavedErrorActionPreference = $ErrorActionPreference
  try {
    # Python unittest writes verbose progress to stderr. Windows PowerShell 5.1
    # can wrap those successful stderr records as NativeCommandError, so only
    # the native process exit code and unittest summary decide PASS/FAIL here.
    $ErrorActionPreference = "Continue"
    $TestOutput = @(
      & $Python `
        -m unittest discover `
        -s tests `
        -p "test_live_arm.py" `
        -v 2>&1 |
      ForEach-Object { "$_" }
    )
    $TestExit = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $SavedErrorActionPreference
  }

  $TestOutput | ForEach-Object { Write-Host $_ }
  $TestText = $TestOutput -join "`n"

  Write-Host "LIVE_ARM_TEST_EXIT=$TestExit"
  if ($TestExit -ne 0) {
    Fail "LIVE ARM regression failed. Exit=$TestExit"
  }
  if ($TestText -notmatch '(?m)^OK\s*$') {
    Fail "LIVE ARM regression exited 0 without unittest OK."
  }
  if ($TestText -notmatch 'Ran\s+4\s+tests') {
    Fail "Expected exactly 4 LIVE ARM regression tests."
  }
}
finally {
  Pop-Location
}

Write-Host "LIVE_ARM_TEST_COUNT=4"
Write-Host "LIVE_ARM_REGRESSION_TESTS=PASS"

# ============================================================
# 5. SOURCE EXECUTION BOUNDARY
# ============================================================
Write-Host ""
Write-Host "=== 5. SOURCE EXECUTION BOUNDARY ==="

foreach ($RequiredSource in @($GuardPath, $GatewayPath)) {
  if (-not (Test-Path -LiteralPath $RequiredSource)) {
    Fail "Required MT5 gateway source missing: $RequiredSource"
  }
}

$GuardText = Get-Content -LiteralPath $GuardPath -Raw
$GatewayText = Get-Content -LiteralPath $GatewayPath -Raw
$RequireTradingCount = ([regex]::Matches($GatewayText, 'self\._require_trading\(\)')).Count
$HasBaseGuard = $GuardText.Contains('super()._require_trading()')
$HasLiveDecision = $GuardText.Contains('decision = self._live_arm_decision(account)')
$HasDisarm = $GuardText.Contains('"LIVE_EXECUTION_DISARMED"')
$HasMismatch = $GuardText.Contains('"ACCOUNT_MODE_MISMATCH"')

Write-Host "MUTATION_REQUIRE_TRADING_COUNT=$RequireTradingCount"
Write-Host "HAS_BASE_TRADING_GUARD=$HasBaseGuard"
Write-Host "HAS_LIVE_ARM_DECISION=$HasLiveDecision"
Write-Host "HAS_LIVE_DISARM_BLOCK=$HasDisarm"
Write-Host "HAS_ACCOUNT_MODE_MISMATCH_BLOCK=$HasMismatch"

if ($RequireTradingCount -lt 4) {
  Fail "Fewer than four MT5 mutation paths pass through _require_trading()."
}
if (-not $HasBaseGuard) { Fail "Guarded gateway does not preserve the base trading guard." }
if (-not $HasLiveDecision) { Fail "Guarded gateway is missing the dynamic LIVE arm decision." }
if (-not $HasDisarm) { Fail "Guarded gateway is missing LIVE_EXECUTION_DISARMED." }
if (-not $HasMismatch) { Fail "Guarded gateway is missing ACCOUNT_MODE_MISMATCH." }

Write-Host "EXECUTION_BOUNDARY_SOURCE=PASS"

# ============================================================
# 6. FINAL NO-MUTATION PROOF
# ============================================================
Write-Host ""
Write-Host "=== 6. FINAL LIVE SAFETY ==="

$Final = Get-CanonicalState
$FinalAccount = $Final.AccountApi
$FinalBot = $Final.Bot
$FinalLife = $Final.Life
$FinalHealth = Invoke-RestMethod `
  -Uri "http://${BridgeHost}:${BridgePort}/health" `
  -Headers @{ "x-mt5-api-key" = $ApiKey } `
  -Method Get `
  -TimeoutSec 10
$FinalArm = Test-Path -LiteralPath $ArmFile
$DirtyAfter = @(git -C $ProjectRoot status --porcelain)

Write-Host "FINAL_ACCOUNT=$($FinalAccount.state.accountMode)"
Write-Host "FINAL_ACCOUNT_VALID=$($FinalAccount.state.valid)"
Write-Host "FINAL_MODE=$($FinalBot.state.mode)"
Write-Host "FINAL_RUNNING=$($FinalLife.running)"
Write-Host "FINAL_READY=$($FinalLife.ready)"
Write-Host "FINAL_TELEGRAM_READY=$($FinalLife.telegramReady)"
Write-Host "FINAL_BRIDGE=$($FinalLife.bridge.accountMode)"
Write-Host "FINAL_BRIDGE_MATCH=$($FinalLife.bridge.accountModeMatchesConfigured)"
Write-Host "FINAL_POSITIONS=$($FinalLife.bridge.openXauusdPositions)"
Write-Host "FINAL_LIVE_ARM_FILE=$FinalArm"
Write-Host "FINAL_BRIDGE_ARMED=$($FinalHealth.liveExecutionArmed)"
Write-Host "FINAL_ARM_STATUS=$($FinalHealth.liveArmStatus)"
Write-Host "FINAL_ARM_REASON=$($FinalHealth.liveArmReason)"
Write-Host "WORKTREE_CHANGE_COUNT=$($DirtyAfter.Count)"

if (
  [string]$FinalAccount.state.accountMode -ne "LIVE" -or
  -not [bool]$FinalAccount.state.valid
) {
  Fail "Final canonical LIVE account state changed or became invalid."
}
if ([string]$FinalBot.state.mode -ne "PAUSE") {
  Fail "Final bot mode changed from PAUSE."
}
if (
  -not [bool]$FinalLife.running -or
  -not [bool]$FinalLife.ready -or
  -not [bool]$FinalLife.telegramReady
) {
  Fail "Final LIVE runtime/Telegram is not READY."
}
if (
  [string]$FinalLife.bridge.accountMode -ne "real" -or
  -not [bool]$FinalLife.bridge.accountModeMatchesConfigured
) {
  Fail "Final LIVE bridge/account mismatch."
}
if ([int]$FinalLife.bridge.openXauusdPositions -ne 0) {
  Fail "Final LIVE XAUUSD positions are not zero."
}
if ($FinalArm -or [bool]$FinalHealth.liveExecutionArmed) {
  Fail "Verifier created or observed an armed LIVE state."
}
if (
  [string]$FinalHealth.liveArmStatus -ne "DISARMED" -or
  [string]$FinalHealth.liveArmReason -ne "ARM_FILE_MISSING"
) {
  Fail "Final LIVE arm state is not fail-closed DISARMED/ARM_FILE_MISSING."
}
if ($DirtyAfter.Count -ne 0) {
  $DirtyAfter | ForEach-Object { Write-Host $_ }
  Fail "Verifier changed the Git worktree."
}

Write-Host "POST_TEST_LIVE_SAFETY=PASS"
Write-Host "WORKTREE_CLEAN=PASS"
Write-Host "NO_LIVE_ARM_CREATED=PASS"
Write-Host "NO_BROKER_MUTATION=PASS"
Write-Host "PHASE7C_LIVE_ARM_VERIFY_STATUS=PASS"
