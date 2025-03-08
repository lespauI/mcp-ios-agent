import pytest
from pydantic import ValidationError
from app.models.jsonrpc import (
    JSONRPCBaseRequest,
    JSONRPCRequest,
    JSONRPCNotification,
    JSONRPCSuccessResponse,
    JSONRPCErrorDetail,
    JSONRPCErrorResponse,
    JSONRPCBatchRequest,
    JSONRPCBatchResponse
)


def test_jsonrpc_base_request():
    """Test the JSONRPCBaseRequest model"""
    # Test with id
    request = JSONRPCBaseRequest(id="123")
    assert request.jsonrpc == "2.0"
    assert request.id == "123"
    
    # Test without id (should generate UUID)
    request = JSONRPCBaseRequest()
    assert request.jsonrpc == "2.0"
    assert request.id is not None  # Auto-generated UUID
    
    # Test with numeric id
    request = JSONRPCBaseRequest(id=456)
    assert request.id == 456


def test_jsonrpc_request():
    """Test the JSONRPCRequest model"""
    # Test with all fields
    request = JSONRPCRequest(
        id="123",
        method="test_method",
        params={"key": "value"}
    )
    assert request.jsonrpc == "2.0"
    assert request.id == "123"
    assert request.method == "test_method"
    assert request.params == {"key": "value"}
    
    # Test with required fields only
    request = JSONRPCRequest(method="test_method")
    assert request.jsonrpc == "2.0"
    assert request.id is not None  # Auto-generated UUID
    assert request.method == "test_method"
    assert request.params is None


def test_jsonrpc_notification():
    """Test the JSONRPCNotification model"""
    # Test with all fields
    notification = JSONRPCNotification(
        method="test_method",
        params={"key": "value"}
    )
    assert notification.jsonrpc == "2.0"
    assert notification.method == "test_method"
    assert notification.params == {"key": "value"}
    
    # Test with required fields only
    notification = JSONRPCNotification(method="test_method")
    assert notification.jsonrpc == "2.0"
    assert notification.method == "test_method"
    assert notification.params is None


def test_jsonrpc_success_response():
    """Test the JSONRPCSuccessResponse model"""
    # Test with result
    response = JSONRPCSuccessResponse(
        id="123",
        result={"status": "success"}
    )
    assert response.jsonrpc == "2.0"
    assert response.id == "123"
    assert response.result == {"status": "success"}
    
    # Test with default result (None)
    response = JSONRPCSuccessResponse(id="123")
    assert response.jsonrpc == "2.0"
    assert response.id == "123"
    assert response.result is None


def test_jsonrpc_error_detail():
    """Test the JSONRPCErrorDetail model"""
    # Test with all fields
    error = JSONRPCErrorDetail(
        code=-32600,
        message="Invalid request",
        data={"detail": "test"}
    )
    assert error.code == -32600
    assert error.message == "Invalid request"
    assert error.data == {"detail": "test"}
    
    # Test with required fields only
    error = JSONRPCErrorDetail(code=-32600, message="Invalid request")
    assert error.code == -32600
    assert error.message == "Invalid request"
    assert error.data is None


def test_jsonrpc_error_response():
    """Test the JSONRPCErrorResponse model"""
    error_detail = JSONRPCErrorDetail(
        code=-32600,
        message="Invalid request"
    )
    
    response = JSONRPCErrorResponse(
        id="123",
        error=error_detail
    )
    
    assert response.jsonrpc == "2.0"
    assert response.id == "123"
    assert response.error.code == -32600
    assert response.error.message == "Invalid request"


def test_jsonrpc_batch_request():
    """Test the JSONRPCBatchRequest model"""
    # Test with multiple requests
    batch = JSONRPCBatchRequest([
        JSONRPCRequest(id="1", method="method1"),
        JSONRPCRequest(id="2", method="method2"),
        JSONRPCNotification(method="notification1")
    ])
    assert len(batch.root) == 3


def test_jsonrpc_batch_response():
    """Test the JSONRPCBatchResponse model"""
    # Test with multiple responses
    batch = JSONRPCBatchResponse([
        JSONRPCSuccessResponse(id="1", result={"status": "success1"}),
        JSONRPCSuccessResponse(id="2", result={"status": "success2"}),
        JSONRPCErrorResponse(id="3", error=JSONRPCErrorDetail(code=-32600, message="Error"))
    ])
    assert len(batch.root) == 3 