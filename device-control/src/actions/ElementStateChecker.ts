import { Logger } from '../utils/Logger';
import { ElementLocator, ElementLocatorStrategy } from '../element/ElementLocator';
import { sleep } from '../utils/helpers';

export interface ElementSelector {
  strategy: ElementLocatorStrategy;
  selector: string;
}

export interface ElementState {
  visible?: boolean;
  enabled?: boolean;
  text?: string;
  value?: string;
  attribute?: Record<string, string>;
  selected?: boolean;
  custom?: (element: WebdriverIO.Element) => Promise<boolean>;
}

export interface ElementVerificationResult {
  verified: boolean;
  reason?: string;
  element?: WebdriverIO.Element;
  actualState?: Record<string, any>;
  expectedState?: ElementState;
}

export interface VerificationOptions {
  timeout?: number;
  interval?: number;
  failFast?: boolean;
}

/**
 * Verifies element states after UI actions
 */
export class ElementStateChecker {
  private logger = new Logger('ElementStateChecker');
  private readonly DEFAULT_TIMEOUT = 5000; // 5 seconds
  private readonly DEFAULT_INTERVAL = 500; // 500ms
  
  /**
   * Creates a new ElementStateChecker instance
   * 
   * @param driver - WebDriverIO browser instance
   * @param elementLocator - Element locator instance
   */
  constructor(
    private driver: WebdriverIO.Browser,
    private elementLocator: ElementLocator
  ) {}
  
  /**
   * Verifies that an element matches the expected state
   * 
   * @param elementSelector - Element selector
   * @param expectedState - Expected element state
   * @param options - Verification options
   * @returns Verification result
   */
  async verifyElementState(
    elementSelector: ElementSelector,
    expectedState: ElementState,
    options: Partial<VerificationOptions> = {}
  ): Promise<ElementVerificationResult> {
    const mergedOptions = {
      timeout: this.DEFAULT_TIMEOUT,
      interval: this.DEFAULT_INTERVAL,
      failFast: false,
      ...options
    };
    
    const startTime = Date.now();
    let lastError: string | undefined;
    
    while (Date.now() - startTime < mergedOptions.timeout) {
      try {
        const element = await this.elementLocator.findElement(
          elementSelector.strategy,
          elementSelector.selector
        );
        
        const result = await this.checkElementState(element, expectedState);
        
        if (result.verified) {
          return result;
        }
        
        lastError = result.reason;
        
        if (mergedOptions.failFast) {
          return result;
        }
        
        await sleep(mergedOptions.interval);
      } catch (error) {
        lastError = `Failed to find element: ${error}`;
        
        if (mergedOptions.failFast) {
          return {
            verified: false,
            reason: lastError
          };
        }
        
        await sleep(mergedOptions.interval);
      }
    }
    
    return {
      verified: false,
      reason: lastError || `Timed out after ${mergedOptions.timeout}ms`
    };
  }
  
  /**
   * Verifies that an element is not present in the UI
   * 
   * @param elementSelector - Element selector
   * @param options - Verification options
   * @returns Verification result
   */
  async verifyElementAbsence(
    elementSelector: ElementSelector,
    options: Partial<VerificationOptions> = {}
  ): Promise<ElementVerificationResult> {
    const mergedOptions = {
      timeout: this.DEFAULT_TIMEOUT,
      interval: this.DEFAULT_INTERVAL,
      ...options
    };
    
    const startTime = Date.now();
    
    while (Date.now() - startTime < mergedOptions.timeout) {
      try {
        const element = await this.elementLocator.findElement(
          elementSelector.strategy,
          elementSelector.selector,
          { timeout: mergedOptions.interval } // Short timeout for quick checks
        );
        
        // If element is found, check if it's not visible
        if (element) {
          const isDisplayed = await element.isDisplayed();
          
          if (!isDisplayed) {
            return {
              verified: true,
              reason: 'Element is present but not displayed',
              element
            };
          }
          
          await sleep(mergedOptions.interval);
        }
      } catch (error) {
        // Element not found, which is what we want
        return {
          verified: true,
          reason: 'Element not found'
        };
      }
    }
    
    return {
      verified: false,
      reason: 'Element found but should not be present'
    };
  }
  
