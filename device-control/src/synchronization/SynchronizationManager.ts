import { Logger } from '../utils/Logger';
import { ElementLocator } from '../element/ElementLocator';
import { UIStateCaptureManager } from '../state/UIStateCaptureManager';
import { sleep } from '../utils/helpers';
import {
  TimeoutConfig,
  TimeoutProfile,
  WaitOptions,
  PollingStrategy,
  WaitPredicate,
  ElementCondition,
  CompoundCondition,
  TimeoutAlertConfig,
  WaitResult,
  WaitPerformanceMetrics,
  StateValidationOptions
} from '../types/synchronization';
import { ElementLocatorStrategy } from '../types';

/**
 * Default timeout configuration
 */
const DEFAULT_TIMEOUT_CONFIG: TimeoutConfig = {
  global: 10000, // 10 seconds
  operation: {
    click: 5000,
    find: 5000,
    navigate: 15000,
    launch: 30000,
    waitForVisible: 10000,
    waitForGone: 10000,
    waitForEnabled: 5000,
    swipe: 5000,
    scroll: 15000
  },
  element: {},
  elementType: {
    button: 5000,
    input: 8000,
    text: 3000,
    checkbox: 3000,
    toggle: 3000,
    list: 10000,
    picker: 8000,
    alert: 15000,
    dialog: 15000
  },
  condition: {
    simple: 5000,
    compound: 15000,
    negative: 10000
  }
};

/**
 * Default wait options
 */
const DEFAULT_WAIT_OPTIONS: WaitOptions = {
  timeout: undefined, // Will be resolved from TimeoutConfig
  interval: 500,
  errorMessage: 'Wait operation timed out',
  strictMode: true,
  requireVisible: true,
  requireEnabled: false,
  requireMatchAll: true,
  failOnPresent: false,
  backoffFactor: 1.5,
  maxBackoff: 3000,
  initialDelay: 0,
  screenCondition: false,
  stateCapture: false,
  timeoutStrategy: 'fixed'
};

/**
 * Default timeout alert configuration
 */
const DEFAULT_TIMEOUT_ALERT_CONFIG: TimeoutAlertConfig = {
  enabled: true,
  threshold: 80, // Alert at 80% of timeout
  logLevel: 'warn'
};

/**
 * Manages synchronization operations
 */
export class SynchronizationManager {
  private logger: Logger = new Logger('SynchronizationManager');
  private timeoutProfiles: Map<string, TimeoutProfile> = new Map();
  private activeProfile: string = 'default';
  private timeoutAlertConfig: TimeoutAlertConfig;
  private waitOperationMetrics: Map<string, WaitPerformanceMetrics> = new Map();
  private stateValidationOptions: StateValidationOptions = {
    validateElementState: false,
    validateScreenState: false,
    validateHierarchy: false,
    captureBeforeWait: false,
    captureAfterWait: false,
    compareStates: false,
    failOnDifference: false
  };

  /**
   * Create a new synchronization manager
   */
  constructor(
    private driver: WebdriverIO.Browser,
    private elementLocator: ElementLocator,
    private stateManager?: UIStateCaptureManager,
    options: {
      initialProfiles?: Record<string, TimeoutProfile>,
      timeoutAlertConfig?: Partial<TimeoutAlertConfig>,
      stateValidationOptions?: Partial<StateValidationOptions>
    } = {}
  ) {
    // Initialize default timeout profile
    this.registerTimeoutProfile({
      name: 'default',
      description: 'Default timeout profile with standard settings',
      config: DEFAULT_TIMEOUT_CONFIG,
      dynamicAdjustment: false
    });

    // Register additional profiles if provided
    if (options.initialProfiles) {
      Object.entries(options.initialProfiles).forEach(([name, profile]) => {
        this.registerTimeoutProfile(profile);
      });
    }

    // Configure timeout alerts
    this.timeoutAlertConfig = {
      ...DEFAULT_TIMEOUT_ALERT_CONFIG,
      ...options.timeoutAlertConfig
    };

    // Configure state validation
    if (options.stateValidationOptions) {
      this.stateValidationOptions = {
        ...this.stateValidationOptions,
        ...options.stateValidationOptions
      };
    }

    this.logger.info('Synchronization manager initialized', { 
      activeProfile: this.activeProfile,
      profiles: Array.from(this.timeoutProfiles.keys())
    });
  }

