/**
 * Types and interfaces for Performance Optimization
 */

/**
 * Performance metric categories
 */
export enum MetricCategory {
  UI_ACTION = 'ui_action',
  ELEMENT_LOCATION = 'element_location',
  APP_CONTROL = 'app_control',
  STATE_CAPTURE = 'state_capture',
  SYNCHRONIZATION = 'synchronization',
  NETWORK = 'network',
  SESSION = 'session',
  OVERALL = 'overall'
}

/**
 * Represents a single operation performance measurement
 */
export interface OperationMetric {
  name: string;
  category: MetricCategory;
  duration: number;
  success: boolean;
  metadata?: Record<string, any>;
  timestamp: number;
  error?: string;
}

/**
 * Performance baseline for an operation
 */
export interface PerformanceBaseline {
  operationName: string;
  category: MetricCategory;
  expectedDuration: number;
  tolerance: number;
  minAcceptable: number;
  maxAcceptable: number;
  metadata?: Record<string, any>;
}

/**
 * Operation performance regression result
 */
export interface RegressionResult {
  operationName: string;
  category: MetricCategory;
  baseline: PerformanceBaseline;
  actual: number;
  deviation: number;
  deviationPercentage: number;
  isRegression: boolean;
  severity: 'none' | 'minor' | 'moderate' | 'severe';
}

/**
 * Performance report options
 */
export interface PerformanceReportOptions {
  categories?: MetricCategory[];
  operations?: string[];
  startTime?: number;
  endTime?: number;
  groupBy?: 'category' | 'operation' | 'success';
  includeSubOperations?: boolean;
  format?: 'summary' | 'detailed' | 'json';
  sortBy?: 'duration' | 'count' | 'name' | 'success_rate';
  limit?: number;
}

/**
 * Performance summary for an operation type
 */
export interface OperationSummary {
  name: string;
  category: MetricCategory;
  count: number;
  totalDuration: number;
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
  successRate: number;
  p50: number; // 50th percentile (median)
  p90: number; // 90th percentile
  p95: number; // 95th percentile
  p99: number; // 99th percentile
}

/**
 * Aggregate performance report
 */
export interface PerformanceReport {
  startTime: number;
  endTime: number;
  totalOperations: number;
  totalDuration: number;
  operationCounts: Record<string, number>;
  categoryCounts: Record<MetricCategory, number>;
  summaries: OperationSummary[];
  regressions?: RegressionResult[];
}

/**
 * Resource usage metrics
 */
export interface ResourceUsage {
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    arrayBuffers: number;
  };
  cpu: {
    user: number;
    system: number;
  };
  operations: {
    totalOperations: number;
    successfulOperations: number;
    failedOperations: number;
  };
  cache: {
    size: number;
    hits: number;
    misses: number;
    unloadedResources: number;
  };
}

/**
 * Options for operation batching
 */
export interface BatchingOptions {
  enabled: boolean;
  maxBatchSize: number;
  batchTimeoutMs: number;
  operations: string[];
}

/**
 * Caching strategy options
 */
export interface CachingStrategy {
  enabled: boolean;
  ttl: number;
  maxEntries: number;
  invalidationStrategy: 'time' | 'lru' | 'usage' | 'manual';
}

/**
 * Lazy loading options
 */
export interface LazyLoadingOptions {
  enabled?: boolean;
  loadThreshold?: number;
  unusedResourceThreshold?: number;
  clearCachesOnOptimize?: boolean;
}

/**
 * Error recovery strategy
 */
export interface RecoveryStrategy {
  maxRetries: number;
  retryDelay: number;
  exponentialBackoff: boolean;
  recoveryActions: Map<string, (error: Error, context: Record<string, any>) => Promise<boolean>>;
}

/**
 * Error trend data
 */
export interface ErrorTrend {
  occurrences: number;
  recoveryAttempts: number;
  successfulRecoveries: number;
  lastOccurrence: Date;
  errorType: string;
  failedRecoveries: number;
}

/**
 * Performance improvement result
 */
export interface OptimizationResult {
  improved: boolean;
  savings: number;
  resourcesUnloaded: number;
  beforeStats: {
    count: number;
    avgDuration: number;
    successRate: number;
  };
  afterStats: {
    count: number;
    avgDuration: number;
    successRate: number;
  };
}

export interface CategoryStats {
  count: number;
  totalDuration: number;
  successCount: number;
}

export interface ErrorStats {
  totalErrors: number;
  recoveryAttempts: number;
  successfulRecoveries: number;
  errorTrends: Array<{
    type: string;
    occurrences: number;
    recoveryAttempts: number;
    successRate: number;
  }>;
}

export interface OptimizationStats {
  performance: {
    trackedOperations: number;
    baselines: number;
    categories: Record<string, CategoryStats>;
  };
  resources: ResourceUsage;
  autoOptimization: {
    enabled: boolean;
    interval: number;
    lastRun: number;
  };
  errors: ErrorStats;
}

export interface PerformanceMonitorOptions {
  enabled?: boolean;
  thresholds?: Partial<{
    minorDeviation: number;
    moderateDeviation: number;
    severeDeviation: number;
  }>;
  initialBaselines?: PerformanceBaseline[];
}

export interface ResourceManagerOptions {
  unusedResourceThreshold?: number;
  clearCachesOnOptimize?: boolean;
  enableLogging?: boolean;
}

export interface PerformanceRegression {
  operationName: string;
  category: MetricCategory;
  isRegression: boolean;
  duration: number;
  expectedDuration: number;
  deviation: number;
  deviationPercentage: number;
  metadata?: Record<string, any>;
}

export interface BaselineGenerationOptions {
  minimumSamples?: number;
  category?: MetricCategory;
  tolerancePercentage?: number;
} 