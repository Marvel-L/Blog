#!/usr/bin/env python3
"""Encrypted PostgreSQL snapshots and isolated restore drills; no application secrets in logs."""
import argparse
import contextlib
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import select
import shutil
import subprocess
import sys
import tarfile
import tempfile
import uuid

TABLES = ("schema_migrations", "users", "oauth_attempts", "sessions", "user_events")
COUNTS_SQL = "SELECT json_build_object(" + ",".join(
    "'%s',(SELECT count(*) FROM %s)" % (name, name) for name in TABLES
) + ");"
NAME = re.compile(r"dblog-\d{8}T\d{6}Z-[a-f0-9]{8}\.tar\.age")


def run(args, **kwargs):
    # PostgreSQL errors can include row data. Report command failures without their output.
    return subprocess.run(args, check=True, stderr=subprocess.DEVNULL, timeout=240, **kwargs)


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


class Backups:
    def __init__(self, root, destination, recipients, work):
        self.root, self.destination = Path(root), Path(destination)
        self.recipients, self.work = Path(recipients), Path(work)

    def docker(self, *args, interactive=False):
        return ["docker", "exec", *(["-i"] if interactive else []), self.container, *args]

    @contextlib.contextmanager
    def locked(self):
        # Shared deployment lock excludes migrations while allowing normal application traffic.
        # Locks and the installed script live outside release directories.
        with (self.root / "shared/deploy.lock").open("a") as deploy:
            fcntl.flock(deploy, fcntl.LOCK_SH | fcntl.LOCK_NB)
            with (self.root / "shared/backup.lock").open("a") as backup:
                fcntl.flock(backup, fcntl.LOCK_EX | fcntl.LOCK_NB)
                current = self.root / "current"
                result = run([
                    "docker", "compose", "--env-file", str(self.root / "shared/cloud.env"),
                    "-f", str(current / "deploy/cloud/compose.yml"),
                    "-f", str(current / "deploy/cloud/compose.ip.yml"), "ps", "-q", "db",
                ], stdout=subprocess.PIPE, text=True)
                self.container = result.stdout.strip()
                if not re.fullmatch(r"[a-f0-9]{12,64}", self.container):
                    raise ValueError("Database container is unavailable")
                self.work.mkdir(mode=0o700, parents=True, exist_ok=True)
                with tempfile.TemporaryDirectory(prefix="work-", dir=self.work) as scratch:
                    yield Path(scratch)

    def snapshot(self, dump):
        command = self.docker("psql", "-XqAt", "-v", "ON_ERROR_STOP=1", "-U", "dblog", "-d", "dblog", interactive=True)
        process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                   stderr=subprocess.DEVNULL, text=True)
        try:
            process.stdin.write("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSELECT pg_export_snapshot();\n")
            process.stdin.flush()
            if not select.select([process.stdout], [], [], 30)[0]:
                raise TimeoutError("Snapshot export timed out")
            snapshot = process.stdout.readline().strip()
            if not re.fullmatch(r"[0-9A-Fa-f]{8}-[0-9A-Fa-f]{8}-[0-9]+", snapshot):
                raise ValueError("Invalid snapshot identifier")
            with dump.open("xb") as output:
                run(self.docker("pg_dump", "-U", "dblog", "-d", "dblog", "-Fc",
                                "--no-owner", "--no-privileges", "--snapshot=" + snapshot), stdout=output)
            # Both row counts and pg_dump read exactly the exported transaction snapshot.
            output, _ = process.communicate(COUNTS_SQL + "\nCOMMIT;\n", timeout=30)
            if process.returncode:
                raise ValueError("Snapshot transaction failed")
            counts = json.loads(output.strip())
            self.validate_counts(counts)
            return counts
        finally:
            if process.poll() is None:
                process.kill()
            process.communicate()

    @staticmethod
    def validate_counts(counts):
        if not isinstance(counts, dict) or set(counts) != set(TABLES) or any(
            type(value) is not int or value < 0 for value in counts.values()
        ):
            raise ValueError("Invalid backup row counts")

    def create(self, retention_days=14):
        if not 1 <= retention_days <= 3650:
            raise ValueError("Invalid retention period")
        self.destination.mkdir(mode=0o700, parents=True, exist_ok=True)
        with self.locked() as scratch:
            dump = scratch / "database.dump"
            counts = self.snapshot(dump)
            manifest = {
                "format": 1, "database": "dblog", "counts": counts,
                "dump_sha256": sha256(dump),
                "created_at": dt.datetime.now(dt.timezone.utc).isoformat(),
                "release": (self.root / "current").resolve().name,
            }
            (scratch / "manifest.json").write_text(json.dumps(manifest) + "\n")
            bundle = scratch / "backup.tar"
            with tarfile.open(bundle, "w") as archive:
                archive.add(dump, arcname="database.dump")
                archive.add(scratch / "manifest.json", arcname="manifest.json")
            name = "dblog-" + dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8] + ".tar.age"
            target = self.destination / name
            pending = self.destination / ("." + name + ".partial")
            checksum = Path(str(target) + ".sha256")
            try:
                run(["age", "-R", str(self.recipients), "-o", str(pending), str(bundle)])
                checksum.write_text(sha256(pending) + "  " + name + "\n")
                pending.replace(target)
            except BaseException:
                pending.unlink(missing_ok=True)
                checksum.unlink(missing_ok=True)
                raise
            # Retention only runs after a complete new backup is published.
            cutoff = dt.datetime.now(dt.timezone.utc).timestamp() - retention_days * 86400
            for previous in self.destination.iterdir():
                if NAME.fullmatch(previous.name) and previous != target and not previous.is_symlink() and previous.is_file() and previous.stat().st_mtime < cutoff:
                    previous.unlink()
                    Path(str(previous) + ".sha256").unlink(missing_ok=True)
            return target

    def verify(self, archive, identity):
        archive = Path(archive)
        expected = Path(str(archive) + ".sha256").read_text().strip()
        if not NAME.fullmatch(archive.name) or expected != sha256(archive) + "  " + archive.name:
            raise ValueError("Encrypted backup checksum mismatch")
        with self.locked() as scratch:
            bundle = scratch / "backup.tar"
            run(["age", "-d", "-i", str(identity), "-o", str(bundle), str(archive)])
            with tarfile.open(bundle) as source:
                members = source.getmembers()
                if len(members) != 2 or {item.name for item in members} != {"database.dump", "manifest.json"} or any(not item.isfile() for item in members):
                    raise ValueError("Unsafe backup members")
                if source.getmember("manifest.json").size > 65536:
                    raise ValueError("Oversized backup manifest")
                # Exact filenames, regular files only; never extract arbitrary paths.
                for member in members:
                    with source.extractfile(member) as data, (scratch / member.name).open("xb") as output:
                        shutil.copyfileobj(data, output)
            manifest = json.loads((scratch / "manifest.json").read_text())
            self.validate_counts(manifest.get("counts"))
            if manifest.get("format") != 1 or manifest.get("database") != "dblog" or manifest.get("dump_sha256") != sha256(scratch / "database.dump"):
                raise ValueError("Backup manifest validation failed")
            # Names are generated here, never supplied by a caller, and cannot name the live DB.
            database = "dblog_restore_" + uuid.uuid4().hex
            run(self.docker("createdb", "-U", "dblog", "--template=template0", database))
            try:
                with (scratch / "database.dump").open("rb") as dump:
                    run(self.docker("pg_restore", "-U", "dblog", "-d", database,
                                    "--exit-on-error", "--single-transaction", "--no-owner", "--no-privileges", interactive=True), stdin=dump)
                output = run(self.docker("psql", "-XqAt", "-v", "ON_ERROR_STOP=1", "-U", "dblog", "-d", database, "-c", COUNTS_SQL), stdout=subprocess.PIPE, text=True)
                if json.loads(output.stdout) != manifest["counts"]:
                    raise ValueError("Restored row counts differ from the backup snapshot")
                output = run(self.docker("psql", "-XqAt", "-U", "dblog", "-d", database, "-c",
                                        "SELECT count(*) FROM pg_constraint WHERE contype IN ('f','c') AND NOT convalidated;"), stdout=subprocess.PIPE, text=True)
                if output.stdout.strip() != "0":
                    raise ValueError("Restored constraints are not validated")
                return manifest["counts"]
            finally:
                run(self.docker("dropdb", "-U", "dblog", database))


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default="/opt/dblog")
    parser.add_argument("--destination", default="/var/backups/dblog")
    parser.add_argument("--recipients", default="/opt/dblog/shared/backup-recipients.txt")
    parser.add_argument("--work", default="/run/dblog-backup")
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("create")
    create.add_argument("--retention-days", type=int, default=14)
    verify = commands.add_parser("verify")
    verify.add_argument("--archive", required=True)
    verify.add_argument("--identity", required=True)
    args = parser.parse_args()
    backups = Backups(args.root, args.destination, args.recipients, args.work)
    try:
        if args.command == "create":
            print("Encrypted backup created: " + str(backups.create(args.retention_days)))
        else:
            print("Isolated restore verified: " + json.dumps(backups.verify(args.archive, args.identity), sort_keys=True))
    except Exception as error:
        # Never render exception messages which might include PostgreSQL row data or credentials.
        print("Backup operation failed: " + type(error).__name__, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
