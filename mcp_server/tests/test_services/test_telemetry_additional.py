import pytest
import time
import asyncio
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi import Request, Response
from app.services.telemetry import TelemetryService, telemetry_middleware
from contextlib import asynccontextmanager

@pytest.fixture
def telemetry_service():
    """Create a telemetry service for testing"""
    service = TelemetryService()
    service.detailed_metrics = True  # Enable detailed metrics for testing
    return service

async def test_clear_old_operations(telemetry_service):
    """Test clearing old operations based on age"""
    # Create operations with different start times
    current_time = time.time()
    
    # Create some old operations (2 hours old)
    for i in range(3):
        op_id = f"old_op_{i}"
        telemetry_service.operations[op_id] = {
            "id": op_id,
            "type": "test_op",
            "status": "completed",
            "start_time": current_time - 7200,  # 2 hours ago
            "metadata": {}
        }
    
    # Create some newer operations (30 minutes old)
    for i in range(2):
        op_id = f"newer_op_{i}"
        telemetry_service.operations[op_id] = {
            "id": op_id,
            "type": "test_op",
            "status": "completed",
            "start_time": current_time - 1800,  # 30 minutes ago
            "metadata": {}
        }
    
    # Create a running operation (shouldn't be cleared even if old)
    telemetry_service.operations["running_op"] = {
        "id": "running_op",
        "type": "test_op",
        "status": "running",
        "start_time": current_time - 7200,  # 2 hours ago
        "metadata": {}
    }
    
    # Initially we should have 6 operations
    assert len(telemetry_service.operations) == 6
    
    # Clear operations older than 1 hour
    removed = telemetry_service.clear_old_operations(max_age=3600)
    
    # Should have removed 3 old operations
    assert removed == 3
    assert len(telemetry_service.operations) == 3
    
    # Older running operation should still be there
    assert "running_op" in telemetry_service.operations
    
    # Newer operations should still be there
    assert "newer_op_0" in telemetry_service.operations
    assert "newer_op_1" in telemetry_service.operations

@pytest.mark.asyncio
async def test_cleanup_task_loop(telemetry_service):
    """Test the cleanup task loop"""
    # Mock the dependent methods to avoid real sleeps
    with patch.object(telemetry_service, 'clear_old_operations', return_value=5) as mock_clear:
        with patch.object(telemetry_service, 'collect_system_metrics') as mock_collect:
            with patch.object(asyncio, 'sleep', new_callable=AsyncMock) as mock_sleep:
                # Make sleep return immediately to ensure the loop runs once
                mock_sleep.side_effect = asyncio.CancelledError()
                
                # Run the cleanup task and expect it to be cancelled
                with pytest.raises(asyncio.CancelledError):
                    await telemetry_service.cleanup_task_loop()
                
                # Verify the methods were called
                mock_clear.assert_called_once()
                # collect_system_metrics is only called if detailed_metrics is True
                if telemetry_service.detailed_metrics:
                    mock_collect.assert_called_once()

@pytest.mark.asyncio
async def test_cleanup_task_loop_exception_handling(telemetry_service):
    """Test error handling in the cleanup task loop"""
    # Mock clear_old_operations to raise an exception
    with patch.object(telemetry_service, 'clear_old_operations', side_effect=Exception("Test error")) as mock_clear:
        with patch.object(asyncio, 'sleep', new_callable=AsyncMock) as mock_sleep:
            # Make sleep return immediately to ensure the loop runs once
            mock_sleep.side_effect = asyncio.CancelledError()
            
            # Run the cleanup task and expect it to be cancelled
            with pytest.raises(asyncio.CancelledError):
                await telemetry_service.cleanup_task_loop()
            
            # Verify the method was called despite throwing an exception
            mock_clear.assert_called_once()

