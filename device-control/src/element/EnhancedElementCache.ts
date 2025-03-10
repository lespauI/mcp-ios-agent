import { ElementLocatorStrategy } from '../types';
import { ElementCacheOptions } from '../types';
import { Logger } from '../utils/Logger';
import { RedisCacheAdapter, ElementCacheData } from './RedisCacheAdapter';
import { MemoryManager, MemoryEventType } from '../utils/MemoryManager';

/**
 * Cache entry structure for storing elements with metadata
 */
interface ElementCacheEntry {
  element: WebdriverIO.Element;
  timestamp: number;
  strategy: ElementLocatorStrategy;
  selector: string;
  parent?: WebdriverIO.Element;
  children?: Set<string>;
  metadata?: Record<string, any>;
}

/**
 * Configuration for preloading related elements
 */
export interface PreloadOptions {
  relatedSelectors?: Array<{
    strategy: ElementLocatorStrategy;
    selector: string;
    childSelector?: string;
  }>;
  preloadDepth?: number;
  context?: string;
}

/**
 * Enhanced element cache with hierarchical caching, intelligent invalidation,
 * and preloading strategies
 */
export class EnhancedElementCache {
  private elementCache: Map<string, ElementCacheEntry> = new Map();
  private logger = new Logger('EnhancedElementCache');
  private accessibilityIdIndex: Map<string, string> = new Map();
  private elementTypeIndex: Map<string, Set<string>> = new Map();
  private parentChildIndex: Map<string, Set<string>> = new Map();
  private options: ElementCacheOptions;
  private cacheMaintenanceTimer: NodeJS.Timeout | null = null;
  private readonly CACHE_KEY_SEPARATOR = '::';
  
  // Redis integration
  private redisCacheAdapter: RedisCacheAdapter | null = null;
  private useRedis: boolean = false;
  
  // Memory management
  private memoryManager: MemoryManager;
  private memoryListenersRegistered: boolean = false;

  /**
   * Default cache options
   */
  private readonly DEFAULT_OPTIONS: ElementCacheOptions = {
    enabled: true,
    ttl: 60000, // 1 minute
    maxEntries: 500,
    preloadDepth: 1,
    pruneInterval: 30000, // 30 seconds
  };
  
  constructor(
    private driver: WebdriverIO.Browser,
    options: Partial<ElementCacheOptions> = {}
  ) {
    this.options = {
      ...this.DEFAULT_OPTIONS,
      ...options,
    };
    
    // Initialize Redis if enabled
    this.useRedis = this.options.useRedis || false;
    if (this.useRedis) {
      this.initializeRedisCache();
    }
    
    // Get memory manager instance
    this.memoryManager = MemoryManager.getInstance();
    
    // Register memory event listeners
    if (this.options.memoryManagement?.enabled) {
      this.registerMemoryEventListeners();
    }
    
    this.setupCacheMaintenance();
    this.logger.info('EnhancedElementCache initialized', { options: this.options });
  }
  
  /**
   * Register memory event listeners to respond to memory pressure
   */
  private registerMemoryEventListeners(): void {
    if (this.memoryListenersRegistered) {
      return;
    }
    
    // Listen for warning memory events
    this.memoryManager.on(MemoryEventType.WARNING, () => {
      this.logger.warn('Memory pressure detected (WARNING), optimizing element cache');
      this.optimizeCache();
    });
    
    // Listen for critical memory events
    this.memoryManager.on(MemoryEventType.CRITICAL, () => {
      this.logger.warn('Memory pressure detected (CRITICAL), aggressively pruning element cache');
      this.pruneCache(this.options.memoryManagement?.pruneThreshold || 30);
    });
    
    // Listen for action needed memory events
    this.memoryManager.on(MemoryEventType.ACTION_NEEDED, () => {
      this.logger.warn('Memory pressure detected (ACTION_NEEDED), aggressively pruning element cache');
      this.pruneCache(this.options.memoryManagement?.aggressivePruneThreshold || 50);
    });
    
    // Listen for memory release requests
    this.memoryManager.on('memory:release_requested', () => {
      this.logger.info('Memory release requested, clearing non-essential elements from cache');
      this.pruneCache(this.options.memoryManagement?.aggressivePruneThreshold || 50);
    });
    
    this.memoryListenersRegistered = true;
    this.logger.info('Memory event listeners registered');
  }
  
