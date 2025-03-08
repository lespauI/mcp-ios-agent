import os
import hashlib
import base64
import json
import uuid
import mimetypes
import asyncio
import aiofiles
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, BinaryIO, Union
from fastapi import HTTPException, UploadFile
from app.core.config import settings
import logging
import shutil
import time
from app.core.errors import (
    ResourceNotFoundError, 
    ResourceStorageError, 
    ResourceMetadataError, 
    ResourceUriParseError,
    ResourceQuotaExceededError
)

logger = logging.getLogger(__name__)

# Ensure mime types are initialized
mimetypes.init()


class ResourceManager:
    def __init__(self, storage_path: str = "storage"):
        self.storage_path = storage_path
        self.metadata = {}  # In-memory metadata cache
        self.ensure_storage_dir()
        self.cleanup_task_handle = None
        
    def ensure_storage_dir(self) -> None:
        """Ensure the storage directory exists"""
        os.makedirs(self.storage_path, exist_ok=True)
        os.makedirs(os.path.join(self.storage_path, "temp"), exist_ok=True)
        os.makedirs(os.path.join(self.storage_path, "permanent"), exist_ok=True)
        
    def generate_resource_uri(self, content_hash: str, resource_type: str, extension: str) -> str:
        """Generate a resource URI based on content hash"""
        return f"resource://{resource_type}/{content_hash}{extension}"
        
    def parse_resource_uri(self, uri: str) -> Dict[str, str]:
        """Parse a resource URI into components"""
        try:
            if not uri.startswith("resource://"):
                raise ResourceUriParseError(uri)
                
            # Strip the protocol
            path = uri[11:]
            
            # Split into resource type and id
            parts = path.split("/", 1)
            if len(parts) != 2:
                raise ResourceUriParseError(uri)
                
            resource_type, resource_id = parts
            
            # Extract file extension if present
            extension = ""
            if "." in resource_id:
                resource_id_parts = resource_id.rsplit(".", 1)
                resource_id = resource_id_parts[0]
                extension = f".{resource_id_parts[1]}"
                
            return {
                "resource_type": resource_type,
                "resource_id": resource_id,
                "extension": extension
            }
        except Exception as e:
            if not isinstance(e, ResourceUriParseError):
                raise ResourceUriParseError(uri) from e
            raise
        
    def get_storage_path(self, uri: str, temp: bool = False) -> str:
        """Get the storage path for a resource URI"""
        components = self.parse_resource_uri(uri)
        base_dir = "temp" if temp else "permanent"
        return os.path.join(
            self.storage_path, 
            base_dir, 
            components["resource_type"], 
            f"{components['resource_id']}{components['extension']}"
        )
        
    async def store_binary(
        self, 
        content: Union[bytes, BinaryIO, UploadFile], 
        resource_type: str,
        metadata: Dict[str, Any] = None,
        extension: str = "",
        ttl: Optional[int] = None
    ) -> str:
        """Store binary content and return a resource URI"""
        if not extension and extension != "" and not extension.startswith("."):
            extension = f".{extension}" if extension else ""
            
        # Handle different content types
        if isinstance(content, UploadFile):
            # Check file size if it's an upload
            if hasattr(content, "file") and hasattr(content.file, "tell") and hasattr(content.file, "seek"):
                # Get file size by seeking to the end
                current_pos = content.file.tell()
                content.file.seek(0, os.SEEK_END)
                file_size = content.file.tell()
                content.file.seek(current_pos)  # Reset to original position
                
                # Check size limit
                max_size = settings.MAX_RESOURCE_SIZE_BYTES
                if file_size > max_size:
                    raise ResourceQuotaExceededError(file_size, max_size)
            
            # Read from the uploaded file
            try:
                content = await content.read()
            except Exception as e:
                logger.error(f"Error reading uploaded file: {str(e)}")
                raise ResourceStorageError(f"Error reading uploaded file: {str(e)}")
                
        elif hasattr(content, "read") and callable(content.read):
            # It's a file-like object, read it
            try:
                if asyncio.iscoroutinefunction(content.read):
                    content = await content.read()
                else:
                    content = content.read()
            except Exception as e:
                logger.error(f"Error reading file-like object: {str(e)}")
                raise ResourceStorageError(f"Error reading file: {str(e)}")
        
        # Now content should be bytes
        if not isinstance(content, bytes):
            try:
                content = bytes(content)
            except Exception as e:
                logger.error(f"Error converting content to bytes: {str(e)}")
                raise ResourceStorageError(f"Invalid content type: {type(content)}")
        
        # Check size for byte content
        max_size = settings.MAX_RESOURCE_SIZE_BYTES
        if len(content) > max_size:
            raise ResourceQuotaExceededError(len(content), max_size)
                
        # Generate content hash
        content_hash = hashlib.sha256(content).hexdigest()
        
        # Create the URI
        uri = self.generate_resource_uri(content_hash, resource_type, extension)
        
        # Prepare metadata
        if metadata is None:
            metadata = {}
            
        metadata.update({
            "created_at": datetime.utcnow().isoformat(),
            "size": len(content),
            "hash": content_hash,
            "type": resource_type
        })
        
        if ttl:
            metadata["expires_at"] = datetime.fromtimestamp(
                time.time() + ttl
            ).isoformat()
        
        # Determine if this is a temporary resource
        is_temp = ttl is not None
        
        # Save the content
        storage_path = self.get_storage_path(uri, is_temp)
        
        # Create directory structure if needed
        os.makedirs(os.path.dirname(storage_path), exist_ok=True)
        
        try:
            # Write the binary content
            with open(storage_path, "wb") as f:
                f.write(content)
                
            # Write the metadata
            metadata_path = f"{storage_path}.meta"
            with open(metadata_path, "w") as f:
                json.dump({"metadata": metadata}, f)
                
            self.metadata[uri] = metadata
            logger.debug(f"Storing metadata for {uri}: {metadata}")
            logger.debug(f"Current metadata cache: {self.metadata}")
            return uri
        except Exception as e:
            logger.error(f"Error storing resource: {str(e)}")
            # Clean up any partially written files
            try:
                if os.path.exists(storage_path):
                    os.remove(storage_path)
                if os.path.exists(f"{storage_path}.meta"):
                    os.remove(f"{storage_path}.meta")
            except Exception:
                pass
            
            raise ResourceStorageError(f"Error storing resource: {str(e)}")
            
    async def get_binary(self, uri: str) -> Optional[bytes]:
        """Get binary content from a resource URI"""
        if uri not in self.metadata:
            logger.warning(f"Resource not found: {uri}")
            return None
            
        # Check expiry
        if self.metadata[uri].get("expiry") and datetime.now() > self.metadata[uri]["expiry"]:
            logger.warning(f"Resource expired: {uri}")
            await self.delete_resource(uri)
            return None
            
        # Get content
        storage_path = self.get_storage_path(
            uri, 
            temp=self.metadata[uri].get("expiry") is not None
        )
        
        if not os.path.exists(storage_path):
            logger.warning(f"Resource file not found: {uri}")
            return None
            
        async with aiofiles.open(storage_path, "rb") as f:
            return await f.read()
            
    async def delete_resource(self, uri: str) -> bool:
        """Delete a resource"""
        if uri not in self.metadata:
            return False
            
        # Delete file
        storage_path = self.get_storage_path(
            uri, 
            temp=self.metadata[uri].get("expiry") is not None
        )
        
        try:
            if os.path.exists(storage_path):
                os.remove(storage_path)
                
            # Remove metadata
            del self.metadata[uri]
            logger.info(f"Deleted resource: {uri}")
            return True
        except Exception as e:
            logger.error(f"Error deleting resource {uri}: {str(e)}")
            return False
            
    async def get_metadata(self, uri: str) -> Optional[Dict[str, Any]]:
        """Get metadata for a resource"""
        logger.debug(f"Retrieving metadata for {uri}: {self.metadata.get(uri)}")
        return self.metadata.get(uri)
        
    async def update_metadata(self, uri: str, metadata: Dict[str, Any]) -> bool:
        """Update metadata for a resource"""
        if uri not in self.metadata:
            return False
        self.metadata[uri].update(metadata)
        return True
        
    async def clean_expired_resources(self) -> int:
        """Clean up expired resources"""
        now = datetime.now()
        expired_uris = [
            uri for uri, meta in self.metadata.items()
            if meta.get("expiry") and now > meta["expiry"]
        ]
        
        for uri in expired_uris:
            await self.delete_resource(uri)
            
        return len(expired_uris)
        
    async def cleanup_task(self) -> None:
        """Background task to periodically clean up expired resources"""
        while True:
            try:
                count = await self.clean_expired_resources()
                if count > 0:
                    logger.info(f"Cleaned up {count} expired resources")
            except Exception as e:
                logger.error(f"Error in resource cleanup: {str(e)}")
                
            await asyncio.sleep(60)  # Run every minute


# Create a singleton instance
resource_manager = ResourceManager() 