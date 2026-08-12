# XAUUSD AI MASTER

Integrated pnpm/Turbo monorepo for the XAUUSD AI trading research stack.

## Active architecture

```text
apps/web      Vite + React Pack 12 dashboard
apps/api      Express orchestration API
packages/*    Packs 01–11 trading engines
```

The old root Next.js dashboard overlay is no longer active. Pack 12 has been
ported into `apps/web`, which is the frontend already owned by this repository.

## Safe start

```powershell
pnpm install
pnpm check:integration
```

Terminal 1:

```powershell
pnpm dev:api
```

Terminal 2:

```powershell
pnpm dev:web
```

Open:

```text
http://127.0.0.1:5173
```

The API listens on `127.0.0.1:3001` by default.

## Safety

- Runtime mode starts as `SHADOW`.
- Dashboard API can switch only between `SHADOW` and `DEMO`.
- There is no Dashboard endpoint for live-trading enablement.
- Pack 08/09 order placement is not invoked by the Pack 12 API integration.
- MT5 secrets must stay in local `.env` files excluded by `.gitignore`.

See `FIX-PACK-12-INTEGRATION-GUIDE.md` for detailed validation and run steps.