  /**
   * Register a timeout profile
   */
  registerTimeoutProfile(profile: TimeoutProfile): void {
    this.timeoutProfiles.set(profile.name, {
      ...profile,
      // Ensure the profile has all required fields with defaults if missing
      config: this.mergeTimeoutConfigs(DEFAULT_TIMEOUT_CONFIG, profile.config)
    });

    this.logger.info(`Registered timeout profile: ${profile.name}`);
  }

  /**
   * Set the active timeout profile
   */
  setActiveProfile(profileName: string): boolean {
    if (this.timeoutProfiles.has(profileName)) {
      this.activeProfile = profileName;
      this.logger.info(`Active timeout profile set to: ${profileName}`);
      return true;
    } else {
      this.logger.warn(`Timeout profile not found: ${profileName}, keeping current: ${this.activeProfile}`);
      return false;
    }
  }

  /**
   * Get the current active timeout profile
   */
  getActiveProfile(): TimeoutProfile {
    return this.timeoutProfiles.get(this.activeProfile)!;
  }

  /**
   * Get all registered timeout profiles
   */
  getProfiles(): TimeoutProfile[] {
    return Array.from(this.timeoutProfiles.values());
  }

  /**
   * Merge timeout configurations with defaults
   */
  private mergeTimeoutConfigs(base: TimeoutConfig, override: TimeoutConfig): TimeoutConfig {
    const result: TimeoutConfig = { ...base };

    // Merge global timeout
    if (override.global !== undefined) {
      result.global = override.global;
    }

    // Merge operation timeouts
    result.operation = { ...base.operation, ...override.operation };

    // Merge element timeouts
    result.element = { ...base.element, ...override.element };

    // Merge element type timeouts
    result.elementType = { ...base.elementType, ...override.elementType };

    // Merge condition timeouts
    result.condition = { ...base.condition, ...override.condition };

    return result;
  }

  /**
   * Resolve the appropriate timeout value for an operation
   */
  resolveTimeout(operationType: string, elementType?: string, element?: string): number {
    const profile = this.getActiveProfile();
    const config = profile.config;

    // Priority: specific element > element type > operation > global
    if (element && config.element && config.element[element] !== undefined) {
      return config.element[element];
    }

    if (elementType && config.elementType && config.elementType[elementType] !== undefined) {
      return config.elementType[elementType];
    }

    if (config.operation && config.operation[operationType] !== undefined) {
      return config.operation[operationType];
    }

    return config.global || DEFAULT_TIMEOUT_CONFIG.global!;
  }

