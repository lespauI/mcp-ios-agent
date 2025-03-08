import pytest
import json
from fastapi.testclient import TestClient


def test_connect(test_client):
    """Test the connect endpoint"""
    response = test_client.get("/mcp/connect")
    
    assert response.status_code == 200
    data = response.json()
    assert "client_id" in data
    assert data["client_id"] is not None


def test_jsonrpc_endpoint(test_client):
    """Test the JSON-RPC endpoint"""
    # Create a valid request
    payload = {
        "jsonrpc": "2.0",
        "id": "test-1",
        "method": "echo",
        "params": {"message": "test message"}
    }
    
    response = test_client.post(
        "/mcp/jsonrpc",
        json=payload
    )
    
    assert response.status_code == 200
    data = response.json()
    
    assert data["jsonrpc"] == "2.0"
    assert data["id"] == "test-1"
    assert "result" in data


def test_jsonrpc_method_not_found(test_client):
    """Test JSON-RPC with non-existent method"""
    # Create a request with non-existent method
    payload = {
        "jsonrpc": "2.0",
        "id": "test-1",
        "method": "non_existent_method",
        "params": {}
    }
    
    response = test_client.post(
        "/mcp/jsonrpc",
        json=payload
    )
    
    assert response.status_code == 200  # Still 200 for JSON-RPC errors
    data = response.json()
    
    assert data["jsonrpc"] == "2.0"
    assert data["id"] == "test-1"
    assert "error" in data
    assert data["error"]["code"] == -32601  # Method not found error code
    assert data["error"]["message"] == "Method not found"


def test_jsonrpc_batch_request(test_client):
    """Test JSON-RPC batch request"""
    # Create a batch request
    payload = [
        {
            "jsonrpc": "2.0",
            "id": "test-1",
            "method": "echo",
            "params": {"message": "test message 1"}
        },
        {
            "jsonrpc": "2.0",
            "id": "test-2",
            "method": "echo",
            "params": {"message": "test message 2"}
        }
    ]
    
    response = test_client.post(
        "/mcp/jsonrpc",
        json=payload
    )
    
    assert response.status_code == 200
    data = response.json()
    
    assert isinstance(data, list)
    assert len(data) == 2
    assert data[0]["id"] == "test-1"
    assert data[1]["id"] == "test-2" 