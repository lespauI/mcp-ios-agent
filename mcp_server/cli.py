#!/usr/bin/env python3
import asyncio
import argparse
import json
import sys
import os
from app.utils.testing import MCPTestClient

async def main():
    parser = argparse.ArgumentParser(description="MCP Server CLI Testing Tool")
    parser.add_argument("--url", default="http://localhost:8000", help="Base URL of the MCP server")
    parser.add_argument("--api-key", help="API key for authentication")
    
    subparsers = parser.add_subparsers(dest="command", help="Command to execute")
    
    # List tools command
    list_tools_parser = subparsers.add_parser("list-tools", help="List all available tools")
    
    # Execute tool command
    execute_tool_parser = subparsers.add_parser("execute-tool", help="Execute a tool")
    execute_tool_parser.add_argument("tool_name", help="Name of the tool to execute")
    execute_tool_parser.add_argument("--params", help="JSON string of parameters")
    
    # Create session command
    create_session_parser = subparsers.add_parser("create-session", help="Create a new session")
    create_session_parser.add_argument("--metadata", help="JSON string of metadata")
    
    # Upload resource command
    upload_resource_parser = subparsers.add_parser("upload-resource", help="Upload a file as a resource")
    upload_resource_parser.add_argument("file_path", help="Path to the file to upload")
    upload_resource_parser.add_argument("resource_type", help="Type of resource")
    upload_resource_parser.add_argument("--metadata", help="JSON string of metadata")
    upload_resource_parser.add_argument("--ttl", type=int, help="Time to live in seconds")
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return
        
    client = MCPTestClient(args.url, args.api_key)
    
    if args.command == "list-tools":
        tools = await client.list_tools()
        print(json.dumps(tools, indent=2))
        
    elif args.command == "execute-tool":
        params = json.loads(args.params) if args.params else {}
        result = await client.execute_tool(args.tool_name, params)
        print(json.dumps(result, indent=2))
        
    elif args.command == "create-session":
        metadata = json.loads(args.metadata) if args.metadata else None
        session_id = await client.create_session(metadata)
        print(f"Created session: {session_id}")
        
    elif args.command == "upload-resource":
        metadata = json.loads(args.metadata) if args.metadata else None
        uri = await client.upload_resource(
            args.file_path,
            args.resource_type,
            metadata,
            args.ttl
        )
        print(f"Uploaded resource: {uri}")

if __name__ == "__main__":
    asyncio.run(main()) 