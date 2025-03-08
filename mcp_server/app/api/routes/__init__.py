from fastapi import APIRouter
from app.api.routes import mcp, resources, sessions, auth, telemetry

# Create a combined router for all API endpoints
api_router = APIRouter()

# Include all route modules with appropriate prefixes and tags
api_router.include_router(mcp.router, prefix="/mcp", tags=["MCP"])
api_router.include_router(resources.router, prefix="/resources", tags=["Resources"])
api_router.include_router(sessions.router, prefix="/sessions", tags=["Sessions"])
api_router.include_router(auth.router, prefix="/auth", tags=["Auth"])
api_router.include_router(telemetry.router, prefix="/telemetry", tags=["Telemetry"]) 