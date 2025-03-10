import sinon from 'sinon';
import { AppiumEventManager } from '../../src/session/AppiumEventManager';
import { EventSystem } from '../../src/session/EventSystem';
import { AppiumEventType, LogEvent, SessionEvent } from '../../src/types/events';

describe('AppiumEventManager', () => {
  let eventSystem: EventSystem;
  let eventManager: AppiumEventManager;
  let driver: any;
  
  beforeEach(() => {
    eventSystem = new EventSystem();
    driver = {
      on: sinon.stub(),
      getSession: sinon.stub().returns({ sessionId: 'test-session-id' }),
      getEvents: sinon.stub().returns([])
    };
    
    eventManager = new AppiumEventManager(driver, eventSystem);
  });
  
  afterEach(() => {
    // Cleanup event listeners and monitoring
    try {
      // Clear the connection monitor interval if it exists
      if (eventManager && eventManager['connectionMonitor']) {
        clearInterval(eventManager['connectionMonitor']);
        eventManager['connectionMonitor'] = null;
      }
      
      // Clean event system
      if (eventSystem) {
        eventSystem.clearAllListeners();
      }
    } catch (error) {
      console.warn('Error during AppiumEventManager cleanup', error);
    }
    
    sinon.restore();
  });
  
  describe('initialize', () => {
    it('should register event handlers for Appium events', async () => {
      await eventManager.initialize();
      
      // Verify that we've registered handlers for key events
      expect(driver.on.calledWith('log')).toBe(true);
      expect(driver.on.calledWith('command')).toBe(true);
      
      // Verify that we've set up a connection monitor
      expect(eventManager['connectionMonitor']).not.toBeNull();
    });
  });
  
  describe('handleLogEvent', () => {
    it('should publish a log event to the event system', () => {
      const publishSpy = sinon.spy(eventSystem, 'publish');
      const logData = { 
        level: 'info', 
        message: 'Test log message', 
        timestamp: Date.now() 
      };
      
      eventManager['handleLogEvent'](logData);
      
      expect(publishSpy.calledWith(AppiumEventType.LOG, sinon.match(logData))).toBe(true);
    });
  });
  
  describe('handleSessionEvent', () => {
    it('should publish a session created event', () => {
      const publishSpy = sinon.spy(eventSystem, 'publish');
      const sessionData = { 
        sessionId: 'test-session-id', 
        capabilities: { platformName: 'iOS' } 
      };
      
      eventManager['handleSessionEvent']('create', sessionData);
      
      const expectedEvent: SessionEvent = {
        sessionId: 'test-session-id',
        state: 'created',
        timestamp: sinon.match.number,
        capabilities: { platformName: 'iOS' }
      };
      
      expect(publishSpy.calledWith(
        AppiumEventType.SESSION_CREATE, 
        sinon.match(expectedEvent)
      )).toBe(true);
    });
    
    it('should publish a session deleted event', () => {
      const publishSpy = sinon.spy(eventSystem, 'publish');
      const sessionData = { sessionId: 'test-session-id' };
      
      eventManager['handleSessionEvent']('delete', sessionData);
      
      const expectedEvent: SessionEvent = {
        sessionId: 'test-session-id',
        state: 'deleted',
        timestamp: sinon.match.number
      };
      
      expect(publishSpy.calledWith(
        AppiumEventType.SESSION_DELETE, 
        sinon.match(expectedEvent)
      )).toBe(true);
    });
  });
  
  describe('handleCommandEvent', () => {
    it('should publish a command start event', () => {
      const publishSpy = sinon.spy(eventSystem, 'publish');
      const commandData = { 
        sessionId: 'test-session-id', 
        command: 'click', 
        params: [{ elementId: '123' }] 
      };
      
      eventManager['handleCommandEvent']('start', commandData);
      
      expect(publishSpy.calledWith(
        AppiumEventType.COMMAND_START, 
        sinon.match({
          sessionId: 'test-session-id',
          command: 'click',
          params: [{ elementId: '123' }],
          timestamp: sinon.match.number
        })
      )).toBe(true);
    });
    
    it('should publish a command end event', () => {
      const publishSpy = sinon.spy(eventSystem, 'publish');
      const commandData = { 
        sessionId: 'test-session-id', 
        command: 'click', 
        result: { status: 0 }, 
        duration: 100 
      };
      
      eventManager['handleCommandEvent']('end', commandData);
      
      expect(publishSpy.calledWith(
        AppiumEventType.COMMAND_END, 
        sinon.match({
          sessionId: 'test-session-id',
          command: 'click',
          result: { status: 0 },
          duration: 100,
          timestamp: sinon.match.number
        })
      )).toBe(true);
    });
    
    it('should publish a command error event', () => {
      const publishSpy = sinon.spy(eventSystem, 'publish');
      const errorObj = new Error('Command failed');
      const commandData = { 
        sessionId: 'test-session-id', 
        command: 'click', 
        error: errorObj
      };
      
      eventManager['handleCommandEvent']('error', commandData);
      
      expect(publishSpy.calledWith(
        AppiumEventType.COMMAND_ERROR, 
        sinon.match({
          sessionId: 'test-session-id',
          command: 'click',
          error: errorObj,
          timestamp: sinon.match.number
        })
      )).toBe(true);
    });
  });
  
  describe('monitorConnection', () => {
    it('should start checking connection status periodically', async () => {
      const clock = sinon.useFakeTimers();
      const publishSpy = sinon.spy(eventSystem, 'publish');
      
      // Mock driver.status to return different states on consecutive calls
      driver.status = sinon.stub();
      driver.status.onFirstCall().resolves({ ready: true });
      driver.status.onSecondCall().rejects(new Error('Connection lost'));
      
      eventManager['monitorConnection'](1000);  // 1 second interval
      
      // First check - connected
      await clock.tickAsync(1000);
      expect(driver.status.callCount).toBe(1);
      expect(publishSpy.calledWith(
        AppiumEventType.CONNECTION_CHANGE,
        sinon.match({ state: 'connected' })
      )).toBe(true);
      
      // Second check - error
      publishSpy.resetHistory();
      await clock.tickAsync(1000);
      expect(driver.status.callCount).toBe(2);
      expect(publishSpy.calledWith(
        AppiumEventType.CONNECTION_CHANGE,
        sinon.match({ state: 'error' })
      )).toBe(true);
      
      clock.restore();
    });
  });
  
  describe('shutdown', () => {
    it('should clear the connection monitor and unregister event listeners', async () => {
      const clearIntervalSpy = sinon.spy(global, 'clearInterval');
      
      eventManager['connectionMonitor'] = setInterval(() => {}, 1000) as any;
      
      await eventManager.shutdown();
      
      expect(clearIntervalSpy.called).toBe(true);
      expect(eventManager['connectionMonitor']).toBeNull();
    });
  });
}); 