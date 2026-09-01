# Phase7C AutoLot + Fixed TP Design

Date: 2026-09-01
Status: Approved in-chat design; source-only specification
Scope: Phase7C Trend + Sideway sizing and additive fixed-TP management
Runtime mutation: NONE

## 1. Goals

Add two independently configurable capabilities without removing or redefining any current trading behavior:

1. Canonical AutoLot support for Trend, aligned with the existing Sideway risk-sizing model while preserving Trend fixed-lot mode as an explicit option.
2. An optional fixed take-profit hard-exit for Trend and Sideway. The operator enters the fixed TP distance separately for each strategy. When that target is reached, the bot closes 100% of the remaining managed position.

All existing entry rules, initial SL rules, +6 break-even, +10 one-third partial close, Trend structural runner/trailing, Sideway range management/TP2, timeout behavior, daily recovery, account guards, execution locking, idempotency and crash recovery remain intact unless the newly enabled fixed-TP target is reached first.

## 2. Non-goals

- No martingale.
- No recovery lot escalation.
- No signal-quality-based lot escalation.
- No change to entry criteria, regime selection or strategy-condition semantics.
- No mutation of existing/open positions when settings are changed.
- No removal of Trend fixed-lot mode.
- No removal or replacement of Sideway's existing AutoLot behavior.
- No replacement of native Daily Recovery TP logic.
- No direct broker-order mutation from the Web/API preview path.

## 3. Runtime safety contract

All configuration changes are fail-closed and apply to NEW_POSITIONS_ONLY.

Changing lot or fixed-TP settings requires:

- bot mode PAUSE;
- valid configured account mode;
- healthy matching MT5 bridge;
- zero open XAUUSD positions;
- canonical settings validation;
- executor restart only when active runtime configuration differs from persisted configuration.

The configuration UI/API never sends an order, closes a position or modifies an existing position directly.

## 4. Settings model

Upgrade the durable Phase7C lot/management settings schema to a backward-compatible new version. Existing v1 files must migrate in memory to safe defaults.

Proposed canonical fields:

```text
version: 2

trendLotMode: FIXED | AUTO_RISK
trendFixedLot: number
trendRiskPercent: number
trendMaxLot: number

sidewayRiskPercent: number
sidewayMaxLot: number

trendFixedTpEnabled: boolean
trendFixedTpDistance: number

sidewayFixedTpEnabled: boolean
sidewayFixedTpDistance: number
```

Safe migration defaults from v1:

```text
trendLotMode = FIXED
trendFixedLot = existing trendFixedLot
trendRiskPercent = 0.25
trendMaxLot = existing trendFixedLot
sidewayRiskPercent = existing sidewayRiskPercent
sidewayMaxLot = existing sidewayMaxLot
trendFixedTpEnabled = false
trendFixedTpDistance = 0
sidewayFixedTpEnabled = false
sidewayFixedTpDistance = 0
```

Migration must preserve current production behavior exactly until the operator explicitly enables a new feature.

## 5. Canonical AutoLot sizing

### 5.1 Capital base

Use the conservative available account base:

```text
capitalBase = min(accountBalance, accountEquity)
```

If balance/equity is missing, non-finite or <= 0, sizing fails closed and the entry is blocked.

### 5.2 Risk calculation

For a validated stop distance:

```text
targetRiskUsd = capitalBase * riskPercent / 100
oneLotRiskUsd = stopDistance * cashPerPriceUnitPerLot
rawLot = targetRiskUsd / oneLotRiskUsd
cap = min(rawLot, strategyMaxLot, brokerMaxVolume)
```

The final lot must use the existing canonical compatibility rule for exact one-third management:

- align to broker volumeStep;
- be >= broker minVolume;
- preserve an exact one-third partial close;
- remain within the configured strategy cap and broker maximum;
- round down, never up, relative to the risk cap.

If no compatible lot exists, block the entry instead of forcing broker minimum volume.

### 5.3 Trend

Trend supports two explicit modes:

`FIXED`
- Existing Trend behavior.
- Uses `trendFixedLot` unchanged.

`AUTO_RISK`
- Uses `trendRiskPercent` and `trendMaxLot`.
- Fetches a fresh canonical risk snapshot at the final entry gate.
- Revalidates account identity, account mode, broker symbol, stop distance, risk inputs and snapshot freshness before submitting the order.
- Captures the selected volume durably in pending-entry state before broker submission, preserving crash recovery semantics.

