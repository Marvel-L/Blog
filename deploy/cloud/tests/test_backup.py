"""Exercise backup publication/failure/restore semantics without a production database.

The age and Docker command boundaries are fakes here; real encryption and PostgreSQL
restoration must also be verified on the deployment host.
"""
import fcntl
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import time
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("cloud_backup", Path(__file__).parents[1] / "backup.py")
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


class BackupTests(unittest.TestCase):
    def setUp(self):
        self.previous_umask = os.umask(0o077)
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.addCleanup(os.umask, self.previous_umask)
        self.root = Path(self.temp.name)
        (self.root / "shared").mkdir()
        (self.root / "current").mkdir()
        self.engine = backup.Backups(self.root, self.root / "backups", self.root / "recipient", self.root / "work")
        self.counts = {name: index + 1 for index, name in enumerate(backup.TABLES)}
        self.calls, self.created, self.dropped = [], [], []
        self.fail = None
        self.restore_counts = self.counts
        self.patcher = patch.object(backup, "run", self.fake_run)
        self.patcher.start()
        self.addCleanup(self.patcher.stop)
        self.snapshot_patch = patch.object(self.engine, "snapshot", self.fake_snapshot)
        self.snapshot_patch.start()
        self.addCleanup(self.snapshot_patch.stop)

    def fake_snapshot(self, dump):
        if self.fail == "pg_dump":
            raise subprocess.CalledProcessError(1, "pg_dump")
        dump.write_bytes(b"PGDMP fixture")
        return self.counts.copy()

    def fake_run(self, args, **kwargs):
        self.calls.append(args)
        if args[0] == "age":
            if self.fail == "age":
                raise subprocess.CalledProcessError(1, "age")
            # Byte-copy transport fake, explicitly not a cryptographic test.
            shutil.copyfile(args[-1], args[args.index("-o") + 1])
            return subprocess.CompletedProcess(args, 0)
        if args[:2] == ["docker", "compose"]:
            return subprocess.CompletedProcess(args, 0, "a" * 64 + "\n")
        command = args[args.index("a" * 64) + 1]
        if command == "createdb":
            self.created.append(args[-1])
        elif command == "dropdb":
            self.assertTrue(args[-1].startswith("dblog_restore_"))
            self.assertNotEqual(args[-1], "dblog")
            self.dropped.append(args[-1])
        elif command == "pg_restore":
            self.assertIn("--single-transaction", args)
            self.assertEqual(kwargs["stdin"].read(), b"PGDMP fixture")
            if self.fail == "pg_restore":
                raise subprocess.CalledProcessError(1, "pg_restore")
        elif command == "psql":
            data = json.dumps(self.restore_counts) if args[-1] == backup.COUNTS_SQL else "0"
            return subprocess.CompletedProcess(args, 0, data)
        return subprocess.CompletedProcess(args, 0)

    def rewrite(self, archive, members):
        with tarfile.open(archive, "w") as bundle:
            for name, content in members.items():
                item = tarfile.TarInfo(name)
                item.size = len(content)
                bundle.addfile(item, io.BytesIO(content))
        Path(str(archive) + ".sha256").write_text(backup.sha256(archive) + "  " + archive.name + "\n")

    def test_snapshot_backup_and_restore_use_matching_counts_and_cleanup(self):
        archive = self.engine.create()
        self.assertEqual(archive.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.engine.verify(archive, "identity"), self.counts)
        self.assertEqual(self.created, self.dropped)
        self.assertEqual(len(self.created), 1)
        self.assertEqual(list((self.root / "work").iterdir()), [])
        self.assertEqual(sorted(x.name for x in (self.root / "backups").iterdir()),
                         sorted([archive.name, archive.name + ".sha256"]))

    def test_encryption_failure_keeps_previous_backup_and_removes_partial_files(self):
        previous = self.engine.create()
        os.utime(previous, (0, 0))
        self.fail = "age"
        with self.assertRaises(subprocess.CalledProcessError):
            self.engine.create()
        self.assertTrue(previous.exists())
        self.assertFalse(any("partial" in p.name for p in previous.parent.iterdir()))
        self.assertEqual(len(list(previous.parent.iterdir())), 2)

    def test_dump_failure_publishes_nothing(self):
        self.fail = "pg_dump"
        with self.assertRaises(subprocess.CalledProcessError):
            self.engine.create()
        self.assertEqual(list((self.root / "backups").iterdir()), [])

    def test_corruption_is_rejected_before_decryption_or_database_access(self):
        archive = self.engine.create()
        archive.write_bytes(archive.read_bytes() + b"corrupt")
        self.calls.clear()
        with self.assertRaisesRegex(ValueError, "checksum"):
            self.engine.verify(archive, "identity")
        self.assertEqual(self.calls, [])

    def test_path_traversal_is_rejected_before_creating_a_restore_database(self):
        archive = self.engine.create()
        self.rewrite(archive, {"../escape": b"bad", "manifest.json": b"{}"})
        with self.assertRaisesRegex(ValueError, "Unsafe"):
            self.engine.verify(archive, "identity")
        self.assertEqual(self.created, [])
        self.assertFalse((self.root / "escape").exists())

    def test_wrong_identity_does_not_touch_a_database(self):
        archive = self.engine.create()
        self.fail = "age"
        with self.assertRaises(subprocess.CalledProcessError):
            self.engine.verify(archive, "wrong-key")
        self.assertEqual(self.created, [])

    def test_dump_manifest_tampering_is_rejected(self):
        archive = self.engine.create()
        self.rewrite(archive, {"database.dump": b"modified", "manifest.json": json.dumps({
            "format": 1, "database": "dblog", "counts": self.counts, "dump_sha256": "0" * 64,
        }).encode()})
        with self.assertRaisesRegex(ValueError, "manifest"):
            self.engine.verify(archive, "identity")
        self.assertEqual(self.created, [])

    def test_restore_failure_still_drops_only_the_isolated_database(self):
        archive = self.engine.create()
        self.fail = "pg_restore"
        with self.assertRaises(subprocess.CalledProcessError):
            self.engine.verify(archive, "identity")
        self.assertEqual(self.created, self.dropped)
        self.assertEqual(len(self.created), 1)

    def test_row_count_mismatch_fails_verification_and_cleans_up(self):
        archive = self.engine.create()
        self.restore_counts = {**self.counts, "user_events": 0}
        with self.assertRaisesRegex(ValueError, "counts differ"):
            self.engine.verify(archive, "identity")
        self.assertEqual(self.created, self.dropped)

    def test_successful_retention_preserves_recent_and_unrelated_files(self):
        previous = self.engine.create()
        unrelated = previous.parent / "keep.txt"
        unrelated.write_text("unrelated")
        os.utime(previous, (time.time() - 15 * 86400,) * 2)
        current = self.engine.create()
        self.assertFalse(previous.exists())
        self.assertFalse(Path(str(previous) + ".sha256").exists())
        self.assertTrue(current.exists())
        self.assertTrue(unrelated.exists())

    def test_deployment_exclusive_lock_blocks_backups_before_database_access(self):
        with (self.root / "shared/deploy.lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaises(BlockingIOError):
                self.engine.create()
        self.assertEqual(self.calls, [])

    def test_exported_snapshot_stays_open_until_dump_and_counts_are_complete(self):
        self.snapshot_patch.stop()
        process = unittest.mock.Mock()
        process.stdout = io.StringIO("00000003-00000001-1\n")
        process.stdin = io.StringIO()
        process.returncode = 0
        process.poll.return_value = 0
        process.communicate.return_value = (json.dumps(self.counts), None)
        self.engine.container = "a" * 64

        def dump(args, **kwargs):
            self.assertIn("--snapshot=00000003-00000001-1", args)
            self.assertIn("REPEATABLE READ READ ONLY", process.stdin.getvalue())
            self.assertFalse(process.communicate.called)
            kwargs["stdout"].write(b"PGDMP fixture")

        with patch.object(backup.subprocess, "Popen", return_value=process), patch.object(backup.select, "select", return_value=([process.stdout], [], [])), patch.object(backup, "run", side_effect=dump):
            self.assertEqual(self.engine.snapshot(self.root / "snapshot.dump"), self.counts)
        self.assertTrue(any(backup.COUNTS_SQL in (call.args[0] if call.args else "") for call in process.communicate.call_args_list))


if __name__ == "__main__":
    unittest.main()
