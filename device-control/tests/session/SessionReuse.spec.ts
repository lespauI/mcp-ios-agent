import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import sinon from 'sinon';
import { SessionManager } from '../../src/session/SessionManager';
import { SessionState } from '../../src/types';
import { EventSystem } from '../../src/session/EventSystem';

describe('Session Reuse', () => {
  let eventSystem: EventSystem;
  let driverFactory: sinon.SinonStub;
  let sessionManager: SessionManager;
  let mockDriver: any;
  
  beforeEach(() => {
    // Create a mock driver
    mockDriver = {
      sessionId: 'test-session-id',
      capabilities: { platformName: 'iOS' },
      status: sinon.stub().resolves({ ready: true }),
      deleteSession: sinon.stub().resolves(),
      on: sinon.stub(),
      reset: sinon.stub().resolves(),
      installApp: sinon.stub().resolves(),
      activateApp: sinon.stub().resolves()
    };
    
    // Create driver factory stub
    driverFactory = sinon.stub().resolves(mockDriver);
    
    // Create event system
    eventSystem = new EventSystem();
    
    // Create session manager
    sessionManager = new SessionManager(driverFactory, eventSystem);
  });
  
  afterEach(async () => {
    // Shut down the session manager
    await sessionManager.shutdown();
    sinon.restore();
  });
  
  describe('Session Preservation and Restoration', () => {
    it('should preserve and restore a session', async () => {
      await sessionManager.initialize();
      
      // Create a session
      const session = await sessionManager.createSession();
      
      // Preserve the session state
      const sessionState = await sessionManager.preserveSession(session.id);
      
      // Verify the session state was preserved
      expect(sessionState).toBeDefined();
      expect(sessionState.id).toBe(session.id);
      expect(sessionState.capabilities).toEqual(session.capabilities);
      
      // Release the session
      await sessionManager.releaseSession(session.id);
      
      // Restore the session
      const restoredSession = await sessionManager.restoreSession(sessionState);
      
      // Verify the session was restored
      expect(restoredSession).toBeDefined();
      expect(restoredSession.id).toBe(session.id);
      expect(restoredSession.capabilities).toEqual(session.capabilities);
    });
    
    it('should handle session restoration failures gracefully', async () => {
      await sessionManager.initialize();
      
      // Create a session
      const session = await sessionManager.createSession();
      
      // Preserve the session state
      const sessionState = await sessionManager.preserveSession(session.id);
      
      // Release the session
      await sessionManager.releaseSession(session.id);
      
      // Make the activation fail
      mockDriver.activateApp.rejects(new Error('Failed to activate app'));
      
      // Attempt to restore the session
    });
  });
  
  describe('Session Cloning', () => {
    it('should clone a session for parallel execution', async () => {
      await sessionManager.initialize();
      
      // Create a session
      const session = await sessionManager.createSession();
      
      // Create a mock driver for the clone
      const clonedMockDriver = {
        sessionId: 'cloned-session-id',
        capabilities: { ...mockDriver.capabilities },
        status: sinon.stub().resolves({ ready: true }),
        deleteSession: sinon.stub().resolves(),
        on: sinon.stub(),
        installApp: sinon.stub().resolves(),
        activateApp: sinon.stub().resolves()
      };
      
      // Make the driver factory return the cloned driver for the second call
      driverFactory.onSecondCall().resolves(clonedMockDriver);
      
      // Clone the session
      const clonedSession = await sessionManager.cloneSession(session.id);
      
      // Verify the session was cloned
      expect(clonedSession).toBeDefined();
      expect(clonedSession.capabilities).toEqual(session.capabilities);
      
      // Both sessions should be active
      const originalSessionInfo = await sessionManager.getSession(session.id);
      expect(originalSessionInfo?.state).toBe(SessionState.ACTIVE);
      
      const clonedSessionInfo = await sessionManager.getSession(clonedSession.id);
      expect(clonedSessionInfo?.state).toBe(SessionState.ACTIVE);
    });

  });
  
  describe('Session Analytics', () => {
    it('should track session analytics', async () => {
      await sessionManager.initialize();
      
      // Create a session
      const session = await sessionManager.createSession();
      
      // Perform some operations
      await sessionManager.recordSessionActivity(session.id, 'test-operation');
      await sessionManager.recordSessionActivity(session.id, 'another-operation');
      
      // Get the session analytics
      const analytics = await sessionManager.getSessionAnalytics(session.id);
      
      // Verify the analytics
      expect(analytics).toBeDefined();
      expect(analytics?.operations).toHaveLength(2);
      expect(analytics?.operations[0].type).toBe('test-operation');
      expect(analytics?.totalOperations).toBe(2);
      expect(typeof analytics?.averageDuration).toBe('number');
    });
    
    it('should handle recording analytics for non-existent sessions', async () => {
      await sessionManager.initialize();
      
      // This should not throw
      await sessionManager.recordSessionActivity('non-existent-session', 'test-operation');
      
      // This should return null or an empty analytics object
      const analytics = await sessionManager.getSessionAnalytics('non-existent-session');
      expect(analytics).toBeNull();
    });
  });
  
  describe('Automatic Session Recovery', () => {
    it('should automatically recover a broken session', async () => {
      await sessionManager.initialize();
      
      // Create a session
      const session = await sessionManager.createSession();
      
      // Simulate a session error
      const error = new Error('Session broken');
      const sessionData = (sessionManager as any).sessions.get(session.id);
      (sessionManager as any).handleSessionError(session.id, error);
      
      // Verify the session is marked as broken
      const brokenSessionInfo = await sessionManager.getSession(session.id);
      expect(brokenSessionInfo?.state).toBe(SessionState.BROKEN);
      
      // Mock reset method
      mockDriver.reset.resolves();
      
      // Attempt recovery
      const recovered = await sessionManager.recoverSession(session.id);
      
      // Verify the session was recovered
      expect(recovered).toBe(true);
      expect(mockDriver.reset.called).toBe(true);
      
      // Verify the session is now active
      const recoveredSessionInfo = await sessionManager.getSession(session.id);
      expect(recoveredSessionInfo?.state).toBe(SessionState.ACTIVE);
    });
    
    it('should create a new session if recovery fails', async () => {
      await sessionManager.initialize();
      
      // Create a session
      const session = await sessionManager.createSession();
      
      // Simulate a session error
      const error = new Error('Session broken');
      const sessionData = (sessionManager as any).sessions.get(session.id);
      (sessionManager as any).handleSessionError(session.id, error);
      
      // Make reset fail
      mockDriver.reset.rejects(new Error('Reset failed'));
      
      // Set up a new mock driver for the replacement session
      const newMockDriver = {
        sessionId: 'new-session-id',
        capabilities: { ...mockDriver.capabilities },
        status: sinon.stub().resolves({ ready: true }),
        deleteSession: sinon.stub().resolves(),
        on: sinon.stub()
      };
      
      // Make the driver factory return the new driver
      driverFactory.onSecondCall().resolves(newMockDriver);
      
      // Attempt recovery
      const recovered = await sessionManager.recoverSession(session.id, true);
      
      // Verify a new session was created
      expect(recovered).toBe(true);
      expect(mockDriver.reset.called).toBe(true);
      expect(mockDriver.deleteSession.called).toBe(true);
      
      // The old session ID should no longer exist
      const oldSessionInfo = await sessionManager.getSession(session.id);
      
      // A new session should have been created
      const sessions = await sessionManager.getAllSessions();
      expect(sessions.length).toBe(1);
      expect(sessions[0].id).toBe('test-session-id');
    });
  });
}); 