  /**
   * Optimize cache by removing unused elements
   */
  private optimizeCache(): void {
    const now = Date.now();
    const ttlThreshold = now - (this.options.ttl / 2); // Remove elements that are half-way to expiration
    let removedCount = 0;
    
    // Find elements that haven't been accessed recently
    for (const [key, entry] of this.elementCache.entries()) {
      if (entry.timestamp < ttlThreshold) {
        this.removeFromCache(key);
        removedCount++;
      }
    }
    
    this.logger.info(`Optimized element cache, removed ${removedCount} elements`);
  }
  
  /**
   * Initialize Redis cache adapter
   */
  private async initializeRedisCache(): Promise<void> {
    try {
      this.logger.info('Initializing Redis cache adapter');
      this.redisCacheAdapter = new RedisCacheAdapter({
        url: this.options.redisOptions?.url,
        prefix: this.options.redisOptions?.prefix || 'element:',
        ttl: this.options.ttl / 1000, // Convert ms to seconds for Redis
        connectionOptions: this.options.redisOptions?.connectionOptions,
        memoryManagement: {
          enabled: this.options.memoryManagement?.enabled || true,
          pruneOnMemoryPressure: true,
          pruneThreshold: this.options.memoryManagement?.pruneThreshold || 30
        }
      });
      
      await this.redisCacheAdapter.initialize();
      this.logger.info('Redis cache adapter initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Redis cache, falling back to in-memory cache', { error });
      this.useRedis = false;
      this.redisCacheAdapter = null;
    }
  }
  
  /**
   * Set up periodic cache maintenance
   */
  private setupCacheMaintenance(): void {
    if (this.cacheMaintenanceTimer) {
      clearInterval(this.cacheMaintenanceTimer);
    }
    
    // Run cache maintenance every minute
    this.cacheMaintenanceTimer = setInterval(() => {
      this.pruneCache();
    }, 60000);
  }
  
  /**
   * Generate a cache key from strategy and selector
   */
  private getCacheKey(strategy: ElementLocatorStrategy, selector: string): string {
    return `${strategy}${this.CACHE_KEY_SEPARATOR}${selector}`;
  }
  
  /**
   * Parse a cache key into strategy and selector
   */
  private parseCacheKey(cacheKey: string): { strategy: ElementLocatorStrategy; selector: string } {
    const [strategy, selector] = cacheKey.split(this.CACHE_KEY_SEPARATOR, 2);
    return {
      strategy: strategy as ElementLocatorStrategy,
      selector
    };
  }
  
  /**
   * Cache an element with parent-child relationship tracking
   * 
   * @param strategy Element locator strategy
   * @param selector Element selector
   * @param element Element instance to cache
   * @param parent Optional parent element
   * @param metadata Optional metadata for the element
   */
  async cacheElement(
    strategy: ElementLocatorStrategy,
    selector: string,
    element: WebdriverIO.Element,
    parent?: WebdriverIO.Element,
    metadata?: Record<string, any>
  ): Promise<void> {
    const cacheKey = this.getCacheKey(strategy, selector);
    
    // Check if element is already cached
    if (this.elementCache.has(cacheKey)) {
      // Update last used timestamp
      const cachedEntry = this.elementCache.get(cacheKey)!;
      cachedEntry.timestamp = Date.now();
      this.elementCache.set(cacheKey, cachedEntry);
      return;
    }
    
    // Create cache entry
    const entry: ElementCacheEntry = {
      element,
      timestamp: Date.now(),
      strategy,
      selector,
      metadata: metadata || {},
    };
    
    // Add parent reference if provided
    if (parent) {
      try {
        const parentKey = await this.findCacheKeyForElement(parent);
        if (parentKey) {
          entry.parent = parent;
          
          // Update parent's children set
          if (!this.parentChildIndex.has(parentKey)) {
            this.parentChildIndex.set(parentKey, new Set());
          }
          this.parentChildIndex.get(parentKey)!.add(cacheKey);
        }
      } catch (error) {
        this.logger.warn('Failed to establish parent-child relationship', { error });
      }
    }
    
    // Add to cache
    this.elementCache.set(cacheKey, entry);
    
    // Add to indices
    try {
      // Index by accessibility ID if available
      try {
        const accessibilityId = await element.getAttribute('accessibilityId');
        if (accessibilityId) {
          this.accessibilityIdIndex.set(accessibilityId, cacheKey);
        }
      } catch (error) {
        // Ignore attribute errors
      }
      
      // Index by element type
      try {
        const tagName = await element.getTagName();
        if (tagName) {
          if (!this.elementTypeIndex.has(tagName)) {
            this.elementTypeIndex.set(tagName, new Set());
          }
          this.elementTypeIndex.get(tagName)!.add(cacheKey);
        }
      } catch (error) {
        // Ignore tag name errors
      }
    } catch (error) {
      this.logger.warn('Failed to index element in cache', { error });
    }
    
    // Store in Redis if enabled
    if (this.useRedis && this.redisCacheAdapter) {
      try {
        const redisData: ElementCacheData = {
          elementId: element.elementId,
          timestamp: entry.timestamp,
          lastAccessed: Date.now(),
          strategy,
          selector,
          parent: entry.parent ? (await this.findCacheKeyForElement(entry.parent) || undefined) : undefined,
          children: entry.children ? Array.from(entry.children) : undefined,
          metadata: entry.metadata
        };
        
        await this.redisCacheAdapter.setElement(cacheKey, redisData);
      } catch (error) {
        this.logger.error('Failed to store element in Redis cache', { error });
      }
    }
  }
  
