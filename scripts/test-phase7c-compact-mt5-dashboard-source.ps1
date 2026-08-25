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

# Decision reasons must remain compact but readable: wrap to at most two lines
# with a dedicated label column and enough row spacing to avoid overlap.
Assert-Text $mq5 'void\s+WrapTextTwoLines\s*\(' "panel must provide two-line reason wrapping"
Assert-Text $mq5 'WrapTextTwoLines\(\s*ReasonVi\(reason,\s*fallback\)' "decision reasons must use the two-line wrapper"
Assert-Text $mq5 'REASON_LABEL_WIDTH\s*=\s*128' "reason text must start after a dedicated 128px label column"
Assert-Text $mq5 'REASON_SECOND_LINE_OFFSET\s*=\s*12' "wrapped reason second line must use compact safe spacing"
Assert-Text $mq5 'REASON_WAITING_ROW_STEP\s*=\s*34' "waiting reason rows must not overlap"
Assert-Text $mq5 'REASON_MANAGING_ROW_STEP\s*=\s*31' "managing reason rows must not overlap"
Assert-Text $mq5 'state\s*==\s*.MANAGING.\s*\?\s*180\s*:\s*\(state\s*==\s*.SETUP_READY.\s*\?\s*104\s*:\s*96\)' "reason cards must allocate enough height inside compact panels"
Assert-Text $mq5 'DrawReasonSummary\(payload,\s*width,\s*314,\s*.WAITING.\)' "waiting reason card must move up to preserve total panel height"
Assert-Text $mq5 'DrawReasonSummary\(payload,\s*width,\s*316,\s*.MANAGING.\)' "managing reason card must move up to preserve total panel height"
Assert-NotText $mq5 'FitText\(ReasonVi\(reason,\s*fallback\)' "decision reason must not be single-line truncated"

# Entry blocker rows must use a compact label/status/value form and collapse
# repeated transitions such as PAUSE -> PAUSE to a single PAUSE value.
Assert-Text $mq5 'string\s+CompactEntryCheckLabel\s*\(' "entry blocker labels must have a compact formatter"
Assert-Text $mq5 'StringReplace\(out,\s*.Mode / Regime.,\s*.Mode/Regime.' "Mode / Regime label must be compacted"
Assert-Text $mq5 'string\s+CompactEntryCheckActual\s*\(' "entry blocker actual value must have a compact formatter"
Assert-Text $mq5 'StringReplace\(out,\s*"PAUSE[^"]*PAUSE",\s*"PAUSE"' "duplicate PAUSE transition must collapse"
Assert-Text $mq5 'EntryCheckStatusVi\(status\)\s*\+\s*"[^"]*"\s*\+\s*CompactEntryCheckLabel\(label\)' "blocker row must render compact status and label"
Assert-Text $mq5 'CompactEntryCheckActual\(actual\)' "blocker row must use compact actual values"
Assert-NotText $mq5 'trend_label\s*\+\s*"[^"]*"\s*\+\s*trend_actual' "legacy verbose Trend blocker concatenation must stay removed"
Assert-NotText $mq5 'sideway_label\s*\+\s*"[^"]*"\s*\+\s*sideway_actual' "legacy verbose Sideway blocker concatenation must stay removed"

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