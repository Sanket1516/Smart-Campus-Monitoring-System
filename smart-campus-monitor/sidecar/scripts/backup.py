"""
Baseline backup of a terminal: get_users() + get_templates() to JSON (encrypted when
SIDECAR_BACKUP_KEY is set). Read-only on the terminal.

    python -m scripts.backup --ip 10.10.0.21
"""
from __future__ import annotations

import argparse
import json
import sys
import time

from app.backup import write_backup
from app.config import load_settings
from app.zk_client import TerminalPool, finger_to_dict, user_to_dict


def take_backup(pool: TerminalPool, ip: str) -> dict:
    with pool.session(ip) as conn:
        serial = conn.get_serialnumber()
        users = conn.get_users()
        by_uid = {int(u.uid): str(u.user_id) for u in users}
        payload = {
            "meta": {
                "ip": ip,
                "serial": serial,
                "firmware": conn.get_firmware_version(),
                "algorithm": conn.get_fp_version(),
                "taken_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            },
            "users": [user_to_dict(u) for u in users],
            "templates": [finger_to_dict(f, by_uid.get(int(f.uid), str(f.uid))) for f in conn.get_templates()],
        }
    path = write_backup(pool.settings.backup_dir, str(serial), payload, pool.settings.backup_key)
    return {"file": path, "serial": serial, "users": len(payload["users"]), "templates": len(payload["templates"])}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--ip", required=True)
    args = parser.parse_args(argv)
    result = take_backup(TerminalPool(load_settings()), args.ip)
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
