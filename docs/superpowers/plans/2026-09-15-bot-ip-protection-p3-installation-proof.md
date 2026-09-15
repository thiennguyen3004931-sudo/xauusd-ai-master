# BOT IP Protection V1 — P3 Installation Proof-of-Possession Plan

## Goal

Implement strategy-independent Ed25519 device identity proof for first enrollment and reconnect. A copied follower installation without the device private key must not be able to prove the enrolled identity.

This phase is source-only. It does not enroll production customers, persist secrets, start servers, mutate MT5, alter bot modes, or place orders.

## Repository visibility boundary

The repository is currently PUBLIC by operator choice. P3 protocol/verification code may be public because security relies on asymmetric private-key possession, not source secrecy. No device private key, command-signing private key, enrollment secret, or proprietary strategy logic may be committed.

The public repository is not a sufficient confidentiality boundary for proprietary Master strategy code. Private-core extraction remains a separate required security hardening before customer distribution.

## Scope

Create a new package:

```text
@xauusd/installation-proof
```

Allowed runtime dependency:

```text
@xauusd/copy-protocol
```

Allowed platform primitive:

```text
node:crypto
```

Forbidden dependencies/imports:

```text
@xauusd/strategy-engine
@xauusd/risk-engine
@xauusd/execution-engine
@xauusd/mt5-broker
Phase7B / Phase7C controllers
filesystem persistence
network/server code
MT5 mutation code
```

## Canonical challenge

V1 challenge fields:

```text
version = 1
challengeId
purpose = ENROLLMENT | RECONNECT
licenseId
installationId
nonce
issuedAt
expiresAt
```

Rules:

- `challengeId`, `licenseId`, and `installationId` are canonical non-blank strings.
- `nonce` is exactly 32 cryptographically random bytes encoded as canonical base64url.
- `createInstallationChallenge(...)` uses `randomUUID()` for `challengeId` and `randomBytes(32)` for `nonce`; tests validate generated shape rather than weakening production randomness for determinism.
- timestamps are safe integers.
- `expiresAt > issuedAt`.
- maximum V1 challenge lifetime is 5 minutes.
- canonical signing bytes use P1 deterministic canonical JSON.

## Canonical device public key

`installationPublicKey` is **not stored or compared as free-form PEM text**.

Canonical representation:

```text
Ed25519 public key
-> SPKI DER bytes
-> canonical base64url string
```

Rules:

- decoding then re-encoding must produce exactly the supplied base64url text;
- DER must parse as an Ed25519 public key;
- enrollment returns this canonical representation for server-side binding;
- reconnect compares canonical key material, avoiding PEM whitespace/format ambiguity.

Private signing helpers may accept an Ed25519 private key object/PEM supplied by the caller, but private keys are never persisted by this package.

## Proof body

The device signs all challenge fields plus its canonical public key:

```text
challenge
installationPublicKey
```

The proof adds:

```text
signature
```

The signature is Ed25519 and canonical base64url.

Binding the canonical public key into signed bytes prevents substitution of another public key after the signature is produced.

## Verification API

Expose separate enrollment and reconnect verification paths.

### Enrollment

`verifyEnrollmentProof(...)`:

- validates challenge/proof runtime shape;
- requires `purpose=ENROLLMENT`;
- verifies expected licenseId + installationId;
- enforces challenge time window;
- parses the candidate canonical Ed25519 public key;
- verifies the Ed25519 signature;
- only after all cryptographic/identity checks pass, atomically consumes `challengeId` through caller-provided `consumeOnce(challengeId)`;
- returns the verified canonical public key to the caller for later server-side binding.

Challenge issuance authorization and license mutation are outside this package.

### Reconnect

`verifyReconnectProof(...)` performs the same checks, but:

- requires `purpose=RECONNECT`;
- requires proof public key to equal the already enrolled canonical public key;
- rejects malformed expected enrolled key material fail-closed;
- only then verifies signature and consumes the challenge.

This prevents a copied installation from reconnecting with a newly generated substitute key.

## Replay boundary

P3 must enforce single-use challenge semantics without choosing a production database.

The verifier receives:

```text
consumeOnce(challengeId): Promise<boolean>
```

Contract:

- called only after shape/time/identity/signature checks pass;
- `true` means first atomic consumption -> proof may succeed;
- `false` means already consumed -> `CHALLENGE_REPLAYED`;
- thrown/rejected store operations fail closed as `CHALLENGE_STORE_ERROR`;
- storage/persistence implementation is deferred to server integration;
- command sequence/idempotency remains P4.

## Private-key handling

Provide only cryptographic helpers needed for tests/follower integration:

- generate Ed25519 device key pair;
- export canonical SPKI DER/base64url public key;
- sign proof using a caller-supplied private key.

The package must not persist private keys or know filesystem paths. DPAPI/equivalent local private-key storage is a follower packaging responsibility and remains required before customer distribution.

## Deterministic result codes

