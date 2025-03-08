import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from app.services.telemetry import TelemetryService

@pytest.fixture
def mock_require_developer():
    """Mock the require_developer dependency"""
    return lambda: {"user_id": "test_user", "role": "developer"}

@pytest.fixture
def patched_app(mock_require_developer):
    """Create a test client with patched dependencies"""
    # Import here to avoid circular imports
    from app.main import app
    from app.api.routes.telemetry import require_developer
    from app.services.telemetry import telemetry_service
    
    # Store original dependencies
    original_require_developer = require_developer
    original_operations = telemetry_service.operations
    
    # Replace dependencies
    app.dependency_overrides[require_developer] = mock_require_developer
    
    # Reset telemetry operations to an empty dict for testing
    telemetry_service.operations = {}
    
    # Create test client
    client = TestClient(app)
    
    # Return client for testing
    yield client
    
    # Restore original dependencies
    app.dependency_overrides.pop(require_developer, None)
    telemetry_service.operations = original_operations

def test_get_metrics(patched_app):
    """Test getting telemetry metrics"""
    # Mock the telemetry service to return specific metrics
    mock_metrics = {
        "request_count": 42,
        "operation_count": 100,
        "error_count": 5,
        "active_connections": 10,
        "active_sessions": 20,
        "tools": {
            "test_tool": {
                "execution_count": 30,
                "success_rate": 0.9,
                "average_execution_time": 0.123
            }
        }
    }
    
    with patch('app.services.telemetry.telemetry_service.get_metrics', return_value=mock_metrics):
        # Call the endpoint
        response = patched_app.get("/telemetry/metrics")
        
        # Check the response
        assert response.status_code == 200
        data = response.json()
        assert data == mock_metrics

def test_list_operations(patched_app):
    """Test listing operations"""
    # Import here to avoid circular imports
    from app.services.telemetry import telemetry_service
    
    # Setup test data
    test_operations = {
        "op1": {
            "id": "op1",
            "type": "test_op",
            "status": "completed",
            "start_time": 1620000000,
            "duration": 0.5
        },
        "op2": {
            "id": "op2",
            "type": "another_op",
            "status": "error",
            "start_time": 1620001000,
            "duration": 1.2
        }
    }
    
    # Set the operations directly on the service
    telemetry_service.operations = test_operations.copy()
    
    # Call the endpoint
    response = patched_app.get("/telemetry/operations")
    
    # Check the response
    assert response.status_code == 200
    data = response.json()
    assert "operations" in data
    assert "count" in data
    
    # Check that our test operations are in the response
    # We can't check for exact equality because the middleware adds the current request
    operations_by_id = {op["id"]: op for op in data["operations"]}
    for op_id, op_data in test_operations.items():
        assert op_id in operations_by_id, f"Operation {op_id} not found in response"
        response_op = operations_by_id[op_id]
        # Check key fields
        assert response_op["id"] == op_data["id"]
        assert response_op["type"] == op_data["type"]
        assert response_op["status"] == op_data["status"]
        assert response_op["start_time"] == op_data["start_time"]
        assert response_op["duration"] == op_data["duration"]

def test_list_operations_with_status_filter(patched_app):
    """Test listing operations with status filter"""
    # Import here to avoid circular imports
    from app.services.telemetry import telemetry_service
    
    # Setup test data
    test_operations = {
        "op1": {
            "id": "op1",
            "type": "test_op",
            "status": "completed",
            "start_time": 1620000000,
            "duration": 0.5
        },
        "op2": {
            "id": "op2",
            "type": "another_op",
            "status": "error",
            "start_time": 1620001000,
            "duration": 1.2
        },
        "op3": {
            "id": "op3",
            "type": "third_op",
            "status": "completed",
            "start_time": 1620002000,
            "duration": 0.3
        }
    }
    
    # Set the operations directly on the service
    telemetry_service.operations = test_operations.copy()
    
    # Call the endpoint with status filter
    response = patched_app.get("/telemetry/operations?status=completed&limit=10")
    
    # Check the response
    assert response.status_code == 200
    data = response.json()
    assert "operations" in data
    assert "count" in data
    
    # Find the operations with completed status
    expected_ids = [op_id for op_id, op in test_operations.items() if op["status"] == "completed"]
    
    # Check that all our expected IDs are in the response
    operations_by_id = {op["id"]: op for op in data["operations"]}
    for op_id in expected_ids:
        assert op_id in operations_by_id, f"Completed operation {op_id} not found in response"
        
    # Check that operations with other statuses are not in the response
    other_status_ids = [op_id for op_id, op in test_operations.items() if op["status"] != "completed"]
    for op_id in other_status_ids:
        assert op_id not in operations_by_id, f"Non-completed operation {op_id} found in response"

def test_get_operation(patched_app):
    """Test getting operation details by ID"""
    # Mock operation details
    mock_operation = {
        "id": "test-op-id",
        "type": "test_op",
        "status": "completed",
        "start_time": 1620000000,
        "end_time": 1620000001,
        "duration": 1.0,
        "metadata": {"test": True}
    }
    
    with patch('app.services.telemetry.telemetry_service.get_operation', return_value=mock_operation):
        # Call the endpoint
        response = patched_app.get("/telemetry/operations/test-op-id")
        
        # Check the response
        assert response.status_code == 200
        data = response.json()
        assert data == mock_operation

def test_get_operation_not_found(patched_app):
    """Test getting an operation that doesn't exist"""
    with patch('app.services.telemetry.telemetry_service.get_operation', return_value=None):
        # Call the endpoint
        response = patched_app.get("/telemetry/operations/nonexistent")
        
        # Check the response
        assert response.status_code == 404
        data = response.json()
        assert "detail" in data 

# Helper function to sort operation lists by ID for stable comparison
def sorted_by_id(operations):
    return sorted(operations, key=lambda x: x["id"]) 