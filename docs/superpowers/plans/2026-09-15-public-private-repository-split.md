# Public / Private Repository Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a new private `xauusd-ai-master-core` repository the only canonical home for proprietary Master behavior while converting the existing public `xauusd-ai-master` repository into a protocol/follower/distribution repository without mutating production trading runtime.

**Architecture:** Preserve full Git provenance by bootstrapping the private repository from an exact public commit before removing private-required files from the public current head. Enforce a one-way dependency boundary: public protocol/contracts may be consumed by private Master/Core, but public source and CI may never consume private source or private secrets. Historical public exposure is treated as irreversible; security value comes from preventing future proprietary changes and secrets from entering public history.

**Tech Stack:** Git/GitHub, Node.js 24, TypeScript 5.9, pnpm 10.18.0, Turbo 2.5, Vitest 2.1.9, GitHub Actions, Ed25519 via Node `crypto`, Gitleaks v8 container for history scanning.

**Spec:** `docs/superpowers/specs/2026-09-15-public-private-repository-split-design.md`

## Global Constraints

- Existing public repository remains `thiennguyen3004931-sudo/xauusd-ai-master` until source migration is accepted.
- New private canonical repository name is `thiennguyen3004931-sudo/xauusd-ai-master-core`.
- Private repository must be private from its first pushed commit.
- No private signing key, device private key, credential, token, or long-lived secret may be committed to either repository.
- Previously public Git history is treated as potentially copied; deletion or history rewrite is not accepted as credential remediation.
- Public repository may contain only protocol, verification, installation-proof client primitives, generic authorization contracts, follower/distribution code, public-safe schemas/docs/tests/CI.
- Private repository owns proprietary strategy selection, signal/decision logic, trade-management logic, Master-specific risk decisions, proprietary analytics, Master orchestration, pre-sanitization Copy Events, signing service, license administration, and private deployment/runtime tooling.
- Dependency direction is one-way: PUBLIC contracts -> PRIVATE Master/Core -> sanitized signed lifecycle commands -> PUBLIC follower.
- Public build and CI must succeed with zero private repository access.
- P3 canonical implementation is `@xauusd/installation-proof` from PR #359; PR #360 is superseded and must not become a second canonical P3.
- Production follower key persistence remains blocked until an OS-protected private-key store is separately accepted.
- `PRODUCTION_MUTATION=NONE`.
- `BOT_RUNTIME_MUTATION=NONE`.
- `MODE_MUTATION=NONE`.
- `ARM_MUTATION=NONE`.
- `TASK_MUTATION=NONE`.
- `PROCESS_MUTATION=NONE`.
- `ORDER_MUTATION=NONE`.
- `POSITION_MUTATION=NONE`.
- `LIVE_TEST_ORDER=NONE`.
- Production cutover is outside this plan; this plan may create a read-only preflight and a later rollout plan, but it may not perform rollout.

---

## File Structure

### Public repository files created or retained by this plan

- `security/repository-boundary.json` — explicit public/private path policy.
- `security/credential-remediation.json` — redacted finding fingerprints and remediation status only.
- `scripts/security/classify-repository.mjs` — classifies every tracked file and fails on unknown paths.
- `scripts/security/check-public-change-freeze.mjs` — prevents adding/modifying private-required paths while allowing deletion during migration.
- `scripts/security/check-public-boundary.mjs` — final public-head gate: zero private-required files and no private imports.
- `scripts/security/check-distribution-artifact.mjs` — inspects public build output for forbidden private modules/secrets.
- `.github/workflows/public-private-boundary-ci.yml` — read-only CI for boundary/freeze/inventory.
- `.github/workflows/public-distribution-ci.yml` — final public distribution build/test/artifact gate.
- `docs/public/SECURITY-BOUNDARY.md` — public-safe description of the repository boundary.

### Private repository files created by this plan

- `security/private-bootstrap-attestation.json` — exact public source commit/tree used to bootstrap private core.
- `security/public-contract.lock.json` — pinned public commit whose protocol/contracts are accepted by private core.
- `scripts/security/verify-private-bootstrap.mjs` — verifies source commit/tree provenance.
- `scripts/security/verify-public-contract-lock.mjs` — proves private copies of public contracts equal the pinned public commit.
- `scripts/security/check-private-secrets.mjs` — rejects tracked private key/credential material.
- `.github/workflows/private-master-core-ci.yml` — private build/regression/security gate.
- `scripts/security/preflight-private-cutover.ps1` — read-only source/runtime cutover evidence only.

