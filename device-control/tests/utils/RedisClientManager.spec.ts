import { jest, expect, describe, it, beforeEach, afterEach } from '@jest/globals';
import { RedisClientManager } from '../../src/utils/RedisClientManager';

// Mock Redis module
jest.mock('redis', () => {
  const mockClient = {
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockImplementation(async (key) => {
      if (key === 'test:existing') return JSON.stringify({ data: 'test' });
      return null;
    }),
    del: jest.fn().mockResolvedValue(1),
    keys: jest.fn().mockResolvedValue(['test:key1', 'test:key2']),
    exists: jest.fn().mockImplementation(async (key) => {
      return key === 'test:existing' ? 1 : 0;
    }),
    expire: jest.fn().mockResolvedValue(1),
  };

  return {
    createClient: jest.fn().mockReturnValue(mockClient)
  };
});

describe('RedisClientManager', () => {
  let redisManager: RedisClientManager;
  
  beforeEach(() => {
    jest.clearAllMocks();
    redisManager = new RedisClientManager({
      url: 'redis://localhost:6379',
      prefix: 'test:'
    });
  });
  
  afterEach(async () => {
    try {
      await redisManager.disconnect().catch(() => {});
    } catch (error) {
      console.warn('Error disconnecting Redis in afterEach:', error);
    }
  });
  
  describe('connection management', () => {
    it('should connect to Redis server', async () => {
      await redisManager.connect();
      
      const redis = require('redis');
      const mockClient = redis.createClient();
      
      expect(redis.createClient).toHaveBeenCalledWith(expect.objectContaining({
        url: 'redis://localhost:6379'
      }));
      expect(mockClient.connect).toHaveBeenCalled();
    });
    
    it('should disconnect from Redis server', async () => {
      await redisManager.connect();
      await redisManager.disconnect();
      
      const redis = require('redis');
      const mockClient = redis.createClient();
      
      expect(mockClient.disconnect).toHaveBeenCalled();
    });
    
    it('should handle connection errors', async () => {
      const redis = require('redis');
      const mockClient = redis.createClient();
      
      // Mock connection error
      mockClient.connect.mockRejectedValueOnce(new Error('Connection failed'));
      
      await expect(redisManager.connect()).rejects.toThrow('Connection failed');
    });
  });
  
  describe('cache operations', () => {
    beforeEach(async () => {
      await redisManager.connect();
    });
    
    afterEach(async () => {
      try {
        await redisManager.disconnect();
      } catch (error) {
        console.warn('Error disconnecting Redis in cache operations afterEach:', error);
      }
    });
    
    it('should store data in Redis', async () => {
      const data = { id: '123', name: 'test' };
      await redisManager.set('key1', data);
      
      const redis = require('redis');
      const mockClient = redis.createClient();
      
      expect(mockClient.set).toHaveBeenCalledWith(
        'test:key1',
        JSON.stringify(data)
      );
    });
    
    it('should retrieve data from Redis', async () => {
      const result = await redisManager.get('existing');
      
      expect(result).toEqual({ data: 'test' });
      
      const redis = require('redis');
      const mockClient = redis.createClient();
      
      expect(mockClient.get).toHaveBeenCalledWith('test:existing');
    });
    
    it('should return null when key does not exist', async () => {
      const result = await redisManager.get('nonexistent');
      
      expect(result).toBeNull();
    });
    
    it('should delete data from Redis', async () => {
      await redisManager.delete('key1');
      
      const redis = require('redis');
      const mockClient = redis.createClient();
      
      expect(mockClient.del).toHaveBeenCalledWith('test:key1');
    });
    
    it('should check if key exists in Redis', async () => {
      expect(await redisManager.exists('existing')).toBe(true);
      expect(await redisManager.exists('nonexistent')).toBe(false);
      
      const redis = require('redis');
      const mockClient = redis.createClient();
      
      expect(mockClient.exists).toHaveBeenCalledTimes(2);
    });
    
    it('should set expiration time for a key', async () => {
      await redisManager.setExpiry('key1', 3600);
      
      const redis = require('redis');
      const mockClient = redis.createClient();
      
      expect(mockClient.expire).toHaveBeenCalledWith('test:key1', 3600);
    });
    
    it('should retrieve all keys matching a pattern', async () => {
      const keys = await redisManager.getKeys('key*');
      
      expect(keys).toEqual(['key1', 'key2']);
      
      const redis = require('redis');
      const mockClient = redis.createClient();
      
      expect(mockClient.keys).toHaveBeenCalledWith('test:key*');
    });
  });
}); 