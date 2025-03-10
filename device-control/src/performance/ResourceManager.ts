import { Logger } from '../utils/Logger';
import { ElementLocator } from '../element/ElementLocator';
import { UIStateCaptureManager } from '../state/UIStateCaptureManager';
import { BatchingOptions, CachingStrategy, LazyLoadingOptions, ResourceUsage } from '../types/performance';
import fs from 'fs';

/**
 * Default batching options
 */
const DEFAULT_BATCHING_OPTIONS: BatchingOptions = {
  enabled: true,
  maxBatchSize: 10,
  batchTimeoutMs: 200,
  operations: [
    'findElement',
    'findElements',
    'getAttribute',
    'getProperty'
  ]
};

/**
 * Default caching strategy
 */
const DEFAULT_CACHING_STRATEGY: CachingStrategy = {
  enabled: true,
  ttl: 5000, // 5 seconds
  maxEntries: 1000,
  invalidationStrategy: 'lru'
};

/**
 * Default lazy loading options
 */
const DEFAULT_LAZY_LOADING_OPTIONS: LazyLoadingOptions = {
  enabled: true,
  loadThreshold: 5, // Load when 5 operations have referenced the resource
  preloadOperations: [
    'navigate',
    'tap',
    'swipe'
  ],
  unloadThreshold: 10_000 // Unload after 10 seconds of inactivity
};

interface ResourceReference {
  type: string;
  id: string;
  usageCount: number;
  lastAccessed: number;
  size: number;
  metadata?: Record<string, any>;
}

interface BatchOperation<T> {
  id: string;
  operation: string;
  args: any[];
  resolve: (result: T) => void;
  reject: (error: any) => void;
  timestamp: number;
}

type OperationBatch = Map<string, BatchOperation<any>[]>;

/**
 * ResourceManager
 * 
 * Manages resource usage, caching, and batching to optimize performance
 */
export class ResourceManager {
  private logger: Logger = new Logger('ResourceManager');
  private enabled: boolean = true;
  
  // Caching configuration
  private cachingStrategy: CachingStrategy;
  
  // Batching configuration
  private batchingOptions: BatchingOptions;
  private batchOperationQueue: OperationBatch = new Map();
  private batchTimeoutId: NodeJS.Timeout | null = null;
  
  // Lazy loading configuration
  private lazyLoadingOptions: LazyLoadingOptions;
  private resourceReferences: Map<string, ResourceReference> = new Map();
  private unloadTimeouts: Map<string, NodeJS.Timeout> = new Map();
  
  // Monitoring
  private totalBatchesSent: number = 0;
  private totalBatchOperations: number = 0;
  private totalCacheHits: number = 0;
  private totalCacheMisses: number = 0;
  private totalResourcesUnloaded: number = 0;
  
  private statistics = {
    totalOperations: 0,
    successfulOperations: 0,
    failedOperations: 0,
    cacheHits: 0,
    cacheMisses: 0,
    totalResourcesUnloaded: 0,
    resourcesByType: {} as Record<string, number>
  };
  
  private options: {
    unusedResourceThreshold: number;
    clearCachesOnOptimize: boolean;
  };
  
  /**
   * Create a new resource manager
   */
  constructor(
    private readonly elementLocator?: ElementLocator,
    private readonly stateManager?: UIStateCaptureManager,
    options: {
      caching?: Partial<CachingStrategy>;
      batching?: Partial<BatchingOptions>;
      lazyLoading?: Partial<LazyLoadingOptions>;
      enabled?: boolean;
    } = {}
  ) {
    this.logger = new Logger('ResourceManager');
    this.enabled = options.enabled ?? true;
    this.options = {
      unusedResourceThreshold: options.lazyLoading?.unusedResourceThreshold || 10000,
      clearCachesOnOptimize: options.lazyLoading?.clearCachesOnOptimize || true
    };
    
    // Initialize configurations with defaults merged with provided options
    this.cachingStrategy = { ...DEFAULT_CACHING_STRATEGY, ...options.caching };
    this.batchingOptions = { ...DEFAULT_BATCHING_OPTIONS, ...options.batching };
    this.lazyLoadingOptions = { ...DEFAULT_LAZY_LOADING_OPTIONS, ...options.lazyLoading };
    
    this.logger.info('Resource manager initialized', {
      enabled: this.enabled,
      cachingEnabled: this.cachingStrategy.enabled,
      batchingEnabled: this.batchingOptions.enabled,
      lazyLoadingEnabled: this.lazyLoadingOptions.enabled
    });
  }
  
