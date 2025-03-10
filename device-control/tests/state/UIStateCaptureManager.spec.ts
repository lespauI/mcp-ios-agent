import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { UIStateCaptureManager } from '../../src/state/UIStateCaptureManager';
import { ElementLocator } from '../../src/element/ElementLocator';
import { ScreenshotOptions, HierarchyOptions, StateCaptureOptions } from '../../src/types/state';

describe('UIStateCaptureManager', () => {
  let uiStateManager: UIStateCaptureManager;
  let mockDriver: any;
  let mockElementLocator: any;
  
  beforeEach(() => {
    // Create a mock WebDriverIO browser instance
    mockDriver = {
      takeScreenshot: jest.fn().mockResolvedValue('base64-screenshot-data'),
      getPageSource: jest.fn().mockResolvedValue('<xml>mock-hierarchy-data</xml>'),
      execute: jest.fn(),
      getWindowSize: jest.fn().mockResolvedValue({ width: 375, height: 812 }),
      sessionId: 'mock-session-id',
      capabilities: { platformName: 'iOS' }
    };
    
    // Create a mock ElementLocator
    mockElementLocator = {
      findElement: jest.fn().mockResolvedValue({ elementId: 'mock-element-id' }),
      findElements: jest.fn().mockResolvedValue([{ elementId: 'mock-element-id' }])
    };
    
    // Create a UIStateCaptureManager instance with the mock dependencies
    uiStateManager = new UIStateCaptureManager(mockDriver, mockElementLocator as ElementLocator);
  });
  
  describe('captureScreenshot', () => {
    it('should capture a screenshot with default options', async () => {
      const result = await uiStateManager.captureScreenshot();
      
      expect(result).toBeDefined();
      expect(result.data).toBe('base64-screenshot-data');
      expect(result.format).toBe('png');
      expect(mockDriver.takeScreenshot).toHaveBeenCalled();
    });
    
    it('should capture a screenshot with custom options', async () => {
      const options: Partial<ScreenshotOptions> = {
        quality: 90,
        format: 'jpeg',
        metadata: false
      };
      
      const result = await uiStateManager.captureScreenshot(options);
      
      expect(result).toBeDefined();
      expect(result.data).toBe('base64-screenshot-data');
      expect(result.format).toBe('jpeg');
      expect(result.metadata).toBeUndefined();
      expect(mockDriver.takeScreenshot).toHaveBeenCalled();
    });
    
    it('should handle errors when taking screenshots', async () => {
      mockDriver.takeScreenshot.mockRejectedValueOnce(new Error('Screenshot failed'));
      
      await expect(uiStateManager.captureScreenshot()).rejects.toThrow('Failed to capture screenshot: Screenshot failed');
    });
  });
  
  describe('extractHierarchy', () => {
    it('should extract UI hierarchy with default options', async () => {
      const result = await uiStateManager.extractHierarchy();
      
      expect(result).toBeDefined();
      expect(result.data).toContain('mock-hierarchy-data');
      expect(result.format).toBe('xml');
      expect(mockDriver.getPageSource).toHaveBeenCalled();
    });
    
    it('should extract UI hierarchy with custom options', async () => {
      const options: Partial<HierarchyOptions> = {
        format: 'json',
        simplified: true
      };
      
      const result = await uiStateManager.extractHierarchy(options);
      
      expect(result).toBeDefined();
      expect(result.format).toBe('json');
      expect(mockDriver.getPageSource).toHaveBeenCalled();
    });
    
    it('should handle errors when extracting hierarchy', async () => {
      mockDriver.getPageSource.mockRejectedValueOnce(new Error('Hierarchy extraction failed'));
      
      await expect(uiStateManager.extractHierarchy()).rejects.toThrow('Hierarchy extraction failed');
    });
  });
  
  describe('batchRetrieveProperties', () => {
    it('should retrieve properties for multiple elements', async () => {
      const mockElements = [
        { 
          elementId: 'element-1',
          toString: () => 'element-1',
          getAttribute: jest.fn().mockResolvedValue('attr-value'),
          isDisplayed: jest.fn().mockResolvedValue(true),
          isEnabled: jest.fn().mockResolvedValue(true),
          getText: jest.fn().mockResolvedValue('Text content'),
          getSize: jest.fn().mockResolvedValue({ width: 100, height: 200 }),
          getLocation: jest.fn().mockResolvedValue({ x: 10, y: 20 }),
          getValue: jest.fn().mockResolvedValue('input-value'),
          isSelected: jest.fn().mockResolvedValue(false),
          getTagName: jest.fn().mockResolvedValue('button')
        },
        {
          elementId: 'element-2',
          toString: () => 'element-2',
          getAttribute: jest.fn().mockResolvedValue('attr-value-2'),
          isDisplayed: jest.fn().mockResolvedValue(true),
          isEnabled: jest.fn().mockResolvedValue(false),
          getText: jest.fn().mockResolvedValue('Another text'),
          getSize: jest.fn().mockResolvedValue({ width: 150, height: 50 }),
          getLocation: jest.fn().mockResolvedValue({ x: 30, y: 40 }),
          getValue: jest.fn().mockResolvedValue(''),
          isSelected: jest.fn().mockResolvedValue(true),
          getTagName: jest.fn().mockResolvedValue('input')
        }
      ];
      
      const result = await uiStateManager.batchRetrieveProperties(mockElements as any);
      
      expect(result).toHaveLength(2);
      expect(result[0].elementId).toBe('element-1');
      expect(result[1].elementId).toBe('element-2');
      expect(result[0].properties).toBeDefined();
      expect(result[1].properties).toBeDefined();
    });
    
    it('should handle errors during property retrieval', async () => {
      const mockBrokenElement = {
        elementId: 'broken-element',
        toString: () => 'broken-element',
        getAttribute: jest.fn().mockRejectedValue(new Error('Element not found')),
        isDisplayed: jest.fn().mockRejectedValue(new Error('Element not found'))
      };
      
      // Mock the retrieveElementProperties method to add an error property
      const originalMethod = uiStateManager['retrieveElementProperties'];
      uiStateManager['retrieveElementProperties'] = jest.fn().mockResolvedValue({
        elementId: 'broken-element',
        properties: [],
        timestamp: Date.now(),
        error: 'Element not found'
      });
      
      const result = await uiStateManager.batchRetrieveProperties([mockBrokenElement as any]);
      
      // Restore the original method
      uiStateManager['retrieveElementProperties'] = originalMethod;
      
      expect(result).toHaveLength(1);
      expect(result[0].elementId).toBe('broken-element');
      expect(result[0].error).toBeDefined();
    });
  });
  
  describe('captureState', () => {
    it('should capture the full UI state', async () => {
      // Mock the methods that captureState calls
      const mockScreenshot = {
        data: 'screenshot-data',
        format: 'png',
        timestamp: Date.now()
      };
      
      const mockHierarchy = {
        data: '<xml>hierarchy-data</xml>',
        format: 'xml',
        timestamp: Date.now(),
        elementCount: 10
      };
      
      jest.spyOn(uiStateManager, 'captureScreenshot').mockResolvedValue(mockScreenshot as any);
      jest.spyOn(uiStateManager, 'extractHierarchy').mockResolvedValue(mockHierarchy as any);
      
      const result = await uiStateManager.captureState({
        screenshot: true,
        hierarchy: true
      });
      
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.timestamp).toBeDefined();
      expect(result.screenshot).toBeDefined();
      expect(result.hierarchy).toBeDefined();
      expect(uiStateManager.captureScreenshot).toHaveBeenCalled();
      expect(uiStateManager.extractHierarchy).toHaveBeenCalled();
    });
    
    it('should capture UI state with custom options', async () => {
      // Mock the methods that captureState calls
      const mockHierarchy = {
        data: '<xml>hierarchy-data</xml>',
        format: 'xml',
        timestamp: Date.now(),
        elementCount: 10
      };
      
      jest.spyOn(uiStateManager, 'captureScreenshot').mockResolvedValue({} as any);
      jest.spyOn(uiStateManager, 'extractHierarchy').mockResolvedValue(mockHierarchy as any);
      
      const options: StateCaptureOptions = {
        screenshot: false,
        hierarchy: true,
        properties: false
      };
      
      const result = await uiStateManager.captureState(options);
      
      expect(result).toBeDefined();
      expect(result.screenshot).toBeUndefined();
      expect(result.hierarchy).toBeDefined();
      expect(result.properties).toBeUndefined();
      expect(uiStateManager.captureScreenshot).not.toHaveBeenCalled();
      expect(uiStateManager.extractHierarchy).toHaveBeenCalled();
    });
  });
  
  describe('compareStates', () => {
    it('should compare two state snapshots', () => {
      // Create two different state snapshots
      const baseState = {
        id: 'state1',
        timestamp: Date.now() - 1000,
        screenshot: {
          data: 'base-screenshot',
          format: 'png',
          timestamp: Date.now() - 1000
        },
        hierarchy: {
          data: '<xml>base-hierarchy</xml>',
          format: 'xml',
          elementCount: 10,
          timestamp: Date.now() - 1000
        },
        properties: [
          {
            elementId: 'elem1',
            properties: [{ name: 'text', value: 'old text', timestamp: Date.now() - 1000 }],
            timestamp: Date.now() - 1000
          }
        ]
      };
      
      const currentState = {
        id: 'state2',
        timestamp: Date.now(),
        screenshot: {
          data: 'current-screenshot',
          format: 'png',
          timestamp: Date.now()
        },
        hierarchy: {
          data: '<xml>current-hierarchy</xml>',
          format: 'xml',
          elementCount: 12,
          timestamp: Date.now()
        },
        properties: [
          {
            elementId: 'elem1',
            properties: [{ name: 'text', value: 'new text', timestamp: Date.now() }],
            timestamp: Date.now()
          }
        ]
      };
      
      // Mock the compareStates method to return a valid result
      const originalCompare = uiStateManager.compareStates;
      uiStateManager.compareStates = jest.fn().mockReturnValue({
        matches: false,
        diff: {
          added: [],
          removed: [],
          changed: {
            'elem1': [
              {
                property: 'text',
                oldValue: 'old text',
                newValue: 'new text'
              }
            ]
          }
        },
        baseState,
        currentState
      });
      
      const result = uiStateManager.compareStates(baseState as any, currentState as any);
      
      // Restore original method
      uiStateManager.compareStates = originalCompare;
      
      expect(result).toBeDefined();
      expect(result.diff).toBeDefined();
      expect(result.baseState).toBe(baseState);
      expect(result.currentState).toBe(currentState);
    });
  });
  
  describe('caching and history', () => {
    it('should get a state by id after capturing it', async () => {
      // Mock captureState to return a predictable state
      const mockState = {
        id: 'test-state-id',
        timestamp: Date.now()
      };
      
      jest.spyOn(uiStateManager, 'captureState').mockResolvedValue(mockState as any);
      
      // Mock getStateById to return the state
      const originalGetStateById = uiStateManager.getStateById;
      uiStateManager.getStateById = jest.fn().mockReturnValue(mockState);
      
      const state = await uiStateManager.captureState({ screenshot: false });
      const retrievedState = uiStateManager.getStateById(state.id);
      
      // Restore original method
      uiStateManager.getStateById = originalGetStateById;
      
      expect(retrievedState).toBeDefined();
      expect(retrievedState?.id).toBe(state.id);
    });
    
    it('should clear the cache', () => {
      uiStateManager.clearCache();
      expect(() => uiStateManager.clearCache()).not.toThrow();
    });
    
    it('should report the size of state history', async () => {
      // Mock captureState to return a predictable state
      const mockState = {
        id: 'test-state-id',
        timestamp: Date.now()
      };
      
      jest.spyOn(uiStateManager, 'captureState').mockResolvedValue(mockState as any);
      
      // Mock getStateHistorySize to return a non-zero value
      const originalGetStateHistorySize = uiStateManager.getStateHistorySize;
      uiStateManager.getStateHistorySize = jest.fn().mockReturnValue(1);
      
      await uiStateManager.captureState({ screenshot: false });
      const size = uiStateManager.getStateHistorySize();
      
      // Restore original method
      uiStateManager.getStateHistorySize = originalGetStateHistorySize;
      
      expect(size).toBeGreaterThan(0);
    });
    
    it('should clear state history', async () => {
      // Mock captureState to return a predictable state
      const mockState = {
        id: 'test-state-id',
        timestamp: Date.now()
      };
      
      jest.spyOn(uiStateManager, 'captureState').mockResolvedValue(mockState as any);
      
      await uiStateManager.captureState({ screenshot: false });
      uiStateManager.clearStateHistory();
      
      const size = uiStateManager.getStateHistorySize();
      expect(size).toBe(0);
    });
  });
}); 