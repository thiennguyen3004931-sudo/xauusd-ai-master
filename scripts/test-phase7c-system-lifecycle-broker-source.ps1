$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LifecycleService = Join-Path $ProjectRoot "apps\api\src\services\phase7c-lifecycle.service.ts"
$BrokerService = Join-Path $ProjectRoot "apps\api\src\services\phase7c-lifecycle-broker.service.ts"
$BrokerRunner = Join-Path $PSScriptRoot "run-phase7c-executor-task-runner-local.ps1"

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

foreach ($required in @($LifecycleService, $BrokerRunner)) {
  Assert-True (Test-Path -LiteralPath $required) "Missing lifecycle broker source dependency: $required"
}
Assert-PowerShellSyntax $BrokerRunner

$lifecycle = Get-Content -LiteralPath $LifecycleService -Raw
$runner = Get-Content -LiteralPath $BrokerRunner -Raw

# Web/API must become an unprivileged file-protocol client only.
Assert-True (Test-Path -LiteralPath $BrokerService) "Lifecycle broker client service must exist"
$brokerClient = Get-Content -LiteralPath $BrokerService -Raw
Assert-True ($lifecycle -match 'phase7c-lifecycle-broker\.service') "Lifecycle service must delegate privileged mutations to broker client"
foreach ($forbidden in @(
  'schtasks\.exe',
  'taskkill\.exe',
  'runStopper\s*\(',
  'launchSelectedSupervisor\s*\(',
  'run-phase7c-executors-local\.ps1'
)) {
  Assert-True (-not ($lifecycle -match $forbidden)) "Web lifecycle must not own privileged executor mutation; forbidden pattern=$forbidden"
}
Assert-True ($brokerClient -match 'phase7c-lifecycle-broker') "Broker client must use the dedicated lifecycle broker runtime"
Assert-True ($brokerClient -match 'inbox') "Broker client must write only through the broker inbox"
Assert-True ($brokerClient -match 'results') "Broker client must reconcile immutable per-request results"
Assert-True ($brokerClient -match 'requestId') "Broker client must correlate lifecycle results by requestId"
Assert-True ($brokerClient -match 'START') "Broker client must support START"
Assert-True ($brokerClient -match 'STOP') "Broker client must support STOP"
Assert-True ($brokerClient -match 'RESTART') "Broker client must support RESTART"
Assert-True ($brokerClient -match 'WEB_CONTROL_CENTER') "Broker client must use the closed source enum"
Assert-True (-not ($brokerClient -match '(?i)(commandLine|scriptPath|executablePath|powershell|taskkill|schtasks)')) "Broker request client must not expose arbitrary/elevated command fields"

# SYSTEM broker boot policy is fail-safe: alive broker, executors stopped, PAUSE.
Assert-True ($runner -match 'phase7c-lifecycle-broker') "SYSTEM runner must own the lifecycle broker runtime"
Assert-True ($runner -match 'inbox') "SYSTEM runner must consume broker inbox requests"
Assert-True ($runner -match 'results') "SYSTEM runner must persist request results"
Assert-True ($runner -match 'heartbeat') "SYSTEM runner must publish broker heartbeat"
Assert-True ($runner -match 'desiredExecutorState') "SYSTEM runner must track desired executor state"
Assert-True ($runner -match '(?i)STOPPED') "Broker must boot with desired executor state STOPPED"
Assert-True ($runner -match '(?i)IDLE') "Broker must expose IDLE state"
Assert-True ($runner -match '(?i)PAUSE') "Broker startup/recovery must enforce PAUSE"
Assert-True (-not ($runner -match '(?s)while\s*\(\$true\).*?Start-Process.*?run-phase7c-executors-local')) "Broker boot loop must not unconditionally launch the executor supervisor"

# Closed request protocol and core safety reason codes must be represented in SYSTEM source.
foreach ($requiredPattern in @(
  'REJECT_BROKER_BUSY',
  'REJECT_REQUEST_INVALID',
  'REJECT_REQUEST_STALE',
  'REJECT_REQUEST_DUPLICATE',
  'REJECT_OPEN_XAUUSD_POSITION',
  'REJECT_BOT_NOT_PAUSED',
  'REJECT_LIVE_AUTH_INVALID',
  'OK_STARTED',
  'OK_STOPPED',
  'OK_RESTARTED'
)) {
  Assert-True ($runner -match $requiredPattern) "SYSTEM broker must expose canonical contract token=$requiredPattern"
}

# RESTART is a two-boundary mutation: after STOP and config reload, safety must be
# re-probed immediately before START so account/MT5/trading changes fail closed.
Assert-True ($runner -match '(?s)# Critical: re-read task/account/lot configuration after stop and before launch\.\s*\$config\s*=\s*Read-Phase7CCanonicalLaunchConfig\s*\$script:accountMode\s*=\s*\[string\]\$config\.accountMode\s*\$postStopContext\s*=\s*Get-BrokerSafetyContext\s+\$config\s*\$postStopGate\s*=\s*Test-Phase7CLifecycleBrokerSafetyGate\s+-Action\s+"START"\s+-Context\s+\$postStopContext') "RESTART must re-run the START safety gate after STOP/config reload and before launching the supervisor"

# Lifecycle START/RESTART must not invent or require session ARM. AUTO ARM stays elsewhere.
Assert-True (-not ($runner -match 'REJECT_LIVE_ARM_INVALID')) "Lifecycle broker must not require session LIVE ARM for START/RESTART"

Write-Host "PHASE7C_SYSTEM_LIFECYCLE_BROKER_SOURCE_TEST=PASS"
