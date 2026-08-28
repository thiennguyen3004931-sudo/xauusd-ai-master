# Phase 7C Strategy Entry Conditions — Design

Date: 2026-08-28
Status: Approved design, pre-implementation
Scope: Trend and Sideway entry-condition configurability only

## 1. Goal

Add a canonical, operator-controlled entry-condition profile for the Phase 7C Trend and Sideway strategies so an operator can enable or disable individual strategic entry conditions from Web Control Center without changing internal strategy parameters, restarting executors, or weakening mandatory safety gates.

This feature changes NEW ENTRY gating only. It must not alter existing position-management behavior, including HOLD, break-even at +6, one-third partial close at +10, structural trailing, TP2, Recovery TP, exit logic, lot/risk rules, account safety, ARM, AUTO/PAUSE semantics, or broker lifecycle behavior.

## 2. Approved product decisions

The following decisions are fixed by operator approval:

- A1: Each bot must have at least one strategic entry condition enabled. A profile with zero enabled Trend conditions or zero enabled Sideway conditions is invalid and cannot be saved.
- B2: One shared strategy-condition configuration is used for both DEMO and LIVE. There are no account-specific strategy-condition profiles.
- C1: Configuration may be changed and saved only while BOT_MODE=PAUSE and XAUUSD_POSITIONS=0. A successfully saved profile applies from the next entry-evaluation cycle and does not require an executor restart.
- D1: All enabled strategic conditions for a bot are combined with logical AND. Every enabled condition must PASS before the strategy gate passes. Disabled conditions are ignored for gating.
- E1: Initial/default configuration must preserve current entry behavior exactly. Deploying the feature alone must not make either bot looser or stricter.
- F1: Web may only enable or disable approved strategic conditions. Internal parameters and thresholds remain canonical and are not editable through this feature.

## 3. Architecture

Use one canonical persisted state file, owned by the API configuration service and consumed by both executors:

`.runtime/phase7c-strategy-entry-conditions.json`

The state is shared across DEMO and LIVE and contains a monotonic configuration version, audit metadata, Trend toggles, and Sideway toggles.

The API is the only write authority. Writes are whole-state replacements, validated against a fixed whitelist, guarded by runtime safety preconditions, and persisted atomically using a temporary file followed by rename. Executors are read-only consumers.

Trend and Sideway use a shared strategy-condition loader/evaluator library so condition status semantics and version handling cannot drift between controllers.

## 4. Canonical state schema

Canonical persisted shape:

```json
{
  "version": 7,
  "updatedAt": "2026-08-28T00:00:00.000Z",
  "updatedBy": "web-control-center",
  "trend": {
    "patternM15": true,
    "supertrendM15": true,
    "supertrendM5": true,
    "validTrendStructure": true,
    "ma20Ma50": false,
    "fvg": false
  },
  "sideway": {
    "rangingRegime": true,
    "recommendedModeSideway": true,
    "minimumRegimeConfidence": true,
    "supplyDemandRange": true,
    "rangeEdge": true,
    "m5Confirmation": true
  }
}
```

The configuration version increments by exactly one for every successful persisted change. `updatedAt` and `updatedBy` are audit metadata only and do not affect gating.

Unknown keys, missing required keys, non-boolean condition values, or zero enabled conditions for either bot make a persisted file invalid.

## 5. Default profile and migration behavior

If the canonical file has never existed, the service exposes a virtual safe default that exactly matches current strategy behavior. The virtual default has `version = 0`, `updatedAt = 1970-01-01T00:00:00.000Z`, and `updatedBy = safe-default`. The first successful save must therefore submit `expectedVersion = 0` and persist version 1.

Default Trend configuration:

- `patternM15 = true`
- `supertrendM15 = true`
- `supertrendM5 = true`
- `validTrendStructure = true`
- `ma20Ma50 = false`
- `fvg = false`

Default Sideway configuration:

- `rangingRegime = true`
- `recommendedModeSideway = true`
- `minimumRegimeConfidence = true`
- `supplyDemandRange = true`
- `rangeEdge = true`
- `m5Confirmation = true`

The no-file state is not an error. It is the compatibility state that preserves pre-feature behavior.

If a canonical file does exist but is corrupt, incomplete, contains unknown keys, or violates A1, the service must fail closed. It must not silently fall back to defaults because doing so could unintentionally change an operator-selected strategy profile. In this scope, a malformed persisted file is not repairable through the normal Web POST path; the API exposes `valid=false` and `editable=false`, and recovery requires an explicit operational repair outside this feature.

## 6. Toggleable Trend conditions

The Trend strategy exposes these operator-selectable strategic conditions:

1. `patternM15` — M15 candlestick-pattern entry confirmation using the existing canonical pattern detector.
2. `supertrendM15` — existing canonical M15 Supertrend confirmation.
3. `supertrendM5` — existing canonical M5 Supertrend confirmation.
4. `validTrendStructure` — existing valid trend-structure gate.
5. `ma20Ma50` — existing MA20/MA50 confirmation signal, promoted from observation/confidence context to an optional entry gate only when enabled.
6. `fvg` — existing FVG confirmation signal, promoted to an optional entry gate only when enabled.

This feature must not expose Supertrend parameters, MA periods, pattern definitions, FVG definitions, or structure-detection parameters for editing.

The E1 default keeps the first four enabled and the last two disabled, matching current behavior.

## 7. Toggleable Sideway conditions

The Sideway strategy exposes these operator-selectable strategic conditions:

1. `rangingRegime` — existing regime must be `RANGING`.
2. `recommendedModeSideway` — existing recommended mode must be `SIDEWAY`.
3. `minimumRegimeConfidence` — existing regime-confidence threshold must pass.
4. `supplyDemandRange` — existing Supply/Demand range must be valid and available.
5. `rangeEdge` — price must satisfy the existing valid range-edge location logic.
6. `m5Confirmation` — existing M5 entry confirmation must pass.

All six are enabled by default to preserve current behavior.

The existing regime-confidence threshold, range construction, edge definitions, and M5 confirmation parameters remain canonical and are not editable here.

## 8. Condition status semantics

Every strategic condition is normalized to exactly one of:

- `PASS`: condition is enabled and its existing canonical observation passes.
- `FAIL`: condition is enabled and its existing canonical observation fails.
- `IGNORED`: condition is disabled. It does not participate in the gate.

`IGNORED` must never be represented as `PASS`.

Where an observation can still be computed for a disabled condition, the executor should retain the observed value for telemetry/audit while reporting status `IGNORED`.

For each bot:

`STRATEGY_GATE_PASS = every enabled condition has status PASS`

Because A1 guarantees at least one enabled condition, an empty AND set is never valid.

## 9. Mandatory non-toggleable safety gates

Strategy-condition configuration must not expose any switch that disables or bypasses mandatory safety/orchestration gates. These remain outside the strategy-condition file and outside the editable checkbox list, including at minimum:

- account-state validity and account guard
- Bridge health/connectivity and account-mode match
- MT5 terminal/expert/trading permission checks
- active mode / PAUSE / AUTO orchestration rules
- LIVE ARM authorization
- data and quote freshness
- spread protection
- lot/risk validation and final auto-lot validation
- duplicate/open-position protection
- final pre-order safety recheck
- lifecycle-broker safety

A strategy gate passing is necessary but never sufficient to send an order.

## 10. API contract

Expose:

- `GET /api/v1/phase7c/strategy-entry-conditions`
- `POST /api/v1/phase7c/strategy-entry-conditions`

### GET

GET is read-only and returns the canonical or virtual state, validity, editable state, and relevant runtime guards required by Web to render the editor.

Example for a valid saved profile:

