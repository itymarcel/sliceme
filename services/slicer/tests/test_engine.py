import io
import json
import struct
import unittest
import zipfile
from types import SimpleNamespace
from unittest.mock import patch

from app.engine import SliceJob, UploadedModel, build_3mf, default_config, load_project_config, slice_job


def triangle_stl() -> bytes:
    header = b"standalone-slicer-test".ljust(80, b"\0")
    triangle = struct.pack(
        "<12fH",
        0, 0, 1,
        0, 0, 0,
        20, 0, 0,
        0, 20, 0,
        0,
    )
    return header + struct.pack("<I", 1) + triangle


class EngineTest(unittest.TestCase):
    def job(self) -> SliceJob:
        return SliceJob(
            models=[UploadedModel("model-1", "triangle.stl", triangle_stl())],
            config=default_config(),
            transforms={
                "model-1": {
                    "position": {"x": 125, "y": 105},
                    "rotation": {"x": 0, "y": 0, "z": 0},
                }
            },
        )

    def test_builds_native_orca_project(self):
        archive = build_3mf(self.job())
        with zipfile.ZipFile(io.BytesIO(archive)) as package:
            self.assertIn("3D/3dmodel.model", package.namelist())
            self.assertIn("Metadata/project_settings.config", package.namelist())
            self.assertIn("Metadata/model_settings.config", package.namelist())
            settings = json.loads(package.read("Metadata/project_settings.config"))
            self.assertEqual(settings["variable_layer_height"], "0")
            self.assertEqual(settings["single_extruder_multi_material"], "0")

    def test_spiral_mode_applies_required_relational_settings(self):
        config = load_project_config(SimpleNamespace(config={"process_config": {
            "spiral_mode": "1",
            "wall_loops": "3",
            "sparse_infill_density": "25%",
            "top_shell_layers": "4",
            "bottom_shell_layers": "2",
            "enable_support": "1",
        }}))

        self.assertEqual(config["spiral_mode"], "1")
        self.assertEqual(config["wall_loops"], "1")
        self.assertEqual(config["sparse_infill_density"], "0%")
        self.assertEqual(config["top_shell_layers"], "0")
        self.assertEqual(config["top_shell_thickness"], "0")
        self.assertEqual(config["enable_support"], "0")
        self.assertEqual(config["enforce_support_layers"], "0")
        self.assertEqual(config["bottom_shell_layers"], "2")

    @patch("app.engine.call_slicer", return_value=b"; generated\nG1 X1 Y1\n")
    def test_slice_job_is_in_memory(self, call_slicer):
        result = slice_job(self.job())
        self.assertEqual(result, b"; generated\nG1 X1 Y1\n")
        project = call_slicer.call_args.args[0]
        self.assertTrue(project.startswith(b"PK"))


if __name__ == "__main__":
    unittest.main()
