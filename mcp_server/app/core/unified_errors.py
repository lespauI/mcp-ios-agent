from typing import Optional, Dict, Any, Union, Type
from fastapi import HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from enum import Enum

from app.core.errors import MCPError
from app.models.jsonrpc import JSONRPCErrorDetail, JSONRPCErrorResponse


class ErrorSource(str, Enum):
    """Identifies the source/protocol of an error"""
    HTTP = "http"
    JSONRPC = "jsonrpc"


class ErrorCodeMapping:
    """Maps between HTTP status codes and JSON-RPC error codes"""

    # Standard HTTP to JSON-RPC mappings
    HTTP_TO_JSONRPC = {
        status.HTTP_400_BAD_REQUEST: -32600,  # Invalid Request
        status.HTTP_404_NOT_FOUND: -32800,    # Resource not found
        status.HTTP_401_UNAUTHORIZED: -32000, # Authentication error
        status.HTTP_403_FORBIDDEN: -32001,    # Authorization error
        status.HTTP_422_UNPROCESSABLE_ENTITY: -32602, # Invalid params
        status.HTTP_500_INTERNAL_SERVER_ERROR: -32603, # Internal error
    }

    # JSON-RPC to HTTP mappings
    JSONRPC_TO_HTTP = {
        -32600: status.HTTP_400_BAD_REQUEST,  # Invalid Request
        -32601: status.HTTP_404_NOT_FOUND,    # Method not found
        -32602: status.HTTP_422_UNPROCESSABLE_ENTITY, # Invalid params
        -32603: status.HTTP_500_INTERNAL_SERVER_ERROR, # Internal error
        -32700: status.HTTP_400_BAD_REQUEST,  # Parse error
        -32800: status.HTTP_404_NOT_FOUND,    # Resource not found
        -32000: status.HTTP_401_UNAUTHORIZED, # Authentication error
        -32001: status.HTTP_403_FORBIDDEN,    # Authorization error
    }

    @classmethod
    def http_to_jsonrpc(cls, status_code: int) -> int:
        """Convert HTTP status code to JSON-RPC error code"""
        return cls.HTTP_TO_JSONRPC.get(status_code, -32603)  # Default to internal error

    @classmethod
    def jsonrpc_to_http(cls, error_code: int) -> int:
        """Convert JSON-RPC error code to HTTP status code"""
        return cls.JSONRPC_TO_HTTP.get(error_code, status.HTTP_500_INTERNAL_SERVER_ERROR)


class UnifiedErrorResponse(BaseModel):
    """
    Unified error response format that works for both HTTP and JSON-RPC
    
    For HTTP: This entire model becomes the response body
    For JSON-RPC: This is transformed into the JSON-RPC error format
    """
    status: int = Field(..., description="HTTP status code")
    error_code: int = Field(..., description="Error code (JSON-RPC compatible)")
    message: str = Field(..., description="Human-readable error message")
    detail: Optional[Dict[str, Any]] = Field(None, description="Additional error details")
    source: ErrorSource = Field(ErrorSource.HTTP, description="Error source")
    
    def to_http_response(self) -> JSONResponse:
        """Convert to FastAPI HTTP response"""
        return JSONResponse(
            status_code=self.status,
            content={
                "error_code": self.error_code,
                "message": self.message,
                "detail": self.detail,
            }
        )
    
    def to_jsonrpc_error(self, request_id: Optional[Union[str, int]] = None) -> JSONRPCErrorResponse:
        """Convert to JSON-RPC error response"""
        return JSONRPCErrorResponse(
            id=request_id,
            error=JSONRPCErrorDetail(
                code=self.error_code,
                message=self.message,
                data=self.detail
            )
        )


class ErrorConverter:
    """Utilities for converting between different error formats"""
    
    @classmethod
    def from_mcp_error(cls, error: MCPError, request_id: Optional[Union[str, int]] = None) -> UnifiedErrorResponse:
        """Convert MCPError to UnifiedErrorResponse"""
        return UnifiedErrorResponse(
            status=ErrorCodeMapping.jsonrpc_to_http(error.code),
            error_code=error.code,
            message=error.message,
            detail=error.data,
            source=ErrorSource.JSONRPC
        )
    
    @classmethod
    def from_http_exception(cls, exc: HTTPException) -> UnifiedErrorResponse:
        """Convert FastAPI HTTPException to UnifiedErrorResponse"""
        return UnifiedErrorResponse(
            status=exc.status_code,
            error_code=ErrorCodeMapping.http_to_jsonrpc(exc.status_code),
            message=str(exc.detail) if isinstance(exc.detail, str) else "HTTP Error",
            detail=exc.detail if not isinstance(exc.detail, str) else None,
            source=ErrorSource.HTTP
        )
    
    @classmethod
    def from_validation_error(cls, exc: Exception) -> UnifiedErrorResponse:
        """Convert Pydantic ValidationError to UnifiedErrorResponse"""
        return UnifiedErrorResponse(
            status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            error_code=-32602,  # Invalid params
            message="Validation Error",
            detail={"errors": getattr(exc, "errors", lambda: [])()},
            source=ErrorSource.HTTP
        )


async def unified_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Unified exception handler for both HTTP and JSON-RPC routes
    
    Determines the appropriate error format based on the request path
    """
    # Determine if this is a JSON-RPC request
    is_jsonrpc = "/api/v1/mcp/jsonrpc" in request.url.path
    
    if isinstance(exc, MCPError):
        # Handle MCP protocol errors
        error_response = ErrorConverter.from_mcp_error(exc)
        
        if is_jsonrpc:
            # For JSON-RPC, get the request ID from the body if possible
            request_id = None
            try:
                body = await request.json()
                request_id = body.get("id")
            except:
                pass
                
            # Return a JSON-RPC formatted error but with HTTP status 200
            jsonrpc_error = error_response.to_jsonrpc_error(request_id)
            return JSONResponse(
                status_code=200,  # Always 200 for JSON-RPC
                content=jsonrpc_error.model_dump()
            )
        else:
            # For REST API, return the HTTP status code
            return error_response.to_http_response()
    
    elif isinstance(exc, HTTPException):
        # Handle FastAPI HTTP exceptions
        error_response = ErrorConverter.from_http_exception(exc)
        
        if is_jsonrpc:
            # Convert to JSON-RPC error format but return 200 status
            jsonrpc_error = error_response.to_jsonrpc_error()
            return JSONResponse(
                status_code=200,  # Always 200 for JSON-RPC
                content=jsonrpc_error.model_dump()
            )
        else:
            return error_response.to_http_response()
            
    else:
        # Handle unexpected errors
        error_response = UnifiedErrorResponse(
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error_code=-32603,  # Internal error
            message="An unexpected error occurred",
            detail={"error": str(exc)},
            source=ErrorSource.HTTP
        )
        
        if is_jsonrpc:
            jsonrpc_error = error_response.to_jsonrpc_error()
            return JSONResponse(
                status_code=200,  # Always 200 for JSON-RPC
                content=jsonrpc_error.model_dump()
            )
        else:
            return error_response.to_http_response() 