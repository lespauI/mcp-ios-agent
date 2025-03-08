from app.services.tool_registry import register_tool, ToolParameter
import time
import platform
import random


@register_tool(
    name="echo",
    description="Echo back the input message",
    parameters=[
        ToolParameter(
            name="message",
            type="str",
            description="Message to echo",
            required=True
        )
    ],
    returns={"type": "object", "properties": {"message": {"type": "string"}}}
)
async def echo(params):
    """Echo the message back"""
    return {"message": params["message"]}


@register_tool(
    name="get_server_info",
    description="Get information about the server",
    parameters=[],
    returns={
        "type": "object",
        "properties": {
            "platform": {"type": "string"},
            "python_version": {"type": "string"},
            "time": {"type": "number"}
        }
    }
)
async def get_server_info(params):
    """Get information about the server"""
    return {
        "platform": platform.platform(),
        "python_version": platform.python_version(),
        "time": time.time()
    }


@register_tool(
    name="random_number",
    description="Generate a random number within a range",
    parameters=[
        ToolParameter(
            name="min",
            type="int",
            description="Minimum value (inclusive)",
            required=False,
            default=0
        ),
        ToolParameter(
            name="max",
            type="int",
            description="Maximum value (inclusive)",
            required=False,
            default=100
        )
    ],
    returns={"type": "object", "properties": {"number": {"type": "number"}}}
)
async def random_number(params):
    """Generate a random number within a range"""
    min_val = params.get("min", 0)
    max_val = params.get("max", 100)
    
    if min_val > max_val:
        min_val, max_val = max_val, min_val
        
    return {"number": random.randint(min_val, max_val)} 