  /**
   * Wait until a predicate function returns true
   */
  async waitForCondition<T>(
    predicate: () => Promise<T>,
    condition: (result: T) => boolean | Promise<boolean>,
    options: Partial<WaitOptions> = {}
  ): Promise<WaitResult<T>> {
    const mergedOptions: WaitOptions = { ...DEFAULT_WAIT_OPTIONS, ...options };
    const operationType = 'condition';
    
    // Resolve timeout if not explicitly specified
    const timeout = mergedOptions.timeout || this.resolveTimeout(operationType);
    const startTime = Date.now();
    const checkTimes: number[] = [];
    let operations = 0;
    let result: T | undefined;
    
    // Capture state before wait if enabled
    let beforeState = null;
    if (this.stateValidationOptions.captureBeforeWait && this.stateManager) {
      beforeState = await this.stateManager.captureState({
        screenshot: this.stateValidationOptions.validateScreenState,
        hierarchy: this.stateValidationOptions.validateHierarchy,
        properties: this.stateValidationOptions.validateElementState
      });
    }
    
    // Wait for initial delay if specified
    if (mergedOptions.initialDelay && mergedOptions.initialDelay > 0) {
      await sleep(mergedOptions.initialDelay);
    }
    
    // Setup polling strategy
    let currentInterval = mergedOptions.interval || 500;
    let fibonacci: number[] = [1, 1];
    
    try {
      // Main wait loop
      while (Date.now() - startTime < timeout) {
        const checkStartTime = Date.now();
        operations++;
        
        // Execute the predicate
        result = await predicate();
        
        // Check if condition is met
        const conditionResult = await Promise.resolve(condition(result));
        if (conditionResult) {
          // Success!
          const elapsedTime = Date.now() - startTime;
          
          // Record check time
          checkTimes.push(Date.now() - checkStartTime);
          
          // Calculate performance metrics
          const avgCheckTime = checkTimes.reduce((a, b) => a + b, 0) / checkTimes.length;
          const maxCheckTime = Math.max(...checkTimes);
          
          // Update metrics
          this.updateWaitMetrics(operationType, elapsedTime, true);
          
          // Capture state after wait if enabled
          let afterState = null;
          if (this.stateValidationOptions.captureAfterWait && this.stateManager) {
            afterState = await this.stateManager.captureState({
              screenshot: this.stateValidationOptions.validateScreenState,
              hierarchy: this.stateValidationOptions.validateHierarchy,
              properties: this.stateValidationOptions.validateElementState
            });
          }
          
          // Compare states if enabled
          if (this.stateValidationOptions.compareStates && beforeState && afterState && this.stateManager) {
            const comparison = this.stateManager.compareStates(beforeState, afterState);
            if (!comparison.matches && this.stateValidationOptions.failOnDifference) {
              throw new Error('State comparison failed: UI state changed during wait operation');
            }
          }
          
          // Return success result
          return {
            success: true,
            value: result,
            elapsedTime,
            operations,
            performance: {
              avgCheckTime,
              maxCheckTime,
              totalPolls: operations
            }
          };
        }
        
        // Record check time
        checkTimes.push(Date.now() - checkStartTime);
        
        // Check if we should trigger a timeout alert
        const elapsedPercent = ((Date.now() - startTime) / timeout) * 100;
        if (this.timeoutAlertConfig.enabled && elapsedPercent >= this.timeoutAlertConfig.threshold) {
          const logMethod = this.timeoutAlertConfig.logLevel || 'warn';
          this.logger[logMethod](`Wait operation at ${elapsedPercent.toFixed(1)}% of timeout`, {
            operation: operationType,
            elapsed: Date.now() - startTime,
            timeout
          });
          
          // Call alert callback if configured
          if (this.timeoutAlertConfig.callback) {
            this.timeoutAlertConfig.callback(operationType, Date.now() - startTime, timeout);
          }
        }
        
        // Determine next interval based on polling strategy
        switch (mergedOptions.timeoutStrategy) {
          case 'progressive':
            currentInterval = Math.min(
              currentInterval * (mergedOptions.backoffFactor || 1.5),
              mergedOptions.maxBackoff || 3000
            );
            break;
          case 'dynamic':
            // Calculate based on how much time is left
            const remaining = timeout - (Date.now() - startTime);
            const adjustedInterval = Math.min(
              remaining * 0.1, // Use 10% of remaining time
              mergedOptions.maxBackoff || 3000
            );
            currentInterval = Math.max(50, adjustedInterval); // Never less than 50ms
            break;
          case 'fixed':
          default:
            // Keep the same interval
            break;
        }
        
        // Wait before next check
        await sleep(currentInterval);
      }
      
      // Timeout reached
      const elapsedTime = Date.now() - startTime;
      
      // Calculate performance metrics
      const avgCheckTime = checkTimes.reduce((a, b) => a + b, 0) / checkTimes.length;
      const maxCheckTime = Math.max(...checkTimes);
      
      // Update metrics
      this.updateWaitMetrics(operationType, elapsedTime, false);
      
      // Handle timeout
      const errorMessage = mergedOptions.errorMessage || `Wait condition timed out after ${elapsedTime}ms`;
      
      if (mergedOptions.strictMode) {
        throw new Error(errorMessage);
      }
      
      // Return failure result
      return {
        success: false,
        timedOut: true,
        elapsedTime,
        operations,
        performance: {
          avgCheckTime,
          maxCheckTime,
          totalPolls: operations
        }
      };
    } catch (error) {
      // Calculate elapsed time
      const elapsedTime = Date.now() - startTime;
      
      // Calculate performance metrics
      const avgCheckTime = checkTimes.length > 0 ? 
        checkTimes.reduce((a, b) => a + b, 0) / checkTimes.length : 0;
      const maxCheckTime = checkTimes.length > 0 ? Math.max(...checkTimes) : 0;
      
      // Update metrics
      this.updateWaitMetrics(operationType, elapsedTime, false);
      
      // Re-throw if this wasn't a timeout error
      if (mergedOptions.strictMode && error instanceof Error && 
          !error.message.includes('timed out')) {
        throw error;
      }
      
      // Return failure result
      return {
        success: false,
        elapsedTime,
        operations,
        performance: {
          avgCheckTime,
          maxCheckTime,
          totalPolls: operations
        }
      };
    }
  }

