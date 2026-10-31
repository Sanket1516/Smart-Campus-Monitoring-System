"""
Pilot harness for the ZK TCP (pyzk) steps of the 2-terminal pilot. Every action is
appended to a JSONL log (--log) with: server UTC time, device time, terminal SN/IP/
firmware/algorithm, action, user id, finger index, template size, SHA-256, result,
verify outcome (entered by the operator) and latency. Template bytes are never logged.

    python -m scripts.pilot info            --ip A
    python -m scripts.pilot backup          --ip A
    python -m scripts.pilot read-templates  --ip A [--user 1001]
    python -m scripts.pilot copy-verify     --src A --dst B --user 1001 [--ask]
    python -m scripts.pilot delete-confirm  --ip B --user 1001
    python -m scripts.pilot restore         --backup backups/backup-....json.enc --ip B --user 1001
    python -m scripts.pilot robustness      --ip A --cycles 100 --clients 2

None of these call clear_data. copy-verify and restore WRITE to the destination terminal;
run them only on pilot terminals after a baseline backup.
"""
from __future__ import annotations

import argparse
import json
import sys
import threading
import time
from datetime import datetime, timezone

from app.backup import read_backup
from app.config import load_settings
from app.zk_client import TerminalPool, finger_to_dict, sha256_hex, write_user
from scripts.backup import take_backup

LOG_PATH = "pilot-sidecar.jsonl"
_log_lock = threading.Lock()


