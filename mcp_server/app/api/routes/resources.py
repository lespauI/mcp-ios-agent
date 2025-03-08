from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Form, Query, Path, status
from fastapi.responses import StreamingResponse, Response, JSONResponse
from typing import Dict, List, Optional, Any
from app.services.resource_manager import resource_manager
import io
import json
import mimetypes
from app.core.unified_errors import UnifiedErrorResponse

router = APIRouter()


@router.post("/upload")
async def upload_resource(
    file: UploadFile = File(...),
    resource_type: str = Form(...),
    ttl: Optional[int] = Form(None),
    metadata: Optional[str] = Form(None)
):
    """Upload a file as a resource"""
    try:
        # Parse metadata if provided
        meta_dict = json.loads(metadata) if metadata else {}
        
        # Store the resource
        uri = await resource_manager.store_binary(
            content=file,
            resource_type=resource_type,
            metadata=meta_dict,
            ttl=ttl
        )
        
        return {"uri": uri}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.get("/{uri:path}")
async def get_resource(
    uri: str,
    download: bool = Query(False),
    metadata_only: bool = Query(False)
):
    """Get a resource by URI"""
    try:
        # If metadata only is requested, return just the metadata
        if metadata_only:
            metadata = await resource_manager.get_metadata(uri)
            if not metadata:
                # Create an error response with HTTP 404 status
                return JSONResponse(
                    status_code=status.HTTP_404_NOT_FOUND,
                    content={
                        "error_code": -32800,
                        "message": f"Resource not found: {uri}",
                        "detail": None
                    }
                )
            return metadata
        
        # Get the resource content
        content = await resource_manager.get_binary(uri)
        if not content:
            # Create an error response with HTTP 404 status
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content={
                    "error_code": -32800,
                    "message": f"Resource not found: {uri}",
                    "detail": None
                }
            )
        
        # Parse the URI to get resource type and extension
        parsed_uri = resource_manager.parse_resource_uri(uri)
        content_type = "application/octet-stream"
        
        # Determine content type based on resource type and extension
        if parsed_uri.get("resource_type") == "screenshot":
            content_type = "image/png"
        elif parsed_uri.get("extension") == ".json":
            content_type = "application/json"
        elif parsed_uri.get("extension") == ".xml":
            content_type = "application/xml"
        
        # Return the content with appropriate headers
        headers = {"Content-Type": content_type}
        if download:
            filename = uri.split("/")[-1]
            headers["Content-Disposition"] = f'attachment; filename="{filename}"'
        
        return Response(content=content, headers=headers)
            
    except ResourceUriParseError as e:
        # Create an error response with HTTP 400 status
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "error_code": -32800,
                "message": str(e),
                "detail": None
            }
        )
    except Exception as e:
        logger.exception(f"Error retrieving resource {uri}: {str(e)}")
        # Create an error response with HTTP 500 status
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error_code": -32603,
                "message": "Error retrieving resource",
                "detail": {"error": str(e)}
            }
        )


@router.delete("/{uri:path}")
async def delete_resource(uri: str):
    """Delete a resource"""
    # Add the resource:// prefix if not present
    if not uri.startswith("resource://"):
        uri = f"resource://{uri}"
        
    # Delete the resource
    success = await resource_manager.delete_resource(uri)
    if not success:
        raise HTTPException(status_code=404, detail="Resource not found or could not be deleted")
        
    return {"success": True, "uri": uri}


@router.patch("/{uri:path}/metadata")
async def update_resource_metadata(uri: str, metadata: Dict[str, Any]):
    """Update resource metadata"""
    # Add the resource:// prefix if not present
    if not uri.startswith("resource://"):
        uri = f"resource://{uri}"
        
    # Update metadata
    success = await resource_manager.update_metadata(uri, metadata)
    if not success:
        raise HTTPException(status_code=404, detail="Resource not found")
        
    return {"success": True, "uri": uri} 