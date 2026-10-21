import importlib.util
import pathlib
import tempfile
import unittest

MODULE = pathlib.Path(__file__).resolve().parents[1] / "release-scope.py"
SPEC = importlib.util.spec_from_file_location("release_scope", MODULE)
release_scope = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(release_scope)


class ReleaseScopeTest(unittest.TestCase):
    def scope(self, previous, next_release):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            old = root / "old"
            new = root / "new"
            old.write_text("".join(f"{digest}  {path}\n" for path, digest in previous.items()))
            new.write_text("".join(f"{digest}  {path}\n" for path, digest in next_release.items()))
            return release_scope.release_scope(str(old), str(new))

    def test_frontend_only(self):
        self.assertEqual(self.scope({"dist/index.html": "a"}, {"dist/index.html": "b"}), ["web"])

    def test_server_only(self):
        self.assertEqual(
            self.scope({"packages/server/main.go": "a"}, {"packages/server/main.go": "b"}),
            ["server"],
        )

    def test_infrastructure_rebuilds_both(self):
        self.assertEqual(
            self.scope({"deploy/cloud/compose.yml": "a"}, {"deploy/cloud/compose.yml": "b"}),
            ["web", "server"],
        )

    def test_unknown_defaults_to_web(self):
        self.assertEqual(self.scope({"README.md": "a"}, {"README.md": "b"}), ["web"])


if __name__ == "__main__":
    unittest.main()
