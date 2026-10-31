"""
Safe wrapper around pyzk (ZK TCP, port 4370).

Rules enforced here:
  * the device is disabled before every read/write and re-enabled in `finally`;
  * the connection is always closed in `finally`;
  * requests to the same terminal are serialised (one session per terminal);
  * a global cap limits simultaneous sessions (the X990's limit is UNVERIFIED);
  * clear_data / ClearData is never callable through this wrapper.
"""
from __future__ import annotations

import base64
import hashlib
import logging
import threading
from contextlib import contextmanager
from typing import Callable, Iterator

from .config import Settings

log = logging.getLogger("sidecar.zk")


class TerminalBusy(RuntimeError):
    pass


class TerminalError(RuntimeError):
    pass


class ForbiddenOperation(RuntimeError):
    pass


def default_zk_factory(ip: str, settings: Settings):
    from zk import ZK  # imported lazily so tests do not need a device

    return ZK(
        ip,
        port=settings.zk_port,
        timeout=settings.zk_timeout,
        password=settings.comm_key_for(ip),
        force_udp=settings.force_udp,
        ommit_ping=True,
    )


class _GuardedConnection:
    """Proxy that blocks destructive bulk operations on the pyzk connection."""

    _FORBIDDEN = {"clear_data", "clear_attendance", "poweroff", "restart"}

    def __init__(self, conn):
        self._conn = conn

    def __getattr__(self, name):
        if name in self._FORBIDDEN:
            raise ForbiddenOperation(f"{name} is forbidden by policy")
        return getattr(self._conn, name)


class TerminalPool:
    def __init__(self, settings: Settings, zk_factory: Callable = default_zk_factory):
        self.settings = settings
        self.zk_factory = zk_factory
        self._locks: dict[str, threading.Lock] = {}
        self._locks_guard = threading.Lock()
        self._sessions = threading.BoundedSemaphore(settings.max_sessions)

    def _lock_for(self, ip: str) -> threading.Lock:
        with self._locks_guard:
            return self._locks.setdefault(ip, threading.Lock())

    @contextmanager
    def session(self, ip: str, disable: bool = True) -> Iterator[_GuardedConnection]:
        if not self.settings.terminal_allowed(ip):
            raise ForbiddenOperation(f"{ip} is not in SIDECAR_TERMINAL_CIDRS")
        lock = self._lock_for(ip)
        if not lock.acquire(timeout=self.settings.lock_wait_seconds):
            raise TerminalBusy(f"terminal {ip} is busy")
        try:
            if not self._sessions.acquire(timeout=self.settings.lock_wait_seconds):
                raise TerminalBusy("too many simultaneous terminal sessions")
            try:
                zk = self.zk_factory(ip, self.settings)
                conn = None
                try:
                    try:
                        conn = zk.connect()
                    except Exception as exc:  # pyzk raises ZKNetworkError / ZKErrorResponse
                        raise TerminalError(f"connect to {ip} failed: {exc}") from exc
                    if disable:
                        conn.disable_device()
                    try:
                        yield _GuardedConnection(conn)
                    finally:
                        if disable:
                            try:
                                conn.enable_device()
                            except Exception as exc:  # pragma: no cover - logged only
                                log.warning("enable_device failed on %s: %s", ip, exc)
                finally:
                    if conn is not None:
                        try:
                            conn.disconnect()
                        except Exception as exc:  # pragma: no cover
                            log.warning("disconnect failed on %s: %s", ip, exc)
            finally:
                self._sessions.release()
        finally:
            lock.release()


# ── helpers ──────────────────────────────────────────────────────────────

def b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def user_to_dict(user) -> dict:
    return {
        "uid": int(user.uid),
        "user_id": str(user.user_id),
        "name": user.name,
        "privilege": int(user.privilege),
        "has_password": bool(getattr(user, "password", "")),
        "has_card": bool(getattr(user, "card", 0)),
    }


def finger_to_dict(finger, user_id: str) -> dict:
    return {
        "uid": int(finger.uid),
        "user_id": str(user_id),
        "fid": int(finger.fid),
        "valid": int(finger.valid),
        "size": int(finger.size),
        "template": b64(finger.template),
        "sha256": sha256_hex(finger.template),
    }


def resolve_uid(users: list, user_id: str) -> int:
    """Existing uid for user_id, else int(user_id) when free (<=65535), else the smallest free uid."""
    for user in users:
        if str(user.user_id) == str(user_id):
            return int(user.uid)
    used = {int(u.uid) for u in users}
    try:
        preferred = int(user_id)
    except ValueError:
        preferred = 0
    if 0 < preferred <= 65535 and preferred not in used:
        return preferred
    uid = 1
    while uid in used:
        uid += 1
    if uid > 65535:
        raise TerminalError("no free uid on terminal")
    return uid


def write_user(conn, *, user_id: str, name: str, privilege: int, templates: list, users_cache: list | None = None, refresh: bool = True) -> dict:
    """set_user first (user record), then save_user_template, then refresh_data."""
    from zk.finger import Finger
    from zk.user import User

    users = users_cache if users_cache is not None else conn.get_users()
    uid = resolve_uid(users, user_id)
    conn.set_user(uid=uid, name=name[:24], privilege=int(privilege), password="", group_id="", user_id=str(user_id), card=0)
    if users_cache is not None and not any(str(u.user_id) == str(user_id) for u in users_cache):
        users_cache.append(User(uid, name[:24], int(privilege), "", "", str(user_id), 0))
    written = 0
    if templates:
        user = User(uid, name[:24], int(privilege), "", "", str(user_id), 0)
        fingers = []
        for tpl in templates:
            fid = int(tpl["fid"])
            if not 0 <= fid <= 9:
                raise TerminalError(f"invalid finger index {fid}")
            data = base64.b64decode(tpl["template"], validate=True)
            fingers.append(Finger(uid=uid, fid=fid, valid=int(tpl.get("valid", 1)), template=data))
        conn.save_user_template(user, fingers)
        written = len(fingers)
    if refresh:
        conn.refresh_data()
    return {"uid": uid, "user_id": str(user_id), "templates_written": written, "refreshed": refresh}
