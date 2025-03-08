#!/usr/bin/env python3
import pytest
import os
import sys

def main():
    """Run tests for the MCP server"""
    # Get the directory of this script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Add the parent directory to path so we can import the app
    sys.path.insert(0, os.path.dirname(script_dir))
    
    # Run the tests
    args = [
        "tests",  # Test directory
        "-v",     # Verbose output
        "--cov=app",  # Coverage for app package
        "--cov-report=term",  # Coverage report format
    ]
    
    # Add any command line arguments
    args.extend(sys.argv[1:])
    
    # Run the tests
    exit_code = pytest.main(args)
    
    # Exit with the pytest exit code
    sys.exit(exit_code)

if __name__ == "__main__":
    main() 