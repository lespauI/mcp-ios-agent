import unittest
import asyncio
from unittest.mock import patch
from app.services.session_manager import session_manager

class TestSessionManager(unittest.TestCase):
    async def asyncSetUp(self):
        await session_manager.connect()

    async def asyncTearDown(self):
        await session_manager.disconnect()

    async def test_get_context(self):
        session_id = await session_manager.create_session()
        context = await session_manager.get_context(session_id)
        self.assertEqual(context, {})

        await session_manager.set_context(session_id, "key1", "value1")
        context = await session_manager.get_context(session_id)
        self.assertEqual(context, {"key1": "value1"})

        specific_value = await session_manager.get_context(session_id, "key1")
        self.assertEqual(specific_value, "value1")

    async def test_set_context(self):
        session_id = await session_manager.create_session()
        result = await session_manager.set_context(session_id, "key2", "value2")
        self.assertTrue(result)

        context = await session_manager.get_context(session_id)
        self.assertEqual(context, {"key2": "value2"})

    async def test_update_session(self):
        session_id = await session_manager.create_session()
        result = await session_manager.update_session(session_id, context={"key3": "value3"}, metadata={"meta1": "data1"})
        self.assertTrue(result)

        session_data = await session_manager.get_session(session_id)
        self.assertEqual(session_data["context"], {"key3": "value3"})
        self.assertEqual(session_data["metadata"], {"meta1": "data1"})

    async def test_session_heartbeat(self):
        session_id = await session_manager.create_session()
        result = await session_manager.session_heartbeat(session_id)
        self.assertTrue(result)

    async def test_create_session_with_short_ttl(self):
        session_id = await session_manager.create_session(ttl=1)
        await asyncio.sleep(2)
        session_data = await session_manager.get_session(session_id)
        self.assertIsNone(session_data)

    async def test_delete_nonexistent_session(self):
        result = await session_manager.delete_session("nonexistent")
        self.assertFalse(result)

    async def test_cleanup_expired_sessions(self):
        session_id = await session_manager.create_session(ttl=1)
        await asyncio.sleep(2)
        cleanup_count = await session_manager.cleanup_expired_sessions()
        self.assertEqual(cleanup_count, 1)

    @patch("app.services.session_manager.logger")
    async def test_connect_failure(self, mock_logger):
        with patch("app.services.session_manager.redis.Redis.ping", side_effect=Exception("Connection failed")):
            with self.assertRaises(Exception):
                await session_manager.connect()
            mock_logger.error.assert_called_with("Failed to connect to Redis: Connection failed. Attempt 1. Retrying in 2 seconds.")

if __name__ == "__main__":
    asyncio.run(unittest.main()) 