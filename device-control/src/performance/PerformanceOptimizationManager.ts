import { Logger } from '../utils/Logger';
import { ElementLocator } from '../element/ElementLocator';
import { UIStateCaptureManager } from '../state/UIStateCaptureManager';
import { AppControlActions } from '../actions/AppControlActions';
import { PerformanceMonitor } from './PerformanceMonitor';
import { ResourceManager } from './ResourceManager';
import { ErrorRecoveryManager } from './ErrorRecoveryManager';
import { 
  MetricCategory, 
  PerformanceBaseline,
  PerformanceReportOptions,
  PerformanceReport,
  BatchingOptions,
  CachingStrategy,
  LazyLoadingOptions,
  RecoveryStrategy,
  OptimizationResult,
  OperationMetric,
  CategoryStats,
  OptimizationStats,
  PerformanceMonitorOptions,
  ResourceManagerOptions,
  ErrorTrend
} from '../types/performance';

/**
 * PerformanceOptimizationManager
 * 
 * Integrates all performance optimization components into a single manager
 */
export class PerformanceOptimizationManager {
  private logger: Logger = new Logger('PerformanceOptimizationManager');
  private enabled: boolean = true;
  
  // Optimization components
  private performanceMonitor: PerformanceMonitor;
  private resourceManager: ResourceManager;
  private errorRecoveryManager: ErrorRecoveryManager;
  
  // Periodic optimization
  private memoryOptimizationInterval: NodeJS.Timeout | null = null;
  private autoOptimizationEnabled: boolean = false;
  private autoOptimizeInterval: number = 30000;
  private lastAutoOptimizeTime: number = 0;
  
  /**
   * Create a new performance optimization manager
   */
  constructor(
    private readonly elementLocator: ElementLocator,
    private readonly appActions: AppControlActions,
    private readonly stateManager?: UIStateCaptureManager,
    options: {
      enabled?: boolean;
      monitorOptions?: Partial<PerformanceMonitorOptions>;
      resourceOptions?: Partial<ResourceManagerOptions>;
      recoveryOptions?: Partial<RecoveryStrategy>;
      autoOptimize?: boolean;
      autoOptimizeInterval?: number;
      enableLogging?: boolean;
    } = {}
  ) {
    this.logger = new Logger('PerformanceOptimizationManager');
    
    // Initialize components
    this.performanceMonitor = new PerformanceMonitor({
      enabled: true,
      thresholds: {
        minorDeviation: 20,
        moderateDeviation: 50,
        severeDeviation: 100
      },
      ...options.monitorOptions
    });
    
    this.resourceManager = new ResourceManager(
      elementLocator, 
      stateManager, 
      {
        enabled: true,
        caching: { enabled: true },
        ...options.resourceOptions
      }
    );
    
    this.errorRecoveryManager = new ErrorRecoveryManager(options.recoveryOptions, this.appActions);
    
    // Set initial state
    this.enabled = options.enabled !== undefined ? options.enabled : true;
    this.autoOptimizationEnabled = options.autoOptimize !== undefined ? options.autoOptimize : false;
    this.autoOptimizeInterval = options.autoOptimizeInterval || 30000;
    
    // Start auto-optimization if enabled
    if (this.enabled && this.autoOptimizationEnabled) {
      this.startAutoOptimization();
    }
    
    this.logger.info('Performance optimization manager initialized', {
      enabled: this.enabled,
      monitorEnabled: this.performanceMonitor.isEnabled(),
      resourceManagerEnabled: this.resourceManager.isEnabled(),
      errorRecoveryEnabled: this.errorRecoveryManager.isEnabled(),
      autoOptimize: this.autoOptimizationEnabled
    });
  }
  
  /**
   * Start automatic optimization on an interval
   */
  startAutoOptimization(intervalMs: number = 60000): void {
    // Clear any existing interval
    this.stopAutoOptimization();
    
    this.autoOptimizationEnabled = true;
    this.memoryOptimizationInterval = setInterval(() => {
      this.optimizeMemoryUsage();
    }, intervalMs);
    
    this.logger.info(`Auto-optimization started, interval: ${intervalMs}ms`);
  }
  
