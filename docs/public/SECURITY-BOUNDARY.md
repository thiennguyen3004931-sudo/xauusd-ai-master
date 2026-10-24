# Public Repository Security Boundary

This repository is the public distribution surface for XAUUSD AI Master.

## Allowed public responsibilities

The public current head may contain only explicitly allowlisted distribution and governance material, including:

- `packages/copy-protocol/**`
- `packages/license-service/**`
- `packages/installation-proof/**`
- the public security/governance files allowlisted by `security/repository-boundary.json`
- the public P1/P2/P3 and repository-boundary CI workflows
- the root workspace metadata required to build and verify the public packages

Everything else fails closed as `PRIVATE_REQUIRED`.

## Canonical main-rule compatibility

The `main-canonical-pr-governance` repository ruleset requires the GitHub Actions status contexts:

- `canonical-pr-linux`
- `canonical-pr-windows`

The public repository emits those exact contexts from public-only compatibility jobs in `.github/workflows/public-private-boundary-ci.yml`. Both jobs perform real verification on the sanitized public workspace: frozen dependency install, M4 boundary checks, workspace tests/build/typecheck, P1/P2/P3 boundary checks, and diff hygiene.

These compatibility jobs do not restore proprietary source, do not bypass the ruleset, and do not mutate production or trading runtime state.

## Private source boundary

Strategy, risk, execution, MT5 broker/runtime, Phase7B/Phase7C control logic, private deployment/runtime operations, and other proprietary Master/Core implementation remain outside the public current head.

Historical credential findings are governed separately by the redacted Gitleaks scan and `security/credential-remediation.json`.
