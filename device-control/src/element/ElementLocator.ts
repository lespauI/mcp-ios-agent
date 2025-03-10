import { 
  ElementCacheOptions, 
  ElementFindStrategy, 
  ElementLocatorStrategy 
} from '../types';
import { Logger } from '../utils/Logger';
import { EnhancedElementCache } from './EnhancedElementCache';
import { XPathRanker } from './XPathRanker';
import { AccessibilityIDPredictor } from './AccessibilityIDPredictor';

// Only define types that are specific to this file and not exported
interface ElementFindOptions {
  timeout?: number;
  multiple?: boolean;
  retryInterval?: number;
  retryCount?: number;
  textMatch?: string;
  fuzzyMatch?: boolean;
  predictAccessibilityId?: boolean;
  ranking?: boolean;
  preloadRelated?: boolean;
}

/**
 * Default cache options
 */
const DEFAULT_CACHE_OPTIONS: ElementCacheOptions = {
  enabled: true,
  ttl: 5000, // 5 seconds
  maxEntries: 100
};

/**
 * Map of iOS UI element types
 */
const ELEMENT_TYPE_MAP: Record<string, string> = {
  button: 'XCUIElementTypeButton',
  text: 'XCUIElementTypeStaticText',
  input: 'XCUIElementTypeTextField',
  secureInput: 'XCUIElementTypeSecureTextField',
  image: 'XCUIElementTypeImage',
  cell: 'XCUIElementTypeCell',
  switch: 'XCUIElementTypeSwitch',
  picker: 'XCUIElementTypePicker',
  table: 'XCUIElementTypeTable',
  scrollView: 'XCUIElementTypeScrollView',
  webView: 'XCUIElementTypeWebView',
  alert: 'XCUIElementTypeAlert',
  any: '*'
};

/**
 * Manages element location operations
 */
export class ElementLocator {
  private elementCache: EnhancedElementCache;
  private xpathRanker: XPathRanker;
  private accessibilityPredictor: AccessibilityIDPredictor;
  private logger: Logger = new Logger('ElementLocator');
  
  /**
   * Default timeout for element finding operations
   */
  private DEFAULT_TIMEOUT = 10000;
  
  /**
   * Default options for element finding
   */
  private DEFAULT_FIND_OPTIONS: ElementFindOptions = {
    timeout: this.DEFAULT_TIMEOUT,
    multiple: false,
    retryInterval: 500,
    retryCount: 2,
    ranking: true,
    fuzzyMatch: false,
    predictAccessibilityId: true,
    preloadRelated: true
  };
  
  /**
   * Creates a new ElementLocator
   * 
   * @param driver WebdriverIO driver instance
   * @param cacheOptions Element cache options
   */
  constructor(
    private driver: WebdriverIO.Browser,
    cacheOptions: Partial<ElementCacheOptions> = {}
  ) {
    this.elementCache = new EnhancedElementCache(driver, cacheOptions);
    this.xpathRanker = new XPathRanker();
    this.accessibilityPredictor = new AccessibilityIDPredictor(driver);
    
    // Initialize the accessibility ID predictor in the background
    this.initializePredictor().catch(error => {
      this.logger.error('Failed to initialize accessibility ID predictor', { error });
    });
  }
  
  /**
   * Initialize the accessibility ID predictor
   */
  private async initializePredictor(): Promise<void> {
    try {
      await this.accessibilityPredictor.analyzeAppPatterns();
      this.logger.info('Accessibility ID predictor initialized');
    } catch (error) {
      this.logger.error('Error initializing accessibility ID predictor', { error });
    }
  }
  
