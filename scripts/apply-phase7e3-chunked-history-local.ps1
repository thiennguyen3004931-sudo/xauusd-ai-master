param()

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$phase7cPath = Join-Path $repoRoot "apps/api/src/services/phase7c.service.ts"
$phase7ePath = Join-Path $repoRoot "apps/api/src/services/phase7e-realignment.service.ts"

foreach ($path in @($phase7cPath, $phase7ePath)) {
  if (-not (Test-Path $path)) { throw "Required service not found: $path" }
}

function Read-Normalized([string]$Path) {
  return [System.IO.File]::ReadAllText($Path).Replace("`r`n", "`n")
}

function Write-Preserved([string]$Path, [string]$Original, [string]$Content) {
  if ($Original.Contains("`r`n")) { $Content = $Content.Replace("`n", "`r`n") }
  [System.IO.File]::WriteAllText($Path, $Content, (New-Object System.Text.UTF8Encoding($false)))
}

# ---------------- Phase 7C canonical backtest ----------------
$phase7cOriginal = [System.IO.File]::ReadAllText($phase7cPath)
$phase7c = $phase7cOriginal.Replace("`r`n", "`n")

if (-not $phase7c.Contains("async function bridgeGetHistory<")) {
  $anchor7c = @'
async function bridgeGet<T>(path: string, timeoutMs = 15_000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${bridgeBase()}${path}`, {
      headers: { "x-mt5-api-key": bridgeApiKey() },
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`MT5 bridge ${response.status}: ${text}`);
    return JSON.parse(text) as T;
  } finally {
    clearTimeout(timeout);
  }
}
'@
  $insert7c = @'
async function bridgeGet<T>(path: string, timeoutMs = 15_000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${bridgeBase()}${path}`, {
      headers: { "x-mt5-api-key": bridgeApiKey() },
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`MT5 bridge ${response.status}: ${text}`);
    return JSON.parse(text) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function bridgeGetHistory<T extends { openTime: number }>(
  timeframe: "M15" | "M5",
  fromMs: number,
  toMs: number,
  timeoutMs: number,
): Promise<T[]> {
  const chunkMs = 60 * 86_400_000;
  const all: T[] = [];
  for (let cursor = fromMs; cursor < toMs;) {
    const chunkTo = Math.min(toMs, cursor + chunkMs);
    const rows = await bridgeGet<T[]>(
      `/v1/history/candles/XAUUSD?timeframe=${timeframe}&fromMs=${Math.trunc(cursor)}&toMs=${Math.trunc(chunkTo)}`,
      timeoutMs,
    );
    all.push(...rows);
    cursor = chunkTo;
  }
  const deduped = new Map<number, T>();
  for (const row of all) deduped.set(row.openTime, row);
  return [...deduped.values()].sort((a, b) => a.openTime - b.openTime);
}
'@
  if (-not $phase7c.Contains($anchor7c)) { throw "Phase 7C bridgeGet block does not match expected revision." }
  $phase7c = $phase7c.Replace($anchor7c, $insert7c)
}

$oldFetch7c = @'
  const [health, spec, m15, m5] = await Promise.all([
    bridgeGet<BridgeHealth>("/health", 20_000),
    bridgeGet<Spec>("/v1/symbols/XAUUSD/spec", 20_000),
    bridgeGet<Bar>("/health", 1).catch(() => null),
    Promise.resolve(null),
  ]).then(async ([h, s]) => {
    const m15Bars = await bridgeGet<Bar[]>(`/v1/history/candles/XAUUSD?timeframe=M15&fromMs=${warmupFromMs}&toMs=${toMs}`, 45_000);
    const m5Bars = await bridgeGet<Bar[]>(`/v1/history/candles/XAUUSD?timeframe=M5&fromMs=${fromMs}&toMs=${toMs}`, 60_000);
    return [h, s, m15Bars, m5Bars] as const;
  });
'@
$newFetch7c = @'
  const [health, spec, m15, m5] = await Promise.all([
    bridgeGet<BridgeHealth>("/health", 20_000),
    bridgeGet<Spec>("/v1/symbols/XAUUSD/spec", 20_000),
    bridgeGetHistory<Bar>("M15", warmupFromMs, toMs, 45_000),
    bridgeGetHistory<Bar>("M5", fromMs, toMs, 60_000),
  ]);
'@
if ($phase7c.Contains($oldFetch7c)) {
  $phase7c = $phase7c.Replace($oldFetch7c, $newFetch7c)
} elseif (-not $phase7c.Contains('bridgeGetHistory<Bar>("M15", warmupFromMs, toMs, 45_000)')) {
  throw "Phase 7C history fetch block does not match expected revision."
}

Write-Preserved -Path $phase7cPath -Original $phase7cOriginal -Content $phase7c

# ---------------- Phase 7E realignment research ----------------
$phase7eOriginal = [System.IO.File]::ReadAllText($phase7ePath)
$phase7e = $phase7eOriginal.Replace("`r`n", "`n")

if (-not $phase7e.Contains("async function bridgeGetHistory<")) {
  $anchor7e = @'
async function bridgeGet<T>(path: string, timeoutMs = 60_000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${bridgeBase()}${path}`, { headers: { "x-mt5-api-key": bridgeApiKey() }, signal: controller.signal, cache: "no-store" });
    const text = await response.text();
    if (!response.ok) throw new Error(`MT5 bridge ${response.status}: ${text}`);
    return JSON.parse(text) as T;
  } finally { clearTimeout(timeout); }
}
'@
  $insert7e = @'
async function bridgeGet<T>(path: string, timeoutMs = 60_000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${bridgeBase()}${path}`, { headers: { "x-mt5-api-key": bridgeApiKey() }, signal: controller.signal, cache: "no-store" });
    const text = await response.text();
    if (!response.ok) throw new Error(`MT5 bridge ${response.status}: ${text}`);
    return JSON.parse(text) as T;
  } finally { clearTimeout(timeout); }
}

