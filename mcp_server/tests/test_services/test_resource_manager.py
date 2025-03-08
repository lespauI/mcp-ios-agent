import pytest
import os
import json
from io import BytesIO
from datetime import datetime, timedelta
from app.services.resource_manager import ResourceManager
from fastapi import UploadFile
from unittest.mock import patch, MagicMock, AsyncMock


@pytest.fixture
def test_resource_manager(temp_storage_dir):
    """Create a test resource manager"""
    return ResourceManager(storage_path=temp_storage_dir)


async def test_resource_uri_generation(test_resource_manager):
    """Test generation of resource URIs"""
    # Test with a binary file
    content = b"test binary content"
    resource_type = "test_type"
    
    # Create a mock UploadFile
    mock_file = MagicMock(spec=UploadFile)
    mock_file.read = AsyncMock(return_value=content)
    mock_file.seek = AsyncMock()
    mock_file.filename = "test.bin"
    
    # Store the resource
    uri = await test_resource_manager.store_binary(
        content=mock_file,
        resource_type=resource_type
    )
    
    # Check that the URI is correctly formatted
    assert uri.startswith("resource://")
    assert resource_type in uri
    
    # Extract the resource ID
    resource_id = uri.split('/')[-1]
    assert len(resource_id) > 0


async def test_resource_storage_and_retrieval(test_resource_manager):
    """Test storing and retrieving resources"""
    # Test data
    content = b"test binary content"
    resource_type = "test_type"
    metadata = {"test_key": "test_value"}
    
    # Create a mock UploadFile
    mock_file = MagicMock(spec=UploadFile)
    mock_file.read = AsyncMock(return_value=content)
    mock_file.seek = AsyncMock()
    mock_file.filename = "test.bin"
    
    # Store the resource
    uri = await test_resource_manager.store_binary(
        content=mock_file,
        resource_type=resource_type,
        metadata=metadata
    )
    
    # Retrieve the resource
    retrieved_content = await test_resource_manager.get_binary(uri)
    retrieved_metadata = await test_resource_manager.get_metadata(uri)
    
    # Check the content and metadata
    assert retrieved_content == content
    assert retrieved_metadata["test_key"] == "test_value"
    assert retrieved_metadata["type"] == resource_type


async def test_resource_deletion(test_resource_manager):
    """Test deleting resources"""
    # Store a resource
    content = b"test binary content"
    resource_type = "test_type"
    
    # Create a mock UploadFile
    mock_file = MagicMock(spec=UploadFile)
    mock_file.read = AsyncMock(return_value=content)
    mock_file.seek = AsyncMock()
    mock_file.filename = "test.bin"
    
    uri = await test_resource_manager.store_binary(
        content=mock_file,
        resource_type=resource_type
    )
    
    # Verify the resource exists
    assert await test_resource_manager.get_binary(uri) is not None
    
    # Delete the resource
    success = await test_resource_manager.delete_resource(uri)
    assert success
    
    # Verify the resource is deleted
    assert await test_resource_manager.get_binary(uri) is None
    assert await test_resource_manager.get_metadata(uri) is None


async def test_resource_ttl_and_expiry(test_resource_manager):
    """Test resource TTL and expiry functionality"""
    # Store a resource with a short TTL
    content = b"test binary content"
    resource_type = "test_type"
    ttl = 1  # 1 second
    
    # Create a mock UploadFile
    mock_file = MagicMock(spec=UploadFile)
    mock_file.read = AsyncMock(return_value=content)
    mock_file.seek = AsyncMock()
    mock_file.filename = "test.bin"
    
    uri = await test_resource_manager.store_binary(
        content=mock_file,
        resource_type=resource_type,
        ttl=ttl
    )
    
    # Check the expiry time
    metadata = await test_resource_manager.get_metadata(uri)
    assert "expires_at" in metadata
    
    # Set the expiry to a past time
    test_resource_manager.metadata[uri]["expiry"] = datetime.now() - timedelta(seconds=10)
    
    # Clean up expired resources
    count = await test_resource_manager.clean_expired_resources()
    assert count == 1
    
    # Verify the resource is deleted
    assert await test_resource_manager.get_binary(uri) is None 