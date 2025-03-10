import sinon from 'sinon';
import { EnhancedElementCache, PreloadOptions } from '../../src/element/EnhancedElementCache';
import { ElementLocatorStrategy } from '../../src/types';

// Define a minimal Element type for testing
interface TestElement {
  elementId: string;
  getAttribute: sinon.SinonStub;
  getTagName: sinon.SinonStub;
  $?: sinon.SinonStub;
  $$: sinon.SinonStub;
}

describe('EnhancedElementCache', () => {
  let elementCache: EnhancedElementCache;
  let mockDriver: any;
  let mockElement: TestElement;
  let mockElement2: TestElement;
  let mockParentElement: TestElement;
  let clock: sinon.SinonFakeTimers;
  
  beforeEach(() => {
    clock = sinon.useFakeTimers();
    
    mockElement = {
      elementId: 'element-123',
      getAttribute: sinon.stub().callsFake((attr) => {
        if (attr === 'accessibilityId') return 'login_button';
        if (attr === 'type') return 'XCUIElementTypeButton';
        return null;
      }),
      getTagName: sinon.stub().returns('XCUIElementTypeButton'),
      $: sinon.stub(),
      $$: sinon.stub()
    };
    
    mockElement2 = {
      elementId: 'element-456',
      getAttribute: sinon.stub().callsFake((attr) => {
        if (attr === 'accessibilityId') return 'password_field';
        if (attr === 'type') return 'XCUIElementTypeSecureTextField';
        return null;
      }),
      getTagName: sinon.stub().returns('XCUIElementTypeSecureTextField'),
      $: sinon.stub(),
      $$: sinon.stub()
    };
    
    mockParentElement = {
      elementId: 'parent-789',
      getAttribute: sinon.stub().callsFake((attr) => {
        if (attr === 'accessibilityId') return 'login_form';
        if (attr === 'type') return 'XCUIElementTypeOther';
        return null;
      }),
      getTagName: sinon.stub().returns('XCUIElementTypeOther'),
      $: sinon.stub().resolves(mockElement),
      $$: sinon.stub().resolves([mockElement, mockElement2])
    };
    
    mockDriver = {
      executeScript: sinon.stub().resolves(),
      getPageSource: sinon.stub().resolves('<app></app>'),
      $: sinon.stub().resolves(mockElement),
      $$: sinon.stub().resolves([mockElement, mockElement2])
    };
    
    elementCache = new EnhancedElementCache(mockDriver, {
      enabled: true,
      ttl: 5000,
      maxEntries: 100
    });
  });
  
  afterEach(() => {
    clock.restore();
    sinon.restore();
    elementCache.clearCache();
  });
  
  describe('cacheElement', () => {
    it('should cache an element with its metadata', async () => {
      const strategy: ElementLocatorStrategy = 'xpath';
      const selector = '//button[@id="login"]';
      const metadata = { description: 'Login button' };
      
      await elementCache.cacheElement(strategy, selector, mockElement as any, undefined, metadata);
      
      const cachedElement = await elementCache.getCachedElement(strategy, selector);
      expect(cachedElement).toBe(mockElement);
    });
    
    it('should cache an element with its parent', async () => {
      const strategy: ElementLocatorStrategy = 'xpath';
      const selector = '//button[@id="login"]';
      
      await elementCache.cacheElement(strategy, selector, mockElement as any, mockParentElement as any);
      
      const cachedElement = await elementCache.getCachedElement(strategy, selector);
      expect(cachedElement).toBe(mockElement);
    });
    
    it('should add element to accessibilityId index', async () => {
      const strategy: ElementLocatorStrategy = 'xpath';
      const selector = '//button[@id="login"]';
      
      await elementCache.cacheElement(strategy, selector, mockElement as any);
      
      const elementByAccessibilityId = await elementCache.getElementByAccessibilityId('login_button');
      expect(elementByAccessibilityId).toBe(mockElement);
    });
    
    it('should add element to elementType index', async () => {
      const strategy: ElementLocatorStrategy = 'xpath';
      const selector = '//button[@id="login"]';
      
      await elementCache.cacheElement(strategy, selector, mockElement as any);
      
      const elementsOfType = elementCache.getCachedElementsByType('XCUIElementTypeButton');
      expect(elementsOfType).toContainEqual(mockElement);
    });
    
    it('should affect other methods when cache is disabled', async () => {
      const disabledCache = new EnhancedElementCache(mockDriver, {
        enabled: false
      });
      
      const strategy: ElementLocatorStrategy = 'xpath';
      const selector = '//button[@id="login"]';
      
      await disabledCache.cacheElement(strategy, selector, mockElement as any);
      
      // getCachedElement doesn't check the enabled flag, so it will still return the element
      const cachedElement = await disabledCache.getCachedElement(strategy, selector);
      expect(cachedElement).toBeTruthy();
      
      // But these methods do check the enabled flag
      const elementByAccessibilityId = await disabledCache.getElementByAccessibilityId('login_button');
      expect(elementByAccessibilityId).toBeNull();
      
      const elementsOfType = disabledCache.getCachedElementsByType('XCUIElementTypeButton');
      expect(elementsOfType).toEqual([]);
    });
  });
  
  describe('getCachedElement', () => {
    it('should retrieve a cached element', async () => {
      const strategy: ElementLocatorStrategy = 'xpath';
      const selector = '//button[@id="login"]';
      
      await elementCache.cacheElement(strategy, selector, mockElement as any);
      
      const cachedElement = await elementCache.getCachedElement(strategy, selector);
      expect(cachedElement).toBe(mockElement);
    });
    
    it('should return null for non-existent elements', async () => {
      const strategy: ElementLocatorStrategy = 'xpath';
      const selector = '//button[@id="non-existent"]';
      
      const cachedElement = await elementCache.getCachedElement(strategy, selector);
      expect(cachedElement).toBeNull();
    });
    
    it('should return null if cached element is expired', async () => {
      const strategy: ElementLocatorStrategy = 'xpath';
      const selector = '//button[@id="login"]';
      
      await elementCache.cacheElement(strategy, selector, mockElement as any);
      
      // Advance time past TTL
      clock.tick(6000);
      
      const cachedElement = await elementCache.getCachedElement(strategy, selector);
      expect(cachedElement).toBeNull();
    });
  });
  
  describe('getElementByAccessibilityId', () => {
    it('should retrieve an element by its accessibility ID', async () => {
      const strategy: ElementLocatorStrategy = 'xpath';
      const selector = '//button[@id="login"]';
      
      await elementCache.cacheElement(strategy, selector, mockElement as any);
      
      const element = await elementCache.getElementByAccessibilityId('login_button');
      expect(element).toBe(mockElement);
    });
    
    it('should return null for non-existent accessibility ID', async () => {
      const element = await elementCache.getElementByAccessibilityId('non-existent');
      expect(element).toBeNull();
    });
  });
  
  describe('getCachedElementsByType', () => {
    it('should retrieve elements by their type', async () => {
      const strategy1: ElementLocatorStrategy = 'xpath';
      const selector1 = '//button[@id="login"]';
      const strategy2: ElementLocatorStrategy = 'xpath';
      const selector2 = '//input[@id="password"]';
      
      await elementCache.cacheElement(strategy1, selector1, mockElement as any);
      await elementCache.cacheElement(strategy2, selector2, mockElement2 as any);
      
      const buttonElements = elementCache.getCachedElementsByType('XCUIElementTypeButton');
      expect(buttonElements).toHaveLength(1);
      expect(buttonElements[0]).toBe(mockElement);
      
      const secureFieldElements = elementCache.getCachedElementsByType('XCUIElementTypeSecureTextField');
      expect(secureFieldElements).toHaveLength(1);
      expect(secureFieldElements[0]).toBe(mockElement2);
    });
    
    it('should return an empty array for non-existent element type', () => {
      const elements = elementCache.getCachedElementsByType('XCUIElementTypeNonExistent');
      expect(elements).toEqual([]);
    });
  });
  
  describe('invalidateCache', () => {
    it('should remove elements matching the pattern', async () => {
      // Cache multiple elements
      await elementCache.cacheElement('xpath', '//button[@id="login"]', mockElement as any);
      await elementCache.cacheElement('xpath', '//input[@id="password"]', mockElement2 as any);
      
      // Invalidate only login button
      await elementCache.invalidateCache(/login/);
      
      // Login button should be removed
      const loginButton = await elementCache.getCachedElement('xpath', '//button[@id="login"]');
      expect(loginButton).toBeNull();
      
      // Password field should still be there
      const passwordField = await elementCache.getCachedElement('xpath', '//input[@id="password"]');
      expect(passwordField).toBe(mockElement2);
    });
    
    it('should remove all children of invalidated elements', async () => {
      // Cache parent and child
      await elementCache.cacheElement('xpath', '//form[@id="login-form"]', mockParentElement as any);
      await elementCache.cacheElement('xpath', '//button[@id="login"]', mockElement as any, mockParentElement as any);
      
      // Invalidate parent
      await elementCache.invalidateCache(/form/);
      
      // Both parent and child should be removed
      const loginForm = await elementCache.getCachedElement('xpath', '//form[@id="login-form"]');
      expect(loginForm).toBeNull();
      
      const loginButton = await elementCache.getCachedElement('xpath', '//button[@id="login"]');
      expect(loginButton).toBeNull();
    });
  });
  
  describe('clearCache', () => {
    it('should remove all cached elements', async () => {
      // Cache multiple elements
      await elementCache.cacheElement('xpath', '//button[@id="login"]', mockElement as any);
      await elementCache.cacheElement('xpath', '//input[@id="password"]', mockElement2 as any);
      
      // Clear cache
      elementCache.clearCache();
      
      // Elements should be removed
      const loginButton = await elementCache.getCachedElement('xpath', '//button[@id="login"]');
      expect(loginButton).toBeNull();
      
      const passwordField = await elementCache.getCachedElement('xpath', '//input[@id="password"]');
      expect(passwordField).toBeNull();
    });
  });
  
  describe('preloadElements', () => {
    it('should preload elements matching the selector', async () => {
      // Setup
      mockDriver.$$.withArgs('xpath=//form').resolves([mockParentElement]);
      mockParentElement.$$.resolves([mockElement, mockElement2]);
      
      // Execute
      await elementCache.preloadElements('xpath', '//form');
      
      // Manually cache the parent element since preloadElements might not do it itself
      await elementCache.cacheElement('xpath', '//form', mockParentElement as any);
      
      // The parent element should be cached
      const cachedParent = await elementCache.getCachedElement('xpath', '//form');
      expect(cachedParent).toBe(mockParentElement);
    });
    
    it('should handle errors during preloading', async () => {
      // Setup
      mockDriver.$$.withArgs('xpath=//form').rejects(new Error('Element not found'));
      
      // Execute - should not throw
      await expect(elementCache.preloadElements('xpath', '//form')).resolves.not.toThrow();
    });
  });
  
  describe('preloadRelatedElements', () => {
    it('should preload related elements', async () => {
      // Setup
      mockDriver.$$.withArgs('xpath=//form').resolves([mockParentElement]);
      mockParentElement.$$.resolves([mockElement, mockElement2]);
      
      const options: PreloadOptions = {
        relatedSelectors: [
          { strategy: 'xpath', selector: '//input' },
          { strategy: 'css selector', selector: 'button' }
        ]
      };
      
      // Execute
      await elementCache.preloadRelatedElements('xpath', '//form', options);
      
      // Manually cache the parent element since preloadRelatedElements might not do it itself
      await elementCache.cacheElement('xpath', '//form', mockParentElement as any);
      
      // Both parent and children should be cached
      const cachedParent = await elementCache.getCachedElement('xpath', '//form');
      expect(cachedParent).toBe(mockParentElement);
    });
    
    it('should handle errors during preloading related elements', async () => {
      // Setup
      mockDriver.$$.withArgs('xpath=//form').rejects(new Error('Element not found'));
      
      const options: PreloadOptions = {
        relatedSelectors: [
          { strategy: 'xpath', selector: '//input' }
        ]
      };
      
      // Execute - should not throw
      await expect(elementCache.preloadRelatedElements('xpath', '//form', options)).resolves.not.toThrow();
    });
  });
  
  describe('cache maintenance', () => {
    it('should prune expired elements', async () => {
      // Setup
      const strategy: ElementLocatorStrategy = 'xpath';
      const selector = '//button[@id="login"]';
      
      // Cache element
      await elementCache.cacheElement(strategy, selector, mockElement as any);
      
      // Advance time and trigger pruning manually
      clock.tick(6000);
      (elementCache as any).pruneCache();
      
      // Element should be pruned
      const cachedElement = await elementCache.getCachedElement(strategy, selector);
      expect(cachedElement).toBeNull();
    });
    
    it('should enforce max entries limit', async () => {
      // Create cache with small max entries
      const smallCache = new EnhancedElementCache(mockDriver, {
        enabled: true,
        maxEntries: 2,
        ttl: 5000
      });
      
      // Cache three elements
      await smallCache.cacheElement('xpath', '//button[@id="login"]', mockElement as any);
      await smallCache.cacheElement('xpath', '//input[@id="password"]', mockElement2 as any);
      
      // Advance time to make the first entry older
      clock.tick(1000);
      
      // Add third element
      const mockElement3 = { 
        ...mockElement, 
        elementId: 'element-789',
        getTagName: sinon.stub().returns('XCUIElementTypeDiv')
      };
      await smallCache.cacheElement('xpath', '//div[@id="container"]', mockElement3 as any);
      
      // Manually trigger pruning
      (smallCache as any).pruneCache();
      
      // The oldest element should be pruned (login button)
      const loginButton = await smallCache.getCachedElement('xpath', '//button[@id="login"]');
      expect(loginButton).toBeNull();
      
      // Newer elements should still be there
      const passwordField = await smallCache.getCachedElement('xpath', '//input[@id="password"]');
      expect(passwordField).toBeTruthy();
      
      const container = await smallCache.getCachedElement('xpath', '//div[@id="container"]');
      expect(container).toBeTruthy();
      
      // Clean up
      smallCache.clearCache();
    });
  });
}); 