async function bridgeGetHistory<T extends { openTime: number }>(
  timeframe: "M15" | "M5",
  fromMs: number,
  toMs: number,
  timeoutMs: number,
): Promise<T[]> {
  const chunkMs = 60 * DAY_MS;
  const all: T[] = [];
  for (let cursor = fromMs; cursor < toMs;) {
    const chunkTo = Math.min(toMs, cursor + chunkMs);
    const rows = await bridgeGet<T[]>(
      `/v1/history/candles/XAUUSD?timeframe=${timeframe}&fromMs=${Math.trunc(cursor)}&toMs=${Math.trunc(chunkTo)}`,
      timeoutMs,
    );
    all.push(...rows);
    cursor = chunkTo;
  }
  const deduped = new Map<number, T>();
  for (const row of all) deduped.set(row.openTime, row);
  return [...deduped.values()].sort((a, b) => a.openTime - b.openTime);
}
'@
  if (-not $phase7e.Contains($anchor7e)) { throw "Phase 7E bridgeGet block does not match expected revision." }
  $phase7e = $phase7e.Replace($anchor7e, $insert7e)
}

$oldM15 = '    bridgeGet<Bar[]>(`/v1/history/candles/XAUUSD?timeframe=M15&fromMs=${warmupFromMs}&toMs=${toMs}`, 60_000),'
$newM15 = '    bridgeGetHistory<Bar>("M15", warmupFromMs, toMs, 60_000),'
$oldM5 = '    bridgeGet<Bar[]>(`/v1/history/candles/XAUUSD?timeframe=M5&fromMs=${warmupFromMs}&toMs=${toMs}`, 90_000),'
$newM5 = '    bridgeGetHistory<Bar>("M5", warmupFromMs, toMs, 90_000),'

if ($phase7e.Contains($oldM15)) { $phase7e = $phase7e.Replace($oldM15, $newM15) }
elseif (-not $phase7e.Contains($newM15)) { throw "Phase 7E M15 history fetch does not match expected revision." }

if ($phase7e.Contains($oldM5)) { $phase7e = $phase7e.Replace($oldM5, $newM5) }
elseif (-not $phase7e.Contains($newM5)) { throw "Phase 7E M5 history fetch does not match expected revision." }

Write-Preserved -Path $phase7ePath -Original $phase7eOriginal -Content $phase7e

Write-Host "PHASE7E3_HISTORY_PATCH=PASS"
Write-Host "PHASE7E3_HISTORY_CHUNK_DAYS=60"
Write-Host "PHASE7E3_PHASE7C_CHUNKED=True"
Write-Host "PHASE7E3_PHASE7E_CHUNKED=True"
Write-Host "PHASE7E3_RESEARCH_ONLY=True"
Write-Host "PHASE7E3_EXECUTION_ELIGIBLE=False"
Write-Host "PHASE7E3_NEXT=pnpm --filter @xauusd/api build"
