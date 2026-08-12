# Phase 5 — Fresh Forward Holdout

## Purpose

Phase 4H identified one subgroup that was stable on the frozen research sample: `CANONICAL_SELL`.
Phase 5 is not another optimization phase. It is a pre-registered forward validation that uses only signals strictly after the frozen research cutoff.

## Frozen cutoff

`2026-08-12T12:45:00.000Z`

Signals at or before the cutoff are ignored by `Phase5ForwardHoldoutService`.
Warmup bars before the cutoff are allowed and expected so the canonical strategy can compute MA/structure state correctly, but no pre-cutoff trade can contribute to Phase 5 metrics.

## Candidate locked before forward data

- subgroup: `CANONICAL_SELL`
- entry source: `CANONICAL`
- side: `SELL`
- minimum lot shadow replay: `0.01`
- structural SL/TP: canonical values, unchanged
- management:
  - break-even trigger: `+6`
  - break-even offset: `+2`
  - trailing trigger: `+10`
  - trailing distance: `5`
- intrabar conflict: conservative stop-first behavior inherited from Phase 4 shadow replay

`RESCUED_BUY` is not included even though its aggregate Phase 4G result was positive, because Phase 4H classified it as `UNSTABLE_POSITIVE` (2/5 positive folds).

## Pre-registered sample and pass criteria

Phase 5 must not declare PASS or FAIL until at least **30 filled eligible trades** exist.
Before that point the only valid status is:

`PHASE5_STATUS=INSUFFICIENT_SAMPLE`

After 30 filled eligible trades, PASS requires all of:

- net PnL > 0
- expectancy > 0
- average R > 0
- profit factor > 1.10

Otherwise status is FAIL.

These thresholds are locked before meaningful post-cutoff data exists and must not be changed based on Phase 5 results.

## Data protocol

A Phase 5 replay dataset may contain pre-cutoff warmup history, but it must also contain newly exported M15/M5 data after the cutoff.
Do not use the frozen Phase 4 files alone as a Phase 5 result dataset because they end at the cutoff and therefore contain no eligible Phase 5 signal.

Use the corrected MT5 exporter path (`TIMEFRAME_M15` and `TIMEFRAME_M5`, not M55). Preserve the broker metadata/tick-value method used for the corrected Phase 4 baseline.

For each forward export, keep an immutable copy and SHA256 hashes before running the replay. Do not overwrite an earlier forward snapshot.

## Output contract

Expected lines:

```text
PHASE5_CUTOFF=2026-08-12T12:45:00.000Z
PHASE5_CANDIDATE=CANONICAL_SELL
PHASE5_CONFIG=BE_TRIGGER=6|BE_OFFSET=2|TRAIL_TRIGGER=10|TRAIL_DISTANCE=5
PHASE5_MINIMUM_FILLED_TRADES=30
PHASE5_MINIMUM_PROFIT_FACTOR=1.1
PHASE5_TOTAL_INPUT_CASES=...
PHASE5_PRE_CUTOFF_CASES_IGNORED=...
PHASE5_POST_CUTOFF_CASES=...
PHASE5_ELIGIBLE_CASES=...
PHASE5_FIRST_ELIGIBLE=...
PHASE5_LAST_ELIGIBLE=...
PHASE5_FILLED_TRADES=...
PHASE5_WIN_RATE=...
PHASE5_NET_PNL=...
PHASE5_PROFIT_FACTOR=...
PHASE5_EXPECTANCY=...
PHASE5_AVG_R=...
PHASE5_STATUS=INSUFFICIENT_SAMPLE|PASS|FAIL
PHASE5_PRE_REGISTERED=PASS
PHASE5_PRODUCTION_MUTATION=false
```

## Promotion rule

A Phase 5 PASS is necessary but not by itself permission to modify live execution. Production remains unchanged until a separate explicit promotion decision is made after reviewing forward sample size, drawdown/path behavior, operational assumptions, and broker execution constraints.