def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def log(entry: dict) -> dict:
    entry = {"server_utc": now_utc(), **entry}
    entry.pop("template", None)
    with _log_lock, open(LOG_PATH, "a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry, default=str) + "\n")
    print(json.dumps(entry, default=str))
    return entry


def terminal_meta(conn, ip: str) -> dict:
    try:
        device_time = conn.get_time().isoformat()
    except Exception as exc:  # noqa: BLE001
        device_time = f"error: {exc}"
    return {
        "terminal_ip": ip,
        "terminal_sn": conn.get_serialnumber(),
        "firmware": conn.get_firmware_version(),
        "algorithm": conn.get_fp_version(),
        "device_time": device_time,
    }


def find_uid(conn, user_id: str):
    for user in conn.get_users():
        if str(user.user_id) == str(user_id):
            return user
    return None


def read_user_templates(conn, user_id: str) -> list[dict]:
    user = find_uid(conn, user_id)
    if not user:
        return []
    out = []
    for fid in range(10):
        finger = conn.get_user_template(uid=int(user.uid), temp_id=fid, user_id=str(user_id))
        if finger is not None and getattr(finger, "template", None):
            out.append(finger_to_dict(finger, user_id))
    return out


def cmd_info(pool, a):
    started = time.monotonic()
    with pool.session(a.ip) as conn:
        meta = terminal_meta(conn, a.ip)
        meta["platform"] = conn.get_platform()
        meta["device_name"] = conn.get_device_name()
    log({"step": "info", **meta, "result_code": "ok", "latency_ms": int((time.monotonic() - started) * 1000)})


def cmd_backup(pool, a):
    started = time.monotonic()
    result = take_backup(pool, a.ip)
    log({"step": "baseline_backup", "terminal_ip": a.ip, "terminal_sn": result["serial"], "file": result["file"],
         "users": result["users"], "templates": result["templates"], "result_code": "ok",
         "latency_ms": int((time.monotonic() - started) * 1000)})


def cmd_read(pool, a):
    started = time.monotonic()
    with pool.session(a.ip) as conn:
        meta = terminal_meta(conn, a.ip)
        if a.user:
            templates = read_user_templates(conn, a.user)
        else:
            users = conn.get_users()
            by_uid = {int(u.uid): str(u.user_id) for u in users}
            templates = [finger_to_dict(f, by_uid.get(int(f.uid), str(f.uid))) for f in conn.get_templates()]
    latency = int((time.monotonic() - started) * 1000)
    for tpl in templates:
        log({"step": "read_template", **meta, "user_id": tpl["user_id"], "finger_index": tpl["fid"], "flag": tpl["valid"],
             "template_size": tpl["size"], "sha256": tpl["sha256"], "result_code": "ok", "latency_ms": latency})
    if not templates:
        log({"step": "read_template", **meta, "user_id": a.user, "result_code": "none_found", "latency_ms": latency})


def ask(question: str) -> str:
    try:
        return input(f"{question} [y/n/skip]: ").strip().lower() or "skip"
    except EOFError:
        return "skip"


def cmd_copy_verify(pool, a):
    started = time.monotonic()
    with pool.session(a.src) as conn:
        src_meta = terminal_meta(conn, a.src)
        user = find_uid(conn, a.user)
        templates = read_user_templates(conn, a.user)
    if not user or not templates:
        log({"step": "copy_verify", **src_meta, "user_id": a.user, "result_code": "source_has_no_template"})
        return
    with pool.session(a.dst) as conn:
        dst_meta = terminal_meta(conn, a.dst)
        write_started = time.monotonic()
        write_user(conn, user_id=a.user, name=user.name, privilege=int(user.privilege),
                   templates=[{"fid": t["fid"], "valid": t["valid"], "template": t["template"]} for t in templates])
        write_ms = int((time.monotonic() - write_started) * 1000)
        back = {t["fid"]: t for t in read_user_templates(conn, a.user)}
    for tpl in templates:
        copied = back.get(tpl["fid"])
        outcome = ask(f"Place finger {tpl['fid']} of user {a.user} on {a.dst}. Verified OK?") if a.ask else "not_asked"
        log({"step": "copy_verify", "src_sn": src_meta["terminal_sn"], "src_firmware": src_meta["firmware"],
             "src_algorithm": src_meta["algorithm"], **dst_meta, "user_id": a.user, "finger_index": tpl["fid"],
             "template_size": tpl["size"], "sha256": tpl["sha256"],
             "dst_template_size": copied["size"] if copied else None, "dst_sha256": copied["sha256"] if copied else None,
             "sha_match": bool(copied and copied["sha256"] == tpl["sha256"]), "result_code": "ok" if copied else "missing_after_write",
             "verify_outcome": outcome, "write_latency_ms": write_ms, "latency_ms": int((time.monotonic() - started) * 1000)})


def cmd_delete_confirm(pool, a):
    started = time.monotonic()
    with pool.session(a.ip) as conn:
        meta = terminal_meta(conn, a.ip)
        user = find_uid(conn, a.user)
        if user:
            conn.delete_user(uid=int(user.uid), user_id=str(a.user))
            conn.refresh_data()
        still_there = find_uid(conn, a.user) is not None
        leftover = [f for f in conn.get_templates() if user and int(f.uid) == int(user.uid)]
    log({"step": "delete_confirm", **meta, "user_id": a.user, "existed": bool(user), "present_after": still_there,
         "templates_left": len(leftover), "result_code": "ok" if not still_there and not leftover else "still_present",
         "latency_ms": int((time.monotonic() - started) * 1000)})


def cmd_restore(pool, a):
    data = read_backup(a.backup, pool.settings.backup_key)
    user = next((u for u in data["users"] if str(u["user_id"]) == str(a.user)), None)
    templates = [t for t in data["templates"] if str(t["user_id"]) == str(a.user)]
    if not user:
        log({"step": "restore", "terminal_ip": a.ip, "user_id": a.user, "result_code": "not_in_backup"})
        return
    started = time.monotonic()
    with pool.session(a.ip) as conn:
        meta = terminal_meta(conn, a.ip)
        write_user(conn, user_id=a.user, name=user.get("name", ""), privilege=int(user.get("privilege", 0)),
                   templates=[{"fid": t["fid"], "valid": t["valid"], "template": t["template"]} for t in templates])
        back = {t["fid"]: t for t in read_user_templates(conn, a.user)}
    for tpl in templates:
        copied = back.get(int(tpl["fid"]))
        log({"step": "restore", **meta, "user_id": a.user, "finger_index": tpl["fid"], "template_size": tpl["size"],
             "sha256": tpl["sha256"], "dst_sha256": copied["sha256"] if copied else None,
             "sha_match": bool(copied and copied["sha256"] == tpl["sha256"]),
             "verify_outcome": ask(f"Verify user {a.user} finger {tpl['fid']} on {a.ip}") if a.ask else "not_asked",
             "result_code": "ok" if copied else "missing_after_write", "latency_ms": int((time.monotonic() - started) * 1000)})


def cmd_robustness(pool, a):
    results = []

    def worker(client_no: int):
        for cycle in range(a.cycles):
            started = time.monotonic()
            code = "ok"
            try:
                # Separate pools per client so the per-terminal lock does not serialise them:
                # this is the test of the device's simultaneous-session behaviour.
                with pools[client_no].session(a.ip, disable=False) as conn:
                    conn.get_serialnumber()
            except Exception as exc:  # noqa: BLE001
                code = f"error: {exc}"
            entry = {"step": "robustness", "terminal_ip": a.ip, "client": client_no, "cycle": cycle + 1,
                     "result_code": code, "latency_ms": int((time.monotonic() - started) * 1000)}
            results.append(entry)
            log(entry)
            if a.pause:
                time.sleep(a.pause)

    pools = [TerminalPool(pool.settings, pool.zk_factory) for _ in range(a.clients)]
    threads = [threading.Thread(target=worker, args=(n,)) for n in range(a.clients)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    failures = [r for r in results if r["result_code"] != "ok"]
    log({"step": "robustness_summary", "terminal_ip": a.ip, "clients": a.clients, "cycles": a.cycles,
         "attempts": len(results), "failures": len(failures)})


def build_parser():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--log", default=LOG_PATH)
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("info"); s.add_argument("--ip", required=True)
    s = sub.add_parser("backup"); s.add_argument("--ip", required=True)
    s = sub.add_parser("read-templates"); s.add_argument("--ip", required=True); s.add_argument("--user")
    s = sub.add_parser("copy-verify"); s.add_argument("--src", required=True); s.add_argument("--dst", required=True)
    s.add_argument("--user", required=True); s.add_argument("--ask", action="store_true")
    s = sub.add_parser("delete-confirm"); s.add_argument("--ip", required=True); s.add_argument("--user", required=True)
    s = sub.add_parser("restore"); s.add_argument("--backup", required=True); s.add_argument("--ip", required=True)
    s.add_argument("--user", required=True); s.add_argument("--ask", action="store_true")
    s = sub.add_parser("robustness"); s.add_argument("--ip", required=True); s.add_argument("--cycles", type=int, default=100)
    s.add_argument("--clients", type=int, default=2); s.add_argument("--pause", type=float, default=0.0)
    return p


COMMANDS = {
    "info": cmd_info, "backup": cmd_backup, "read-templates": cmd_read, "copy-verify": cmd_copy_verify,
    "delete-confirm": cmd_delete_confirm, "restore": cmd_restore, "robustness": cmd_robustness,
}


def main(argv=None, pool: TerminalPool | None = None) -> int:
    global LOG_PATH
    args = build_parser().parse_args(argv)
    LOG_PATH = args.log
    pool = pool or TerminalPool(load_settings())
    COMMANDS[args.cmd](pool, args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