```json
{
  "state": {
    "version": 7,
    "updatedAt": "2026-08-28T00:00:00.000Z",
    "updatedBy": "web-control-center",
    "trend": {
      "patternM15": true,
      "supertrendM15": true,
      "supertrendM5": false,
      "validTrendStructure": true,
      "ma20Ma50": false,
      "fvg": true
    },
    "sideway": {
      "rangingRegime": true,
      "recommendedModeSideway": true,
      "minimumRegimeConfidence": true,
      "supplyDemandRange": true,
      "rangeEdge": true,
      "m5Confirmation": true
    }
  },
  "valid": true,
  "editable": true,
  "appliesTo": "NEW_ENTRIES_ONLY",
  "sharedAcrossAccounts": true,
  "safety": {
    "requiresPause": true,
    "requiresZeroXauusdPositions": true
  }
}
```

For the virtual no-file default, the same shape is returned with `version=0`. For an invalid persisted file, `valid=false`, `editable=false`, and NEW ENTRY fails closed.

### POST

POST accepts the complete Trend and Sideway toggle state plus optimistic-concurrency metadata:

```json
{
  "expectedVersion": 7,
  "trend": {
    "patternM15": true,
    "supertrendM15": true,
    "supertrendM5": false,
    "validTrendStructure": true,
    "ma20Ma50": false,
    "fvg": true
  },
  "sideway": {
    "rangingRegime": true,
    "recommendedModeSideway": true,
    "minimumRegimeConfidence": true,
    "supplyDemandRange": true,
    "rangeEdge": true,
    "m5Confirmation": true
  },
  "source": "web-control-center"
}
```

POST must reject partial patches. Whole-state writes make validation, audit, concurrency, and rollback semantics explicit. `source` is restricted to the repository-approved operator source values; the Web client uses `web-control-center`.

A successful write increments `version` by exactly one and returns the new canonical state.

If the current version does not equal `expectedVersion`, return HTTP 409 with canonical reason `CONFIG_VERSION_CONFLICT` and do not modify the file.

## 11. POST safety preconditions

A write is accepted only when all of the following are true at validation time:

- account state is valid
- BOT_MODE is exactly `PAUSE`
- XAUUSD position count is exactly zero
- Bridge telemetry required to prove those preconditions is available and valid
- persisted configuration is either absent/virtual-default or currently valid
- payload contains only the canonical whitelist and complete shape
- all condition values are booleans
- Trend enabled count is at least one
- Sideway enabled count is at least one
- `expectedVersion` matches the current canonical version

A failed precondition performs no write and no version increment.

Runtime-precondition conflicts should use HTTP 409. Malformed or schema-invalid payloads should use the repository's existing validation-error convention, provided they fail closed and perform no write.

## 12. Atomic persistence and concurrency

The API service writes to a temporary file in the same directory and then renames it over the canonical file, following the repository's existing canonical-settings pattern.

The persisted state is complete; executors must never observe a partially written profile.

Optimistic concurrency via `expectedVersion` protects against stale Web tabs or multiple clients overwriting newer operator choices.

## 13. Executor read and application model

No executor restart is required.

At the beginning of every NEW ENTRY evaluation cycle, each executor reads one immutable snapshot of the canonical strategy-condition state and records its version as `cycleConfigVersion`.

All strategic observations for that cycle are evaluated against that snapshot. The executor must not re-read individual toggles mid-evaluation.

Flow:

1. Read and validate canonical strategy-condition snapshot V.
2. Compute canonical strategic observations.
3. Normalize each condition to PASS, FAIL, or IGNORED.
4. Apply D1 AND semantics over enabled conditions.
5. If strategy gate fails, block entry and audit the failing conditions.
6. If strategy gate passes, continue through mandatory safety gates.
7. Immediately before any order mutation, re-read the canonical strategy-condition state/version.
8. If the current version differs from V, block order mutation with `ENTRY_CONFIG_VERSION_CHANGED` and let the next cycle evaluate from scratch.
9. If the version is unchanged and all mandatory safety gates pass, existing order execution may proceed.

If the canonical file is invalid at cycle start or at final version recheck, entry must fail closed.

## 14. Race-condition behavior

