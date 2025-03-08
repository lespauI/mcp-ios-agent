import pytest
import asyncio
import json
from app.services.sse import SSEManager


@pytest.fixture
def sse_manager():
    """Create a test SSE manager"""
    return SSEManager()


async def test_register_client(sse_manager):
    """Test registering a client"""
    client_id = "test-client-1"
    registered_id = await sse_manager.register_client(client_id)
    
    assert registered_id == client_id
    assert client_id in sse_manager.clients
    assert isinstance(sse_manager.clients[client_id], asyncio.Queue)


async def test_send_event(sse_manager):
    """Test sending an event to a client"""
    client_id = "test-client-1"
    await sse_manager.register_client(client_id)
    
    # Send an event
    data = {"message": "test message"}
    event_type = "test_event"
    success = await sse_manager.send_event(client_id, data, event_type)
    
    assert success
    
    # Check the queue
    queue = sse_manager.clients[client_id]
    assert queue.qsize() == 1
    
    # Get the event from the queue
    event = queue.get_nowait()
    assert event["data"] == json.dumps(data)
    assert event["event"] == event_type


async def test_broadcast(sse_manager):
    """Test broadcasting events to all clients"""
    # Register multiple clients
    client_ids = ["test-client-1", "test-client-2", "test-client-3"]
    for client_id in client_ids:
        await sse_manager.register_client(client_id)
    
    # Broadcast an event
    data = {"message": "broadcast message"}
    event_type = "broadcast_event"
    await sse_manager.broadcast(data, event_type)
    
    # Check all queues received the event
    for client_id in client_ids:
        queue = sse_manager.clients[client_id]
        assert queue.qsize() == 1
        
        event = queue.get_nowait()
        assert event["data"] == json.dumps(data)
        assert event["event"] == event_type


async def test_broadcast_with_exclude(sse_manager):
    """Test broadcasting events with exclusions"""
    # Register multiple clients
    client_ids = ["test-client-1", "test-client-2", "test-client-3"]
    for client_id in client_ids:
        await sse_manager.register_client(client_id)
    
    # Broadcast an event with exclusion
    data = {"message": "broadcast message"}
    event_type = "broadcast_event"
    exclude = ["test-client-2"]  # Exclude client 2
    await sse_manager.broadcast(data, event_type, exclude)
    
    # Check clients 1 and 3 received the event, but not client 2
    for client_id in client_ids:
        queue = sse_manager.clients[client_id]
        
        if client_id in exclude:
            assert queue.qsize() == 0
        else:
            assert queue.qsize() == 1
            event = queue.get_nowait()
            assert event["data"] == json.dumps(data)
            assert event["event"] == event_type


async def test_unregister_client(sse_manager):
    """Test unregistering a client"""
    client_id = "test-client-1"
    await sse_manager.register_client(client_id)
    
    # Unregister the client
    await sse_manager.unregister_client(client_id)
    
    # Check the client is removed
    assert client_id not in sse_manager.clients 