  /**
   * Wait for an element to exist
   */
  async waitForElementPresent(
    strategy: ElementLocatorStrategy,
    selector: string,
    options: Partial<WaitOptions> = {}
  ): Promise<WaitResult<WebdriverIO.Element | null>> {
    const operationType = 'waitForPresent';
    const mergedOptions: WaitOptions = { ...DEFAULT_WAIT_OPTIONS, ...options };
    
    // Resolve timeout if not explicitly specified
    mergedOptions.timeout = mergedOptions.timeout || this.resolveTimeout(operationType);
    
    return this.waitForCondition<WebdriverIO.Element | null>(
      async () => {
        try {
          return await this.elementLocator.findElement(strategy, selector, {
            timeout: 1000 // Short timeout for each individual find
          });
        } catch (e) {
          return null;
        }
      },
      (element) => {
        // For negative assertions, check if element is null
        if (mergedOptions.failOnPresent) {
          return element === null;
        }
        
        // For regular assertions, check if element exists
        return element !== null;
      },
      mergedOptions
    );
  }

  /**
   * Wait for an element to be visible
   */
  async waitForElementVisible(
    strategy: ElementLocatorStrategy,
    selector: string,
    options: Partial<WaitOptions> = {}
  ): Promise<WaitResult<WebdriverIO.Element | null>> {
    const operationType = 'waitForVisible';
    const mergedOptions: WaitOptions = { ...DEFAULT_WAIT_OPTIONS, ...options };
    
    // Resolve timeout if not explicitly specified
    mergedOptions.timeout = mergedOptions.timeout || this.resolveTimeout(operationType);
    
    return this.waitForCondition<WebdriverIO.Element | null>(
      async () => {
        try {
          const element = await this.elementLocator.findElement(strategy, selector, {
            timeout: 1000 // Short timeout for each individual find
          });
          return element;
        } catch (e) {
          return null;
        }
      },
      async (element) => {
        if (!element) return false;
        
        // For negative assertions, check if element is not visible
        if (mergedOptions.failOnPresent) {
          try {
            const isVisible = await element.isDisplayed();
            return !isVisible;
          } catch {
            return true; // Element no longer in DOM, so not visible
          }
        }
        
        // For regular assertions, check if element is visible
        try {
          return await element.isDisplayed();
        } catch {
          return false; // If error checking visibility, element is no longer valid
        }
      },
      mergedOptions
    );
  }

