import { Logger } from '../utils/Logger';
import { generateId } from '../utils/helpers';
import {
  MetricCategory,
  OperationMetric,
  PerformanceBaseline,
  RegressionResult,
  PerformanceReportOptions,
  OperationSummary,
  PerformanceReport,
  ResourceUsage
} from '../types/performance';

/**
 * Default performance report options
 */
const DEFAULT_REPORT_OPTIONS: PerformanceReportOptions = {
  groupBy: 'operation',
  includeSubOperations: false,
  format: 'summary',
  sortBy: 'duration',
  limit: 50
};

interface BaselineGenerationOptions {
  minimumSamples?: number;
  category?: MetricCategory;
}

/**
 * Performance Monitor
 * 
 * Tracks and analyzes operation performance across different components.
 */
export class PerformanceMonitor {
  private logger: Logger = new Logger('PerformanceMonitor');
  private metrics: OperationMetric[] = [];
  private baselines: PerformanceBaseline[] = [];
  private activeOperations: Set<string> = new Set();
  private startTime: number = Date.now();
  private enabled: boolean = true;
  
  /**
   * Performance monitoring thresholds
   */
  private thresholds = {
    minorDeviation: 20,
    moderateDeviation: 50,
    severeDeviation: 100
  };
  
  /**
   * Create a new performance monitor
   */
  constructor(
    options: {
      enabled?: boolean;
      thresholds?: Partial<{
        minorDeviation: number;
        moderateDeviation: number;
        severeDeviation: number;
      }>;
      initialBaselines?: PerformanceBaseline[];
    } = {}
  ) {
    if (options.enabled !== undefined) {
      this.enabled = options.enabled;
    }
    
    if (options.thresholds) {
      this.thresholds = { ...this.thresholds, ...options.thresholds };
    }
    
    if (options.initialBaselines) {
      this.baselines = [...options.initialBaselines];
    }
    
    this.logger.info('Performance monitor initialized', { 
      enabled: this.enabled,
      thresholds: this.thresholds
    });
  }
  
  /**
   * Start measuring an operation
   */
  startOperation(name: string, category: MetricCategory, metadata?: Record<string, any>): string {
    if (!this.enabled) return '';
    
    const operationId = generateId();
    const startTime = Date.now();
    
    // Create initial metric
    const metric: OperationMetric = {
      id: operationId,
      name,
      category,
      startTime,
      endTime: 0,
      duration: 0,
      success: false,
      metadata
    };
    
    // Store initial metric
    this.metrics.push(metric);
    this.activeOperations.add(operationId);
    
    return operationId;
  }
  
  /**
   * End measuring an operation
   */
  endOperation(operationId: string, success: boolean, metadata?: Record<string, any>): OperationMetric | null {
    if (!this.enabled || !operationId) return null;
    
    const metricIndex = this.metrics.findIndex(m => m.id === operationId);
    if (metricIndex === -1) {
      this.logger.warn(`Attempted to end unknown operation: ${operationId}`);
      return null;
    }
    
    const metric = this.metrics[metricIndex];
    const endTime = Date.now();
    const duration = endTime - metric.startTime;
    
    // Update metric
    metric.endTime = endTime;
    metric.duration = duration;
    metric.success = success;
    if (metadata) {
      metric.metadata = { ...metric.metadata, ...metadata };
    }
    
    // Clean up active operation
    this.activeOperations.delete(operationId);
    
    // Check for regression
    this.checkRegression(metric);
    
    return metric;
  }
  
