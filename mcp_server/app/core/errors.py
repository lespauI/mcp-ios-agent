from fastapi import HTTPException
from typing import Optional, Dict, Any


class MCPError(Exception):
    """Base class for MCP protocol errors"""
    def __init__(
        self, 
        code: int, 
        message: str, 
        data: Optional[Dict[str, Any]] = None
    ):
        self.code = code
        self.message = message
        self.data = data
        super().__init__(message)


class InvalidRequestError(MCPError):
    """Invalid JSON-RPC request"""
    def __init__(self, message: str = "Invalid Request", data: Optional[Dict[str, Any]] = None):
        super().__init__(code=-32600, message=message, data=data)


class MethodNotFoundError(MCPError):
    """Method not found"""
    def __init__(self, message: str = "Method not found", data: Optional[Dict[str, Any]] = None):
        super().__init__(code=-32601, message=message, data=data)


class InvalidParamsError(MCPError):
    """Invalid method parameters"""
    def __init__(self, message: str = "Invalid params", data: Optional[Dict[str, Any]] = None):
        super().__init__(code=-32602, message=message, data=data)


class InternalError(MCPError):
    """Internal JSON-RPC error"""
    def __init__(self, message: str = "Internal error", data: Optional[Dict[str, Any]] = None):
        super().__init__(code=-32603, message=message, data=data)


class ParseError(MCPError):
    """Parse error"""
    def __init__(self, message: str = "Parse error", data: Optional[Dict[str, Any]] = None):
        super().__init__(code=-32700, message=message, data=data)


# Resource-specific errors
class ResourceError(MCPError):
    def __init__(self, message: str = "Resource error", data: Optional[Dict[str, Any]] = None):
        super().__init__(code=-32800, message=message, data=data)


class ResourceNotFoundError(ResourceError):
    def __init__(self, uri: str, data: Optional[Dict[str, Any]] = None):
        message = f"Resource not found: {uri}"
        super().__init__(message=message, data=data)


class ResourceStorageError(ResourceError):
    def __init__(self, message: str = "Error storing resource", data: Optional[Dict[str, Any]] = None):
        super().__init__(message=message, data=data)


class ResourceMetadataError(ResourceError):
    def __init__(self, message: str = "Error with resource metadata", data: Optional[Dict[str, Any]] = None):
        super().__init__(message=message, data=data)


class ResourceUriParseError(ResourceError):
    def __init__(self, uri: str, data: Optional[Dict[str, Any]] = None):
        message = f"Invalid resource URI format: {uri}"
        super().__init__(message=message, data=data)


class ResourceQuotaExceededError(ResourceError):
    def __init__(self, size: int, max_size: int, data: Optional[Dict[str, Any]] = None):
        message = f"Resource size ({size} bytes) exceeds maximum allowed ({max_size} bytes)"
        super().__init__(message=message, data=data) 