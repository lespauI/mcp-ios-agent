import pytest
from app.core.errors import (
    MCPError, 
    InvalidRequestError,
    MethodNotFoundError,
    InvalidParamsError,
    InternalError,
    ParseError
)


def test_mcp_error_base():
    """Test the base MCPError class"""
    error = MCPError(code=1000, message="Test error", data={"detail": "test"})
    assert error.code == 1000
    assert error.message == "Test error"
    assert error.data == {"detail": "test"}
    assert str(error) == "Test error"


def test_invalid_request_error():
    """Test the InvalidRequestError class"""
    error = InvalidRequestError()
    assert error.code == -32600
    assert error.message == "Invalid Request"
    assert error.data is None
    
    # Test with custom message and data
    error = InvalidRequestError("Custom message", {"detail": "custom"})
    assert error.code == -32600
    assert error.message == "Custom message"
    assert error.data == {"detail": "custom"}


def test_method_not_found_error():
    """Test the MethodNotFoundError class"""
    error = MethodNotFoundError()
    assert error.code == -32601
    assert error.message == "Method not found"
    assert error.data is None


def test_invalid_params_error():
    """Test the InvalidParamsError class"""
    error = InvalidParamsError()
    assert error.code == -32602
    assert error.message == "Invalid params"
    assert error.data is None


def test_internal_error():
    """Test the InternalError class"""
    error = InternalError()
    assert error.code == -32603
    assert error.message == "Internal error"
    assert error.data is None


def test_parse_error():
    """Test the ParseError class"""
    error = ParseError()
    assert error.code == -32700
    assert error.message == "Parse error"
    assert error.data is None 