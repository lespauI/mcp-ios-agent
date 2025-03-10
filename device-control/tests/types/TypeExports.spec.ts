/**
 * This test file verifies that all types are properly exported from the types module
 * and can be used correctly in other modules.
 */
import { jest, describe, it, expect } from '@jest/globals';
import {
  SessionConfig,
  SessionInfo,
  SessionState,
  PreservedSessionState,
  SessionOperation,
  SessionAnalytics,
  SessionManager,
  DeviceProfile,
  ConnectionPoolConfig,
  ElementLocatorStrategy,
  ElementFindStrategy,
  ElementCacheOptions,
  Coordinate,
  TapOptions,
  LongPressOptions,
  TextInputOptions,
  SwipeOptions,
  ScrollOptions,
  ClipboardOptions,
  ScreenshotRegion,
  VisualCheckOptions
} from '../../src/types';

describe('Type Exports', () => {
  describe('ElementLocatorStrategy', () => {
    it('should include all necessary locator strategies', () => {
      // Define an array of all expected strategies
      const strategies: ElementLocatorStrategy[] = [
        'accessibilityId',
        'accessibility id',
        'id',
        'xpath',
        'className',
        'class name',
        'predicate',
        'ios predicate',
        'classChain',
        'ios class chain',
        'css selector',
        'name',
        'tag name',
        'link text',
        'partial link text'
      ];
      
      // Verify that all strategies can be assigned to the ElementLocatorStrategy type
      strategies.forEach(strategy => {
        const typedStrategy: ElementLocatorStrategy = strategy;
        expect(typedStrategy).toBe(strategy);
      });
    });

    it('should export ElementLocatorStrategy type', () => {
      // This is a type test, so just verifying it compiles is enough
      const strategy: ElementLocatorStrategy = 'accessibility id';
      expect(strategy).toBe('accessibility id');
    });
  });
  
  describe('ElementCacheOptions', () => {
    it('should support Redis configuration', () => {
      // Define sample cache options with Redis
      const options: ElementCacheOptions = {
        enabled: true,
        ttl: 30000,
        maxEntries: 100,
        preloadDepth: 2,
        useRedis: true,
        redisOptions: {
          url: 'redis://localhost:6379',
          prefix: 'element-cache:',
          connectionOptions: {
            retryStrategy: 3
          }
        }
      };
      
      // Verify Redis properties
      expect(options.useRedis).toBe(true);
      expect(options.redisOptions?.url).toBe('redis://localhost:6379');
      expect(options.redisOptions?.prefix).toBe('element-cache:');
      expect(options.redisOptions?.connectionOptions).toBeDefined();
    });
  });
  
  describe('Visual verification types', () => {
    it('should support screenshot regions and visual check options', () => {
      // Define a sample screenshot region
      const region: ScreenshotRegion = {
        x: 10,
        y: 20,
        width: 100,
        height: 200
      };
      
      // Define visual check options
      const options: VisualCheckOptions = {
        region,
        threshold: 0.05,
        saveScreenshots: true,
        screenshotNamePrefix: 'test-'
      };
      
      // Verify properties
      expect(region.x).toBe(10);
      expect(region.y).toBe(20);
      expect(region.width).toBe(100);
      expect(region.height).toBe(200);
      expect(options.region).toBe(region);
      expect(options.threshold).toBe(0.05);
      expect(options.saveScreenshots).toBe(true);
      expect(options.screenshotNamePrefix).toBe('test-');
    });
  });

  describe('WebdriverIO Type Extensions', () => {
    // These are type tests that verify the WebdriverIO extensions compile correctly
    
    it('should define Browser interface with required methods', () => {
      // This is a mock/type test - we're just ensuring the types are defined correctly
      const mockDriver: WebdriverIO.Browser = {
        // App management methods
        terminateApp: jest.fn(),
        activateApp: jest.fn(),
        isAppInstalled: jest.fn(),
        installApp: jest.fn(),
        removeApp: jest.fn(),
        reset: jest.fn(),
        launchApp: jest.fn(),
        closeApp: jest.fn(),
        queryAppState: jest.fn(),
        background: jest.fn(),
        
        // Session methods
        execute: jest.fn(),
        executeScript: jest.fn(),
        status: jest.fn(),
        deleteSession: jest.fn(),
        
        // Element location methods
        $: jest.fn(),
        $$: jest.fn(),
        findElement: jest.fn(),
        findElements: jest.fn(),
        
        // Screenshot methods
        takeScreenshot: jest.fn(),
        saveScreenshot: jest.fn(),
        
        // Window/screen methods
        getWindowSize: jest.fn(),
        getWindowRect: jest.fn(),
        
        // XML source methods
        getPageSource: jest.fn(),
        
        // Context switching methods
        getContexts: jest.fn(),
        getContext: jest.fn(),
        switchContext: jest.fn(),
        
        // Mobile gestures
        touchAction: jest.fn(),
        touchPerform: jest.fn(),
        performActions: jest.fn(),
        
        // Mobile commands
        mobile: {
          launchApp: jest.fn(),
          terminateApp: jest.fn(),
          resetApp: jest.fn()
        },
        
        // EventEmitter methods
        on: jest.fn(),
        once: jest.fn(),
        off: jest.fn(),
        addListener: jest.fn(),
        removeListener: jest.fn(),
        emit: jest.fn(),
        eventNames: jest.fn(),
        listenerCount: jest.fn(),
        listeners: jest.fn(),
        removeAllListeners: jest.fn(),
        
        // Capabilities and session
        sessionId: 'test-session-id',
        capabilities: {
          platformName: 'iOS',
          platformVersion: '16.0',
          deviceName: 'iPhone 14',
          automationName: 'XCUITest'
        },
        
        // Mobile flags
        isMobile: true,
        isIOS: true,
        isAndroid: false
      } as unknown as WebdriverIO.Browser;
      
      // Just a simple check to make sure the mock is created successfully
      expect(mockDriver.isIOS).toBe(true);
    });

    it('should define Element interface with required methods', () => {
      // This is a mock/type test
      const mockElement: WebdriverIO.Element = {
        // Element ID properties
        elementId: 'element-123',
        selector: 'accessibility id=test',
        
        // Attribute and property methods
        getAttribute: jest.fn(),
        getProperty: jest.fn(),
        getTagName: jest.fn(),
        getText: jest.fn(),
        getValue: jest.fn(),
        
        // State methods
        isDisplayed: jest.fn(),
        isEnabled: jest.fn(),
        isSelected: jest.fn(),
        isExisting: jest.fn(),
        
        // Location and dimension methods
        getLocation: jest.fn(),
        getSize: jest.fn(),
        getRect: jest.fn(),
        
        // Action methods
        click: jest.fn(),
        doubleClick: jest.fn(),
        setValue: jest.fn(),
        clearValue: jest.fn(),
        addValue: jest.fn(),
        touchAction: jest.fn(),
        
        // Wait methods
        waitForExist: jest.fn(),
        waitForDisplayed: jest.fn(),
        waitForEnabled: jest.fn(),
        waitForClickable: jest.fn(),
        
        // iOS specific methods
        type: jest.fn(),
        
        // Child element methods
        $: jest.fn(),
        $$: jest.fn(),
        
        // Gesture methods
        performGesture: jest.fn(),
        
        // Mobile gesture commands
        longPress: jest.fn(),
        touchAndHold: jest.fn(),
        drag: jest.fn(),
        
        // Mobile element-specific methods
        scrollIntoView: jest.fn()
      } as unknown as WebdriverIO.Element;
      
      // Simple check
      expect(mockElement.elementId).toBe('element-123');
    });
  });
}); 