---

### Task 1: M0 secrecy freeze and repository classification gate

**Files:**
- Create: `security/repository-boundary.json`
- Create: `scripts/security/classify-repository.mjs`
- Create: `scripts/security/check-public-change-freeze.mjs`
- Create: `scripts/security/classify-repository.test.mjs`
- Create: `.github/workflows/public-private-boundary-ci.yml`

**Interfaces:**
- Produces: `classifyPath(path): "SAFE_PUBLIC" | "PRIVATE_REQUIRED"`.
- Produces CLI: `node scripts/security/classify-repository.mjs --tracked` exits `0` only when every tracked file is classified.
- Produces CLI: `node scripts/security/check-public-change-freeze.mjs <baseSha> <headSha>` exits non-zero if a non-deletion change touches `PRIVATE_REQUIRED`.

- [ ] **Step 1: Write the failing classifier test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { classifyPath } from "./classify-repository.mjs";

test("known public and private responsibilities classify deterministically", () => {
  assert.equal(classifyPath("packages/copy-protocol/src/index.ts"), "SAFE_PUBLIC");
  assert.equal(classifyPath("packages/license-service/src/index.ts"), "SAFE_PUBLIC");
  assert.equal(classifyPath("packages/installation-proof/src/challenge.ts"), "SAFE_PUBLIC");
  assert.equal(classifyPath("packages/strategy-engine/src/index.ts"), "PRIVATE_REQUIRED");
  assert.equal(classifyPath("packages/risk-engine/src/index.ts"), "PRIVATE_REQUIRED");
  assert.equal(classifyPath("apps/api/src/index.ts"), "PRIVATE_REQUIRED");
});
```

- [ ] **Step 2: Run RED**

Run: `node --test scripts/security/classify-repository.test.mjs`

Expected: FAIL because `classify-repository.mjs` does not exist.

- [ ] **Step 3: Add an explicit boundary manifest**

```json
{
  "version": 1,
  "safePublicPrefixes": [
    "packages/copy-protocol/",
    "packages/license-service/",
    "packages/installation-proof/",
    "security/",
    "scripts/security/",
    "docs/public/"
  ],
  "safePublicExact": [
    ".gitignore",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "turbo.json",
    "README.md"
  ],
  "privateRequiredPrefixes": [
    "apps/",
    "packages/ai-engine/",
    "packages/analysis-engine/",
    "packages/backtest-engine/",
    "packages/execution-engine/",
    "packages/indicators/",
    "packages/market-data/",
    "packages/mt5-broker/",
    "packages/risk-engine/",
    "packages/shared/",
    "packages/signal-engine/",
    "packages/strategy-engine/",
    "packages/types/",
    "scripts/"
  ]
}
```

Implementation rule: `safePublicExact` and the three explicit public package prefixes win before the broad `scripts/` private prefix; unknown tracked paths fail classification rather than defaulting public.

- [ ] **Step 4: Implement classifier and freeze gate**

```js
export function classifyPath(path) {
  if (SAFE_EXACT.has(path)) return "SAFE_PUBLIC";
  if (SAFE_PREFIXES.some((prefix) => path.startsWith(prefix))) return "SAFE_PUBLIC";
  if (PRIVATE_PREFIXES.some((prefix) => path.startsWith(prefix))) return "PRIVATE_REQUIRED";
  throw new Error(`UNCLASSIFIED_PATH:${path}`);
}
```

Freeze command must inspect `git diff --name-status <baseSha>...<headSha>` and reject `A`, `M`, `R`, `C`, `T`, `U`, `X`, `B` changes to `PRIVATE_REQUIRED`; deletion `D` is allowed so migration can remove proprietary files.

- [ ] **Step 5: Run GREEN and tracked inventory**

Run:

```bash
node --test scripts/security/classify-repository.test.mjs
node scripts/security/classify-repository.mjs --tracked
```

Expected: tests PASS; inventory initially reports private-required paths but no unclassified path.

- [ ] **Step 6: Add read-only PR CI and commit**

Workflow permissions: `contents: read`; checkout with full diff history; run classifier test, tracked classification, and freeze gate against PR base/head.

```bash
git add security scripts/security .github/workflows/public-private-boundary-ci.yml
git commit -m "security: freeze public private repository boundary"
```

### Task 2: M1 secret-history scan and redacted remediation gate

**Files:**
- Create: `security/credential-remediation.json`
- Create: `scripts/security/validate-credential-remediation.mjs`
- Create: `scripts/security/validate-credential-remediation.test.mjs`
- Modify: `.github/workflows/public-private-boundary-ci.yml`

**Interfaces:**
- Consumes: redacted Gitleaks JSON report at `artifacts/security/gitleaks.json`.
- Produces: remediation state keyed only by finding fingerprint, rule ID, path, commit, status; never secret value.
- Allowed status: `ROTATED`, `REVOKED`, `FALSE_POSITIVE_REVIEWED`.

- [ ] **Step 1: Write RED tests for remediation coverage**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { validateRemediation } from "./validate-credential-remediation.mjs";

test("every credible fingerprint must be remediated", () => {
  assert.throws(() => validateRemediation(
    [{ Fingerprint: "abc", RuleID: "generic-api-key" }],
    { findings: [] }
  ), /UNREMEDIATED_SECRET_FINDING:abc/);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test scripts/security/validate-credential-remediation.test.mjs`

