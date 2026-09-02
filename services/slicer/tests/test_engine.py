import io
import json
import struct
import unittest
import xml.etree.ElementTree as ET
import zipfile
from types import SimpleNamespace
from unittest.mock import patch

from app.engine import SliceJob, UploadedModel, _build_affine_from_item_transform, build_3mf, default_config, load_project_config, slice_job


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


def box_stl(min_z: float, max_z: float) -> bytes:
    vertices = [
        (0, 0, min_z), (20, 0, min_z), (20, 20, min_z), (0, 20, min_z),
        (0, 0, max_z), (20, 0, max_z), (20, 20, max_z), (0, 20, max_z),
    ]
    faces = [
        (0, 2, 1), (0, 3, 2), (4, 5, 6), (4, 6, 7),
        (0, 1, 5), (0, 5, 4), (1, 2, 6), (1, 6, 5),
        (2, 3, 7), (2, 7, 6), (3, 0, 4), (3, 4, 7),
    ]
    payload = bytearray(b"standalone-box".ljust(80, b"\0"))
    payload.extend(struct.pack("<I", len(faces)))
    for a, b, c in faces:
        payload.extend(struct.pack("<12fH", 0, 0, 0, *vertices[a], *vertices[b], *vertices[c], 0))
    return bytes(payload)


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

    def test_builds_modifier_mesh_as_a_modifier_part_of_its_parent_object(self):
        job = SliceJob(
            models=[
                UploadedModel("model-1", "part.stl", triangle_stl()),
                UploadedModel("modifier-1", "modifier.stl", triangle_stl(), modifier_for="model-1"),
            ],
            config=default_config(),
            transforms={
                "model-1": {"position": {"x": 100, "y": 100}, "rotation": {"x": 0, "y": 0, "z": 0}},
                "modifier-1": {"position": {"x": 105, "y": 105}, "rotation": {"x": 0, "y": 0, "z": 0}},
            },
            file_overrides={"modifier-1": {"process_config": {"sparse_infill_density": "80%"}}},
        )

        archive = build_3mf(job)
        with zipfile.ZipFile(io.BytesIO(archive)) as package:
            model_root = ET.fromstring(package.read("3D/3dmodel.model"))
            settings_root = ET.fromstring(package.read("Metadata/model_settings.config"))

        namespace = {"m": "http://schemas.microsoft.com/3dmanufacturing/core/2015/02"}
        self.assertEqual(len(model_root.findall("./m:build/m:item", namespace)), 1)
        parts = settings_root.findall("./object/part")
        self.assertEqual([part.get("subtype") for part in parts], ["normal_part", "modifier_part"])
        modifier_values = {item.get("key"): item.get("value") for item in parts[1].findall("./metadata")}
        self.assertEqual(modifier_values["sparse_infill_density"], "80%")

    def test_builds_generated_parts_as_one_printable_assembly(self):
        job = SliceJob(
            models=[
                UploadedModel("lower", "lower.stl", triangle_stl()),
                UploadedModel("upper", "upper.stl", triangle_stl(), assembly_for="lower"),
            ],
            config=default_config(),
            transforms={
                "lower": {"position": {"x": 100, "y": 100, "z": 0}, "rotation": {"x": 0, "y": 0, "z": 0}},
                "upper": {"position": {"x": 100, "y": 100, "z": 10}, "rotation": {"x": 0, "y": 0, "z": 0}},
            },
        )

        archive = build_3mf(job)
        with zipfile.ZipFile(io.BytesIO(archive)) as package:
            model_root = ET.fromstring(package.read("3D/3dmodel.model"))
            settings_root = ET.fromstring(package.read("Metadata/model_settings.config"))

        namespace = {"m": "http://schemas.microsoft.com/3dmanufacturing/core/2015/02"}
        self.assertEqual(len(model_root.findall("./m:build/m:item", namespace)), 1)
        self.assertEqual(
            [part.get("subtype") for part in settings_root.findall("./object/part")],
            ["normal_part", "normal_part"],
        )

    def test_converts_multipart_layer_height_overrides_to_world_z_ranges(self):
        config = default_config()
        config["process_config"]["layer_height"] = "0.8"
        config["machine_config"]["nozzle_diameter"] = ["1.0"]
        job = SliceJob(
            models=[
                UploadedModel("lower", "lower.stl", box_stl(0, 10)),
                UploadedModel("upper", "upper.stl", box_stl(0, 10), assembly_for="lower"),
            ],
            config=config,
            file_overrides={"upper": {"process_config": {"layer_height": "0.1"}}},
            transforms={
                "lower": {"position": {"x": 100, "y": 100, "z": 0}, "rotation": {"x": 0, "y": 0, "z": 0}},
                "upper": {"position": {"x": 100, "y": 100, "z": 10}, "rotation": {"x": 0, "y": 0, "z": 0}},
            },
        )

        archive = build_3mf(job)
        with zipfile.ZipFile(io.BytesIO(archive)) as package:
            ranges = ET.fromstring(package.read("Metadata/layer_config_ranges.xml"))
            settings = ET.fromstring(package.read("Metadata/model_settings.config"))

        layer_range = ranges.find("./object/range/option[@opt_key='layer_height']/..")
        if layer_range is None:
            self.fail("multipart layer-height range is missing")
        layer_option = layer_range.find("./option[@opt_key='layer_height']")
        if layer_option is None:
            self.fail("multipart layer-height option is missing")
        self.assertEqual((float(layer_range.get("min_z")), float(layer_range.get("max_z"))), (10.0, 20.0))
        self.assertEqual(layer_option.text, "0.1")
        part_layer_heights = settings.findall("./object/part/metadata[@key='layer_height']")
        self.assertEqual(part_layer_heights, [])

    def test_range_height_uses_logical_object_id_with_modifier(self):
        job = SliceJob(
            models=[
                UploadedModel("model-1", "part.stl", triangle_stl()),
                UploadedModel("modifier-1", "modifier.stl", triangle_stl(), modifier_for="model-1"),
            ],
            config=default_config(),
            transforms={},
            range_overrides={"model-1": [{
                "purpose": "variable_layer",
                "range": {"min_z": 1, "max_z": 5},
                "machine_config": {},
                "process_config": {"layer_height": "0.1"},
                "filament_config": {},
            }]},
        )

        archive = build_3mf(job)
        with zipfile.ZipFile(io.BytesIO(archive)) as package:
            ranges = ET.fromstring(package.read("Metadata/layer_config_ranges.xml"))

        self.assertEqual(ranges.find("./object").get("id"), "1")
        self.assertEqual(ranges.find("./object/range/option[@opt_key='layer_height']").text, "0.1")

    def test_rejects_overlapping_variable_layer_ranges(self):
        job = self.job()
        job.range_overrides = {"model-1": [
            {"range": {"min_z": 0, "max_z": 4}, "process_config": {"layer_height": "0.2"}, "machine_config": {}, "filament_config": {}},
            {"range": {"min_z": 3, "max_z": 6}, "process_config": {"layer_height": "0.1"}, "machine_config": {}, "filament_config": {}},
        ]}

        with self.assertRaisesRegex(ValueError, "must not overlap"):
            build_3mf(job)

    def test_scale_and_mirror_are_embedded_in_build_transform(self):
        job = self.job()
        job.transforms["model-1"]["scale"] = {"x": -2, "y": 1.5, "z": 1}
        archive = build_3mf(job)
        with zipfile.ZipFile(io.BytesIO(archive)) as package:
            model_xml = package.read("3D/3dmodel.model").decode()
        transform = model_xml.split('transform="', 1)[1].split('"', 1)[0]
        values = [float(value) for value in transform.split()]
        self.assertEqual(values[0], -2)
        self.assertEqual(values[4], 1.5)
        self.assertEqual(values[8], 1)

    def test_scale_and_mirror_are_applied_by_direct_mesh_transform(self):
        values = _build_affine_from_item_transform(
            {"position": {"x": 10, "y": 20}, "rotation": {"x": 0, "y": 0, "z": 0}, "scale": {"x": -2, "y": 1.5, "z": 3}},
            [(0, 0, 0), (2, 4, 6)],
            (0, 0),
        )
        self.assertEqual(values[:9], [-2, 0, 0, 0, 1.5, 0, 0, 0, 3])

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
