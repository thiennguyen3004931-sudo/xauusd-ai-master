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
  webApi = Join-Path $ProjectRoot "apps\web\src\api.ts"
  webTypes = Join-Path $ProjectRoot "apps\web\src\phase7c-types.ts"
  executionCard = Join-Path $ProjectRoot "apps\web\src\ui\Phase7CExecutionAuthorizationCard.tsx"
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
$webApi = Get-Content -LiteralPath $files.webApi -Raw
$webTypes = Get-Content -LiteralPath $files.webTypes -Raw
$executionCard = Get-Content -LiteralPath $files.executionCard -Raw
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
Assert-NotContains $runner 'order_send|/v1/orders\s*$' 'runner must not submit broker orders'

Assert-Literal $armService 'XAUUSD-Phase7C-Live-Arm-Control' 'API uses fixed elevated task'
Assert-Literal $armService 'PREFLIGHT_TTL_MS = 45_000' 'short-lived ARM preflight'
Assert-Literal $armService 'source: "LOCAL_WEB"' 'fixed local Web request source'
Assert-Literal $armService 'schtasks.exe' 'scheduled task invocation'
Assert-Literal $armService 'ARM_LIVE' 'ARM API action'
Assert-Literal $armService 'DISARM_LIVE' 'DISARM API action'
Assert-NotContains $armService 'writeFileSync\([^\r\n]*phase7c-live-arm|order_send' 'API must not write ARM file or send order directly'
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

Assert-Literal $webApi 'getPhase7CLiveArmControlCapability' 'Web ARM capability API'
Assert-Literal $webApi 'createPhase7CLiveArmPreflight' 'Web ARM preflight API'
Assert-Literal $webApi 'executePhase7CLiveArmAction' 'Web ARM execute API'
Assert-Literal $webApi 'getPhase7CAutoActivationStatus' 'Web AUTO status API'
Assert-Literal $webApi 'enablePhase7CAuto' 'Web guarded AUTO enable API'
Assert-Literal $webTypes 'Phase7CLiveArmControlCapability' 'Web ARM types'
Assert-Literal $webTypes 'Phase7CAutoActivationStatus' 'Web AUTO types'

Assert-Literal $executionCard 'ARM LIVE' 'ARM LIVE button'
Assert-Literal $executionCard 'DISARM LIVE' 'DISARM LIVE button'
Assert-Literal $executionCard 'BẬT AUTO DEMO' 'explicit DEMO AUTO button'
Assert-Literal $executionCard 'enablePhase7CAuto' 'DEMO AUTO uses guarded backend'
Assert-Literal $executionCard 'createPhase7CLiveArmPreflight' 'ARM uses preflight'
Assert-NotContains $executionCard 'phase7c-live-arm\.json' 'Web must not touch ARM file directly'
Assert-Literal $controlShell 'Phase7CExecutionAuthorizationCard' 'execution card shown in Control Center'
Assert-Literal $controlShell 'Phase7CControlCenterPage' 'existing Control Center preserved'
Assert-Literal $accountRisk 'Phase7CExecutionAuthorizationCard' 'execution card shown in Account/Risk'
Assert-Literal $router 'Phase7CControlCenterShellPage' 'Control Center routes through execution shell'

Write-Host "PHASE7C_WEB_LIVE_ARM_DEMO_AUTO_SOURCE_TEST=PASS"