  /**
   * Find a single element using the specified strategy
   * 
   * @param strategy Element location strategy
   * @param value Selector value
   * @param options Options for element finding
   * @returns Found element or throws error if not found
   */
  async findElement(
    strategy: ElementLocatorStrategy,
    value: string,
    options: Partial<ElementFindOptions> = {}
  ): Promise<WebdriverIO.Element> {
    const mergedOptions = { ...this.DEFAULT_FIND_OPTIONS, ...options, multiple: false };
    
    // Try to get element from cache first
    const cachedElement = await this.elementCache.getCachedElement(strategy, value);
    if (cachedElement) {
      this.logger.debug(`Found element in cache for ${strategy}=${value}`);
      return cachedElement;
    }
    
    // If accessibility ID is requested but the value doesn't look like an ID, try to predict one
    if (
      strategy === 'accessibilityId' && 
      mergedOptions.predictAccessibilityId && 
      !value.match(/^[a-zA-Z0-9_\-.]+$/)
    ) {
      // This looks like text, not an ID, so try to find by text and predict ID
      const elements = await this.findElementsByText(value, mergedOptions);
      
      if (elements.length > 0) {
        // Rank elements if enabled
        let bestElement = elements[0];
        
        if (mergedOptions.ranking && elements.length > 1) {
          // Rank elements based on confidence scores
          const rankedElements = await this.xpathRanker.rankElements(
            elements, 
            value,
            mergedOptions.fuzzyMatch
          );
          
          bestElement = rankedElements[0];
        }
        
        // Cache the found element
        await this.elementCache.cacheElement('xpath', this.textToXPath(value), bestElement);
        
        // Try to predict and set accessibility ID for future use
        if (mergedOptions.predictAccessibilityId) {
          const prediction = await this.accessibilityPredictor.predictAccessibilityID(bestElement);
          
          if (prediction.predictedId && prediction.confidence > 0.7) {
            // Log the prediction, but we'll still return the element we found by text
            this.logger.info(`Predicted accessibility ID "${prediction.predictedId}" for text "${value}"`);
            // Try to get an element using the predicted ID
            try {
              await (this.driver as any).$(`accessibility id=${prediction.predictedId}`);
            } catch (error) {
              this.logger.debug(`Failed to find element with predicted ID: ${prediction.predictedId}`, { error });
            }
          }
        }
        
        return bestElement;
      }
    }
    
    // Try to find the element with retries
    return this.findElementWithRetry(strategy, value, mergedOptions);
  }
  
  /**
   * Find multiple elements using the specified strategy
   * 
   * @param strategy Element location strategy
   * @param value Selector value
   * @param options Options for element finding
   * @returns Array of found elements (may be empty)
   */
  async findElements(
    strategy: ElementLocatorStrategy,
    value: string,
    options: Partial<ElementFindOptions> = {}
  ): Promise<WebdriverIO.Element[]> {
    const mergedOptions = { ...this.DEFAULT_FIND_OPTIONS, ...options, multiple: true };
    
    let elements: WebdriverIO.Element[] = [];
    
    try {
      // Find elements directly using WebdriverIO's $$ method
      // Format the selector properly based on strategy
      let selector = '';
      
      switch (strategy) {
        case 'accessibilityId':
          selector = `~${value}`;
          break;
        case 'id':
          selector = `id=${value}`;
          break;
        case 'xpath':
          selector = value;
          break;
        case 'className':
          selector = value;
          break;
        case 'css selector':
          selector = `css selector=${value}`;
          break;
        case 'predicate':
          selector = `-ios predicate string:${value}`;
          break;
        case 'classChain':
          selector = `-ios class chain:${value}`;
          break;
        default:
          throw new Error(`Unsupported locator strategy: ${strategy}`);
      }
      
      elements = await (this.driver as any).$$(selector);
      
      // If no elements found and we should use fuzzy matching
      if (elements.length === 0 && mergedOptions.textMatch && mergedOptions.fuzzyMatch) {
        elements = await this.findElementsByText(mergedOptions.textMatch, { 
          ...mergedOptions,
          fuzzyMatch: true 
        });
      }
      
      // Rank elements if required
      if (mergedOptions.ranking && elements.length > 1 && mergedOptions.textMatch) {
        elements = await this.xpathRanker.rankElements(
          elements, 
          mergedOptions.textMatch,
          mergedOptions.fuzzyMatch
        );
      }
      
      // Cache each element for future use
      for (let i = 0; i < elements.length; i++) {
        const specificValue = `${value}[${i}]`;
        await this.elementCache.cacheElement(strategy, specificValue, elements[i]);
      }
      
      // Preload related elements if requested
      if (mergedOptions.preloadRelated && elements.length > 0) {
        // For example, if we found a button, preload related form fields
        this.preloadRelatedElements(strategy, value, elements[0]).catch(error => {
          this.logger.debug('Error preloading related elements', { error });
        });
      }
      
      return elements;
    } catch (error) {
      this.logger.debug(`Error finding elements ${strategy}=${value}`, { error });
      return [];
    }
  }
  
