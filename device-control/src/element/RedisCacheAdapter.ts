import { Logger } from '../utils/Logger';
import { RedisClientManager, RedisClientOptions } from '../utils/RedisClientManager';
import { ElementLocatorStrategy } from '../types';
import { MemoryManager, MemoryEventType } from '../utils/MemoryManager';

/**
 * Interface for element cache data
 */
export interface ElementCacheData {
  strategy: ElementLocatorStrategy;
  selector: string;
  elementId: string;
  lastAccessed: number;
  metadata?: Record<string, any>;
  parent?: string;
  expires?: number;
  children?: string[]; // Array of child element cache keys
  timestamp?: number; // Timestamp when the element was cached
}

/**
 * Options for the Redis cache adapter
 */
export interface RedisCacheAdapterOptions {
  url?: string;
  prefix?: string;
  ttl?: number;
  connectionOptions?: Partial<RedisClientOptions>;
  memoryManagement?: {
    enabled: boolean;
    pruneOnMemoryPressure?: boolean;
    pruneThreshold?: number;
  };
}

/**
 * RedisCacheAdapter provides Redis-backed storage for element caching
 * It can be used as an alternative to in-memory storage for better persistence and sharing
 */
export class RedisCacheAdapter {
  private logger = new Logger('RedisCacheAdapter');
  private redisManager: RedisClientManager;
  private options: RedisCacheAdapterOptions;
  private defaultTtl: number;
  private initialized: boolean = false;
  private memoryManager: MemoryManager;
  private memoryListenersRegistered: boolean = false;

  /**
   * Creates a new RedisCacheAdapter
   * 
   * @param options Configuration options
   */
  constructor(options: RedisCacheAdapterOptions = {}) {
    this.options = {
      url: options.url || 'redis://localhost:6379',
      prefix: options.prefix || 'element:',
      ttl: options.ttl || 3600, // 1 hour default TTL
      connectionOptions: options.connectionOptions || {},
      memoryManagement: {
        enabled: options.memoryManagement?.enabled ?? true,
        pruneOnMemoryPressure: options.memoryManagement?.pruneOnMemoryPressure ?? true,
        pruneThreshold: options.memoryManagement?.pruneThreshold ?? 20 // Prune 20% of keys by default
      }
    };
    
    this.defaultTtl = this.options.ttl || 3600;
    
    // Create Redis client manager
    this.redisManager = new RedisClientManager({
      url: this.options.url,
      prefix: this.options.prefix,
      ...this.options.connectionOptions
    });
    
    // Get memory manager instance
    this.memoryManager = MemoryManager.getInstance();
  }

  /**
   * Initialize the cache adapter
   * Connects to Redis server
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    
    try {
      await this.redisManager.connect();
      this.initialized = true;
      this.logger.info('Redis cache adapter initialized');
      
      // Register memory event listeners if memory management is enabled
      if (this.options.memoryManagement?.enabled && !this.memoryListenersRegistered) {
        this.registerMemoryEventListeners();
      }
    } catch (error) {
      this.logger.error('Failed to initialize Redis cache adapter', { error });
      throw error;
    }
  }

  /**
   * Register memory event listeners to respond to memory pressure
   */
  private registerMemoryEventListeners(): void {
    if (this.memoryListenersRegistered) {
      return;
    }
    
    // Listen for critical memory events
    this.memoryManager.on(MemoryEventType.CRITICAL, async () => {
      this.logger.warn('Memory pressure detected (CRITICAL), optimizing Redis cache');
      await this.optimizeMemoryUsage();
    });
    
    // Listen for action needed memory events
    this.memoryManager.on(MemoryEventType.ACTION_NEEDED, async () => {
      this.logger.warn('Memory pressure detected (ACTION_NEEDED), pruning Redis cache');
      await this.pruneCache();
    });
    
    // Listen for memory release requests
    this.memoryManager.on('memory:release_requested', async () => {
      this.logger.info('Memory release requested, pruning Redis cache');
      await this.pruneCache();
    });
    
    this.memoryListenersRegistered = true;
    this.logger.info('Memory event listeners registered');
  }

  /**
   * Optimize memory usage by cleaning up internal Redis client state
   */
  private async optimizeMemoryUsage(): Promise<void> {
    try {
      // Request Redis to optimize memory
      await this.redisManager.optimizeMemory();
      this.logger.info('Redis memory optimization completed');
    } catch (error) {
      this.logger.error('Failed to optimize Redis memory usage', { error });
    }
  }

