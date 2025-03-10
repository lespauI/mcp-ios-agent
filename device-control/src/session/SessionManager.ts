import { generateId } from '../utils/helpers';
import { Logger } from '../utils/Logger';
import { 
  SessionConfig, 
  SessionInfo, 
  SessionManager as ISessionManager, 
  SessionState, 
  ConnectionPoolConfig, 
  PreservedSessionState,
  SessionOperation,
  SessionAnalytics
} from '../types';
import { EventSystem } from './EventSystem';
import { AppiumEventManager } from './AppiumEventManager';
import { AppiumEventType } from '../types/events';
import { ConnectionPool } from './ConnectionPool';

/**
 * Default session configuration
 */
const DEFAULT_CONFIG: SessionConfig = {
  capabilities: {},
  connectionRetries: 3,
  connectionTimeout: 30000,
  sessionTimeout: 300000
};

/**
 * Default connection pool configuration
 */
const DEFAULT_POOL_CONFIG: ConnectionPoolConfig = {
  maxConnections: 10,
  minAvailable: 2,
  idleTimeout: 300000 // 5 minutes
};

/**
 * Type definition for driver factory function
 */
export type DriverFactory = () => Promise<WebdriverIO.Browser>;

interface SessionData {
  driver: WebdriverIO.Browser;
  info: SessionInfo;
  eventManager: AppiumEventManager;
  connectionId?: string; // ID of the connection from the pool
  operations?: SessionOperation[]; // Analytics tracking
  startTime: Date;
}

/**
 * Manages Appium sessions for iOS devices
 */
export class SessionManager implements ISessionManager {
  private sessions: Map<string, SessionData> = new Map();
  private logger = new Logger('SessionManager');
  private connectionPool: ConnectionPool;
  
  /**
   * Creates a new SessionManager
   * 
   * @param driverFactory Factory function to create WebdriverIO driver instances
   */
  constructor(
    private driverFactory: DriverFactory,
    private eventSystem?: EventSystem,
    private poolConfig: Partial<ConnectionPoolConfig> = {}
  ) {
    this.eventSystem = eventSystem || new EventSystem();
    this.connectionPool = new ConnectionPool(
      driverFactory,
      this.eventSystem,
      { ...DEFAULT_POOL_CONFIG, ...poolConfig }
    );
  }

