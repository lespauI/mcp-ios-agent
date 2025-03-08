import pytest
from app.core.config import settings


def test_settings_default_values():
    """Test the default configuration values"""
    assert settings.PROJECT_NAME == "MCP iOS Testing Server"
    assert settings.API_V1_STR == "/api/v1"
    assert settings.MCP_ENDPOINT == "/mcp"
    assert settings.HOST == "0.0.0.0"
    assert settings.PORT == 8000
    assert settings.SESSION_TTL == 60 * 60  # 1 hour
    assert settings.SSE_RETRY_TIMEOUT == 3000  # milliseconds 