### 5.4 Sideway

Sideway retains its current canonical AutoLot flow and final-gate validation. The implementation should reuse the same canonical sizing primitive used by Trend so the calculation cannot drift between strategies.

Existing `sidewayRiskPercent` and `sidewayMaxLot` remain operator-configurable.

## 6. Fixed TP semantics

### 6.1 Independent additive feature

Fixed TP is an optional management rule per strategy. It does not replace native position management.

Configuration:

```text
Trend:   enabled + distance entered by operator
Sideway: enabled + distance entered by operator
```

The distance is expressed in XAUUSD price units ("giá"), measured from the actual managed entry price.

For BUY:

```text
fixedTpPrice = entry + fixedTpDistance
```

For SELL:

```text
fixedTpPrice = entry - fixedTpDistance
```

### 6.2 Executor-owned hard exit

Fixed TP is implemented as an executor-owned hard-exit condition rather than overwriting the broker `takeProfit` field.

Reason: Sideway and Daily Recovery already use broker/native TP semantics. MT5 positions expose one take-profit price, so writing the new fixed TP into that field would replace existing behavior. An executor-owned trigger lets all existing functions remain intact.

Trigger price uses an executable close-side quote:

- BUY/LONG: trigger when bid >= fixedTpPrice.
- SELL/SHORT: trigger when ask <= fixedTpPrice.

On trigger:

1. Reconcile managed state with broker position.
2. Revalidate ticket, side, remaining volume, account identity and execution guards.
3. Acquire the existing shared execution lock.
4. Submit exactly one idempotent full-close command for the remaining managed volume.
5. Persist/journal the attempt and terminal result.
6. Do not submit further management actions after the position is confirmed closed.

### 6.3 Interaction with existing management

All native management remains active until the position is closed.

Examples:

Fixed TP above +10:

```text
Entry
+6  -> existing BE behavior
+10 -> existing one-third partial behavior
... -> existing Trend trailing / Sideway management continues
Fixed TP -> close 100% of remaining volume
```

Fixed TP below +10:

```text
Entry
+6 -> existing BE if price reaches +6 first
Fixed TP -> close 100% of remaining volume
```

The position then no longer exists, so +10 or later native actions naturally do not occur.

If a native exit, Sideway TP2, reversal exit, timeout, stop loss, or broker-side Daily Recovery TP closes the position before the fixed target, the fixed-TP rule becomes a no-op after reconciliation.

There is no synthetic priority that suppresses an existing exit. Whichever valid exit closes the position first wins naturally.

## 7. Daily Recovery interaction

Daily Recovery remains unchanged.

When Daily Recovery places an adaptive broker TP, the new fixed TP does not overwrite it. The executor continues monitoring the operator fixed target independently.

Therefore:

- if the recovery TP is reached first, broker closes the position and reconciliation clears managed state;
- if the operator fixed TP is reached first, the executor closes all remaining volume;
- no lot escalation is introduced;
- Daily Recovery accounting and target calculations remain unchanged.

## 8. NEW_POSITIONS_ONLY snapshot contract

Both lot mode and fixed TP settings are snapshotted into pending/managed state at entry creation.

Proposed additional state fields:

```text
lotMode
configuredRiskPercent
configuredMaxLot
selectedVolume

fixedTpEnabled
fixedTpDistance
fixedTpPrice
fixedTpAttempt
```

Once a position exists, later Web/API settings changes must not change its fixed target, selected lot, stop, or management semantics.

Restart/crash recovery restores the persisted snapshot and continues managing the existing position under the entry-time contract.

## 9. Fixed TP validation

When enabled, distance must be:

- finite;
- > 0;
- aligned to the broker symbol price precision when converted to an absolute target;
- large enough to satisfy broker/execution feasibility checks used by the management path.

A disabled fixed TP stores no active target and must not alter order/management payloads.

The API should reject invalid values instead of silently clamping them.

## 10. Web/API behavior

Expose separate controls for Trend and Sideway.

Trend section:

```text
Lot mode: Fixed | Auto Risk
Fixed lot
Risk %
Max Auto Lot
Fixed TP: On/Off
Fixed TP distance
```

