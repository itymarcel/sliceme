import unittest

from app.ai_prefill import _context, _output_text, _postprocess


class AiPrefillTest(unittest.TestCase):
    def test_context_only_sends_relevant_printer_material_values(self):
        context = _context({
            "machine_config": {"nozzle_diameter": ["0.6"], "machine_start_gcode": "secret custom commands"},
            "filament_config": {"filament_type": ["PETG"], "filament_start_gcode": "custom"},
            "process_config": {"layer_height": "0.2", "wall_loops": "3"},
        })
        self.assertEqual(context["machine_config"], {"nozzle_diameter": "0.6"})
        self.assertEqual(context["filament_config"], {"filament_type": "PETG"})
        self.assertEqual(context["process_config"], {"layer_height": "0.2"})

    def test_postprocess_enforces_nozzle_and_spiral_relations(self):
        recommendation = {
            "machine_config": {"nozzle_diameter": "0.4"},
            "process_config": {"spiral_mode": "0", "brim_width": "0", "brim_type": "outer_only"},
            "user_specified_overrides": [],
        }
        result = _postprocess(recommendation, "continuous spiral vase", {"machine_config": {"nozzle_diameter": ["0.8"]}})
        self.assertEqual(result["machine_config"]["nozzle_diameter"], "0.8")
        self.assertEqual(result["process_config"]["spiral_mode"], "1")
        self.assertEqual(result["process_config"]["wall_loops"], "1")
        self.assertEqual(result["process_config"]["top_shell_layers"], "0")
        self.assertEqual(result["process_config"]["brim_type"], "no_brim")

    def test_postprocess_preserves_explicit_nozzle_with_qualified_override_key(self):
        recommendation = {
            "machine_config": {"nozzle_diameter": "1.4"},
            "process_config": {"layer_height": "0.8", "spiral_mode": "0", "brim_width": "0", "brim_type": "no_brim"},
            "user_specified_overrides": ["machine_config.nozzle_diameter"],
        }

        result = _postprocess(
            recommendation,
            "thick layers, continuous print, 1.4mm nozzle, no brim",
            {"machine_config": {"nozzle_diameter": ["0.6"]}},
        )

        self.assertEqual(result["machine_config"]["nozzle_diameter"], "1.4")
        self.assertLessEqual(float(result["process_config"]["layer_height"]), 1.4)

    def test_extracts_structured_output_text(self):
        source = {"output": [{"type": "message", "content": [{"type": "output_text", "text": '{"ok":true}'}]}]}
        self.assertEqual(_output_text(source), '{"ok":true}')


if __name__ == "__main__":
    unittest.main()
