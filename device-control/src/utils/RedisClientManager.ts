import { Logger } from './Logger';
import { createClient, RedisClientType } from 'redis';

export interface RedisClientOptions {
  url?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: number;
  prefix?: string;
  enableOfflineQueue?: boolean;
  reconnectStrategy?: {
    maxRetries?: number;
    retryInterval?: number;
  };
}

/**
 * RedisClientManager provides a centralized client for Redis caching operations
 * It handles connection management, key prefixing, and serialization/deserialization
 */
export class RedisClientManager {
  private static instances: RedisClientManager[] = [];
  
  private logger = new Logger('RedisClientManager');
  private client: RedisClientType | null = null;
  private options: RedisClientOptions;
  private prefix: string = '';
  private isConnected: boolean = false;
  private connectionPromise: Promise<void> | null = null;

  /**
   * Returns all active RedisClientManager instances
   * Used for global cleanup
   */
  public static getAllInstances(): RedisClientManager[] {
    return RedisClientManager.instances;
  }

  /**
   * Creates a new RedisClientManager instance
   * 
   * @param options Configuration options for Redis
   */
  constructor(options: RedisClientOptions = {}) {
    this.options = {
      url: options.url || 'redis://localhost:6379',
      host: options.host || 'localhost',
      port: options.port || 6379,
      username: options.username,
      password: options.password,
      database: options.database || 0,
      prefix: options.prefix || '',
      enableOfflineQueue: options.enableOfflineQueue !== undefined ? options.enableOfflineQueue : true,
      reconnectStrategy: {
        maxRetries: options.reconnectStrategy?.maxRetries || 10,
        retryInterval: options.reconnectStrategy?.retryInterval || 1000
      }
    };
    
    this.prefix = this.options.prefix || '';
    
    // Register this instance for global tracking
    RedisClientManager.instances.push(this);
  }

  /**
   * Connects to the Redis server
   * 
   * @returns Promise that resolves when connected
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = new Promise<void>(async (resolve, reject) => {
      try {
        this.logger.info('Connecting to Redis server', { url: this.options.url });
        
        this.client = createClient({
          url: this.options.url,
          username: this.options.username,
          password: this.options.password,
          database: this.options.database
        });

        // Set up event listeners
        this.client.on('error', (err) => {
          this.logger.error('Redis client error', { error: err });
        });

        this.client.on('connect', () => {
          this.logger.info('Redis client connected');
        });

        this.client.on('reconnecting', () => {
          this.logger.info('Redis client reconnecting');
        });

        this.client.on('end', () => {
          this.isConnected = false;
          this.logger.info('Redis client disconnected');
        });

        // Connect to Redis server
        await this.client.connect();
        this.isConnected = true;
        resolve();
      } catch (error) {
        this.logger.error('Failed to connect to Redis server', { error });
        this.client = null;
        this.connectionPromise = null;
        reject(error);
      }
    });

    return this.connectionPromise;
  }

  /**
   * Disconnects from the Redis server
   * 
   * @returns Promise that resolves when disconnected
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected || !this.client) {
      this.isConnected = false;
      this.connectionPromise = null;
      return;
    }

    try {
      this.logger.info('Disconnecting from Redis server');
      await this.client.disconnect();
      this.isConnected = false;
      this.connectionPromise = null;
    } catch (error) {
      this.logger.error('Error disconnecting from Redis', { error });
      throw error;
    } finally {
      // Remove this instance from tracking when disconnected
      const index = RedisClientManager.instances.indexOf(this);
      if (index !== -1) {
        RedisClientManager.instances.splice(index, 1);
      }
    }
  }

  /**
   * Adds the prefix to a key
   * 
   * @param key Key to prefix
   * @returns Prefixed key
   */
  private getKeyWithPrefix(key: string): string {
    return `${this.prefix}${key}`;
  }

  /**
   * Removes the prefix from a key
   * 
   * @param prefixedKey Key with prefix
   * @returns Original key without prefix
   */
  private removePrefix(prefixedKey: string): string {
    if (this.prefix && prefixedKey.startsWith(this.prefix)) {
      return prefixedKey.substring(this.prefix.length);
    }
    return prefixedKey;
  }

