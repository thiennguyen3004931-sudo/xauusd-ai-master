param(
  [string]$WorkDir = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($WorkDir)) {
  $WorkDir = Join-Path $Root ".runtime"
}
New-Item -ItemType Directory -Path $WorkDir -Force | Out-Null
$WorkDir = (Resolve-Path $WorkDir).Path

$checks = @(
  @{ Path = "scripts\run-phase7b-demo-controller.ts"; Tokens = @(
    "PHASE7B_DEMO_ENTRY_GATE=PATTERN_PLUS_M15_SUPERTREND_PLUS_M5_FLIP2",
    "function demoSupertrend",
    "function demoFreshFlipAge",
    "m5FlipAgeBars: signal.m5FlipAgeBars",
    'entryRule: "PATTERN_PLUS_M15_SUPERTREND_PLUS_M5_FLIP2"'
  )},
  @{ Path = "scripts\run-phase7b-demo-local.ps1"; Tokens = @('ZIQ_PRE_CLOSE_ENTRY_ENABLED = "false"') },
  @{ Path = "apps\api\src\routes\phase7b-demo.route.ts"; Tokens = @(
    'rule: "PATTERN_PLUS_M15_SUPERTREND_PLUS_M5_FLIP2"',
    "function phase7bSupertrend",
    "m5FreshAligned"
  )},
  @{ Path = "apps\web\src\pages\Phase7BDemoPage.tsx"; Tokens = @(
    'label="M15 Supertrend"',
    'label="M5 fresh trend"',
    "XAUUSD DEMO Forward Monitor"
  )},
  @{ Path = "scripts\run-phase7b-telegram-notifier.mjs"; Tokens = @(
    "Supertrend M15 + M5_FLIP_2",
    'line("📈", "M15 ST"',
    'line("⚡", "M5"'
  )}
)

foreach ($check in $checks) {
  $path = Join-Path $Root $check.Path
  if (-not (Test-Path $path)) { throw "Missing file: $path" }
  $text = [System.IO.File]::ReadAllText($path)
  foreach ($token in $check.Tokens) {
    if (-not $text.Contains($token)) { throw "Missing sync token '$token' in $($check.Path)" }
  }
}

$controllerText = [System.IO.File]::ReadAllText((Join-Path $Root "scripts\run-phase7b-demo-controller.ts"))
if ($controllerText.Contains('entryRule: "PATTERN_PLUS_MA"')) { throw "Old MA entry rule remains in controller journal." }
if ($controllerText.Contains('PHASE7B_DEMO_ENTRY_GATE=PATTERN_PLUS_MA_ONLY')) { throw "Old MA entry gate remains in controller." }
if ($controllerText.Contains('`nconsole.log("PHASE7B_DEMO_MA_ENTRY_FILTER=OFF")')) { throw "Literal backtick-n corruption remains." }

Push-Location $Root
try {
  & pnpm --filter @xauusd/risk-engine build
  if ($LASTEXITCODE -ne 0) { throw "risk-engine build failed: $LASTEXITCODE" }

  & pnpm --filter @xauusd/api build
  if ($LASTEXITCODE -ne 0) { throw "api build failed: $LASTEXITCODE" }

  & pnpm --filter @xauusd/web build
  if ($LASTEXITCODE -ne 0) { throw "web build failed: $LASTEXITCODE" }

  & (Join-Path $PSScriptRoot "run-phase7b-demo-local.ps1") -WorkDir $WorkDir -FixedVolume 0.03 -Once
  if ($LASTEXITCODE -ne 0) { throw "DEMO read-only preflight failed: $LASTEXITCODE" }
}
finally {
  Pop-Location
}

Write-Host "PHASE7B_FORWARD_SYNC_TEST=PASS"
Write-Host "PHASE7B_FORWARD_ENTRY=DUAL_PATTERN_PLUS_M15_SUPERTREND_PLUS_M5_FLIP2"
Write-Host "PHASE7B_FORWARD_CLOSED_BAR_ONLY=True"
Write-Host "PHASE7B_FORWARD_FVG_ENTRY_GATE=False"
Write-Host "PHASE7B_FORWARD_REAL_ACCOUNT_ALLOWED=False"
Write-Host "PHASE7B_FORWARD_ORDER_SEND=DISABLED_DURING_SELFTEST"
