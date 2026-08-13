import io
import json
import struct
import unittest
import xml.etree.ElementTree as ET
import zipfile
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import app, prefill_rate_events
from app.engine import build_3mf


def triangle_stl() -> bytes:
    header = b"standalone-api-test".ljust(80, b"\0")
    triangle = struct.pack("<12fH", 0, 0, 1, 0, 0, 0, 20, 0, 0, 0, 20, 0, 0)
    return header + struct.pack("<I", 1) + triangle


class ApiTest(unittest.TestCase):
    client = TestClient(app)

    def manifest(self):
        return {
            "models": [{"id": "model-1", "name": "triangle.stl"}],
            "config": {"machine_config": {}, "process_config": {}, "filament_config": {}},
            "fileOverrides": {},
            "rangeOverrides": {},
            "transforms": {},
            "customGcodeForZ": [],
            "startPositions": {},
        }

    def test_default_config_is_available_without_session(self):
        response = self.client.get("/api/default-config")
        self.assertEqual(response.status_code, 200)
        self.assertIn("machine_config", response.json())
        self.assertIn("layer_height", response.json()["process_config"])

    @patch("app.main.slice_job", return_value=b"; transient output\n")
    def test_slice_returns_attachment(self, mocked_slice):
        response = self.client.post(
            "/api/slice",
            data={"manifest": json.dumps(self.manifest())},
            files={"models": ("triangle.stl", io.BytesIO(triangle_stl()), "application/octet-stream")},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b"; transient output\n")
        self.assertIn("triangle.gcode", response.headers["content-disposition"])
        self.assertEqual(mocked_slice.call_args.args[0].models[0].file_id, "model-1")

    @patch("app.main.build_3mf", wraps=build_3mf)
    def test_export_project_returns_native_orca_3mf(self, mocked_builder):
        manifest = self.manifest()
        manifest["config"]["process_config"]["layer_height"] = "0.4"
        response = self.client.post(
            "/api/export-project",
            data={"manifest": json.dumps(manifest), "fileName": "Bracket project"},
            files={"models": ("triangle.stl", io.BytesIO(triangle_stl()), "application/octet-stream")},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "model/3mf")
        self.assertIn("Bracket_project.3mf", response.headers["content-disposition"])
        with zipfile.ZipFile(io.BytesIO(response.content)) as package:
            self.assertIn("3D/3dmodel.model", package.namelist())
            self.assertIn("Metadata/project_settings.config", package.namelist())
            project_settings = json.loads(package.read("Metadata/project_settings.config"))
            self.assertEqual(project_settings["layer_height"], "0.4")
        mocked_builder.assert_called_once()

    def test_export_project_writes_object_layer_height_on_object_not_part(self):
        manifest = self.manifest()
        manifest["fileOverrides"] = {
            "model-1": {"process_config": {"layer_height": "0.4"}},
        }
        response = self.client.post(
            "/api/export-project",
            data={"manifest": json.dumps(manifest)},
            files={"models": ("triangle.stl", io.BytesIO(triangle_stl()), "application/octet-stream")},
        )
        self.assertEqual(response.status_code, 200)
        with zipfile.ZipFile(io.BytesIO(response.content)) as package:
            root = ET.fromstring(package.read("Metadata/model_settings.config"))
        obj = root.find("./object")
        self.assertIsNotNone(obj)
        object_values = {item.get("key"): item.get("value") for item in obj.findall("./metadata")}
        part_values = {item.get("key"): item.get("value") for item in obj.findall("./part/metadata")}
        self.assertEqual(object_values.get("layer_height"), "0.4")
        self.assertNotIn("layer_height", part_values)

    def test_export_project_rejects_layer_height_above_nozzle_diameter(self):
        manifest = self.manifest()
        manifest["config"]["machine_config"]["nozzle_diameter"] = ["0.6"]
        manifest["config"]["process_config"]["layer_height"] = "1.4"
        response = self.client.post(
            "/api/export-project",
            data={"manifest": json.dumps(manifest)},
            files={"models": ("triangle.stl", io.BytesIO(triangle_stl()), "application/octet-stream")},
        )
        self.assertEqual(response.status_code, 422)
        self.assertIn("cannot exceed nozzle diameter", response.json()["detail"])

    def test_export_project_rejects_object_layer_height_above_nozzle_diameter(self):
        manifest = self.manifest()
        manifest["config"]["machine_config"]["nozzle_diameter"] = ["0.6"]
        manifest["fileOverrides"] = {
            "model-1": {"process_config": {"layer_height": "1.4"}},
        }
        response = self.client.post(
            "/api/export-project",
            data={"manifest": json.dumps(manifest)},
            files={"models": ("triangle.stl", io.BytesIO(triangle_stl()), "application/octet-stream")},
        )
        self.assertEqual(response.status_code, 422)
        self.assertIn("Object model-1 layer height 1.4 mm", response.json()["detail"])

    def test_export_project_rejects_duplicate_model_ids(self):
        manifest = self.manifest()
        manifest["models"].append({"id": "model-1", "name": "second.stl"})
        response = self.client.post(
            "/api/export-project",
            data={"manifest": json.dumps(manifest)},
            files=[
                ("models", ("triangle.stl", io.BytesIO(triangle_stl()), "application/octet-stream")),
                ("models", ("second.stl", io.BytesIO(triangle_stl()), "application/octet-stream")),
            ],
        )
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["detail"], "Model IDs must be unique")

    def test_rejects_unsupported_model(self):
        manifest = self.manifest()
        manifest["models"][0]["name"] = "model.obj"
        response = self.client.post(
            "/api/slice",
            data={"manifest": json.dumps(manifest)},
            files={"models": ("model.obj", b"not a model", "application/octet-stream")},
        )
        self.assertEqual(response.status_code, 415)

    @patch("app.main.apply_enhancement", return_value="; enhanced\n")
    def test_enhance_returns_session_gcode_attachment(self, mocked_enhance):
        response = self.client.post(
            "/api/enhance",
            data={"operation": "coast_final_layer"},
            files={"gcode": ("part.gcode", b"; source\n", "text/x-gcode")},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b"; enhanced\n")
        self.assertIn("part.gcode", response.headers["content-disposition"])
        mocked_enhance.assert_called_once_with("; source\n", "coast_final_layer")

    def test_enhance_rejects_unknown_operation(self):
        response = self.client.post(
            "/api/enhance",
            data={"operation": "unknown"},
            files={"gcode": ("part.gcode", b"; source\n", "text/x-gcode")},
        )
        self.assertEqual(response.status_code, 422)

    @patch("app.main.generate_slicer_recommendation", new_callable=AsyncMock)
    def test_prefill_settings_stays_behind_api(self, mocked_recommendation):
        mocked_recommendation.return_value = {
            "intent_summary": "Strong bracket",
            "confidence": 0.9,
            "assumptions": [],
            "process_config": {"layer_height": "0.2"},
            "filament_config": {"nozzle_temperature": "245"},
            "machine_config": {"nozzle_diameter": "0.6"},
            "warnings": [],
            "user_specified_overrides": [],
        }
        config = {"machine_config": {"nozzle_diameter": ["0.6"]}, "process_config": {}, "filament_config": {"filament_type": ["PETG"]}}
        response = self.client.post("/api/prefill-settings", json={"description": "Strong bracket", "config": config})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["process_config"]["layer_height"], "0.2")
        mocked_recommendation.assert_awaited_once_with("Strong bracket", config)

    def test_prefill_rejects_blank_and_oversized_descriptions(self):
        config = {"machine_config": {}, "process_config": {}, "filament_config": {}}
        self.assertEqual(self.client.post("/api/prefill-settings", json={"description": "   ", "config": config}).status_code, 422)
        self.assertEqual(self.client.post("/api/prefill-settings", json={"description": "x" * 2001, "config": config}).status_code, 422)

    @patch("app.main.PREFILL_RATE_LIMIT", 1)
    @patch("app.main.generate_slicer_recommendation", new_callable=AsyncMock, return_value={})
    def test_prefill_rate_limits_api_spend(self, mocked_recommendation):
        prefill_rate_events.clear()
        config = {"machine_config": {}, "process_config": {}, "filament_config": {}}
        payload = {"description": "A bracket", "config": config}
        self.assertEqual(self.client.post("/api/prefill-settings", json=payload).status_code, 200)
        response = self.client.post("/api/prefill-settings", json=payload)
        self.assertEqual(response.status_code, 429)
        self.assertIn("retry-after", response.headers)
        mocked_recommendation.assert_awaited_once()
        prefill_rate_events.clear()


if __name__ == "__main__":
    unittest.main()
