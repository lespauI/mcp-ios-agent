import pytest
import asyncio
from unittest.mock import patch, MagicMock, AsyncMock
from app.services.session_manager import SessionManager
from app.core.config import settings

@pytest.fixture
def mock_redis_pool():
    """Mock for Redis ConnectionPool"""
    pool = MagicMock()
    pool.disconnect = MagicMock()
    return pool

@pytest.fixture
def mock_redis_client():
    """Mock for Redis client with connection pool"""
    client = AsyncMock()
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=None)
    client.ping = AsyncMock(return_value=True)
    client.set = AsyncMock(return_value=True)
    client.get = AsyncMock(return_value=None)
    client.keys = AsyncMock(return_value=[])
    client.delete = AsyncMock(return_value=1)
    client.exists = AsyncMock(return_value=1)
    client.expire = AsyncMock(return_value=True)
    client.sadd = AsyncMock(return_value=1)
    client.srem = AsyncMock(return_value=1)
    client.smembers = AsyncMock(return_value=set())
    client.ttl = AsyncMock(return_value=3600)
    return client

@pytest.mark.asyncio
async def test_connection_pooling(mock_redis_pool, mock_redis_client):
    """Test Redis connection pooling in SessionManager"""
    with patch('redis.asyncio.ConnectionPool', return_value=mock_redis_pool) as mock_pool_class, \
         patch('redis.asyncio.Redis', return_value=mock_redis_client) as mock_redis_class:
        
        session_manager = SessionManager()
        
        # Connect to Redis
        await session_manager.connect()
        
        # Verify pool was created with correct settings
        mock_pool_class.assert_called_once()
        pool_kwargs = mock_pool_class.call_args[1]
        
        # Check pool configuration
        assert pool_kwargs['host'] == settings.REDIS_HOST
        assert pool_kwargs['port'] == settings.REDIS_PORT
        assert 'max_connections' in pool_kwargs
        # min_connections is no longer supported in the newer Redis version
        # assert 'min_connections' in pool_kwargs
        assert 'decode_responses' in pool_kwargs
        
        # Verify ping was called to test connection
        mock_redis_client.ping.assert_called_once()
        
        # Verify Redis client uses the pool
        mock_redis_class.assert_called_with(connection_pool=mock_redis_pool)
        
        # Disconnect
        await session_manager.disconnect()
        
        # Verify pool disconnected
        mock_redis_pool.disconnect.assert_called_once()

@pytest.mark.asyncio
async def test_connection_retry_logic():
    """Test connection retry logic with exponential backoff"""
    with patch('redis.asyncio.ConnectionPool') as mock_pool_class, \
         patch('redis.asyncio.Redis') as mock_redis_class, \
         patch('asyncio.sleep', new_callable=AsyncMock) as mock_sleep, \
         patch('asyncio.create_task') as mock_create_task:

        # Create a Redis client that fails on first ping but succeeds on second
        mock_redis = AsyncMock()
        mock_redis.__aenter__ = AsyncMock(return_value=mock_redis)
        mock_redis.__aexit__ = AsyncMock(return_value=None)

        # Set up ping to fail on first call but succeed on second
        ping_responses = [Exception("Connection refused"), True]
        mock_redis.ping = AsyncMock(side_effect=ping_responses)
        mock_redis_class.return_value = mock_redis

        session_manager = SessionManager()

        # Reduce max attempts for testing
        session_manager._max_redis_connection_attempts = 3

        # Connect (should retry after failure)
        await session_manager.connect()

        # Verify ping was called once (the first attempt)
        assert mock_redis.ping.call_count == 1
        
        # Verify that a retry task was created
        mock_create_task.assert_called_once()

@pytest.mark.asyncio
async def test_max_retry_exceeded():
    """Test behavior when max retry attempts are exceeded"""
    with patch('redis.asyncio.ConnectionPool') as mock_pool_class, \
         patch('redis.asyncio.Redis') as mock_redis_class, \
         patch('asyncio.sleep', new_callable=AsyncMock) as mock_sleep, \
         patch('asyncio.create_task') as mock_create_task:

        # Create a Redis client that always fails on ping
        mock_redis = AsyncMock()
        mock_redis.__aenter__ = AsyncMock(return_value=mock_redis)
        mock_redis.__aexit__ = AsyncMock(return_value=None)
        mock_redis.ping = AsyncMock(side_effect=Exception("Connection refused"))
        mock_redis_class.return_value = mock_redis

        session_manager = SessionManager()

        # Set max attempts to 1 for testing (so it fails immediately)
        session_manager._max_redis_connection_attempts = 1

        # Connect (should fail after 1 attempt)
        with pytest.raises(Exception, match="Connection refused"):
            await session_manager.connect()
            
        # Verify ping was called once
        assert mock_redis.ping.call_count == 1
        
        # Verify that no retry task was created (since we reached max attempts)
        mock_create_task.assert_not_called()

@pytest.mark.asyncio
async def test_session_operations_use_pool(mock_redis_pool, mock_redis_client):
    """Test that session operations use the connection pool efficiently"""
    with patch('redis.asyncio.ConnectionPool', return_value=mock_redis_pool) as mock_pool_class, \
         patch('redis.asyncio.Redis', return_value=mock_redis_client) as mock_redis_class:
        
        session_manager = SessionManager()
        await session_manager.connect()
        
        # Reset call counts
        mock_redis_class.reset_mock()
        
        # Execute multiple operations
        await session_manager.create_session({"test": "data"})
        session_id = "test-session-id"
        await session_manager.get_session(session_id)
        await session_manager.update_session(session_id, {"key": "value"})
        await session_manager.delete_session(session_id)
        
        # Verify Redis client was created multiple times but with the same pool
        assert mock_redis_class.call_count == 4  # One for each operation
        for call in mock_redis_class.call_args_list:
            assert call[1]['connection_pool'] == mock_redis_pool

@pytest.mark.asyncio
async def test_cleanup_task_uses_pool(mock_redis_pool, mock_redis_client):
    """Test that the cleanup task uses the connection pool"""
    with patch('redis.asyncio.ConnectionPool', return_value=mock_redis_pool) as mock_pool_class, \
         patch('redis.asyncio.Redis', return_value=mock_redis_client) as mock_redis_class, \
         patch('asyncio.sleep', new_callable=AsyncMock) as mock_sleep:
        
        # Make sleep terminate after one call to allow task to complete
        mock_sleep.side_effect = [None, asyncio.CancelledError()]
        
        session_manager = SessionManager()
        await session_manager.connect()
        
        # Reset call counts
        mock_redis_class.reset_mock()
        
        # Run one iteration of the monitoring task
        try:
            await session_manager.monitoring_task()
        except asyncio.CancelledError:
            pass
        
        # Verify Redis client was created for the cleanup operation
        assert mock_redis_class.call_count >= 1
        for call in mock_redis_class.call_args_list:
            assert call[1]['connection_pool'] == mock_redis_pool 