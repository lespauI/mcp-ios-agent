import pytest
from app.core.errors import (
    ResourceError,
    ResourceNotFoundError,
    ResourceStorageError,
    ResourceMetadataError,
    ResourceUriParseError,
    ResourceQuotaExceededError
)

def test_resource_error_base():
    """Test the base ResourceError class"""
    error = ResourceError("Test resource error")
    assert error.code == -32800
    assert error.message == "Test resource error"
    assert error.data is None
    
    # With data
    data = {"resource_type": "screenshot"}
    error = ResourceError("Test with data", data)
    assert error.data == data

def test_resource_not_found_error():
    """Test ResourceNotFoundError"""
    uri = "resource://screenshot/abc123.png"
    error = ResourceNotFoundError(uri)
    assert error.code == -32800  # Inherits from ResourceError
    assert "Resource not found" in error.message
    assert uri in error.message
    
    # With additional data
    data = {"attempt": 2}
    error = ResourceNotFoundError(uri, data)
    assert error.data == data

def test_resource_storage_error():
    """Test ResourceStorageError"""
    error = ResourceStorageError()
    assert error.code == -32800
    assert error.message == "Error storing resource"
    
    # With custom message
    custom_msg = "Failed to write file due to disk full"
    error = ResourceStorageError(custom_msg)
    assert error.message == custom_msg

def test_resource_metadata_error():
    """Test ResourceMetadataError"""
    error = ResourceMetadataError()
    assert error.code == -32800
    assert error.message == "Error with resource metadata"
    
    # With custom message and data
    custom_msg = "Invalid metadata format"
    data = {"field": "created_at", "value": "invalid-date"}
    error = ResourceMetadataError(custom_msg, data)
    assert error.message == custom_msg
    assert error.data == data

def test_resource_uri_parse_error():
    """Test ResourceUriParseError"""
    invalid_uri = "invalid://format"
    error = ResourceUriParseError(invalid_uri)
    assert error.code == -32800
    assert "Invalid resource URI format" in error.message
    assert invalid_uri in error.message

def test_resource_quota_exceeded_error():
    """Test ResourceQuotaExceededError"""
    size = 200 * 1024 * 1024  # 200MB
    max_size = 100 * 1024 * 1024  # 100MB
    error = ResourceQuotaExceededError(size, max_size)
    assert error.code == -32800
    assert "Resource size" in error.message
    assert "exceeds maximum allowed" in error.message
    
    # Verify the message includes the sizes
    assert str(size) in error.message
    assert str(max_size) in error.message 