$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

$files = @{
  register = Join-Path $ProjectRoot "scripts\register-phase7c-live-arm-control-task-local.ps1"
  runner = Join-Path $ProjectRoot "scripts\run-phase7c-live-arm-control-task-runner-local.ps1"
  armService = Join-Path $ProjectRoot "apps\api\src\services\phase7c-live-arm-control.service.ts"
  armRoute = Join-Path $ProjectRoot "apps\api\src\routes\phase7c-live-arm-control.route.ts"
  autoService = Join-Path $ProjectRoot "apps\api\src\services\phase7c-auto-activation.service.ts"
  autoRoute = Join-Path $ProjectRoot "apps\api\src\routes\phase7c-auto-activation.route.ts"
  app = Join-Path $ProjectRoot "apps\api\src\app.ts"
  webControl = Join-Path $ProjectRoot "apps\web\src\phase7c-execution-control.ts"
  executionCard = Join-Path $ProjectRoot "apps\web\src\ui\Phase7CExecutionAuthorizationCard.tsx"
  controlCenter = Join-Path $ProjectRoot "apps\web\src\pages\Phase7CControlCenterPage.tsx"
  controlShell = Join-Path $ProjectRoot "apps\web\src\pages\Phase7CControlCenterShellPage.tsx"
  accountRisk = Join-Path $ProjectRoot "apps\web\src\pages\Phase7CAccountRiskPage.tsx"
  router = Join-Path $ProjectRoot "apps\web\src\router.tsx"
}
foreach ($entry in $files.GetEnumerator()) {
  if (-not (Test-Path -LiteralPath $entry.Value)) { throw "Missing LIVE arm/DEMO auto source: $($entry.Key) $($entry.Value)" }
}

$register = Get-Content -LiteralPath $files.register -Raw
$runner = Get-Content -LiteralPath $files.runner -Raw
$armService = Get-Content -LiteralPath $files.armService -Raw
$armRoute = Get-Content -LiteralPath $files.armRoute -Raw
$autoService = Get-Content -LiteralPath $files.autoService -Raw
$autoRoute = Get-Content -LiteralPath $files.autoRoute -Raw
$app = Get-Content -LiteralPath $files.app -Raw
$webControl = Get-Content -LiteralPath $files.webControl -Raw
$executionCard = Get-Content -LiteralPath $files.executionCard -Raw
$controlCenter = Get-Content -LiteralPath $files.controlCenter -Raw
$controlShell = Get-Content -LiteralPath $files.controlShell -Raw
$accountRisk = Get-Content -LiteralPath $files.accountRisk -Raw
$router = Get-Content -LiteralPath $files.router -Raw

[void][scriptblock]::Create($register)
[void][scriptblock]::Create($runner)

function Assert-Contains([string]$Source, [string]$Pattern, [string]$Label) {
  if ($Source -notmatch $Pattern) { throw "Missing LIVE arm/DEMO auto marker: $Label" }
}
function Assert-Literal([string]$Source, [string]$Text, [string]$Label) {
  if ($Source.IndexOf($Text, [System.StringComparison]::Ordinal) -lt 0) { throw "Missing LIVE arm/DEMO auto literal: $Label" }
}
function Assert-NotContains([string]$Source, [string]$Pattern, [string]$Label) {
  if ($Source -match $Pattern) { throw "Forbidden LIVE arm/DEMO auto pattern: $Label" }
}

Assert-Literal $register 'XAUUSD-Phase7C-Live-Arm-Control' 'fixed elevated ARM task name'
Assert-Literal $register 'run-phase7c-live-arm-control-task-runner-local.ps1' 'fixed ARM task runner'
Assert-Contains $register 'RunLevel\s+Highest' 'RunLevel Highest'
Assert-Contains $register 'Administrator' 'administrator registration guard'
Assert-NotContains $register 'New-ScheduledTaskTrigger' 'ARM task must have no automatic trigger'

Assert-Contains $runner 'Administrator' 'runner administrator guard'
Assert-Literal $runner 'source -ne "LOCAL_WEB"' 'strict local Web source'
Assert-Literal $runner 'ARM_LIVE' 'typed ARM action'
Assert-Literal $runner 'DISARM_LIVE' 'typed DISARM action'
Assert-Contains $runner 'ageMs.*60000|60000.*ageMs' 'request TTL'
Assert-Literal $runner 'arm-phase7c-live-local.ps1' 'canonical ARM script'
Assert-Literal $runner 'disarm-phase7c-live-local.ps1' 'canonical DISARM script'
Assert-Literal $runner 'get-phase7c-live-arm-local.ps1' 'canonical status script'
Assert-Literal $runner 'PHASE7C_WEB_LIVE_ARM_CONTROL_ORDER_SEND=False' 'explicit no-order audit marker'
Assert-NotContains $runner 'Invoke-RestMethod[^\r\n]+/v1/orders' 'runner must not call broker order endpoint directly'

