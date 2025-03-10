import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { EventSystem } from '../../src/session/EventSystem';

describe('EventSystem', () => {
  let eventSystem: EventSystem;
  
  beforeEach(() => {
    eventSystem = new EventSystem();
  });
  
  afterEach(() => {
    eventSystem.clearAllListeners();
  });
  
  describe('subscribe', () => {
    it('should register a listener for an event', () => {
      const listener = jest.fn();
      const subscriptionId = eventSystem.subscribe('appium:log', listener);
      
      expect(subscriptionId).toBeDefined();
      expect(typeof subscriptionId).toBe('string');
      expect(subscriptionId.length).toBeGreaterThan(0);
    });
    
    it('should return unique subscription ids for multiple listeners', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      
      const id1 = eventSystem.subscribe('appium:log', listener1);
      const id2 = eventSystem.subscribe('appium:log', listener2);
      
      expect(id1).not.toEqual(id2);
    });
    
    it('should allow multiple subscriptions to the same event', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      const listener3 = jest.fn();
      
      eventSystem.subscribe('appium:log', listener1);
      eventSystem.subscribe('appium:log', listener2);
      eventSystem.subscribe('appium:state', listener3);
      
      eventSystem.publish('appium:log', { level: 'info', message: 'test' });
      
      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
      expect(listener3).not.toHaveBeenCalled();
    });
  });
  
  describe('unsubscribe', () => {
    it('should remove a listener with the subscription id', () => {
      const listener = jest.fn();
      const subscriptionId = eventSystem.subscribe('appium:log', listener);
      
      const result = eventSystem.unsubscribe(subscriptionId);
      
      expect(result).toBe(true);
      
      // Publish an event and verify listener wasn't called
      eventSystem.publish('appium:log', { level: 'info', message: 'test' });
      expect(listener).not.toHaveBeenCalled();
    });
    
    it('should return false if subscription id does not exist', () => {
      const result = eventSystem.unsubscribe('non-existent-id');
      expect(result).toBe(false);
    });
    
    it('should clean up empty event listener sets', () => {
      const listener = jest.fn();
      const subscriptionId = eventSystem.subscribe('appium:log', listener);
      
      // Verify the event listener set exists
      expect((eventSystem as any).eventListeners.has('appium:log')).toBe(true);
      
      // Unsubscribe the only listener
      eventSystem.unsubscribe(subscriptionId);
      
      // Verify the event listener set was removed
      expect((eventSystem as any).eventListeners.has('appium:log')).toBe(false);
    });
    
    it('should not affect other subscriptions when unsubscribing', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      
      const id1 = eventSystem.subscribe('appium:log', listener1);
      eventSystem.subscribe('appium:log', listener2);
      
      eventSystem.unsubscribe(id1);
      
      eventSystem.publish('appium:log', { level: 'info', message: 'test' });
      
      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalledTimes(1);
    });
  });
  
  describe('publish', () => {
    it('should notify all listeners for the event', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      const eventData = { level: 'info', message: 'test event' };
      
      eventSystem.subscribe('appium:log', listener1);
      eventSystem.subscribe('appium:log', listener2);
      
      eventSystem.publish('appium:log', eventData);
      
      expect(listener1).toHaveBeenCalledWith(eventData);
      expect(listener2).toHaveBeenCalledWith(eventData);
    });
    
    it('should not notify listeners for different events', () => {
      const logListener = jest.fn();
      const stateListener = jest.fn();
      
      eventSystem.subscribe('appium:log', logListener);
      eventSystem.subscribe('appium:state', stateListener);
      
      eventSystem.publish('appium:log', { level: 'info', message: 'test' });
      
      expect(logListener).toHaveBeenCalledTimes(1);
      expect(stateListener).not.toHaveBeenCalled();
    });
    
    it('should do nothing if there are no listeners for the event', () => {
      // This should not throw an error
      expect(() => {
        eventSystem.publish('appium:unknown', { test: 'data' });
      }).not.toThrow();
    });
    
    it('should handle errors in event listeners', () => {
      const errorListener = jest.fn().mockImplementation(() => {
        throw new Error('Listener error');
      });
      const normalListener = jest.fn();
      
      // Mock console.error to prevent test output pollution
      const originalConsoleError = console.error;
      console.error = jest.fn();
      
      eventSystem.subscribe('appium:log', errorListener);
      eventSystem.subscribe('appium:log', normalListener);
      
      // This should not throw despite the error in the first listener
      expect(() => {
        eventSystem.publish('appium:log', { level: 'info', message: 'test' });
      }).not.toThrow();
      
      // The error should be logged
      expect(console.error).toHaveBeenCalled();
      
      // The second listener should still be called
      expect(normalListener).toHaveBeenCalledTimes(1);
      
      // Restore console.error
      console.error = originalConsoleError;
    });
  });
  
  describe('clearListeners', () => {
    it('should remove all listeners for a specific event', () => {
      const logListener1 = jest.fn();
      const logListener2 = jest.fn();
      const stateListener = jest.fn();
      
      eventSystem.subscribe('appium:log', logListener1);
      eventSystem.subscribe('appium:log', logListener2);
      eventSystem.subscribe('appium:state', stateListener);
      
      eventSystem.clearListeners('appium:log');
      
      eventSystem.publish('appium:log', { level: 'info', message: 'test' });
      eventSystem.publish('appium:state', { status: 'ready' });
      
      expect(logListener1).not.toHaveBeenCalled();
      expect(logListener2).not.toHaveBeenCalled();
      expect(stateListener).toHaveBeenCalledTimes(1);
    });
    
    it('should do nothing if the event has no listeners', () => {
      // This should not throw an error
      expect(() => {
        eventSystem.clearListeners('appium:unknown');
      }).not.toThrow();
    });
    
    it('should remove the event from the eventListeners map', () => {
      const listener = jest.fn();
      eventSystem.subscribe('appium:log', listener);
      
      // Verify the event exists in the map
      expect((eventSystem as any).eventListeners.has('appium:log')).toBe(true);
      
      eventSystem.clearListeners('appium:log');
      
      // Verify the event was removed from the map
      expect((eventSystem as any).eventListeners.has('appium:log')).toBe(false);
    });
  });
  
  describe('clearAllListeners', () => {
    it('should remove all listeners for all events', () => {
      const logListener = jest.fn();
      const stateListener = jest.fn();
      
      eventSystem.subscribe('appium:log', logListener);
      eventSystem.subscribe('appium:state', stateListener);
      
      eventSystem.clearAllListeners();
      
      eventSystem.publish('appium:log', { level: 'info', message: 'test' });
      eventSystem.publish('appium:state', { status: 'ready' });
      
      expect(logListener).not.toHaveBeenCalled();
      expect(stateListener).not.toHaveBeenCalled();
    });
    
    it('should empty both the subscriptions and eventListeners maps', () => {
      const listener = jest.fn();
      eventSystem.subscribe('appium:log', listener);
      
      // Verify the maps have entries
      expect((eventSystem as any).subscriptions.size).toBeGreaterThan(0);
      expect((eventSystem as any).eventListeners.size).toBeGreaterThan(0);
      
      eventSystem.clearAllListeners();
      
      // Verify the maps are empty
      expect((eventSystem as any).subscriptions.size).toBe(0);
      expect((eventSystem as any).eventListeners.size).toBe(0);
    });
  });
}); 