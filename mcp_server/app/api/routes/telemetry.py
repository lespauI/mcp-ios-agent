from fastapi import APIRouter, Depends, HTTPException, Query, Path
from typing import Dict, List, Optional, Any
from app.services.telemetry import telemetry_service
from app.services.auth import require_admin, require_developer

router = APIRouter()


@router.get("/metrics")
async def get_metrics(user_info: Dict[str, Any] = Depends(require_developer)):
    """Get current telemetry metrics (developer+ only)"""
    metrics = telemetry_service.get_metrics()
    return metrics


@router.get("/operations")
async def list_operations(
    status: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    user_info: Dict[str, Any] = Depends(require_developer)
):
    """List operations (developer+ only)"""
    operations = list(telemetry_service.operations.values())
    
    # Filter by status if provided
    if status:
        operations = [op for op in operations if op["status"] == status]
        
    # Sort by start time (most recent first)
    operations.sort(key=lambda x: x["start_time"], reverse=True)
    
    # Limit the number of results
    operations = operations[:limit]
    
    return {"operations": operations, "count": len(operations)}


@router.get("/operations/{operation_id}")
async def get_operation(
    operation_id: str = Path(...),
    user_info: Dict[str, Any] = Depends(require_developer)
):
    """Get details of a specific operation (developer+ only)"""
    operation = telemetry_service.get_operation(operation_id)
    if not operation:
        raise HTTPException(status_code=404, detail="Operation not found")
        
    return operation 