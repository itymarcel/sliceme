import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from app.engine import load_project_config
from app.printer_presets import (
    decode_preset_id,
    encode_preset_id,
    list_printer_presets,
    load_profile_gcode,
    printer_preset_config,
    printer_preset_gcode,
)


class PrinterPresetTest(unittest.TestCase):
    def test_resolves_inheritance_and_returns_only_gcode_fields(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            machine_dir = Path(temporary_directory) / "TestBrand" / "machine"
            machine_dir.mkdir(parents=True)
            (machine_dir / "base.json").write_text(json.dumps({
                "name": "base-profile",
                "machine_start_gcode": "BASE_START",
                "machine_end_gcode": "BASE_END",
                "emit_machine_limits_to_gcode": "1",
                "printable_area": ["0x0", "999x999"],
                "nozzle_diameter": ["0.8"],
                "gcode_flavor": "klipper",
            }))
            child_path = machine_dir / "child.json"
            child_path.write_text(json.dumps({
                "name": "child-profile",
                "inherits": "base-profile",
                "machine_end_gcode": "CHILD_END",
                "machine_pause_gcode": ["PAUSE"],
                "printable_height": "999",
            }))

            result = load_profile_gcode(child_path)

        self.assertEqual(result, {
            "machine_start_gcode": "BASE_START",
            "machine_end_gcode": "CHILD_END",
            "machine_pause_gcode": "PAUSE",
        })

    def test_lists_instantiated_profiles_and_loads_full_inherited_machine_config(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            profiles_root = Path(temporary_directory)
            machine_dir = profiles_root / "TestBrand" / "machine"
            machine_dir.mkdir(parents=True)
            (machine_dir / "base.json").write_text(json.dumps({
                "name": "base-profile",
                "printable_area": ["0x0", "220x0", "220x220", "0x220"],
                "printable_height": "250",
                "nozzle_diameter": ["0.4"],
                "gcode_flavor": "klipper",
                "machine_start_gcode": "BASE_START",
            }))
            child_path = machine_dir / "child.json"
            child_path.write_text(json.dumps({
                "name": "Test Printer 0.4 nozzle",
                "inherits": "base-profile",
                "instantiation": "true",
                "printer_model": "Test Printer",
                "machine_end_gcode": "CHILD_END",
            }))
            (machine_dir / "hidden.json").write_text(json.dumps({
                "name": "internal-parent",
                "instantiation": "false",
            }))

            presets = list_printer_presets(profiles_root)
            preset_id = encode_preset_id(child_path.relative_to(profiles_root))
            config = printer_preset_config(preset_id, profiles_root)
            gcode = printer_preset_gcode(preset_id, profiles_root)

        self.assertEqual(presets, [{
            "id": preset_id,
            "manufacturer": "TestBrand",
            "name": "Test Printer 0.4 nozzle",
            "model": "Test Printer",
            "nozzle_diameter": ["0.4"],
        }])
        self.assertEqual(decode_preset_id(preset_id), Path("TestBrand/machine/child.json"))
        self.assertEqual(config["printable_area"], ["0x0", "220x0", "220x220", "0x220"])
        self.assertEqual(config["printable_height"], "250")
        self.assertEqual(config["nozzle_diameter"], ["0.4"])
        self.assertEqual(config["gcode_flavor"], "klipper")
        self.assertEqual(config["machine_start_gcode"], "BASE_START")
        self.assertEqual(config["machine_end_gcode"], "CHILD_END")
        self.assertEqual(gcode, {"machine_start_gcode": "BASE_START", "machine_end_gcode": "CHILD_END"})
        self.assertNotIn("inherits", config)
        self.assertNotIn("instantiation", config)
        self.assertNotIn("name", config)

    def test_rejects_preset_paths_outside_profiles_root(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            with self.assertRaisesRegex(ValueError, "Invalid printer preset"):
                printer_preset_config(encode_preset_id(Path("../outside.json")), Path(temporary_directory))

    def test_does_not_follow_symlinked_profiles_during_inheritance(self):
        with tempfile.TemporaryDirectory() as temporary_directory, tempfile.TemporaryDirectory() as outside_directory:
            root = Path(temporary_directory)
            machine = root / "Vendor" / "machine"
            machine.mkdir(parents=True)
            outside = Path(outside_directory) / "outside.json"
            outside.write_text(json.dumps({"name": "External base", "nozzle_diameter": ["9.9"]}))
            (machine / "base.json").symlink_to(outside)
            child = machine / "Child.json"
            child.write_text(json.dumps({"name": "Child", "instantiation": "true", "inherits": "External base"}))

            self.assertEqual(list_printer_presets(root), [])
            with self.assertRaisesRegex(ValueError, "Missing inherited printer profile"):
                printer_preset_config(encode_preset_id(child.relative_to(root)), root)

    def test_catalog_preserves_legacy_ids_for_existing_workspaces(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            profile = root / "BBL" / "machine" / "Bambu Lab A1 0.4 nozzle.json"
            profile.parent.mkdir(parents=True)
            profile.write_text(json.dumps({
                "name": "Bambu Lab A1 0.4 nozzle",
                "instantiation": "true",
                "nozzle_diameter": ["0.4"],
            }))
            presets = list_printer_presets(root)
        self.assertEqual(presets[0]["id"], "bambu-a1")

    def test_rejects_inheritance_cycles(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            machine_dir = Path(temporary_directory) / "TestBrand" / "machine"
            machine_dir.mkdir(parents=True)
            first = machine_dir / "first.json"
            first.write_text(json.dumps({"name": "first", "inherits": "second"}))
            (machine_dir / "second.json").write_text(json.dumps({"name": "second", "inherits": "first"}))
            with self.assertRaisesRegex(ValueError, "inheritance cycle"):
                load_profile_gcode(first)

    @patch("app.engine.printer_preset_gcode", return_value={
        "machine_start_gcode": "PRESET_START",
        "machine_end_gcode": "PRESET_END",
    })
    def test_project_config_applies_only_preset_gcode(self, preset_gcode):
        config = load_project_config(SimpleNamespace(config={"machine_config": {
            "sliceme_printer_preset": "creality-k1c",
            "printable_area": ["0x0", "321x0", "321x234", "0x234"],
            "printable_height": "345",
            "nozzle_diameter": ["0.8"],
        }}))

        preset_gcode.assert_called_once_with("creality-k1c")
        self.assertEqual(config["machine_start_gcode"], "PRESET_START")
        self.assertEqual(config["machine_end_gcode"], "PRESET_END")
        self.assertEqual(config["printable_area"], ["0x0", "321x0", "321x234", "0x234"])
        self.assertEqual(config["printable_height"], "345")
        self.assertEqual(config["nozzle_diameter"], ["0.8"])
        self.assertNotIn("sliceme_printer_preset", config)


if __name__ == "__main__":
    unittest.main()
