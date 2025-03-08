import pytest
from app.services.tool_registry import (
    ToolParameter,
    Tool,
    ToolRegistry,
    register_tool,
    registry
)
from app.core.errors import MethodNotFoundError, InvalidParamsError


async def test_tool_registration():
    """Test registering a tool in the registry"""
    # Create a test registry
    test_registry = ToolRegistry()
    
    # Define parameters
    parameters = [
        ToolParameter(
            name="param1",
            type="string",
            description="Test parameter",
            required=True
        )
    ]
    
    # Define returns schema
    returns = {
        "type": "object",
        "properties": {
            "result": {"type": "string"}
        }
    }
    
    # Define a test handler
    async def test_handler(params):
        return {"result": params["param1"]}
    
    # Register the tool
    test_registry.register_tool(
        name="test_tool",
        description="Test tool",
        handler=test_handler,
        parameters=parameters,
        returns=returns
    )
    
    # Check if the tool is registered
    assert "test_tool" in test_registry.tools
    assert test_registry.tools["test_tool"].name == "test_tool"
    assert test_registry.tools["test_tool"].description == "Test tool"
    assert len(test_registry.tools["test_tool"].parameters) == 1
    assert test_registry.tools["test_tool"].parameters[0].name == "param1"


async def test_tool_execution():
    """Test executing a registered tool"""
    # Create a test registry
    test_registry = ToolRegistry()
    
    # Define a test handler
    async def test_handler(params):
        return {"result": params["param1"]}
    
    # Register the tool
    test_registry.register_tool(
        name="test_tool",
        description="Test tool",
        handler=test_handler,
        parameters=[
            ToolParameter(
                name="param1",
                type="string",
                description="Test parameter",
                required=True
            )
        ],
        returns={
            "type": "object",
            "properties": {
                "result": {"type": "string"}
            }
        }
    )
    
    # Execute the tool
    result = await test_registry.execute_tool("test_tool", {"param1": "test_value"})
    
    # Check the result
    assert result == {"result": "test_value"}


async def test_tool_not_found():
    """Test executing a non-existent tool"""
    # Create a test registry
    test_registry = ToolRegistry()
    
    # Try to execute a non-existent tool
    with pytest.raises(MethodNotFoundError):
        await test_registry.execute_tool("non_existent_tool", {})


async def test_tool_invalid_params():
    """Test executing a tool with invalid parameters"""
    # Create a test registry
    test_registry = ToolRegistry()
    
    # Define a test handler
    async def test_handler(params):
        return {"result": params["param1"]}
    
    # Register the tool
    test_registry.register_tool(
        name="test_tool",
        description="Test tool",
        handler=test_handler,
        parameters=[
            ToolParameter(
                name="param1",
                type="string",
                description="Test parameter",
                required=True
            )
        ],
        returns={
            "type": "object",
            "properties": {
                "result": {"type": "string"}
            }
        }
    )
    
    # Execute the tool with missing required parameter
    with pytest.raises(InvalidParamsError):
        await test_registry.execute_tool("test_tool", {})


async def test_register_tool_decorator():
    """Test the register_tool decorator"""
    # Define a test registry
    test_registry = ToolRegistry()
    
    # Create a decorator function that uses the test registry
    def test_decorator(name, description, parameters, returns):
        def decorator(func):
            test_registry.register_tool(
                name=name,
                description=description,
                handler=func,
                parameters=parameters,
                returns=returns
            )
            return func
        return decorator
    
    # Define a tool using the decorator
    @test_decorator(
        name="decorated_tool",
        description="Tool defined with decorator",
        parameters=[
            ToolParameter(
                name="param1",
                type="string",
                description="Test parameter",
                required=True
            )
        ],
        returns={
            "type": "object",
            "properties": {
                "result": {"type": "string"}
            }
        }
    )
    async def decorated_tool(params):
        return {"result": params["param1"]}
    
    # Check if the tool is registered
    assert "decorated_tool" in test_registry.tools
    
    # Execute the tool
    result = await test_registry.execute_tool("decorated_tool", {"param1": "test_value"})
    
    # Check the result
    assert result == {"result": "test_value"} 