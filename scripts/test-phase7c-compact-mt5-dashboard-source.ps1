$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

function Read-Source([string]$Path) {
  $full = Join-Path $ProjectRoot $Path
  if (-not (Test-Path -LiteralPath $full)) { throw "Missing source file: $Path" }
  return Get-Content -LiteralPath $full -Raw
}

function Assert-Text([string]$Text, [string]$Pattern, [string]$Message) {
  if ($Text -notmatch $Pattern) { throw "Compact MT5 dashboard assertion failed: $Message" }
}

function Assert-NotText([string]$Text, [string]$Pattern, [string]$Message) {
  if ($Text -match $Pattern) { throw "Compact MT5 dashboard negative assertion failed: $Message" }
}

$mq5 = Read-Source "mt5\XAUUSD_AI_Master_Decision_Panel.mq5"
$ui = Read-Source "apps\api\src\services\phase7c-ui-contract.service.ts"

# Compact dimensions.
Assert-Text $mq5 'PANEL_MIN_WIDTH\s*=\s*500' "panel minimum width must remain compact"
Assert-Text $mq5 'PANEL_MAX_WIDTH\s*=\s*620' "panel maximum width must remain compact"
Assert-Text $mq5 'WAITING_HEIGHT\s*=\s*420' "waiting panel height must remain compact"
Assert-Text $mq5 'SETUP_HEIGHT\s*=\s*425' "setup panel height must remain compact"
Assert-Text $mq5 'MANAGING_HEIGHT\s*=\s*505' "managing panel height must remain compact"

# Legacy rule-oriented blocks must stay removed from the MQL panel.
Assert-NotText $mq5 'void\s+DrawFooter\s*\(' "legacy rule footer must stay removed"
Assert-NotText $mq5 'void\s+DrawGateCard\s*\(' "verbose legacy gate card must stay removed"
Assert-NotText $mq5 'breakEvenTriggerDistance' "strategy-rule trigger must not be rendered by panel"
Assert-NotText $mq5 'partialTriggerDistance' "partial-close rule trigger must not be rendered by panel"

# Required compact operator information is bound to canonical fields.
Assert-Text $mq5 'Field\(payload,\s*.setupEntry.' "panel must show setup entry"
Assert-Text $mq5 'Field\(payload,\s*.setupStopLoss.' "panel must show setup stoploss"
Assert-Text $mq5 'Field\(payload,\s*.setupTp2.' "panel must show setup take profit"
Assert-Text $mq5 'Field\(payload,\s*.entryReason1.' "panel must show entry reason"
Assert-Text $mq5 'Field\(payload,\s*.holdReason1.' "panel must show hold reason"
Assert-Text $mq5 'Field\(payload,\s*.exitReason1.' "panel must show latest exit reason"
Assert-Text $mq5 'Field\(payload,\s*.floatingPnlUsd.' "panel must show floating profit/loss"

# System status uses green/red dots and ON/OFF text.
Assert-Text $mq5 'FillCircle' "system status must use visible status dots"
Assert-Text $mq5 'on\s*\?\s*.ON.\s*:\s*.OFF.' "status dots must be paired with ON/OFF text"
Assert-Text $mq5 'BoolField\(payload,\s*.mt5Connected.' "panel must show MT5 connection status"
Assert-Text $mq5 'BoolField\(payload,\s*.accountGuardValid.' "panel must show account safety status"
Assert-Text $mq5 'BoolField\(payload,\s*.trendOn.' "panel must show bot Trend permission status"
Assert-Text $mq5 'BoolField\(payload,\s*.sidewayOn.' "panel must show bot Sideway permission status"

# Contract status truth and journal-based exit reasons.
Assert-Text $ui 'status:\s*\{' "UI contract must expose a status section"
Assert-Text $ui 'mt5Connected:\s*snapshot\.account\.reachable\s*===\s*true' "MT5 status must come from telemetry reachability"
Assert-Text $ui 'accountGuardValid:\s*snapshot\.safety\.accountGuardValid\s*===\s*true' "account safety status must come from canonical safety state"
Assert-Text $ui 'trendOn:\s*trendGate\s*===\s*.ALLOWED.' "bot Trend ON must reflect canonical gate"
Assert-Text $ui 'sidewayOn:\s*sidewayGate\s*===\s*.ALLOWED.' "bot Sideway ON must reflect canonical gate"
Assert-Text $ui 'function\s+exitReasons\s*\(' "UI contract must derive exit reasons"
Assert-Text $ui 'snapshot\.recentDecisions' "exit reason must come from canonical decision journal"
Assert-Text $ui 'exitReason1' "MT5 payload must include exit reason"

# Preserve read-only MT5 behavior.
Assert-Text $mq5 'WebRequest\(.GET.' "MT5 dashboard must remain GET-only"
Assert-NotText $mq5 'WebRequest\(.POST.' "MT5 dashboard must never POST controls"
Assert-NotText $mq5 'OrderSend\s*\(' "MT5 dashboard must not send orders"
Assert-Text $mq5 'ORDER PERMISSION = NONE' "read-only safety marker must remain"
Assert-Text $ui 'orderPermission:\s*.NONE.' "UI contract must remain read-only"

Write-Host "PHASE7C_COMPACT_MT5_DASHBOARD_SOURCE_TEST=PASS"