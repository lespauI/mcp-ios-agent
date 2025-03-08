import unittest
from unittest.mock import patch, MagicMock
from app.services.auth import AuthService

class TestAuthService(unittest.TestCase):
    def setUp(self):
        self.auth_service = AuthService()

    def test_generate_api_key(self):
        user_id = "user123"
        api_key = self.auth_service.generate_api_key(user_id)
        self.assertIsInstance(api_key, str)

    def test_validate_api_key(self):
        user_id = "user123"
        api_key = self.auth_service.generate_api_key(user_id)
        user_info = self.auth_service.validate_api_key(api_key)
        self.assertIsNotNone(user_info)
        self.assertEqual(user_info["user_id"], user_id)

    def test_revoke_api_key(self):
        user_id = "user123"
        api_key = self.auth_service.generate_api_key(user_id)
        result = self.auth_service.revoke_api_key(api_key)
        self.assertTrue(result)
        user_info = self.auth_service.validate_api_key(api_key)
        self.assertIsNone(user_info)

    def test_create_access_token(self):
        data = {"sub": "user123"}
        token = self.auth_service.create_access_token(data)
        self.assertIsInstance(token, str)

    def test_decode_token(self):
        data = {"sub": "user123"}
        token = self.auth_service.create_access_token(data)
        decoded_data = self.auth_service.decode_token(token)
        self.assertIsNotNone(decoded_data)
        self.assertEqual(decoded_data["sub"], "user123")

    def test_check_permission(self):
        user_info = {"role": "developer"}
        self.assertTrue(self.auth_service.check_permission(user_info, "developer"))
        self.assertFalse(self.auth_service.check_permission(user_info, "admin"))

    @patch("app.services.auth.session_manager")
    async def test_link_session_to_user(self, mock_session_manager):
        mock_session_manager.set_context = MagicMock(return_value=True)
        result = await self.auth_service.link_session_to_user("session123", "user123")
        self.assertTrue(result)

    @patch("app.services.auth.session_manager")
    async def test_get_user_sessions(self, mock_session_manager):
        mock_session_manager.list_sessions = MagicMock(return_value=["session123"])
        sessions = await self.auth_service.get_user_sessions("user123")
        self.assertIn("session123", sessions)

if __name__ == "__main__":
    unittest.main() 