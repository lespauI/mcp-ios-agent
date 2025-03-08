import pytest
import time
import asyncio
from app.services.telemetry import TelemetryService

@pytest.fixture
def telemetry_service():
    """Create a telemetry service for testing"""
    service = TelemetryService()
    service.detailed_metrics = True  # Enable detailed metrics for testing
    return service

async def test_operation_tracking(telemetry_service):
    """Test basic operation tracking with the enhanced metrics"""
    # Track a regular operation
    async with telemetry_service.track_operation("test_operation", metadata={"test": True}):
        # Simulate some work
        await asyncio.sleep(0.1)
    
    # Check metrics
    metrics = telemetry_service.get_metrics()
    assert metrics["operation_count"] == 1
    assert metrics["error_count"] == 0
    
    # Check operation history
    history = telemetry_service.get_operation_history()
    assert len(history) == 1
    assert history[0]["type"] == "test_operation"
    assert history[0]["status"] == "completed"
    assert history[0]["metadata"]["test"] is True
    assert "duration" in history[0]
    assert history[0]["duration"] >= 0.1  # Should have taken at least 0.1s

async def test_tool_specific_metrics(telemetry_service):
    """Test tool-specific metrics tracking"""
    # Track several tool operations
    for i in range(3):
        async with telemetry_service.track_operation("tool:test_tool"):
            await asyncio.sleep(0.05)
    
    # Track a different tool
    async with telemetry_service.track_operation("tool:another_tool"):
        await asyncio.sleep(0.1)
    
    # Simulate a tool error
    try:
        async with telemetry_service.track_operation("tool:error_tool"):
            raise ValueError("Simulated error")
    except ValueError:
        pass
    
    # Check metrics
    metrics = telemetry_service.get_metrics()
    assert metrics["tool_executions"]["test_tool"] == 3
    assert metrics["tool_executions"]["another_tool"] == 1
    assert metrics["tool_executions"]["error_tool"] == 1
    
    # Check tool success rates
    assert metrics["tools"]["test_tool"]["success_rate"] == 1.0  # 100% success
    assert metrics["tools"]["error_tool"]["success_rate"] == 0.0  # 0% success
    
    # Check execution times
    performance_metrics = telemetry_service.get_tool_performance_metrics()
    assert "test_tool" in performance_metrics
    assert performance_metrics["test_tool"]["call_count"] == 3
    assert performance_metrics["test_tool"]["avg_execution_time"] >= 0.05
    assert "error_tool" in performance_metrics
    assert performance_metrics["error_tool"]["success_rate"] == 0.0

async def test_error_tracking(telemetry_service):
    """Test error tracking in operations"""
    # Successful operation
    async with telemetry_service.track_operation("success_op"):
        await asyncio.sleep(0.01)
    
    # Failed operation
    error_message = "Test error message"
    try:
        async with telemetry_service.track_operation("error_op"):
            raise RuntimeError(error_message)
    except RuntimeError:
        pass
    
    # Check metrics
    metrics = telemetry_service.get_metrics()
    assert metrics["operation_count"] == 2
    assert metrics["error_count"] == 1
    
    # Check operation details
    history = telemetry_service.get_operation_history()
    error_op = next((op for op in history if op["type"] == "error_op"), None)
    assert error_op is not None
    assert error_op["status"] == "error"
    assert len(error_op["errors"]) == 1
    assert error_op["errors"][0]["type"] == "RuntimeError"
    assert error_op["errors"][0]["message"] == error_message
    assert "traceback" in error_op["errors"][0]

async def test_memory_tracking(telemetry_service):
    """Test memory usage tracking"""
    # Skip if detailed metrics are disabled
    if not telemetry_service.detailed_metrics:
        pytest.skip("Detailed metrics disabled")
    
    # Create a large object to cause memory change
    async with telemetry_service.track_operation("memory_op"):
        # Allocate some memory
        large_list = [0] * 1000000  # Allocate ~8MB
        await asyncio.sleep(0.01)
    
    # Check operation history
    history = telemetry_service.get_operation_history()
    memory_op = next((op for op in history if op["type"] == "memory_op"), None)
    assert memory_op is not None
    assert "memory_start" in memory_op
    assert "memory_end" in memory_op
    assert "memory_change" in memory_op
    
    # We can't assert the exact memory change due to GC unpredictability,
    # but we can check that the fields exist and are numeric
    assert isinstance(memory_op["memory_start"], int)
    assert isinstance(memory_op["memory_end"], int)
    assert isinstance(memory_op["memory_change"], int)

async def test_system_metrics_collection(telemetry_service):
    """Test system metrics collection"""
    # Skip if detailed metrics are disabled
    if not telemetry_service.detailed_metrics:
        pytest.skip("Detailed metrics disabled")
    
    # Collect system metrics
    await telemetry_service.collect_system_metrics()
    
    # Wait a moment and collect again
    await asyncio.sleep(0.1)
    await telemetry_service.collect_system_metrics()
    
    # Check metrics
    metrics = telemetry_service.get_metrics()
    assert "resource_usage" in metrics
    assert len(metrics["resource_usage"]) > 0
    
    # Check structure of system metrics
    latest_metrics = metrics["resource_usage"][-1]
    assert "timestamp" in latest_metrics
    assert "process" in latest_metrics
    assert "system" in latest_metrics
    assert "cpu_percent" in latest_metrics["process"]
    assert "memory_rss" in latest_metrics["process"]
    assert "cpu_percent" in latest_metrics["system"]
    assert "memory_percent" in latest_metrics["system"]

async def test_connection_session_tracking(telemetry_service):
    """Test tracking of connections and sessions"""
    # Initial values should be zero
    metrics = telemetry_service.get_metrics()
    assert metrics["active_connections"] == 0
    assert metrics["active_sessions"] == 0
    
    # Update connection count
    telemetry_service.update_connection_count(5)
    metrics = telemetry_service.get_metrics()
    assert metrics["active_connections"] == 5
    
    # Update session count
    telemetry_service.update_session_count(3)
    metrics = telemetry_service.get_metrics()
    assert metrics["active_sessions"] == 3
    
    # Remove some connections
    telemetry_service.update_connection_count(-2)
    metrics = telemetry_service.get_metrics()
    assert metrics["active_connections"] == 3
    
    # Check that counts don't go below zero
    telemetry_service.update_connection_count(-10)
    metrics = telemetry_service.get_metrics()
    assert metrics["active_connections"] == 0

async def test_operation_filtering(telemetry_service):
    """Test filtering operations by type"""
    # Create operations of different types
    async with telemetry_service.track_operation("type_a"):
        await asyncio.sleep(0.01)
    
    async with telemetry_service.track_operation("type_b"):
        await asyncio.sleep(0.01)
        
    async with telemetry_service.track_operation("type_a"):
        await asyncio.sleep(0.01)
    
    # Get filtered history
    type_a_history = telemetry_service.get_operation_history(operation_type="type_a")
    assert len(type_a_history) == 2
    assert all(op["type"] == "type_a" for op in type_a_history)
    
    type_b_history = telemetry_service.get_operation_history(operation_type="type_b")
    assert len(type_b_history) == 1
    assert type_b_history[0]["type"] == "type_b" 