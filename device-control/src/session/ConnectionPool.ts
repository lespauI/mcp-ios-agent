import { Logger } from '../utils/Logger';
import { ConnectionPoolConfig } from '../types';
import { EventSystem } from './EventSystem';
import { AppiumEventType } from '../types/events';
import { DriverFactory } from './SessionManager';

// Interface for connection objects
export interface Connection {
  driver: WebdriverIO.Browser;
  sessionId: string;
  inUse: boolean;
  lastUsed: number;
  created: number;
}

/**
 * Manages a pool of WebDriver connections to improve resource utilization
 * and reduce session creation overhead
 */
export class ConnectionPool {
  private logger = new Logger('ConnectionPool');
  private connections: Map<string, Connection> = new Map();
  private pendingRequests: Array<(connection: Connection) => void> = [];
  private poolManager: NodeJS.Timeout | null = null;
  private warmingUp = false;
  
  // Default config values
  private readonly DEFAULT_CONFIG: ConnectionPoolConfig = {
    maxConnections: 10,
    minAvailable: 2,
    idleTimeout: 300000 // 5 minutes
  };
  
  /**
   * Creates a new connection pool
   * 
   * @param driverFactory Function to create new WebDriver instances
   * @param eventSystem Event system for publishing connection events
   * @param config Configuration for the connection pool
   */
  constructor(
    private driverFactory: DriverFactory,
    private eventSystem: EventSystem,
    private config: Partial<ConnectionPoolConfig> = {}
  ) {
    this.config = { ...this.DEFAULT_CONFIG, ...config };
    this.logger.info('ConnectionPool created', { config: this.config });
  }
  
  /**
   * Initialize the connection pool with the minimum number of connections
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing connection pool');
    
    try {
      // Create initial connections
      await this.warmUpConnections();
      
      // Start the pool manager to periodically check and manage connections
      this.startPoolManager();
      
      this.logger.info('Connection pool initialized', { 
        available: this.getAvailableConnectionCount(),
        total: this.getTotalConnectionCount()
      });
    } catch (error) {
      this.logger.error('Failed to initialize connection pool', { error });
      throw error;
    }
  }
  
  /**
   * Start the background pool manager that handles cleanup and warm-up
   */
  private startPoolManager(): void {
    if (this.poolManager) {
      clearInterval(this.poolManager);
    }
    
    // Run every 30 seconds
    this.poolManager = setInterval(() => {
      this.managePool().catch(error => {
        this.logger.error('Error in pool manager', { error });
      });
    }, 30000);
  }
  
  /**
   * Manage the connection pool - clean up idle connections and warm up if needed
   */
  private async managePool(): Promise<void> {
    this.logger.debug('Managing connection pool');
    
    // Remove idle connections
    this.removeIdleConnections();
    
    // Warm up connections if needed
    if (this.shouldWarmUp()) {
      await this.warmUpConnections();
    }
    
    this.logger.debug('Pool management complete', {
      available: this.getAvailableConnectionCount(),
      total: this.getTotalConnectionCount(),
      inUse: this.getTotalConnectionCount() - this.getAvailableConnectionCount()
    });
  }
  
  /**
   * Determine if the pool should warm up new connections
   */
  private shouldWarmUp(): boolean {
    // Don't warm up if already warming up
    if (this.warmingUp) {
      return false;
    }
    
    const availableCount = this.getAvailableConnectionCount();
    
    // Warm up if available connections are below minimum
    return availableCount < this.config.minAvailable!;
  }
  
  /**
   * Warm up connections to reach minimum available
   */
  private async warmUpConnections(): Promise<void> {
    if (this.warmingUp) {
      return;
    }
    
    this.warmingUp = true;
    
    try {
      const availableCount = this.getAvailableConnectionCount();
      const neededCount = this.config.minAvailable! - availableCount;
      
      if (neededCount <= 0) {
        return;
      }
      
      this.logger.info(`Warming up ${neededCount} connections`);
      
      const creationPromises: Promise<void>[] = [];
      
      for (let i = 0; i < neededCount; i++) {
        creationPromises.push(this.createConnection().then(connection => {
          this.logger.debug(`Warmed up connection ${connection.sessionId}`);
        }).catch(error => {
          this.logger.error('Failed to warm up connection', { error });
          // Don't rethrow to allow other connections to be created
        }));
      }
      
      await Promise.all(creationPromises);
      
      this.logger.info('Connection warm-up complete', {
        available: this.getAvailableConnectionCount(),
        total: this.getTotalConnectionCount()
      });
    } finally {
      this.warmingUp = false;
    }
  }
  
