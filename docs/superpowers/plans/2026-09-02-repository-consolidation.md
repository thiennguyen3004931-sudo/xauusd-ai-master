# Repository Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce XAUUSD AI MASTER to one canonical production truth (`main`) by safely archiving the current Git ref state, closing stale PR scopes, removing stale remote branches, and fixing runtime-artifact Git hygiene without mutating LIVE trading runtime.

**Architecture:** Treat repository cleanup as a governance operation with a hard archive gate before destructive ref deletion. The local Windows host creates and verifies a full Git bundle and branch/SHA manifest; GitHub PRs are then closed, stale branches are deleted, and a small source-only cleanup PR carries the manifest/spec/plan plus the canonical `.gitignore` rule. Workflow deletion is explicitly deferred to a separate audit plan.

**Tech Stack:** Git, GitHub, PowerShell, GitHub Actions metadata, Markdown.

**Spec:** `docs/superpowers/specs/2026-09-02-repository-consolidation-design.md`

## Global Constraints

- Canonical repository: `thiennguyen3004931-sudo/xauusd-ai-master`.
- Canonical production branch at cleanup start: `main`.
- Canonical production SHA at cleanup start: `69ed572fc0232fae228534d5cf7f73e0b2b282db`.
- Do not rewrite `main` history.
- Create and verify an external full Git bundle before any remote branch deletion.
- Record pre-cleanup branch name -> SHA inventory before deletion.
- Close stale/superseded pre-cleanup PRs; do not merge them.
- Do not delete GitHub Actions workflows in this plan.
- Canonical `.gitignore` must ignore `/scripts/.phase7c-sideway-runtime-*.mjs`.
- `ORDER_MUTATION=NONE`.
- `LIVE_TEST_ORDER=NONE`.
- `MODE_CHANGE=NONE`.
- `ARM_CHANGE=NONE`.
- `BRIDGE_RESTART=NONE`.
- `EXECUTOR_RESTART=NONE`.
- `WEB_API_RESTART=NONE`.
- `RUNTIME_DEPLOYMENT=NONE`.

---

### Task 1: Create and verify the pre-cleanup Git archive

**Files:**
- Create externally: `F:\Project\XAUUSD_AI_MASTER\archive\xauusd-ai-master-pre-cleanup-20260902.bundle`
- Create locally for later commit: `docs/repository-cleanup/pre-cleanup-branches-20260902.tsv`

**Interfaces:**
- Consumes: local clone `F:\Project\XAUUSD_AI_MASTER\xauusd-ai-master` and remote `origin`.
- Produces: a verified full-ref Git bundle and deterministic branch/SHA manifest used as the deletion gate.

- [ ] **Step 1: Verify local canonical checkout and fetch all refs**

Run in PowerShell:

```powershell
cd F:\Project\XAUUSD_AI_MASTER\xauusd-ai-master
$expected = '69ed572fc0232fae228534d5cf7f73e0b2b282db'
git switch main
git fetch origin --prune --tags
$actual = (git rev-parse HEAD).Trim()
if ($actual -ne $expected) { throw "STOP: expected main=$expected actual=$actual" }
```

Expected: `HEAD` remains exactly `69ed572fc0232fae228534d5cf7f73e0b2b282db` before cleanup-source commits are merged.

- [ ] **Step 2: Create archive directory and full Git bundle**

```powershell
$archiveDir = 'F:\Project\XAUUSD_AI_MASTER\archive'
New-Item -ItemType Directory -Force -Path $archiveDir | Out-Null
$bundle = Join-Path $archiveDir 'xauusd-ai-master-pre-cleanup-20260902.bundle'
git bundle create $bundle --all
if ($LASTEXITCODE -ne 0) { throw 'STOP: git bundle create failed' }
```

Expected: bundle file exists outside the repository.

- [ ] **Step 3: Verify bundle integrity**

```powershell
git bundle verify $bundle
if ($LASTEXITCODE -ne 0) { throw 'STOP: git bundle verify failed' }
```

Expected: Git reports the bundle is okay and lists contained refs/prerequisites.

- [ ] **Step 4: Generate branch/SHA manifest from remote heads**

