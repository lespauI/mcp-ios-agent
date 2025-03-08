from pydantic import BaseModel, Field, field_validator, RootModel
from typing import Optional, Dict, Any, List, Union, Literal
import uuid


class JSONRPCBaseRequest(BaseModel):
    jsonrpc: Literal["2.0"] = "2.0"
    id: Optional[Union[str, int]] = None
    
    def __init__(self, **data):
        if "id" not in data:
            data["id"] = str(uuid.uuid4())
        super().__init__(**data)


class JSONRPCRequest(JSONRPCBaseRequest):
    method: str
    params: Optional[Dict[str, Any]] = None


class JSONRPCNotification(BaseModel):
    jsonrpc: Literal["2.0"] = "2.0"
    method: str
    params: Optional[Dict[str, Any]] = None


class JSONRPCSuccessResponse(JSONRPCBaseRequest):
    result: Any = None


class JSONRPCErrorDetail(BaseModel):
    code: int
    message: str
    data: Optional[Dict[str, Any]] = None


class JSONRPCErrorResponse(JSONRPCBaseRequest):
    error: JSONRPCErrorDetail


class JSONRPCBatchRequest(RootModel):
    root: List[Union[JSONRPCRequest, JSONRPCNotification]]
    
    @field_validator('root')
    def validate_batch(cls, v):
        if len(v) == 0:
            raise ValueError("Batch must not be empty")
        return v


class JSONRPCBatchResponse(RootModel):
    root: List[Union[JSONRPCSuccessResponse, JSONRPCErrorResponse]]


# This type alias was missing and is needed elsewhere in the code
JSONRPCResponse = Union[JSONRPCSuccessResponse, JSONRPCErrorResponse]


class JsonRpc(BaseModel):
    jsonrpc: Literal["2.0"] = "2.0"
    method: str
    params: Optional[Dict[str, Any]] = None
    id: Optional[Union[int, str]] = None
    
    @field_validator('jsonrpc')
    def check_jsonrpc(cls, v):
        if v != "2.0":
            raise ValueError("JSON-RPC version must be 2.0")
        return v
