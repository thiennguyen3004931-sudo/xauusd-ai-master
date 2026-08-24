$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Preflight = Join-Path $PSScriptRoot "preflight-phase7c-live-switch-local.ps1"
$Recovery = Join-Path $PSScriptRoot "recover-phase7c-demo-after-failed-switch-local.ps1"
$GuardedSwitch = Join-Path $PSScriptRoot "switch-phase7c-live-guarded-local.ps1"
$ExecutorStopper = Join-Path $PSScriptRoot "stop-phase7c-executors-local.ps1"

foreach ($target in @($Preflight, $Recovery, $GuardedSwitch, $ExecutorStopper)) {
  if (-not (Test-Path -LiteralPath $target)) { throw "Required source file missing: $target" }
  $tokens = $null
  $errors = $null
  [void][System.Management.Automation.Language.Parser]::ParseFile($target, [ref]$tokens, [ref]$errors)
  if ($errors.Count -gt 0) { throw "PowerShell parse failed for $target : $($errors -join '; ')" }
}

$preflight = Get-Content -LiteralPath $Preflight -Raw
$recovery = Get-Content -LiteralPath $Recovery -Raw
$guarded = Get-Content -LiteralPath $GuardedSwitch -Raw
$stopper = Get-Content -LiteralPath $ExecutorStopper -Raw

function Require([string]$Text, [string]$Pattern, [string]$Message) {
  if ($Text -notmatch $Pattern) { throw $Message }
}
function Forbid([string]$Text, [string]$Pattern, [string]$Message) {
  if ($Text -match $Pattern) { throw $Message }
}

Require $preflight 'PHASE7C_LIVE_SWITCH_PREFLIGHT_SELECTED_RUNTIME=DEMO' "Preflight must require selected DEMO."
Require $preflight 'PHASE7C_LIVE_SWITCH_PREFLIGHT_BOT_MODE=PAUSE' "Preflight must require PAUSE."
Require $preflight 'Assert-Phase7CLiveRiskProfileBinding' "Preflight must recheck LIVE risk binding."
Require $preflight 'terminal_info\.trade_allowed' "Preflight must inspect terminal Algo Trading permission."
Require $preflight 'account\.trade_allowed' "Preflight must inspect account trading permission."
Require $preflight 'account\.trade_expert' "Preflight must inspect account Expert permission."
Require $preflight 'PHASE7C_LIVE_SWITCH_TERMINAL_AUTOTRADING=DISABLED' "Preflight must fail closed when terminal Algo Trading is disabled."
Require $preflight 'Get-Phase7CLiveArmPath' "Preflight must require LIVE arm absent."
Forbid $preflight 'order_send|/v1/orders/place|/v1/positions/close|/v1/positions/modify' "Preflight must remain read-only."
Forbid $preflight 'Start-ScheduledTask|Stop-ScheduledTask' "Preflight must not mutate runtime Scheduled Tasks."

Require $recovery 'Set-BotPause "failed-account-switch-recovery"' "Recovery must force PAUSE first."
Require $recovery 'Clear-Phase7CLiveArmState.+failed-account-switch-recovery' "Recovery must DISARM LIVE."
Require $recovery 'Stop-ScheduledTask -TaskName \$ExecutorTaskName' "Recovery must stop executor task."
Require $recovery 'Stop-ScheduledTask -TaskName \$BridgeTaskName' "Recovery must stop bridge task."
Require $recovery '& \$ExecutorStopper' "Recovery must clean the executor process tree."
Require $recovery 'Stop-VerifiedBridgeListener' "Recovery must stop only a verified bridge listener."
Require $recovery 'PHASE7C_DEMO_RECOVERY_BRIDGE_LISTENER_PROOF=PASS' "Recovery must print listener ownership proof."
Require $recovery 'accountMode = "DEMO"' "Recovery must restore DEMO account state."
Require $recovery 'liveExecutionEnabled = \$false' "Recovery must restore account state LIVE execution false."
Require $recovery '\$configOut\["accountMode"\] = "DEMO"' "Recovery must restore DEMO task config."
Require $recovery '\$configOut\["liveExecutionEnabled"\] = \$false' "Recovery must disable LIVE in task config."
Require $recovery 'Start-ScheduledTask -TaskName \$BridgeTaskName' "Recovery must restart DEMO bridge task."
Require $recovery 'Start-ScheduledTask -TaskName \$ExecutorTaskName' "Recovery must restart DEMO executor task."
Require $recovery 'ExpectedAccountMode DEMO' "Recovery must strictly verify DEMO runtime."
Require $recovery 'PHASE7C_DEMO_RECOVERY_STATUS=PASS' "Recovery PASS marker is missing."
Forbid $recovery 'arm-phase7c-live-local\.ps1|Write-Phase7CLiveArmState' "Recovery must never arm LIVE."
Forbid $recovery 'order_send|/v1/orders/place|/v1/positions/close|/v1/positions/modify' "Recovery must not send broker mutations."

Require $guarded '\[switch\]\$ConfirmLiveExecution' "Guarded switch must require explicit confirmation."
Require $guarded 'if \(-not \$ConfirmLiveExecution\)' "Guarded switch confirmation must fail closed."
Require $guarded '& \$Preflight' "Guarded switch must run switch preflight."
Require $guarded '& \$Switcher' "Guarded switch must invoke canonical switcher only after preflight."
Require $guarded '& \$Recovery' "Guarded switch must invoke deterministic recovery on failure."
Require $guarded 'PHASE7C_GUARDED_LIVE_SWITCH_LIVE_ARM=DISARMED' "Guarded switch must finish DISARMED."
Require $guarded 'EXPLICIT_LIVE_ARM_APPROVAL_REQUIRED' "Guarded switch must preserve separate ARM approval boundary."
Forbid $guarded 'arm-phase7c-live-local\.ps1|Write-Phase7CLiveArmState' "Guarded switch must never arm LIVE."
Forbid $guarded 'order_send|/v1/orders/place|/v1/positions/close|/v1/positions/modify' "Guarded switch must not directly contain broker mutation paths."

Require $stopper 'PHASE7C_EXECUTOR_STOP=PASS' "Executor stopper PASS marker is missing."
Require $stopper '(?ms)PHASE7C_EXECUTOR_STOP=PASS.*?exit 0' "Executor stopper must explicitly return exit code 0 after successful cleanup so callers do not inherit stale native LASTEXITCODE values."
Require $stopper '(?ms)PHASE7C_EXECUTOR_STOP=FAIL.*?exit 1' "Executor stopper must retain explicit failure exit code 1."

$preflightIndex = $guarded.IndexOf('& $Preflight')
$switchIndex = $guarded.IndexOf('& $Switcher')
if ($preflightIndex -lt 0 -or $switchIndex -lt 0 -or $preflightIndex -gt $switchIndex) {
  throw "Guarded LIVE switch must execute preflight before canonical switcher."
}

Write-Host "PHASE7C_LIVE_SWITCH_RECOVERY_SOURCE_TEST=PASS"
