from fastapi import APIRouter, Depends, HTTPException, Header, Request, Response, BackgroundTasks
from fastapi.responses import JSONResponse
from typing import Optional, Dict, Any, Union, List
import json
import uuid
from app.models.jsonrpc import (
    JSONRPCRequest, JSONRPCResponse, JSONRPCSuccessResponse, 
    JSONRPCErrorResponse, JSONRPCErrorDetail, JSONRPCNotification,
    JSONRPCBatchRequest, JSONRPCBatchResponse
)
from app.core.errors import MCPError, InvalidRequestError, MethodNotFoundError, InvalidParamsError
from app.services.sse import sse_manager
from app.core.config import settings
from app.services.tool_registry import registry, register_tool, ToolParameter
from app.core.unified_errors import ErrorConverter, UnifiedErrorResponse

router = APIRouter()

# Map of supported MCP methods to their handlers
mcp_methods = {}


def register_method(method_name):
    """Decorator to register an MCP method handler"""
    def decorator(func):
        mcp_methods[method_name] = func
        return func
    return decorator


async def process_jsonrpc(request_data: Union[Dict[str, Any], List[Dict[str, Any]]]) -> JSONRPCResponse:
    """Process a JSON-RPC request and return a response"""
    # Handle batch requests
    if isinstance(request_data, list):
        if not request_data:
            return JSONRPCErrorResponse(
                id=None,
                error=JSONRPCErrorDetail(
                    code=-32600,
                    message="Invalid Request: empty batch"
                )
            )
        responses = []
        for item in request_data:
            resp = await process_single_jsonrpc(item)
            if resp:  # Skip None responses (notifications)
                responses.append(resp)
        return JSONRPCBatchResponse(root=responses) if responses else None
    
    # Handle single request
    return await process_single_jsonrpc(request_data)


async def process_single_jsonrpc(request_data: Dict[str, Any]) -> Optional[JSONRPCResponse]:
    """Process a single JSON-RPC request and return a response"""
    # Validate JSON-RPC structure
    if not isinstance(request_data, dict) or request_data.get("jsonrpc") != "2.0":
        return JSONRPCErrorResponse(
            id=None,
            error=JSONRPCErrorDetail(
                code=-32600,
                message="Invalid Request"
            )
        )
    
    # Extract request details
    method = request_data.get("method")
    if not method or not isinstance(method, str):
        return JSONRPCErrorResponse(
            id=request_data.get("id"),
            error=JSONRPCErrorDetail(
                code=-32600,
                message="Invalid Request: method must be a string"
            )
        )
    
    request_id = request_data.get("id")
    is_notification = request_id is None
    
    # Check if method exists
    if method not in mcp_methods:
        if is_notification:
            return None
        return JSONRPCErrorResponse(
            id=request_id,
            error=JSONRPCErrorDetail(
                code=-32601,
                message="Method not found"
            )
        )
    
    # Execute method
    try:
        params = request_data.get("params", {})
        handler = mcp_methods[method]
        result = await handler(params)
        
        if is_notification:
            return None
            
        return JSONRPCSuccessResponse(
            id=request_id,
            result=result
        )
    except MCPError as e:
        if is_notification:
            return None
            
        return JSONRPCErrorResponse(
            id=request_id,
            error=JSONRPCErrorDetail(
                code=e.code,
                message=e.message,
                data=e.data
            )
        )
    except Exception as e:
        if is_notification:
            return None
            
        return JSONRPCErrorResponse(
            id=request_id,
            error=JSONRPCErrorDetail(
                code=-32603,
                message=f"Internal error: {str(e)}"
            )
        )


@router.post("/jsonrpc")
async def handle_mcp_request(request: Request) -> JSONResponse:
    """Handle MCP requests via JSON-RPC"""
    # Check content type
    if request.headers.get("content-type") != "application/json":
        error_response = UnifiedErrorResponse(
            status=400,
            error_code=-32700,
            message="Content type must be application/json",
            detail=None,
            source="jsonrpc"
        )
        jsonrpc_error = error_response.to_jsonrpc_error()
        return JSONResponse(
            status_code=200,  # Always 200 for JSON-RPC
            content=jsonrpc_error.model_dump()
        )
    
    try:
        # Parse JSON request
        request_data = await request.json()
    except json.JSONDecodeError:
        error_response = UnifiedErrorResponse(
            status=400,
            error_code=-32700,
            message="Parse error: Invalid JSON",
            detail=None,
            source="jsonrpc"
        )
        jsonrpc_error = error_response.to_jsonrpc_error()
        return JSONResponse(
            status_code=200,  # Always 200 for JSON-RPC
            content=jsonrpc_error.model_dump()
        )
    
    # Process the JSON-RPC request
    try:
        response = await process_jsonrpc(request_data)
        return JSONResponse(
            status_code=200,  # Always 200 for JSON-RPC
            content=response.model_dump()
        )
    except MCPError as e:
        # Use our unified error converter
        error_response = ErrorConverter.from_mcp_error(e)
        jsonrpc_error = error_response.to_jsonrpc_error(
            request_id=request_data.get("id") if isinstance(request_data, dict) else None
        )
        return JSONResponse(
            status_code=200,  # Always 200 for JSON-RPC
            content=jsonrpc_error.model_dump()
        )


@router.get("/events/{client_id}")
async def mcp_events(request: Request, client_id: str, response: Response):
    """SSE endpoint for MCP events"""
    # Validate client ID
    if not client_id or not isinstance(client_id, str):
        raise HTTPException(status_code=400, detail="Invalid client ID")
    
    # Register the client (or use existing registration)
    await sse_manager.register_client(client_id)
    
    # Send an initial connection established event
    await sse_manager.send_event(
        client_id=client_id,
        data={"type": "connection_established"},
        event="system"
    )
    
    # Return the SSE response
    return sse_manager.event_source_response(request, client_id)


@router.get("/connect")
async def connect_sse():
    """Generate a new client ID for SSE connection"""
    client_id = str(uuid.uuid4())
    return {"client_id": client_id}


# Clean up when client disconnects
@router.on_event("shutdown")
async def shutdown_event():
    # Clean up all SSE clients
    for client_id in list(sse_manager.clients.keys()):
        await sse_manager.unregister_client(client_id)


@register_method("list_tools")
async def handle_list_tools(params):
    """List all available tools"""
    return registry.list_tools()


@register_method("execute_tool")
async def handle_execute_tool(params):
    """Execute a tool with parameters"""
    if not isinstance(params, dict):
        raise InvalidParamsError("Parameters must be an object")
        
    tool_name = params.get("name")
    tool_params = params.get("parameters", {})
    
    if not tool_name or not isinstance(tool_name, str):
        raise InvalidParamsError("Tool name is required")
        
    return await registry.execute_tool(tool_name, tool_params)


@register_method("echo")
async def handle_echo(params):
    """Echo back the message parameter"""
    if not isinstance(params, dict) or "message" not in params:
        raise InvalidParamsError("Message parameter is required")
    return {"message": params["message"]} 