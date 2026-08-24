# Phase7C Dual Account / Dual Terminal Mode

Phase7C separates **account/terminal selection** from **strategy mode** and from **LIVE execution arm state**.

- Account mode: `DEMO` or `LIVE`.
- Strategy mode: `AUTO`, `TREND`, `SIDEWAY`, or `PAUSE`.
- LIVE arm: `ARMED` or `DISARMED`.
- MT5 Decision Panel remains read-only in both account modes: `ORDER_PERMISSION=NONE`.
- Strategy rules, stop policy, partial management, martingale prohibition, recovery-lot prohibition and risk profiles are unchanged by this feature.

## Safety model

LIVE is fail-closed. Selecting a LIVE terminal/account is **not** permission to mutate the account.

A REAL mutation is accepted by the MT5 bridge only when all existing bridge checks pass **and** the current process has an exact, unexpired LIVE arm bound to:

- selected account mode `LIVE`;
- the current bridge process `bridgeSessionId`;
- the connected MT5 login;
- the connected MT5 server;
- the configured LIVE `terminal64.exe` profile fingerprint.

`MT5_ALLOW_REAL_ACCOUNT=true`, `MT5_TRADING_ENABLED=true`, an allow-listed login, and `XAUUSD_PHASE7C_ALLOW_LIVE_TRADING=1` are capability prerequisites only. They never arm LIVE by themselves.

Missing, unreadable, corrupt, expired, stale-session or mismatched arm state rejects REAL mutation before `order_send`.

## Automatic DISARM rules

LIVE arm is deliberately ephemeral.

- Every Phase7C account bridge child launch/restart deletes the previous arm state before creating a new bridge process.
- A bridge restart creates a new `bridgeSessionId`, so an old arm cannot be reused even if a stale file survived unexpectedly.
- Account switching restarts the trusted account bridge runner and therefore finishes with LIVE DISARMED.
- Changing a local terminal identity profile explicitly clears the LIVE arm.
- Operator DISARM is idempotent.

A successful LIVE account switch still finishes with strategy mode `PAUSE`. The operator must separately run the explicit arm command and then separately change strategy mode when appropriate.

## Local files

Secrets and machine/account identity values remain local and are not committed.

- DEMO env: `packages/mt5-broker/bridge/.env.phase7b-demo`
- LIVE env: `packages/mt5-broker/bridge/.env.phase7b-live`
- LIVE template: `packages/mt5-broker/bridge/.env.phase7b-live.example`
- Account state: `.runtime/phase7c-account-mode.json`
- Session-bound arm: `.runtime/phase7c-live-arm.json`
- DEMO risk profile: `.runtime/phase7c-lot-settings.demo.json`
- LIVE risk profile: `.runtime/phase7c-lot-settings.live.json`
- Active selected profile: `.runtime/phase7c-lot-settings.json`

DEMO and LIVE are expected to use separate MT5 terminal installations/profiles. The local account bridge still uses a stable localhost host/port/API credential so the API can remain read-only while account selection changes.

## Configure terminal identity safely

The repository does not contain a real terminal path, login, password or server. Configure those only on the Windows machine:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\configure-phase7c-mt5-terminal-profile-local.ps1 `
  -AccountMode LIVE `
  -TerminalPath "<LIVE terminal64.exe>" `
  -Login <LIVE_LOGIN> `
  -Server "<LIVE_SERVER>" `
  -PromptForPassword
```

For LIVE, this identity configuration command intentionally writes `MT5_TRADING_ENABLED=false` and `XAUUSD_PHASE7C_ALLOW_LIVE_TRADING=false`. It never enables execution as a side effect and never changes risk/lot settings.

Configure DEMO separately with `-AccountMode DEMO` and the DEMO terminal identity.

## Select DEMO or LIVE

Use the existing Administrator account switcher. The legacy `-ConfirmLiveExecution` switch is only an explicit confirmation that the operator intends to connect/select the LIVE account; it is **not** a LIVE arm.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\switch-phase7c-account-mode-local.ps1 `
  -TargetMode LIVE `
  -ConfirmLiveExecution