  /**
   * Create a new WebDriver connection
   */
  private async createConnection(): Promise<Connection> {
    this.logger.debug('Creating new connection');
    
    try {
      const driver = await this.driverFactory();
      
      const connection: Connection = {
        driver,
        sessionId: driver.sessionId,
        inUse: false,
        lastUsed: Date.now(),
        created: Date.now()
      };
      
      this.connections.set(connection.sessionId, connection);
      
      this.eventSystem.publish(AppiumEventType.CONNECTION_CHANGE, {
        state: 'connected',
        timestamp: Date.now(),
        details: { 
          status: 'created',
          sessionId: connection.sessionId
        }
      });
      
      this.logger.debug(`Created connection ${connection.sessionId}`);
      
      return connection;
    } catch (error) {
      this.logger.error('Failed to create connection', { error });
      throw error;
    }
  }
  
  /**
   * Get a connection from the pool, or create a new one if none are available
   */
  async acquireConnection(): Promise<Connection> {
    this.logger.debug('Acquiring connection');
    
    // Find an available connection
    for (const connection of this.connections.values()) {
      if (!connection.inUse) {
        connection.inUse = true;
        connection.lastUsed = Date.now();
        
        this.eventSystem.publish(AppiumEventType.CONNECTION_CHANGE, {
          state: 'connected',
          timestamp: Date.now(),
          details: { 
            status: 'acquired',
            sessionId: connection.sessionId
          }
        });
        
        this.logger.debug(`Acquired existing connection ${connection.sessionId}`);
        return connection;
      }
    }
    
    // Check if we can create a new connection
    if (this.connections.size < this.config.maxConnections!) {
      try {
        const connection = await this.createConnection();
        connection.inUse = true;
        
        // Trigger warm-up if needed after taking a connection
        if (this.shouldWarmUp()) {
          // Don't await to avoid blocking the caller
          this.warmUpConnections().catch(error => {
            this.logger.error('Failed to warm up connections', { error });
          });
        }
        
        return connection;
      } catch (error) {
        this.logger.error('Failed to create new connection for acquisition', { error });
        // Fall through to waiting if no connections are available
      }
    }
    
    // If we can't create a new connection, wait for one to be released
    this.logger.info('No connections available, waiting for release');
    
    return new Promise<Connection>(resolve => {
      this.pendingRequests.push(resolve);
    });
  }
  
  /**
   * Release a connection back to the pool
   */
  releaseConnection(sessionId: string): void {
    const connection = this.connections.get(sessionId);
    
    if (!connection) {
      this.logger.warn(`Attempted to release unknown connection: ${sessionId}`);
      return;
    }
    
    this.logger.debug(`Releasing connection ${sessionId}`);
    
    // Update connection state
    connection.inUse = false;
    connection.lastUsed = Date.now();
    
    // Publish connection change event
    this.eventSystem.publish(AppiumEventType.CONNECTION_CHANGE, {
      state: 'connected',
      timestamp: Date.now(),
      details: { 
        status: 'released',
        sessionId
      }
    });
    
    // Check if there are pending requests that can use this connection
    if (this.pendingRequests.length > 0) {
      const nextRequest = this.pendingRequests.shift()!;
      
      // Mark as in use again
      connection.inUse = true;
      connection.lastUsed = Date.now();
      
      this.logger.debug(`Assigned released connection ${sessionId} to pending request`);
      
      // Publish connection change event
      this.eventSystem.publish(AppiumEventType.CONNECTION_CHANGE, {
        state: 'connected',
        timestamp: Date.now(),
        details: { 
          status: 'acquired',
          sessionId
        }
      });
      
      // Resolve the pending request
      nextRequest(connection);
    }
  }
  
