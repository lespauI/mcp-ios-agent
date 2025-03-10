import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ElementLocator } from '../../src/element/ElementLocator';
import { ElementFindStrategy, ElementLocatorStrategy } from '../../src/types';
import { EnhancedElementCache } from '../../src/element/EnhancedElementCache';
import { XPathRanker } from '../../src/element/XPathRanker';
import { AccessibilityIDPredictor } from '../../src/element/AccessibilityIDPredictor';
import type { Browser, Element } from 'webdriverio';

// Mock implementations
jest.mock('../../src/utils/Logger');
jest.mock('../../src/element/EnhancedElementCache');
jest.mock('../../src/element/XPathRanker');
jest.mock('../../src/element/AccessibilityIDPredictor');

describe('ElementLocator', () => {
  // Mock WebdriverIO element
  const mockElement = {
    elementId: 'element-123',
    waitForExist: jest.fn().mockImplementation(() => Promise.resolve(true)) as jest.MockedFunction<() => Promise<boolean>>,
    isExisting: jest.fn().mockImplementation(() => Promise.resolve(true)) as jest.MockedFunction<() => Promise<boolean>>,
    $: jest.fn() as jest.MockedFunction<() => Promise<Element>>,
    $$: jest.fn() as jest.MockedFunction<() => Promise<Element[]>>,
    getAttribute: jest.fn() as jest.MockedFunction<(attr: string) => Promise<string>>,
    isDisplayed: jest.fn().mockImplementation(() => Promise.resolve(true)) as jest.MockedFunction<() => Promise<boolean>>,
    isDisplayedInViewport: jest.fn().mockImplementation(() => Promise.resolve(true)) as jest.MockedFunction<() => Promise<boolean>>,
    getText: jest.fn().mockImplementation(() => Promise.resolve('Text')) as jest.MockedFunction<() => Promise<string>>,
    getLocation: jest.fn().mockImplementation(() => Promise.resolve({ x: 0, y: 0 })) as jest.MockedFunction<() => Promise<{ x: number; y: number }>>,
    getSize: jest.fn().mockImplementation(() => Promise.resolve({ width: 100, height: 50 })) as jest.MockedFunction<() => Promise<{ width: number; height: number }>>,
    click: jest.fn().mockImplementation(() => Promise.resolve()) as jest.MockedFunction<() => Promise<void>>,
    waitForClickable: jest.fn().mockImplementation(() => Promise.resolve(true)) as jest.MockedFunction<() => Promise<boolean>>
  } as unknown as Element;
  
  // Mock WebdriverIO browser with necessary methods
  const mockDriver = {
    $: jest.fn().mockImplementation(() => Promise.resolve(mockElement)) as jest.MockedFunction<(selector: string) => Promise<Element>>,
    $$: jest.fn().mockImplementation(() => Promise.resolve([mockElement])) as jest.MockedFunction<(selector: string) => Promise<Element[]>>,
    executeScript: jest.fn().mockImplementation(() => Promise.resolve(null)) as jest.MockedFunction<(script: string, ...args: any[]) => Promise<any>>,
    waitUntil: jest.fn().mockImplementation(() => Promise.resolve(true)) as jest.MockedFunction<(condition: () => Promise<boolean>, options?: { timeout?: number }) => Promise<boolean>>
  } as unknown as Browser;
  
  // Mock EnhancedElementCache
  const mockElementCache = {
    cacheElement: jest.fn() as jest.Mock,
    getCachedElement: jest.fn() as jest.Mock,
    invalidateCache: jest.fn() as jest.Mock,
    clearCache: jest.fn() as jest.Mock,
    getElementByAccessibilityId: jest.fn() as jest.Mock,
    getCachedElementsByType: jest.fn() as jest.Mock,
    preloadRelatedElements: jest.fn() as jest.Mock
  };
  
  // Mock XPathRanker
  const mockXPathRanker = {
    rankElements: jest.fn() as jest.Mock,
    findBestMatch: jest.fn() as jest.Mock,
    calculateConfidenceScore: jest.fn() as jest.Mock,
    getFuzzyMatchScore: jest.fn().mockReturnValue(0.9) as jest.Mock
  };
  
  // Mock AccessibilityIDPredictor
  const mockAccessibilityPredictor = {
    analyzeAppPatterns: jest.fn() as jest.Mock,
    predictAccessibilityID: jest.fn() as jest.Mock,
    findSimilarElements: jest.fn() as jest.Mock,
    learnFromSimilarElements: jest.fn() as jest.Mock
  };
  
  let elementLocator: ElementLocator;
  
  beforeEach(() => {
    // Reset all mocks before each test
    jest.resetAllMocks();
    
    // Set up mock return values
    mockXPathRanker.rankElements.mockImplementation(() => Promise.resolve([mockElement]));
    mockXPathRanker.findBestMatch.mockImplementation(() => Promise.resolve(mockElement));
    mockXPathRanker.calculateConfidenceScore.mockImplementation(() => Promise.resolve(0.8));
    
    mockAccessibilityPredictor.predictAccessibilityID.mockImplementation(() => Promise.resolve({
      predictedId: 'predicted-id',
      confidence: 0.8
    }));
    mockAccessibilityPredictor.findSimilarElements.mockImplementation(() => Promise.resolve([mockElement]));
    mockAccessibilityPredictor.learnFromSimilarElements.mockImplementation(() => Promise.resolve());
    
    // Mock implementations for class constructors
    (EnhancedElementCache as jest.Mocked<typeof EnhancedElementCache>)
      .mockImplementation(() => mockElementCache);
    
    (XPathRanker as jest.Mocked<typeof XPathRanker>)
      .mockImplementation(() => mockXPathRanker);
    
    (AccessibilityIDPredictor as jest.Mocked<typeof AccessibilityIDPredictor>)
      .mockImplementation(() => mockAccessibilityPredictor);
    
    // Create instance of ElementLocator
    elementLocator = new ElementLocator(mockDriver);
  });
  
  describe('findElement', () => {
    it('should find element using specified strategy', async () => {
      // Setup
      mockDriver.$.mockResolvedValue(mockElement);
      
      // Execute
      const result = await elementLocator.findElement('css selector', '#login-button');
      
      // Verify
      expect(mockDriver.$).toHaveBeenCalledWith('css selector=#login-button');
      expect(result).toBe(mockElement);
    });
    
    it('should return cached element if available', async () => {
      // Setup
      mockElementCache.getCachedElement.mockResolvedValue(mockElement);
      
      // Execute
      const result = await elementLocator.findElement('css selector', '#login-button');
      
      // Verify
      expect(mockElementCache.getCachedElement).toHaveBeenCalledWith('css selector', '#login-button');
      expect(mockDriver.$).not.toHaveBeenCalled();
      expect(result).toBe(mockElement);
    });
    
    it('should use accessibility ID predictor if option enabled', async () => {
      // Setup
      mockElementCache.getCachedElement.mockResolvedValue(null);
      
      // Mock the text element lookup for the accessibility ID prediction path
      const mockTextElements = [mockElement];
      mockDriver.$$.mockImplementation((selector) => {
        if (selector.includes('contains(., \'login-button\')') || selector.includes('text()')) {
          return Promise.resolve(mockTextElements);
        }
        return Promise.resolve([]);
      });
      
      mockAccessibilityPredictor.predictAccessibilityID.mockResolvedValue({
        predictedId: 'login-button',
        confidence: 0.9
      });
      
      // Execute
      const result = await elementLocator.findElement('accessibilityId', 'login-button', { 
        predictAccessibilityId: true,
        textMatch: 'login-button'
      });
      
      // Verify
      expect(mockAccessibilityPredictor.predictAccessibilityID).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
    
    it('should throw error if element not found and no fallbacks work', async () => {
      // Setup
      mockElementCache.getCachedElement.mockResolvedValue(null);
      mockDriver.$.mockRejectedValue(new Error('element not found'));
      
      // Mock empty results for any secondary lookup attempts
      mockDriver.$$.mockResolvedValue([]);
      
      // Execute & Verify
      await expect(
        elementLocator.findElement('css selector', '#login-button')
      ).rejects.toThrow('Element not found: css selector=#login-button');
    });
  });
  
  describe('findElements', () => {
    it('should find elements using specified strategy', async () => {
      // Setup
      const mockElements = [mockElement, { ...mockElement, elementId: 'element-456' }];
      mockDriver.$$.mockResolvedValue(mockElements);
      
      // Execute
      const result = await elementLocator.findElements('css selector', '.button');
      
      // Verify
      expect(mockDriver.$$).toHaveBeenCalledWith('css selector=.button');
      expect(result).toEqual(mockElements);
    });
    
    it('should apply ranking when specified', async () => {
      // Setup
      const mockElements = [mockElement, { ...mockElement, elementId: 'element-456' }];
      mockDriver.$$.mockResolvedValue(mockElements);
      
      // Set up the ranking mock to return elements in reverse order
      const rankedElements = [{ ...mockElement, elementId: 'element-456' }, mockElement];
      mockXPathRanker.rankElements.mockResolvedValue(rankedElements);
      
      // Execute
      const result = await elementLocator.findElements('css selector', '.button', {
        ranking: true,
        textMatch: 'some text' // textMatch is required for ranking
      });
      
      // Verify
      expect(mockDriver.$$).toHaveBeenCalledWith('css selector=.button');
      expect(mockXPathRanker.rankElements).toHaveBeenCalled();
      expect(result[0].elementId).toBe('element-456');
    });
    
    it('should filter by text match when specified', async () => {
      // Setup
      const loginElement = { 
        ...mockElement, 
        elementId: 'element-123', 
        getText: jest.fn().mockResolvedValue('Login')
      };
      const registerElement = { 
        ...mockElement, 
        elementId: 'element-456', 
        getText: jest.fn().mockResolvedValue('Register')
      };
      
      // First mock the standard element lookup
      mockDriver.$$.mockResolvedValueOnce([]);
      
      // Then mock the text-based lookup to return our elements
      mockDriver.$$.mockImplementation((selector) => {
        if (selector.includes('contains(., \'Login\')') || selector.includes('text()=\'Login\'')) {
          return Promise.resolve([loginElement]);
        }
        return Promise.resolve([]);
      });
      
      // Execute
      const result = await elementLocator.findElements('css selector', '.button', {
        textMatch: 'Login',
        fuzzyMatch: true
      });
      
      // Verify
      expect(result.length).toBe(1);
      expect(result[0].elementId).toBe('element-123');
    });
  });
  
  describe('waitForElement', () => {
    it('should wait for element to exist', async () => {
      // Setup
      mockDriver.$.mockResolvedValue(mockElement);
      mockElement.waitForExist.mockResolvedValue(true);
      
      // Execute
      const result = await elementLocator.waitForElement('css selector', '#login-button', 5000);
      
      // Verify
      expect(mockDriver.$).toHaveBeenCalledWith('css selector=#login-button');
      expect(mockElement.waitForExist).toHaveBeenCalledWith({ timeout: 5000 });
      expect(result).toBe(mockElement);
    });
    
    it('should throw error if element does not exist within timeout', async () => {
      // Setup
      mockDriver.$.mockResolvedValue(mockElement);
      mockElement.waitForExist.mockRejectedValue(new Error('wait for element timed out'));
      
      // Execute & Verify
      await expect(
        elementLocator.waitForElement('css selector', '#login-button', 5000)
      ).rejects.toThrow('wait for element timed out');
    });
  });
  
  describe('waitForElements', () => {
    it('should wait for elements to exist', async () => {
      // Setup
      const mockElements = [mockElement, { ...mockElement, elementId: 'element-456' }];
      mockDriver.$$.mockResolvedValue(mockElements);
      
      // Execute
      const result = await elementLocator.waitForElements('css selector', '.button', 5000);
      
      // Verify
      expect(mockDriver.$$).toHaveBeenCalledWith('css selector=.button');
      expect(result).toEqual(mockElements);
    });
  });
  
  describe('findElementWithFallbacks', () => {
    it('should try multiple strategies until one works', async () => {
      // Setup
      mockDriver.$.mockImplementation((selector) => {
        if (selector === 'css selector=#login-button') {
          return Promise.reject(new Error('Element not found'));
        } else if (selector === '~login-button') {
          return Promise.resolve(mockElement);
        }
        return Promise.reject(new Error('Element not found'));
      });
      
      const strategies: ElementFindStrategy[] = [
        { type: 'css selector', value: '#login-button' },
        { type: 'accessibilityId', value: 'login-button' }
      ];
      
      // Execute
      const result = await elementLocator.findElementWithFallbacks(strategies);
      
      // Verify
      expect(mockDriver.$).toHaveBeenCalledWith('css selector=#login-button');
      expect(mockDriver.$).toHaveBeenCalledWith('~login-button');
      expect(result).toBe(mockElement);
    });
    
    it('should throw error if all strategies fail', async () => {
      // Setup
      mockDriver.$.mockRejectedValue(new Error('Element not found'));
      
      const strategies: ElementFindStrategy[] = [
        { type: 'css selector', value: '#login-button' },
        { type: 'accessibilityId', value: 'login-button' }
      ];
      
      // Execute & Verify
      await expect(
        elementLocator.findElementWithFallbacks(strategies)
      ).rejects.toThrow('Element not found with any of the provided strategies');
    });
  });
  
  describe('optimizedXPath', () => {
    it('should generate optimized XPath for element type and value', () => {
      // Execute
      const result = elementLocator.optimizedXPath('button', 'Login');
      
      // Verify
      expect(result).toContain('XCUIElementTypeButton');
      expect(result).toContain('Login');
    });
    
    it('should use contains() when specified', () => {
      // Execute
      const result = elementLocator.optimizedXPath('button', 'Login', true);
      
      // Verify
      expect(result).toContain('contains(');
      expect(result).toContain('Login');
    });
  });
  
  describe('xpathTemplate', () => {
    it('should replace parameters in template', () => {
      // Execute
      const result = elementLocator.xpathTemplate('//{type}[@label="{text}"]', {
        type: 'XCUIElementTypeButton',
        text: 'Login'
      });
      
      // Verify
      expect(result).toBe('//XCUIElementTypeButton[@label="Login"]');
    });
  });
  
  describe('clearCache', () => {
    it('should clear the element cache', () => {
      // Execute
      elementLocator.clearCache();
      
      // Verify
      expect(mockElementCache.clearCache).toHaveBeenCalled();
    });
  });
  
  describe('invalidateCacheEntries', () => {
    it('should invalidate cache entries matching pattern', () => {
      // Setup
      const pattern = /login/;
      
      // Execute
      elementLocator.invalidateCacheEntries(pattern);
      
      // Verify
      expect(mockElementCache.invalidateCache).toHaveBeenCalledWith(pattern);
    });
  });
}); 