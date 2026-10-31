"""
Run the sidecar against in-memory fake terminals (no hardware). Development only.

    SIDECAR_SECRET=... SIDECAR_TERMINAL_CIDRS=10.0.0.0/8 python -m scripts.dev_fake_server
"""
from __future__ import annotations

import uvicorn

from app.config import load_settings
from app.main import create_app
from tests.fake_zk import FakeDevice, FakeZK

DEVICES: dict[str, FakeDevice] = {}


def factory(ip, _settings):
    if ip not in DEVICES:
        DEVICES[ip] = FakeDevice(serial=f"FAKE-{ip.replace('.', '-')}")
    return FakeZK(DEVICES[ip])


if __name__ == "__main__":
    settings = load_settings()
    print("WARNING: fake terminals — development only")
    uvicorn.run(create_app(settings, zk_factory=factory), host="127.0.0.1", port=settings.port)