Expected: FAIL because validator does not exist.

- [ ] **Step 3: Implement validator and empty remediation ledger**

```json
{
  "version": 1,
  "findings": []
}
```

Validator must compare fingerprints only and reject duplicate fingerprints, unknown statuses, or any ledger field named `secret`, `value`, `token`, `password`, `privateKey`, or `credentialValue`.

- [ ] **Step 4: Add history scan job**

Use full checkout (`fetch-depth: 0`) and run:

```bash
mkdir -p artifacts/security
docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:v8.24.2 detect \
  --source=/repo \
  --redact \
  --log-opts="--all" \
  --report-format=json \
  --report-path=/repo/artifacts/security/gitleaks.json \
  --exit-code=0
node scripts/security/validate-credential-remediation.mjs \
  artifacts/security/gitleaks.json \
  security/credential-remediation.json
```

The workflow uploads only the redacted report artifact. If credible findings exist, rotate/revoke them outside Git and add only their fingerprints/remediation status to `security/credential-remediation.json`; re-run until the validator passes.

- [ ] **Step 5: Commit**

```bash
git add security/credential-remediation.json scripts/security .github/workflows/public-private-boundary-ci.yml
git commit -m "security: gate historical secret remediation"
```

### Task 3: Canonicalize P3 before repository split

**Files:**
- Existing canonical plan: `docs/superpowers/plans/2026-09-15-bot-ip-protection-p3-installation-proof.md` from PR #358/#359.
- Canonical implementation target: `packages/installation-proof/**` from PR #359.
- Superseded implementation: `packages/installation-identity/**` from PR #360; do not merge.

**Interfaces:**
- Produces one public P3 package: `@xauusd/installation-proof`.
- Required cryptographic representation: Ed25519 SPKI DER -> canonical base64url.
- Required replay hook: `consumeOnce(challengeId): Promise<boolean>`.

- [ ] **Step 1: Close PR #360 as superseded**

Add top-level comment:

```text
Superseded by the approved Public/Private split and the stricter P3 installation-proof contract in #359. Do not merge a second canonical identity/proof system.
```

Then close #360 without merge.

- [ ] **Step 2: Rebase/update #359 onto current public `main`**

Preserve the intentional TDD history. Confirm changed files stay limited to `packages/installation-proof/**`, its P3 workflow, lockfile, and P3 plan.

- [ ] **Step 3: Execute the existing P3 plan to GREEN**

Required final commands:

```bash
pnpm install --frozen-lockfile
pnpm --filter @xauusd/copy-protocol build
pnpm --filter @xauusd/installation-proof test
pnpm --filter @xauusd/installation-proof typecheck
pnpm --filter @xauusd/installation-proof build
node scripts/test-bot-ip-protection-p3-boundary.mjs
```

Expected: all PASS; no private key persistence; no strategy/risk/execution/MT5 dependency.

