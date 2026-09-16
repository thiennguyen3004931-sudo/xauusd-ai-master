# XAUUSD AI MASTER — Public Distribution

This repository contains the public protocol, verification, follower, and distribution surface for XAUUSD AI MASTER.

Public source is intentionally limited to:

- `packages/copy-protocol` — sanitized signed lifecycle command contracts.
- `packages/license-service` — public license-verification logic.
- `packages/installation-proof` — installation proof-of-possession primitives.
- Public security boundary, credential-remediation metadata, and public CI gates.

Proprietary Master/Core strategy, signal, risk, trade-management, analytics, orchestration, signing administration, deployment, and runtime source are maintained only in the private Master/Core repository.

See `docs/public/SECURITY-BOUNDARY.md` for the enforced repository boundary.

## Verification

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm typecheck
pnpm security:boundary
node --test scripts/test-bot-ip-protection-p1-boundary.mjs
node --test scripts/test-bot-ip-protection-p2-boundary.mjs
node --test scripts/test-bot-ip-protection-p3-boundary.mjs
```
