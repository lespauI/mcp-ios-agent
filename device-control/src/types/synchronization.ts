/**
 * Types and interfaces for Synchronization Framework
 */

/**
 * Represents a timeout configuration with inheritance structure
 */
export interface TimeoutConfig {
  global?: number;  // Global default timeout in ms
  operation?: {     // Operation-specific timeouts
    [key: string]: number;
  };
  element?: {       // Element-specific timeouts
    [key: string]: number;
  };
  elementType?: {   // Element type-specific timeouts
    [key: string]: number;
  };
  condition?: {     // Condition-specific timeouts
    [key: string]: number;
  };
}

/**
 * Timeout profile for different testing scenarios
 */
export interface TimeoutProfile {
  name: string;
  description?: string;
  config: TimeoutConfig;
  dynamicAdjustment?: boolean;  // Whether timeouts adjust based on device performance
}

/**
 * Wait strategy options
 */
export interface WaitOptions {
  timeout?: number;
  interval?: number;
  errorMessage?: string;
  strictMode?: boolean;  // Whether to throw or return false on failure
  requireVisible?: boolean;
  requireEnabled?: boolean;
  requireMatchAll?: boolean;  // For multi-element conditions, require all or any to match
  failOnPresent?: boolean;  // For negative assertions
  backoffFactor?: number;  // Multiplier for progressive backoff
  maxBackoff?: number;  // Maximum backoff interval
  initialDelay?: number;  // Initial delay before starting checks
  screenCondition?: boolean;  // Whether to take screenshots during condition checks
  stateCapture?: boolean;  // Whether to capture element state during waiting
  timeoutStrategy?: 'fixed' | 'dynamic' | 'progressive'; // How to apply timeout
}

/**
 * Polling strategy options
 */
export enum PollingStrategy {
  FIXED = 'fixed',           // Fixed interval polling
  PROGRESSIVE = 'progressive', // Increasing interval polling
  FIBONACCI = 'fibonacci',    // Fibonacci sequence interval polling
  EXPONENTIAL = 'exponential', // Exponential backoff polling
  ADAPTATIVE = 'adaptative'    // Adapts based on app responsiveness
}

/**
 * A wait condition predicate function
 */
export type WaitPredicate = () => Promise<boolean>;

/**
 * Element condition for waiting
 */
export interface ElementCondition {
  strategy: string;
  selector: string;
  attribute?: string;
  value?: any;
  condition?: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'matches' | 'exists' | 'notExists';
  index?: number;  // For multi-element results
  timeout?: number;
  negated?: boolean;
}

/**
 * Interface for combining multiple conditions
 */
export interface CompoundCondition {
  type: 'and' | 'or' | 'not';
  conditions: (ElementCondition | CompoundCondition)[];
  timeout?: number;
}

/**
 * Timeout alert configuration
 */
export interface TimeoutAlertConfig {
  enabled: boolean;
  threshold: number;  // Percentage of timeout used to trigger alert
  callback?: (operation: string, elapsedMs: number, timeoutMs: number) => void;
  logLevel?: 'info' | 'warn' | 'error';
}

/**
 * Wait result with performance data
 */
export interface WaitResult<T> {
  success: boolean;
  value?: T;
  elapsedTime: number;
  operations: number;  // Number of check operations performed
  performance: {
    avgCheckTime: number;
    maxCheckTime: number;
    totalPolls: number;
  };
  timedOut?: boolean;
}

/**
 * Performance metrics for tracking wait operations
 */
export interface WaitPerformanceMetrics {
  operationType: string;
  totalOperations: number;
  averageWaitTime: number;
  maxWaitTime: number;
  timeoutRate: number;  // Percentage of operations that time out
  successRate: number;  // Percentage of operations that succeed
}

/**
 * State validation options for wait operations
 */
export interface StateValidationOptions {
  validateElementState?: boolean;
  validateScreenState?: boolean;
  validateHierarchy?: boolean;
  captureBeforeWait?: boolean;
  captureAfterWait?: boolean;
  compareStates?: boolean;
  failOnDifference?: boolean;
} 