```powershell
$manifestDir = 'docs\repository-cleanup'
New-Item -ItemType Directory -Force -Path $manifestDir | Out-Null
$manifest = Join-Path $manifestDir 'pre-cleanup-branches-20260902.tsv'
@('branch`tsha') | Set-Content -LiteralPath $manifest -Encoding utf8
git ls-remote --heads origin |
  ForEach-Object {
    $parts = $_ -split '\s+'
    $sha = $parts[0]
    $branch = $parts[1] -replace '^refs/heads/',''
    "$branch`t$sha"
  } |
  Sort-Object |
  Add-Content -LiteralPath $manifest -Encoding utf8
```

Expected: one header plus one row per current remote branch.

- [ ] **Step 5: Verify archive and manifest gates before any deletion**

```powershell
$bundleOk = Test-Path -LiteralPath $bundle -PathType Leaf
$manifestRows = @(Get-Content -LiteralPath $manifest | Select-Object -Skip 1)
$mainRow = $manifestRows | Where-Object { $_ -eq "main`t$expected" }
if (-not $bundleOk) { throw 'STOP: archive bundle missing' }
if ($manifestRows.Count -lt 200) { throw "STOP: branch manifest unexpectedly small: $($manifestRows.Count)" }
if (-not $mainRow) { throw 'STOP: canonical main SHA missing from manifest' }
Write-Host "ARCHIVE_GATE=PASS"
Write-Host "MANIFEST_BRANCH_COUNT=$($manifestRows.Count)"
```

Expected: `ARCHIVE_GATE=PASS`; no remote deletion is permitted before this marker.

---

### Task 2: Close all stale pre-cleanup pull requests

**Files:**
- No production files modified.

**Interfaces:**
- Consumes: verified archive gate from Task 1 and the nine open PRs identified in the approved design.
- Produces: zero stale pre-cleanup PRs presented as active scopes.

- [ ] **Step 1: Re-read the open PR set and require exact expected IDs**

Expected pre-cleanup PR numbers:

```text
1,2,3,94,98,121,178,217,225
```

Abort if a new unknown open PR exists; classify it before continuing.

- [ ] **Step 2: Add the standard consolidation note to each stale PR**

Use this exact note:

```text
Repository consolidation: this PR is a historical/superseded scope and is no longer an active production source. Canonical production work continues from current main. The PR is being closed without merge; commit/PR history remains available for audit and recovery.
```

- [ ] **Step 3: Close PRs #1, #2, #3, #94, #98, #121, #178, #217, and #225 without merge**

Expected: each PR becomes `state=closed`, `merged=false`.

- [ ] **Step 4: Verify no pre-cleanup PR remains open**

Expected: search result contains no open PR whose `created_at` predates this cleanup and whose scope has not been explicitly re-approved.

---

### Task 3: Make runtime artifact ignore behavior canonical

**Files:**
- Modify: `.gitignore`
- Test: Git ignore behavior through `git check-ignore`.

**Interfaces:**
- Consumes: current Sideway wrapper behavior that creates `scripts/.phase7c-sideway-runtime-<PID>.mjs`.
- Produces: repository-level ignore coverage so runtime-generated Sideway files cannot dirty guarded deployment worktrees.

- [ ] **Step 1: Write the failing ignore check against the pre-change tree**

Run:

```powershell
git check-ignore -q scripts/.phase7c-sideway-runtime-12345.mjs
if ($LASTEXITCODE -eq 0) { throw 'RED NOT PROVEN: pattern already ignored' }
Write-Host 'RUNTIME_ARTIFACT_IGNORE_RED=PASS'
```

Expected on the original `main@69ed572f...`: the file is not ignored, proving the current gap.

- [ ] **Step 2: Add the exact canonical ignore rule**

Add this line under the Phase7B/Phase7C runtime-artifact block in `.gitignore`:

```gitignore
/scripts/.phase7c-sideway-runtime-*.mjs
```

Do not remove the existing `/scripts/.phase7c-sideway-live-runtime-*.mjs` rule.

- [ ] **Step 3: Verify the new rule is GREEN**

```powershell
git check-ignore -v scripts/.phase7c-sideway-runtime-12345.mjs
if ($LASTEXITCODE -ne 0) { throw 'STOP: runtime artifact still not ignored' }
Write-Host 'RUNTIME_ARTIFACT_IGNORE_GREEN=PASS'
```

Expected: output points to the newly added `.gitignore` line.

- [ ] **Step 4: Verify tracked source remains otherwise unchanged**

```powershell
git diff -- .gitignore docs/superpowers docs/repository-cleanup
```

Expected: only approved cleanup documentation, manifest, and `.gitignore` changes.

---

### Task 4: Commit the audit trail before branch deletion

**Files:**
- Include: `docs/superpowers/specs/2026-09-02-repository-consolidation-design.md`
- Include: `docs/superpowers/plans/2026-09-02-repository-consolidation.md`
- Include: `docs/repository-cleanup/pre-cleanup-branches-20260902.tsv`
- Include: `.gitignore`

**Interfaces:**
- Consumes: verified bundle, branch manifest, and `.gitignore` GREEN check.
- Produces: one cleanup-source branch that contains the permanent audit trail before stale refs disappear.

- [ ] **Step 1: Verify no trading/runtime files are in the diff**

```powershell
$allowed = @(
  '.gitignore',
  'docs/superpowers/specs/2026-09-02-repository-consolidation-design.md',
  'docs/superpowers/plans/2026-09-02-repository-consolidation.md',
  'docs/repository-cleanup/pre-cleanup-branches-20260902.tsv'
)
$changed = @(git status --porcelain | ForEach-Object { $_.Substring(3) })
$unexpected = @($changed | Where-Object { $_ -notin $allowed })
if ($unexpected.Count -ne 0) { throw "STOP: unexpected cleanup diff: $($unexpected -join ', ')" }
```

Expected: no unexpected paths.

- [ ] **Step 2: Commit cleanup audit trail on the active consolidation branch**

```powershell
git add .gitignore docs/superpowers/specs/2026-09-02-repository-consolidation-design.md docs/superpowers/plans/2026-09-02-repository-consolidation.md docs/repository-cleanup/pre-cleanup-branches-20260902.tsv
git commit -m "chore: consolidate repository governance artifacts"
```

Expected: one source-only commit; no runtime deployment.

- [ ] **Step 3: Push the consolidation branch**

```powershell
git push -u origin HEAD
```

Expected: remote consolidation branch points to the exact local commit.

---

### Task 5: Delete stale remote branches using the manifest as the deletion source

**Files:**
- Read: `docs/repository-cleanup/pre-cleanup-branches-20260902.tsv`
- External backup must already be verified: `F:\Project\XAUUSD_AI_MASTER\archive\xauusd-ai-master-pre-cleanup-20260902.bundle`

**Interfaces:**
- Consumes: archive gate, closed stale PRs, and committed manifest.
- Produces: remote namespace reduced to `main` plus the one active consolidation branch until its PR is merged.

- [ ] **Step 1: Build deletion candidates from the manifest, never from ad-hoc branch-name guesses**

```powershell
$manifest = 'docs\repository-cleanup\pre-cleanup-branches-20260902.tsv'
$activeCleanup = (git branch --show-current).Trim()
$rows = Import-Csv -LiteralPath $manifest -Delimiter "`t"
$keep = @('main', $activeCleanup)
$delete = @($rows.branch | Where-Object { $_ -notin $keep })
if ($delete.Count -lt 200) { throw "STOP: deletion candidate count unexpectedly small: $($delete.Count)" }
Write-Host "DELETE_CANDIDATE_COUNT=$($delete.Count)"
```

Expected: all pre-cleanup branches except `main` and the currently active cleanup branch are candidates, including historical `red`, `impl`, review, feature, fix, test, codex, phase, sprint, temporary, and obsolete cleanup-attempt branches.

- [ ] **Step 2: Dry-run print the exact deletion list**

```powershell
$delete | Sort-Object | ForEach-Object { Write-Host "DELETE_REMOTE_BRANCH=$_" }
```

Expected: `main` is absent; the active cleanup branch is absent.

- [ ] **Step 3: Delete each stale remote branch and fail on any unexpected Git error**

```powershell
foreach ($branch in $delete) {
  git push origin --delete $branch
  if ($LASTEXITCODE -ne 0) { throw "STOP: failed deleting remote branch $branch" }
}
```

Expected: each requested stale remote ref is removed; commit history remains in the external bundle and GitHub PR/commit history where referenced.

- [ ] **Step 4: Verify remote branch namespace after deletion**

```powershell
git fetch origin --prune
$remaining = @(git ls-remote --heads origin | ForEach-Object { ($_ -split '\s+')[1] -replace '^refs/heads/','' })
$unexpected = @($remaining | Where-Object { $_ -notin @('main', $activeCleanup) })
if ($unexpected.Count -ne 0) { throw "STOP: unexpected remote branches remain: $($unexpected -join ', ')" }
Write-Host "REMOTE_BRANCH_CLEANUP=PASS"
```

Expected: only `main` and the active consolidation branch remain.

---

### Task 6: Open, verify, and merge the consolidation PR

**Files:**
- `.gitignore`
- cleanup design/plan/manifest docs only.

**Interfaces:**
- Consumes: cleaned branch namespace and source-only consolidation branch.
- Produces: permanent audit trail and runtime-artifact ignore rule on `main`.

- [ ] **Step 1: Open a PR from the active cleanup branch to `main`**

PR title:

```text
chore: consolidate XAUUSD repository governance
```

PR body must state:

```text
Source-only repository hygiene. Adds the approved consolidation design/plan, pre-cleanup branch/SHA manifest, and the canonical ignore rule for Sideway runtime artifacts. All stale pre-cleanup PRs were closed and stale remote branches were deleted only after a verified external Git bundle was created. No trading/runtime mutation is part of this PR.
```

- [ ] **Step 2: Require the PR head to be mergeable and CI to be GREEN**

Expected: no failed required workflows caused by the cleanup diff. Do not waive existing regression failures.

- [ ] **Step 3: Squash merge the cleanup PR**

Expected: `main` advances by one source-only cleanup commit; previously deployed runtime remains unchanged because `RUNTIME_DEPLOYMENT=NONE`.

- [ ] **Step 4: Delete the now-merged active consolidation branch**

Run locally after switching to `main`:

```powershell
git switch main
git pull --ff-only
$cleanupBranch = '<the branch used by this execution>'
git push origin --delete $cleanupBranch
git branch -D $cleanupBranch
```

Replace `<the branch used by this execution>` with the exact branch printed by `git branch --show-current` before the PR was opened; do not infer it later.

Expected: remote branch namespace now contains only `main`.

---

### Task 7: Final verification and handoff to the separate workflow-audit plan

**Files:**
- Read-only verification of repository metadata and cleanup artifacts.

**Interfaces:**
- Consumes: merged consolidation PR and deleted cleanup branch.
- Produces: canonical clean repository state ready for the second workflow-only audit.

- [ ] **Step 1: Verify only `main` remains remotely**

```powershell
$remaining = @(git ls-remote --heads origin | ForEach-Object { ($_ -split '\s+')[1] -replace '^refs/heads/','' })
if ($remaining.Count -ne 1 -or $remaining[0] -ne 'main') { throw "STOP: final remote branch set is not main-only: $($remaining -join ', ')" }
Write-Host 'REMOTE_BRANCH_FINAL=MAIN_ONLY'
```

- [ ] **Step 2: Verify stale PR count is zero**

Expected: no pre-cleanup PR remains open.

- [ ] **Step 3: Verify the external archive still validates after cleanup**

```powershell
git bundle verify 'F:\Project\XAUUSD_AI_MASTER\archive\xauusd-ai-master-pre-cleanup-20260902.bundle'
if ($LASTEXITCODE -ne 0) { throw 'STOP: post-cleanup archive verification failed' }
Write-Host 'POST_CLEANUP_ARCHIVE_VERIFY=PASS'
```

- [ ] **Step 4: Verify repository-level runtime artifact ignore rule**

```powershell
git check-ignore -q scripts/.phase7c-sideway-runtime-99999.mjs
if ($LASTEXITCODE -ne 0) { throw 'STOP: canonical runtime artifact ignore rule missing' }
Write-Host 'RUNTIME_ARTIFACT_IGNORE_FINAL=PASS'
```

- [ ] **Step 5: Record final safety state**

Expected checkpoint:

```text
CANONICAL_REPO=thiennguyen3004931-sudo/xauusd-ai-master
CANONICAL_BRANCH=main
REMOTE_BRANCH_FINAL=MAIN_ONLY
STALE_PRE_CLEANUP_PRS=0
ARCHIVE_BUNDLE=VERIFIED
BRANCH_MANIFEST=PRESERVED_ON_MAIN
WORKFLOW_AUDIT=DEFERRED_TO_SEPARATE_PLAN
ORDER_MUTATION=NONE
LIVE_TEST_ORDER=NONE
MODE_CHANGE=NONE
ARM_CHANGE=NONE
BRIDGE_RESTART=NONE
EXECUTOR_RESTART=NONE
WEB_API_RESTART=NONE
RUNTIME_DEPLOYMENT=NONE
```

The next plan audits `.github/workflows` by contract coverage and removes only redundant/obsolete workflows after retained regressions are proven GREEN.