- [ ] **Step 4: Merge #359 exact-head only after all CI is green**

Use the exact PR head SHA as the merge precondition. Stop if the head changes after review.

### Task 4: M2 bootstrap the private Master/Core with exact provenance

**Files in private repo:**
- Create: `security/private-bootstrap-attestation.json`
- Create: `scripts/security/verify-private-bootstrap.mjs`
- Create: `scripts/security/verify-private-bootstrap.test.mjs`

**Interfaces:**
- Consumes public source checkpoint dynamically from `git rev-parse origin/main` after Task 3 merges.
- Produces attestation fields: `publicRepository`, `publicCommit`, `publicTree`, `privateRepository`, `privateBootstrapCommit`, `privateBootstrapTree`.

- [ ] **Step 1: Create the repository private from inception**

Run from an authenticated maintainer workstation:

```bash
gh repo create thiennguyen3004931-sudo/xauusd-ai-master-core --private --confirm
git clone --mirror https://github.com/thiennguyen3004931-sudo/xauusd-ai-master.git xauusd-ai-master-core.git
cd xauusd-ai-master-core.git
git remote set-url --push origin git@github.com:thiennguyen3004931-sudo/xauusd-ai-master-core.git
git push --mirror
```

Immediately verify:

```bash
gh repo view thiennguyen3004931-sudo/xauusd-ai-master-core --json visibility,nameWithOwner
```

Expected: `visibility=PRIVATE`.

- [ ] **Step 2: Clone the private repository normally and write RED provenance test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { verifyBootstrap } from "./verify-private-bootstrap.mjs";

test("bootstrap requires identical source and private tree", () => {
  assert.throws(() => verifyBootstrap({ publicTree: "aaa", privateBootstrapTree: "bbb" }), /BOOTSTRAP_TREE_MISMATCH/);
});
```

- [ ] **Step 3: Generate attestation from Git, not hand-entered hashes**

```bash
PUBLIC_COMMIT=$(git rev-parse origin/main)
PUBLIC_TREE=$(git rev-parse origin/main^{tree})
PRIVATE_COMMIT=$(git rev-parse HEAD)
PRIVATE_TREE=$(git rev-parse HEAD^{tree})
node scripts/security/write-private-bootstrap-attestation.mjs \
  "$PUBLIC_COMMIT" "$PUBLIC_TREE" "$PRIVATE_COMMIT" "$PRIVATE_TREE"
```

At bootstrap, `PUBLIC_COMMIT` must equal `PRIVATE_COMMIT` and `PUBLIC_TREE` must equal `PRIVATE_TREE`.

- [ ] **Step 4: Run GREEN and commit privately**

```bash
node --test scripts/security/verify-private-bootstrap.test.mjs
node scripts/security/verify-private-bootstrap.mjs security/private-bootstrap-attestation.json
git add security scripts/security
git commit -m "security: attest private master core bootstrap"
```

### Task 5: M3 private Master/Core CI and secret boundary

**Files in private repo:**
- Create: `scripts/security/check-private-secrets.mjs`
- Create: `scripts/security/check-private-secrets.test.mjs`
- Create: `.github/workflows/private-master-core-ci.yml`

**Interfaces:**
- Produces gate `PRIVATE_MASTER_CORE_CI=PASS` only when install/build/test and secret checks pass.

- [ ] **Step 1: Write RED secret-boundary tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { inspectTrackedPath } from "./check-private-secrets.mjs";

test("rejects tracked private key and credential files", () => {
  assert.equal(inspectTrackedPath("keys/master-signing.pem"), "REJECT");
  assert.equal(inspectTrackedPath("config/prod.env"), "REJECT");
});
```

- [ ] **Step 2: Implement fail-closed tracked-file checks**

Reject tracked paths matching `*.pem`, `*.p12`, `*.pfx`, `.env`, `.env.*` except explicit `.example` files, `id_rsa*`, `id_ed25519*`, and filenames containing `private-key`, `signing-key`, `credential`, or `secret` unless under a test-fixture directory containing only synthetic values.

- [ ] **Step 3: Add private CI**