  /**
   * Ensures the client is connected
   * 
   * @throws Error if client is not connected
   */
  private ensureConnection(): void {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis client is not connected');
    }
  }

  /**
   * Stores a value in Redis
   * 
   * @param key Key to store value under
   * @param value Value to store
   * @param ttlSeconds Optional TTL in seconds
   * @returns Promise that resolves when set
   */
  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    await this.connect();
    this.ensureConnection();

    const prefixedKey = this.getKeyWithPrefix(key);
    const serializedValue = JSON.stringify(value);
    
    if (ttlSeconds) {
      await this.client!.set(prefixedKey, serializedValue, { EX: ttlSeconds });
    } else {
      await this.client!.set(prefixedKey, serializedValue);
    }
    
    this.logger.debug('Set value in Redis', { key: prefixedKey });
  }

  /**
   * Retrieves a value from Redis
   * 
   * @param key Key to retrieve
   * @returns Promise that resolves with the value or null if not found
   */
  async get<T>(key: string): Promise<T | null> {
    await this.connect();
    this.ensureConnection();

    const prefixedKey = this.getKeyWithPrefix(key);
    const value = await this.client!.get(prefixedKey);
    
    if (!value) {
      return null;
    }
    
    try {
      return JSON.parse(value) as T;
    } catch (error) {
      this.logger.error('Failed to parse Redis value', { key: prefixedKey, error });
      return null;
    }
  }

  /**
   * Deletes a value from Redis
   * 
   * @param key Key to delete
   * @returns Promise that resolves when deleted
   */
  async delete(key: string): Promise<void> {
    await this.connect();
    this.ensureConnection();

    const prefixedKey = this.getKeyWithPrefix(key);
    await this.client!.del(prefixedKey);
    
    this.logger.debug('Deleted key from Redis', { key: prefixedKey });
  }

  /**
   * Checks if a key exists in Redis
   * 
   * @param key Key to check
   * @returns Promise that resolves with true if key exists
   */
  async exists(key: string): Promise<boolean> {
    await this.connect();
    this.ensureConnection();

    const prefixedKey = this.getKeyWithPrefix(key);
    const result = await this.client!.exists(prefixedKey);
    
    return result === 1;
  }

  /**
   * Sets the expiration time for a key
   * 
   * @param key Key to set expiry for
   * @param ttlSeconds TTL in seconds
   * @returns Promise that resolves when expiry is set
   */
  async setExpiry(key: string, ttlSeconds: number): Promise<void> {
    await this.connect();
    this.ensureConnection();

    const prefixedKey = this.getKeyWithPrefix(key);
    await this.client!.expire(prefixedKey, ttlSeconds);
    
    this.logger.debug('Set expiry for key in Redis', { key: prefixedKey, ttlSeconds });
  }

  /**
   * Optimizes memory usage in Redis
   * Runs MEMORY PURGE command if available and performs other optimizations
   * 
   * @returns Promise that resolves when optimization is complete
   */
  async optimizeMemory(): Promise<void> {
    await this.connect();
    this.ensureConnection();
    
    try {
      // Run MEMORY PURGE command if available (Redis 4.0+)
      try {
        await this.client!.sendCommand(['MEMORY', 'PURGE']);
        this.logger.info('Redis memory purged successfully');
      } catch (error) {
        // MEMORY PURGE might not be available in all Redis versions
        this.logger.warn('Redis MEMORY PURGE command not available', { error });
      }
      
      // Run CLUSTER RESET if in cluster mode
      try {
        const info = await this.client!.info('cluster');
        if (info.includes('cluster_enabled:1')) {
          await this.client!.sendCommand(['CLUSTER', 'RESET', 'SOFT']);
          this.logger.info('Redis cluster reset (soft) completed');
        }
      } catch (error) {
        // Ignore cluster errors
      }
      
      // Run CLIENT PAUSE to allow background operations to complete
      try {
        await this.client!.sendCommand(['CLIENT', 'PAUSE', '1000', 'WRITE']);
        this.logger.debug('Redis client paused to allow background operations');
      } catch (error) {
        // Ignore client pause errors
      }
      
      this.logger.info('Redis memory optimization completed');
    } catch (error) {
      this.logger.error('Failed to optimize Redis memory', { error });
      throw error;
    }
  }

  /**
   * Retrieves all keys matching a pattern
   * 
   * @param pattern Pattern to match keys against
   * @returns Promise that resolves with matching keys (without prefix)
   */
  async getKeys(pattern: string): Promise<string[]> {
    await this.connect();
    this.ensureConnection();

    const prefixedPattern = this.getKeyWithPrefix(pattern);
    const keys = await this.client!.keys(prefixedPattern);
    
    // Remove prefix from keys
    return keys.map(key => this.removePrefix(key));
  }

  /**
   * Flushes all keys matching a pattern
   * 
   * @param pattern Pattern to match keys against
   * @returns Promise that resolves with the number of keys deleted
   */
  async flushKeys(pattern: string): Promise<number> {
    const keys = await this.getKeys(pattern);
    let count = 0;
    
    for (const key of keys) {
      await this.delete(key);
      count++;
    }
    
    return count;
  }

  /**
   * Gets the Redis client instance
   * Advanced usage only - prefer to use the wrapper methods when possible
   * 
   * @returns The Redis client
   */
  getClient(): RedisClientType | null {
    return this.client;
  }

  /**
   * Checks if the Redis client is connected
   * 
   * @returns True if connected
   */
  isClientConnected(): boolean {
    return this.isConnected;
  }
} 