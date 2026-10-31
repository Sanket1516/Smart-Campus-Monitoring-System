"""Sidecar configuration from the environment. Fails fast on missing secrets."""
from __future__ import annotations

import ipaddress
import json
import os
from dataclasses import dataclass, field


class ConfigError(RuntimeError):
    pass


def _int(name: str, default: int) -> int:
    raw = os.environ.get(name, "")
    return int(raw) if raw.strip() else default


def _bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name, "")
    if not raw.strip():
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass
class Settings:
    secret: str
    host: str = "127.0.0.1"
    port: int = 8770
    zk_port: int = 4370
    zk_timeout: int = 15
    force_udp: bool = False
    # Comm key (ZK "password"). Default for all terminals plus per-IP overrides. Never logged.
    comm_key: int = 0
    comm_keys: dict = field(default_factory=dict)
    terminal_networks: list = field(default_factory=list)
    max_sessions: int = 2
    lock_wait_seconds: int = 120
    enroll_enabled: bool = False
    backup_dir: str = "./backups"
    backup_key: bytes | None = None

    def comm_key_for(self, ip: str) -> int:
        return int(self.comm_keys.get(ip, self.comm_key))

    def terminal_allowed(self, ip: str) -> bool:
        try:
            addr = ipaddress.ip_address(ip)
        except ValueError:
            return False
        return any(addr in net for net in self.terminal_networks)


def load_settings() -> Settings:
    secret = os.environ.get("SIDECAR_SECRET", "")
    if len(secret) < 24:
        raise ConfigError("SIDECAR_SECRET is required (min 24 characters)")

    networks_raw = os.environ.get("SIDECAR_TERMINAL_CIDRS", "")
    if not networks_raw.strip():
        raise ConfigError("SIDECAR_TERMINAL_CIDRS is required (terminal VLAN ranges, comma separated)")
    try:
        networks = [ipaddress.ip_network(part.strip(), strict=False) for part in networks_raw.split(",") if part.strip()]
    except ValueError as exc:
        raise ConfigError(f"SIDECAR_TERMINAL_CIDRS is invalid: {exc}") from exc

    comm_keys_raw = os.environ.get("ZK_COMM_KEYS", "")
    try:
        comm_keys = json.loads(comm_keys_raw) if comm_keys_raw.strip() else {}
    except json.JSONDecodeError as exc:
        raise ConfigError("ZK_COMM_KEYS must be JSON like {\"10.0.0.5\": 1234}") from exc

    backup_key = None
    backup_key_raw = os.environ.get("SIDECAR_BACKUP_KEY", "")
    if backup_key_raw.strip():
        try:
            backup_key = bytes.fromhex(backup_key_raw.strip())
        except ValueError as exc:
            raise ConfigError("SIDECAR_BACKUP_KEY must be 64 hex characters") from exc
        if len(backup_key) != 32:
            raise ConfigError("SIDECAR_BACKUP_KEY must be 64 hex characters (32 bytes)")

    return Settings(
        secret=secret,
        host=os.environ.get("SIDECAR_HOST", "127.0.0.1"),
        port=_int("SIDECAR_PORT", 8770),
        zk_port=_int("ZK_PORT", 4370),
        zk_timeout=_int("ZK_TIMEOUT", 15),
        force_udp=_bool("ZK_FORCE_UDP", False),
        comm_key=_int("ZK_COMM_KEY", 0),
        comm_keys=comm_keys,
        terminal_networks=networks,
        max_sessions=max(1, _int("SIDECAR_MAX_SESSIONS", 2)),
        lock_wait_seconds=_int("SIDECAR_LOCK_WAIT", 120),
        enroll_enabled=_bool("SIDECAR_ENROLL_ENABLED", False),
        backup_dir=os.environ.get("SIDECAR_BACKUP_DIR", "./backups"),
        backup_key=backup_key,
    )
