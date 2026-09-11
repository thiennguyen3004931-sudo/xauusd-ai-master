# License V1 — Account-Bound Offline Handoff Design

Date: 2026-09-11
Status: DESIGN REVIEW
Scope: XAUUSD AI MASTER operational handoff / customer licensing
Safety: source-only design; no production mutation, no mode/ARM mutation, no order/position mutation, no live test order

## 1. Goal

Enable XAUUSD AI MASTER to be packaged and handed off for operation while restricting trading authority to explicitly licensed MT5 account identities for a bounded validity period.

License V1 must be enforceable by the authoritative runtime/backend, not merely by Web/Telegram UI. A customer package must be able to verify a license without containing the private signing key.

## 2. Existing foundation

The current Phase7C source already has account/mode verification primitives, including account identity fields such as `accountLogin`, `server`, `profileFingerprint`, and an `AllowedLogins` / `MT5_ALLOWED_LOGINS` concept in `scripts/lib/phase7c-account-mode.ps1`.

License V1 extends this foundation. It does not replace canonical MT5 identity verification, Phase7C source-safety, ARM gates, lifecycle ownership, or existing execution safety controls.

## 3. Security model

### 3.1 What V1 protects

V1 provides cryptographic authenticity for license claims and enforces those claims before risk-increasing trading authority is granted. It protects against:

- editing account/login/server/company/environment claims in the license file;
- extending `validFrom` / `expiresAt` by editing the license;
- enabling an unlicensed symbol or operating mode by editing the license;
- using a valid license on a different MT5 account identity;
- using a missing, corrupt, unknown-key, or invalid-signature license to open new risk.

### 3.2 What V1 does not claim to protect

V1 is an offline signed-license design. It is not unbreakable DRM when an operator fully controls the machine and can patch the application/source/runtime. A determined operator with complete code/runtime control may bypass local checks by modifying the verifier itself.

Immediate remote revocation is also not possible in a purely offline V1. Revocation before expiry requires a future online authority/denylist or another trusted remote dependency.

Strict expiry based only on the local system clock is vulnerable to clock rollback. V1 therefore includes a local monotonic/last-seen-time defense described below, while acknowledging that a trusted online time source is required for stronger guarantees.

## 4. Canonical licensed identity

An account entitlement is matched against the live MT5 identity using all of:

- `accountLogin`
- normalized `server`
- normalized `company` (broker/company identity)
- `environment`: `LIVE` or `DEMO`

The existing `profileFingerprint` remains useful as a derived/canonical identity signal, but License V1 must not rely on login alone.

Normalization rules must be deterministic and shared by issuer and verifier:

- login: decimal digits represented as a string, no surrounding whitespace;
- server: trim surrounding whitespace, Unicode normalize, compare case-insensitively;
- company: trim surrounding whitespace, Unicode normalize, compare case-insensitively;
- environment: exact enum after uppercase normalization (`LIVE`, `DEMO`).

A runtime account change must trigger immediate license re-evaluation before any further risk-increasing action.

## 5. License envelope

The customer receives a signed license envelope. The private signing key remains owner-side and is never placed in the repository, customer package, CI artifacts, logs, environment snapshots, or diagnostics.

Proposed V1 envelope:

```json
{
  "schema": "XAUUSD-LICENSE-V1",
  "alg": "PS256",
  "keyId": "owner-2026-01",
  "payload": "<base64url-encoded UTF-8 JSON payload>",
  "signature": "<base64url RSA-PSS/SHA-256 signature>"
}
```

Signature input is the exact ASCII byte sequence:

```text
XAUUSD-LICENSE-V1.<payload-base64url>
```

This avoids ambiguous JSON canonicalization of signed claims.

The payload contains at least:

```json
{
  "licenseId": "XAU-000123",
  "issuedAt": "2026-09-11T00:00:00Z",
  "validFrom": "2026-09-11T00:00:00Z",
  "expiresAt": "2027-09-11T00:00:00Z",
  "accounts": [
    {
      "login": "12345678",
      "server": "Broker-Live01",
      "company": "Broker Name",
      "environment": "LIVE"
    }
  ],
  "entitlements": {
    "symbols": ["XAUUSD"],
    "modes": ["SEMI", "AUTO", "TREND", "SIDEWAY"]
  }
}
```

`licenseId`, `issuedAt`, `validFrom`, `expiresAt`, `accounts`, and `entitlements` are signed claims.

### 5.1 Cryptography

V1 uses asymmetric signatures. The owner-side issuer holds the private key; customer/runtime packages contain only trusted public key(s).

Preferred algorithm for V1: RSA-PSS with SHA-256 (`PS256`) using a minimum 3072-bit RSA key. `keyId` supports public-key rotation and coexistence of multiple trusted verification keys during renewal/migration.

No HMAC/shared signing secret may be shipped to the customer runtime.

## 6. Verification result

The verifier returns a structured immutable result rather than a loose Boolean:

```text
LICENSE_STATE=VALID | INVALID | EXPIRED | NOT_YET_VALID | ACCOUNT_MISMATCH |
              ENTITLEMENT_MISMATCH | UNKNOWN_KEY | MISSING | CORRUPT |
              CLOCK_ROLLBACK_SUSPECTED
LICENSE_ID=<id or empty>
ACCOUNT_MATCH=True|False
MODE_ALLOWED=True|False
SYMBOL_ALLOWED=True|False
VALID_FROM=<utc or empty>
EXPIRES_AT=<utc or empty>
REASON=<canonical reason code>
```

Only `LICENSE_STATE=VALID` may authorize a new risk-increasing action.

## 7. Authoritative enforcement points

UI status is informational only. Backend/runtime enforcement is mandatory at all relevant boundaries.

### Gate A — startup/session validation

Validate signature, schema, validity window, trusted `keyId`, and currently connected account identity. A missing/corrupt/invalid license starts in fail-closed trading authority.

### Gate B — account identity change

Whenever MT5 login/server/company/environment changes, invalidate cached authorization and re-verify before allowing risk-increasing actions.

### Gate C — ARM transition

Transition to trading ARM state requires `LICENSE_STATE=VALID` for the current account and requested scope. Invalid license must prevent new ARM activation.

### Gate D — effective trading mode / entitlement

A mode that can create new exposure must be allowed by the signed `entitlements.modes` claim. Symbol must be allowed by `entitlements.symbols`.

### Gate E — canonical risk-increasing execution boundary

Immediately before the canonical new-order / exposure-increasing send boundary, re-check current license authorization. This is the final authoritative gate and must not be bypassable by Web, Telegram, direct API calls, or stale cached UI state.

The implementation plan must identify the exact existing canonical ARM and order-send functions before code changes are made. No new parallel execution path may be introduced solely for licensing.

## 8. Fail-closed vs. safety-exit behavior

License failure must fail closed for new/increasing risk, but must not trap an operator in an existing market position.

When license is missing, invalid, expired, account-mismatched, or otherwise not valid:

### Must be blocked

- new ARM activation;
- new market/limit/stop orders that create exposure;
- increasing an existing position;
- switching into an execution mode if that transition grants new risk-increasing authority;
- any unlicensed symbol or unlicensed trading mode.

### Must remain allowed

- DISARM;
- emergency stop / safe shutdown;
- cancel pending orders;
- close/flatten an existing position;
- reduce an existing position;
- protective risk-reducing actions required to make an already-open position safer, subject to existing canonical safety rules.

The license subsystem must never weaken existing SL/non-widening, ownership, source-safety, or lifecycle constraints.

## 9. Time / expiry handling

All signed timestamps use UTC ISO-8601.

V1 verifies:

```text
validFrom <= effectiveNow < expiresAt
```

To reduce simple local-clock rollback bypass, runtime persists the latest successfully accepted UTC observation in tamper-evident/local state and rejects an obvious backward movement beyond a defined tolerance. The exact tolerance and storage mechanism are implementation details to be proven by tests.

