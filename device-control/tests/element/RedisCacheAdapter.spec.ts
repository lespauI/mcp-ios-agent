import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { RedisCacheAdapter } from '../../src/element/RedisCacheAdapter';
import { RedisClientManager } from '../../src/utils/RedisClientManager';

// Mock the RedisClientManager
jest.mock('../../src/utils/RedisClientManager', () => {
  return {
    RedisClientManager: jest.fn().mockImplementation(() => {
      return {
        connect: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined),
        set: jest.fn().mockResolvedValue(undefined),
        get: jest.fn().mockImplementation(async (key) => {
          if (key === 'existing') {
            return {
              elementId: 'test-id',
              timestamp: Date.now(),
              strategy: 'id',
              selector: 'test-selector'
            };
          }
          return null;
        }),
        delete: jest.fn().mockResolvedValue(undefined),
        exists: jest.fn().mockImplementation(async (key) => {
          return key === 'existing';
        }),
        setExpiry: jest.fn().mockResolvedValue(undefined),
        getKeys: jest.fn().mockResolvedValue(['element1', 'element2']),
        flushKeys: jest.fn().mockResolvedValue(2),
        isClientConnected: jest.fn().mockReturnValue(true)
      };
    })
  };
});

describe('RedisCacheAdapter', () => {
  let cacheAdapter: RedisCacheAdapter;
  let mockRedisManager: any;
  
  beforeEach(() => {
    jest.clearAllMocks();
    cacheAdapter = new RedisCacheAdapter({
      prefix: 'element:',
      ttl: 3600
    });
    mockRedisManager = (RedisClientManager as jest.Mock).mock.results[0].value;
  });
  
  describe('initialization', () => {
    it('should create a Redis client manager', () => {
      expect(RedisClientManager).toHaveBeenCalledWith({
        prefix: 'element:',
        url: expect.any(String)
      });
    });
    
    it('should connect to Redis', async () => {
      await cacheAdapter.initialize();
      
      expect(mockRedisManager.connect).toHaveBeenCalled();
    });
  });
  
  describe('element cache operations', () => {
    beforeEach(async () => {
      await cacheAdapter.initialize();
    });
    
    it('should store element in cache', async () => {
      const elementData = {
        elementId: 'test-id',
        timestamp: Date.now(),
        strategy: 'id',
        selector: 'test-selector'
      };
      
      await cacheAdapter.setElement('test-key', elementData);
      
      expect(mockRedisManager.set).toHaveBeenCalledWith(
        'test-key',
        elementData,
        3600
      );
    });
    
    it('should retrieve element from cache', async () => {
      const result = await cacheAdapter.getElement('existing');
      
      expect(result).toEqual({
        elementId: 'test-id',
        timestamp: expect.any(Number),
        strategy: 'id',
        selector: 'test-selector'
      });
      
      expect(mockRedisManager.get).toHaveBeenCalledWith('existing');
    });
    
    it('should return null when element is not found', async () => {
      const result = await cacheAdapter.getElement('nonexistent');
      
      expect(result).toBeNull();
    });
    
    it('should remove element from cache', async () => {
      await cacheAdapter.removeElement('test-key');
      
      expect(mockRedisManager.delete).toHaveBeenCalledWith('test-key');
    });
    
    it('should check if element exists in cache', async () => {
      expect(await cacheAdapter.hasElement('existing')).toBe(true);
      expect(await cacheAdapter.hasElement('nonexistent')).toBe(false);
    });
    
    it('should get all cache keys', async () => {
      const keys = await cacheAdapter.getAllKeys();
      
      expect(keys).toEqual(['element1', 'element2']);
      expect(mockRedisManager.getKeys).toHaveBeenCalledWith('*');
    });
    
    it('should clear all elements from cache', async () => {
      await cacheAdapter.clearAll();
      
      expect(mockRedisManager.flushKeys).toHaveBeenCalledWith('*');
    });
    
    it('should update element TTL', async () => {
      await cacheAdapter.updateTTL('test-key', 7200);
      
      expect(mockRedisManager.setExpiry).toHaveBeenCalledWith('test-key', 7200);
    });
  });
  
  describe('shutdown', () => {
    it('should disconnect from Redis', async () => {
      await cacheAdapter.initialize();
      await cacheAdapter.shutdown();
      
      expect(mockRedisManager.disconnect).toHaveBeenCalled();
    });
  });
}); 