Workflow runs:

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm build
node --test scripts/security/check-private-secrets.test.mjs
node scripts/security/check-private-secrets.mjs --tracked
```

Also run the accepted Master regression suites already present in the repository through the root `pnpm test`; do not weaken or replace existing Phase7/strategy gates.

- [ ] **Step 4: Commit privately and require GREEN before public sanitization**

```bash
git add scripts/security .github/workflows/private-master-core-ci.yml
git commit -m "ci: establish private master core acceptance gate"
```

### Task 6: M4 sanitize current public head

**Files in public repo:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Retain: `packages/copy-protocol/**`
- Retain: `packages/license-service/**`
- Retain: `packages/installation-proof/**`
- Create: `docs/public/SECURITY-BOUNDARY.md`
- Create: `scripts/security/check-public-boundary.mjs`
- Delete from current head: every path classified `PRIVATE_REQUIRED` by Task 1.

**Interfaces:**
- Produces public workspace that builds/tests with zero private source.

- [ ] **Step 1: Write RED public-boundary test before deletion**

`check-public-boundary.mjs` must call `git ls-files`, classify each path, and fail with `PRIVATE_REQUIRED_PRESENT:<path>` for any private-required tracked file.

Run:

```bash
node scripts/security/check-public-boundary.mjs
```

Expected: FAIL on the current unsanitized public tree.

- [ ] **Step 2: Generate exact removal list from the classifier**

```bash
node scripts/security/classify-repository.mjs --tracked --emit-private > .private-removal-list.txt
```

Review the list for only `PRIVATE_REQUIRED`; then delete exactly those tracked paths:

```bash
while IFS= read -r path; do git rm -r --ignore-unmatch -- "$path"; done < .private-removal-list.txt
rm .private-removal-list.txt
```

Do not rewrite Git history.

- [ ] **Step 3: Replace root runtime dependencies with a public-only root**

`package.json` must contain no dependency on `@xauusd/mt5-broker`, `@xauusd/risk-engine`, strategy, signal, execution, AI/analysis/backtest, or private apps. Keep pnpm/Turbo/TypeScript tooling and public package scripts only.

Required root scripts:

```json
{
  "build": "turbo run build",
  "test": "turbo run test",
  "typecheck": "turbo run typecheck",
  "security:boundary": "node scripts/security/check-public-boundary.mjs"
}
```

- [ ] **Step 4: Add public-safe boundary documentation**

`docs/public/SECURITY-BOUNDARY.md` states only responsibilities: protocol, verification, installation proof, generic authorization, follower/distribution. It must not include trading thresholds, strategy names beyond generic Master/follower terminology, rule formulas, or historical secret values.

- [ ] **Step 5: Reinstall and prove GREEN**

```bash
pnpm install
pnpm install --frozen-lockfile
pnpm test
pnpm build
node scripts/security/check-public-boundary.mjs
```

Expected: PASS with zero private-required tracked file.

- [ ] **Step 6: Commit public sanitization**

```bash
git add -A
git commit -m "security: sanitize public distribution repository"
```

### Task 7: M5/M6 lock one-way public contracts and distribution artifacts

**Files in public repo:**
- Create: `scripts/security/check-distribution-artifact.mjs`
- Create: `scripts/security/check-distribution-artifact.test.mjs`
- Create: `.github/workflows/public-distribution-ci.yml`

**Files in private repo:**
- Create: `security/public-contract.lock.json`
- Create: `scripts/security/verify-public-contract-lock.mjs`
- Create: `scripts/security/verify-public-contract-lock.test.mjs`

**Interfaces:**
- Public commit is the canonical source for `packages/copy-protocol`, `packages/license-service`, and `packages/installation-proof`.
- Private lock stores exact `publicCommit` and package tree hashes.

- [ ] **Step 1: Write RED artifact test in public repo**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { inspectTextArtifact } from "./check-distribution-artifact.mjs";

test("distribution rejects private module references", () => {
  assert.throws(() => inspectTextArtifact('import "@xauusd/strategy-engine"'), /FORBIDDEN_PRIVATE_REFERENCE/);
});
```

- [ ] **Step 2: Implement public artifact inspection**

Scan built `dist/**`, package manifests, source maps if any, and generated bundles. Reject references to private package names/prefixes and PEM private-key markers; reject `.map` files that embed sources from private paths.

- [ ] **Step 3: Add public distribution CI**

Run:

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm build
node scripts/security/check-public-boundary.mjs
node scripts/security/check-distribution-artifact.mjs
```

Permissions stay `contents: read`; no private repository checkout and no secret other than standard ephemeral `GITHUB_TOKEN` is required.

- [ ] **Step 4: Pin public contracts from private repo**

Generate `security/public-contract.lock.json` from Git object hashes:

```json
{
  "version": 1,
  "publicRepository": "thiennguyen3004931-sudo/xauusd-ai-master",
  "publicCommit": "<generated by script>",
  "packageTrees": {
    "packages/copy-protocol": "<generated by script>",
    "packages/license-service": "<generated by script>",
    "packages/installation-proof": "<generated by script>"
  }
}
```

The generation script must run `git rev-parse <publicCommit>:<packagePath>` and write actual hashes; operators do not type the hash values manually.

- [ ] **Step 5: Verify private copies equal the pinned public trees**

`verify-public-contract-lock.mjs` runs `git fetch public <publicCommit>` and compares the three tree hashes against the local private package trees. Any drift fails with `PUBLIC_CONTRACT_DRIFT:<packagePath>`.

- [ ] **Step 6: Run GREEN and commit in each repository**

Public:

```bash
node --test scripts/security/check-distribution-artifact.test.mjs
node scripts/security/check-distribution-artifact.mjs
git add scripts/security .github/workflows/public-distribution-ci.yml
git commit -m "ci: enforce public distribution artifact boundary"
```

Private:

```bash
node --test scripts/security/verify-public-contract-lock.test.mjs
node scripts/security/verify-public-contract-lock.mjs security/public-contract.lock.json
git add security/public-contract.lock.json scripts/security
git commit -m "security: pin public protocol contract source"
```

### Task 8: M7 source-complete acceptance matrix

**Files:**
- Public: create `scripts/security/accept-public-private-split.mjs`
- Private: create `scripts/security/accept-master-core-split.mjs`

**Interfaces:**
- Produces machine-readable verdict lines only; no secret values.

- [ ] **Step 1: Public acceptance command**

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm build
node scripts/security/check-public-boundary.mjs
node scripts/security/check-distribution-artifact.mjs
node scripts/security/accept-public-private-split.mjs
```

Required output keys:

```text
PUBLIC_BUILD=PASS
PRIVATE_SOURCE_PRESENT=FALSE
PRIVATE_IMPORT_PRESENT=FALSE
PUBLIC_CI_NEEDS_PRIVATE_REPO=FALSE
DISTRIBUTION_ARTIFACT_PRIVATE_REF=FALSE
P3_CANONICAL=INSTALLATION_PROOF
P3_DUPLICATE_IMPLEMENTATION=FALSE
```

- [ ] **Step 2: Private acceptance command**

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm build
node scripts/security/verify-private-bootstrap.mjs security/private-bootstrap-attestation.json
node scripts/security/verify-public-contract-lock.mjs security/public-contract.lock.json
node scripts/security/check-private-secrets.mjs --tracked
node scripts/security/accept-master-core-split.mjs
```

Required output keys:

```text
PRIVATE_BUILD=PASS
MASTER_REGRESSION=PASS
PUBLIC_CONTRACT_LOCK=PASS
PRIVATE_SIGNING_KEY_TRACKED=FALSE
PRIVATE_DEPENDS_ON_PUBLIC_CONTRACTS=TRUE
PUBLIC_DEPENDS_ON_PRIVATE_SOURCE=FALSE
PRODUCTION_CUTOVER=NOT_PERFORMED
```

- [ ] **Step 3: Verify secret-history remediation gate**

Re-run the Task 2 Gitleaks history scan on the public repository and require all credible fingerprints to be present in `security/credential-remediation.json` with an accepted remediation status.

- [ ] **Step 4: Exact-head review**

Record both accepted heads and trees:

```bash
PUBLIC_HEAD=$(git -C ../xauusd-ai-master rev-parse HEAD)
PUBLIC_TREE=$(git -C ../xauusd-ai-master rev-parse HEAD^{tree})
PRIVATE_HEAD=$(git -C ../xauusd-ai-master-core rev-parse HEAD)
PRIVATE_TREE=$(git -C ../xauusd-ai-master-core rev-parse HEAD^{tree})
printf "PUBLIC_HEAD=%s\nPUBLIC_TREE=%s\nPRIVATE_HEAD=%s\nPRIVATE_TREE=%s\n" \
  "$PUBLIC_HEAD" "$PUBLIC_TREE" "$PRIVATE_HEAD" "$PRIVATE_TREE"
```

Source split is accepted only if both exact-head CI sets are green and the recorded heads have not moved.

### Task 9: M8 read-only production cutover preflight and stop boundary

**Files in private repo:**
- Create: `scripts/security/preflight-private-cutover.ps1`
- Create: `docs/superpowers/plans/2026-09-15-private-master-production-cutover.md`

**Interfaces:**
- Preflight is GET/read-only and prints evidence only.
- This plan must not change runtime source, scheduled tasks, bot mode, ARM state, processes, orders, or positions.

- [ ] **Step 1: Write the read-only preflight contract**

PowerShell script starts with:

```powershell
$ErrorActionPreference = 'Stop'
Write-Output 'READ_ONLY=TRUE'
Write-Output 'GIT_MUTATION=NONE'
Write-Output 'TASK_MUTATION=NONE'
Write-Output 'PROCESS_MUTATION=NONE'
Write-Output 'MODE_MUTATION=NONE'
Write-Output 'ARM_MUTATION=NONE'
Write-Output 'ORDER_MUTATION=NONE'
Write-Output 'POSITION_MUTATION=NONE'
Write-Output 'LIVE_TEST_ORDER=NONE'
```

It may read current private `HEAD`/tree, deployment manifest/source attestation, runtime health, bot mode, ARM state, positions, and pending orders. It must not invoke mutation endpoints or restart services.

- [ ] **Step 2: Require exact private source equality before readiness**

The preflight prints:

```text
ACCEPTED_PRIVATE_HEAD=<sha>
ACCEPTED_PRIVATE_TREE=<sha>
RUNTIME_SOURCE_HEAD=<sha-or-unproven>
RUNTIME_SOURCE_TREE=<sha-or-unproven>
SOURCE_EQUIVALENCE=PASS|FAIL|UNPROVEN
CUTOVER_READY=TRUE|FALSE
```

`CUTOVER_READY=TRUE` is allowed only when source equivalence is PASS and all M7 source acceptance evidence is green.

- [ ] **Step 3: Write the separate production cutover plan but do not execute it**

The cutover plan must contain exact accepted public/private heads captured in Task 8, rollback source, exact deployment/recovery files, and explicit operator approval gate. It must end before any mutation command and state:

```text
EXECUTION_REQUIRES_SEPARATE_OPERATOR_APPROVAL=TRUE
```

- [ ] **Step 4: Commit privately and stop**

```bash
git add scripts/security/preflight-private-cutover.ps1 docs/superpowers/plans/2026-09-15-private-master-production-cutover.md
git commit -m "docs(security): prepare private master cutover preflight"
```

Stop. Do not roll out production from this implementation plan.

---

## Final acceptance

The split is source-complete only when:

```text
PRIVATE_MASTER_CORE_EXISTS=TRUE
PRIVATE_MASTER_CORE_VISIBILITY=PRIVATE
PRIVATE_BUILD=PASS
MASTER_REGRESSION=PASS
PUBLIC_BUILD=PASS
PUBLIC_PRIVATE_REQUIRED_FILES=0
PUBLIC_PRIVATE_IMPORTS=0
PUBLIC_CI_PRIVATE_ACCESS=0
SECRET_HISTORY_SCAN=PASS
CREDIBLE_SECRET_FINDINGS_REMEDIATED=TRUE
P3_CANONICAL=INSTALLATION_PROOF
P3_DUPLICATE_IMPLEMENTATION=FALSE
PUBLIC_CONTRACT_LOCK=PASS
DISTRIBUTION_ARTIFACT_PRIVATE_REF=FALSE
PRODUCTION_CUTOVER=NOT_PERFORMED
```

Implementation sequence is strictly:

```text
M0 boundary freeze
-> M1 secret/history audit
-> canonicalize P3
-> M2 private bootstrap
-> M3 private CI/equivalence
-> M4 sanitize public head
-> M5/M6 one-way contract + artifact security
-> M7 source acceptance
-> M8 read-only cutover preflight
-> STOP for separate rollout approval
```
