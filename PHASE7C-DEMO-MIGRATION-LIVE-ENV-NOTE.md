# Phase7C DEMO same-mode migration note

A DEMO-target migration must not require the optional LIVE environment to be trading-enabled. The LIVE environment is validated with `-RequireTrading` only when `TargetMode=LIVE`.

This keeps LIVE fail-closed while allowing a safe DEMO runtime migration when the local `.env.phase7b-live` exists but intentionally has `MT5_TRADING_ENABLED=false` during setup.