def test_start_cleanup_task(telemetry_service):
    """Test starting the cleanup task"""
    with patch('asyncio.create_task') as mock_create_task:
        # Start the cleanup task
        telemetry_service.start_cleanup_task()
        
        # Verify task was created
        mock_create_task.assert_called_once()
        
        # Call again - shouldn't create a new task if one is running
        telemetry_service.cleanup_task = MagicMock()
        telemetry_service.cleanup_task.done.return_value = False
        
        telemetry_service.start_cleanup_task()
        
        # Should still have only one call
        mock_create_task.assert_called_once()
        
        # Now simulate a completed task
        telemetry_service.cleanup_task.done.return_value = True
        
        telemetry_service.start_cleanup_task()
        
        # Should create a new task
        assert mock_create_task.call_count == 2

@pytest.mark.asyncio
async def test_collect_system_metrics_exception_handling(telemetry_service):
    """Test error handling in collect_system_metrics"""
    with patch('psutil.Process', side_effect=Exception("Test error")):
        # Should not raise an exception
        await telemetry_service.collect_system_metrics()
        
        # No metrics should have been added
        assert len(telemetry_service.metrics["resource_usage"]) == 0

@pytest.mark.asyncio
async def test_telemetry_middleware():
    """Test the telemetry middleware"""
    # Create mock request and response
    mock_request = MagicMock()
    mock_request.url.path = "/test/path"
    mock_request.method = "GET"
    mock_request.client.host = "127.0.0.1"
    mock_request.headers = {"user-agent": "test-agent"}
    
    # Mock the call_next function
    mock_response = MagicMock()
    mock_response.status_code = 200
    
    async def mock_call_next(request):
        return mock_response
    
    # Create a telemetry service with mocked track_operation
    test_telemetry_service = TelemetryService()
    test_operation_id = "test_op_id"
    test_telemetry_service.operations[test_operation_id] = {
        "id": test_operation_id,
        "type": "http_request",
        "status": "running",
        "metadata": {}
    }
    
    # Create a context manager that just yields an operation ID
    @asynccontextmanager
    async def mock_track_operation(self, operation_type, operation_id=None, metadata=None):
        yield test_operation_id
        
    # Use patches to mock the telemetry service
    with patch('app.services.telemetry.telemetry_service', test_telemetry_service):
        with patch.object(TelemetryService, 'track_operation', new=mock_track_operation):
            # Call the middleware
            response = await telemetry_middleware(mock_request, mock_call_next)
            
            # Should return the response from call_next
            assert response == mock_response
            # Should have added status_code to operation metadata
            assert test_telemetry_service.operations[test_operation_id]["metadata"]["status_code"] == 200

@pytest.mark.asyncio
async def test_telemetry_middleware_skip_metrics_endpoint():
    """Test that telemetry middleware skips metrics endpoints"""
    # Create mock request for metrics endpoint
    mock_request = MagicMock()
    mock_request.url.path = "/metrics"
    
    # Mock the call_next function
    mock_response = MagicMock()
    
    async def mock_call_next(request):
        return mock_response
    
    # Create a telemetry service with mocked track_operation that would fail the test if called
    test_telemetry_service = TelemetryService()
    
    @asynccontextmanager
    async def mock_track_operation(self, operation_type, operation_id=None, metadata=None):
        # This should not be called for metrics endpoint
        pytest.fail("track_operation should not be called for metrics endpoint")
        yield "test_op_id"
        
    # Use patches to mock the telemetry service
    with patch('app.services.telemetry.telemetry_service', test_telemetry_service):
        with patch.object(TelemetryService, 'track_operation', new=mock_track_operation):
            # Call the middleware
            response = await telemetry_middleware(mock_request, mock_call_next)
            
            # Should return the response from call_next
            assert response == mock_response

@pytest.mark.asyncio
async def test_cleanup_operation(telemetry_service):
    """Test that operations are cleaned up after a delay"""
    # Add an operation
    op_id = "test_cleanup_op"
    telemetry_service.operations[op_id] = {
        "id": op_id,
        "type": "test_op",
        "status": "completed",
        "start_time": time.time(),
        "metadata": {}
    }
    
    # Mock asyncio.sleep to avoid waiting
    with patch('asyncio.sleep', new_callable=AsyncMock) as mock_sleep:
        # Call cleanup
        await telemetry_service._cleanup_operation(op_id)
        
        # Should have slept for 60 seconds
        mock_sleep.assert_called_once_with(60)
        
        # Operation should be removed
        assert op_id not in telemetry_service.operations 