import unittest
from types import SimpleNamespace

from app.engine import load_project_config
from app.print_presets import list_print_presets, print_preset_config


class PrintPresetTest(unittest.TestCase):
    def test_lists_quality_presets_and_returns_full_process_config(self):
        presets = list_print_presets()

        self.assertEqual([preset["id"] for preset in presets], ["draft", "standard", "fine", "strong", "vase"])
        self.assertIn("layer_height", print_preset_config("standard"))
        self.assertIn("wall_loops", print_preset_config("standard"))
        self.assertIn("sparse_infill_density", print_preset_config("standard"))
        self.assertEqual(print_preset_config("vase")["spiral_mode"], "1")
        self.assertEqual(print_preset_config("vase")["sparse_infill_density"], "0%")

    def test_returns_a_copy_so_applied_presets_cannot_mutate_the_catalog(self):
        first = print_preset_config("draft")
        first["layer_height"] = "99"

        self.assertEqual(print_preset_config("draft")["layer_height"], "0.28")

    def test_rejects_unknown_print_preset(self):
        with self.assertRaisesRegex(ValueError, "Unknown print preset"):
            print_preset_config("unknown")

    def test_application_print_preset_id_is_not_sent_to_orca(self):
        config = load_project_config(SimpleNamespace(config={
            "machine_config": {},
            "process_config": {"sliceme_print_preset": "standard", "layer_height": "0.2"},
            "filament_config": {},
        }))

        self.assertEqual(config["layer_height"], "0.2")
        self.assertNotIn("sliceme_print_preset", config)


if __name__ == "__main__":
    unittest.main()
