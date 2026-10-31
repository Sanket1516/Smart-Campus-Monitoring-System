"""
First load of users and templates onto a (new) terminal over ZK TCP, with throttling
and resumability. Source is a sidecar backup file or a live source terminal.

    python -m scripts.bulk_load --target 10.10.0.22 --source-backup backups/backup-SN1-....json.enc \
        --state state-10.10.0.22.json --batch 20 --delay 0.5 --verify

Progress is written to --state after every batch; re-running skips users already done.
Order per user: set_user (record) first, then save_user_template; refresh_data per batch.
Never calls clear_data. The Node backend uses POST /terminals/{ip}/users/batch for the same job.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time

from app.backup import read_backup
from app.config import load_settings
from app.zk_client import TerminalPool, finger_to_dict, sha256_hex, user_to_dict, write_user


def load_source(pool: TerminalPool, *, backup: str | None, source_ip: str | None) -> dict:
    if backup:
        return read_backup(backup, pool.settings.backup_key)
    with pool.session(source_ip) as conn:
        users = conn.get_users()
        by_uid = {int(u.uid): str(u.user_id) for u in users}
        return {
            "meta": {"ip": source_ip, "serial": conn.get_serialnumber()},
            "users": [user_to_dict(u) for u in users],
            "templates": [finger_to_dict(f, by_uid.get(int(f.uid), str(f.uid))) for f in conn.get_templates()],
        }


def read_state(path: str | None) -> dict:
    if path and os.path.exists(path):
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    return {"done": [], "failed": {}}


def write_state(path: str | None, state: dict) -> None:
    if not path:
        return
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8") as handle:
        json.dump(state, handle)
    os.replace(tmp, path)


def plan_users(source: dict, only: set[str] | None) -> list[dict]:
    templates_by_user: dict[str, list] = {}
    for tpl in source.get("templates", []):
        if int(tpl.get("valid", 1)) == 0:
            continue
        templates_by_user.setdefault(str(tpl["user_id"]), []).append(
            {"fid": int(tpl["fid"]), "valid": int(tpl.get("valid", 1)), "template": tpl["template"], "sha256": tpl.get("sha256")}
        )
    plan = []
    for user in source.get("users", []):
        uid = str(user["user_id"])
        if only and uid not in only:
            continue
        plan.append({"user_id": uid, "name": user.get("name", ""), "privilege": int(user.get("privilege", 0)), "templates": templates_by_user.get(uid, [])})
    return plan


def verify_target(pool: TerminalPool, ip: str, plan: list[dict]) -> dict:
    expected = {(u["user_id"], t["fid"]): t.get("sha256") for u in plan for t in u["templates"]}
    with pool.session(ip) as conn:
        users = conn.get_users()
        by_uid = {int(u.uid): str(u.user_id) for u in users}
        actual = {(by_uid.get(int(f.uid), str(f.uid)), int(f.fid)): sha256_hex(f.template) for f in conn.get_templates()}
        present = {str(u.user_id) for u in users}
    missing_users = sorted({u["user_id"] for u in plan} - present, key=int)
    mismatched = sorted([f"{k[0]}:{k[1]}" for k, v in expected.items() if v and actual.get(k) != v])
    missing_templates = sorted([f"{k[0]}:{k[1]}" for k in expected if k not in actual])
    return {
        "users_expected": len(plan),
        "users_missing": missing_users,
        "templates_expected": len(expected),
        "templates_missing": missing_templates,
        "templates_hash_mismatch": mismatched,
    }


def run(pool: TerminalPool, *, target: str, plan: list[dict], state_path: str | None, batch: int, delay: float, dry_run: bool, log=print) -> dict:
    state = read_state(state_path)
    done = set(state.get("done", []))
    todo = [u for u in plan if u["user_id"] not in done]
    log(f"target={target} planned={len(plan)} already_done={len(done)} todo={len(todo)} dry_run={dry_run}")
    for start in range(0, len(todo), batch):
        chunk = todo[start : start + batch]
        if dry_run:
            log(f"would write users {[u['user_id'] for u in chunk]}")
            continue
        try:
            with pool.session(target) as conn:
                cache = conn.get_users()
                for user in chunk:
                    started = time.monotonic()
                    result = write_user(
                        conn,
                        user_id=user["user_id"],
                        name=user["name"],
                        privilege=user["privilege"],
                        templates=user["templates"],
                        users_cache=cache,
                        refresh=False,
                    )
                    done.add(user["user_id"])
                    state.get("failed", {}).pop(user["user_id"], None)
                    log(
                        f"wrote user_id={user['user_id']} uid={result['uid']} fingers={result['templates_written']} "
                        f"latency_ms={int((time.monotonic() - started) * 1000)}"
                    )
                conn.refresh_data()
        except Exception as exc:  # stop; the state file lets the next run resume
            for user in chunk:
                if user["user_id"] not in done:
                    state.setdefault("failed", {})[user["user_id"]] = str(exc)
            state["done"] = sorted(done, key=int)
            write_state(state_path, state)
            log(f"batch failed, stopping (resume later): {exc}")
            return {"completed": False, "done": len(done), "error": str(exc)}
        state["done"] = sorted(done, key=int)
        write_state(state_path, state)
        if delay:
            time.sleep(delay)
    return {"completed": True, "done": len(done)}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--target", required=True)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--source-backup")
    source.add_argument("--source-ip")
    parser.add_argument("--users", help="comma-separated user_ids to load (default: all)")
    parser.add_argument("--state", help="progress file for resumability")
    parser.add_argument("--batch", type=int, default=20)
    parser.add_argument("--delay", type=float, default=0.5, help="seconds between batches")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--verify", action="store_true", help="read back and compare SHA-256 after loading")
    args = parser.parse_args(argv)

    pool = TerminalPool(load_settings())
    data = load_source(pool, backup=args.source_backup, source_ip=args.source_ip)
    only = set(args.users.split(",")) if args.users else None
    plan = plan_users(data, only)
    result = run(pool, target=args.target, plan=plan, state_path=args.state, batch=args.batch, delay=args.delay, dry_run=args.dry_run)
    if args.verify and not args.dry_run:
        result["verify"] = verify_target(pool, args.target, plan)
    print(json.dumps(result, indent=2))
    return 0 if result.get("completed") else 2


if __name__ == "__main__":
    sys.exit(main())
