import base64
import json
import os
import pathlib
import re

import pytest
from fastapi.testclient import TestClient

from app.config import ConfigError, load_settings
from app.main import create_app
from app.zk_client import ForbiddenOperation, TerminalPool, resolve_uid
from scripts import bulk_load
from tests.fake_zk import FakeDevice, FakeZK

SECRET = "s" * 32
IP = "10.10.0.21"
TMP = base64.b64encode(b"\x01\x02template-bytes\x00\xff" * 20).decode()


@pytest.fixture(autouse=True)
def env(monkeypatch, tmp_path):
    monkeypatch.setenv("SIDECAR_SECRET", SECRET)
    monkeypatch.setenv("SIDECAR_TERMINAL_CIDRS", "10.10.0.0/16")
    monkeypatch.setenv("SIDECAR_BACKUP_DIR", str(tmp_path / "backups"))
    monkeypatch.setenv("SIDECAR_BACKUP_KEY", "ab" * 32)
    monkeypatch.setenv("SIDECAR_ENROLL_ENABLED", "false")


@pytest.fixture
def devices():
    return {IP: FakeDevice("SN-A"), "10.10.0.22": FakeDevice("SN-B")}


@pytest.fixture
def client(devices):
    settings = load_settings()
    app = create_app(settings, zk_factory=lambda ip, _s: FakeZK(devices[ip]))
    return TestClient(app)


H = {"X-Sidecar-Secret": SECRET}


def test_requires_secret_and_config(client, monkeypatch):
    assert client.get(f"/terminals/{IP}/users").status_code == 401
    assert client.get(f"/terminals/{IP}/users", headers={"X-Sidecar-Secret": "wrong"}).status_code == 401
    monkeypatch.setenv("SIDECAR_SECRET", "short")
    with pytest.raises(ConfigError):
        load_settings()
    monkeypatch.setenv("SIDECAR_SECRET", SECRET)
    monkeypatch.delenv("SIDECAR_TERMINAL_CIDRS")
    with pytest.raises(ConfigError):
        load_settings()


def test_refuses_terminals_outside_allowed_ranges(client):
    response = client.get("/terminals/192.168.1.1/users", headers=H)
    assert response.status_code == 403


def test_write_user_then_template_then_refresh_with_disable_enable(client, devices):
    body = {"user_id": "1001", "name": "Asha", "templates": [{"fid": 0, "valid": 1, "template": TMP}]}
    response = client.post(f"/terminals/{IP}/users", headers=H, json=body)
    assert response.status_code == 200, response.text
    assert response.json() == {"uid": 1001, "user_id": "1001", "templates_written": 1, "refreshed": True}
    calls = devices[IP].calls
    assert calls[0:2] == ["connect", "disable_device"]
    assert calls.index("set_user") < calls.index("save_user_template") < calls.index("refresh_data")
    assert calls[-2:] == ["enable_device", "disconnect"]
    assert "clear_data" not in calls


def test_device_is_re_enabled_and_disconnected_on_failure(client, devices):
    devices[IP].fail_on = "save_user_template"
    body = {"user_id": "5", "templates": [{"fid": 1, "template": TMP}]}
    response = client.post(f"/terminals/{IP}/users", headers=H, json=body)
    assert response.status_code == 502
    assert devices[IP].calls[-2:] == ["enable_device", "disconnect"]


def test_unreachable_terminal_returns_502(client, devices):
    devices[IP].offline = True
    assert client.get(f"/terminals/{IP}/users", headers=H).status_code == 502


def test_read_templates_round_trip_sha(client):
    client.post(f"/terminals/{IP}/users", headers=H, json={"user_id": "7", "templates": [{"fid": 3, "template": TMP}]})
    templates = client.get(f"/terminals/{IP}/templates?user_id=7", headers=H).json()["templates"]
    assert len(templates) == 1
    assert templates[0]["template"] == TMP and templates[0]["fid"] == 3
    assert templates[0]["size"] == len(base64.b64decode(TMP))
    assert client.get(f"/terminals/{IP}/templates?user_id=999", headers=H).json() == {"templates": []}


def test_delete_user_is_idempotent_and_never_clears(client, devices):
    client.post(f"/terminals/{IP}/users", headers=H, json={"user_id": "9"})
    assert client.delete(f"/terminals/{IP}/users/9", headers=H).json() == {"deleted": True, "refreshed": True}
    assert client.delete(f"/terminals/{IP}/users/9", headers=H).json() == {"deleted": False, "refreshed": False}
    assert "clear_data" not in devices[IP].calls


