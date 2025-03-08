import unittest
import asyncio
from fastapi.testclient import TestClient
from app.api.routes.sessions import router
from app.services.session_manager import session_manager
import pytest

class TestSessionsAPI(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(router)

    @pytest.mark.asyncio
    async def test_create_session(self):
        session_id = await session_manager.create_session()
        response = self.client.post(f"/{session_id}")
        self.assertEqual(response.status_code, 200)
        self.assertIn("session_id", response.json())

    @pytest.mark.asyncio
    async def test_get_session(self):
        session_id = await session_manager.create_session()
        response = self.client.get(f"/{session_id}")
        self.assertEqual(response.status_code, 200)
        self.assertIn("id", response.json())

    @pytest.mark.asyncio
    async def test_update_session(self):
        session_id = await session_manager.create_session()
        response = self.client.put(f"/{session_id}", json={"context": {"key": "value"}})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json())

    @pytest.mark.asyncio
    async def test_delete_session(self):
        session_id = await session_manager.create_session()
        response = self.client.delete(f"/{session_id}")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json())

    @pytest.mark.asyncio
    async def test_session_heartbeat(self):
        session_id = await session_manager.create_session()
        response = self.client.post(f"/{session_id}/heartbeat")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json())

    @pytest.mark.asyncio
    async def test_get_context_value(self):
        session_id = await session_manager.create_session()
        await session_manager.set_context(session_id, "key", "value")
        response = self.client.get(f"/{session_id}/context/key")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), "value")

    @pytest.mark.asyncio
    async def test_set_context_value(self):
        session_id = await session_manager.create_session()
        response = self.client.put(f"/{session_id}/context/key", json="new_value")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json())

    @pytest.mark.asyncio
    async def test_list_sessions(self):
        session_id = await session_manager.create_session()
        response = self.client.get("/list")
        self.assertEqual(response.status_code, 200)
        self.assertIn(session_id, response.json())

if __name__ == "__main__":
    unittest.main() 