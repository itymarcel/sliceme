import math
import unittest

from app.gcode_enhancements import apply_enhancement


STANDARD_GCODE = """; generated fixture
M83
; layer num/total_layer_count: 1/2
G1 X0 Y0 Z0.2 F1200
G1 X10 Y0 E1.0 F1200
G1 X10 Y10 E1.0
G1 X0 Y10 E1.0
; layer num/total_layer_count: 2/2
G1 X0 Y0 Z0.4 F1200
G1 X10 Y0 E1.0 F1200
G1 X10 Y10 E1.0
G1 X0 Y10 E1.0
G1 E-0.8 F1800
; end
"""


class EnhancementTest(unittest.TestCase):
    def test_perimeter_echo_duplicates_and_marks_closed_perimeter(self):
        points = [
            (50 + math.cos(index * 2 * math.pi / 32) * 20, 50 + math.sin(index * 2 * math.pi / 32) * 20)
            for index in range(33)
        ]
        moves = "\n".join(f"G1 X{x:.3f} Y{y:.3f} E0.5 F1200" for x, y in points)
        source = f"M83\nG1 X{points[0][0]:.3f} Y{points[0][1]:.3f} F6000\n{moves}\n; layer end\n"
        enhanced = apply_enhancement(source, "perimeter_echo")
        self.assertIn("; sliceme enhancement: perimeter_echo", enhanced)
        self.assertIn("=== Split Start ===", enhanced)
        self.assertGreater(len(enhanced.splitlines()), len(source.splitlines()))

    def test_slow_motion_changes_only_feedrates_below_machine_limit(self):
        enhanced = apply_enhancement(STANDARD_GCODE + "G1 X0 Y0 F6000\n", "slow_motion_80")
        self.assertIn("F960", enhanced)
        self.assertIn("F6000", enhanced)
        self.assertIn("; sliceme enhancement: slow_motion_80", enhanced)

    def test_coast_reduces_extrusion_across_final_layer(self):
        enhanced = apply_enhancement(STANDARD_GCODE, "coast_final_layer")
        final_layer = enhanced.split("; layer num/total_layer_count: 2/2", 1)[1]
        self.assertIn("E1.00000", final_layer)
        self.assertIn("E0.25000", final_layer)
        self.assertIn("E-0.8", final_layer)

    def test_accepts_orca_layer_change_markers(self):
        source = STANDARD_GCODE.replace("; layer num/total_layer_count: 1/2", ";LAYER_CHANGE").replace(
            "; layer num/total_layer_count: 2/2", ";LAYER_CHANGE"
        )
        enhanced = apply_enhancement(source, "coast_final_layer")
        self.assertIn("E0.25000", enhanced)

    def test_smooths_first_continuous_z_layer(self):
        spiral = STANDARD_GCODE.replace(
            "G1 X0 Y0 Z0.4 F1200\nG1 X10 Y0 E1.0 F1200\nG1 X10 Y10 E1.0\nG1 X0 Y10 E1.0",
            "G1 X0 Y0 Z0.40 E1.0 F1200\nG1 X10 Y0 Z0.41 E1.0\nG1 X10 Y10 Z0.42 E1.0\nG1 X0 Y10 Z0.43 E1.0",
        )
        enhanced = apply_enhancement(spiral, "smooth_vase_transition")
        self.assertIn("E0.60000", enhanced)
        self.assertIn("E0.90000", enhanced)

    def test_rejects_duplicate_and_unknown_enhancements(self):
        once = apply_enhancement(STANDARD_GCODE, "coast_final_layer")
        with self.assertRaisesRegex(ValueError, "already been applied"):
            apply_enhancement(once, "coast_final_layer")
        with self.assertRaisesRegex(ValueError, "Unknown"):
            apply_enhancement(STANDARD_GCODE, "does_not_exist")


if __name__ == "__main__":
    unittest.main()