  /**
   * Find the cache key for an element that's already in the cache
   */
  private async findCacheKeyForElement(element: WebdriverIO.Element): Promise<string | null> {
    for (const [cacheKey, entry] of this.elementCache.entries()) {
      if (entry.element === element) {
        return cacheKey;
      }
    }
    
    return null;
  }
  
  /**
   * Get element from cache if it exists and is still valid
   * 
   * @param strategy Element locator strategy
   * @param selector Element selector
   * @returns Cached element or null if not found or invalid
   */
  async getCachedElement(
    strategy: ElementLocatorStrategy,
    selector: string
  ): Promise<WebdriverIO.Element | null> {
    const cacheKey = this.getCacheKey(strategy, selector);
    
    // Check in-memory cache first
    if (this.elementCache.has(cacheKey)) {
      const entry = this.elementCache.get(cacheKey)!;
      
      // Check if entry is expired
      if (Date.now() - entry.timestamp > this.options.ttl) {
        this.removeFromCache(cacheKey);
        return null;
      }
      
      // Update timestamp
      entry.timestamp = Date.now();
      return entry.element;
    }
    
    // Check Redis cache if enabled
    if (this.useRedis && this.redisCacheAdapter) {
      try {
        const redisData = await this.redisCacheAdapter.getElement(cacheKey);
        if (redisData) {
          this.logger.debug('Retrieved element from Redis cache', { cacheKey });
          
          // We need to re-query the element using its elementId
          // This is because WebdriverIO.Element objects can't be serialized
          try {
            // Find the element by ID
            const element = await (this.driver as any).$(
              `[data-element-id="${redisData.elementId}"]`
            );
            
            // Cache it in memory too
            const entry: ElementCacheEntry = {
              element,
              timestamp: Date.now(),
              strategy: redisData.strategy,
              selector: redisData.selector,
              parent: redisData.parent ? (await this.getCachedElement('id', redisData.parent) || undefined) : undefined,
              metadata: redisData.metadata || {},
            };
            
            // Set up children if available
            if (redisData.children && redisData.children.length > 0) {
              entry.children = new Set(redisData.children);
            }
            
            this.elementCache.set(cacheKey, entry);
            return element;
          } catch (error) {
            this.logger.warn('Failed to re-query element from Redis cache data', { error });
            
            // Remove it from Redis since it's no longer valid
            await this.redisCacheAdapter.removeElement(cacheKey);
            return null;
          }
        }
      } catch (error) {
        this.logger.error('Error retrieving element from Redis cache', { error });
      }
    }
    
    return null;
  }
  
  /**
   * Get a cached element by its accessibility ID
   * 
   * @param accessibilityId The accessibility ID to look for
   * @returns The cached element or null if not found
   */
  async getElementByAccessibilityId(accessibilityId: string): Promise<WebdriverIO.Element | null> {
    if (!this.options.enabled || !accessibilityId) {
      return null;
    }
    
    const cacheKey = this.accessibilityIdIndex.get(accessibilityId);
    if (!cacheKey) {
      return null;
    }
    
    const { strategy, selector } = this.parseCacheKey(cacheKey);
    return this.getCachedElement(strategy, selector);
  }
  
  /**
   * Get all cached elements of a specific type
   * 
   * @param elementType Element type/tag name
   * @returns Array of cached elements of the specified type
   */
  getCachedElementsByType(elementType: string): WebdriverIO.Element[] {
    if (!this.options.enabled || !this.elementTypeIndex.has(elementType)) {
      return [];
    }
    
    const elements: WebdriverIO.Element[] = [];
    const cacheKeys = this.elementTypeIndex.get(elementType)!;
    
    for (const cacheKey of cacheKeys) {
      const entry = this.elementCache.get(cacheKey);
      if (entry) {
        elements.push(entry.element);
      }
    }
    
    return elements;
  }
  
