import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app
from app.usage import init_usage_db, update_session_sql


class UsageTest(unittest.TestCase):
    client = TestClient(app)

    @patch("app.main.usage_start_session")
    def test_start_session_accepts_uuid(self, start):
        response = self.client.post("/api/usage/session/start", json={"session_id": "550e8400-e29b-41d4-a716-446655440000"})

        self.assertEqual(response.status_code, 204)
        start.assert_called_once()

    def test_update_sql_keeps_the_largest_client_active_duration(self):
        self.assertIn("GREATEST(usage_sessions.active_seconds, EXCLUDED.active_seconds)", update_session_sql())
        self.assertIn("ON CONFLICT (id) DO UPDATE", update_session_sql())

    def test_usage_rejects_invalid_session_id(self):
        response = self.client.post("/api/usage/session/heartbeat", json={"session_id": "not-a-uuid", "active_seconds": 10})

        self.assertEqual(response.status_code, 422)

    @patch("app.usage.DATABASE_URL", "postgresql://unavailable")
    @patch("app.usage._connect", side_effect=OSError("database unavailable"))
    def test_database_unavailability_does_not_block_startup(self, _connect):
        init_usage_db()


if __name__ == "__main__":
    unittest.main()
