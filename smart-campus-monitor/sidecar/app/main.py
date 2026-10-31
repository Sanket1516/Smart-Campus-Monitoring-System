"""
Internal pyzk sidecar (FastAPI). The ONLY component that opens ZK TCP port 4370 on terminals.

Run on a private interface only (SIDECAR_HOST=127.0.0.1 or the server's VLAN address),
with SIDECAR_SECRET shared with the Node backend. pyzk is GPL-2.0: this service is used
internally and is not redistributed.
"""
from __future__ import annotations

import hmac
import logging
import time

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

from .backup import write_backup
from .config import Settings, load_settings
from .zk_client import (
    ForbiddenOperation,
    TerminalBusy,
    TerminalError,
    TerminalPool,
    default_zk_factory,
    finger_to_dict,
    user_to_dict,
    write_user,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("sidecar")

USER_ID_PATTERN = r"^\d{1,9}$"


class TemplateIn(BaseModel):
    fid: int = Field(ge=0, le=9)
    valid: int = Field(default=1)
    template: str = Field(min_length=4, max_length=20000)

    @field_validator("valid")
    @classmethod
    def valid_flag(cls, value: int) -> int:
        if value not in (0, 1, 3):
            raise ValueError("valid must be 0, 1 or 3")
        return value


class UserIn(BaseModel):
    user_id: str = Field(pattern=USER_ID_PATTERN)
    name: str = Field(default="", max_length=64)
    privilege: int = Field(default=0, ge=0, le=14)
    templates: list[TemplateIn] = Field(default_factory=list, max_length=10)


class BatchIn(BaseModel):
    users: list[UserIn] = Field(max_length=200)


class EnrollIn(BaseModel):
    user_id: str = Field(pattern=USER_ID_PATTERN)
    fid: int = Field(default=0, ge=0, le=9)


def create_app(settings: Settings | None = None, zk_factory=default_zk_factory) -> FastAPI:
    settings = settings or load_settings()
    pool = TerminalPool(settings, zk_factory)
    app = FastAPI(title="pyzk sidecar (internal)", docs_url=None, redoc_url=None, openapi_url=None)

    def require_secret(x_sidecar_secret: str = Header(default="")) -> None:
        if not hmac.compare_digest(x_sidecar_secret.encode(), settings.secret.encode()):
            raise HTTPException(status_code=401, detail="unauthorized")

    @app.exception_handler(TerminalBusy)
    async def busy_handler(_request: Request, exc: TerminalBusy):
        return JSONResponse(status_code=409, content={"detail": str(exc)})

    @app.exception_handler(TerminalError)
    async def terminal_handler(_request: Request, exc: TerminalError):
        return JSONResponse(status_code=502, content={"detail": str(exc)})

    @app.exception_handler(ForbiddenOperation)
    async def forbidden_handler(_request: Request, exc: ForbiddenOperation):
        return JSONResponse(status_code=403, content={"detail": str(exc)})

    def run(ip: str, fn, *, disable: bool = True, action: str = ""):
        started = time.monotonic()

        def work():
            with pool.session(ip, disable=disable) as conn:
                try:
                    return fn(conn)
                except (ForbiddenOperation, TerminalError):
                    raise
                except Exception as exc:  # pyzk errors
                    raise TerminalError(f"{action or 'operation'} on {ip} failed: {exc}") from exc

        async def runner():
            try:
                return await run_in_threadpool(work)
            finally:
                # Log metadata only — never template content.
                log.info("ip=%s action=%s latency_ms=%d", ip, action, int((time.monotonic() - started) * 1000))

        return runner()

    @app.get("/health")
    async def health():
        return {"ok": True}

    @app.get("/terminals/{ip}/info", dependencies=[Depends(require_secret)])
    async def info(ip: str):
        def fn(conn):
            conn.read_sizes()
            return {
                "serial": conn.get_serialnumber(),
                "firmware": conn.get_firmware_version(),
                "platform": conn.get_platform(),
                "device_name": conn.get_device_name(),
                "algorithm": conn.get_fp_version(),
                "users": getattr(conn, "users", None),
                "fingers": getattr(conn, "fingers", None),
            }

        return await run(ip, fn, action="info")

    @app.get("/terminals/{ip}/users", dependencies=[Depends(require_secret)])
    async def get_users(ip: str):
        return await run(ip, lambda conn: {"users": [user_to_dict(u) for u in conn.get_users()]}, action="get_users")

    @app.get("/terminals/{ip}/templates", dependencies=[Depends(require_secret)])
    async def get_templates(ip: str, user_id: str | None = None):
        def fn(conn):
            users = conn.get_users()
            by_uid = {int(u.uid): str(u.user_id) for u in users}
            if user_id:
                match = [u for u in users if str(u.user_id) == str(user_id)]
                if not match:
                    return {"templates": []}
                uid = int(match[0].uid)
                out = []
                for fid in range(10):
                    finger = conn.get_user_template(uid=uid, temp_id=fid, user_id=str(user_id))
                    if finger is not None and getattr(finger, "template", None):
                        out.append(finger_to_dict(finger, user_id))
                return {"templates": out}
            return {"templates": [finger_to_dict(f, by_uid.get(int(f.uid), str(f.uid))) for f in conn.get_templates()]}

        return await run(ip, fn, action="get_templates")

    @app.post("/terminals/{ip}/users", dependencies=[Depends(require_secret)])
    async def upsert_user(ip: str, body: UserIn):
        def fn(conn):
            return write_user(
                conn,
                user_id=body.user_id,
                name=body.name,
                privilege=body.privilege,
                templates=[t.model_dump() for t in body.templates],
            )

        return await run(ip, fn, action="set_user")

    @app.post("/terminals/{ip}/users/batch", dependencies=[Depends(require_secret)])
    async def upsert_users(ip: str, body: BatchIn):
        def fn(conn):
            cache = conn.get_users()
            results = []
            for user in body.users:
                results.append(
                    write_user(
                        conn,
                        user_id=user.user_id,
                        name=user.name,
                        privilege=user.privilege,
                        templates=[t.model_dump() for t in user.templates],
                        users_cache=cache,
                        refresh=False,
                    )
                )
            conn.refresh_data()
            return {"results": results}

        return await run(ip, fn, action="set_users_batch")

    @app.delete("/terminals/{ip}/users/{user_id}", dependencies=[Depends(require_secret)])
    async def delete_user(ip: str, user_id: str):
        if not user_id.isdigit() or len(user_id) > 9:
            raise HTTPException(status_code=422, detail="invalid user_id")

        def fn(conn):
            match = [u for u in conn.get_users() if str(u.user_id) == user_id]
            if not match:
                return {"deleted": False, "refreshed": False}
            conn.delete_user(uid=int(match[0].uid), user_id=user_id)  # never clear_data
            conn.refresh_data()
            return {"deleted": True, "refreshed": True}

        return await run(ip, fn, action="delete_user")

    @app.post("/terminals/{ip}/enroll", dependencies=[Depends(require_secret)])
    async def enroll(ip: str, body: EnrollIn):
        if not settings.enroll_enabled:
            raise HTTPException(status_code=403, detail="remote enrolment is disabled (SIDECAR_ENROLL_ENABLED)")

        def fn(conn):
            match = [u for u in conn.get_users() if str(u.user_id) == body.user_id]
            if not match:
                raise TerminalError("user record must exist before enrolment")
            # UNVERIFIED: pyzk enroll_user is known to fail on some ZK8 units.
            ok = conn.enroll_user(uid=int(match[0].uid), temp_id=body.fid, user_id=body.user_id)
            return {"ok": bool(ok)}

        # enroll_user manages the device state itself; do not disable around it.
        return await run(ip, fn, disable=False, action="enroll_user")

    @app.post("/terminals/{ip}/backup", dependencies=[Depends(require_secret)])
    async def backup(ip: str):
        def fn(conn):
            serial = conn.get_serialnumber()
            users = conn.get_users()
            by_uid = {int(u.uid): str(u.user_id) for u in users}
            templates = [finger_to_dict(f, by_uid.get(int(f.uid), str(f.uid))) for f in conn.get_templates()]
            payload = {
                "meta": {
                    "ip": ip,
                    "serial": serial,
                    "firmware": conn.get_firmware_version(),
                    "algorithm": conn.get_fp_version(),
                    "taken_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                },
                "users": [user_to_dict(u) for u in users],
                "templates": templates,
            }
            path = write_backup(settings.backup_dir, str(serial), payload, settings.backup_key)
            return {"file": path, "users": len(users), "templates": len(templates), "encrypted": bool(settings.backup_key)}

        return await run(ip, fn, action="backup")

    return app


def main() -> None:  # pragma: no cover
    import uvicorn

    settings = load_settings()
    uvicorn.run(create_app(settings), host=settings.host, port=settings.port, log_level="info")


if __name__ == "__main__":  # pragma: no cover
    main()