Sideway section:

```text
Risk %
Max Auto Lot
Fixed TP: On/Off
Fixed TP distance
```

The Web UI must display:

- configured values;
- active runtime values;
- whether restart is required;
- `NEW_POSITIONS_ONLY` notice;
- calculated AutoLot preview for representative/actual stop distance;
- fixed TP preview price when an entry reference is available;
- no order-action button in the settings panel.

Saving remains restricted to PAUSE + zero XAUUSD positions using the existing settings safety contract.

## 11. Observability and journal events

Add explicit events so fixed TP cannot be confused with native exits:

```text
FIXED_TP_CONFIG_SNAPSHOT
FIXED_TP_TRIGGERED
FIXED_TP_CLOSE_ATTEMPT
FIXED_TP_CLOSE_CONFIRMED
FIXED_TP_CLOSE_REPLAY
FIXED_TP_CLOSE_BLOCKED
```

AutoLot events should identify strategy, mode, target risk, raw lot, capped lot, final compatible lot, estimated risk USD/percent and block reason.

Never log secret values.

## 12. Idempotency and concurrency

Fixed TP full-close uses the same execution ownership discipline as other mutating management actions.

A deterministic idempotency key must be derived from the managed ticket/position identity and fixed-TP action, for example conceptually:

```text
phase7c-fixed-tp-{strategy}-{ticket}
```

Repeated cycles, API retries or process recovery may replay the same action but must not create multiple close mutations.

Trend single-writer ownership and the shared execution lock remain mandatory and unchanged.

## 13. Testing contract

Implementation follows RED -> minimal fix -> GREEN -> full CI.

Required regression coverage:

### AutoLot

- v1 settings migrate without changing current production behavior.
- Trend FIXED remains bit-for-bit equivalent in sizing semantics.
- Trend AUTO_RISK calculates from `min(balance,equity)`.
- AutoLot rounds down and never exceeds target risk/cap.
- exact one-third compatible lots only.
- below-compatible-minimum blocks instead of forcing a lot.
- stale/mismatched risk snapshots fail closed.
- Sideway current AutoLot behavior remains green.

### Fixed TP

- disabled mode produces no behavioral mutation.
- separate Trend and Sideway distances.
- BUY triggers from bid; SELL triggers from ask.
- fixed TP below +10 closes full position before partial if reached first.
- fixed TP above +10 allows existing one-third partial, then closes all remaining volume at target.
- +6 BE behavior remains unchanged.
- Trend structural trailing remains unchanged until fixed TP closes the position.
- Sideway TP2/range management remains unchanged until whichever exit closes first.
- Daily Recovery broker TP is not overwritten.
- settings changes never mutate an existing position.
- restart restores the entry-time fixed-TP snapshot.
- duplicate polling/retry performs one idempotent close mutation.
- execution-lock contention fails closed.

### Integration

- API build.
- Web build.
- Trend controller parse/runtime tests.
- Sideway controller regressions.
- lifecycle/settings safety tests.
- account-mode LIVE/DEMO guards.
- existing singleton ownership regression.
- existing structural SL monotonicity and partial-management regressions.

## 14. Deployment contract

Development and CI are source-only.

No LIVE deploy until:

- implementation PR is merged;
- all required CI is green;
- current runtime has zero XAUUSD positions/pending orders;
- operator explicitly approves deployment;
- controlled PAUSE -> executor restart -> runtime verification -> AUTO restore is used;
- no LIVE test order is sent.

## 15. Acceptance criteria

The change is complete when all of the following are true:

1. Current production behavior is unchanged with migrated/default settings.
2. Trend can independently select FIXED or AUTO_RISK sizing.
3. Sideway existing AutoLot behavior remains canonical and unchanged in semantics.
4. Trend and Sideway each have independently operator-entered fixed TP enable/distance settings.
5. Fixed TP closes 100% of the remaining position when its target is reached.
6. Fixed TP does not overwrite native Sideway/Daily Recovery broker TP behavior.
7. +6 BE, +10 one-third, Trend trailing/runner, Sideway management and all existing exits remain active unless the position has already been closed.
8. Settings changes are NEW_POSITIONS_ONLY.
9. Close retries are idempotent and execution-lock protected.
10. No source-development step mutates the running LIVE bot.
