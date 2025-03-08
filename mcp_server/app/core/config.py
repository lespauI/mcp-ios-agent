from typing import List, Dict, Any, Optional
from pydantic_settings import BaseSettings
from pydantic import validator, field_validator
import os
from functools import lru_cache
import json


class Settings(BaseSettings):
    # Application Info
    PROJECT_NAME: str = "MCP iOS Testing Server"
    API_V1_STR: str = "/api/v1"
    MCP_ENDPOINT: str = "/mcp"
    
    # Environment
    ENVIRONMENT: str = "development"
    
    # CORS
    BACKEND_CORS_ORIGINS: List[str] = ["*"]
    
    # Server settings
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    DEBUG: bool = False
    
    # Security
    SECRET_KEY: str = "CHANGE_THIS_IN_PRODUCTION"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 day
    ALGORITHM: str = "HS256"
    API_KEY_HEADER: str = "X-API-Key"
    API_KEY_MIN_LENGTH: int = 32
    
    # SSE settings
    SSE_RETRY_TIMEOUT: int = 3000  # milliseconds
    
    # Session settings
    SESSION_TTL: int = 60 * 60  # 1 hour
    SESSION_CLEANUP_INTERVAL: int = 300  # 5 minutes
    
    # Redis settings
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_DB: int = 0
    REDIS_PASSWORD: Optional[str] = None
    REDIS_POOL_SIZE: int = 20
    REDIS_MIN_CONNECTIONS: int = 5
    REDIS_IDLE_TIMEOUT: int = 60  # seconds
    
    # Resource settings
    MAX_RESOURCE_SIZE_BYTES: int = 100 * 1024 * 1024  # 100MB default limit
    RESOURCE_CLEANUP_INTERVAL_SECONDS: int = 300  # 5 minutes
    
    # Telemetry settings
    TELEMETRY_RETENTION_DAYS: int = 30
    ENABLE_DETAILED_METRICS: bool = True
    OPERATION_HISTORY_SIZE: int = 1000
    
    # Config files for different environments
    DEV_CONFIG_FILE: str = ".env.dev"
    TEST_CONFIG_FILE: str = ".env.test"
    PROD_CONFIG_FILE: str = ".env.prod"
    
    class Config:
        env_file = ".env"
        env_file_encoding = 'utf-8'
        case_sensitive = True
        
        @classmethod
        def customise_sources(cls, init_settings, env_settings, file_secret_settings):
            """Customize the settings sources to include environment-specific config"""
            env = os.getenv("ENVIRONMENT", "development")
            env_file = ".env"
            
            if env == "development":
                env_file = cls.DEV_CONFIG_FILE if os.path.exists(cls.DEV_CONFIG_FILE) else ".env"
            elif env == "testing":
                env_file = cls.TEST_CONFIG_FILE if os.path.exists(cls.TEST_CONFIG_FILE) else ".env"
            elif env == "production":
                env_file = cls.PROD_CONFIG_FILE if os.path.exists(cls.PROD_CONFIG_FILE) else ".env"
            
            cls.env_file = env_file
            return init_settings, env_settings, file_secret_settings
    
    @field_validator("BACKEND_CORS_ORIGINS", mode='before')
    def assemble_cors_origins(cls, v: Any) -> List[str]:
        """Parse CORS origins from string or list"""
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        elif isinstance(v, str) and v.startswith("["):
            # Handle JSON string
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                raise ValueError(f"Invalid JSON format for CORS origins: {v}")
        elif isinstance(v, list):
            return v
        raise ValueError(v)
    
    def get_redis_connection_kwargs(self) -> Dict[str, Any]:
        """Get Redis connection parameters including pool configuration"""
        return {
            "host": self.REDIS_HOST,
            "port": self.REDIS_PORT,
            "db": self.REDIS_DB,
            "password": self.REDIS_PASSWORD,
            "encoding": "utf-8",
            "decode_responses": True,
            "max_connections": self.REDIS_POOL_SIZE,
            "retry_on_timeout": True
        }

@lru_cache()
def get_settings():
    """Cached settings instance to avoid reloading"""
    return Settings()

# Create a global settings instance
settings = get_settings() 