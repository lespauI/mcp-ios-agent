from fastapi import APIRouter, Depends, HTTPException, Body, Path
from typing import Dict, List, Optional, Any
from app.services.auth import auth_service, get_current_user, require_admin
from pydantic import BaseModel, EmailStr
import uuid

router = APIRouter()


class UserCreate(BaseModel):
    user_id: Optional[str] = None
    name: str
    email: EmailStr
    role: str = "user"


class ApiKeyResponse(BaseModel):
    api_key: str
    user_id: str
    role: str


@router.post("/keys", response_model=ApiKeyResponse)
async def create_api_key(
    user: UserCreate,
    admin_user: Dict[str, Any] = Depends(require_admin)
):
    """Create a new API key for a user (admin only)"""
    # Generate user ID if not provided
    user_id = user.user_id or str(uuid.uuid4())
    
    # Generate API key
    api_key = auth_service.generate_api_key(user_id, user.role)
    
    return {
        "api_key": api_key,
        "user_id": user_id,
        "role": user.role
    }


@router.delete("/keys/{api_key}")
async def revoke_api_key(
    api_key: str = Path(...),
    admin_user: Dict[str, Any] = Depends(require_admin)
):
    """Revoke an API key (admin only)"""
    success = auth_service.revoke_api_key(api_key)
    if not success:
        raise HTTPException(status_code=404, detail="API key not found")
        
    return {"success": True, "api_key": api_key}


@router.get("/me")
async def get_current_user_info(user: Dict[str, Any] = Depends(get_current_user)):
    """Get information about the current user"""
    return user


@router.post("/sessions/{session_id}/link")
async def link_session_to_user(
    session_id: str = Path(...),
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Link a session to the current user"""
    success = await auth_service.link_session_to_user(session_id, user["user_id"])
    if not success:
        raise HTTPException(status_code=404, detail="Session not found")
        
    return {"success": True, "session_id": session_id, "user_id": user["user_id"]}


@router.get("/sessions")
async def get_user_sessions(user: Dict[str, Any] = Depends(get_current_user)):
    """Get all sessions for the current user"""
    sessions = await auth_service.get_user_sessions(user["user_id"])
    return {"sessions": sessions, "count": len(sessions)} 