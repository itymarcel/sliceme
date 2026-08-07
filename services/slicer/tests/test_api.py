import io
import json
import struct
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app


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


if __name__ == "__main__":
    unittest.main()
