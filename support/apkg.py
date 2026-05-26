#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
#
import argparse
import json
import os
import sys
import tarfile
import tempfile
import zipfile

APK_VERSION = "2.0"
APK_SUFFIX = "apk"
VERSION_FILE = "apkg-version"
DATA_TAR = "data.tar.gz"
CONTROL_TAR = "control.tar.gz"
CONTROL_DIR = "CONTROL"
CONFIG_FILE = "config.json"


def _set_tar_metadata(member, is_executable=False):
    member.uid = 0
    member.gid = 0
    member.uname = "root"
    member.gname = "root"
    if member.isdir():
        member.mode = 0o755
    elif is_executable:
        member.mode = 0o755
    else:
        member.mode = 0o644
    return member


def _tar_filter_control(member):
    return _set_tar_metadata(member, is_executable=member.name.endswith((".sh", ".py")))


def _tar_filter_data(member):
    if CONTROL_DIR in member.name:
        return None
    return _set_tar_metadata(member)


def _make_tar(tar_path, source_dir, filter_fn):
    with tarfile.open(tar_path, "w:gz") as tar:
        tar.add(source_dir, arcname=".", filter=filter_fn)


def _make_apk(apk_path, tmp_dir):
    with zipfile.ZipFile(apk_path, "w", compression=zipfile.ZIP_STORED) as zf:
        for name in [VERSION_FILE, CONTROL_TAR, DATA_TAR]:
            zf.write(os.path.join(tmp_dir, name), arcname=name)


def create(folder, dest_dir=None):
    app_dir = os.path.abspath(folder)
    control_dir = os.path.join(app_dir, CONTROL_DIR)

    with open(os.path.join(control_dir, CONFIG_FILE)) as f:
        info = json.load(f)["general"]

    dest_dir = os.path.abspath(dest_dir) if dest_dir else os.getcwd()
    os.makedirs(dest_dir, exist_ok=True)

    apk_path = os.path.join(dest_dir, f"{info['package']}_{info['version']}_{info['architecture']}.{APK_SUFFIX}")

    with tempfile.TemporaryDirectory(prefix="APKG-") as tmp_dir:
        with open(os.path.join(tmp_dir, VERSION_FILE), "w") as f:
            f.write(APK_VERSION + "\n")
        _make_tar(os.path.join(tmp_dir, DATA_TAR), app_dir, _tar_filter_data)
        _make_tar(os.path.join(tmp_dir, CONTROL_TAR), control_dir, _tar_filter_control)
        _make_apk(apk_path, tmp_dir)

    print(f"Created: {apk_path}")
    return apk_path


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="ASUSTOR package builder")
    parser.add_argument("folder", help="App layout folder to pack")
    parser.add_argument("--destination", metavar="DIR", help="Output directory (default: cwd)")
    args = parser.parse_args()
    create(args.folder, args.destination)
