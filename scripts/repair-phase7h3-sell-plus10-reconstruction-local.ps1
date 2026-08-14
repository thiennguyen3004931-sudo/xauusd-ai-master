param()

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$servicePath = Join-Path $repoRoot "apps/api/src/services/phase7e-realignment.service.ts"

if (-not (Test-Path $servicePath)) {
  throw "Phase 7E service not found: $servicePath"
}

$raw = [System.IO.File]::ReadAllText($servicePath)
$newline = if ($raw.Contains("`r`n")) { "`r`n" } else { "`n" }
$content = $raw.Replace("`r`n", "`n")

$startMarker = "function phase7h3FirstPlus10Event("
$endMarker = "function phase7h3HigherTimeframeTargetAt("
$start = $content.IndexOf($startMarker, [System.StringComparison]::Ordinal)
if ($start -lt 0) { throw "Phase 7H.3 +10 reconstruction function not found. Apply Phase 7H.3 first." }
$end = $content.IndexOf($endMarker, $start, [System.StringComparison]::Ordinal)
if ($end -lt 0) { throw "Phase 7H.3 +10 reconstruction end marker not found." }

$block = $content.Substring($start, $end - $start)
$old = @'
      const favorable = trade.side === "BUY"
        ? bar.high - trade.entry
        : trade.entry - (bar.low + bar.spread);
'@
$new = @'
      // Match canonical partial-trigger semantics exactly: favorable threshold
      // is evaluated from the broker candle extreme. Spread remains relevant
      // to realized SELL exit/PnL, but it is not subtracted from the +10
      // management trigger itself.
      const favorable = trade.side === "BUY"
        ? bar.high - trade.entry
        : trade.entry - bar.low;
'@
$old = $old.Replace("`r`n", "`n")
$new = $new.Replace("`r`n", "`n")

if ($block.Contains($new)) {
  Write-Host "PHASE7H3_SELL_PLUS10_REPAIR=ALREADY_APPLIED"
  Write-Host "PHASE7H3_SELL_TRIGGER_SEMANTICS=CANONICAL_BID_LOW_THRESHOLD"
  exit 0
}

if (-not $block.Contains($old)) {
  throw "Phase 7H.3 SELL +10 expression does not match the expected pre-repair revision. Stop to avoid patching unrelated logic."
}

$patchedBlock = $block.Replace($old, $new)
$content = $content.Substring(0, $start) + $patchedBlock + $content.Substring($end)

# Validate only the Phase 7H.3 reconstruction function changed semantically.
$verifyEnd = $content.IndexOf($endMarker, $start, [System.StringComparison]::Ordinal)
$verifyBlock = $content.Substring($start, $verifyEnd - $start)
if (-not $verifyBlock.Contains(': trade.entry - bar.low;')) {
  throw "Phase 7H.3 SELL +10 repair validation failed."
}
if ($verifyBlock.Contains(': trade.entry - (bar.low + bar.spread);')) {
  throw "Phase 7H.3 stale SELL +10 reconstruction remains after repair."
}

if ($newline -eq "`r`n") { $content = $content.Replace("`n", "`r`n") }
[System.IO.File]::WriteAllText($servicePath, $content, (New-Object System.Text.UTF8Encoding($false)))

Write-Host "PHASE7H3_SELL_PLUS10_REPAIR=PASS"
Write-Host "PHASE7H3_SELL_TRIGGER_SEMANTICS=CANONICAL_BID_LOW_THRESHOLD"
Write-Host "PHASE7H3_BUY_TRIGGER_SEMANTICS=CANONICAL_ASK_HIGH_THRESHOLD"
Write-Host "PHASE7H3_PRODUCTION_ENTRY_MUTATION=False"
Write-Host "PHASE7H3_PRODUCTION_MANAGEMENT_MUTATION=False"
Write-Host "PHASE7H3_EXECUTION_ELIGIBLE=False"
Write-Host "PHASE7H3_NEXT=pnpm --filter @xauusd/api build"