  /**
   * Prune cache by removing a percentage of oldest keys
   */
  private async pruneCache(): Promise<void> {
    if (!this.options.memoryManagement?.pruneOnMemoryPressure) {
      return;
    }
    
    try {
      const keys = await this.getAllKeys();
      if (keys.length === 0) {
        return;
      }
      
      // Calculate how many keys to prune
      const pruneThreshold = this.options.memoryManagement?.pruneThreshold || 20;
      const keysToPrune = Math.ceil(keys.length * (pruneThreshold / 100));
      
      if (keysToPrune <= 0) {
        return;
      }
      
      this.logger.info(`Pruning ${keysToPrune} keys (${pruneThreshold}% of ${keys.length} total keys)`);
      
      // Get all keys with their last accessed time
      const keyData: Array<{ key: string, lastAccessed: number }> = [];
      
      for (const key of keys) {
        try {
          const data = await this.getElement(key);
          if (data) {
            keyData.push({
              key,
              lastAccessed: data.lastAccessed
            });
          }
        } catch (error) {
          // Skip keys that can't be retrieved
        }
      }
      
      // Sort by last accessed time (oldest first)
      keyData.sort((a, b) => a.lastAccessed - b.lastAccessed);
      
      // Delete the oldest keys
      const keysToDelete = keyData.slice(0, keysToPrune).map(item => item.key);
      
      for (const key of keysToDelete) {
        await this.removeElement(key);
      }
      
      this.logger.info(`Pruned ${keysToDelete.length} oldest keys from Redis cache`);
    } catch (error) {
      this.logger.error('Failed to prune Redis cache', { error });
    }
  }

  /**
   * Stores an element in the cache
   * 
   * @param key Cache key
   * @param data Element data
   * @param ttl Optional TTL in seconds (overrides default)
   */
  async setElement(key: string, data: ElementCacheData, ttl?: number): Promise<void> {
    await this.ensureInitialized();
    
    try {
      await this.redisManager.set(key, data, ttl || this.defaultTtl);
      this.logger.debug('Element stored in Redis cache', { key });
    } catch (error) {
      this.logger.error('Failed to store element in Redis cache', { key, error });
      throw error;
    }
  }

  /**
   * Retrieves an element from the cache
   * 
   * @param key Cache key
   * @returns The element data or null if not found
   */
  async getElement(key: string): Promise<ElementCacheData | null> {
    await this.ensureInitialized();
    
    try {
      return await this.redisManager.get<ElementCacheData>(key);
    } catch (error) {
      this.logger.error('Failed to retrieve element from Redis cache', { key, error });
      return null;
    }
  }

  /**
   * Removes an element from the cache
   * 
   * @param key Cache key
   */
  async removeElement(key: string): Promise<void> {
    await this.ensureInitialized();
    
    try {
      await this.redisManager.delete(key);
      this.logger.debug('Element removed from Redis cache', { key });
    } catch (error) {
      this.logger.error('Failed to remove element from Redis cache', { key, error });
    }
  }

  /**
   * Checks if an element exists in the cache
   * 
   * @param key Cache key
   * @returns True if the element exists
   */
  async hasElement(key: string): Promise<boolean> {
    await this.ensureInitialized();
    
    try {
      return await this.redisManager.exists(key);
    } catch (error) {
      this.logger.error('Failed to check if element exists in Redis cache', { key, error });
      return false;
    }
  }

  /**
   * Gets all cache keys
   * 
   * @returns Array of cache keys
   */
  async getAllKeys(): Promise<string[]> {
    await this.ensureInitialized();
    
    try {
      return await this.redisManager.getKeys('*');
    } catch (error) {
      this.logger.error('Failed to get all keys from Redis cache', { error });
      return [];
    }
  }

  /**
   * Clears all elements from the cache
   */
  async clearAll(): Promise<void> {
    await this.ensureInitialized();
    
    try {
      const count = await this.redisManager.flushKeys('*');
      this.logger.info(`Cleared ${count} elements from Redis cache`);
    } catch (error) {
      this.logger.error('Failed to clear all elements from Redis cache', { error });
    }
  }

  /**
   * Updates the TTL for an element
   * 
   * @param key Cache key
   * @param ttl New TTL in seconds
   */
  async updateTTL(key: string, ttl: number): Promise<void> {
    await this.ensureInitialized();
    
    try {
      await this.redisManager.setExpiry(key, ttl);
      this.logger.debug('Updated TTL for element in Redis cache', { key, ttl });
    } catch (error) {
      this.logger.error('Failed to update TTL for element in Redis cache', { key, error });
    }
  }

  /**
   * Shuts down the cache adapter
   * Disconnects from Redis server
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) {
      return;
    }
    
    try {
      // Unregister memory event listeners
      if (this.memoryListenersRegistered) {
        this.memoryManager.removeAllListeners(MemoryEventType.CRITICAL);
        this.memoryManager.removeAllListeners(MemoryEventType.ACTION_NEEDED);
        this.memoryManager.removeAllListeners('memory:release_requested');
        this.memoryListenersRegistered = false;
      }
      
      await this.redisManager.disconnect();
      this.initialized = false;
      this.logger.info('Redis cache adapter shut down');
    } catch (error) {
      this.logger.error('Failed to shut down Redis cache adapter', { error });
    }
  }

  /**
   * Ensures the adapter is initialized
   * 
   * @throws Error if not initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
} 