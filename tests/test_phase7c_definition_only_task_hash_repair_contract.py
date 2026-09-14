from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "repair-phase7c-scheduled-task-runner-hash-local.ps1"


def _source() -> str:
    assert SCRIPT.exists(), f"missing definition-only repair script: {SCRIPT}"
    return SCRIPT.read_text(encoding="utf-8")


def test_repair_is_definition_only_and_uses_canonical_ownership_contract():
    source = _source()

    assert "phase7c-scheduled-task-ownership.ps1" in source
    assert "Get-Phase7CScheduledTaskOwnershipVerdict" in source
    assert "OWNED_HASH_DRIFT_REPAIR_REQUIRED" in source
    assert "RUNNER_HASH_DRIFT" in source
    assert source.count("Set-ScheduledTask") == 1

    forbidden = (
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
    )
    for token in forbidden:
        assert token not in source, f"definition-only repair must not contain {token}"


def test_repair_is_fail_closed_to_runner_hash_drift_only():
    source = _source()

    assert "if (-not $pre.Owned)" in source
    assert "if (-not $pre.RepairRequired)" in source
    assert '$pre.Reason -ne "OWNED_HASH_DRIFT_REPAIR_REQUIRED"' in source
    assert "$preReasons.Count -ne 1" in source
    assert '$preReasons[0] -ne "RUNNER_HASH_DRIFT"' in source
    assert "Get-FileHash" in source
    assert "-Algorithm SHA256" in source
    assert "RUNNER_ACTUAL_SHA_MISMATCH" in source


def test_repair_rechecks_canonical_acceptance_after_definition_change():
    source = _source()

    assert source.count("Get-Phase7CScheduledTaskOwnershipVerdict") >= 2
    assert "if (-not $post.Owned)" in source
    assert "if (-not $post.Canonical)" in source
    assert "if ($post.RepairRequired)" in source
    assert "OWNERSHIP_OWNED=True" in source
    assert "OWNERSHIP_CANONICAL=True" in source
    assert "OWNERSHIP_REPAIRREQUIRED=False" in source
    assert "OWNERSHIP_RUNNERSHA256=" in source
    assert "TASK_DRIFT=NONE" in source
    assert "MUTATION=TASK_DEFINITION_ONLY" in source
    assert "REPAIR_SCOPE=RUNNER_HASH_ONLY" in source