  /**
   * Stop automatic optimization
   */
  stopAutoOptimization(): void {
    if (this.memoryOptimizationInterval) {
      clearInterval(this.memoryOptimizationInterval);
      this.memoryOptimizationInterval = null;
    }
    
    this.autoOptimizationEnabled = false;
    this.logger.info('Auto-optimization stopped');
  }
  
  /**
   * Optimize memory usage by cleaning up unused resources
   */
  optimizeMemoryUsage(): number {
    if (!this.enabled) {
      return 0;
    }
    
    const before = this.getMemoryUsage();
    const unloadedCount = this.resourceManager.optimizeMemoryUsage();
    const after = this.getMemoryUsage();
    
    const reduction = before - after;
    const reductionPercentage = before > 0 ? (reduction / before) * 100 : 0;
    
    this.logger.info(`Memory optimization completed`, {
      unloadedResources: unloadedCount,
      memoryBefore: this.formatBytes(before),
      memoryAfter: this.formatBytes(after),
      reduction: this.formatBytes(reduction),
      reductionPercentage: `${reductionPercentage.toFixed(2)}%`
    });
    
    return unloadedCount;
  }
  
  /**
   * Track an operation with performance monitoring and error recovery
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

    try {
      const result = await this.performanceMonitor.trackOperation(
        operationName,
        category,
        async () => {
          try {
            return await operation();
          } catch (error) {
            if (this.errorRecoveryManager.isEnabled()) {
              return await this.errorRecoveryManager.executeWithRecovery(
                operation,
                error instanceof Error ? error : new Error(String(error))
              ) as T;
            }
            throw error;
          }
        },
        metadata
      );
      return result;
    } catch (error) {
      this.logger.error(`Operation ${operationName} failed`, { error });
      throw error;
    }
  }
  
  /**
   * Track a resource for optimization
   */
  trackResource(
    type: string,
    id: string,
    metadata?: Record<string, any>
  ): void {
    if (!this.enabled) {
      return;
    }
    
    // Use the resource manager to track resource usage
    this.resourceManager.trackResourceUsage(type, id, metadata);
  }
  
  /**
   * Batch similar operations to reduce overhead
   */
  async batchOperation<T>(
    operation: string,
    args: any[],
    executor: (...args: any[]) => Promise<T>
  ): Promise<T> {
    if (!this.enabled) {
      return executor(...args);
    }
    
    // Use the resource manager to batch operations
    return this.resourceManager.batchOperation(operation, args, executor);
  }
  
  /**
   * Generate a performance report
   */
  generatePerformanceReport(options: Partial<PerformanceReportOptions> = {}): PerformanceReport {
    return this.performanceMonitor.generateReport(options);
  }
  
  /**
   * Create performance baselines from current metrics
   */
  generateBaselines(options: {
    category?: MetricCategory;
    operationNames?: string[];
    tolerancePercentage?: number;
    minimumSamples?: number;
  } = {}): PerformanceBaseline[] {
    return this.performanceMonitor.generateBaselines(options);
  }
  
  /**
   * Analyze error patterns
   */
  analyzeErrorPatterns(): Record<string, any> {
    return this.errorRecoveryManager.analyzeErrorPatterns();
  }
  
  /**
   * Get memory usage in bytes
   */
  private getMemoryUsage(): number {
    const memoryUsage = process.memoryUsage();
    return memoryUsage.heapUsed;
  }
  
  /**
   * Format bytes to a readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  /**
   * Get optimization statistics
   */
  getOptimizationStats(): OptimizationStats {
    const metrics = this.performanceMonitor.getMetrics() || [];
    const baselines = this.performanceMonitor.getBaselines() || [];
    const errorTrends = this.errorRecoveryManager.getErrorTrends();

    return {
      performance: {
        trackedOperations: metrics.length,
        baselines: baselines.length,
        categories: this.getCategoryStats(metrics)
      },
      resources: this.resourceManager.getStatistics(),
      autoOptimization: {
        enabled: this.autoOptimizationEnabled,
        interval: this.autoOptimizeInterval,
        lastRun: this.lastAutoOptimizeTime
      },
      errors: {
        totalErrors: Array.from(errorTrends.values()).reduce((sum, trend) => sum + trend.occurrences, 0),
        recoveryAttempts: Array.from(errorTrends.values()).reduce((sum, trend) => sum + trend.recoveryAttempts, 0),
        successfulRecoveries: Array.from(errorTrends.values()).reduce((sum, trend) => sum + trend.successfulRecoveries, 0),
        errorTrends: Array.from(errorTrends.entries()).map(([type, trend]) => ({
          type,
          occurrences: trend.occurrences,
          recoveryAttempts: trend.recoveryAttempts,
          successRate: trend.recoveryAttempts > 0 ? trend.successfulRecoveries / trend.recoveryAttempts : 0
        }))
      }
    };
  }
  