  /**
   * Wait for element to be enabled
   */
  async waitForElementEnabled(
    strategy: ElementLocatorStrategy,
    selector: string,
    options: Partial<WaitOptions> = {}
  ): Promise<WaitResult<WebdriverIO.Element | null>> {
    const operationType = 'waitForEnabled';
    const mergedOptions: WaitOptions = { ...DEFAULT_WAIT_OPTIONS, ...options };
    
    // Resolve timeout if not explicitly specified
    mergedOptions.timeout = mergedOptions.timeout || this.resolveTimeout(operationType);
    
    return this.waitForCondition<WebdriverIO.Element | null>(
      async () => {
        try {
          return await this.elementLocator.findElement(strategy, selector, {
            timeout: 1000 // Short timeout for each individual find
          });
        } catch (e) {
          return null;
        }
      },
      async (element) => {
        if (!element) return false;
        
        try {
          // Check visibility first if required
          if (mergedOptions.requireVisible) {
            const isVisible = await element.isDisplayed();
            if (!isVisible) return false;
          }
          
          // Check if element is enabled
          const isEnabled = await element.isEnabled();
          
          // For negative assertions, invert the result
          return mergedOptions.failOnPresent ? !isEnabled : isEnabled;
        } catch {
          return false; // If error checking state, element is no longer valid
        }
      },
      mergedOptions
    );
  }

  /**
   * Wait for element to have a specific attribute value
   */
  async waitForElementAttribute(
    strategy: ElementLocatorStrategy,
    selector: string,
    attribute: string,
    value: string,
    options: Partial<WaitOptions> = {}
  ): Promise<WaitResult<string | null>> {
    const operationType = 'waitForAttribute';
    const mergedOptions: WaitOptions = { ...DEFAULT_WAIT_OPTIONS, ...options };
    
    // Resolve timeout if not explicitly specified
    mergedOptions.timeout = mergedOptions.timeout || this.resolveTimeout(operationType);
    
    return this.waitForCondition<string | null>(
      async () => {
        try {
          const element = await this.elementLocator.findElement(strategy, selector, {
            timeout: 1000 // Short timeout for each individual find
          });
          
          // Check visibility first if required
          if (mergedOptions.requireVisible) {
            const isVisible = await element.isDisplayed();
            if (!isVisible) return null;
          }
          
          // Get attribute value
          return await element.getAttribute(attribute);
        } catch (e) {
          return null;
        }
      },
      (attributeValue) => {
        if (attributeValue === null) return false;
        
        // For negative assertions, check if attribute value doesn't match
        if (mergedOptions.failOnPresent) {
          return attributeValue !== value;
        }
        
        // For regular assertions, check if attribute value matches
        return attributeValue === value;
      },
      mergedOptions
    );
  }

  /**
   * Wait for element to have specific text
   */
  async waitForElementText(
    strategy: ElementLocatorStrategy,
    selector: string,
    text: string,
    options: Partial<WaitOptions> = {}
  ): Promise<WaitResult<string | null>> {
    const operationType = 'waitForText';
    const mergedOptions: WaitOptions = { ...DEFAULT_WAIT_OPTIONS, ...options };
    
    // Resolve timeout if not explicitly specified
    mergedOptions.timeout = mergedOptions.timeout || this.resolveTimeout(operationType);
    
    return this.waitForCondition<string | null>(
      async () => {
        try {
          const element = await this.elementLocator.findElement(strategy, selector, {
            timeout: 1000 // Short timeout for each individual find
          });
          
          // Check visibility first if required
          if (mergedOptions.requireVisible) {
            const isVisible = await element.isDisplayed();
            if (!isVisible) return null;
          }
          
          // Get text
          return await element.getText();
        } catch (e) {
          return null;
        }
      },
      (elementText) => {
        if (elementText === null) return false;
        
        // For negative assertions, check if text doesn't match
        if (mergedOptions.failOnPresent) {
          return elementText !== text;
        }
        
        // For regular assertions, check if text matches
        return elementText === text;
      },
      mergedOptions
    );
  }

