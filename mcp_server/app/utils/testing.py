import json
import time
import asyncio
from typing import Dict, Any, Optional, List, Union
from app.models.jsonrpc import JSONRPCRequest
import httpx
import logging

logger = logging.getLogger(__name__)


class MCPTestClient:
    """Client for testing MCP API endpoints"""
    
    def __init__(self, base_url: str, api_key: Optional[str] = None):
        self.base_url = base_url
        self.api_key = api_key
        self.client_id = None
        self.event_stream = None
        
    async def connect(self) -> str:
        """Connect to the MCP server and get a client ID"""
        async with httpx.AsyncClient() as client:
            headers = {}
            if self.api_key:
                headers[settings.API_KEY_HEADER] = self.api_key
                
            response = await client.get(f"{self.base_url}/api/v1/mcp/connect", headers=headers)
            response.raise_for_status()
            
            data = response.json()
            self.client_id = data["client_id"]
            return self.client_id
            
    async def call_method(self, method: str, params: Any = None) -> Dict[str, Any]:
        """Call an MCP method"""
        if not self.client_id:
            await self.connect()
            
        request = JSONRPCRequest(
            method=method,
            params=params
        )
        
        async with httpx.AsyncClient() as client:
            headers = {"Content-Type": "application/json"}
            if self.api_key:
                headers[settings.API_KEY_HEADER] = self.api_key
                
            response = await client.post(
                f"{self.base_url}/api/v1/mcp",
                headers=headers,
                json=request.dict()
            )
            response.raise_for_status()
            
            return response.json()
            
    async def list_tools(self) -> List[Dict[str, Any]]:
        """List all available tools"""
        response = await self.call_method("list_tools")
        return response.get("result", [])
        
    async def execute_tool(self, name: str, parameters: Dict[str, Any] = None) -> Any:
        """Execute a tool"""
        response = await self.call_method(
            "execute_tool", 
            {"name": name, "parameters": parameters or {}}
        )
        return response.get("result")
        
    async def listen_events(self, callback: callable):
        """Listen for SSE events"""
        if not self.client_id:
            await self.connect()
            
        async with httpx.AsyncClient(timeout=None) as client:
            headers = {}
            if self.api_key:
                headers[settings.API_KEY_HEADER] = self.api_key
                
            url = f"{self.base_url}/api/v1/mcp/events/{self.client_id}"
            async with client.stream("GET", url, headers=headers) as response:
                response.raise_for_status()
                
                async for line in response.aiter_lines():
                    if line.startswith("data:"):
                        data = json.loads(line[5:].strip())
                        await callback(data)
                        
    async def create_session(self, metadata: Dict[str, Any] = None) -> str:
        """Create a new session"""
        async with httpx.AsyncClient() as client:
            headers = {"Content-Type": "application/json"}
            if self.api_key:
                headers[settings.API_KEY_HEADER] = self.api_key
                
            response = await client.post(
                f"{self.base_url}/api/v1/sessions/create",
                headers=headers,
                json={"metadata": metadata}
            )
            response.raise_for_status()
            
            data = response.json()
            return data["session_id"]
            
    async def upload_resource(
        self, 
        file_path: str, 
        resource_type: str, 
        metadata: Dict[str, Any] = None,
        ttl: Optional[int] = None
    ) -> str:
        """Upload a file as a resource"""
        async with httpx.AsyncClient() as client:
            headers = {}
            if self.api_key:
                headers[settings.API_KEY_HEADER] = self.api_key
                
            with open(file_path, "rb") as f:
                files = {"file": f}
                data = {
                    "resource_type": resource_type,
                }
                
                if metadata:
                    data["metadata"] = json.dumps(metadata)
                    
                if ttl is not None:
                    data["ttl"] = str(ttl)
                    
                response = await client.post(
                    f"{self.base_url}/api/v1/resources/upload",
                    headers=headers,
                    files=files,
                    data=data
                )
                response.raise_for_status()
                
                data = response.json()
                return data["uri"] 