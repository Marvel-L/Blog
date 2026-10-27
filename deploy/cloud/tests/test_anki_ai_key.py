import base64
import importlib.util
from pathlib import Path
import tempfile
import subprocess
import unittest

spec = importlib.util.spec_from_file_location("anki_key_init", Path(__file__).resolve().parents[1] / "initialize-anki-ai-key.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class AnkiKeyInitializationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "cloud.env"
        self.path.write_text("GITHUB_CLIENT_SECRET=unchanged\n", encoding="utf-8")
        self.path.chmod(0o600)

    def test_initialization_is_stable_and_preserves_unrelated_values(self):
        module.initialize(self.path, 0)
        before = self.path.read_bytes()
        value = next(x.split("=", 1)[1] for x in before.decode().splitlines() if x.startswith(module.NAME + "="))
        self.assertEqual(len(base64.b64decode(value, validate=True)), 32)
        self.assertIn(b"GITHUB_CLIENT_SECRET=unchanged\n", before)
        self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(module.initialize(self.path, 1), "existing key preserved")
        self.assertEqual(self.path.read_bytes(), before)

    def test_missing_master_with_encrypted_users_is_not_regenerated(self):
        before = self.path.read_bytes()
        with self.assertRaises(ValueError):
            module.initialize(self.path, 1)
        self.assertEqual(self.path.read_bytes(), before)

    def test_invalid_duplicate_and_public_file_are_rejected(self):
        for text in (module.NAME + "=invalid\n", module.NAME + "=\n" + module.NAME + "=\n"):
            self.path.write_text(text, encoding="utf-8")
            with self.assertRaises(ValueError):
                module.initialize(self.path, 0)
            self.assertEqual(self.path.read_text(encoding="utf-8"), text)
        self.path.chmod(0o644)
        with self.assertRaises(ValueError):
            module.initialize(self.path, 0)

    def test_compose_passes_ai_variables_only_to_api(self):
        compose = (Path(__file__).resolve().parents[1] / "compose.yml").read_text(encoding="utf-8")
        api = compose.split("  api:\n", 1)[1].split("  web:\n", 1)[0]
        for name, default in ((module.NAME, ""), ("ANKI_AI_ENCRYPTION_KEY_ID", "v1"), ("ANKI_AI_MODEL", "deepseek-flash")):
            self.assertIn(f"{name}: ${{{name}:-{default}}}", api)
            self.assertEqual(sum(line.lstrip().startswith(name + ': ') for line in compose.splitlines()), 1)
        example = (Path(__file__).resolve().parents[1] / ".env.example").read_text(encoding="utf-8")
        self.assertIn(module.NAME + "=\n", example)
        activation = Path(__file__).resolve().parents[1] / 'enable-anki-ai.sh'
        subprocess.run(['bash', '-n', str(activation)], check=True)
        script = activation.read_text(encoding='utf-8')
        self.assertIn('flock -n 9', script)
        self.assertIn('--no-deps --no-build --wait', script)
        self.assertIn('--existing-key-count "$count"', script)
        self.assertNotIn('down -v', script)


if __name__ == "__main__":
    unittest.main()