  /**
   * Initialize the session manager and its resources
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing SessionManager');
    
    // Initialize the connection pool
    await this.connectionPool.initialize();
    
    this.logger.info('SessionManager initialized successfully');
  }

  private log(message: string): void {
    this.logger.info(message);
  }

  private error(message: string): void {
    this.logger.error(message);
  }

  /**
   * Creates a new Appium session
   * 
   * @param config Optional session configuration that overrides defaults
   * @returns SessionInfo object with session details
   */
  public async createSession(config?: Partial<SessionConfig>): Promise<SessionInfo> {
    this.log('Creating new session');
    
    const mergedConfig: SessionConfig = {
      ...DEFAULT_CONFIG,
      ...config
    };
    
    let lastError: Error | null = null;
    let retryCount = 0;
    const maxRetries = Math.max(0, mergedConfig.connectionRetries || 0);
    
    do {
      try {
        const connection = await this.connectionPool.acquireConnection();
        const driver = connection.driver;
        
        if (!driver) {
          throw new Error('Driver is undefined');
        }
        
        const sessionId = driver.sessionId || generateId();
        
        const sessionInfo: SessionInfo = {
          id: sessionId,
          capabilities: driver.capabilities || {},
          startTime: new Date(),
          lastUsed: new Date(),
          metadata: {},
          state: SessionState.ACTIVE
        };
        
        const eventManager = new AppiumEventManager(driver, this.eventSystem!);
        await eventManager.initialize();
        
        const sessionData: SessionData = {
          driver,
          info: sessionInfo,
          eventManager,
          connectionId: connection.sessionId,
          operations: [],
          startTime: new Date()
        };
        
        this.sessions.set(sessionId, sessionData);
        
        this.setupSessionErrorHandling(sessionData);
        
        this.publishSessionEvent(AppiumEventType.SESSION_CREATE, {
          sessionId,
          state: 'created',
          timestamp: Date.now(),
          capabilities: driver.capabilities
        });
        
        this.log(`Session created with ID: ${sessionId}`);
        
        return sessionInfo;
      } catch (error) {
        lastError = error as Error;
        this.error(`Failed to create session (attempt ${retryCount + 1}/${maxRetries + 1}): ${(error as Error).message}`);
        
        this.publishSessionEvent(AppiumEventType.SESSION_ERROR, {
          sessionId: 'unknown',
          state: 'error',
          timestamp: Date.now(),
          error
        });
        
        if (retryCount < maxRetries) {
          this.log(`Retrying session creation (attempt ${retryCount + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          retryCount++;
        }
      }
    } while (retryCount <= maxRetries && lastError !== null);
    
    if (lastError) {
      throw lastError;
    }
    
    throw new Error('Unexpected error during session creation');
  }
  
  /**
   * Get all active sessions
   */
  async getAllSessions(): Promise<SessionInfo[]> {
    const sessions: SessionInfo[] = [];
    
    for (const sessionData of this.sessions.values()) {
      sessions.push({...sessionData.info});
    }
    
    return sessions;
  }
  
  /**
   * Preserve a session's state for later restoration
   */
  async preserveSession(id: string): Promise<PreservedSessionState> {
    this.logger.info(`Preserving session state for ${id}`);
    
    const sessionData = this.sessions.get(id);
    if (!sessionData) {
      throw new Error(`Session ${id} not found`);
    }
    
    // Create preserved state
    const preservedState: PreservedSessionState = {
      id: sessionData.info.id,
      capabilities: {...sessionData.info.capabilities},
      metadata: {...sessionData.info.metadata},
      preservedAt: new Date()
    };
    
    this.logger.info(`Session state preserved for ${id}`);
    
    return preservedState;
  }
  
  /**
   * Restore a session from a preserved state
   */
  async restoreSession(state: PreservedSessionState): Promise<SessionInfo> {
    this.logger.info(`Restoring session from preserved state: ${state.id}`);
    
    try {
      // Create a new session with the preserved capabilities
      const connection = await this.connectionPool.acquireConnection();
      const driver = connection.driver;
      
      // Activate the app if bundleId is available
      if (state.capabilities.bundleId) {
        try {
          await driver.activateApp(state.capabilities.bundleId);
        } catch (error: any) {
          this.logger.error(`Failed to activate app: ${error}`);
          throw new Error(`Failed to restore session: ${error.message || 'Unknown error'}`);
        }
      }
      
      // Create session info
      const sessionInfo: SessionInfo = {
        id: state.id,
        capabilities: state.capabilities,
        startTime: new Date(),
        lastUsed: new Date(),
        metadata: state.metadata,
        state: SessionState.ACTIVE
      };
      
      // Create event manager for this session
      const eventManager = new AppiumEventManager(driver, this.eventSystem!);
      await eventManager.initialize();
      
      // Store session data
      const sessionData: SessionData = {
        driver,
        info: sessionInfo,
        eventManager,
        connectionId: connection.sessionId,
        operations: [],
        startTime: new Date()
      };
      
      this.sessions.set(state.id, sessionData);
      
      // Register error handler for this session
      this.setupSessionErrorHandling(sessionData);
      
      // Publish session restoration event
      this.publishSessionEvent(AppiumEventType.SESSION_CREATE, {
        sessionId: state.id,
        state: 'restored',
        timestamp: Date.now(),
        capabilities: state.capabilities
      });
      
      this.logger.info(`Session ${state.id} restored successfully`);
      
      return sessionInfo;
    } catch (error: any) {
      this.logger.error(`Failed to restore session: ${error}`);
      throw new Error(`Failed to restore session: ${error.message || 'Unknown error'}`);
    }
  }
  
  /**
   * Clone a session for parallel execution
   */
  async cloneSession(id: string): Promise<SessionInfo> {
    this.logger.info(`Cloning session ${id}`);
    
    const sourceSession = this.sessions.get(id);
    if (!sourceSession) {
      throw new Error(`Session ${id} not found`);
    }
    
    try {
      // Create a new session with the same capabilities
      const newSession = await this.createSession({
        capabilities: {...sourceSession.info.capabilities}
      });
      
      // Copy some of the metadata from the source session
      const targetSession = this.sessions.get(newSession.id);
      if (targetSession) {
        targetSession.info.metadata = {
          ...targetSession.info.metadata,
          clonedFrom: id,
          clonedAt: new Date()
        };
      }
      
      this.logger.info(`Session ${id} cloned successfully as ${newSession.id}`);
      
      return newSession;
    } catch (error: any) {
      this.logger.error(`Failed to clone session ${id}: ${error}`);
      throw new Error(`Failed to clone session: ${error.message || 'Unknown error'}`);
    }
  }
  
  /**
   * Recover a broken session
   */
  async recoverSession(id: string, createNewOnFailure: boolean = false): Promise<boolean> {
    this.logger.info(`Attempting to recover session ${id}`);
    
    const sessionData = this.sessions.get(id);
    if (!sessionData) {
      throw new Error(`Session ${id} not found`);
    }
    
    if (sessionData.info.state !== SessionState.BROKEN) {
      this.logger.info(`Session ${id} is not broken, no recovery needed`);
      return true;
    }
    
    try {
      // Attempt to reset the session
      await sessionData.driver.reset();
      
      // Update session state
      sessionData.info.state = SessionState.ACTIVE;
      sessionData.info.lastUsed = new Date();
      
      this.logger.info(`Session ${id} recovered successfully`);
      
      return true;
    } catch (error) {
      this.logger.error(`Failed to recover session ${id}: ${error}`);
      
      if (!createNewOnFailure) {
        return false;
      }
      
      this.logger.info(`Creating new session to replace broken session ${id}`);
      
      try {
        // Terminate the broken session
        await this.terminateSession(id);
        
        // Create a new session with the same capabilities
        await this.createSession({
          capabilities: sessionData.info.capabilities
        });
        
        this.logger.info(`Created new session to replace broken session ${id}`);
        
        return true;
      } catch (newError) {
        this.logger.error(`Failed to create replacement session: ${newError}`);
        return false;
      }
    }
  }
  
  /**
   * Record session activity for analytics
   */
  async recordSessionActivity(id: string, operationType: string, metadata?: Record<string, any>): Promise<void> {
    const sessionData = this.sessions.get(id);
    if (!sessionData) {
      this.logger.warn(`Attempted to record activity for non-existent session ${id}`);
      return;
    }
    
    const now = new Date();
    const operation: SessionOperation = {
      type: operationType,
      startTime: now,
      endTime: now,
      duration: 0,
      metadata
    };
    
    if (!sessionData.operations) {
      sessionData.operations = [];
    }
    
    sessionData.operations.push(operation);
    
    this.logger.debug(`Recorded ${operationType} operation for session ${id}`);
  }
  
  /**
   * Complete a previously recorded session activity
   */
  async completeSessionActivity(id: string, operationType: string): Promise<void> {
    const sessionData = this.sessions.get(id);
    if (!sessionData || !sessionData.operations) {
      return;
    }
    
    // Find the most recent operation of this type
    for (let i = sessionData.operations.length - 1; i >= 0; i--) {
      const operation = sessionData.operations[i];
      if (operation.type === operationType && operation.startTime === operation.endTime) {
        // Update the operation
        operation.endTime = new Date();
        operation.duration = operation.endTime.getTime() - operation.startTime.getTime();
        break;
      }
    }
  }
  
  /**
   * Get analytics for a session
   */
  async getSessionAnalytics(id: string): Promise<SessionAnalytics | null> {
    const sessionData = this.sessions.get(id);
    if (!sessionData || !sessionData.operations) {
      return null;
    }
    
    let totalDuration = 0;
    const operations = [...sessionData.operations];
    
    for (const operation of operations) {
      totalDuration += operation.duration;
    }
    
    const analytics: SessionAnalytics = {
      sessionId: id,
      operations,
      startTime: sessionData.startTime,
      totalOperations: operations.length,
      totalDuration,
      averageDuration: operations.length > 0 ? totalDuration / operations.length : 0
    };
    
    return analytics;
  }
  
  private setupSessionErrorHandling(sessionData: SessionData): void {
    // Set up error handling for driver errors if available
    try {
      if (typeof sessionData.driver.on === 'function') {
        (sessionData.driver as any).on('error', (error: Error) => {
          this.handleSessionError(sessionData.info.id, error);
        });
      }
    } catch (error) {
      this.logger.warn('Could not set up error handling for session', { error });
    }
  }
  
  private handleSessionError(sessionId: string, error: Error): void {
    this.logger.error(`Error in session ${sessionId}`, { error });
    
    const sessionData = this.sessions.get(sessionId);
    if (sessionData) {
      // Mark session as broken
      sessionData.info.state = SessionState.BROKEN;
      
      // Publish session error event
      this.publishSessionEvent(AppiumEventType.SESSION_ERROR, {
        sessionId,
        state: 'error',
        timestamp: Date.now(),
        error
      });
    }
  }

  /**
   * Retrieves an existing session by ID
   * 
   * @param id Session ID
   * @returns SessionInfo or null if not found
   */
  async getSession(id: string): Promise<SessionInfo | null> {
    const sessionData = this.sessions.get(id);
    
    if (!sessionData) {
      return null;
    }
    
    // Update last used timestamp
    sessionData.info.lastUsed = new Date();
    
    return sessionData.info;
  }

  /**
   * Releases a session back to the pool
   * 
   * @param id Session ID
   * @returns True if session was released successfully
   */
  async releaseSession(id: string): Promise<boolean> {
    const sessionData = this.sessions.get(id);
    
    if (!sessionData) {
      return false;
    }
    
    try {
      // Mark the session as released but don't remove it from the sessions map
      sessionData.info.state = SessionState.IDLE;
      sessionData.info.lastUsed = new Date();
      
      // If we have a connection, release it back to the pool
      if (sessionData.connectionId) {
        this.connectionPool.releaseConnection(sessionData.connectionId);
      }
      
      // Publish app state change event
      this.eventSystem?.publish(AppiumEventType.APP_STATE_CHANGE, {
        sessionId: id,
        state: 'background',
        bundleId: sessionData.info.metadata.bundleId || 'unknown',
        timestamp: Date.now()
      });
      
      this.log(`Session ${id} released`);
      return true;
    } catch (error) {
      const errorMessage = (error as Error).message;
      this.error(`Failed to release session ${id}: ${errorMessage}`);
      return false;
    }
  }

  /**
   * Checks if a session is healthy
   * 
   * @param id Session ID
   * @returns True if session is healthy
   */
  async healthCheck(id: string): Promise<boolean> {
    const sessionData = this.sessions.get(id);
    
    if (!sessionData) {
      return false;
    }
    
    try {
      // Check Appium server status
      const status = await (sessionData.driver as any).status();
      
      // If status check passes, session is healthy
      return status && status.ready === true;
    } catch (error) {
      this.error(`Health check failed for session ${id}: ${error}`);
      
      // Mark session as broken
      sessionData.info.state = SessionState.BROKEN;
      
      return false;
    }
  }

  /**
   * Terminates a session
   * 
   * @param id Session ID
   * @returns True if session was terminated successfully
   */
  async terminateSession(id: string): Promise<boolean> {
    const sessionData = this.sessions.get(id);
    
    if (!sessionData) {
      return false;
    }
    
    try {
      // Shut down event manager
      await sessionData.eventManager.shutdown();
      
      // Publish session deletion event
      this.publishSessionEvent(AppiumEventType.SESSION_DELETE, {
        sessionId: id,
        state: 'deleted',
        timestamp: Date.now()
      });
      
      let success = true;
      
      // If we have a connection ID, remove the connection from the pool
      if (sessionData.connectionId) {
        try {
          await this.connectionPool.removeConnection(sessionData.connectionId);
        } catch (error) {
          const errorMessage = (error as Error).message;
          this.error(`Failed to remove connection ${sessionData.connectionId}: ${errorMessage}`);
          success = false;
        }
      } else {
        // Otherwise try to close the session directly
        try {
          await (sessionData.driver as any).deleteSession();
        } catch (error: any) {
          const errorMessage = error.message || 'Unknown error';
          this.error(`Failed to delete session ${id}: ${errorMessage}`);
          success = false;
        }
      }
      
      // Always remove from session map regardless of success
      this.sessions.delete(id);
      
      if (success) {
        this.log(`Session ${id} terminated successfully`);
        return true;
      } else {
        // Mark session as terminated even if we couldn't remove it cleanly
        sessionData.info.state = SessionState.TERMINATED;
        return false;
      }
    } catch (error) {
      const errorMessage = (error as Error).message;
      this.error(`Failed to terminate session ${id}: ${errorMessage}`);
      
      // Mark session as broken
      sessionData.info.state = SessionState.TERMINATED;
      
      // Remove from session map
      this.sessions.delete(id);
      
      return false;
    }
  }
  
  /**
   * Shut down the session manager and all its resources
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down SessionManager');
    
    // Terminate all active sessions
    const sessionIds = [...this.sessions.keys()];
    for (const id of sessionIds) {
      await this.terminateSession(id).catch(error => {
        this.logger.error(`Error terminating session ${id} during shutdown`, { error });
      });
    }
    
    // Shut down connection pool
    await this.connectionPool.shutdown();
    
    this.logger.info('SessionManager shutdown complete');
  }
  
  private publishSessionEvent(eventType: AppiumEventType, data: any): void {
    if (this.eventSystem) {
      this.eventSystem.publish(eventType, data);
    }
  }
}

/**
 * Default driver factory function
 * 
 * @param config Session configuration
 * @returns WebdriverIO driver instance
 */
export async function defaultDriverFactory(config: SessionConfig): Promise<WebdriverIO.Browser> {
  const { remote } = require('webdriverio');
  return remote({
    capabilities: config.capabilities,
    logLevel: 'error',
    connectionRetryCount: config.connectionRetries,
    connectionRetryTimeout: config.connectionTimeout
  });
} 