import pytest
import json
from fastapi.testclient import TestClient
from app.services.tool_registry import registry, register_tool, ToolParameter


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


# Register a mock tool for testing
@register_tool(
    name="example_tool",
    description="A mock tool for testing",
    parameters=[ToolParameter(name="param1", type="string", required=True, description="A sample parameter")],
    returns={"status": "string", "param1": "string"}
)
async def example_tool(param1: str) -> dict:
    return {"status": "success", "param1": param1}


def test_execute_tool(test_client):
    """Test the execute_tool method via JSON-RPC"""
    # Create a valid request for execute_tool
    payload = {
        "jsonrpc": "2.0",
        "method": "execute_tool",
        "params": {
            "name": "example_tool",
            "parameters": {"param1": "value1"}
        },
        "id": 1
    }
    response = test_client.post("/mcp/jsonrpc", json=payload)
    
    assert response.status_code == 200
    data = response.json()
    assert "result" in data
    assert data["result"] is not None
    assert data["result"]["status"] == "success"
    assert data["result"]["param1"] == {"param1": "value1"} 