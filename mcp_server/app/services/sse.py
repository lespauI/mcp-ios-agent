import asyncio
import json
from typing import Dict, Any, AsyncGenerator, Optional
from fastapi import Request
from sse_starlette.sse import EventSourceResponse
from app.core.config import settings


class SSEManager:
    def __init__(self):
        self.clients = {}
        
    async def register_client(self, client_id: str) -> str:
        """Register a new SSE client and return the client ID"""
        if client_id in self.clients:
            return client_id
            
        self.clients[client_id] = asyncio.Queue()
        return client_id
        
    async def unregister_client(self, client_id: str) -> None:
        """Unregister a client"""
        if client_id in self.clients:
            await self.clients[client_id].put(None)  # Signal to stop
            del self.clients[client_id]
    
    async def send_event(
        self, 
        client_id: str, 
        data: Dict[str, Any], 
        event: Optional[str] = None
    ) -> bool:
        """Send an event to a specific client"""
        if client_id not in self.clients:
            return False
            
        message = {"data": json.dumps(data)}
        if event:
            message["event"] = event
            
        await self.clients[client_id].put(message)
        return True
        
    async def broadcast(
        self, 
        data: Dict[str, Any], 
        event: Optional[str] = None,
        exclude: Optional[list] = None
    ) -> None:
        """Broadcast an event to all clients"""
        exclude = exclude or []
        for client_id in self.clients:
            if client_id not in exclude:
                await self.send_event(client_id, data, event)
    
    async def client_events(self, client_id: str) -> AsyncGenerator:
        """Generate events for a specific client"""
        if client_id not in self.clients:
            return
            
        queue = self.clients[client_id]
        while True:
            message = await queue.get()
            if message is None:  # Stop signal
                break
                
            yield message
            
    def event_source_response(self, request: Request, client_id: str) -> EventSourceResponse:
        """Create an EventSourceResponse for a client"""
        return EventSourceResponse(
            self.client_events(client_id),
            ping=settings.SSE_RETRY_TIMEOUT
        )


# Create a singleton SSE manager
sse_manager = SSEManager() 