  /**
   * Track an operation with automatic start/end
   */
  async trackOperation<T>(
    operationName: string,
    category: MetricCategory,
    operation: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    if (!this.enabled) {
      return operation();
    }

    const startTime = Date.now();
    try {
      const result = await operation();
      const duration = Date.now() - startTime;
      
      this.metrics.push({
        name: operationName,
        category,
        duration,
        success: true,
        metadata,
        timestamp: Date.now()
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.metrics.push({
        name: operationName,
        category,
        duration,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata,
        timestamp: Date.now()
      });
      throw error;
    }
  }
  
  /**
   * Add a sub-operation to an existing operation
   */
  addSubOperation(
    parentId: string, 
    name: string, 
    category: MetricCategory, 
    duration: number, 
    success: boolean, 
    metadata?: Record<string, any>
  ): string {
    if (!this.enabled) return '';
    
    const operationId = generateId();
    const parentIndex = this.metrics.findIndex(m => m.id === parentId);
    
    if (parentIndex === -1) {
      this.logger.warn(`Attempted to add sub-operation to unknown parent: ${parentId}`);
      return '';
    }
    
    const parent = this.metrics[parentIndex];
    const startTime = Math.max(parent.startTime, parent.endTime - duration);
    const endTime = startTime + duration;
    
    const subOperation: OperationMetric = {
      id: operationId,
      name,
      category,
      startTime,
      endTime,
      duration,
      success,
      metadata
    };
    
    // Initialize sub-operations array if it doesn't exist
    if (!parent.subOperations) {
      parent.subOperations = [];
    }
    
    // Add sub-operation
    parent.subOperations.push(subOperation);
    
    return operationId;
  }
  
  /**
   * Register a performance baseline
   */
  registerBaseline(baseline: PerformanceBaseline): void {
    this.baselines.push(baseline);
    
    this.logger.info(`Registered baseline for ${baseline.operationName}`, { 
      category: baseline.category,
      expectedDuration: baseline.expectedDuration,
      tolerance: baseline.tolerance
    });
  }
  
  /**
   * Check if an operation's performance has regressed against its baseline
   */
  private checkRegression(metric: OperationMetric): RegressionResult | null {
    const baseline = this.baselines.find(b => 
      b.operationName === metric.name && 
      b.category === metric.category
    );
    
    if (!baseline || !metric.success) {
      return null;
    }
    
    const deviation = metric.duration - baseline.expectedDuration;
    const deviationPercentage = (deviation / baseline.expectedDuration) * 100;
    
    let severity: 'none' | 'minor' | 'moderate' | 'severe' = 'none';
    let isRegression = false;
    
    if (deviationPercentage > this.thresholds.severeDeviation) {
      severity = 'severe';
      isRegression = true;
    } else if (deviationPercentage > this.thresholds.moderateDeviation) {
      severity = 'moderate';
      isRegression = true;
    } else if (deviationPercentage > this.thresholds.minorDeviation) {
      severity = 'minor';
      isRegression = true;
    }
    
    if (isRegression) {
      const result: RegressionResult = {
        operationName: metric.name,
        category: metric.category,
        baseline,
        actual: metric.duration,
        deviation,
        deviationPercentage,
        isRegression,
        severity
      };
      
      // Log the regression based on severity
      if (severity === 'severe') {
        this.logger.error(`Severe performance regression in ${metric.name}`, result);
      } else if (severity === 'moderate') {
        this.logger.warn(`Moderate performance regression in ${metric.name}`, result);
      } else if (severity === 'minor') {
        this.logger.info(`Minor performance regression in ${metric.name}`, result);
      }
      
      return result;
    }
    
    return null;
  }
  
  /**
   * Generate a performance report for all tracked operations
   */
  generateReport(options: Partial<PerformanceReportOptions> = {}): PerformanceReport {
    const mergedOptions = { ...DEFAULT_REPORT_OPTIONS, ...options };
    const endTime = Date.now();
    
    // Filter metrics based on options
    let filteredMetrics = this.metrics;
    
    if (mergedOptions.categories && mergedOptions.categories.length > 0) {
      filteredMetrics = filteredMetrics.filter(m => 
        mergedOptions.categories!.includes(m.category)
      );
    }
    
    if (mergedOptions.operations && mergedOptions.operations.length > 0) {
      filteredMetrics = filteredMetrics.filter(m => 
        mergedOptions.operations!.includes(m.name)
      );
    }
    
    if (mergedOptions.startTime) {
      filteredMetrics = filteredMetrics.filter(m => 
        m.startTime >= (mergedOptions.startTime || 0)
      );
    }
    
    if (mergedOptions.endTime) {
      filteredMetrics = filteredMetrics.filter(m => 
        m.endTime <= (mergedOptions.endTime || endTime)
      );
    }
    
    // Include sub-operations if requested
    if (mergedOptions.includeSubOperations) {
      const subOperations: OperationMetric[] = [];
      
      filteredMetrics.forEach(metric => {
        if (metric.subOperations && metric.subOperations.length > 0) {
          subOperations.push(...metric.subOperations);
        }
      });
      
      filteredMetrics = [...filteredMetrics, ...subOperations];
    }
    
    // Compute operation counts
    const operationCounts: Record<string, number> = {};
    const categoryCounts: Record<MetricCategory, number> = {
      [MetricCategory.UI_ACTION]: 0,
      [MetricCategory.ELEMENT_LOCATION]: 0,
      [MetricCategory.APP_CONTROL]: 0,
      [MetricCategory.STATE_CAPTURE]: 0,
      [MetricCategory.SYNCHRONIZATION]: 0,
      [MetricCategory.NETWORK]: 0,
      [MetricCategory.SESSION]: 0,
      [MetricCategory.OVERALL]: 0
    };
    
    filteredMetrics.forEach(metric => {
      operationCounts[metric.name] = (operationCounts[metric.name] || 0) + 1;
      categoryCounts[metric.category] = (categoryCounts[metric.category] || 0) + 1;
    });
    
    // Generate operation summaries
    const summaries: Record<string, OperationSummary> = {};
    
    filteredMetrics.forEach(metric => {
      const key = mergedOptions.groupBy === 'category' 
        ? metric.category 
        : `${metric.category}:${metric.name}`;
      
      if (!summaries[key]) {
        summaries[key] = {
          name: mergedOptions.groupBy === 'category' ? metric.category : metric.name,
          category: metric.category,
          count: 0,
          totalDuration: 0,
          averageDuration: 0,
          minDuration: Infinity,
          maxDuration: 0,
          successRate: 0,
          p50: 0,
          p90: 0,
          p95: 0,
          p99: 0
        };
      }
      
      const summary = summaries[key];
      summary.count += 1;
      summary.totalDuration += metric.duration;
      summary.minDuration = Math.min(summary.minDuration, metric.duration);
      summary.maxDuration = Math.max(summary.maxDuration, metric.duration);
      
      if (metric.success) {
        summary.successRate = ((summary.successRate * (summary.count - 1)) + 100) / summary.count;
      } else {
        summary.successRate = (summary.successRate * (summary.count - 1)) / summary.count;
      }
    });
    
    // Calculate percentiles and averages
    Object.values(summaries).forEach(summary => {
      if (summary.count > 0) {
        summary.averageDuration = summary.totalDuration / summary.count;
        
        // Calculate percentiles
        const durationsForOperation = filteredMetrics
          .filter(m => (mergedOptions.groupBy === 'category' ? 
              m.category === summary.name : 
              (m.category === summary.category && m.name === summary.name)
            ))
          .map(m => m.duration)
          .sort((a, b) => a - b);
        
        if (durationsForOperation.length > 0) {
          summary.p50 = this.calculatePercentile(durationsForOperation, 50);
          summary.p90 = this.calculatePercentile(durationsForOperation, 90);
          summary.p95 = this.calculatePercentile(durationsForOperation, 95);
          summary.p99 = this.calculatePercentile(durationsForOperation, 99);
        }
      }
    });
    
    // Sort summaries
    let sortedSummaries = Object.values(summaries);
    
    switch (mergedOptions.sortBy) {
      case 'duration':
        sortedSummaries = sortedSummaries.sort((a, b) => b.averageDuration - a.averageDuration);
        break;
      case 'count':
        sortedSummaries = sortedSummaries.sort((a, b) => b.count - a.count);
        break;
      case 'name':
        sortedSummaries = sortedSummaries.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'success_rate':
        sortedSummaries = sortedSummaries.sort((a, b) => b.successRate - a.successRate);
        break;
    }
    
    // Limit the number of results if needed
    if (mergedOptions.limit) {
      sortedSummaries = sortedSummaries.slice(0, mergedOptions.limit);
    }
    
    // Generate regression report
    const regressions: RegressionResult[] = [];
    filteredMetrics.forEach(metric => {
      const regression = this.checkRegression(metric);
      if (regression) {
        regressions.push(regression);
      }
    });
    
    // Create the final report
    const report: PerformanceReport = {
      startTime: mergedOptions.startTime || this.startTime,
      endTime: mergedOptions.endTime || endTime,
      totalOperations: filteredMetrics.length,
      totalDuration: filteredMetrics.reduce((sum, m) => sum + m.duration, 0),
      operationCounts,
      categoryCounts: categoryCounts,
      summaries: sortedSummaries,
      regressions: regressions.length > 0 ? regressions : undefined
    };
    
    return report;
  }
  
  /**
   * Calculate a percentile value from an array of numbers
   */
  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    if (values.length === 1) return values[0];
    
    const index = Math.ceil(percentile / 100 * values.length) - 1;
    return values[index];
  }
  
  /**
   * Create performance baselines from current metrics
   */
  generateBaselines(options: BaselineGenerationOptions = {}): PerformanceBaseline[] {
    const { minimumSamples = 3, category } = options;
    const metrics = this.metrics.filter(metric => 
      metric.success && 
      (!category || metric.category === category)
    );
    
    const operationGroups = new Map<string, OperationMetric[]>();
    metrics.forEach(metric => {
      const key = `${metric.name}-${metric.category}`;
      if (!operationGroups.has(key)) {
        operationGroups.set(key, []);
      }
      operationGroups.get(key)!.push(metric);
    });

    const baselines: PerformanceBaseline[] = [];
    operationGroups.forEach((metrics, key) => {
      if (metrics.length >= minimumSamples) {
        const durations = metrics.map(m => m.duration).filter(d => d > 0);
        if (durations.length >= minimumSamples) {
          const medianDuration = this.calculateMedian(durations);
          const [operation, category] = key.split('-');
          const tolerance = this.calculateTolerance(durations, medianDuration);
          baselines.push({
            operationName: operation,
            category: category as MetricCategory,
            expectedDuration: medianDuration,
            tolerance,
            minAcceptable: medianDuration - tolerance,
            maxAcceptable: medianDuration + tolerance,
            metadata: {
              sampleSize: metrics.length,
              minDuration: Math.min(...durations),
              maxDuration: Math.max(...durations)
            }
          });
        }
      }
    });

    this.baselines = baselines;
    return baselines;
  }

  private calculateMedian(numbers: number[]): number {
    const sorted = [...numbers].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle];
  }