A configuration change that occurs after a signal cycle starts must never produce an order based on mixed strategy versions.

Example:

- cycle begins with version 7
- strategic observations pass using version 7
- operator saves version 8 before order submission
- final pre-order version check sees 8 != 7
- order send is blocked
- audit reason is `ENTRY_CONFIG_VERSION_CHANGED`
- next cycle re-evaluates entirely under version 8

No retry using the stale signal is allowed.

## 15. Audit and reason codes

Extend canonical decision observability rather than creating a new audit channel.

Add these canonical reason/event codes:

- `ENTRY_STRATEGY_CONDITION_BLOCK`
- `ENTRY_STRATEGY_CONDITIONS_PASS`
- `ENTRY_CONFIG_VERSION_CHANGED`
- `ENTRY_STRATEGY_CONFIG_INVALID`

Decision records add an `entryConditions` object, for example:

```json
{
  "entryConditions": {
    "configVersion": 8,
    "enabledCount": 4,
    "allEnabledPassed": false,
    "conditions": [
      {
        "id": "patternM15",
        "enabled": true,
        "status": "PASS",
        "observed": "BULLISH_ENGULF"
      },
      {
        "id": "supertrendM5",
        "enabled": false,
        "status": "IGNORED",
        "observed": "SELL"
      },
      {
        "id": "fvg",
        "enabled": true,
        "status": "FAIL",
        "observed": "NONE"
      }
    ]
  }
}
```

When one or more enabled conditions fail, `ENTRY_STRATEGY_CONDITION_BLOCK` must identify the failed condition IDs.

`ENTRY_STRATEGY_CONDITIONS_PASS` is an observability event indicating the strategic gate passed; it is not permission to trade. If a later mandatory safety gate fails, the final blocked decision/reason remains the applicable safety reason.

## 16. Web Control Center design

Add a distinct `Điều kiện vào lệnh` section in Control Center rather than mixing this feature into `Tài khoản & Rủi ro`.

The section has two strategy groups/tabs: TREND BOT and SIDEWAY BOT.

Each condition row shows:

- canonical Vietnamese label
- checkbox enabled/disabled state
- current runtime condition status PASS / FAIL / IGNORED when available
- optional observed value where useful

Show an enabled-count summary per bot.

The editor is enabled only when C1 preconditions are satisfied. Otherwise controls remain visible but disabled, with a clear lock explanation that editing requires PAUSE and zero XAUUSD positions.

If the draft would leave zero enabled conditions for either bot, disable Save and show a validation message.

Buttons:

- `Khôi phục`: discard unsaved draft and reload the last canonical saved state.
- `Khôi phục mặc định chiến lược`: reset the Web draft to E1 defaults only; it does not persist until Save is pressed.
- `Lưu cấu hình`: submit the complete profile with `expectedVersion`.

The Web editor must not expose internal thresholds or indicator parameters.

## 17. Web stale-version behavior

If POST returns `CONFIG_VERSION_CONFLICT`, Web must not silently retry. It must reload the latest canonical state, tell the operator that configuration changed elsewhere, and require an explicit new edit/save action.

This preserves operator intent and prevents stale-tab overwrites.

## 18. Failure handling

- No file: use E1 virtual default with version 0.
- Existing corrupt/invalid file: fail closed for NEW ENTRY, expose `ENTRY_STRATEGY_CONFIG_INVALID`, and disable normal Web editing until explicit operational repair.
- Atomic write failure: keep the previous canonical file/version intact; POST fails.
- Runtime precondition fails during save: no write, no version change.
- Version conflict: no write, no automatic retry.
- Config version changes during an entry cycle: no order, audit `ENTRY_CONFIG_VERSION_CHANGED`, recalculate next cycle.
- Strategy config invalid at final pre-order recheck: no order.
- Disabled condition observation unavailable: report IGNORED without blocking.

## 19. Scope isolation

This feature must not change:

- existing position-management state machines
- HOLD reason behavior except where entry-only observability is extended
- break-even at +6
- one-third partial close at +10
- structural trailing
- TP2 and Recovery TP
- exit criteria
- lot/risk configuration or lot limits
- LIVE ARM UI/authorization
- account-switch semantics
- lifecycle-broker START/STOP behavior
- Telegram control semantics

No unrelated refactor is part of this work.

## 20. TDD and verification contract

Implementation must follow RED -> prove exact RED cause -> minimal production fix -> GREEN -> full regression CI -> exact SHA.

Before production changes, RED contracts must cover at minimum:

1. E1 defaults produce the same Trend and Sideway entry-gate decisions as current behavior.
2. Virtual no-file default is version 0 and first successful save persists version 1.
3. Each condition supports enabled+PASS, enabled+FAIL, and disabled+IGNORED semantics.
4. D1 AND semantics require every enabled condition to pass.
5. A1 rejects zero enabled Trend conditions and zero enabled Sideway conditions.
6. B2 uses one shared canonical profile across DEMO and LIVE with no account-specific profile files.
7. C1 rejects writes outside PAUSE or with XAUUSD positions > 0 and leaves persisted state unchanged.
8. F1 rejects any attempt to alter internal parameters/thresholds through this API.
9. Unknown/missing/non-boolean keys fail validation.
10. Existing corrupt config fails closed rather than silently reverting to defaults and is not normally editable through Web.
11. Atomic writes either produce a complete new version or leave the prior state intact.
12. Successful writes increment version exactly once.
13. Stale `expectedVersion` returns conflict and performs no write.
14. Executors consume a newly saved profile on the next entry cycle without restart.
15. A mid-cycle version change produces `ENTRY_CONFIG_VERSION_CHANGED` and no order mutation.
16. Disabled conditions remain IGNORED and are never normalized to PASS.
17. Safety gates have no strategy-condition toggle and remain mandatory.
18. Existing Trend entry default regression remains GREEN.
19. Existing Sideway entry default regression remains GREEN.
20. HOLD/BE/+10/Recovery/exit management regressions remain GREEN.
21. Web save/restore/default-draft/version-conflict behavior is covered.
22. API build, Web build, existing lifecycle/broker regressions, decision-observability regressions, Trend/Sideway regressions, and Windows-compatible contract suites remain GREEN.

Testing this feature must not send LIVE or DEMO orders. Synthetic/pure contract tests are sufficient for order-boundary verification.

## 21. Success criteria

The feature is complete only when all of these are true:

- Operator can enable/disable approved Trend and Sideway strategic entry conditions from Web.
- Saving is possible only in PAUSE with zero XAUUSD positions.
- At least one condition remains enabled for each bot.
- DEMO and LIVE use the same canonical profile.
- All enabled conditions use AND semantics.
- Defaults preserve current behavior exactly.
- Internal strategy parameters remain non-editable.
- Executors apply saved changes from the next entry cycle without restart.
- Mixed-version order submission is impossible by contract.
- Invalid persisted configuration fails closed.
- Mandatory safety gates cannot be disabled by this feature.
- Entry-only configurability does not alter existing position management.
- Audit clearly reports config version and PASS/FAIL/IGNORED per condition.
- Full CI/regression is green with no LIVE/DEMO order test.

## 22. Implementation boundary guidance

The implementation plan should prefer small isolated units:

- API canonical strategy-entry-condition service: schema/default/validation/version/atomic persistence.
- API route: read/write contract and runtime save guards.
- Shared executor loader/evaluator: validated snapshot plus PASS/FAIL/IGNORED composition.
- Trend adapter: maps existing canonical observations to Trend condition IDs.
- Sideway adapter: maps existing canonical observations to Sideway condition IDs.
- Decision-audit extension: entry-condition telemetry/reasons.
- Web editor: draft state, runtime lock, Save/Restore/Default, version conflict handling, condition status display.
- Dedicated contracts plus existing regression workflows.

The plan must avoid duplicating condition semantics across API, Trend, Sideway, and Web and must not move mandatory safety checks into the editable strategy profile.
