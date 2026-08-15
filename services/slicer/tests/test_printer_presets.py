import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from app.engine import load_project_config
from app.printer_presets import load_profile_gcode


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