  /**
   * Verifies that multiple elements match their expected states
   * 
   * @param selectors - Array of element selectors with expected states
   * @param options - Verification options
   * @returns Array of verification results
   */
  async verifyMultipleElementStates(
    selectors: Array<{ selector: ElementSelector; expectedState: ElementState }>,
    options: Partial<VerificationOptions> = {}
  ): Promise<ElementVerificationResult[]> {
    const results: ElementVerificationResult[] = [];
    
    for (const { selector, expectedState } of selectors) {
      const result = await this.verifyElementState(selector, expectedState, options);
      results.push(result);
      
      // If failFast is enabled and verification failed, stop checking
      if (options.failFast && !result.verified) {
        break;
      }
    }
    
    return results;
  }
  
  /**
   * Checks if an element matches the expected state
   * 
   * @param element - WebDriverIO element
   * @param expectedState - Expected element state
   * @returns Verification result
   * @private
   */
  private async checkElementState(
    element: WebdriverIO.Element,
    expectedState: ElementState
  ): Promise<ElementVerificationResult> {
    const actualState: Record<string, any> = {};
    const failedChecks: string[] = [];
    
    try {
      // Check visibility
      if (expectedState.visible !== undefined) {
        const isDisplayed = await element.isDisplayed();
        actualState.visible = isDisplayed;
        
        if (isDisplayed !== expectedState.visible) {
          failedChecks.push(`Element is ${isDisplayed ? 'visible' : 'not visible'} but expected ${expectedState.visible ? 'visible' : 'not visible'}`);
        }
      }
      
      // Check enabled state
      if (expectedState.enabled !== undefined) {
        const isEnabled = await element.isEnabled();
        actualState.enabled = isEnabled;
        
        if (isEnabled !== expectedState.enabled) {
          failedChecks.push(`Element is ${isEnabled ? 'enabled' : 'not enabled'} but expected ${expectedState.enabled ? 'enabled' : 'not enabled'}`);
        }
      }
      
      // Check text content
      if (expectedState.text !== undefined) {
        const text = await element.getText();
        actualState.text = text;
        
        if (text !== expectedState.text) {
          failedChecks.push(`Element text is "${text}" but expected "${expectedState.text}"`);
        }
      }
      
      // Check input value
      if (expectedState.value !== undefined) {
        const value = await element.getAttribute('value');
        actualState.value = value;
        
        if (value !== expectedState.value) {
          failedChecks.push(`Element value is "${value}" but expected "${expectedState.value}"`);
        }
      }
      
      // Check attributes
      if (expectedState.attribute) {
        actualState.attribute = {};
        
        for (const [attr, expectedValue] of Object.entries(expectedState.attribute)) {
          const value = await element.getAttribute(attr);
          actualState.attribute[attr] = value;
          
          if (value !== expectedValue) {
            failedChecks.push(`Element attribute "${attr}" is "${value}" but expected "${expectedValue}"`);
          }
        }
      }
      
      // Check selected state
      if (expectedState.selected !== undefined) {
        const isSelected = await element.getAttribute('selected') === 'true';
        actualState.selected = isSelected;
        
        if (isSelected !== expectedState.selected) {
          failedChecks.push(`Element is ${isSelected ? 'selected' : 'not selected'} but expected ${expectedState.selected ? 'selected' : 'not selected'}`);
        }
      }
      
      // Run custom check if provided
      if (expectedState.custom) {
        const customResult = await expectedState.custom(element);
        actualState.custom = customResult;
        
        if (!customResult) {
          failedChecks.push('Custom verification failed');
        }
      }
      
      if (failedChecks.length > 0) {
        return {
          verified: false,
          reason: failedChecks.join('; '),
          element,
          actualState,
          expectedState
        };
      }
      
      return {
        verified: true,
        element,
        actualState,
        expectedState
      };
    } catch (error) {
      this.logger.error(`Error verifying element state: ${error}`);
      
      return {
        verified: false,
        reason: `Error checking element state: ${error}`,
        element,
        actualState,
        expectedState
      };
    }
  }
} 