  /**
   * Invalidate cache based on a pattern
   * 
   * @param pattern Regular expression to match against cache keys
   */
  async invalidateCache(pattern: RegExp): Promise<void> {
    if (!this.options.enabled) {
      return;
    }
    
    const keysToRemove: string[] = [];
    
    // Find all keys matching the pattern
    for (const [cacheKey, entry] of this.elementCache.entries()) {
      const fullKey = `${entry.strategy}:${entry.selector}`;
      if (pattern.test(fullKey)) {
        keysToRemove.push(cacheKey);
      }
    }
    
    // Create a set to track all keys to remove (including children)
    const allKeysToRemove = new Set<string>();
    
    // Process each key and its children
    for (const key of keysToRemove) {
      this.collectKeyAndChildren(key, allKeysToRemove);
    }
    
    // Remove all collected keys
    for (const key of allKeysToRemove) {
      this.removeFromCache(key);
    }
    
    this.logger.info(`Invalidated ${allKeysToRemove.size} cache entries matching pattern`, { pattern });
  }
  
  /**
   * Recursively collect a key and all its children
   */
  private collectKeyAndChildren(key: string, result: Set<string>): void {
    if (result.has(key)) {
      return;
    }
    
    // Add the key itself
    result.add(key);
    
    // Add all children
    const children = this.parentChildIndex.get(key);
    if (children) {
      for (const childKey of children) {
        this.collectKeyAndChildren(childKey, result);
      }
    }
  }
  
  /**
   * Remove an entry from the cache and all indexes
   */
  private removeFromCache(cacheKey: string): void {
    const entry = this.elementCache.get(cacheKey);
    if (!entry) {
      return;
    }
    
    // Remove from element cache
    this.elementCache.delete(cacheKey);
    
    // Remove from accessibility ID index
    for (const [accessibilityId, key] of this.accessibilityIdIndex.entries()) {
      if (key === cacheKey) {
        this.accessibilityIdIndex.delete(accessibilityId);
        break;
      }
    }
    
    // Remove from element type index
    for (const [elementType, keys] of this.elementTypeIndex.entries()) {
      if (keys.has(cacheKey)) {
        keys.delete(cacheKey);
        if (keys.size === 0) {
          this.elementTypeIndex.delete(elementType);
        }
        break;
      }
    }
    
    // Remove from parent-child index
    for (const [parentKey, children] of this.parentChildIndex.entries()) {
      if (children.has(cacheKey)) {
        children.delete(cacheKey);
        if (children.size === 0) {
          this.parentChildIndex.delete(parentKey);
        }
      }
    }
    
    // If this entry was a parent, clear its entries in the parent-child index
    this.parentChildIndex.delete(cacheKey);
  }
  
  /**
   * Clear the entire element cache
   */
  clearCache(): void {
    this.elementCache.clear();
    this.accessibilityIdIndex.clear();
    this.elementTypeIndex.clear();
    this.parentChildIndex.clear();
    
    // Clear Redis cache if enabled
    if (this.useRedis && this.redisCacheAdapter) {
      this.redisCacheAdapter.clearAll().catch(error => {
        this.logger.error('Failed to clear Redis cache', { error });
      });
    }
    
    this.logger.info('Element cache cleared');
  }
  
  /**
   * Preload elements based on a selector and context
   * 
   * @param strategy Element locator strategy
   * @param selector Element selector
   * @param context Optional context to help with predicting which elements to preload
   */
  async preloadElements(
    strategy: ElementLocatorStrategy,
    selector: string,
    context?: string
  ): Promise<void> {
    if (!this.options.enabled) {
      return;
    }
    
    try {
      this.logger.debug(`Preloading elements for ${strategy}=${selector}`);
      
      // Find all matching elements
      const elements = await (this.driver as any).$$(this.formatSelector(strategy, selector));
      
      if (!elements.length) {
        this.logger.debug(`No elements found to preload for ${strategy}=${selector}`);
        return;
      }
      
      this.logger.debug(`Found ${elements.length} elements to preload`);
      
      // Cache each element
      for (let i = 0; i < elements.length; i++) {
        const element = elements[i];
        
        // Generate a more specific selector for indexing
        const specificSelector = `${selector}[${i}]`;
        
        // Cache with index-specific selector
        await this.cacheElement(strategy, specificSelector, element);
      }
    } catch (error) {
      this.logger.error(`Error preloading elements: ${error}`);
    }
  }
  
