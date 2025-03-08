from fastapi import FastAPI, Request, Response, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.openapi.docs import get_swagger_ui_html, get_redoc_html
from fastapi.openapi.utils import get_openapi
import logging
import asyncio
import time
from typing import List

from app.core.config import settings
from app.api.routes import api_router
from app.services.telemetry import TelemetryService, telemetry_middleware
from app.services.session_manager import SessionManager
from app.services.resource_manager import ResourceManager
from app.services.tool_registry import registry
from app.api.routes.resources import router as resources_router
from app.core.unified_errors import unified_exception_handler

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url="/api/openapi.json",
    docs_url=None,  # Disable default docs to use custom docs
    redoc_url=None,  # Disable default redoc to use custom redoc
    description="""
    MCP iOS Testing Server API
    
    This server implements the Model-Context Protocol (MCP) for iOS application testing.
    It provides tools for controlling iOS devices, capturing screenshots, analyzing UI elements,
    and automating test flows through a standard JSON-RPC interface.
    
    ## Key Features
    
    * MCP-compliant JSON-RPC API
    * Tool discovery and execution
    * Resource management (screenshots, XML hierarchies)
    * Session management for test context
    * Authentication and authorization
    * Telemetry for monitoring operations
    
    ## Authentication
    
    Most endpoints require authentication via API key. To authenticate, include your API key
    in the `X-API-Key` header with your requests.
    
    ## Server-Sent Events
    
    The server uses Server-Sent Events (SSE) for real-time updates. Connect to the
    `/mcp/events/{client_id}` endpoint to receive event streams.
    """,
    version="1.0.0",
    contact={
        "name": "iOS Testing Framework Team",
        "url": "https://github.com/your-org/ios-automation-agent",
        "email": "support@example.com",
    },
    license_info={
        "name": "MIT",
        "url": "https://opensource.org/licenses/MIT",
    }
)

# Add CORS middleware
if settings.BACKEND_CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[str(origin) for origin in settings.BACKEND_CORS_ORIGINS],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Add telemetry middleware
app.middleware("http")(telemetry_middleware)

# Include all routes
app.include_router(api_router)
app.include_router(resources_router, prefix="/api/v1/resources")

# Initialize services
@app.on_event("startup")
async def startup_event():
    """Initialize application state on startup"""
    logger.info("Starting up server...")
    
    # Create singletons
    app.state.telemetry = TelemetryService()
    app.state.session_manager = SessionManager()
    app.state.resource_manager = ResourceManager()
    
    # Connect to Redis
    await app.state.session_manager.connect()
    
    # Start background tasks - use the method directly instead of accessing the attribute
    app.state.telemetry_task = asyncio.create_task(app.state.telemetry.cleanup_task_loop())
    app.state.resource_cleanup_task = asyncio.create_task(app.state.resource_manager.cleanup_task())
    
    logger.info(f"Server started successfully. Available tools: {len(registry.list_tools())}")

@app.on_event("shutdown")
async def shutdown_event():
    """Clean up resources on shutdown"""
    logger.info("Shutting down server...")
    
    # Cancel background tasks
    if hasattr(app.state, "cleanup_task") and app.state.cleanup_task:
        app.state.cleanup_task.cancel()
        
    if hasattr(app.state, "resource_cleanup_task") and app.state.resource_cleanup_task:
        app.state.resource_cleanup_task.cancel()
    
    # Close connections
    if hasattr(app.state, "session_manager"):
        await app.state.session_manager.disconnect()
        
    logger.info("Server shutdown complete")

@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    """Global exception handler"""
    logger.exception(f"Unhandled exception in request {request.url}: {str(exc)}")
    return await unified_exception_handler(request, exc)

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "version": "1.0.0",
        "timestamp": time.time(),
    }

@app.get("/docs", include_in_schema=False)
async def custom_swagger_ui_html():
    """Custom Swagger UI"""
    return get_swagger_ui_html(
        openapi_url=app.openapi_url,
        title=f"{app.title} - Swagger UI",
        oauth2_redirect_url=app.swagger_ui_oauth2_redirect_url,
        swagger_js_url="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.9.0/swagger-ui-bundle.js",
        swagger_css_url="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.9.0/swagger-ui.css",
        swagger_ui_parameters={
            "persistAuthorization": True,
            "tryItOutEnabled": True,
            "filter": True,
            "displayRequestDuration": True,
        }
    )

@app.get("/redoc", include_in_schema=False)
async def custom_redoc_html():
    """Custom ReDoc documentation"""
    return get_redoc_html(
        openapi_url=app.openapi_url,
        title=f"{app.title} - ReDoc",
        redoc_js_url="https://cdn.jsdelivr.net/npm/redoc@2.0.0/bundles/redoc.standalone.js",
    )

# Customize OpenAPI schema
def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
        
    openapi_schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )
    
    # Add API key security scheme
    openapi_schema["components"] = openapi_schema.get("components", {})
    openapi_schema["components"]["securitySchemes"] = {
        "ApiKeyAuth": {
            "type": "apiKey",
            "in": "header",
            "name": settings.API_KEY_HEADER,
        }
    }
    
    # Apply security globally
    openapi_schema["security"] = [{"ApiKeyAuth": []}]
    
    # Add example requests for key endpoints
    
    # Example for MCP JSON-RPC
    if "/mcp/jsonrpc" in openapi_schema["paths"]:
        openapi_schema["paths"]["/mcp/jsonrpc"]["post"]["requestBody"] = {
            "content": {
                "application/json": {
                    "examples": {
                        "list_tools": {
                            "summary": "List available tools",
                            "value": {
                                "jsonrpc": "2.0",
                                "method": "list_tools",
                                "id": "request1"
                            }
                        },
                        "execute_tool": {
                            "summary": "Execute a tool",
                            "value": {
                                "jsonrpc": "2.0",
                                "method": "execute_tool",
                                "params": {
                                    "name": "echo",
                                    "parameters": {
                                        "message": "Hello, World!"
                                    }
                                },
                                "id": "request2"
                            }
                        }
                    }
                }
            }
        }
    
    # Add tags for better organization
    tag_descriptions = [
        {"name": "MCP", "description": "Model-Context Protocol endpoints for tool execution and discovery"},
        {"name": "Auth", "description": "Authentication and authorization endpoints"},
        {"name": "Sessions", "description": "Test session management"},
        {"name": "Resources", "description": "Resource storage and retrieval"},
        {"name": "Telemetry", "description": "Performance monitoring and diagnostics"}
    ]
    
    openapi_schema["tags"] = tag_descriptions
    
    app.openapi_schema = openapi_schema
    return app.openapi_schema

app.openapi = custom_openapi 