This is defense-in-depth, not a trusted-time guarantee. Strong revocation/clock assurance is deferred to a future online License V2.

## 10. License issuance and packaging

### Owner-side only (never shipped to customer)

- private signing key;
- license issuance/signing utility;
- customer entitlement source records;
- renewal/replacement workflow.

### Customer package

- application/runtime;
- signed license envelope;
- trusted public verification key(s);
- verifier and authoritative enforcement gates;
- read-only license status in diagnostics/UI;
- operating guide covering renewal and safe behavior after expiry.

No secret capable of issuing a new valid license may be present in the customer package.

## 11. Diagnostics and observability

Diagnostics may expose non-secret license status:

```text
LICENSE_STATE
LICENSE_ID
KEY_ID
ACCOUNT_MATCH
MODE_ALLOWED
SYMBOL_ALLOWED
VALID_FROM
EXPIRES_AT
REASON
```

Diagnostics must not print private key material, raw signing secrets, credentials, or other protected values.

Recommended UI state:

```text
LICENSE: VALID
ACCOUNT: MATCHED
EXPIRES: 2027-09-11
```

or, on failure:

```text
LICENSE: EXPIRED
NEW RISK: BLOCKED
SAFE EXIT: AVAILABLE
```

## 12. Acceptance criteria

License V1 is not ready for handoff until automated tests prove at least:

1. valid signature + exact licensed account + valid time + allowed symbol/mode => PASS;
2. wrong login => new risk BLOCKED;
3. wrong server => new risk BLOCKED;
4. wrong company => new risk BLOCKED;
5. LIVE/DEMO environment mismatch => new risk BLOCKED;
6. before `validFrom` => BLOCKED;
7. at/after `expiresAt` => BLOCKED;
8. any tampered signed claim => signature invalid => BLOCKED;
9. missing/corrupt license => BLOCKED;
10. unknown `keyId` => BLOCKED;
11. unlicensed symbol => BLOCKED;
12. unlicensed mode => BLOCKED;
13. runtime account switch away from licensed identity => further new risk BLOCKED without requiring restart;
14. stale UI/API state cannot bypass the canonical execution gate;
15. direct execution invocation cannot bypass license enforcement;
16. DISARM remains available with invalid/expired license;
17. cancel pending order remains available with invalid/expired license;
18. close/flatten/reduce existing exposure remains available with invalid/expired license;
19. clock rollback behavior follows the documented V1 policy;
20. private signing key is absent from repository, package, CI artifacts, logs, and runtime diagnostics.

## 13. TDD / delivery sequence after design approval

After this design is explicitly approved, implementation proceeds only through:

```text
implementation plan
→ TDD RED
→ verifier/source implementation
→ GREEN
→ authoritative ARM gate
→ RED/GREEN
→ canonical risk-increasing execution gate
→ RED/GREEN
→ account-switch revalidation
→ RED/GREEN
→ diagnostics/UI status
→ full CI
→ diff/security review
→ PR
→ merge only if all gates pass
→ packaging acceptance
```

No production rollout or live test order is part of the source implementation PR unless separately reviewed and explicitly authorized.

## 14. Non-goals for V1

- online subscription billing;
- immediate remote revocation;
- centralized license server;
- hardware dongle/device binding;
- anti-debug/anti-decompilation DRM claims;
- automatic production rollout;
- changing trading strategy behavior (Trend, Sideway, SEMI, AUTO, FastMove, M5 handoff, TP/SL logic).

License V1 only controls whether the already-canonical system is permitted to create/increase trading exposure for the licensed identity and entitlement window.

## 15. Design decision

Adopt **offline asymmetric signed License V1**, bound to exact MT5 account identity (`LOGIN + SERVER + COMPANY + ENVIRONMENT`) with signed validity and entitlement claims, enforced at authoritative ARM and risk-increasing execution boundaries. Preserve risk-reducing exits even when license is invalid or expired.

Implementation remains blocked until this design is explicitly approved.