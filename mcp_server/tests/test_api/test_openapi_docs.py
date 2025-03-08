import pytest
from fastapi.testclient import TestClient
from app.main import app, custom_openapi

client = TestClient(app)

def test_custom_swagger_ui():
    """Test the custom Swagger UI documentation endpoint"""
    response = client.get("/docs")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    
    # Check that the HTML contains expected elements
    html_content = response.text
    assert "swagger-ui" in html_content
    assert app.title in html_content
    
    # Check that custom JS and CSS URLs are included
    assert "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.9.0/swagger-ui-bundle.js" in html_content
    assert "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.9.0/swagger-ui.css" in html_content
    
    # Check for custom Swagger UI parameters (indirect check as they're JS params)
    assert "persistAuthorization" in html_content
    assert "tryItOutEnabled" in html_content
    assert "displayRequestDuration" in html_content

def test_custom_redoc():
    """Test the custom ReDoc documentation endpoint"""
    response = client.get("/redoc")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    
    # Check that the HTML contains expected elements
    html_content = response.text
    assert "redoc" in html_content.lower()
    assert app.title in html_content
    
    # Check that custom JS URL is included
    assert "https://cdn.jsdelivr.net/npm/redoc@2.0.0/bundles/redoc.standalone.js" in html_content

def test_openapi_json():
    """Test the OpenAPI JSON schema endpoint"""
    response = client.get("/api/openapi.json")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/json"
    
    # Parse JSON schema
    openapi_schema = response.json()
    
    # Verify basic structure
    assert "openapi" in openapi_schema
    assert "info" in openapi_schema
    assert "paths" in openapi_schema
    assert "components" in openapi_schema
    
    # Verify info section
    assert openapi_schema["info"]["title"] == app.title
    assert "version" in openapi_schema["info"]
    assert "description" in openapi_schema["info"]
    
    # Verify security scheme
    assert "securitySchemes" in openapi_schema["components"]
    assert "ApiKeyAuth" in openapi_schema["components"]["securitySchemes"]
    assert openapi_schema["components"]["securitySchemes"]["ApiKeyAuth"]["type"] == "apiKey"
    assert openapi_schema["components"]["securitySchemes"]["ApiKeyAuth"]["in"] == "header"
    
    # Verify global security
    assert "security" in openapi_schema
    assert [{"ApiKeyAuth": []}] == openapi_schema["security"]
    
    # Verify tags are present
    assert "tags" in openapi_schema
    tag_names = [tag["name"] for tag in openapi_schema["tags"]]
    assert "MCP" in tag_names
    assert "Auth" in tag_names
    assert "Sessions" in tag_names
    assert "Resources" in tag_names
    assert "Telemetry" in tag_names

def test_custom_openapi_function():
    """Test the custom_openapi function directly"""
    # Cache the original schema
    original_schema = app.openapi_schema
    app.openapi_schema = None
    
    # Get the schema using our custom function
    schema = custom_openapi()
    
    # Restore original schema
    app.openapi_schema = original_schema
    
    # Check the schema
    assert "components" in schema
    assert "securitySchemes" in schema["components"]
    assert "ApiKeyAuth" in schema["components"]["securitySchemes"]
    
    # Check for example requests if the path exists
    if "/mcp/jsonrpc" in schema["paths"]:
        # Check if examples were added
        path = schema["paths"]["/mcp/jsonrpc"]["post"]
        assert "requestBody" in path
        assert "content" in path["requestBody"]
        assert "application/json" in path["requestBody"]["content"]
        assert "examples" in path["requestBody"]["content"]["application/json"]
        
        # Check that the list_tools example is present
        examples = path["requestBody"]["content"]["application/json"]["examples"]
        assert "list_tools" in examples
        assert "execute_tool" in examples
        
        # Verify the example content
        assert examples["list_tools"]["value"]["method"] == "list_tools"
        assert examples["execute_tool"]["value"]["method"] == "execute_tool"
        assert "parameters" in examples["execute_tool"]["value"]["params"]

def test_health_endpoint():
    """Test the health check endpoint"""
    response = client.get("/health")
    assert response.status_code == 200
    
    data = response.json()
    assert data["status"] == "healthy"
    assert "version" in data
    assert "timestamp" in data
    assert isinstance(data["timestamp"], (int, float)) 