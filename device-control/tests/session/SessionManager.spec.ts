import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { SessionManager, DriverFactory } from '../../src/session/SessionManager';
import { ConnectionPool, Connection } from '../../src/session/ConnectionPool';
import { AppiumEventManager } from '../../src/session/AppiumEventManager';
import { EventSystem } from '../../src/session/EventSystem';
import { SessionConfig, SessionState } from '../../src/types';

// Mock implementations
const mockDriver = {
  sessionId: 'test-session-id',
  capabilities: { platformName: 'iOS' },
  status: jest.fn().mockResolvedValue({ ready: true }),
  deleteSession: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
  once: jest.fn(),
  off: jest.fn(),
  addListener: jest.fn(),
  removeListener: jest.fn(),
  emit: jest.fn(),
  eventNames: jest.fn(),
  listenerCount: jest.fn(),
  listeners: jest.fn(),
  removeAllListeners: jest.fn()
} as unknown as WebdriverIO.Browser;

const mockDriverFactory: DriverFactory = () => Promise.resolve(mockDriver);

// Create a real EventSystem instance for testing
const eventSystem = new EventSystem();

// Create mock ConnectionPool with proper return types
const mockConnectionPool = {
  initialize: jest.fn().mockResolvedValue(undefined),
  acquireConnection: jest.fn().mockResolvedValue({
    driver: mockDriver,
    sessionId: 'test-connection-id',
    inUse: true,
    lastUsed: Date.now(),
    created: Date.now()
  } as Connection),
  removeConnection: jest.fn().mockResolvedValue(undefined),
  shutdown: jest.fn().mockResolvedValue(undefined)
} as unknown as ConnectionPool;

jest.mock('../../src/session/ConnectionPool', () => {
  return {
    ConnectionPool: jest.fn().mockImplementation(() => mockConnectionPool)
  };
});

// Mock the AppiumEventManager class
jest.mock('../../src/session/AppiumEventManager', () => ({
  AppiumEventManager: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    emit: jest.fn(),
    on: jest.fn(),
    shutdown: jest.fn().mockResolvedValue(undefined)
  }))
}));

describe('SessionManager', () => {
  let sessionManager: SessionManager;

  beforeEach(async () => {
    sessionManager = new SessionManager(mockDriverFactory, eventSystem);
    await sessionManager.initialize();
  });

  afterEach(async () => {
    // Clean up all sessions
    await Promise.all(
      Array.from(sessionManager['sessions'].keys()).map(id => 
        sessionManager.terminateSession(id)
      )
    );
    // Clean up event system
    eventSystem.clearAllListeners();
    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('initialize', () => {
    it('should initialize the connection pool', async () => {
      await sessionManager.initialize();
      expect(mockConnectionPool.initialize).toHaveBeenCalled();
    });
  });

  describe('createSession', () => {
    it('should create a new session with default config', async () => {
      await sessionManager.initialize();
      const session = await sessionManager.createSession();
      expect(session.id).toBeDefined();
      expect(mockConnectionPool.acquireConnection).toHaveBeenCalled();
      // Clean up the session
      await sessionManager.terminateSession(session.id);
    });

    it('should create a session with custom config', async () => {
      await sessionManager.initialize();
      const config: SessionConfig = {
        capabilities: { platformName: 'iOS' },
        connectionRetries: 5,
        connectionTimeout: 60000,
        sessionTimeout: 300000
      };
      const session = await sessionManager.createSession(config);
      expect(session.id).toBeDefined();
      expect(mockConnectionPool.acquireConnection).toHaveBeenCalled();
      // Clean up the session
      await sessionManager.terminateSession(session.id);
    });
  });

  describe('getSession', () => {
    it('should return session info for existing session', async () => {
      await sessionManager.initialize();
      const session = await sessionManager.createSession();
      const info = await sessionManager.getSession(session.id);
      expect(info).toBeDefined();
      expect(info?.id).toBe(session.id);
      // Clean up the session
      await sessionManager.terminateSession(session.id);
    });

    it('should return null for non-existent session', async () => {
      await sessionManager.initialize();
      const info = await sessionManager.getSession('non-existent');
      expect(info).toBeNull();
    });
  });

  describe('releaseSession', () => {


    it('should return false for non-existent session', async () => {
      await sessionManager.initialize();
      const released = await sessionManager.releaseSession('non-existent');
      expect(released).toBe(false);
    });




    it('should return false for non-existent session', async () => {
      await sessionManager.initialize();
      const terminated = await sessionManager.terminateSession('non-existent');
      expect(terminated).toBe(false);
    });
  });
});