```

The switcher pauses the bot, verifies the current account is flat, isolates runtime state/risk profiles, restarts the selected bridge/executors, verifies the selected broker account and finishes in `PAUSE`. The trusted bridge runner automatically DISARMs LIVE before its bridge child starts.

The switcher also refuses LIVE before mutation unless `.runtime/phase7c-lot-settings.live.json` is present, numerically valid and bound to the exact configured LIVE terminal/login/server fingerprint.

## Explicit LIVE ARM

Before arming, the local LIVE env must deliberately enable the two capability prerequisites:

```text
MT5_TRADING_ENABLED=true
XAUUSD_PHASE7C_ALLOW_LIVE_TRADING=1
```

This still does **not** authorize an order. To arm the current bridge session:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\arm-phase7c-live-local.ps1
```

The arm command sends no order. It requires Administrator PowerShell and verifies immediately before writing arm state:

1. selected account mode is `LIVE`;
2. connected broker mode is `real`;
3. exact configured terminal path, login and server are present;
4. actual login/server match the LIVE profile and allowlist;
5. bridge health contains the current `bridgeSessionId`;
6. bot strategy mode is `PAUSE`;
7. zero open XAUUSD positions;
8. zero broker pending XAUUSD orders;
9. no managed/pending Trend or Sideway durable state;
10. no Phase7C execution lock;
11. bridge session/account identity is unchanged on the final recheck.

The arm is time-limited and defaults to 120 minutes. A bridge restart immediately invalidates it.

## DISARM and status

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\disarm-phase7c-live-local.ps1

powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\get-phase7c-live-arm-local.ps1
```

The status command reports selected mode, connected broker mode/login/server, current bridge session and bridge-confirmed `ARMED`, `DISARMED` or `NOT_REQUIRED`. It never prints the MT5 password or API key.

## Broker symbol mapping

The strategy and APIs continue to use canonical `XAUUSD`. Configure `MT5_SYMBOL_MAP_JSON` only in each local terminal env if the broker uses a suffix/prefix. The source LIVE template intentionally contains no broker-account-specific symbol mapping.

## Risk isolation and explicit LIVE risk

DEMO and LIVE risk profiles remain independent. No terminal/profile/switch helper is allowed to infer or copy DEMO lot/risk values into LIVE.

Configure LIVE risk only with explicit operator-supplied values. The three risk parameters are mandatory and have no defaults:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\configure-phase7c-live-risk-local.ps1 `
  -TrendFixedLot <EXPLICIT_LIVE_VALUE> `
  -SidewayRiskPercent <EXPLICIT_LIVE_VALUE> `
  -SidewayMaxLot <EXPLICIT_LIVE_VALUE>
```

The configurator is fail-closed and requires:

- Administrator PowerShell;
- current selected runtime remains `DEMO`;
- current strategy mode is `PAUSE`;
- the local LIVE terminal identity profile is configured;
- `MT5_TRADING_ENABLED=false`;
- `XAUUSD_PHASE7C_ALLOW_LIVE_TRADING=false`;
- values pass the existing Phase7C lot/risk limits and increments.

The resulting `.runtime/phase7c-lot-settings.live.json` is bound to `LIVE`, the configured LIVE account login/server and the same terminal-profile fingerprint used by the LIVE arm guard. It preserves `NEW_POSITIONS_ONLY`, `martingale=false` and `recoveryLotEscalation=false`. Reconfiguring risk explicitly DISARMs any previous LIVE arm.

Read the local LIVE risk status without changing runtime:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\get-phase7c-live-risk-local.ps1
```

If the terminal/login/server identity later changes, the old risk fingerprint becomes stale and the LIVE account switch refuses it before stopping the current runtime. Re-run the explicit LIVE risk configurator for the new profile; do not reuse a DEMO profile.

## Runtime isolation

DEMO and LIVE keep separate Trend/Sideway durable states and separate decision journals. The final strategy account-order gate remains in place. The MT5 bridge now adds a second independent REAL-mutation boundary, so upstream bugs or direct calls cannot bypass the session-bound LIVE arm requirement.

## Unchanged trading rules

This feature changes account routing and safety only. It does not change the canonical strategy rules, including:

- initial structural stop policy 6–10 XAUUSD price units;
- wait/pullback behavior when structure requires more than 10;
- +6 break-even management;
- +10 exact one-third partial close;
- no martingale;
- no recovery lot escalation;
- new-position-only risk-setting application.