  /**
   * Preload related elements based on the primary element selector
   * 
   * @param strategy Element locator strategy for the primary element
   * @param selector Element selector for the primary element
   * @param options Options for preloading related elements
   */
  async preloadRelatedElements(
    strategy: ElementLocatorStrategy,
    selector: string,
    options: PreloadOptions
  ): Promise<void> {
    if (!this.options.enabled || !options.relatedSelectors || options.relatedSelectors.length === 0) {
      return;
    }
    
    try {
      this.logger.debug(`Preloading related elements for ${strategy}=${selector}`);
      
      // Process each related selector
      for (const relatedSelector of options.relatedSelectors) {
        // Find the related container element
        const containerElement = await (this.driver as any).$(
          this.formatSelector(relatedSelector.strategy, relatedSelector.selector)
        );
        
        // Cache the container
        await this.cacheElement(
          relatedSelector.strategy,
          relatedSelector.selector,
          containerElement
        );
        
        // If there's a child selector, find and cache child elements
        if (relatedSelector.childSelector) {
          const childElements = await containerElement.findElements('xpath', relatedSelector.childSelector);
          
          for (let i = 0; i < childElements.length; i++) {
            const childElement = childElements[i];
            const childSelector = `${relatedSelector.selector}${relatedSelector.childSelector}[${i}]`;
            
            // Cache child with parent relationship
            await this.cacheElement(
              'xpath',
              childSelector,
              childElement,
              containerElement
            );
          }
        }
      }
    } catch (error) {
      this.logger.error(`Error preloading related elements: ${error}`);
    }
  }
  
  /**
   * Prune the cache by removing a percentage of oldest elements
   * 
   * @param percentage Percentage of elements to remove (default: based on options)
   */
  private pruneCache(percentage?: number): void {
    const prunePercentage = percentage || 
      (this.options.memoryManagement?.pruneThreshold || 30);
    
    if (this.elementCache.size === 0) {
      return;
    }
    
    // Calculate how many elements to prune
    const elementsToPrune = Math.ceil(this.elementCache.size * (prunePercentage / 100));
    
    if (elementsToPrune <= 0) {
      return;
    }
    
    this.logger.info(`Pruning ${elementsToPrune} elements (${prunePercentage}% of ${this.elementCache.size} total elements)`);
    
    // Get all elements with their timestamps
    const elements: Array<{ key: string, timestamp: number }> = [];
    
    for (const [key, entry] of this.elementCache.entries()) {
      elements.push({
        key,
        timestamp: entry.timestamp
      });
    }
    
    // Sort by timestamp (oldest first)
    elements.sort((a, b) => a.timestamp - b.timestamp);
    
    // Remove the oldest elements
    const keysToRemove = elements.slice(0, elementsToPrune).map(item => item.key);
    
    for (const key of keysToRemove) {
      this.removeFromCache(key);
    }
    
    this.logger.info(`Pruned ${keysToRemove.length} oldest elements from cache`);
  }
  
  /**
   * Cleans up resources when the cache is no longer needed
   */
  async dispose(): Promise<void> {
    this.logger.info('Disposing element cache');
    
    // Clear maintenance timer
    if (this.cacheMaintenanceTimer) {
      clearInterval(this.cacheMaintenanceTimer);
      this.cacheMaintenanceTimer = null;
    }
    
    // Unregister memory event listeners
    if (this.memoryListenersRegistered) {
      this.memoryManager.removeAllListeners(MemoryEventType.WARNING);
      this.memoryManager.removeAllListeners(MemoryEventType.CRITICAL);
      this.memoryManager.removeAllListeners(MemoryEventType.ACTION_NEEDED);
      this.memoryManager.removeAllListeners('memory:release_requested');
      this.memoryListenersRegistered = false;
    }
    
    // Shutdown Redis adapter if used
    if (this.useRedis && this.redisCacheAdapter) {
      await this.redisCacheAdapter.shutdown();
      this.redisCacheAdapter = null;
    }
    
    // Clear all caches
    this.clearCache();
    
    this.logger.info('Element cache disposed');
  }

  /**
   * Format a selector based on strategy for WebdriverIO $ and $$ methods
   */
  private formatSelector(strategy: ElementLocatorStrategy, selector: string): string {
    // Special handling for accessibility ID
    if (strategy === 'accessibility id') {
      return `~${selector}`;
    }
    
    // Other selector types
    switch (strategy) {
      case 'id':
        return `#${selector}`;
      case 'class name':
        return `.${selector}`;
      case 'name':
        return `[name="${selector}"]`;
      case 'xpath':
        return selector; // xpath remains as is
      case 'css selector':
        return selector; // css selector remains as is
      default:
        return selector;
    }
  }
} 