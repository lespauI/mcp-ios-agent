import time
import json
import logging
import uuid
from typing import Dict, Any, Optional, List
from contextlib import asynccontextmanager
from fastapi import Request
from app.core.config import settings
import asyncio
from datetime import datetime, timedelta
from asyncio import Task
from collections import defaultdict, deque
import psutil
import traceback

logger = logging.getLogger(__name__)


class TelemetryService:
    """Service for tracking operations and collecting metrics"""
    
    def __init__(self):
        self.operations: Dict[str, Dict[str, Any]] = {}
        self.operation_history = deque(maxlen=settings.OPERATION_HISTORY_SIZE)
        self.metrics: Dict[str, Any] = {
            "request_count": 0,
            "operation_count": 0,
            "error_count": 0,
            "tool_executions": defaultdict(int),
            "tool_execution_times": defaultdict(list),
            "resource_usage": [],
            "response_times": [],
            "tool_success_rate": defaultdict(lambda: {"success": 0, "error": 0}),
            "active_connections": 0,
            "active_sessions": 0
        }
        self.cleanup_task: Optional[Task] = None
        self.system_metrics_task: Optional[Task] = None
        self.detailed_metrics = settings.ENABLE_DETAILED_METRICS
        
    @asynccontextmanager
    async def track_operation(
        self, 
        operation_type: str, 
        operation_id: Optional[str] = None, 
        metadata: Optional[Dict[str, Any]] = None
    ):
        """Context manager for tracking an operation with timing"""
        if operation_id is None:
            operation_id = str(uuid.uuid4())
            
        if metadata is None:
            metadata = {}
            
        # Record the start of the operation
        start_time = time.time()
        start_memory = psutil.Process().memory_info().rss if self.detailed_metrics else 0
        
        # Create operation record
        operation = {
            "id": operation_id,
            "type": operation_type,
            "status": "running",
            "start_time": start_time,
            "start_time_iso": datetime.fromtimestamp(start_time).isoformat(),
            "metadata": metadata,
            "errors": [],
        }
        
        self.operations[operation_id] = operation
        self.metrics["operation_count"] += 1
        
        if operation_type.startswith("tool:"):
            tool_name = operation_type.split(":", 1)[1]
            self.metrics["tool_executions"][tool_name] += 1
        
        logger.debug(f"Started operation {operation_id} of type {operation_type}")
        
        try:
            # Yield control back to the caller
            yield operation_id
            
            # Operation completed successfully
            end_time = time.time()
            duration = end_time - start_time
            
            operation["status"] = "completed"
            operation["end_time"] = end_time
            operation["end_time_iso"] = datetime.fromtimestamp(end_time).isoformat()
            operation["duration"] = duration
            
            # Track tool-specific metrics
            if operation_type.startswith("tool:"):
                tool_name = operation_type.split(":", 1)[1]
                if self.detailed_metrics:
                    # Store execution time (up to 100 samples per tool)
                    tool_times = self.metrics["tool_execution_times"][tool_name]
                    if len(tool_times) >= 100:
                        tool_times.pop(0)  # Remove oldest
                    tool_times.append(duration)
                
                # Track success rate
                self.metrics["tool_success_rate"][tool_name]["success"] += 1
            
            # Track memory usage change if detailed metrics are enabled
            if self.detailed_metrics:
                end_memory = psutil.Process().memory_info().rss
                memory_change = end_memory - start_memory
                operation["memory_start"] = start_memory
                operation["memory_end"] = end_memory
                operation["memory_change"] = memory_change
            
            # Track response time
            self.metrics["response_times"].append(duration)
            if len(self.metrics["response_times"]) > 100:
                self.metrics["response_times"].pop(0)
                
            logger.debug(f"Completed operation {operation_id} in {duration:.3f}s")
            
        except Exception as e:
            # Operation failed
            end_time = time.time()
            duration = end_time - start_time
            
            # Format error details
            error_details = {
                "type": type(e).__name__,
                "message": str(e),
                "timestamp": datetime.now().isoformat(),
                "traceback": traceback.format_exc()
            }
            
            operation["status"] = "error"
            operation["end_time"] = end_time
            operation["end_time_iso"] = datetime.fromtimestamp(end_time).isoformat()
            operation["duration"] = duration
            operation["errors"].append(error_details)
            
            # Track tool-specific metrics for errors
            if operation_type.startswith("tool:"):
                tool_name = operation_type.split(":", 1)[1]
                self.metrics["tool_success_rate"][tool_name]["error"] += 1
                
                # Also record execution time for failed tools if detailed metrics are enabled
                if self.detailed_metrics:
                    tool_times = self.metrics["tool_execution_times"][tool_name]
                    if len(tool_times) >= 100:
                        tool_times.pop(0)  # Remove oldest
                    tool_times.append(duration)
            
            # Update error count
            self.metrics["error_count"] += 1
            
            logger.error(f"Error in operation {operation_id}: {str(e)}")
            
            # Re-raise the exception
            raise
        finally:
            # Add operation to history
            self.operation_history.append(operation.copy())
            
            # Remove operation from active tracking after a delay
            # This allows time for clients to query the operation status
            asyncio.create_task(self._cleanup_operation(operation_id))
    
    async def _cleanup_operation(self, operation_id: str):
        """Remove an operation from active tracking after a delay"""
        await asyncio.sleep(60)  # Keep operation data available for 1 minute
        self.operations.pop(operation_id, None)
        
    def get_operation(self, operation_id: str) -> Optional[Dict[str, Any]]:
        """Get operation details by ID"""
        return self.operations.get(operation_id)
        
    def get_metrics(self) -> Dict[str, Any]:
        """Get current telemetry metrics"""
        metrics = self.metrics.copy()
        
        # Calculate derived metrics
        if metrics["response_times"]:
            metrics["avg_response_time"] = sum(metrics["response_times"]) / len(metrics["response_times"])
            metrics["max_response_time"] = max(metrics["response_times"])
            metrics["min_response_time"] = min(metrics["response_times"])
        else:
            metrics["avg_response_time"] = 0
            metrics["max_response_time"] = 0
            metrics["min_response_time"] = 0
            
        # Calculate tool-specific metrics
        tool_metrics = {}
        for tool_name, counts in metrics["tool_success_rate"].items():
            total = counts["success"] + counts["error"]
            success_rate = counts["success"] / total if total > 0 else 0
            
            # Calculate average execution time if detailed metrics are enabled
            avg_time = 0
            if self.detailed_metrics and tool_name in metrics["tool_execution_times"]:
                times = metrics["tool_execution_times"][tool_name]
                if times:
                    avg_time = sum(times) / len(times)
                    
            tool_metrics[tool_name] = {
                "execution_count": total,
                "success_rate": success_rate,
                "average_execution_time": avg_time
            }
            
        metrics["tools"] = tool_metrics
        
        # Add system metrics if available
        if self.detailed_metrics and metrics["resource_usage"]:
            last_usage = metrics["resource_usage"][-1]
            metrics["current_resource_usage"] = last_usage
            
        # Remove raw data that may be large
        if not self.detailed_metrics:
            metrics.pop("tool_execution_times", None)
            metrics.pop("response_times", None)
            metrics.pop("resource_usage", None)
            
        return metrics
        
    def clear_old_operations(self, max_age: int = 3600) -> int:
        """Remove operations older than max_age seconds"""
        cutoff_time = time.time() - max_age
        old_ops = []
        
        # Find old operations
        for op_id, op_data in self.operations.items():
            if op_data["start_time"] < cutoff_time:
                # Only remove completed or errored operations
                if op_data["status"] in ["completed", "error"]:
                    old_ops.append(op_id)
                    
        # Remove old operations
        for op_id in old_ops:
            self.operations.pop(op_id)
            
        return len(old_ops)
        
    async def collect_system_metrics(self):
        """Collect system metrics (CPU, memory, etc.)"""
        if not self.detailed_metrics:
            return
            
        try:
            # Collect process metrics
            process = psutil.Process()
            cpu_percent = process.cpu_percent(interval=1)
            mem_info = process.memory_info()
            
            # Collect system metrics
            system_cpu = psutil.cpu_percent(interval=None)
            system_memory = psutil.virtual_memory()
            
            metrics = {
                "timestamp": datetime.now().isoformat(),
                "process": {
                    "cpu_percent": cpu_percent,
                    "memory_rss": mem_info.rss,
                    "memory_vms": mem_info.vms,
                    "threads": process.num_threads()
                },
                "system": {
                    "cpu_percent": system_cpu,
                    "memory_percent": system_memory.percent,
                    "memory_available": system_memory.available
                }
            }
            
            # Store in resource usage history (keep last 60 samples)
            self.metrics["resource_usage"].append(metrics)
            if len(self.metrics["resource_usage"]) > 60:
                self.metrics["resource_usage"].pop(0)
                
        except Exception as e:
            logger.error(f"Error collecting system metrics: {str(e)}")
            
    async def cleanup_task_loop(self) -> None:
        """Background task for cleaning up old operations"""
        logger.info("Starting telemetry cleanup task")
        
        while True:
            try:
                # Clean up old operations
                removed = self.clear_old_operations(max_age=3600)  # 1 hour
                if removed > 0:
                    logger.debug(f"Cleaned up {removed} old operations")
                    
                # Collect system metrics if enabled
                if self.detailed_metrics:
                    await self.collect_system_metrics()
                    
            except Exception as e:
                logger.error(f"Error in telemetry cleanup task: {str(e)}")
                
            # Run every 5 minutes
            await asyncio.sleep(300)
            
    def start_cleanup_task(self) -> None:
        """Start the cleanup task if not already running"""
        if self.cleanup_task is None or self.cleanup_task.done():
            self.cleanup_task = asyncio.create_task(self.cleanup_task_loop())
            logger.debug("Started telemetry cleanup task")
            
    def update_connection_count(self, change: int):
        """Update the count of active connections"""
        self.metrics["active_connections"] += change
        if self.metrics["active_connections"] < 0:
            self.metrics["active_connections"] = 0
            
    def update_session_count(self, change: int):
        """Update the count of active sessions"""
        self.metrics["active_sessions"] += change
        if self.metrics["active_sessions"] < 0:
            self.metrics["active_sessions"] = 0
            
    def get_operation_history(self, limit: int = 50, operation_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get recent operation history, optionally filtered by type"""
        history = list(self.operation_history)
        
        # Filter by operation type if specified
        if operation_type:
            history = [op for op in history if op["type"] == operation_type]
            
        # Return most recent first, up to the limit
        return sorted(history, key=lambda x: x["start_time"], reverse=True)[:limit]
        
    def get_tool_performance_metrics(self) -> Dict[str, Any]:
        """Get detailed performance metrics for tools"""
        if not self.detailed_metrics:
            return {"detailed_metrics_disabled": True}
            
        tool_metrics = {}
        
        for tool_name, execution_times in self.metrics["tool_execution_times"].items():
            if not execution_times:
                continue
                
            # Calculate statistics
            avg_time = sum(execution_times) / len(execution_times)
            sorted_times = sorted(execution_times)
            median_time = sorted_times[len(sorted_times) // 2]
            p95_time = sorted_times[int(len(sorted_times) * 0.95)]
            
            # Get success rates
            success_counts = self.metrics["tool_success_rate"][tool_name]
            total = success_counts["success"] + success_counts["error"]
            success_rate = success_counts["success"] / total if total > 0 else 0
            
            tool_metrics[tool_name] = {
                "call_count": total,
                "success_rate": success_rate,
                "avg_execution_time": avg_time,
                "median_execution_time": median_time,
                "p95_execution_time": p95_time,
                "max_execution_time": max(execution_times),
                "min_execution_time": min(execution_times)
            }
            
        return tool_metrics
            

# Create a singleton instance
telemetry_service = TelemetryService()


# Middleware to track HTTP requests
async def telemetry_middleware(request: Request, call_next):
    """Middleware to track all HTTP requests"""
    # Skip telemetry endpoints to avoid recursion
    if request.url.path.endswith("/metrics") or request.url.path.endswith("/health"):
        return await call_next(request)
        
    # Extract request details
    method = request.method
    path = request.url.path
    
    metadata = {
        "method": method,
        "path": path,
        "client_host": request.client.host if request.client else None,
        "user_agent": request.headers.get("user-agent")
    }
    
    # Track the operation
    async with telemetry_service.track_operation("http_request", metadata=metadata) as op_id:
        # Process the request
        response = await call_next(request)
        
        # Add response details to operation metadata
        telemetry_service.operations[op_id]["metadata"]["status_code"] = response.status_code
        
        return response 