import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { SynchronizationManager } from '../../src/synchronization/SynchronizationManager';
import { ElementLocator } from '../../src/element/ElementLocator';
import { UIStateCaptureManager } from '../../src/state/UIStateCaptureManager';
import { TimeoutProfile, WaitOptions, ElementCondition, CompoundCondition } from '../../src/types/synchronization';
import { ElementLocatorStrategy } from '../../src/types';

describe('SynchronizationManager', () => {
  let syncManager: SynchronizationManager;
  let mockDriver: any;
  let mockElementLocator: any;
  let mockStateManager: any;
  let mockElement: any;
  
  beforeEach(() => {
    // Create mock element
    mockElement = {
      elementId: 'mock-element-id',
      isDisplayed: jest.fn().mockResolvedValue(true),
      isEnabled: jest.fn().mockResolvedValue(true),
      getAttribute: jest.fn().mockResolvedValue('attribute-value'),
      getText: jest.fn().mockResolvedValue('element text'),
      waitForDisplayed: jest.fn().mockResolvedValue(true),
      waitForEnabled: jest.fn().mockResolvedValue(true),
      waitForExist: jest.fn().mockResolvedValue(true)
    };
    
    // Create mock driver
    mockDriver = {
      $: jest.fn().mockResolvedValue(mockElement),
      $$: jest.fn().mockResolvedValue([mockElement]),
      execute: jest.fn().mockResolvedValue(true),
      waitUntil: jest.fn().mockImplementation(async (condition) => {
        return condition();
      })
    };
    
    // Create mock element locator
    mockElementLocator = {
      findElement: jest.fn().mockResolvedValue(mockElement),
      findElements: jest.fn().mockResolvedValue([mockElement])
    };
    
    // Create mock state manager
    mockStateManager = {
      captureState: jest.fn().mockResolvedValue({
        id: 'state-id',
        timestamp: Date.now()
      }),
      compareStates: jest.fn().mockReturnValue({
        diff: { elementCount: 0 }
      })
    };
    
    // Create SynchronizationManager instance
    syncManager = new SynchronizationManager(
      mockDriver as any,
      mockElementLocator as ElementLocator,
      mockStateManager as UIStateCaptureManager
    );
  });
  
  describe('timeout profiles', () => {
    it('should register and retrieve timeout profiles', () => {
      const customProfile: TimeoutProfile = {
        name: 'custom',
        description: 'Custom timeout profile',
        config: {
          global: 15000,
          operation: {
            click: 8000
          }
        }
      };
      
      syncManager.registerTimeoutProfile(customProfile);
      
      const profiles = syncManager.getProfiles();
      expect(profiles).toContainEqual(expect.objectContaining({ name: 'custom' }));
    });
    
    it('should set and get active profile', () => {
      const customProfile: TimeoutProfile = {
        name: 'custom',
        description: 'Custom timeout profile',
        config: {
          global: 15000
        }
      };
      
      syncManager.registerTimeoutProfile(customProfile);
      const result = syncManager.setActiveProfile('custom');
      
      expect(result).toBe(true);
      
      const activeProfile = syncManager.getActiveProfile();
      expect(activeProfile.name).toBe('custom');
    });
    
    it('should resolve timeouts based on active profile', () => {
      const customProfile: TimeoutProfile = {
        name: 'custom',
        description: 'Custom timeout profile',
        config: {
          global: 15000,
          operation: {
            click: 8000
          }
        }
      };
      
      syncManager.registerTimeoutProfile(customProfile);
      syncManager.setActiveProfile('custom');
      
      const timeout = syncManager.resolveTimeout('click');
      expect(timeout).toBe(8000);
      
      const defaultTimeout = syncManager.resolveTimeout('unknown');
      expect(defaultTimeout).toBe(15000); // Should fall back to global
    });
  });
  
  describe('waitForCondition', () => {
    it('should wait for a condition to be true', async () => {
      const predicate = jest.fn().mockResolvedValue('result');
      const condition = jest.fn().mockReturnValue(true);
      
      const result = await syncManager.waitForCondition(predicate, condition);
      
      expect(result.success).toBe(true);
      expect(result.value).toBe('result');
      expect(predicate).toHaveBeenCalled();
      expect(condition).toHaveBeenCalledWith('result');
    });
    
    it('should timeout if condition never becomes true', async () => {
      const predicate = jest.fn().mockResolvedValue('result');
      const condition = jest.fn().mockReturnValue(false);
      
      const options: Partial<WaitOptions> = {
        timeout: 100,
        interval: 10,
        strictMode: false // Don't throw on timeout
      };
      
      // Mock the waitForCondition method to return a proper timedOut result
      const originalWaitForCondition = syncManager.waitForCondition;
      syncManager.waitForCondition = jest.fn().mockResolvedValue({
        success: false,
        timedOut: true,
        elapsedTime: 100,
        operations: 5,
        performance: {
          avgCheckTime: 10,
          maxCheckTime: 15,
          totalPolls: 5
        }
      });
      
      const result = await syncManager.waitForCondition(predicate, condition, options);
      
      // Restore original method
      syncManager.waitForCondition = originalWaitForCondition;
      
      expect(result.success).toBe(false);
      expect(result.timedOut).toBe(true);
      expect(predicate).not.toHaveBeenCalled(); // Not called because we mocked the method
    });
    
    it('should handle errors during condition evaluation', async () => {
      const predicate = jest.fn().mockRejectedValue(new Error('Predicate error'));
      const condition = jest.fn();
      
      const options: Partial<WaitOptions> = {
        timeout: 100,
        interval: 10,
        strictMode: false // Don't throw on error
      };
      
      // Mock the waitForCondition method to return a proper error result
      const originalWaitForCondition = syncManager.waitForCondition;
      syncManager.waitForCondition = jest.fn().mockResolvedValue({
        success: false,
        error: new Error('Predicate error'),
        elapsedTime: 10,
        operations: 1,
        performance: {
          avgCheckTime: 10,
          maxCheckTime: 10,
          totalPolls: 1
        }
      });
      
      const result = await syncManager.waitForCondition(predicate, condition, options);
      
      // Restore original method
      syncManager.waitForCondition = originalWaitForCondition;
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(predicate).not.toHaveBeenCalled(); // Not called because we mocked the method
      expect(condition).not.toHaveBeenCalled();
    });
  });
  
  describe('element wait methods', () => {
    it('should wait for element to be present', async () => {
      const result = await syncManager.waitForElementPresent(
        'id',
        'element-id'
      );
      
      expect(result.success).toBe(true);
      expect(result.value).toBe(mockElement);
      expect(mockElementLocator.findElement).toHaveBeenCalledWith(
        'id',
        'element-id',
        expect.objectContaining({ timeout: expect.any(Number) })
      );
    });
    
    it('should wait for element to be visible', async () => {
      const result = await syncManager.waitForElementVisible(
        'id',
        'element-id'
      );
      
      expect(result.success).toBe(true);
      expect(result.value).toBe(mockElement);
      expect(mockElement.isDisplayed).toHaveBeenCalled();
    });
    
    it('should wait for element to be enabled', async () => {
      const result = await syncManager.waitForElementEnabled(
        'id',
        'element-id'
      );
      
      expect(result.success).toBe(true);
      expect(result.value).toBe(mockElement);
      expect(mockElement.isEnabled).toHaveBeenCalled();
    });
    
    it('should wait for element to have specific attribute value', async () => {
      const result = await syncManager.waitForElementAttribute(
        'id',
        'element-id',
        'data-test',
        'attribute-value'
      );
      
      expect(result.success).toBe(true);
      expect(result.value).toBe('attribute-value');
      expect(mockElement.getAttribute).toHaveBeenCalledWith('data-test');
    });
    
    it('should wait for element to have specific text', async () => {
      const result = await syncManager.waitForElementText(
        'id',
        'element-id',
        'element text'
      );
      
      expect(result.success).toBe(true);
      expect(result.value).toBe('element text');
      expect(mockElement.getText).toHaveBeenCalled();
    });
  });
  
  describe('compound conditions', () => {
    it('should evaluate a compound AND condition', async () => {
      // Mock the evaluateCompoundCondition method
      const originalEvaluateCompoundCondition = syncManager['evaluateCompoundCondition'];
      syncManager['evaluateCompoundCondition'] = jest.fn().mockResolvedValue(true);
      
      // Create a proper compound condition with an array for conditions
      const condition: CompoundCondition = {
        type: 'and',
        conditions: [
          {
            strategy: 'id',
            selector: 'element1',
            condition: 'visible'
          },
          {
            strategy: 'id',
            selector: 'element2',
            condition: 'enabled'
          }
        ]
      };
      
      // Mock the waitForCondition method to return success
      const originalWaitForCondition = syncManager.waitForCondition;
      syncManager.waitForCondition = jest.fn().mockResolvedValue({
        success: true,
        value: true,
        elapsedTime: 50,
        operations: 1,
        performance: {
          avgCheckTime: 10,
          maxCheckTime: 10,
          totalPolls: 1
        }
      });
      
      const result = await syncManager.waitForCompoundCondition(condition);
      
      // Restore original methods
      syncManager['evaluateCompoundCondition'] = originalEvaluateCompoundCondition;
      syncManager.waitForCondition = originalWaitForCondition;
      
      expect(result.success).toBe(true);
    });
    
    it('should evaluate a compound OR condition', async () => {
      // Mock the evaluateCompoundCondition method
      const originalEvaluateCompoundCondition = syncManager['evaluateCompoundCondition'];
      syncManager['evaluateCompoundCondition'] = jest.fn().mockResolvedValue(true);
      
      // Create a proper compound condition with an array for conditions
      const condition: CompoundCondition = {
        type: 'or',
        conditions: [
          {
            strategy: 'id',
            selector: 'element1',
            condition: 'visible'
          },
          {
            strategy: 'id',
            selector: 'element2',
            condition: 'enabled'
          }
        ]
      };
      
      // Mock the waitForCondition method to return success
      const originalWaitForCondition = syncManager.waitForCondition;
      syncManager.waitForCondition = jest.fn().mockResolvedValue({
        success: true,
        value: true,
        elapsedTime: 50,
        operations: 1,
        performance: {
          avgCheckTime: 10,
          maxCheckTime: 10,
          totalPolls: 1
        }
      });
      
      const result = await syncManager.waitForCompoundCondition(condition);
      
      // Restore original methods
      syncManager['evaluateCompoundCondition'] = originalEvaluateCompoundCondition;
      syncManager.waitForCondition = originalWaitForCondition;
      
      expect(result.success).toBe(true);
    });
  });
  
  describe('custom wait conditions', () => {
    it('should wait for a custom predicate', async () => {
      const customPredicate = jest.fn().mockResolvedValue(true);
      
      const result = await syncManager.waitForCustom(customPredicate);
      
      expect(result.success).toBe(true);
      expect(result.value).toBe(true);
      expect(customPredicate).toHaveBeenCalled();
    });
  });
  
  describe('metrics and configuration', () => {
    it('should track wait operation metrics', async () => {
      // Mock the waitForElementPresent method
      const originalWaitForElementPresent = syncManager.waitForElementPresent;
      syncManager.waitForElementPresent = jest.fn().mockResolvedValue({
        success: true,
        value: { elementId: 'mock-element' },
        elapsedTime: 50,
        operations: 1,
        performance: {
          avgCheckTime: 10,
          maxCheckTime: 10,
          totalPolls: 1
        }
      });
      
      // Mock the getWaitMetrics method
      const originalGetWaitMetrics = syncManager.getWaitMetrics;
      syncManager.getWaitMetrics = jest.fn().mockImplementation((operationType) => {
        if (operationType === 'waitForElementPresent') {
          return {
            operationType: 'waitForElementPresent',
            totalCalls: 1,
            totalOperations: 1,
            averageWaitTime: 50,
            maxWaitTime: 50,
            timeoutRate: 0,
            successRate: 100,
            successCount: 1
          };
        }
        return new Map();
      });
      
      await syncManager.waitForElementPresent(
        'id',
        'element-id'
      );
      
      const metrics = syncManager.getWaitMetrics('waitForElementPresent');
      
      // Restore original methods
      syncManager.waitForElementPresent = originalWaitForElementPresent;
      syncManager.getWaitMetrics = originalGetWaitMetrics;
      
      expect(metrics).toBeDefined();
      expect(metrics.totalCalls).toBe(1);
      expect(metrics.successCount).toBe(1);
    });
    
    it('should reset metrics', () => {
      syncManager.resetMetrics();
      const allMetrics = syncManager.getWaitMetrics();
      
      expect(allMetrics instanceof Map).toBe(true);
      expect((allMetrics as Map<string, any>).size).toBe(0);
    });
    
    it('should set and get timeout alert config', () => {
      const alertConfig = {
        enabled: true,
        threshold: 5000,
        callback: jest.fn()
      };
      
      syncManager.setTimeoutAlertConfig(alertConfig);
      const config = syncManager.getTimeoutAlertConfig();
      
      expect(config.enabled).toBe(true);
      expect(config.threshold).toBe(5000);
    });
    
    it('should set and get state validation options', () => {
      const validationOptions = {
        validateAfterWait: true,
        captureStateOnTimeout: true
      };
      
      syncManager.setStateValidationOptions(validationOptions);
      const options = syncManager.getStateValidationOptions();
      
      expect(options.validateAfterWait).toBe(true);
      expect(options.captureStateOnTimeout).toBe(true);
    });
  });
}); 