Success:

```text
VERIFIED
```

Fail closed with deterministic codes:

```text
INVALID_CHALLENGE
INVALID_PROOF
PURPOSE_MISMATCH
LICENSE_MISMATCH
INSTALLATION_MISMATCH
CHALLENGE_NOT_YET_VALID
CHALLENGE_EXPIRED
PUBLIC_KEY_MISMATCH
INVALID_EXPECTED_PUBLIC_KEY
INVALID_SIGNATURE
CHALLENGE_REPLAYED
CHALLENGE_STORE_ERROR
```

Malformed public keys/signatures/store errors must never escape as uncaught exceptions from verification.

## TDD execution plan

### Task 1 — Challenge contract RED -> GREEN

Create package scaffold and challenge tests first. RED must be caused by missing challenge implementation.

GREEN implements:

- exact challenge fields;
- strict runtime validation;
- secure `randomUUID()` + `randomBytes(32)` challenge generation;
- canonical nonce validation;
- 5-minute maximum lifetime;
- deterministic canonical challenge bytes.

### Task 2 — Device key + proof signing RED -> GREEN

Tests first for:

- Ed25519 key generation;
- canonical SPKI DER/base64url public-key export and validation;
- deterministic proof-body bytes;
- signature round trip;
- proof/public-key/challenge tampering invalidates signature;
- non-Ed25519/malformed keys fail closed.

Then implement minimal key/signing helpers.

### Task 3 — Enrollment verification RED -> GREEN

Tests first for:

- valid ENROLLMENT proof -> VERIFIED;
- wrong purpose/license/installation -> deterministic reject;
- not-yet-valid / expired challenge reject;
- copied installation using a different private key cannot prove original identity;
- valid proof consumes challenge exactly once;
- second use -> CHALLENGE_REPLAYED;
- invalid signature must not consume challenge;
- challenge-store failure -> CHALLENGE_STORE_ERROR, never throw.

Then implement minimal enrollment verifier.

### Task 4 — Reconnect verification RED -> GREEN

Tests first for:

- valid enrolled key reconnect -> VERIFIED;
- substitute public key -> PUBLIC_KEY_MISMATCH;
- valid signature from substitute key still rejected;
- equivalent/noncanonical text encodings are not accepted as canonical key material;
- malformed expected enrolled key -> INVALID_EXPECTED_PUBLIC_KEY;
- replay remains rejected;
- malformed proof never throws.

Then implement minimal reconnect verifier.

### Task 5 — Boundary + final CI RED -> GREEN

Add `scripts/test-bot-ip-protection-p3-boundary.mjs` proving:

- exact public package dependency boundary;
- no strategy/risk/execution/MT5 imports;
- no filesystem/network/server mutation path;
- no PEM private-key literals or committed secret material;
- dedicated CI has PR + push, read-only permissions, frozen install, tests, typecheck, build, boundary, diff hygiene.

Update workspace lockfile canonically with pnpm and require frozen install.

## Acceptance cases

At minimum, exact-head CI must prove:

1. valid enrollment proof verifies once;
2. copied install without original private key is rejected;
3. reconnect requires the enrolled canonical public key;
4. challenge purpose is bound by signature;
5. licenseId is bound by signature and expected identity;
6. installationId is bound by signature and expected identity;
7. public-key substitution is rejected;
8. tampering any signed field invalidates proof;
9. expired/not-yet-valid challenge rejected;
10. malformed keys/signatures fail closed without throw;
11. replayed challenge rejected after atomic first consumption;
12. invalid signature does not burn the challenge;
13. challenge-store failure fails closed and does not throw;
14. package has no proprietary strategy dependency;
15. package has no persistence/network/MT5 mutation path;
16. no private keys/secrets are committed;
17. P1 and P2 regression CI remain green;
18. canonical repository gates remain green.

## Integration boundary

P3 does not:

- issue customer credentials;
- authorize who may request an enrollment challenge;
- store challenge consumption in a production database;
- persist device private keys;
- implement DPAPI;
- implement command replay/sequence state (P4);
- generate copy events or sign copy commands (P5);
- execute MT5 follower actions (P6+);
- mutate production runtime.

## Required delivery sequence

```text
TDD RED
-> minimal GREEN
-> package tests/typecheck/build
-> P3 boundary
-> P1/P2 regressions
-> canonical repo CI
-> diff review
-> PR
-> merge only exact-head all-green
-> post-merge push verification
-> STOP before production integration
```

## Safety invariant

```text
PRODUCTION_MUTATION=NONE
BOT_RUNTIME_MUTATION=NONE
MODE_MUTATION=NONE
ARM_MUTATION=NONE
TASK_MUTATION=NONE
PROCESS_MUTATION=NONE
ORDER_MUTATION=NONE
POSITION_MUTATION=NONE
LIVE_TEST_ORDER=NONE
SECRET_VALUES_PRINTED=FALSE
```
