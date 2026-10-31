"""In-memory stand-in for pyzk's ZK connection (records every call)."""
from __future__ import annotations

from zk.finger import Finger
from zk.user import User


class FakeDevice:
    def __init__(self, serial="FAKE-SN-1"):
        self.serial = serial
        self.users: dict[int, User] = {}
        self.fingers: dict[tuple[int, int], Finger] = {}
        self.calls: list[str] = []
        self.fail_on: str | None = None
        self.offline = False


class FakeZK:
    def __init__(self, device: FakeDevice):
        self.device = device

    def _call(self, name):
        self.device.calls.append(name)
        if self.device.fail_on == name:
            raise RuntimeError(f"simulated failure in {name}")

    # connection
    def connect(self):
        if self.device.offline:
            raise RuntimeError("can't reach device (ping)")
        self._call("connect")
        return self

    def disconnect(self):
        self._call("disconnect")

    def disable_device(self):
        self._call("disable_device")

    def enable_device(self):
        self._call("enable_device")

    def refresh_data(self):
        self._call("refresh_data")

    # info
    def read_sizes(self):
        self._call("read_sizes")
        self.users_count = len(self.device.users)

    def get_serialnumber(self):
        return self.device.serial

    def get_firmware_version(self):
        return "Ver 6.60 FAKE"

    def get_platform(self):
        return "ZMM220_TFT"

    def get_device_name(self):
        return "X990-FAKE"

    def get_fp_version(self):
        return "10"

    # users
    def get_users(self):
        self._call("get_users")
        return list(self.device.users.values())

    def set_user(self, uid=None, name="", privilege=0, password="", group_id="", user_id="", card=0):
        self._call("set_user")
        self.device.users[int(uid)] = User(int(uid), name, privilege, password, group_id, str(user_id), card)

    def save_user_template(self, user, fingers=[]):
        self._call("save_user_template")
        if int(user.uid) not in self.device.users:
            raise RuntimeError("Can't find user")
        for finger in fingers:
            self.device.fingers[(int(user.uid), int(finger.fid))] = finger

    def delete_user(self, uid=0, user_id=""):
        self._call("delete_user")
        self.device.users.pop(int(uid), None)
        for key in [k for k in self.device.fingers if k[0] == int(uid)]:
            self.device.fingers.pop(key)

    def get_user_template(self, uid, temp_id=0, user_id=""):
        self._call("get_user_template")
        return self.device.fingers.get((int(uid), int(temp_id)))

    def get_templates(self):
        self._call("get_templates")
        return list(self.device.fingers.values())

    def enroll_user(self, uid=0, temp_id=0, user_id=""):
        self._call("enroll_user")
        return False

    def clear_data(self):  # must never be reached
        self._call("clear_data")


def _get_time(self):
    from datetime import datetime

    return datetime(2026, 11, 2, 9, 0, 0)


FakeZK.get_time = _get_time


def _get_attendance(self):
    self._call("get_attendance")
    return list(getattr(self.device, "attendance", []))


FakeZK.get_attendance = _get_attendance
