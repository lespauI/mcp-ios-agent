from fastapi import APIRouter, Depends, HTTPException, Query, Path, Body
from typing import Dict, List, Optional, Any
from app.services.session_manager import session_manager
import uuid

router = APIRouter()


@router.post("/create")
async def create_session(
    metadata: Optional[Dict[str, Any]] = Body(None),
    ttl: Optional[int] = Body(None)
):
    """Create a new session"""
    session_id = await session_manager.create_session(metadata=metadata, ttl=ttl)
    return {"session_id": session_id}


@router.get("/{session_id}")
async def get_session(
    session_id: str = Path(...),
    context_only: bool = Query(False)
):
    """Get session data"""
    if context_only:
        context = await session_manager.get_context(session_id)
        if context is None:
            raise HTTPException(status_code=404, detail="Session not found")
        return context
    
    session = await session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    return session


@router.put("/{session_id}")
async def update_session(
    session_id: str = Path(...),
    context: Optional[Dict[str, Any]] = Body(None),
    metadata: Optional[Dict[str, Any]] = Body(None)
):
    """Update session data"""
    success = await session_manager.update_session(
        session_id=session_id,
        context=context,
        metadata=metadata
    )
    
    if not success:
        raise HTTPException(status_code=404, detail="Session not found")
        
    return {"success": True, "session_id": session_id}


@router.delete("/{session_id}")
async def delete_session(session_id: str = Path(...)):
    """Delete a session"""
    success = await session_manager.delete_session(session_id)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found")
        
    return {"success": True, "session_id": session_id}


@router.post("/{session_id}/heartbeat")
async def session_heartbeat(session_id: str = Path(...)):
    """Send a heartbeat to keep the session alive"""
    success = await session_manager.session_heartbeat(session_id)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found")
        
    return {"success": True, "session_id": session_id}


@router.get("/{session_id}/context/{key}")
async def get_context_value(
    session_id: str = Path(...),
    key: str = Path(...)
):
    """Get a specific context value from a session"""
    value = await session_manager.get_context(session_id, key)
    if value is None and not await session_manager.get_session(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
        
    return {key: value}


@router.put("/{session_id}/context/{key}")
async def set_context_value(
    session_id: str = Path(...),
    key: str = Path(...),
    value: Any = Body(...)
):
    """Set a specific context value in a session"""
    success = await session_manager.set_context(session_id, key, value)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found")
        
    return {"success": True, "session_id": session_id, "key": key}


@router.get("/list")
async def list_sessions(pattern: str = Query("*")):
    """List all sessions matching a pattern"""
    sessions = await session_manager.list_sessions(pattern)
    return {"sessions": sessions, "count": len(sessions)} 