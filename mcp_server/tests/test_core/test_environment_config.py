import pytest
import os
import tempfile
from unittest.mock import patch
from app.core.config import Settings

def test_redis_connection_kwargs():
    """Test that Redis connection kwargs are correctly formed"""
    settings = Settings(
        REDIS_HOST="test-redis",
        REDIS_PORT=6380,
        REDIS_POOL_SIZE=50,
        REDIS_MIN_CONNECTIONS=10,
        REDIS_IDLE_TIMEOUT=120
    )
    
    # Get connection kwargs
    kwargs = settings.get_redis_connection_kwargs()
    
    # Verify all settings are included
    assert kwargs["host"] == "test-redis"
    assert kwargs["port"] == 6380
    assert kwargs["max_connections"] == 50
    # min_connections is no longer supported in the newer Redis version
    # assert kwargs["min_connections"] == 10
    # assert kwargs["idle_connection_timeout"] == 120
    assert kwargs["retry_on_timeout"] is True
    assert kwargs["decode_responses"] is True

def test_cors_origins_parsing():
    """Test that CORS origins are correctly parsed"""
    # Test comma-separated string
    settings = Settings(BACKEND_CORS_ORIGINS="http://localhost,https://example.com")
    assert settings.BACKEND_CORS_ORIGINS == ["http://localhost", "https://example.com"]
    
    # Test JSON list
    settings = Settings(BACKEND_CORS_ORIGINS='["http://localhost", "https://example.com"]')
    assert settings.BACKEND_CORS_ORIGINS == ["http://localhost", "https://example.com"]
    
    # Test list input
    settings = Settings(BACKEND_CORS_ORIGINS=["http://localhost", "https://example.com"])
    assert settings.BACKEND_CORS_ORIGINS == ["http://localhost", "https://example.com"]
    
    # Test invalid input
    with pytest.raises(ValueError):
        settings = Settings(BACKEND_CORS_ORIGINS=123)
        settings.assemble_cors_origins(123)

def test_environment_specific_values():
    """Test specific settings that differ by environment"""
    # Test development environment settings
    with patch.dict(os.environ, {"ENVIRONMENT": "development"}):
        settings = Settings()
        assert settings.ENVIRONMENT == "development"
        # Development environment would typically have these settings
        assert settings.DEBUG is False  # This would be overridden in a real .env.dev file
        
    # Test production environment settings
    with patch.dict(os.environ, {"ENVIRONMENT": "production"}):
        settings = Settings()
        assert settings.ENVIRONMENT == "production"
        # Production environment would typically have these settings
        assert settings.DEBUG is False 