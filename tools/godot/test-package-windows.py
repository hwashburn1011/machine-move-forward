"""Offline packager tests: no Godot, Blender, project edits, or release exports."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
import zipfile

SPEC = importlib.util.spec_from_file_location("windows_packager", Path(__file__).with_name("package-windows.py"))
PACK = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PACK)


class PackagingTests(unittest.TestCase):
    def test_exact_exclusions_preserve_reachable_legacy_assets(self):
        for path in ("tests/test.gd", "tests/nested/test.json", "tools/bake.gd", "assets/models/player.glb"):
            self.assertTrue(PACK.excluded(path), path)
        for path in ("assets/models/authored/s07-player.glb", "assets/models/props/ruins/desert-ruins.glb",
                     "data/scenery-collision/a/001.res", "assets/textures/sand/diffuse.jpg"):
            self.assertFalse(PACK.excluded(path), path)

    def test_unknown_export_files_and_second_exe_are_blocked(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / PACK.EXE_NAME).write_bytes(b"fake exe")
            (root / "MachineMoveForward.pck").write_bytes(b"fake pck")
            self.assertEqual(len(PACK.release_files(root)), 2)
            second = root / "MachineMoveForward.console.exe"
            second.write_bytes(b"launcher")
            with self.assertRaisesRegex(ValueError, "Exactly one"):
                PACK.release_files(root)
            second.unlink()
            (root / "secret.env").write_text("do not ship")
            with self.assertRaisesRegex(ValueError, "Unexpected export file"):
                PACK.release_files(root)

    def test_zip_is_byte_deterministic_despite_filesystem_timestamps(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            payload = root / "payload"
            payload.mkdir()
            (payload / PACK.EXE_NAME).write_bytes(b"exe")
            (payload / "MachineMoveForward.pck").write_bytes(bytes(range(256)) * 10)
            (payload / "LICENSES").mkdir()
            (payload / "LICENSES/engine.txt").write_text("license")
            first, second = root / "first.zip", root / "second.zip"
            PACK.deterministic_zip(payload, first, "2026-10-02T12:00:01Z")
            import os
            os.utime(payload / PACK.EXE_NAME, (1, 1))
            PACK.deterministic_zip(payload, second, "2026-10-02T12:00:01Z")
            self.assertEqual(PACK.sha(first), PACK.sha(second))
            with zipfile.ZipFile(first) as archive:
                self.assertIsNone(archive.testzip())
                self.assertIn(PACK.EXE_NAME, archive.namelist())
                self.assertEqual(archive.read("LICENSES/engine.txt"), b"license")

    def test_source_fingerprint_does_not_recurse_into_release_identity(self):
        with tempfile.TemporaryDirectory() as temp:
            project = Path(temp)
            (project / "project.godot").write_text("config_version=5\n")
            for folder in ("scripts", "data", "scenes", "shaders", "release"):
                (project / folder).mkdir()
            (project / "scripts/main.gd").write_text("extends Node\n")
            before = PACK.source_fingerprint(project)
            (project / "release/build.json").write_text('{"source_hash":"changed"}')
            self.assertEqual(before, PACK.source_fingerprint(project))
            (project / "scripts/main.gd").write_text("extends Node3D\n")
            self.assertNotEqual(before, PACK.source_fingerprint(project))

    def test_dynamic_collision_and_raw_json_coverage(self):
        with tempfile.TemporaryDirectory() as temp:
            project = Path(temp)
            for folder in ("scripts", "data", "scenes", "shaders", "release", "art"):
                (project / folder).mkdir()
            (project / "project.godot").write_text("config_version=5\n")
            (project / "scenes/main.tscn").write_text("scene")
            (project / "scripts/main.gd").write_text("extends Node\n")
            for name in ("nomad-native", "refined-s07-player", "refined-raider", "refined-scavenger",
                         "refined-warden", "refined-revenant", "refined-bastion", "refined-sovereign"):
                (project / "art" / (name + ".scn")).write_bytes(b"scene")
            (project / "data/chunk.res").write_bytes(b"shape")
            (project / "data/roof.res").write_bytes(b"shape")
            PACK.write_json(project / "data/scenery-collision.json", {"models": {"x": {"chunks": [{"path": "res://data/chunk.res"}]}}})
            PACK.write_json(project / "data/site-roofs.json", {"sites": {"x": {"path": "res://data/roof.res"}}})
            release = dict(schema=1, version="0.3.0-beta.1", build_id="test", source_hash=PACK.source_fingerprint(project),
                           created_utc="2026-10-02T12:00:00Z", asset_manifest_sha256="a" * 64)
            PACK.write_json(project / "release/build.json", release)
            inventory = PACK.inventory(project)
            self.assertEqual(len(inventory["collision_shapes"]), 2)
            self.assertIn("res://scripts/main.gd", inventory["resources"])
            self.assertIn("res://release/build.json", [r["path"] for r in inventory["raw_json"]])
            (project / "data/chunk.res").unlink()
            with self.assertRaisesRegex(ValueError, "collision shape"):
                PACK.inventory(project)

    def test_existing_output_is_never_deleted(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)
            marker = path / "keep.txt"
            marker.write_text("keep")
            with self.assertRaisesRegex(ValueError, "already exists"):
                PACK.fresh_directory(path)
            self.assertEqual(marker.read_text(), "keep")

    def test_preset_rejects_dynamic_resource_exclusions(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "export_presets.cfg"
            text = ('[preset.0]\nname="Windows Desktop"\nplatform="Windows Desktop"\n'
                    'export_filter="all_resources"\ninclude_filter="*.json"\n'
                    'exclude_filter="tests/*,tools/*,assets/models/player.glb"\n'
                    '[preset.0.options]\nbinary_format/embed_pck=false\n'
                    'binary_format/architecture="x86_64"\ndebug/export_console_wrapper=0\n')
            path.write_text(text)
            PACK.validate_preset(path, "Windows Desktop")
            for bad in (text.replace('all_resources', 'scenes'),
                        text.replace('assets/models/player.glb', 'assets/models/*'),
                        text.replace('embed_pck=false', 'embed_pck=true'),
                        text.replace('include_filter="*.json"', 'include_filter=""')):
                path.write_text(bad)
                with self.assertRaises(ValueError):
                    PACK.validate_preset(path, "Windows Desktop")


if __name__ == "__main__":
    unittest.main()
