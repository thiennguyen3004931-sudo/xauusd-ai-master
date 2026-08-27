$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

$files = @{
  register = Join-Path $ProjectRoot "scripts\register-phase7c-live-arm-control-task-local.ps1"
  runner = Join-Path $ProjectRoot "scripts\run-phase7c-live-arm-control-task-runner-local.ps1"
  service = Join-Path $ProjectRoot "apps\api\src\services\phase7c-live-arm-control.service.ts"
  route = Join-Path $ProjectRoot "apps\api\src\routes\phase7c-live-arm-control.route.ts"
  app = Join-Path $ProjectRoot "apps\api\src\app.ts"
  lifecycle = Join-Path $ProjectRoot "apps\api\src\services\phase7c-lifecycle.service.ts"
  phase7cRoute = Join-Path $ProjectRoot "apps\api\src\routes\phase7c.route.ts"
  webApi = Join-Path $ProjectRoot "apps\web\src\api.ts"
  webTypes = Join-Path $ProjectRoot "apps\web\src\phase7c-types.ts"
  controlCenter = Join-Path $ProjectRoot "apps\web\src\pages\Phase7CControlCenterPage.tsx"
}
foreach ($entry in $files.GetEnumerator()) {
  if (-not (Test-Path -LiteralPath $entry.Value)) { throw "Missing LIVE arm/DEMO auto source: $($entry.Key) $($entry.Value)" }
}

$register = Get-Content -LiteralPath $files.register -Raw
$runner = Get-Content -LiteralPath $files.runner -Raw
$service = Get-Content -LiteralPath $files.service -Raw
$route = Get-Content -LiteralPath $files.route -Raw
$app = Get-Content -LiteralPath $files.app -Raw
$lifecycle = Get-Content -LiteralPath $files.lifecycle -Raw
$phase7cRoute = Get-Content -LiteralPath $files.phase7cRoute -Raw
$webApi = Get-Content -LiteralPath $files.webApi -Raw
$webTypes = Get-Content -LiteralPath $files.webTypes -Raw
$controlCenter = Get-Content -LiteralPath $files.controlCenter -Raw

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

Assert-Literal $service 'XAUUSD-Phase7C-Live-Arm-Control' 'API uses fixed elevated task'
Assert-Literal $service 'PREFLIGHT_TTL_MS = 45_000' 'short-lived ARM preflight'
Assert-Literal $service 'source: "LOCAL_WEB"' 'fixed local Web request source'
Assert-Literal $service 'schtasks.exe' 'scheduled task invocation'
Assert-Literal $service 'ARM_LIVE' 'ARM API action'
Assert-Literal $service 'DISARM_LIVE' 'DISARM API action'
Assert-NotContains $service 'writeFileSync\([^\r\n]*phase7c-live-arm|order_send' 'API must not write ARM file or send order directly'

Assert-Literal $route 'LIVE ARM control is restricted to localhost.' 'localhost API guard'
Assert-Literal $route '/preflight' 'ARM preflight endpoint'
Assert-Literal $route '/execute' 'ARM execute endpoint'
Assert-Literal $route '/status' 'ARM status endpoint'
Assert-Literal $app '/api/v1/phase7c-live-arm-control' 'ARM route mounted'

Assert-Literal $lifecycle 'assertPhase7CAutoActivationReady' 'server-side AUTO safety guard'
Assert-Literal $lifecycle 'accountModeState.accountMode === "LIVE"' 'LIVE-only ARM requirement branch'
Assert-Literal $lifecycle 'liveExecutionArmed' 'LIVE ARM check'
Assert-Literal $lifecycle 'telemetry.positions.length > 0' 'AUTO flat-position guard'
Assert-Literal $phase7cRoute 'assertPhase7CAutoActivationReady' 'AUTO route invokes server safety guard'
Assert-Contains $phase7cRoute 'requestedMode\s*===\s*"AUTO"[\s\S]*await\s+getMt5Telemetry\("XAUUSD"\)' 'AUTO route reads fresh telemetry'

Assert-Literal $webApi 'getPhase7CLiveArmControlCapability' 'Web ARM capability API'
Assert-Literal $webApi 'createPhase7CLiveArmPreflight' 'Web ARM preflight API'
Assert-Literal $webApi 'executePhase7CLiveArmAction' 'Web ARM execute API'
Assert-Literal $webTypes 'Phase7CLiveArmControlCapability' 'Web ARM types'
Assert-Literal $controlCenter 'ARM LIVE' 'ARM LIVE button'
Assert-Literal $controlCenter 'DISARM LIVE' 'DISARM LIVE button'
Assert-Literal $controlCenter 'BẬT AUTO DEMO' 'explicit DEMO AUTO button'
Assert-Literal $controlCenter 'canAttemptAuto' 'clickable AUTO attempt gate'
Assert-NotContains $controlCenter 'disabled=\{!canEnableAuto' 'old opaque AUTO disabled gate removed'
Assert-NotContains $controlCenter 'phase7c-live-arm\.json' 'Web must not touch ARM file directly'

Write-Host "PHASE7C_WEB_LIVE_ARM_DEMO_AUTO_SOURCE_TEST=PASS"
