import pytest
import asyncio
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient
from app.main import app
import os
import tempfile
import shutil
from app.services.resource_manager import resource_manager
from app.services.session_manager import session_manager
from app.services.tool_registry import registry
from app.services.auth import auth_service


@pytest.fixture
def test_client():
    """Create a test client for the FastAPI app"""
    with TestClient(app) as client:
        yield client


@pytest.fixture
def event_loop():
    """Create an event loop for async tests"""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def mock_redis():
    """Mock Redis connection for testing"""
    with patch("aioredis.from_url") as mock_redis:
        mock_conn = AsyncMock()
        mock_redis.return_value = mock_conn
        
        # Mock Redis methods
        mock_conn.get = AsyncMock(return_value=None)
        mock_conn.set = AsyncMock(return_value=True)
        mock_conn.delete = AsyncMock(return_value=1)
        mock_conn.expire = AsyncMock(return_value=True)
        mock_conn.keys = AsyncMock(return_value=[])
        
        yield mock_conn


@pytest.fixture
async def mock_session_manager(mock_redis):
    """Mock session manager for testing"""
    # Connect to mock Redis
    session_manager.redis = mock_redis
    
    # Add a test session
    test_session_id = "test-session-123"
    test_session_data = {
        "id": test_session_id,
        "created_at": "2023-01-01T00:00:00Z",
        "expires_at": "2099-01-01T00:00:00Z",
        "metadata": {"test": True},
        "context": {"key1": "value1"}
    }
    
    mock_redis.get.side_effect = lambda key: (
        json.dumps(test_session_data).encode() if key == f"{session_manager.prefix}{test_session_id}" else None
    )
    
    yield session_manager
    
    # Reset the session manager
    session_manager.redis = None


@pytest.fixture
def temp_storage_dir():
    """Create a temporary directory for resource storage"""
    temp_dir = tempfile.mkdtemp()
    original_storage_path = resource_manager.storage_path
    
    # Set the resource manager to use the temp directory
    resource_manager.storage_path = temp_dir
    resource_manager.ensure_storage_dir()
    
    yield temp_dir
    
    # Clean up
    shutil.rmtree(temp_dir)
    resource_manager.storage_path = original_storage_path


@pytest.fixture
def test_api_key():
    """Create a test API key for authentication"""
    test_user_id = "test-user-123"
    test_api_key = "test-api-key-123456789"
    
    # Add the test key to the auth service
    auth_service.api_keys[test_api_key] = {
        "user_id": test_user_id,
        "created_at": "2023-01-01T00:00:00Z",
        "last_used": None
    }
    
    # Set a role for the test user
    auth_service.user_roles[test_user_id] = "admin"
    
    yield test_api_key
    
    # Clean up
    if test_api_key in auth_service.api_keys:
        del auth_service.api_keys[test_api_key]
    if test_user_id in auth_service.user_roles:
        del auth_service.user_roles[test_user_id] 