def test_batch_refreshes_once(client, devices):
    users = [{"user_id": str(i), "name": f"U{i}", "templates": [{"fid": 0, "template": TMP}]} for i in range(1, 6)]
    response = client.post(f"/terminals/{IP}/users/batch", headers=H, json={"users": users})
    assert response.status_code == 200
    assert devices[IP].calls.count("refresh_data") == 1
    assert len(devices[IP].users) == 5


def test_enroll_disabled_by_default(client):
    assert client.post(f"/terminals/{IP}/enroll", headers=H, json={"user_id": "1", "fid": 0}).status_code == 403


def test_info_and_encrypted_backup(client, tmp_path):
    client.post(f"/terminals/{IP}/users", headers=H, json={"user_id": "1", "templates": [{"fid": 0, "template": TMP}]})
    info = client.get(f"/terminals/{IP}/info", headers=H).json()
    assert info["serial"] == "SN-A" and info["algorithm"] == "10"
    result = client.post(f"/terminals/{IP}/backup", headers=H).json()
    assert result["encrypted"] is True and result["users"] == 1 and result["templates"] == 1
    raw = pathlib.Path(result["file"]).read_bytes()
    assert TMP.encode() not in raw
    assert oct(os.stat(result["file"]).st_mode & 0o777) == "0o600"


def test_validation_rejects_bad_input(client):
    assert client.post(f"/terminals/{IP}/users", headers=H, json={"user_id": "12a"}).status_code == 422
    bad = {"user_id": "1", "templates": [{"fid": 10, "template": TMP}]}
    assert client.post(f"/terminals/{IP}/users", headers=H, json=bad).status_code == 422


def test_guard_blocks_clear_data():
    settings = load_settings()
    device = FakeDevice()
    pool = TerminalPool(settings, lambda ip, _s: FakeZK(device))
    with pytest.raises(ForbiddenOperation):
        with pool.session(IP) as conn:
            conn.clear_data()
    assert "clear_data" not in device.calls
    assert device.calls[-2:] == ["enable_device", "disconnect"]


def test_no_clear_data_call_in_source():
    root = pathlib.Path(__file__).resolve().parents[1]
    offenders = []
    for path in list(root.glob("app/*.py")) + list(root.glob("scripts/*.py")):
        for line in path.read_text().splitlines():
            if re.search(r"\.clear_data\(", line):
                offenders.append(f"{path.name}: {line.strip()}")
    assert offenders == []


def test_resolve_uid():
    from zk.user import User

    users = [User(1, "a", 0, "", "", "1", 0), User(5, "b", 0, "", "", "77", 0)]
    assert resolve_uid(users, "77") == 5
    assert resolve_uid(users, "3") == 3
    assert resolve_uid(users, "1") == 1
    assert resolve_uid(users, "5") == 2  # uid 5 is taken by user 77
    assert resolve_uid(users, "999999") == 2


def test_bulk_load_resumes_and_verifies(devices, tmp_path):
    settings = load_settings()
    source = devices[IP]
    pool = TerminalPool(settings, lambda ip, _s: FakeZK(devices[ip]))
    with pool.session(IP) as conn:
        from app.zk_client import write_user

        for i in range(1, 8):
            write_user(conn, user_id=str(i), name=f"U{i}", privilege=0, templates=[{"fid": 0, "template": TMP}])
    data = bulk_load.load_source(pool, backup=None, source_ip=IP)
    plan = bulk_load.plan_users(data, None)
    state = tmp_path / "state.json"

    target = devices["10.10.0.22"]
    target.fail_on = "save_user_template"
    first = bulk_load.run(pool, target="10.10.0.22", plan=plan, state_path=str(state), batch=3, delay=0, dry_run=False, log=lambda *_: None)
    assert first["completed"] is False
    assert json.loads(state.read_text())["failed"]

    target.fail_on = None
    second = bulk_load.run(pool, target="10.10.0.22", plan=plan, state_path=str(state), batch=3, delay=0, dry_run=False, log=lambda *_: None)
    assert second == {"completed": True, "done": 7}
    report = bulk_load.verify_target(pool, "10.10.0.22", plan)
    assert report["users_missing"] == [] and report["templates_missing"] == [] and report["templates_hash_mismatch"] == []
    assert "clear_data" not in target.calls and "clear_data" not in source.calls