Assert-Literal $armService 'XAUUSD-Phase7C-Live-Arm-Control' 'API uses fixed elevated task'
Assert-Literal $armService 'PREFLIGHT_TTL_MS = 45_000' 'short-lived ARM preflight'
Assert-Literal $armService 'source: "LOCAL_WEB"' 'fixed local Web request source'
Assert-Literal $armService 'schtasks.exe' 'scheduled task invocation'
Assert-Literal $armService 'ARM_LIVE' 'ARM API action'
Assert-Literal $armService 'DISARM_LIVE' 'DISARM API action'
Assert-NotContains $armService '/v1/orders' 'API service must not call broker order endpoint directly'
Assert-Literal $armRoute 'LIVE ARM control is restricted to localhost.' 'localhost ARM API guard'
Assert-Literal $armRoute '/preflight' 'ARM preflight endpoint'
Assert-Literal $armRoute '/execute' 'ARM execute endpoint'
Assert-Literal $armRoute '/status' 'ARM status endpoint'

Assert-Literal $autoService 'evaluatePhase7CAutoActivation' 'server-side AUTO safety evaluation'
Assert-Literal $autoService 'accountMode.accountMode === "LIVE"' 'LIVE-only ARM branch'
Assert-Literal $autoService 'liveExecutionArmed' 'LIVE ARM check'
Assert-Literal $autoService 'telemetry.positions.length === 0' 'AUTO flat-position guard'
Assert-Literal $autoService 'lifecycle.ready' 'runtime READY guard'
Assert-Literal $autoService 'phase7CBotModeService.set("AUTO", "web-control-center")' 'canonical Web AUTO mutation'
Assert-Literal $autoRoute 'AUTO activation is restricted to localhost.' 'localhost AUTO API guard'
Assert-Literal $autoRoute '/status' 'AUTO eligibility status endpoint'
Assert-Literal $autoRoute '/enable' 'guarded AUTO enable endpoint'

Assert-Literal $app '/api/v1/phase7c-live-arm-control' 'ARM route mounted'
Assert-Literal $app '/api/v1/phase7c-auto-activation' 'AUTO route mounted'

Assert-Literal $webControl 'getPhase7CLiveArmControlCapability' 'Web ARM capability API'
Assert-Literal $webControl 'createPhase7CLiveArmPreflight' 'Web ARM preflight API'
Assert-Literal $webControl 'executePhase7CLiveArmAction' 'Web ARM execute API'
Assert-Literal $webControl 'getPhase7CAutoActivationStatus' 'Web AUTO status API'
Assert-Literal $webControl 'enablePhase7CAuto' 'Web guarded AUTO enable API'
Assert-Literal $webControl 'Phase7CLiveArmControlCapability' 'Web ARM types'
Assert-Literal $webControl 'Phase7CAutoActivationStatus' 'Web AUTO types'

Assert-Literal $executionCard 'ARM LIVE' 'ARM LIVE button'
Assert-Literal $executionCard 'DISARM LIVE' 'DISARM LIVE button'
Assert-Literal $executionCard 'enablePhase7CAuto' 'DEMO AUTO uses guarded backend'
Assert-Literal $executionCard 'createPhase7CLiveArmPreflight' 'ARM uses preflight'
Assert-Literal $executionCard 'canAttemptAuto' 'AUTO attempt remains clickable for canonical backend error'
Assert-NotContains $executionCard 'phase7c-live-arm\.json' 'Web must not touch ARM file directly'

# Compact operator-facing ARM/AUTO UI. Exact Vietnamese copy is validated by the Web build;
# source assertions remain ASCII so Windows PowerShell 5.1 parses this test without a UTF-8 BOM.
Assert-Literal $executionCard 'showArmChecks' 'ARM detail disclosure state'
Assert-Literal $executionCard 'setShowArmChecks' 'ARM detail disclosure control'
Assert-Literal $executionCard 'showAutoChecks' 'AUTO detail disclosure state'
Assert-Literal $executionCard 'setShowAutoChecks' 'AUTO detail disclosure control'
Assert-Literal $executionCard 'CheckRows' 'shared compact safety detail rows'
Assert-Literal $executionCard 'armCount.passed' 'compact ARM passed count'
Assert-Literal $executionCard 'armCount.total' 'compact ARM total count'
Assert-Literal $executionCard 'autoCount.passed' 'compact AUTO passed count'
Assert-Literal $executionCard 'autoCount.total' 'compact AUTO total count'
Assert-Contains $executionCard 'accountMode\s*===\s*"LIVE"\s*\?\s*\(' 'ARM condition control rendered only for LIVE'

Assert-Literal $controlCenter 'enablePhase7CAuto' 'legacy Control Center AUTO uses guarded backend'
Assert-Contains $controlCenter 'disabled=\{[^}]*mode\s*===\s*"AUTO"[^}]*\}' 'legacy AUTO disables only when already AUTO/pending'
Assert-NotContains $controlCenter 'disabled=\{!canEnableAuto' 'legacy opaque AUTO disabled gate removed'

Assert-Literal $controlShell 'Phase7CExecutionAuthorizationCard' 'execution card shown in Control Center'
Assert-Literal $controlShell 'Phase7CControlCenterPage' 'existing Control Center preserved'
Assert-NotContains $accountRisk 'Phase7CExecutionAuthorizationCard' 'Account/Risk must not duplicate ARM/AUTO card'
Assert-Literal $router 'Phase7CControlCenterShellPage' 'Control Center routes through execution shell'

Write-Host "PHASE7C_WEB_LIVE_ARM_DEMO_AUTO_SOURCE_TEST=PASS"
