"""Backup dumps (get_users + get_templates) for restore tests. Optionally AES-256-GCM encrypted."""
from __future__ import annotations

import json
import os
import time

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def write_backup(directory: str, serial: str, payload: dict, key: bytes | None) -> str:
    os.makedirs(directory, mode=0o700, exist_ok=True)
    stamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    safe_serial = "".join(ch for ch in serial if ch.isalnum() or ch in "-_") or "unknown"
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    if key:
        nonce = os.urandom(12)
        data = b"SCBK1" + nonce + AESGCM(key).encrypt(nonce, raw, safe_serial.encode())
        name = f"backup-{safe_serial}-{stamp}.json.enc"
    else:
        data = raw
        name = f"backup-{safe_serial}-{stamp}.json"
    path = os.path.join(directory, name)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as handle:
        handle.write(data)
    return path


def read_backup(path: str, key: bytes | None) -> dict:
    with open(path, "rb") as handle:
        data = handle.read()
    if data.startswith(b"SCBK1"):
        if not key:
            raise ValueError("backup is encrypted; SIDECAR_BACKUP_KEY is required")
        nonce, ciphertext = data[5:17], data[17:]
        serial = os.path.basename(path).split("-")[1]
        data = AESGCM(key).decrypt(nonce, ciphertext, serial.encode())
    return json.loads(data.decode("utf-8"))
