# Error Handling in MCP iOS Testing Framework

## Unified Error Response Format

The MCP Server implements a unified error handling approach to provide consistent error responses across both HTTP REST endpoints and JSON-RPC interfaces. This ensures clients can reliably parse and handle errors regardless of the API method used.

### Error Structure

All errors follow this consistent structure:

#### HTTP REST Endpoints

```json
{
  "error_code": -32800,
  "message": "Resource not found: resource://screenshots/abcd1234.png",
  "detail": {
    "additional": "error context"
  }
}
```

- `error_code`: Integer code identifying the error type (follows JSON-RPC error code convention)
- `message`: Human-readable error message
- `detail`: Optional additional error context (may include validation errors, debug info, etc.)

The HTTP status code is also set appropriately (e.g., 404 for not found, 400 for bad request).

#### JSON-RPC Endpoints

```json
{
  "jsonrpc": "2.0",
  "id": "request-123",
  "error": {
    "code": -32800,
    "message": "Resource not found: resource://screenshots/abcd1234.png",
    "data": {
      "additional": "error context"
    }
  }
}
```

- Per JSON-RPC 2.0 spec, HTTP status code will always be 200
- Error information is contained in the `error` object
- Error codes, messages, and details are consistent with HTTP REST errors

## HTTP Status Code Handling

### REST Endpoints
- REST endpoints follow HTTP conventions with appropriate status codes
- 404 for not found resources
- 400 for bad requests
- 401 for authentication errors
- 403 for authorization errors
- 500 for server errors

### JSON-RPC Endpoints
- JSON-RPC endpoints **always** return HTTP status code 200, even for errors
- This follows the JSON-RPC 2.0 specification
- Error information is contained entirely within the response body
- Clients must check for the presence of an `error` object to detect errors

This difference is important for client implementations to understand:
- HTTP clients can rely on status codes for error detection
- JSON-RPC clients must inspect the response body structure

## Error Code Mapping

| HTTP Status | JSON-RPC Error Code | Description                  |
|-------------|---------------------|------------------------------|
| 400         | -32600              | Invalid request              |
| 404         | -32800              | Resource not found           |
| 404         | -32601              | Method not found             |
| 401         | -32000              | Authentication error         |
| 403         | -32001              | Authorization error          |
| 422         | -32602              | Invalid parameters           |
| 500         | -32603              | Internal error               |
| 400         | -32700              | Parse error                  |

## Client Error Handling

### REST API Clients

REST API clients should:
1. Check the HTTP status code first
2. Parse the response body for detailed error information
3. Use the `error_code` to identify specific error types
4. Use the `message` for user display
5. Use `detail` for debugging or additional context

### JSON-RPC Clients

JSON-RPC clients should:
1. Check if the response contains an `error` object
2. Use the `error.code` to identify specific error types
3. Use the `error.message` for user display
4. Use `error.data` for debugging or additional context

## Common Error Scenarios

### Resource Not Found

```json
{
  "error_code": -32800,
  "message": "Resource not found: resource://screenshots/abcd1234.png",
  "detail": null
}
```

### Authentication Error

```json
{
  "error_code": -32000,
  "message": "Invalid API key",
  "detail": null
}
```

### Validation Error

```json
{
  "error_code": -32602,
  "message": "Validation Error",
  "detail": {
    "errors": [
      {
        "loc": ["body", "tool_name"],
        "msg": "field required",
        "type": "value_error.missing"
      }
    ]
  }
}
```

## Internal Implementation

The unified error handling is implemented through:

1. A core `UnifiedErrorResponse` model that can be converted to either HTTP or JSON-RPC format
2. An `ErrorConverter` that translates between different error types
3. A global exception handler that detects the request type and formats errors appropriately
4. A standardized mapping between HTTP status codes and JSON-RPC error codes

This approach ensures that all errors in the system are presented in a consistent, predictable format that clients can easily parse and handle. 