  /**
   * Attempt to find an element with automatic retries
   * 
   * @param strategy Element location strategy
   * @param value Selector value
   * @param options Options including retry configuration
   * @returns Found element or throws error if not found after retries
   */
  private async findElementWithRetry(
    strategy: ElementLocatorStrategy,
    value: string,
    options: ElementFindOptions
  ): Promise<WebdriverIO.Element> {
    let retryCount = 0;
    const maxRetries = options.retryCount || 0;
    
    while (true) {
      try {
        // Format the selector properly based on strategy
        let selector = '';
        
        switch (strategy) {
          case 'accessibilityId':
            selector = `~${value}`;
            break;
          case 'id':
            selector = `id=${value}`;
            break;
          case 'xpath':
            selector = value;
            break;
          case 'className':
            selector = value;
            break;
          case 'css selector':
            selector = `css selector=${value}`;
            break;
          case 'predicate':
            selector = `-ios predicate string:${value}`;
            break;
          case 'classChain':
            selector = `-ios class chain:${value}`;
            break;
          default:
            throw new Error(`Unsupported locator strategy: ${strategy}`);
        }
        
        // Try the direct element find first using WebdriverIO's $ method
        const element = await (this.driver as any).$(selector);
        
        // In WebdriverIO, we need to check if the element exists
        try {
          await (element as any).waitForExist({ timeout: 100 });
          
          // Cache the element for future use
          await this.elementCache.cacheElement(strategy, value, element);
          
          return element;
        } catch (error) {
          throw new Error(`Element not found with ${strategy}=${value}`);
        }
      } catch (error) {
        // If using AccessibilityID prediction, try that route
        if (options.predictAccessibilityId && options.textMatch) {
          try {
            const prediction = await this.accessibilityPredictor.predictAccessibilityID({
              getText: async () => options.textMatch || ''
            } as any);
            
            if (prediction.predictedId && prediction.confidence > 0.7) {
              // Try to find an element with the predicted ID
              const predictedElement = await (this.driver as any).$(`accessibility id=${prediction.predictedId}`);
              
              try {
                await (predictedElement as any).waitForExist({ timeout: 100 });
                return predictedElement;
              } catch (innerError) {
                // Continue with retry loop if this fails
              }
            }
          } catch (predictionError) {
            // Ignore prediction errors, continue with retry loop
          }
        }
        
        // No element found, try alternative strategies before retrying
        if (options.textMatch) {
          // If we're looking for an element with specific text, try that
          const textElements = await this.findElementsByText(options.textMatch || '', options);
          
          if (textElements.length > 0) {
            const bestTextElement = textElements[0];
            
            // Cache the element for future use
            await this.elementCache.cacheElement('xpath', this.textToXPath(options.textMatch || ''), bestTextElement);
            
            return bestTextElement;
          }
        }
        
        // If we've tried enough times, give up
        if (retryCount >= maxRetries) {
          throw new Error(`Element not found: ${strategy}=${value}`);
        }
        
        // Wait before trying again
        await new Promise(resolve => setTimeout(resolve, options.retryInterval));
        retryCount++;
      }
    }
  }
  
