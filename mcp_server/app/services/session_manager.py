import json
import uuid
import time
import asyncio
from typing import Dict, Any, Optional, List, Set
from datetime import datetime, timedelta
from redis.asyncio import Redis
from app.core.config import settings
import logging
import redis.asyncio as redis

logger = logging.getLogger(__name__)


class SessionManager:
    def __init__(self):
        self.redis_pool = None
        self.cleanup_task = None
        self.session_keys: Set[str] = set()
        self._redis_connection_attempts = 0
        self._max_redis_connection_attempts = 5
        
    async def connect(self):
        """Connect to Redis with connection pooling"""
        if self.redis_pool is not None:
            return
            
        try:
            # Create a connection pool with the settings
            redis_kwargs = settings.get_redis_connection_kwargs()
            self.redis_pool = redis.ConnectionPool(**redis_kwargs)
            
            # Test the connection
            async with redis.Redis(connection_pool=self.redis_pool) as r:
                await r.ping()
                
            logger.info(f"Connected to Redis at {settings.REDIS_HOST}:{settings.REDIS_PORT}")
            
            # Reset connection attempts on success
            self._redis_connection_attempts = 0
            
            # Start background cleanup task
            if self.cleanup_task is None:
                self.cleanup_task = asyncio.create_task(self.monitoring_task())
        except Exception as e:
            self._redis_connection_attempts += 1
            backoff = min(2 ** self._redis_connection_attempts, 60)  # Exponential backoff, max 60 seconds
            
            logger.error(f"Failed to connect to Redis: {str(e)}. Attempt {self._redis_connection_attempts}. Retrying in {backoff} seconds.")
            
            if self._redis_connection_attempts < self._max_redis_connection_attempts:
                # Schedule a retry
                asyncio.create_task(self._delayed_reconnect(backoff))
            else:
                logger.critical(f"Failed to connect to Redis after {self._redis_connection_attempts} attempts. Giving up.")
                raise
                
    async def _delayed_reconnect(self, delay: int):
        """Attempt reconnection after delay"""
        await asyncio.sleep(delay)
        await self.connect()
        
    async def disconnect(self):
        """Close Redis connection pool"""
        if self.redis_pool is not None:
            self.redis_pool.disconnect()
            self.redis_pool = None
            
        if self.cleanup_task is not None:
            self.cleanup_task.cancel()
            try:
                await self.cleanup_task
            except asyncio.CancelledError:
                pass
            self.cleanup_task = None
        
    async def create_session(
        self,
        metadata: Dict[str, Any] = None,
        ttl: int = None
    ) -> str:
        """Create a new session with optional metadata and TTL"""
        if self.redis_pool is None:
            await self.connect()
            
        session_id = str(uuid.uuid4())
        
        # Default TTL if not specified
        if ttl is None:
            ttl = settings.SESSION_TTL
            
        # Create session data
        session_data = {
            "id": session_id,
            "created_at": datetime.utcnow().isoformat(),
            "metadata": metadata or {},
            "context": {}
        }
        
        # Store in Redis
        try:
            async with redis.Redis(connection_pool=self.redis_pool) as r:
                # Store as JSON
                await r.set(
                    f"session:{session_id}", 
                    json.dumps(session_data),
                    ex=ttl if ttl > 0 else None
                )
                
                # Add to list of sessions
                await r.sadd("sessions", session_id)
                
                # Store in memory for quick access
                self.session_keys.add(session_id)
                
                logger.info(f"Created session {session_id} with TTL {ttl}")
                return session_id
        except Exception as e:
            logger.error(f"Error creating session: {str(e)}")
            raise
        
    async def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get session data by ID"""
        if self.redis_pool is None:
            await self.connect()
            
        try:
            async with redis.Redis(connection_pool=self.redis_pool) as r:
                session_data = await r.get(f"session:{session_id}")
                
                if not session_data:
                    logger.warning(f"Session not found: {session_id}")
                    return None
                    
                return json.loads(session_data)
        except Exception as e:
            logger.error(f"Error getting session {session_id}: {str(e)}")
            return None
        
    async def update_session(
        self,
        session_id: str,
        context: Dict[str, Any] = None,
        metadata: Dict[str, Any] = None,
        extend_ttl: bool = True
    ) -> bool:
        """Update session data and optionally extend TTL"""
        if self.redis_pool is None:
            await self.connect()
            
        try:
            async with redis.Redis(connection_pool=self.redis_pool) as r:
                # Get current session data
                session_data = await r.get(f"session:{session_id}")
                
                if not session_data:
                    logger.warning(f"Session not found for update: {session_id}")
                    return False
                    
                session = json.loads(session_data)
                
                # Update context if provided
                if context is not None:
                    if "context" not in session:
                        session["context"] = {}
                    session["context"].update(context)
                    
                # Update metadata if provided
                if metadata is not None:
                    if "metadata" not in session:
                        session["metadata"] = {}
                    session["metadata"].update(metadata)
                    
                # Update last accessed timestamp
                session["last_accessed"] = datetime.utcnow().isoformat()
                
                # Store updated session
                if extend_ttl:
                    ttl = settings.SESSION_TTL
                    await r.set(
                        f"session:{session_id}",
                        json.dumps(session),
                        ex=ttl
                    )
                    logger.debug(f"Extended TTL for session {session_id} by {ttl} seconds")
                else:
                    # Get remaining TTL
                    ttl = await r.ttl(f"session:{session_id}")
                    if ttl > 0:
                        await r.set(
                            f"session:{session_id}",
                            json.dumps(session),
                            ex=ttl
                        )
                    else:
                        await r.set(f"session:{session_id}", json.dumps(session))
                        
                return True
        except Exception as e:
            logger.error(f"Error updating session {session_id}: {str(e)}")
            return False
        
    async def delete_session(self, session_id: str) -> bool:
        """Delete a session by ID"""
        if self.redis_pool is None:
            await self.connect()
            
        try:
            async with redis.Redis(connection_pool=self.redis_pool) as r:
                # Delete session data
                await r.delete(f"session:{session_id}")
                
                # Remove from set of sessions
                await r.srem("sessions", session_id)
                
                # Remove from memory cache
                if session_id in self.session_keys:
                    self.session_keys.remove(session_id)
                    
                logger.info(f"Deleted session {session_id}")
                return True
        except Exception as e:
            logger.error(f"Error deleting session {session_id}: {str(e)}")
            return False
        
    async def list_sessions(self, pattern: str = "*") -> List[str]:
        """List session IDs matching pattern"""
        if self.redis_pool is None:
            await self.connect()
            
        try:
            async with redis.Redis(connection_pool=self.redis_pool) as r:
                if pattern == "*":
                    # Use the set for performance
                    return list(await r.smembers("sessions"))
                else:
                    # Need to search by pattern
                    keys = await r.keys(f"session:{pattern}")
                    return [k.split(":", 1)[1] for k in keys]
        except Exception as e:
            logger.error(f"Error listing sessions: {str(e)}")
            return []
        
    async def cleanup_expired_sessions(self) -> int:
        """Clean up expired sessions from memory cache"""
        if self.redis_pool is None:
            await self.connect()
            
        cleanup_count = 0
        
        try:
            async with redis.Redis(connection_pool=self.redis_pool) as r:
                # Check each session in our memory cache
                sessions_to_check = list(self.session_keys)
                expired_sessions = []
                
                for session_id in sessions_to_check:
                    # Check if session still exists
                    exists = await r.exists(f"session:{session_id}")
                    if not exists:
                        expired_sessions.append(session_id)
                        
                # Remove expired sessions from memory
                for session_id in expired_sessions:
                    self.session_keys.remove(session_id)
                    await r.srem("sessions", session_id)
                    cleanup_count += 1
                    
                if cleanup_count > 0:
                    logger.info(f"Cleaned up {cleanup_count} expired sessions")
                    
                return cleanup_count
        except Exception as e:
            logger.error(f"Error in session cleanup: {str(e)}")
            return 0
        
    async def session_heartbeat(self, session_id: str) -> bool:
        """Update session TTL without modifying data"""
        if self.redis_pool is None:
            await self.connect()
            
        try:
            async with redis.Redis(connection_pool=self.redis_pool) as r:
                # Check if session exists
                exists = await r.exists(f"session:{session_id}")
                if not exists:
                    return False
                    
                # Extend TTL
                await r.expire(f"session:{session_id}", settings.SESSION_TTL)
                return True
        except Exception as e:
            logger.error(f"Error in session heartbeat for {session_id}: {str(e)}")
            return False
        
    async def get_context(self, session_id: str, key: Optional[str] = None) -> Any:
        """Get session context or a specific context key"""
        session = await self.get_session(session_id)
        if not session:
            return None
            
        if "context" not in session:
            return {} if key is None else None
            
        if key is None:
            return session["context"]
            
        return session["context"].get(key)
        
    async def set_context(self, session_id: str, key: str, value: Any) -> bool:
        """Set a specific context key value"""
        return await self.update_session(session_id, context={key: value})
        
    async def monitoring_task(self) -> None:
        """Background task for monitoring sessions"""
        logger.info("Starting session monitoring task")
        
        while True:
            try:
                await self.cleanup_expired_sessions()
            except Exception as e:
                logger.error(f"Error in session monitoring task: {str(e)}")
                
            # Sleep interval
            await asyncio.sleep(settings.SESSION_CLEANUP_INTERVAL)


# Create a singleton instance
session_manager = SessionManager() 