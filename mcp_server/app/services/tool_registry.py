from typing import Dict, List, Optional, Any, Callable, Awaitable, Union, Type
from pydantic import BaseModel, Field, create_model, ValidationError
import json
import inspect
import logging
from app.core.errors import InvalidParamsError, MethodNotFoundError

logger = logging.getLogger(__name__)


class ToolParameter(BaseModel):
    name: str
    type: str
    description: str
    required: bool = False
    default: Optional[Any] = None
    enum: Optional[List[Any]] = None


class Tool(BaseModel):
    name: str
    description: str
    parameters: List[ToolParameter]
    returns: Dict[str, Any]
    schema: Dict[str, Any]  # JSON Field definition
    handler: Optional[Callable] = None

    class Config:
        arbitrary_types_allowed = True


class ToolRegistry:
    def __init__(self):
        self.tools: Dict[str, Tool] = {}
    
    def register_tool(
        self,
        name: str,
        description: str,
        handler: Callable[[Dict[str, Any]], Awaitable[Any]],
        parameters: List[ToolParameter],
        returns: Dict[str, Any]
    ) -> None:
        """Register a new tool with the registry"""
        # Create JSON Field for parameters
        properties = {}
        required = []
        
        for param in parameters:
            param_schema = {
                "type": param.type.lower(),  # Convert to lowercase for JSON schema types
                "description": param.description
            }
            
            if param.enum:
                param_schema["enum"] = param.enum
                
            if param.default is not None:
                param_schema["default"] = param.default
                
            if param.required:
                required.append(param.name)
                
            properties[param.name] = param_schema
        
        # Create the complete schema
        schema = {
            "type": "object",
            "properties": properties
        }
        
        if required:
            schema["required"] = required
            
        # Store the tool definition with handler
        self.tools[name] = Tool(
            name=name,
            description=description,
            parameters=parameters,
            returns=returns,
            schema=schema,
            handler=handler
        )
        
        logger.info(f"Registered tool: {name}")
        
    def get_tool(self, name: str) -> Optional[Tool]:
        """Get a tool by name"""
        return self.tools.get(name)
        
    def list_tools(self) -> List[Dict[str, Any]]:
        """List all registered tools"""
        return [
            {
                "name": tool.name,
                "description": tool.description,
                "parameters": [p.model_dump() for p in tool.parameters],
                "returns": tool.returns,
                "schema": tool.schema
            }
            for tool in self.tools.values()
        ]
        
    async def execute_tool(self, name: str, params: Dict[str, Any]) -> Any:
        """Execute a tool with the given parameters"""
        tool = self.get_tool(name)
        if not tool:
            raise MethodNotFoundError(f"Tool not found: {name}")
            
        # Validate parameters against schema
        try:
            # Create a dynamic model for validation
            prop_dict = {}
            type_map = {
                'string': str,
                'integer': int,
                'number': float,
                'boolean': bool,
                'array': list,
                'object': dict
            }
            
            for param in tool.parameters:
                param_type = type_map.get(param.type.lower(), str)
                if param.required:
                    prop_dict[param.name] = (param_type, ...)
                else:
                    prop_dict[param.name] = (Optional[param_type], param.default)
                    
            ValidationModel = create_model('ValidationModel', **prop_dict)
            
            # Validate the input parameters
            validated_params = ValidationModel(**params).model_dump(exclude_unset=True)
            
            # Execute the handler
            if tool.handler:
                result = await tool.handler(validated_params)
                return result
            else:
                raise InvalidParamsError("Tool handler not found")
        except ValidationError as e:
            raise InvalidParamsError(
                message=f"Invalid parameters for tool: {name}",
                data={"errors": e.errors()}
            )
        except Exception as e:
            logger.exception(f"Error executing tool {name}")
            raise


# Create a decorator for registering tools
def register_tool(
    name: str,
    description: str,
    parameters: List[ToolParameter],
    returns: Dict[str, Any]
):
    """Decorator for registering tools"""
    def decorator(func: Callable):
        # Ensure the function is registered with the registry
        registry.register_tool(
            name=name,
            description=description,
            handler=func,
            parameters=parameters,
            returns=returns
        )
        return func
    return decorator


# Create a singleton instance
registry = ToolRegistry() 