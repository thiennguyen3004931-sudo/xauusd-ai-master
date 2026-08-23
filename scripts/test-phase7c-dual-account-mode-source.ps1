$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

function Assert-Text([string]$Path, [string]$Pattern, [string]$Message) {
  $full = Join-Path $ProjectRoot $Path
  if (-not (Test-Path -LiteralPath $full)) { throw "Missing source file: $Path" }
  $text = Get-Content -LiteralPath $full -Raw
  if ($text -notmatch $Pattern) { throw "Static source assertion failed: $Message [$Path]" }
}
function Assert-NotText([string]$Path, [string]$Pattern, [string]$Message) {
  $full = Join-Path $ProjectRoot $Path
  $text = Get-Content -LiteralPath $full -Raw
  if ($text -match $Pattern) { throw "Static source negative assertion failed: $Message [$Path]" }
}

Assert-Text "apps/api/src/services/phase7c-decision-monitor.service.ts" 'accountModeAllowsBroker' "decision monitor must use selected account-mode broker guard"
Assert-Text "apps/api/src/services/phase7c-decision-monitor.service.ts" 'mt5PanelOrderPermission:\s*"NONE"' "MT5 decision monitor must remain read-only"
Assert-Text "apps/api/src/services/phase7c-decision-monitor.service.ts" 'phase7b-live-forward' "LIVE managed Trend state must be isolated"
Assert-Text "apps/api/src/services/phase7c-decision-monitor.service.ts" 'phase7c-sideway-live-forward' "LIVE managed Sideway state must be isolated"
Assert-Text "apps/api/src/services/phase7c-decision-monitor.service.ts" 'decision-observability' "decision journals must remain observable"

Assert-Text "apps/api/src/services/phase7c-ui-contract.service.ts" 'orderPermission:\s*"NONE"' "semantic UI must remain read-only"
Assert-Text "apps/api/src/services/phase7c-ui-contract.service.ts" 'accountMode:\s*"DEMO"\s*\|\s*"LIVE"' "semantic UI must expose account mode"
Assert-Text "apps/api/src/services/phase7c-lifecycle.service.ts" 'liveColdStartFromWeb:\s*false' "web must not cold-start LIVE"
Assert-Text "apps/api/src/services/phase7c-lifecycle.service.ts" 'ADMIN_SWITCH_PAUSE_THEN_OPERATOR_AUTO' "LIVE lifecycle must require verified admin switch first"
Assert-Text "apps/api/src/routes/phase7c.route.ts" 'router\.get\("/account-mode"' "API must expose read-only account mode"
Assert-Text "apps/api/src/routes/phase7c.route.ts" 'webCanSwitchAccount:\s*false' "API must not switch MT5 account from web"
Assert-Text "apps/api/src/routes/phase7c.route.ts" 'accountModeAllowsBroker' "lot settings must bind selected account"
Assert-Text "apps/api/src/services/phase7c-lot-settings.service.ts" 'phase7c-lot-settings\.\$\{accountMode\.toLowerCase\(\)\}\.json' "lot settings must persist per account"
Assert-Text "apps/api/src/services/phase7c-lot-settings.service.ts" 'active\.accountMode !== accountModeState\.accountMode' "active lot state must match selected account"
Assert-Text "apps/api/src/services/phase7c-account-risk.service.ts" 'executionMutation:\s*false' "account risk preview must remain read-only"
Assert-Text "apps/api/src/services/phase7c-account-risk.service.ts" 'orderPermission:\s*"NONE"' "account risk preview cannot send orders"

Assert-Text "scripts/phase7c-account-runtime-guard.mjs" 'url\.pathname !== "/v1/orders"' "account guard must specifically gate new orders"
Assert-Text "scripts/phase7c-account-runtime-guard.mjs" 'ACCOUNT_LOGIN_NOT_ALLOWLISTED' "final account gate must enforce allowlist"
Assert-Text "scripts/run-phase7c-sideway-locked.mjs" 'fetchHealthUnderLock' "Sideway must recheck account under execution lock"
Assert-Text "scripts/run-phase7c-sideway-locked.mjs" 'POSITION_PRESENT_UNDER_LOCK' "Sideway must retain single-position final check"
Assert-Text "scripts/run-phase7c-trend-account-mode.mjs" 'installPhase7CAccountOrderFetchGuard' "Trend must install final account gate"

Assert-NotText "packages/mt5-broker/bridge/.env.phase7b-live.example" 'MT5_PASSWORD\s*=\s*[^<\r\n][^\r\n]*' "LIVE example must not contain a real password"
Assert-Text ".gitignore" '/phase7b-live-forward/' "LIVE Trend state must be ignored locally"
Assert-Text ".gitignore" '/phase7c-sideway-live-forward/' "LIVE Sideway state must be ignored locally"
Assert-Text ".gitignore" '/phase7c-lot-settings\.live\.json' "LIVE risk profile must remain local"

Write-Host "PHASE7C_DUAL_ACCOUNT_SOURCE_TEST=PASS"
