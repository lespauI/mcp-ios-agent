import pytest
from fastapi import HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.core.errors import MCPError, ResourceNotFoundError
from app.core.unified_errors import (
    ErrorConverter,
    UnifiedErrorResponse,
    unified_exception_handler,
    ErrorSource
)


def test_unified_error_response():
    """Test that UnifiedErrorResponse can be created and converted to HTTP and JSON-RPC formats"""
    # Create a unified error response
    error = UnifiedErrorResponse(
        status=404,
        error_code=-32800,
        message="Resource not found",
        detail={"uri": "resource://test.png"},
        source=ErrorSource.HTTP
    )
    
    # Convert to HTTP response
    http_response = error.to_http_response()
    assert isinstance(http_response, JSONResponse)
    assert http_response.status_code == 404
    
    # Check response content
    content = http_response.body.decode()
    assert '"error_code"' in content
    assert '-32800' in content
    assert '"message"' in content
    assert 'Resource not found' in content
    assert '"uri"' in content
    assert 'resource://test.png' in content
    
    # Convert to JSON-RPC error
    jsonrpc_error = error.to_jsonrpc_error(request_id="test-123")
    jsonrpc_dict = jsonrpc_error.model_dump()
    
    # Check JSON-RPC error structure
    assert jsonrpc_dict["id"] == "test-123"
    assert jsonrpc_dict["error"]["code"] == -32800
    assert jsonrpc_dict["error"]["message"] == "Resource not found"
    assert jsonrpc_dict["error"]["data"]["uri"] == "resource://test.png"


def test_error_converter_from_mcp_error():
    """Test that MCPError can be converted to UnifiedErrorResponse"""
    # Create an MCP error
    mcp_error = ResourceNotFoundError(uri="resource://test.png")
    
    # Convert to unified error
    unified_error = ErrorConverter.from_mcp_error(mcp_error)
    
    # Check converted error
    assert unified_error.status == 404
    assert unified_error.error_code == -32800
    assert "Resource not found" in unified_error.message
    assert unified_error.source == ErrorSource.JSONRPC


def test_error_converter_from_http_exception():
    """Test that HTTPException can be converted to UnifiedErrorResponse"""
    # Create an HTTP exception
    http_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required"
    )
    
    # Convert to unified error
    unified_error = ErrorConverter.from_http_exception(http_exc)
    
    # Check converted error
    assert unified_error.status == 401
    assert unified_error.error_code == -32000  # Authentication error
    assert unified_error.message == "Authentication required"
    assert unified_error.source == ErrorSource.HTTP


@pytest.mark.asyncio
async def test_unified_exception_handler_for_http():
    """Test unified_exception_handler for HTTP requests"""
    # Create a mock request
    class MockRequest:
        url = type('obj', (object,), {
            'path': '/api/v1/resources/something'
        })
        
        async def json(self):
            return {}
    
    # Create an exception
    exc = HTTPException(status_code=404, detail="Not found")
    
    # Handle exception
    response = await unified_exception_handler(MockRequest(), exc)
    
    # Check response
    assert response.status_code == 404
    content = response.body.decode()
    assert '"error_code"' in content
    assert '-32800' in content
    assert '"message"' in content
    assert 'Not found' in content


@pytest.mark.asyncio
async def test_unified_exception_handler_for_jsonrpc():
    """Test unified_exception_handler for JSON-RPC requests"""
    # Create a mock request
    class MockRequest:
        url = type('obj', (object,), {
            'path': '/api/v1/mcp/jsonrpc'
        })
        
        async def json(self):
            return {"id": "test-123", "jsonrpc": "2.0", "method": "test"}
    
    # Create an exception
    exc = ResourceNotFoundError(uri="resource://test.png")
    
    # Handle exception
    response = await unified_exception_handler(MockRequest(), exc)
    
    # Check response
    assert response.status_code == 200  # JSON-RPC always returns 200
    content = response.body.decode()
    assert '"jsonrpc"' in content
    assert '"id"' in content
    assert 'test-123' in content
    assert '"code"' in content
    assert '-32800' in content
    assert '"message"' in content
    assert 'Resource not found' in content
    assert 'resource://test.png' in content


def test_error_mapping():
    """Test error code mapping between HTTP and JSON-RPC"""
    from app.core.unified_errors import ErrorCodeMapping
    
    # HTTP to JSON-RPC
    assert ErrorCodeMapping.http_to_jsonrpc(400) == -32600
    assert ErrorCodeMapping.http_to_jsonrpc(404) == -32800
    assert ErrorCodeMapping.http_to_jsonrpc(401) == -32000
    assert ErrorCodeMapping.http_to_jsonrpc(422) == -32602
    
    # JSON-RPC to HTTP
    assert ErrorCodeMapping.jsonrpc_to_http(-32600) == 400
    assert ErrorCodeMapping.jsonrpc_to_http(-32800) == 404
    assert ErrorCodeMapping.jsonrpc_to_http(-32601) == 404
    assert ErrorCodeMapping.jsonrpc_to_http(-32000) == 401 