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

# Compact dimensions: keep the panel materially smaller than the legacy 760-860px canvas.
Assert-Text $mq5 'PANEL_MIN_WIDTH\s*=\s*500' "panel minimum width must remain compact"
Assert-Text $mq5 'PANEL_MAX_WIDTH\s*=\s*620' "panel maximum width must remain compact"
Assert-Text $mq5 'WAITING_HEIGHT\s*=\s*420' "waiting panel height must remain compact"
Assert-Text $mq5 'SETUP_HEIGHT\s*=\s*425' "setup panel height must remain compact"
Assert-Text $mq5 'MANAGING_HEIGHT\s*=\s*505' "managing panel height must remain compact"

# The user-facing MT5 dashboard must not reintroduce strategy-rule blocks.
Assert-NotText $mq5 'HÒA VỐN \+6' "legacy break-even rule footer must stay removed"
Assert-NotText $mq5 'CHỐT 1/3 TẠI \+10' "legacy partial-close rule footer must stay removed"
Assert-NotText $mq5 'QUẢN TRỊ LỆNH' "rule-style management card must stay removed"
Assert-NotText $mq5 'BỘ LỌC VÀ QUYỀN HOẠT ĐỘNG' "verbose legacy gate card must stay removed"

# Required compact operator information.
Assert-Text $mq5 '"ENTRY"' "panel must show entry"
Assert-Text $mq5 '"STOPLOSS"' "panel must show stoploss"
Assert-Text $mq5 '"TP"' "panel must show take profit"
Assert-Text $mq5 'LÝ DO VÀO LỆNH' "panel must show entry reason"
Assert-Text $mq5 'LÝ DO GIỮ LỆNH' "panel must show hold reason"
Assert-Text $mq5 'LÝ DO CHỐT GẦN NHẤT' "panel must show latest exit reason"
Assert-Text $mq5 'Lãi/lỗ:' "panel must show floating profit/loss"

# System status is intentionally rendered as green/red ON/OFF indicators.
Assert-Text $mq5 'FillCircle' "system status must use visible status dots"
Assert-Text $mq5 'on \? "ON" : "OFF"' "status dots must be paired with ON/OFF text"
Assert-Text $mq5 'BoolField\(payload, "mt5Connected"\)' "panel must show MT5 connection status"
Assert-Text $mq5 'BoolField\(payload, "accountGuardValid"\)' "panel must show account safety status"
Assert-Text $mq5 'BoolField\(payload, "trendOn"\)' "panel must show bot Trend permission status"
Assert-Text $mq5 'BoolField\(payload, "sidewayOn"\)' "panel must show bot Sideway permission status"

# Contract must expose status truth and real journal-based exit reasons.
Assert-Text $ui 'status:\s*\{' "UI contract must expose a status section"
Assert-Text $ui 'mt5Connected:\s*snapshot\.account\.reachable\s*===\s*true' "MT5 status must come from telemetry reachability"
Assert-Text $ui 'accountGuardValid:\s*snapshot\.safety\.accountGuardValid\s*===\s*true' "account safety status must come from canonical safety state"
Assert-Text $ui 'trendOn:\s*trendGate\s*===\s*"ALLOWED"' "bot Trend ON must reflect canonical gate"
Assert-Text $ui 'sidewayOn:\s*sidewayGate\s*===\s*"ALLOWED"' "bot Sideway ON must reflect canonical gate"
Assert-Text $ui 'function exitReasons\(' "UI contract must derive exit reasons"
Assert-Text $ui 'snapshot\.recentDecisions' "exit reason must come from canonical decision journal"
Assert-Text $ui '\["exitReason1",\s*exit\[0\]\]' "MT5 payload must include exit reason"

# Preserve read-only MT5 behavior.
Assert-Text $mq5 'WebRequest\("GET"' "MT5 dashboard must remain GET-only"
Assert-NotText $mq5 'WebRequest\("POST"' "MT5 dashboard must never POST controls"
Assert-NotText $mq5 'OrderSend\s*\(' "MT5 dashboard must not send orders"
Assert-Text $mq5 'ORDER PERMISSION = NONE' "read-only safety marker must remain"
Assert-Text $ui 'orderPermission:\s*"NONE"' "UI contract must remain read-only"

Write-Host "PHASE7C_COMPACT_MT5_DASHBOARD_SOURCE_TEST=PASS"