  /**
   * Remove idle connections that exceed the idle timeout
   */
  private removeIdleConnections(): void {
    const now = Date.now();
    const idleTimeout = this.config.idleTimeout!;
    let removedCount = 0;
    
    // Keep at least minAvailable connections
    const availableCount = this.getAvailableConnectionCount();
    const keepCount = Math.max(this.config.minAvailable!, 0);
    
    if (availableCount <= keepCount) {
      return;
    }
    
    // Find idle connections to remove
    for (const [sessionId, connection] of this.connections.entries()) {
      // Skip connections in use
      if (connection.inUse) {
        continue;
      }
      
      // Check if connection is idle
      const idleTime = now - connection.lastUsed;
      
      if (idleTime > idleTimeout) {
        // Remove connection
        this.removeConnectionInternal(sessionId, 'idle timeout');
        removedCount++;
        
        // Stop if we would drop below minAvailable
        if (this.getAvailableConnectionCount() <= keepCount) {
          break;
        }
      }
    }
    
    if (removedCount > 0) {
      this.logger.info(`Removed ${removedCount} idle connections`, {
        available: this.getAvailableConnectionCount(),
        total: this.getTotalConnectionCount()
      });
    }
  }
  
  /**
   * Remove a connection from the pool
   */
  async removeConnection(sessionId: string): Promise<void> {
    await this.removeConnectionInternal(sessionId, 'manual removal');
    
    // Trigger warm-up if needed
    if (this.shouldWarmUp()) {
      await this.warmUpConnections();
    }
  }
  
  /**
   * Internal implementation of connection removal
   */
  private async removeConnectionInternal(sessionId: string, reason: string): Promise<void> {
    const connection = this.connections.get(sessionId);
    
    if (!connection) {
      this.logger.warn(`Attempted to remove unknown connection: ${sessionId}`);
      return;
    }
    
    this.logger.debug(`Removing connection ${sessionId}`, { reason });
    
    try {
      // Try to close the session
      await connection.driver.deleteSession();
    } catch (error) {
      this.logger.warn(`Failed to close session ${sessionId}`, { error });
      // Continue with removal even if delete session fails
    }
    
    // Remove from connections map
    this.connections.delete(sessionId);
    
    // Publish connection change event
    this.eventSystem.publish(AppiumEventType.CONNECTION_CHANGE, {
      state: 'disconnected',
      timestamp: Date.now(),
      details: { 
        status: 'removed',
        sessionId,
        reason
      }
    });
  }
  
  /**
   * Get the count of available (not in use) connections
   */
  getAvailableConnectionCount(): number {
    let count = 0;
    
    for (const connection of this.connections.values()) {
      if (!connection.inUse) {
        count++;
      }
    }
    
    return count;
  }
  
  /**
   * Get the total number of connections in the pool
   */
  getTotalConnectionCount(): number {
    return this.connections.size;
  }
  
  /**
   * Shutdown the connection pool and close all connections
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down connection pool');
    
    // Stop the pool manager
    if (this.poolManager) {
      clearInterval(this.poolManager);
      this.poolManager = null;
    }
    
    // Close all connections
    const closePromises: Promise<void>[] = [];
    
    for (const sessionId of this.connections.keys()) {
      closePromises.push(this.removeConnectionInternal(sessionId, 'shutdown'));
    }
    
    await Promise.all(closePromises);
    
    // Clear all pending requests
    const error = new Error('Connection pool shutdown');
    while (this.pendingRequests.length > 0) {
      const request = this.pendingRequests.shift();
      if (request) {
        // Create a placeholder connection object to reject the request
        const dummyConnection: Connection = {
          driver: null as any,
          sessionId: 'shutdown',
          inUse: false,
          lastUsed: Date.now(),
          created: Date.now()
        };
        request(dummyConnection);
      }
    }
    
    this.logger.info('Connection pool shutdown complete');
  }
} 