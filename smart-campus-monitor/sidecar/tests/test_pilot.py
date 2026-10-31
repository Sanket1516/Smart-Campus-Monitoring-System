import base64
import json

from app.config import load_settings
from app.zk_client import TerminalPool, write_user
from scripts import pilot
from tests.fake_zk import FakeDevice, FakeZK

TMP = base64.b64encode(b"pilot-template" * 30).decode()


def setup(monkeypatch, tmp_path):
    monkeypatch.setenv("SIDECAR_SECRET", "s" * 32)
    monkeypatch.setenv("SIDECAR_TERMINAL_CIDRS", "10.10.0.0/16")
    monkeypatch.setenv("SIDECAR_BACKUP_DIR", str(tmp_path / "b"))
    devices = {"10.10.0.1": FakeDevice("SN-A"), "10.10.0.2": FakeDevice("SN-B")}
    pool = TerminalPool(load_settings(), lambda ip, _s: FakeZK(devices[ip]))
    with pool.session("10.10.0.1") as conn:
        write_user(conn, user_id="1001", name="Asha", privilege=0, templates=[{"fid": 0, "template": TMP}])
    return devices, pool


def read_log(path):
    return [json.loads(line) for line in path.read_text().splitlines()]


def test_copy_verify_delete_restore_and_robustness(monkeypatch, tmp_path):
    devices, pool = setup(monkeypatch, tmp_path)
    log = tmp_path / "pilot.jsonl"
    pilot.main(["--log", str(log), "backup", "--ip", "10.10.0.1"], pool=pool)
    pilot.main(["--log", str(log), "copy-verify", "--src", "10.10.0.1", "--dst", "10.10.0.2", "--user", "1001"], pool=pool)
    pilot.main(["--log", str(log), "delete-confirm", "--ip", "10.10.0.2", "--user", "1001"], pool=pool)
    backup_file = read_log(log)[0]["file"]
    pilot.main(["--log", str(log), "restore", "--backup", backup_file, "--ip", "10.10.0.2", "--user", "1001"], pool=pool)
    pilot.main(["--log", str(log), "robustness", "--ip", "10.10.0.1", "--cycles", "5", "--clients", "2"], pool=pool)

    entries = read_log(log)
    steps = [e["step"] for e in entries]
    copy = next(e for e in entries if e["step"] == "copy_verify")
    assert copy["sha_match"] is True and copy["terminal_sn"] == "SN-B" and copy["src_sn"] == "SN-A"
    assert copy["device_time"].startswith("2026-11-02") and "server_utc" in copy and "template_size" in copy
    delete = next(e for e in entries if e["step"] == "delete_confirm")
    assert delete["present_after"] is False and delete["templates_left"] == 0
    assert next(e for e in entries if e["step"] == "restore")["sha_match"] is True
    summary = next(e for e in entries if e["step"] == "robustness_summary")
    assert summary == {**summary, "attempts": 10, "failures": 0}
    assert TMP not in log.read_text()
    assert "clear_data" not in devices["10.10.0.1"].calls + devices["10.10.0.2"].calls
    assert steps.count("robustness") == 10
