// Export all existing types

// Export synchronization types
export * from './synchronization';

// Export performance types
export * from './performance';

// Export event system types
export * from './events';

// Session related types
export interface SessionConfig {
  capabilities: Record<string, any>;
  connectionRetries: number;
  connectionTimeout: number;
  sessionTimeout: number;
}

export interface SessionInfo {
  id: string;
  capabilities: Record<string, any>;
  startTime: Date;
  lastUsed: Date;
  metadata: Record<string, any>;
  state: SessionState;
}

export enum SessionState {
  IDLE = 'idle',
  ACTIVE = 'active',
  BROKEN = 'broken',
  TERMINATED = 'terminated'
}

export interface PreservedSessionState {
  id: string;
  capabilities: Record<string, any>;
  metadata: Record<string, any>;
  preservedAt: Date;
}

export interface SessionOperation {
  type: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  metadata?: Record<string, any>;
}

export interface SessionAnalytics {
  sessionId: string;
  operations: SessionOperation[];
  startTime: Date;
  totalOperations: number;
  totalDuration: number;
  averageDuration: number;
}

export interface SessionManager {
  createSession(config?: Partial<SessionConfig>): Promise<SessionInfo>;
  getSession(id: string): Promise<SessionInfo | null>;
  releaseSession(id: string): Promise<boolean>;
  healthCheck(id: string): Promise<boolean>;
  terminateSession(id: string): Promise<boolean>;
  preserveSession(id: string): Promise<PreservedSessionState>;
  restoreSession(state: PreservedSessionState): Promise<SessionInfo>;
  cloneSession(id: string): Promise<SessionInfo>;
  recoverSession(id: string, createNewOnFailure?: boolean): Promise<boolean>;
  recordSessionActivity(id: string, operationType: string, metadata?: Record<string, any>): Promise<void>;
  getSessionAnalytics(id: string): Promise<SessionAnalytics | null>;
  getAllSessions(): Promise<SessionInfo[]>;
}

// Device capability types
export interface DeviceProfile {
  platformName: string;
  deviceName: string;
  platformVersion: string;
  automationName: string;
  app?: string;
  noReset?: boolean;
  fullReset?: boolean;
  newCommandTimeout?: number;
  otherCapabilities?: Record<string, any>;
  [key: string]: any; // Allow indexing with string
}

// Connection pool related types
export interface ConnectionPoolConfig {
  maxConnections: number;
  minAvailable: number;
  idleTimeout: number;
}

// Element location types
export type ElementLocatorStrategy = 
  | 'accessibilityId'
  | 'accessibility id'
  | 'id'
  | 'xpath'
  | 'className'
  | 'class name'
  | 'predicate'
  | 'ios predicate'
  | 'classChain'
  | 'ios class chain'
  | 'css selector'
  | 'name'
  | 'tag name'
  | 'link text'
  | 'partial link text';

export interface ElementFindStrategy {
  type: ElementLocatorStrategy;
  value: string;
}

// Enhanced cache options with Redis support
export interface ElementCacheOptions {
  enabled: boolean;
  ttl: number; // Time-to-live in milliseconds
  maxEntries: number;
  preloadDepth?: number; // How many levels of related elements to preload
  pruneInterval?: number; // Interval for cache maintenance in milliseconds
  
  // Redis cache options
  useRedis?: boolean;
  redisOptions?: {
    url?: string;
    prefix?: string;
    connectionOptions?: Record<string, any>;
  };
  
  // Memory management options
  memoryManagement?: {
    enabled: boolean;
    pruneThreshold?: number; // Percentage of elements to prune when memory pressure is detected
    aggressivePruneThreshold?: number; // Percentage of elements to prune when memory is critical
  };
}

// UI Action types
export interface Coordinate {
  x: number;
  y: number;
}

export interface TapOptions {
  timeout?: number;
  force?: boolean;
  verifyEnabled?: boolean;
  verifyVisible?: boolean;
}

export interface LongPressOptions {
  duration?: number;
  pressure?: number;
}

export interface TextInputOptions {
  clearFirst?: boolean;
  hideKeyboard?: boolean;
  verifyInput?: boolean;
}

export interface SwipeOptions {
  duration?: number;
  speed?: number;
}

export interface ScrollOptions {
  direction?: 'up' | 'down' | 'left' | 'right';
  distance?: number;
  duration?: number;
  maxScrolls?: number;
}

/**
 * Options for clipboard operations
 */
export interface ClipboardOptions {
  format?: 'plaintext' | 'url' | 'image';
  encoding?: 'utf8' | 'base64';
  timeout?: number;
  verifyOperation?: boolean;
}

// Visual verification types
export interface ScreenshotRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VisualCheckOptions {
  region?: ScreenshotRegion;
  threshold?: number;
  saveScreenshots?: boolean;
  screenshotNamePrefix?: string;
}

// WebdriverIO Types Compatibility Extensions
declare global {
  namespace WebdriverIO {
    // Extend to make ChainablePromiseElement compatible with Element
    interface Element {
      // Add any missing properties or methods here if needed
    }
    
    // Add any other extensions needed
  }
}

// Re-export types from WebdriverIO namespace
export interface Element extends WebdriverIO.Element {}

// Alias for ISessionManager to avoid circular dependencies
export type ISessionManager = SessionManager;

// Export all types from the state module
export * from './state';

// Cloud Device Farm types
export enum CloudProvider {
  BROWSERSTACK = 'browserstack',
  SAUCELABS = 'saucelabs',
  LAMBDATEST = 'lambdatest',
  PERFECTO = 'perfecto',
  LOCAL = 'local'
}

export interface CloudDeviceOptions {
  provider: CloudProvider;
  username?: string;
  accessKey?: string;
  projectName?: string;
  buildName?: string;
  testName?: string;
  region?: string;
  debug?: boolean;
  networkLogs?: boolean;
  consoleLogs?: boolean;
  deviceLogs?: boolean;
  timeout?: number;
  proxy?: {
    host: string;
    port: number;
    protocol?: string;
    username?: string;
    password?: string;
  };
} 