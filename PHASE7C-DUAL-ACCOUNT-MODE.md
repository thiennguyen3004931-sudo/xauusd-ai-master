# Phase7C Dual Account Mode

Phase7C now separates **account mode** from **strategy mode**.

- Account mode: `DEMO` or `LIVE`.
- Strategy mode: `AUTO`, `TREND`, `SIDEWAY`, or `PAUSE`.
- MT5 Decision Panel remains read-only in both account modes: `ORDER_PERMISSION=NONE`.
- Strategy rules, stop policy, partial management, martingale prohibition, and recovery-lot prohibition are unchanged.

## Safety model

LIVE is fail-closed and cannot be enabled by a normal web cold-start. A local Administrator switch must:

1. Set strategy mode to `PAUSE`.
2. Verify the current broker account matches the persisted account-mode state.
3. Require zero open XAUUSD positions and no managed/pending executor state or execution lock.
4. Stop the verified executor and bridge task runners, waiting for their singleton locks to release.
5. Load the target account environment and the target account's independent risk profile.
6. Start the target bridge and verify `demo` or `real` account mode plus the configured login allowlist.
7. Start executors and run the strict account-aware verifier and runtime smoke test.
8. Finish in `PAUSE`.

A separate operator action is required to change strategy mode from `PAUSE` to `AUTO`, `TREND`, or `SIDEWAY`.

## Local files

Secrets remain local and are not committed.

- DEMO env: `packages/mt5-broker/bridge/.env.phase7b-demo`
- LIVE env: `packages/mt5-broker/bridge/.env.phase7b-live`
- LIVE template: `packages/mt5-broker/bridge/.env.phase7b-live.example`
- Account state: `.runtime/phase7c-account-mode.json`
- DEMO risk profile: `.runtime/phase7c-lot-settings.demo.json`
- LIVE risk profile: `.runtime/phase7c-lot-settings.live.json`
- Active selected profile: `.runtime/phase7c-lot-settings.json`

DEMO and LIVE are required to use the same local bridge host, bridge port, and API key so the already-running local API retains a stable read-only bridge credential while the MT5 account connection changes.

## Broker symbol mapping

The strategy and APIs continue to use the canonical symbol `XAUUSD`. Each account environment maps that canonical symbol to the broker-specific symbol exposed by the selected MT5 account/terminal.

For the current broker setup:

- DEMO: `MT5_SYMBOL_MAP_JSON={"XAUUSD":"XAUUSD"}`
- LIVE: `MT5_SYMBOL_MAP_JSON={"XAUUSD":"XAUUSD.G"}`

Do not change strategy code, routes, state keys, or decision-monitor requests to `XAUUSD.G`; only the LIVE bridge env performs this broker-symbol translation.

## LIVE prerequisites

The local LIVE env must explicitly set:

- `MT5_TRADING_ENABLED=true`
- `MT5_ALLOW_REAL_ACCOUNT=true`
- a non-empty `MT5_ALLOWED_LOGINS` containing only the intended LIVE login(s)
- `MT5_SYMBOL_MAP_JSON={"XAUUSD":"XAUUSD.G"}` for the current LIVE broker account

The switch command additionally requires `-ConfirmLiveExecution`. The repository does not provide a default LIVE risk profile; it must be configured deliberately before a LIVE switch.

## Runtime isolation

DEMO and LIVE keep separate Trend/Sideway durable states and separate decision journals. The final new-order gate rechecks bridge health, account mode, trading permissions, and login allowlist immediately before an order is allowed through. Sideway performs that recheck while the shared execution lock is held. Trend's account-order guard is nested inside the Trend execution lock/mode gate.

## Unchanged trading rules

This feature changes account routing and safety only. It does not change the canonical strategy rules, including:

- initial structural stop policy 6–10 XAUUSD price units;
- wait/pullback behavior when structure requires more than 10;
- +6 break-even management;
- +10 exact one-third partial close;
- no martingale;
- no recovery lot escalation;
- new-position-only risk-setting application.
