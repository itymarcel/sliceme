import io
import json
import struct
import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import app, prefill_rate_events


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
