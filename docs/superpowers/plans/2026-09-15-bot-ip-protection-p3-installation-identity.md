# BOT IP Protection P3 Installation Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add installation enrollment identity and asymmetric proof-of-possession without exposing Master strategy logic or long-lived shared secrets in the public repository.

**Architecture:** P3 adds a strategy-independent `@xauusd/installation-identity` package. Each installation owns an Ed25519 device keypair; server-side enrollment stores only the public key and installation binding. Requests prove possession by signing a canonical challenge envelope. Device private-key storage is abstracted behind a local key-store interface; Windows DPAPI integration remains an adapter boundary and is not required to run in CI.

**Tech Stack:** TypeScript 5.9, Node.js 24 `crypto`, Vitest 2.1.9, tsup, pnpm 10.18.0.

**Spec:** `docs/superpowers/specs/2026-09-14-bot-ip-protection-license-v1-design.md`

## Global Constraints

- Repository is PUBLIC; no proprietary strategy logic or private key material may be committed.
- Installation identity is not authorization by itself; license/account/broker authorization remains P2.
- Hardware fingerprint is not a root of trust.
- No global symmetric secret is embedded in follower code.
- No MT5, bot mode, ARM, order, position, process, task, or production mutation.
- P4 replay persistence, P5 command generation/signing integration, and P6 follower execution are explicitly out of scope.

---

### Task 1: Installation identity contract

**Files:**
- Create: `packages/installation-identity/package.json`
- Create: `packages/installation-identity/tsconfig.json`
- Create: `packages/installation-identity/src/identity.ts`
- Create: `packages/installation-identity/src/identity.test.ts`
- Create: `packages/installation-identity/src/index.ts`

**Interfaces:**
- Produces: `InstallationIdentity`, `generateInstallationIdentity()`, `exportInstallationPublicKey()`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { generateInstallationIdentity, exportInstallationPublicKey } from "./identity.js";

describe("installation identity", () => {
  it("creates unique installation ids and Ed25519 keypairs", () => {
    const a = generateInstallationIdentity();
    const b = generateInstallationIdentity();
    expect(a.installationId).not.toBe(b.installationId);
    expect(exportInstallationPublicKey(a)).not.toBe(exportInstallationPublicKey(b));
    expect(a.privateKeyPem).toContain("PRIVATE KEY");
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `pnpm --filter @xauusd/installation-identity test`
Expected: FAIL because `identity.ts` does not exist.

- [ ] **Step 3: Implement minimal identity generation**

```ts
import { generateKeyPairSync, randomUUID } from "node:crypto";

export interface InstallationIdentity {
  installationId: string;
  publicKeyPem: string;
  privateKeyPem: string;
}

export function generateInstallationIdentity(): InstallationIdentity {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    installationId: randomUUID(),
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

export function exportInstallationPublicKey(identity: InstallationIdentity): string {
  return identity.publicKeyPem;
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @xauusd/installation-identity test && pnpm --filter @xauusd/installation-identity typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/installation-identity
git commit -m "feat(identity): add installation keypair contract"
```

### Task 2: Canonical proof-of-possession challenge

**Files:**
- Create: `packages/installation-identity/src/proof.ts`
- Create: `packages/installation-identity/src/proof.test.ts`
- Modify: `packages/installation-identity/src/index.ts`

**Interfaces:**
- Consumes: P1 canonical JSON semantics.
- Produces: `InstallationChallenge`, `signInstallationChallenge()`, `verifyInstallationChallenge()`.

- [ ] **Step 1: Write failing tests** covering valid proof, altered installationId, altered nonce, altered expiry, wrong public key, malformed signature, and expired challenge.
- [ ] **Step 2: Run test to verify RED** because `proof.ts` does not exist.
- [ ] **Step 3: Implement canonical UTF-8 serialization plus Ed25519 signing/verification using Node `crypto.sign(null, bytes, key)` and `crypto.verify(null, bytes, key, signature)`; verifier must fail closed and never throw for malformed untrusted input.
- [ ] **Step 4: Run full package tests/typecheck** and require PASS.
- [ ] **Step 5: Commit** with `feat(identity): add proof-of-possession challenge`.

### Task 3: Enrollment binding contract

**Files:**
- Create: `packages/installation-identity/src/enrollment.ts`
- Create: `packages/installation-identity/src/enrollment.test.ts`
- Modify: `packages/installation-identity/src/index.ts`

**Interfaces:**
- Produces: `InstallationEnrollmentRecord`, `enrollInstallation()`, `validateEnrollmentProof()`.

- [ ] **Step 1: Write failing tests** proving enrollment stores `installationId + publicKey + licenseId`, rejects duplicate installationId with a different public key, and requires a valid proof before returning `ENROLLED`.
- [ ] **Step 2: Run RED** because `enrollment.ts` does not exist.
- [ ] **Step 3: Implement in-memory repository interface and pure enrollment service; no network or database dependency.
- [ ] **Step 4: Run full tests/typecheck/build** and require PASS.
- [ ] **Step 5: Commit** with `feat(identity): add enrollment binding contract`.

### Task 4: Private-key storage boundary and public-repo safety

**Files:**
- Create: `packages/installation-identity/src/key-store.ts`
- Create: `packages/installation-identity/src/key-store.test.ts`
- Create: `scripts/test-bot-ip-protection-p3-boundary.mjs`
- Create: `.github/workflows/bot-ip-protection-p3-installation-identity-ci.yml`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces: `InstallationPrivateKeyStore` with `save`, `load`, and `delete` methods; CI uses only an in-memory test implementation.

- [ ] **Step 1: Write RED tests** proving application code depends on the interface, raw private key never appears in enrollment records/log fixtures, and no strategy-engine/risk-engine/mt5-broker dependency exists.
- [ ] **Step 2: Run RED** on the boundary script before adding final CI/security gates.
- [ ] **Step 3: Implement the interface and in-memory test adapter; do not commit OS-secret implementation or any key material.
- [ ] **Step 4: Regenerate lockfile with pnpm 10.18.0 and switch CI to `pnpm install --frozen-lockfile`.
- [ ] **Step 5: Run exact-head gates:** package tests, typecheck, build, boundary script, canonical Linux/Windows workflows, diff hygiene.
- [ ] **Step 6: Commit** with `ci(identity): enforce P3 security boundary`.

### Task 5: Review and merge boundary

**Files:** no new runtime files.

- [ ] Review the exact PR diff and confirm only P3 package/CI/lockfile changes.
- [ ] Confirm no private key, token, strategy code, FastMove/M5 internals, or MT5 execution code is present.
- [ ] Confirm all exact-head CI is green.
- [ ] Merge source-only PR.
- [ ] Stop before any production rollout or follower deployment.
