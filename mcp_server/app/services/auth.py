import jwt
import secrets
import time
from datetime import datetime, timedelta
from typing import Dict, Optional, Any, List
from fastapi import Depends, HTTPException, Security
from fastapi.security import APIKeyHeader
from app.core.config import settings
from app.services.session_manager import session_manager
import logging

logger = logging.getLogger(__name__)

# Setup API key header scheme
api_key_header = APIKeyHeader(name=settings.API_KEY_HEADER, auto_error=False)


class AuthService:
    def __init__(self):
        # In a production environment, these would be stored in a database
        self.api_keys = {}
        self.user_roles = {}
        
    def generate_api_key(self, user_id: str, role: str = "user") -> str:
        """Generate a new API key for a user"""
        # Create a random API key
        api_key = secrets.token_urlsafe(settings.API_KEY_MIN_LENGTH)
        
        # Store the key
        self.api_keys[api_key] = {
            "user_id": user_id,
            "created_at": datetime.now().isoformat(),
            "last_used": None
        }
        
        # Store the role
        self.user_roles[user_id] = role
        
        logger.info(f"Generated API key for user {user_id} with role {role}")
        return api_key
        
    def validate_api_key(self, api_key: str) -> Optional[Dict[str, Any]]:
        """Validate an API key and return user info"""
        if api_key not in self.api_keys:
            return None
            
        # Update last used
        self.api_keys[api_key]["last_used"] = datetime.now().isoformat()
        
        user_id = self.api_keys[api_key]["user_id"]
        role = self.user_roles.get(user_id, "user")
        
        return {
            "user_id": user_id,
            "role": role,
            "key_created_at": self.api_keys[api_key]["created_at"]
        }
        
    def revoke_api_key(self, api_key: str) -> bool:
        """Revoke an API key"""
        if api_key not in self.api_keys:
            return False
            
        del self.api_keys[api_key]
        return True
        
    def create_access_token(
        self,
        data: Dict[str, Any],
        expires_delta: Optional[timedelta] = None
    ) -> str:
        """Create a JWT access token"""
        to_encode = data.copy()
        
        # Set expiration
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
            
        to_encode.update({"exp": expire})
        
        # Create token
        encoded_jwt = jwt.encode(
            to_encode, 
            settings.SECRET_KEY, 
            algorithm=settings.ALGORITHM
        )
        
        return encoded_jwt
        
    def decode_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Decode and validate a JWT token"""
        try:
            payload = jwt.decode(
                token,
                settings.SECRET_KEY,
                algorithms=[settings.ALGORITHM]
            )
            return payload
        except jwt.PyJWTError:
            return None
            
    def check_permission(self, user_info: Dict[str, Any], required_role: str) -> bool:
        """Check if a user has the required role/permission"""
        user_role = user_info.get("role", "user")
        
        # Simple role hierarchy: admin > developer > user
        if user_role == "admin":
            return True
            
        if user_role == "developer" and required_role in ["developer", "user"]:
            return True
            
        if user_role == "user" and required_role == "user":
            return True
            
        return False
        
    async def link_session_to_user(self, session_id: str, user_id: str) -> bool:
        """Link a session to a user"""
        return await session_manager.update_session(
            session_id=session_id,
            metadata={"user_id": user_id}
        )
        
    async def get_user_sessions(self, user_id: str) -> List[str]:
        """Get all sessions for a user"""
        all_sessions = await session_manager.list_sessions()
        user_sessions = []
        
        for session_id in all_sessions:
            session = await session_manager.get_session(session_id)
            if session and session.get("metadata", {}).get("user_id") == user_id:
                user_sessions.append(session_id)
                
        return user_sessions


# Create a singleton instance
auth_service = AuthService()


# Dependency to get the current user from API key
async def get_current_user(api_key: str = Security(api_key_header)):
    if not api_key:
        raise HTTPException(
            status_code=401,
            detail="API key required",
            headers={"WWW-Authenticate": "ApiKey"},
        )
        
    user_info = auth_service.validate_api_key(api_key)
    if not user_info:
        raise HTTPException(
            status_code=401,
            detail="Invalid API key",
            headers={"WWW-Authenticate": "ApiKey"},
        )
        
    return user_info


# Dependency to require admin role
async def require_admin(user_info: Dict[str, Any] = Depends(get_current_user)):
    if not auth_service.check_permission(user_info, "admin"):
        raise HTTPException(
            status_code=403,
            detail="Insufficient permissions. Admin role required."
        )
    return user_info


# Dependency to require developer role
async def require_developer(user_info: Dict[str, Any] = Depends(get_current_user)):
    if not auth_service.check_permission(user_info, "developer"):
        raise HTTPException(
            status_code=403,
            detail="Insufficient permissions. Developer role required."
        )
    return user_info 