  private getCategoryStats(metrics: OperationMetric[]): Record<string, CategoryStats> {
    const stats: Record<string, CategoryStats> = {};
    
    metrics.forEach(metric => {
      if (!stats[metric.category]) {
        stats[metric.category] = {
          count: 0,
          totalDuration: 0,
          successCount: 0
        };
      }
      
      stats[metric.category].count++;
      stats[metric.category].totalDuration += metric.duration;
      if (metric.success) {
        stats[metric.category].successCount++;
      }
    });

    return stats;
  }
  
  /**
   * Apply optimization strategies and measure improvements
   */
  async optimizePerformance(category?: MetricCategory): Promise<OptimizationResult> {
    if (!this.enabled) {
      return {
        improved: false,
        savings: 0,
        resourcesUnloaded: 0,
        beforeStats: { count: 0, avgDuration: 0, successRate: 0 },
        afterStats: { count: 0, avgDuration: 0, successRate: 0 }
      };
    }

    // Get current performance metrics
    const beforeMetrics = await this.performanceMonitor.getMetrics();
    const beforeStats = this.calculateStats(beforeMetrics, category);

    // Optimize resources first
    const resourcesUnloaded = await this.resourceManager.optimizeMemoryUsage();

    // Generate new baselines if needed
    await this.performanceMonitor.generateBaselines({ category });

    // Get metrics after optimization
    const afterMetrics = await this.performanceMonitor.getMetrics();
    const afterStats = this.calculateStats(afterMetrics, category);

    const improved = afterStats.avgDuration < beforeStats.avgDuration;
    const savings = improved ? beforeStats.avgDuration - afterStats.avgDuration : 0;

    return {
      improved,
      savings,
      resourcesUnloaded,
      beforeStats,
      afterStats
    };
  }
  
  private calculateStats(metrics: OperationMetric[], category?: MetricCategory) {
    const filteredMetrics = category 
      ? metrics.filter(m => m.category === category)
      : metrics;

    if (filteredMetrics.length === 0) {
      return {
        count: 0,
        avgDuration: 0,
        successRate: 0
      };
    }

    const totalDuration = filteredMetrics.reduce((sum, m) => sum + m.duration, 0);
    const successCount = filteredMetrics.filter(m => m.success).length;

    return {
      count: filteredMetrics.length,
      avgDuration: totalDuration / filteredMetrics.length,
      successRate: successCount / filteredMetrics.length
    };
  }
  
  /**
   * Enable or disable the performance optimization manager
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    
    // Update component states
    this.performanceMonitor.setEnabled(enabled);
    this.resourceManager.setEnabled(enabled);
    this.errorRecoveryManager.setEnabled(enabled);
    
    // Update auto-optimization
    if (enabled && this.autoOptimizationEnabled && !this.memoryOptimizationInterval) {
      this.startAutoOptimization();
    } else if (!enabled && this.memoryOptimizationInterval) {
      this.stopAutoOptimization();
    }
    
    this.logger.info(`Performance optimization ${enabled ? 'enabled' : 'disabled'}`);
  }
  
  /**
   * Get the performance monitor
   */
  getPerformanceMonitor(): PerformanceMonitor {
    return this.performanceMonitor;
  }
  
  /**
   * Get the resource manager
   */
  getResourceManager(): ResourceManager {
    return this.resourceManager;
  }
  
  /**
   * Get the error recovery manager
   */
  getErrorRecoveryManager(): ErrorRecoveryManager {
    return this.errorRecoveryManager;
  }
  
  /**
   * Check if the performance optimization manager is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
  
  /**
   * Reset all optimization components
   */
  reset(): void {
    this.performanceMonitor.clearMetrics();
    this.performanceMonitor.clearBaselines();
    this.resourceManager.reset();
    this.errorRecoveryManager.resetErrorTrends();
    
    this.logger.info('Performance optimization manager reset');
  }
} 