  /**
   * Wait for a custom condition
   */
  async waitForCustom(
    predicate: WaitPredicate,
    options: Partial<WaitOptions> = {}
  ): Promise<WaitResult<boolean>> {
    const operationType = 'waitForCustom';
    const mergedOptions: WaitOptions = { ...DEFAULT_WAIT_OPTIONS, ...options };
    
    // Resolve timeout if not explicitly specified
    mergedOptions.timeout = mergedOptions.timeout || this.resolveTimeout(operationType);
    
    return this.waitForCondition<boolean>(
      async () => {
        try {
          return await predicate();
        } catch (e) {
          return false;
        }
      },
      (result) => {
        // For negative assertions, invert the result
        return mergedOptions.failOnPresent ? !result : result;
      },
      mergedOptions
    );
  }

  /**
   * Wait for a complex condition involving multiple elements
   */
  async waitForCompoundCondition(
    condition: CompoundCondition,
    options: Partial<WaitOptions> = {}
  ): Promise<WaitResult<boolean>> {
    const operationType = 'compound';
    const mergedOptions: WaitOptions = { ...DEFAULT_WAIT_OPTIONS, ...options };
    
    // Resolve timeout if not explicitly specified
    mergedOptions.timeout = mergedOptions.timeout || 
                           condition.timeout || 
                           this.resolveTimeout(operationType);
    
    return this.waitForCondition<boolean>(
      async () => {
        return await this.evaluateCompoundCondition(condition);
      },
      (result) => {
        // For negative assertions, invert the result
        return mergedOptions.failOnPresent ? !result : result;
      },
      mergedOptions
    );
  }

  /**
   * Recursively evaluate a compound condition
   */
  private async evaluateCompoundCondition(condition: CompoundCondition): Promise<boolean> {
    const results: boolean[] = [];
    
    // Evaluate each condition in the compound
    for (const subCondition of condition.conditions) {
      let result: boolean;
      
      if ('type' in subCondition) {
        // This is another compound condition
        result = await this.evaluateCompoundCondition(subCondition as CompoundCondition);
      } else {
        // This is an element condition
        const elemCondition = subCondition as ElementCondition;
        result = await this.evaluateElementCondition(elemCondition);
      }
      
      results.push(result);
      
      // Short-circuit evaluation for AND/OR
      if (condition.type === 'and' && !result) {
        return false;
      } else if (condition.type === 'or' && result) {
        return true;
      }
    }
    
    // Compute final result based on condition type
    switch (condition.type) {
      case 'and':
        return results.every(r => r);
      case 'or':
        return results.some(r => r);
      case 'not':
        // NOT should have only one child condition, negate its result
        return !results[0];
      default:
        throw new Error(`Unknown compound condition type: ${condition.type}`);
    }
  }