  /**
   * Find elements containing the specified text
   * 
   * @param text Text to search for
   * @param options Find options
   * @returns Array of found elements
   */
  private async findElementsByText(
    text: string,
    options: ElementFindOptions
  ): Promise<WebdriverIO.Element[]> {
    try {
      // Build XPath expressions to find elements with text
      const xpaths = [
        this.textToXPath(text),
        `//*[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${text.toLowerCase()}')]`
      ];
      
      // Try each XPath expression
      for (const xpath of xpaths) {
        const elements = await (this.driver as any).$$(xpath);
        
        if (elements.length > 0) {
          return elements;
        }
      }
      
      // If fuzzy matching is enabled, try a more relaxed search
      if (options.fuzzyMatch) {
        // This is a simplified fuzzy approach - just break the text and search for parts
        const parts = text.split(/\s+/);
        
        if (parts.length > 1) {
          // Try to find elements containing any of the significant words
          const significantParts = parts.filter(p => p.length > 3);
          
          if (significantParts.length > 0) {
            // Build XPath to find elements with any of these words
            const containsExpressions = significantParts
              .map(p => `contains(., '${p}')`)
              .join(' or ');
            
            const fuzzyXPath = `//*[${containsExpressions}]`;
            const fuzzyElements = await (this.driver as any).$$(fuzzyXPath);
            
            if (fuzzyElements.length > 0) {
              // Rank these elements to find best match
              return this.xpathRanker.rankElements(fuzzyElements, text, true);
            }
          }
        }
      }
      
      return [];
    } catch (error) {
      this.logger.debug(`Error finding elements by text '${text}'`, { error });
      return [];
    }
  }
  
