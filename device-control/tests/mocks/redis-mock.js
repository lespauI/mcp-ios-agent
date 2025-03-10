// Mock implementation of the Redis client
const createClient = jest.fn().mockImplementation(() => {
  return {
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    ping: jest.fn().mockResolvedValue('PONG'),
    quit: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    exists: jest.fn().mockResolvedValue(0),
    expire: jest.fn().mockResolvedValue(1),
    keys: jest.fn().mockResolvedValue([]),
    hGet: jest.fn().mockResolvedValue(null),
    hSet: jest.fn().mockResolvedValue(1),
    hGetAll: jest.fn().mockResolvedValue({}),
    hDel: jest.fn().mockResolvedValue(1),
    multi: jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue([])
    }),
    json: {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK')
    }
  };
});

// Export the mock functions to match the Redis module API
module.exports = {
  createClient,
  RedisClientType: {}
}; 