  /**
   * Evaluate a single element condition
   */
  private async evaluateElementCondition(condition: ElementCondition): Promise<boolean> {
    const { strategy, selector, attribute, value, condition: conditionType } = condition;
    
    try {
      let element: WebdriverIO.Element | null = null;
      let elements: WebdriverIO.Element[] = [];
      
      // For exists/notExists, we just need to check if the element is present
      if (conditionType === 'exists' || conditionType === 'notExists') {
        try {
          elements = await this.elementLocator.findElements(
            strategy as ElementLocatorStrategy, 
            selector
          );
          
          const exists = elements.length > 0;
          return conditionType === 'exists' ? exists : !exists;
        } catch {
          return conditionType === 'notExists';
        }
      }
      
      // For all other conditions, we need to find the element first
      try {
        if (condition.index !== undefined) {
          // Find all elements and use the one at the specified index
          elements = await this.elementLocator.findElements(
            strategy as ElementLocatorStrategy, 
            selector
          );
          
          if (elements.length <= condition.index) {
            return false;
          }
          
          element = elements[condition.index];
        } else {
          // Find just the first matching element
          element = await this.elementLocator.findElement(
            strategy as ElementLocatorStrategy, 
            selector
          );
        }
      } catch {
        return false;
      }
      
      // If we don't have a valid element, the condition is false
      if (!element) {
        return false;
      }
      
      // For attribute/property conditions
      if (attribute) {
        let attributeValue: string;
        
        try {
          attributeValue = await element.getAttribute(attribute);
        } catch {
          return false;
        }
        
        if (value === undefined) {
          // Just check if the attribute exists and has a non-empty value
          return !!attributeValue;
        }
        
        // Compare based on condition type
        switch (conditionType) {
          case 'equals':
            return attributeValue === value;
          case 'contains':
            return attributeValue.includes(value as string);
          case 'startsWith':
            return attributeValue.startsWith(value as string);
          case 'endsWith':
            return attributeValue.endsWith(value as string);
          case 'matches':
            return new RegExp(value as string).test(attributeValue);
          default:
            // Default to equality
            return attributeValue === value;
        }
      }
      
      // If no attribute specified, check if element is visible
      try {
        return await element.isDisplayed();
      } catch {
        return false;
      }
    } catch (error) {
      this.logger.error(`Error evaluating element condition: ${error}`);
      return false;
    }
  }

  /**
   * Update wait performance metrics
   */
  private updateWaitMetrics(operationType: string, elapsedTime: number, success: boolean): void {
    // Get existing metrics or create new ones
    const existing = this.waitOperationMetrics.get(operationType) || {
      operationType,
      totalOperations: 0,
      averageWaitTime: 0,
      maxWaitTime: 0,
      timeoutRate: 0,
      successRate: 100
    };
    
    // Update metrics
    const totalOps = existing.totalOperations + 1;
    const totalWaitTime = existing.averageWaitTime * existing.totalOperations + elapsedTime;
    const maxWaitTime = Math.max(existing.maxWaitTime, elapsedTime);
    const successOps = existing.successRate * existing.totalOperations / 100 + (success ? 1 : 0);
    
    // Calculate new metrics
    const updated: WaitPerformanceMetrics = {
      operationType,
      totalOperations: totalOps,
      averageWaitTime: totalWaitTime / totalOps,
      maxWaitTime,
      timeoutRate: 100 - (successOps / totalOps * 100),
      successRate: successOps / totalOps * 100
    };
    
    // Store updated metrics
    this.waitOperationMetrics.set(operationType, updated);
  }

  /**
   * Get performance metrics for a specific operation type
   */
  getWaitMetrics(operationType?: string): WaitPerformanceMetrics | Map<string, WaitPerformanceMetrics> {
    if (operationType) {
      return this.waitOperationMetrics.get(operationType) || {
        operationType,
        totalOperations: 0,
        averageWaitTime: 0,
        maxWaitTime: 0,
        timeoutRate: 0,
        successRate: 0
      };
    }
    
    return this.waitOperationMetrics;
  }

  /**
   * Reset performance metrics
   */
  resetMetrics(operationType?: string): void {
    if (operationType) {
      this.waitOperationMetrics.delete(operationType);
    } else {
      this.waitOperationMetrics.clear();
    }
  }

  /**
   * Configure timeout alerts
   */
  setTimeoutAlertConfig(config: Partial<TimeoutAlertConfig>): void {
    this.timeoutAlertConfig = {
      ...this.timeoutAlertConfig,
      ...config
    };
  }

  /**
   * Configure state validation options
   */
  setStateValidationOptions(options: Partial<StateValidationOptions>): void {
    this.stateValidationOptions = {
      ...this.stateValidationOptions,
      ...options
    };
  }

  /**
   * Get the current timeout alert configuration
   */
  getTimeoutAlertConfig(): TimeoutAlertConfig {
    return this.timeoutAlertConfig;
  }

  /**
   * Get the current state validation options
   */
  getStateValidationOptions(): StateValidationOptions {
    return this.stateValidationOptions;
  }
} 