  /**
   * Generate an XPath expression to find elements with the specified text
   * 
   * @param text Text to search for
   * @returns XPath expression
   */
  private textToXPath(text: string): string {
    const safeText = text.replace(/'/g, "\\'");
    return `//*[text()='${safeText}' or @content-desc='${safeText}']`;
  }
  
  /**
   * Wait for an element to be present with the specified strategy and value
   * 
   * @param strategy Element location strategy
   * @param value Selector value
   * @param timeout Maximum time to wait in ms
   * @param options Additional options for finding the element
   * @returns Found element or throws error if timeout reached
   */
  async waitForElement(
    strategy: ElementLocatorStrategy,
    value: string,
    timeout: number = this.DEFAULT_TIMEOUT,
    options: Partial<ElementFindOptions> = {}
  ): Promise<WebdriverIO.Element> {
    const startTime = Date.now();
    const retryInterval = options.retryInterval || 500;
    
    while (Date.now() - startTime < timeout) {
      try {
        const element = await this.findElement(strategy, value, {
          ...options,
          timeout: Math.min(retryInterval, timeout - (Date.now() - startTime))
        });
        
        // Ensure the element exists with the correct timeout
        await (element as any).waitForExist({ timeout });
        
        return element;
      } catch (error) {
        // Continue waiting if we haven't timed out yet
        if (Date.now() - startTime >= timeout) {
          throw new Error(`wait for element timed out`);
        }
        
        // Wait before trying again
        await new Promise(resolve => setTimeout(resolve, retryInterval));
      }
    }
    
    throw new Error(`wait for element timed out`);
  }
  
  /**
   * Wait for multiple elements to be present
   * 
   * @param strategy Element location strategy
   * @param value Selector value
   * @param timeout Maximum time to wait in ms
   * @param options Additional options for finding elements
   * @returns Array of found elements or throws error if timeout reached
   */
  async waitForElements(
    strategy: ElementLocatorStrategy,
    value: string,
    timeout: number = this.DEFAULT_TIMEOUT,
    options: Partial<ElementFindOptions> = {}
  ): Promise<WebdriverIO.Element[]> {
    const startTime = Date.now();
    const retryInterval = options.retryInterval || 500;
    
    while (Date.now() - startTime < timeout) {
      const elements = await this.findElements(strategy, value, {
        ...options,
        timeout: Math.min(retryInterval, timeout - (Date.now() - startTime))
      });
      
      if (elements.length > 0) {
        return elements;
      }
      
      // Continue waiting if we haven't timed out yet
      if (Date.now() - startTime >= timeout) {
        throw new Error(`Timed out waiting for elements: ${strategy}=${value}`);
      }
      
      // Wait before trying again
      await new Promise(resolve => setTimeout(resolve, retryInterval));
    }
    
    throw new Error(`Timed out waiting for elements: ${strategy}=${value}`);
  }
  
  /**
   * Try multiple strategies in sequence until an element is found
   * 
   * @param strategies Array of element find strategies to try
   * @param options Additional options for finding elements
   * @returns Found element or throws error if all strategies fail
   */
  async findElementWithFallbacks(
    strategies: ElementFindStrategy[],
    options: Partial<ElementFindOptions> = {}
  ): Promise<WebdriverIO.Element> {
    if (strategies.length === 0) {
      throw new Error('No element find strategies provided');
    }
    
    let lastError;
    
    for (const strategy of strategies) {
      try {
        return await this.findElement(strategy.type, strategy.value, options);
      } catch (error) {
        lastError = error;
      }
    }
    
    // If we get here, all strategies failed
    throw new Error('Element not found with any of the provided strategies');
  }
  
  /**
   * Create an optimized XPath expression for the given element type and value
   * 
   * @param elementType Type of element (e.g., 'button', 'input')
   * @param value Value to search for
   * @param useContains Whether to use contains() for partial matches
   * @returns Optimized XPath expression
   */
  optimizedXPath(elementType: string, value: string, useContains = false): string {
    // Convert web element types to iOS native element types
    const iosElementType = elementType === 'button' ? 'XCUIElementTypeButton' : elementType;
    
    if (useContains) {
      return `//${iosElementType}[contains(@label,'${value}') or contains(@value,'${value}') or contains(@placeholder,'${value}') or contains(@name,'${value}') or contains(text(),'${value}')]`;
    }
    
    return `//${iosElementType}[@label='${value}' or @value='${value}' or @placeholder='${value}' or @name='${value}' or text()='${value}']`;
  }
  
  /**
   * Fill in an XPath template with parameter values
   * 
   * @param pattern XPath template with placeholders
   * @param params Parameters to substitute into template
   * @returns Complete XPath expression
   */
  xpathTemplate(pattern: string, params: Record<string, string>): string {
    let result = pattern;
    // Replace parameters in pattern with values from params
    for (const key in params) {
      result = result.replace(`{${key}}`, params[key]);
    }
    return result;
  }
  
  /**
   * Preload related elements that are likely to be used together
   * 
   * @param strategy Primary element strategy
   * @param value Primary element value
   * @param primaryElement Primary element if already found
   */
  private async preloadRelatedElements(
    strategy: ElementLocatorStrategy,
    value: string,
    primaryElement?: WebdriverIO.Element
  ): Promise<void> {
    try {
      // If this is a form field, try to find related fields
      if (value.match(/input|field|username|password|email/i)) {
        // Find the form container and preload all form fields
        const formXPath = `//ancestor::*[self::form or @role='form'][1]//input`;
        
        await this.elementCache.preloadElements('xpath', formXPath);
      }
      
      // If this is a button, preload nearby buttons as they're likely part of the same action group
      if (value.match(/button|btn|submit|cancel|ok|save/i)) {
        const buttonXPath = `//button | //*[@role='button']`;
        
        await this.elementCache.preloadElements('xpath', buttonXPath);
      }
      
      // If looking at a list item, preload its siblings
      if (value.match(/list|item|row|cell/i)) {
        const listXPath = `//ancestor::*[self::ul or self::ol or @role='list'][1]//*[self::li or @role='listitem']`;
        
        await this.elementCache.preloadElements('xpath', listXPath);
      }
    } catch (error) {
      this.logger.debug('Error preloading related elements', { error });
    }
  }
  
  /**
   * Clear the element cache
   */
  clearCache(): void {
    this.elementCache.clearCache();
  }
  
  /**
   * Invalidate cache entries matching a given pattern
   * 
   * @param pattern Regex pattern to match against cache keys
   */
  invalidateCacheEntries(pattern: RegExp): void {
    this.elementCache.invalidateCache(pattern);
  }
  
  /**
   * Get direct access to the element cache
   */
  getElementCache(): EnhancedElementCache {
    return this.elementCache;
  }
} 