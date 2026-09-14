from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "preflight-phase7c-task-definition-repair-readonly-local.ps1"


def _source() -> str:
    assert SCRIPT.exists(), f"missing read-only task repair preflight: {SCRIPT}"
    return SCRIPT.read_text(encoding="utf-8")


def test_preflight_is_bound_to_canonical_phase7c_task_identity() -> None:
    source = _source()
    assert "$TaskName = 'XAUUSD-Phase7C-Executors'" in source
    assert "$TaskPath = '\\'" in source
    assert "Get-Phase7CExecutorTaskRunnerPath -ProjectRoot $projectRoot" in source
    assert "[string]$TaskName" not in source
    assert "[string]$RunnerPath" not in source


def test_preflight_is_strictly_read_only() -> None:
    source = _source()
    assert "READ_ONLY=True" in source
    assert "MUTATION=NONE" in source

    forbidden = (
        "Set-ScheduledTask",
        "Start-ScheduledTask",
        "Stop-ScheduledTask",
        "Register-ScheduledTask",
        "Unregister-ScheduledTask",
        "Enable-ScheduledTask",
        "Disable-ScheduledTask",
        "Start-Process",
        "Stop-Process",
        "Start-Service",
        "Stop-Service",
        "Restart-Service",
        "schtasks.exe",
        "Invoke-RestMethod",
        "Invoke-WebRequest",
        "Set-Content",
        "Add-Content",
        "Remove-Item",
        "Move-Item",
        "Copy-Item",
        "Set-ItemProperty",
        "New-Item",
        "git fetch",
        "git pull",
        "git checkout",
        "git switch",
        "git reset",
        "git merge",
        "git rebase",
    )
    lowered = source.lower()
    for token in forbidden:
        assert token.lower() not in lowered, f"read-only preflight must not contain {token}"


def test_preflight_requires_exact_accepted_source_state() -> None:
    source = _source()
    required = (
        "ExpectedMainCommit",
        "branch --show-current",
        "rev-parse HEAD",
        "status --porcelain --untracked-files=normal",
        "remote get-url origin",
        "ls-remote --heads origin refs/heads/main",
        "LOCAL_BRANCH_NOT_MAIN",
        "LOCAL_HEAD_NOT_EXPECTED_MAIN",
        "REMOTE_MAIN_NOT_EXPECTED",
        "LOCAL_WORKTREE_NOT_CLEAN",
        "ORIGIN_REMOTE_NOT_CANONICAL",
    )
    for token in required:
        assert token in source


def test_preflight_uses_canonical_ownership_and_runner_trust_contracts() -> None:
    source = _source()
    required = (
        "phase7c-scheduled-task-ownership.ps1",
        "Get-Phase7CTrustedGitFileSha256",
        "Test-Phase7CExecutorTaskActionOwnership",
        "Get-Phase7CExecutorTaskDrift",
        "Get-FileHash",
        "-Algorithm SHA256",
        "RUNNER_TRUSTED_SHA_MISMATCH",
        "RUNNER_ACTUAL_SHA_MISMATCH",
    )
    for token in required:
        assert token in source


def test_preflight_allows_only_exact_runner_hash_drift_with_fresh_evidence() -> None:
    source = _source()
    required = (
        "ExpectedEmbeddedRunnerSha256",
        "OWNED_HASH_DRIFT_REPAIR_REQUIRED",
        "TASK_NOT_PHASE7C_OWNED",
        "TASK_ALREADY_CANONICAL",
        "REPAIR_SCOPE_REJECTED",
        "PRE_REPAIR_TASK_DRIFT",
        "PRE_REPAIR_PRINCIPAL_NOT_CANONICAL_SYSTEM",
        "PRE_REPAIR_EMBEDDED_SHA_MISMATCH",
        "ONLY_CONFIRMED_DRIFT=RUNNER_HASH",
    )
    for token in required:
        assert token in source


def test_preflight_emits_explicit_repair_gate_evidence() -> None:
    source = _source()
    required = (
        "EXPECTED_MAIN=",
        "LOCAL_BRANCH=",
        "LOCAL_HEAD=",
        "REMOTE_MAIN=",
        "LOCAL_DIRTY_COUNT=",
        "ORIGIN_CANONICAL=True",
        "RUNNER_ACTUAL_SHA=",
        "RUNNER_TRUSTED_SHA=",
        "TASK_EMBEDDED_SHA=",
        "OWNERSHIP_OWNED=True",
        "OWNERSHIP_CANONICAL=False",
        "OWNERSHIP_REPAIRREQUIRED=True",
        "OWNERSHIP_REASON=OWNED_HASH_DRIFT_REPAIR_REQUIRED",
        "TASK_DRIFT=NONE",
        "PRINCIPAL_CANONICAL_SYSTEM=True",
        "TASK_DEFINITION_REPAIR_ALLOWED=True",
        "MUTATION=NONE",
    )
    for token in required:
        assert token in source


def main() -> None:
    tests = (
        test_preflight_is_bound_to_canonical_phase7c_task_identity,
        test_preflight_is_strictly_read_only,
        test_preflight_requires_exact_accepted_source_state,
        test_preflight_uses_canonical_ownership_and_runner_trust_contracts,
        test_preflight_allows_only_exact_runner_hash_drift_with_fresh_evidence,
        test_preflight_emits_explicit_repair_gate_evidence,
    )
    for test in tests:
        test()
    print(f"PASS: {len(tests)} task-definition repair read-only preflight contract checks")


if __name__ == "__main__":
    main()