  /**
   * Batch similar operations to reduce overhead
   */
  async batchOperation<T>(
    operation: string,
    args: any[],
    executor: (...args: any[]) => Promise<T>
  ): Promise<T> {
    if (!this.enabled || !this.batchingOptions.enabled || 
        !this.batchingOptions.operations.includes(operation)) {
      // If batching is disabled or operation is not batchable, execute directly
      return executor(...args);
    }
    
    return new Promise<T>((resolve, reject) => {
      // Create a batch operation
      const batchOperation: BatchOperation<T> = {
        id: `${operation}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        operation,
        args,
        resolve,
        reject,
        timestamp: Date.now()
      };
      
      // Add to the appropriate batch
      const batchKey = this.getBatchKey(operation, args);
      if (!this.batchOperationQueue.has(batchKey)) {
        this.batchOperationQueue.set(batchKey, []);
      }
      
      this.batchOperationQueue.get(batchKey)!.push(batchOperation);
      
      // Schedule batch execution if not already scheduled
      this.scheduleBatchExecution(operation, executor);
    });
  }
  
  /**
   * Schedule execution of a batch
   */
  private scheduleBatchExecution<T>(
    operation: string,
    executor: (...args: any[]) => Promise<T>
  ): void {
    // If a timeout is already set, do nothing
    if (this.batchTimeoutId !== null) {
      return;
    }
    
    // Schedule batch execution
    this.batchTimeoutId = setTimeout(() => {
      this.executeBatches(executor);
      this.batchTimeoutId = null;
    }, this.batchingOptions.batchTimeoutMs);
  }
  
  /**
   * Execute all pending batches
   */
  private async executeBatches<T>(executor: (...args: any[]) => Promise<T>): Promise<void> {
    // If no batches, do nothing
    if (this.batchOperationQueue.size === 0) {
      return;
    }
    
    // Copy the current batch queue and clear it
    const batches = new Map(this.batchOperationQueue);
    this.batchOperationQueue.clear();
    
    // Track batch execution
    const batchCount = batches.size;
    let operationCount = 0;
    
    // Execute each batch
    for (const [batchKey, operations] of batches) {
      operationCount += operations.length;
      
      try {
        // If only one operation, execute directly
        if (operations.length === 1) {
          const op = operations[0];
          try {
            const result = await executor(...op.args);
            op.resolve(result);
          } catch (error) {
            op.reject(error);
          }
          continue;
        }
        
        // Group operations by argument similarity to optimize
        const groupedOps = this.groupSimilarOperations(operations);
        
        // Execute each group
        for (const group of groupedOps) {
          try {
            // If the operation is known to be batchable, use specialized batch execution
            if (this.isBatchExecutable(group[0].operation)) {
              await this.executeBatchableOperations(group, executor);
            } else {
              // Otherwise execute each operation individually
              for (const op of group) {
                try {
                  const result = await executor(...op.args);
                  op.resolve(result);
                } catch (error) {
                  op.reject(error);
                }
              }
            }
          } catch (error) {
            // If batch execution fails, reject all operations in the group
            for (const op of group) {
              op.reject(error);
            }
          }
        }
      } catch (error) {
        // If anything fails at the batch level, reject all operations
        for (const op of operations) {
          op.reject(error);
        }
      }
    }
    
    // Update metrics
    this.totalBatchesSent += batchCount;
    this.totalBatchOperations += operationCount;
    
    // Log batch execution
    this.logger.info(`Executed ${batchCount} batches with ${operationCount} operations`);
  }
  
  /**
   * Group similar operations for efficient batching
   */
  private groupSimilarOperations<T>(operations: BatchOperation<T>[]): BatchOperation<T>[][] {
    // Use a simple approach: group by operation type
    const groups: Map<string, BatchOperation<T>[]> = new Map();
    
    for (const op of operations) {
      const key = op.operation;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(op);
    }
    
    return Array.from(groups.values());
  }
  
  /**
   * Check if an operation is executable in batch mode
   */
  private isBatchExecutable(operation: string): boolean {
    // These operations are known to have specialized batch execution
    return [
      'findElements',
      'getMultipleAttributes',
      'getMultipleProperties'
    ].includes(operation);
  }
  
  /**
   * Execute operations that have specialized batch execution
   */
  private async executeBatchableOperations<T>(
    operations: BatchOperation<T>[],
    executor: (...args: any[]) => Promise<T>
  ): Promise<void> {
    const operation = operations[0].operation;
    
    // Handle each operation type differently
    switch (operation) {
      case 'findElements':
        await this.executeFindElementsBatch(operations, executor);
        break;
        
      case 'getMultipleAttributes':
        await this.executeGetAttributesBatch(operations, executor);
        break;
        
      case 'getMultipleProperties':
        await this.executeGetPropertiesBatch(operations, executor);
        break;
        
      default:
        // For unknown batch operations, execute individually
        for (const op of operations) {
          try {
            const result = await executor(...op.args);
            op.resolve(result);
          } catch (error) {
            op.reject(error);
          }
        }
    }
  }
  
  /**
   * Execute a batch of findElements operations
   */
  private async executeFindElementsBatch<T>(
    operations: BatchOperation<T>[],
    executor: (...args: any[]) => Promise<T>
  ): Promise<void> {
    // Group by strategy to optimize
    const strategyGroups: Map<string, BatchOperation<T>[]> = new Map();
    
    for (const op of operations) {
      const strategy = op.args[0]; // First arg is strategy
      const key = String(strategy);
      
      if (!strategyGroups.has(key)) {
        strategyGroups.set(key, []);
      }
      
      strategyGroups.get(key)!.push(op);
    }
    
    // Execute each strategy group
    for (const [strategy, ops] of strategyGroups) {
      // For each strategy, create a combined selector
      const selectors = ops.map(op => op.args[1]); // Second arg is selector
      
      try {
        // Execute the batch find (would need implementation in ElementLocator)
        // For now, execute them individually as a fallback
        for (const op of ops) {
          try {
            const result = await executor(...op.args);
            op.resolve(result);
          } catch (error) {
            op.reject(error);
          }
        }
      } catch (error) {
        // If batch fails, reject all operations
        for (const op of ops) {
          op.reject(error);
        }
      }
    }
  }
  
  /**
   * Execute a batch of getAttribute operations
   */
  private async executeGetAttributesBatch<T>(
    operations: BatchOperation<T>[],
    executor: (...args: any[]) => Promise<T>
  ): Promise<void> {
    // Group by element to optimize
    const elementGroups: Map<string, BatchOperation<T>[]> = new Map();
    
    for (const op of operations) {
      const element = op.args[0]; // First arg is element
      const elementId = element?.toString() || 'null';
      
      if (!elementGroups.has(elementId)) {
        elementGroups.set(elementId, []);
      }
      
      elementGroups.get(elementId)!.push(op);
    }
    
    // Execute each element group
    for (const [_, ops] of elementGroups) {
      // If no element or only one attribute, execute directly
      if (ops.length <= 1) {
        for (const op of ops) {
          try {
            const result = await executor(...op.args);
            op.resolve(result);
          } catch (error) {
            op.reject(error);
          }
        }
        continue;
      }
      
      const element = ops[0].args[0]; // Get the element from first operation
      const attributes = ops.map(op => op.args[1]); // Second arg is attribute name
      
      try {
        // Execute the batch getAttribute (would need implementation in WebdriverIO)
        // For now, execute them individually as a fallback
        for (const op of ops) {
          try {
            const result = await executor(...op.args);
            op.resolve(result);
          } catch (error) {
            op.reject(error);
          }
        }
      } catch (error) {
        // If batch fails, reject all operations
        for (const op of ops) {
          op.reject(error);
        }
      }
    }
  }
  
  /**
   * Execute a batch of getProperty operations
   */
  private async executeGetPropertiesBatch<T>(
    operations: BatchOperation<T>[],
    executor: (...args: any[]) => Promise<T>
  ): Promise<void> {
    // Similar to attributes, but for properties
    await this.executeGetAttributesBatch(operations, executor);
  }
  
  /**
   * Get a key for batch operations based on operation and args
   */
  private getBatchKey(operation: string, args: any[]): string {
    // Create a key based on operation type and first arg (usually the most significant)
    return `${operation}_${args[0]}`;
  }
  
  /**
   * Track resource usage
   */
  trackResourceUsage(
    type: string,
    id: string,
    metadata?: Record<string, any>
  ): void {
    if (!this.enabled || !this.lazyLoadingOptions.enabled) {
      return;
    }
    
    const resourceKey = `${type}:${id}`;
    const now = Date.now();
    
    // Get or create resource reference
    const reference = this.resourceReferences.get(resourceKey) || {
      type,
      id,
      usageCount: 0,
      lastAccessed: now,
      size: metadata?.size || 0,
      metadata
    };
    
    // Update usage information
    reference.usageCount += 1;
    reference.lastAccessed = now;
    
    // Update metadata if provided
    if (metadata) {
      reference.metadata = { ...reference.metadata, ...metadata };
      if (metadata.size) {
        reference.size = metadata.size;
      }
    }
    
    // Store updated reference
    this.resourceReferences.set(resourceKey, reference);
    
    // Clear existing unload timeout if any
    const existingTimeout = this.unloadTimeouts.get(resourceKey);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      this.unloadTimeouts.delete(resourceKey);
    }
    
    // Schedule resource unloading
    const timeout = setTimeout(() => {
      this.unloadResource(resourceKey);
      this.unloadTimeouts.delete(resourceKey);
    }, this.lazyLoadingOptions.unloadThreshold);
    
    this.unloadTimeouts.set(resourceKey, timeout);
  }
  
  /**
   * Optimize memory usage by cleaning up unused resources
   */
  optimizeMemoryUsage(): number {
    if (!this.enabled) {
      return 0;
    }
    
    let unloadedCount = 0;
    const now = Date.now();
    const unusedThreshold = this.options.unusedResourceThreshold || 10000; // 10 seconds default

    // Unload resources that haven't been accessed recently
    for (const [resourceId, reference] of this.resourceReferences.entries()) {
      const timeSinceLastAccess = now - reference.lastAccessed;
      if (timeSinceLastAccess > unusedThreshold) {
        this.unloadResource(resourceId);
        unloadedCount++;
      }
    }

    // Clear caches if enabled
    if (this.options.clearCachesOnOptimize) {
      if (this.elementLocator) {
        this.elementLocator.clearCache();
      }
      if (this.stateManager) {
        this.stateManager.clearCache();
      }
    }

    this.totalResourcesUnloaded += unloadedCount;
    return unloadedCount;
  }
  
  /**
   * Unload a resource to free memory
   */
  private unloadResource(resourceId: string): void {
    const reference = this.resourceReferences.get(resourceId);
    if (!reference) {
      return;
    }

    // Perform type-specific unloading
    switch (reference.type) {
      case 'element':
        if (this.elementLocator) {
          this.elementLocator.clearCache(resourceId);
        }
        break;
      case 'state':
        if (this.stateManager) {
          this.stateManager.clearCache(resourceId);
        }
        break;
      case 'image':
        // Delete image file if it exists
        if (reference.metadata?.path) {
          try {
            fs.unlinkSync(reference.metadata.path);
          } catch (error) {
            this.logger.warn(`Failed to delete image file: ${error}`);
          }
        }
        break;
    }

    this.resourceReferences.delete(resourceId);
    if (this.statistics.resourcesByType[reference.type]) {
      this.statistics.resourcesByType[reference.type]--;
    }
    this.statistics.totalResourcesUnloaded++;
  }
  
  /**
   * Get resource usage statistics
   */
  getResourceUsage(): ResourceUsage {
    const memory = process.memoryUsage();
    
    // Count resources by type
    const resourceCounts: Record<string, number> = {};
    this.resourceReferences.forEach((ref) => {
      resourceCounts[ref.type] = (resourceCounts[ref.type] || 0) + 1;
    });
    
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
        active: this.batchOperationQueue.size,
        queued: Array.from(this.batchOperationQueue.values())
          .reduce((total, ops) => total + ops.length, 0),
        completed: this.totalBatchOperations
      },
      cache: {
        elementCacheSize: resourceCounts['element'] || 0,
        stateCacheSize: resourceCounts['state'] || 0,
        otherCacheSize: Object.values(resourceCounts)
          .reduce((total, count) => total + count, 0) - 
          (resourceCounts['element'] || 0) - 
          (resourceCounts['state'] || 0)
      }
    };
  }
  
  /**
   * Get statistics about resource manager performance
   */
  getStatistics(): ResourceUsage & {
    totalResourcesTracked: number;
    totalResourcesUnloaded: number;
  } {
    const memoryUsage = process.memoryUsage();
    return {
      memory: {
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        external: memoryUsage.external,
        arrayBuffers: memoryUsage.arrayBuffers
      },
      cpu: {
        user: process.cpuUsage().user,
        system: process.cpuUsage().system
      },
      operations: {
        totalOperations: this.totalBatchOperations,
        successfulOperations: this.totalCacheHits,
        failedOperations: this.totalCacheMisses
      },
      cache: {
        size: this.resourceReferences.size,
        hits: this.totalCacheHits,
        misses: this.totalCacheMisses,
        unloadedResources: this.totalResourcesUnloaded
      },
      totalResourcesTracked: this.resourceReferences.size,
      totalResourcesUnloaded: this.totalResourcesUnloaded
    };
  }
  
  /**
   * Enable or disable the resource manager
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.logger.info(`Resource manager ${enabled ? 'enabled' : 'disabled'}`);
  }
  
  /**
   * Configure caching behavior
   */
  configureCaching(options: Partial<CachingStrategy>): void {
    this.cachingStrategy = { ...this.cachingStrategy, ...options };
    this.logger.info('Updated caching configuration', this.cachingStrategy);
  }
  
  /**
   * Configure batching behavior
   */
  configureBatching(options: Partial<BatchingOptions>): void {
    this.batchingOptions = { ...this.batchingOptions, ...options };
    this.logger.info('Updated batching configuration', this.batchingOptions);
  }
  
  /**
   * Configure lazy loading behavior
   */
  configureLazyLoading(options: Partial<LazyLoadingOptions>): void {
    this.lazyLoadingOptions = { ...this.lazyLoadingOptions, ...options };
    this.logger.info('Updated lazy loading configuration', this.lazyLoadingOptions);
  }
  
  /**
   * Check if the resource manager is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
  
  /**
   * Clear all resources and reset statistics
   */
  reset(): void {
    // Clear resource tracking
    this.resourceReferences.clear();
    
    // Clear all timeouts
    this.unloadTimeouts.forEach(timeout => clearTimeout(timeout));
    this.unloadTimeouts.clear();
    
    // Clear batch operations
    if (this.batchTimeoutId) {
      clearTimeout(this.batchTimeoutId);
      this.batchTimeoutId = null;
    }
    
    // Resolve any pending operations with an error
    this.batchOperationQueue.forEach(operations => {
      operations.forEach(op => {
        op.reject(new Error('Resource manager reset'));
      });
    });
    this.batchOperationQueue.clear();
    
    // Reset statistics
    this.totalBatchesSent = 0;
    this.totalBatchOperations = 0;
    this.totalCacheHits = 0;
    this.totalCacheMisses = 0;
    this.totalResourcesUnloaded = 0;
    
    this.logger.info('Resource manager reset');
  }
} 