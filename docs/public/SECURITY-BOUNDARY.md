# Public Distribution Security Boundary

This repository is the public protocol, verification, follower, and distribution surface for XAUUSD AI MASTER.

Public-safe responsibilities are limited to:

- Copy protocol contracts and sanitized lifecycle command schemas.
- License verification contracts.
- Installation proof-of-possession primitives.
- Follower/distribution code and public-safe build, test, typecheck, and security tooling.

Proprietary Master/Core responsibilities belong only in the private Master/Core repository. They include strategy selection, signal and decision logic, trade-management logic, Master-specific risk decisions, proprietary analytics, Master orchestration, signing administration, and private deployment/runtime tooling.

The dependency boundary is one-way:

```text
PUBLIC contracts
  -> PRIVATE Master/Core
  -> sanitized signed lifecycle commands
  -> PUBLIC follower/distribution
```

The public repository must build and test without access to the private repository. No private signing key, device private key, credential, token, password, production environment file, proprietary trading threshold, internal strategy formula, or private runtime source may be committed here.

Historical public exposure is not treated as reversible secrecy. Credential findings are remediated by rotation or revocation and tracked only through redacted remediation metadata.
