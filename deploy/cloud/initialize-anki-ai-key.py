#!/usr/bin/env python3
"""Explicit, non-rotating Anki AI master-key initialization. Never prints secrets."""
import argparse
import base64
import fcntl
import os
from pathlib import Path
import secrets
import stat
import tempfile


NAME = "ANKI_AI_ENCRYPTION_KEY"


def initialize(env_file: Path, existing_key_count: int) -> str:
    if existing_key_count < 0:
        raise ValueError("invalid encrypted configuration count")
    lock_fd = os.open(str(env_file) + ".anki-ai.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(lock_fd, "r+") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        fd = os.open(env_file, os.O_RDONLY | os.O_NOFOLLOW)
        with os.fdopen(fd, "r", encoding="utf-8", newline="") as stream:
            info = os.fstat(stream.fileno())
            if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077:
                raise ValueError("environment file must be a private regular file (0600)")
            text = stream.read()
        values = {}
        for line in text.splitlines():
            content = line.strip()
            if not content or content.startswith("#") or "=" not in content:
                continue
            name, value = content.split("=", 1)
            name = name.strip()
            if name in (NAME, "ANKI_AI_ENCRYPTION_KEY_ID"):
                if name in values:
                    raise ValueError("duplicate AI configuration; resolve without rotating the key")
                values[name] = value.strip().strip("\"'")
        if values.get(NAME):
            try:
                valid = len(base64.b64decode(values[NAME], validate=True)) == 32
            except ValueError:
                valid = False
            if not valid:
                raise ValueError("existing master key is invalid; refusing to overwrite")
            return "existing key preserved"
        if existing_key_count:
            raise ValueError("encrypted user configurations exist; recover the original master key instead")
        key = base64.b64encode(secrets.token_bytes(32)).decode("ascii")
        lines = text.splitlines(keepends=True)
        replacement = NAME + "=" + key + "\n"
        found = False
        for index, line in enumerate(lines):
            if line.strip().split("=", 1)[0].strip() == NAME:
                lines[index] = replacement
                found = True
        if not found:
            if lines and not lines[-1].endswith(("\r", "\n")):
                lines[-1] += "\n"
            lines.append(replacement)
        if "ANKI_AI_ENCRYPTION_KEY_ID" not in values:
            lines.append("ANKI_AI_ENCRYPTION_KEY_ID=v1\n")
        temp_fd, temp_name = tempfile.mkstemp(prefix=".anki-ai-env-", dir=env_file.parent)
        try:
            with os.fdopen(temp_fd, "w", encoding="utf-8", newline="") as stream:
                os.fchmod(stream.fileno(), 0o600)
                os.fchown(stream.fileno(), info.st_uid, info.st_gid)
                stream.write("".join(lines))
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temp_name, env_file)
            directory_fd = os.open(env_file.parent, os.O_RDONLY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
        finally:
            if os.path.exists(temp_name):
                os.unlink(temp_name)
        return "master key initialized; retain it across releases"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, required=True)
    parser.add_argument("--existing-key-count", type=int, required=True,
                        help="verified number of non-null anki_ai_settings ciphertext rows")
    args = parser.parse_args()
    try:
        print(initialize(args.env_file, args.existing_key_count))
    except (ValueError, OSError):
        raise SystemExit("AI initialization refused: check file permissions, existing configuration and encrypted row count; no secret printed")


if __name__ == "__main__":
    main()