  private calculateTolerance(durations: number[], median: number): number {
    const deviations = durations.map(d => Math.abs(d - median));
    return this.calculateMedian(deviations);
  }
  
  /**
   * Reset and clear all performance metrics
   */
  clearMetrics(): void {
    this.metrics = [];
    this.activeOperations.clear();
    this.startTime = Date.now();
    this.logger.info('Performance metrics cleared');
  }
  
  /**
   * Reset and clear performance baselines
   */
  clearBaselines(): void {
    this.baselines = [];
    this.logger.info('Performance baselines cleared');
  }
  
  /**
   * Enable or disable performance monitoring
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.logger.info(`Performance monitoring ${enabled ? 'enabled' : 'disabled'}`);
  }
  
  /**
   * Check if performance monitoring is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
  
  /**
   * Get all performance metrics
   */
  getMetrics(): OperationMetric[] {
    return [...this.metrics];
  }
  
  /**
   * Get performance baselines
   */
  getBaselines(): PerformanceBaseline[] {
    return [...this.baselines];
  }
  
  /**
   * Get current resource usage
   */
  getResourceUsage(): ResourceUsage {
    const memory = process.memoryUsage();
    
    return {
      memory: {
        heapUsed: memory.heapUsed,
        heapTotal: memory.heapTotal,
        external: memory.external
      },
      cpu: {
        user: process.cpuUsage().user,
        system: process.cpuUsage().system
      },
      operations: {
        active: this.activeOperations.size,
        queued: 0, // Would need integration with an operation queue
        completed: this.metrics.length
      },
      cache: {
        elementCacheSize: 0, // Would need integration with element cache
        stateCacheSize: 0,   // Would need integration with state cache
        otherCacheSize: 0    // Other caches
      }
    };
  }
  
  /**
   * Detect performance regressions across all metrics
   */
  detectRegressions(): PerformanceRegression[] {
    const regressions: PerformanceRegression[] = [];
    const recentMetrics = this.metrics.slice(-100); // Look at last 100 metrics

    for (const metric of recentMetrics) {
      const baseline = this.baselines.find(b => 
        b.operationName === metric.name && 
        b.category === metric.category
      );

      if (baseline && metric.duration > baseline.maxAcceptable) {
        regressions.push({
          operationName: metric.name,
          category: metric.category,
          isRegression: true,
          duration: metric.duration,
          expectedDuration: baseline.expectedDuration,
          deviation: metric.duration - baseline.expectedDuration,
          deviationPercentage: ((metric.duration - baseline.expectedDuration) / baseline.expectedDuration) * 100,
          metadata: metric.metadata
        });
      }
    }

    return regressions;
  }
  
  /**
   * Generate a performance report
   */
  generatePerformanceReport(options: Partial<PerformanceReportOptions> = {}): PerformanceReport {
    return this.generateReport(options);
  }
} 