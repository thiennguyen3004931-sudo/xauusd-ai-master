# Phase 5 Run

## 1. Pull and validate the package

```powershell
git pull
pnpm --filter @xauusd/risk-engine typecheck
pnpm --filter @xauusd/risk-engine test
pnpm --filter @xauusd/risk-engine build
```

## 2. Apply the pre-registered holdout hook

```powershell
$work = "F:\Project\XAUUSD_AI_MASTER\xauusd-ai-master\apps\api\data\historical-replay\work-20260812-154207"

node .\scripts\apply-phase5-forward-holdout-hook.mjs `
  "$work\canonical_replay.ts"
```

Expected:

```text
PHASE5_HOOK_STATUS=PASS
```

## 3. Immediate protocol check on the frozen Phase 4 dataset

The frozen Phase 4 dataset ends at the Phase 5 cutoff, so an immediate replay should report zero eligible post-cutoff trades and:

```text
PHASE5_STATUS=INSUFFICIENT_SAMPLE
```

That is the expected result and confirms the cutoff is working.

## 4. Forward validation later

For a real Phase 5 run, export a new immutable M15/M5 dataset that extends beyond:

`2026-08-12T12:45:00.000Z`

Include enough pre-cutoff warmup history for the canonical strategy, but Phase 5 metrics will count only post-cutoff `CANONICAL_SELL` cases.

Set the replay env paths to that forward dataset and run the same canonical replay. Do not alter the Phase 5 candidate, management, minimum sample, or PF floor.

## 5. Inspect output

```powershell
Select-String `
  -Path "$work\phase5-console.log" `
  -Pattern "PHASE5_"
```

Before 30 filled eligible trades, do not interpret PF/expectancy as a final pass/fail decision.
