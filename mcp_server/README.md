# MCP iOS Testing Server

A server that implements the Model-Context Protocol (MCP) for iOS application testing. It provides tools for controlling iOS devices, capturing screenshots, analyzing UI elements, and automating test flows.

## Features

- MCP-compliant JSON-RPC API
- Tool discovery and execution
- Resource management (screenshots, XML hierarchies, etc.)
- Session management for test contexts
- Authentication and authorization
- Advanced telemetry and monitoring
- Environment-specific configuration
- Optimized Redis connection pooling
- Robust error handling and recovery

## Architecture

The server is built with FastAPI and follows a modular architecture:

- **API Layer**: Handles HTTP/SSE requests and responses
- **Service Layer**: Contains business logic and tool implementations
- **Model Layer**: Defines data structures and validation
- **Core Layer**: Provides configuration, utilities, and error handling

## Prerequisites

- Python 3.8+
- Redis server
- NodeJS 14+ (for frontend development)

## Installation

### Using Docker Compose (Recommended)

```bash
# Clone the repository
git clone https://github.com/your-org/ios-automation-agent.git
cd ios-automation-agent/mcp-server

# Create a .env file from the example
cp .env.example .env

# Start the server
docker-compose up -d
```

### Manual Setup

```bash
# Clone the repository
git clone https://github.com/your-org/ios-automation-agent.git
cd ios-automation-agent/mcp-server

# Create a virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create a .env file from the example
cp .env.example .env

# Start Redis (in a separate terminal)
redis-server

# Start the server
uvicorn app.main:app --reload
```

## Configuration

The server can be configured using environment variables or `.env` files. The system supports environment-specific configuration files:

- `.env` - Default configuration
- `.env.dev` - Development environment configuration
- `.env.test` - Testing environment configuration
- `.env.prod` - Production environment configuration

Set the `ENVIRONMENT` variable to select the appropriate configuration file.

### Key Configuration Options

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 8000 |
| `HOST` | Server host | 0.0.0.0 |
| `DEBUG` | Enable debug mode | False |
| `REDIS_HOST` | Redis server host | redis |
| `REDIS_PORT` | Redis server port | 6379 |
| `REDIS_POOL_SIZE` | Redis connection pool size | 20 |
| `SESSION_TTL` | Session time-to-live in seconds | 3600 |
| `SECRET_KEY` | Secret key for JWT encoding | CHANGE_THIS_IN_PRODUCTION |
| `MAX_RESOURCE_SIZE_BYTES` | Maximum resource size in bytes | 104857600 (100MB) |
| `ENABLE_DETAILED_METRICS` | Enable detailed telemetry metrics | True |

## API Documentation

Once the server is running, you can access the API documentation at:

- Swagger UI: [http://localhost:8000/docs](http://localhost:8000/docs)
- ReDoc: [http://localhost:8000/redoc](http://localhost:8000/redoc)

## MCP Protocol

The server implements the Model-Context Protocol, a standard for connecting AI models with tools and resources. The protocol uses JSON-RPC 2.0 for communication and supports both request-response and streaming patterns.

### Key Endpoints

- `/mcp/jsonrpc` - JSON-RPC endpoint for tool execution
- `/mcp/events/{client_id}` - SSE endpoint for real-time events
- `/api/v1/resources` - Resource storage and retrieval
- `/api/v1/sessions` - Session management
- `/api/v1/auth` - Authentication and authorization

## Available Tools

The server provides various tools for iOS testing:

- **Basic Tools**
  - `echo` - Echo back a message (for testing)
  - `get_server_info` - Get server information
  - `random_number` - Generate a random number

- **Device Control Tools**
  - *(Coming soon)*

- **UI Interaction Tools**
  - *(Coming soon)*

- **App Control Tools**
  - *(Coming soon)*

## Advanced Features

### Redis Connection Pooling

The server uses a sophisticated Redis connection pooling system to handle high concurrent loads. Connection pools are configured with:

- Minimum and maximum connections
- Idle connection timeout
- Connection health checks
- Automatic reconnection with exponential backoff

### Enhanced Telemetry

The telemetry system provides detailed insights into server performance:

- Operation tracking with timing and resource usage
- Tool execution statistics (success rates, response times)
- System metrics (CPU, memory, etc.)
- Customizable metrics retention
- Performance monitoring for Redis connections, file I/O and network operations

### Robust Error Handling

The server includes a comprehensive error handling system:

- Categorized error types with standard error codes
- Resource-specific error handling
- Graceful error recovery
- Detailed error reporting for debugging

## Testing

The server includes a comprehensive test suite:

```bash
# Run all tests
pytest

# Run tests with coverage
pytest --cov=app

# Run specific test categories
pytest tests/test_api/
pytest tests/test_services/
pytest tests/test_core/
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -am 'Add my feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details. 