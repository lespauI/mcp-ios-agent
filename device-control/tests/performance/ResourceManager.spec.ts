import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ResourceManager } from '../../src/performance/ResourceManager';
import { ElementLocator } from '../../src/element/ElementLocator';
import { UIStateCaptureManager } from '../../src/state/UIStateCaptureManager';

jest.mock('../../src/utils/Logger');
jest.mock('../../src/element/ElementLocator');
jest.mock('../../src/state/UIStateCaptureManager');

describe('ResourceManager', () => {
  let resourceManager: ResourceManager;
  let mockElementLocator: jest.Mocked<ElementLocator>;
  let mockStateManager: jest.Mocked<UIStateCaptureManager>;

  beforeEach(() => {
    jest.useFakeTimers();
    mockElementLocator = {
      clearCache: jest.fn(),
      invalidateCacheEntries: jest.fn()
    } as unknown as jest.Mocked<ElementLocator>;

    mockStateManager = {
      clearCache: jest.fn()
    } as unknown as jest.Mocked<UIStateCaptureManager>;

    resourceManager = new ResourceManager(
      mockElementLocator,
      mockStateManager,
      {
        unusedResourceThreshold: 10000 // 10 seconds
      }
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with default settings', () => {
      const manager = new ResourceManager();
      expect(manager).toBeDefined();
    });

    it('should initialize with custom options', () => {
      const manager = new ResourceManager(undefined, undefined, {
        caching: { ttl: 10000 },
        batching: { maxBatchSize: 20 },
        lazyLoading: { loadThreshold: 10 }
      });
      expect(manager).toBeDefined();
    });
  });

  describe('resource tracking', () => {
    it('should track resource usage', () => {
      const metadata = { size: 1000 };
      resourceManager.trackResourceUsage('element', 'test-id', metadata);

      const usage = resourceManager.getResourceUsage();
      expect(usage.cache.elementCacheSize).toBe(1);
    });

    it('should update existing resource reference', () => {
      const initialMetadata = { size: 1000 };
      const updatedMetadata = { size: 2000 };

      resourceManager.trackResourceUsage('element', 'test-id', initialMetadata);
      resourceManager.trackResourceUsage('element', 'test-id', updatedMetadata);

      const usage = resourceManager.getResourceUsage();
      expect(usage.cache.elementCacheSize).toBe(1);
    });

    it('should track multiple resource types', () => {
      resourceManager.trackResourceUsage('element', 'element-1');
      resourceManager.trackResourceUsage('state', 'state-1');
      resourceManager.trackResourceUsage('other', 'other-1');

      const usage = resourceManager.getResourceUsage();
      expect(usage.cache.elementCacheSize).toBe(1);
      expect(usage.cache.stateCacheSize).toBe(1);
      expect(usage.cache.otherCacheSize).toBe(1);
    });
  });

  describe('memory optimization', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    // TODO: Implement memory optimization
    // it('should unload unused resources', () => {
    //   resourceManager.trackResourceUsage('element', 'test-id');
      
    //   // Advance time beyond unload threshold
    //   jest.advanceTimersByTime(11000);

    //   const unloadedCount = resourceManager.optimizeMemoryUsage();
    //   expect(unloadedCount).toBe(1);
    //   expect(mockElementLocator.clearCache).toHaveBeenCalled();
    // });

    it('should not unload recently used resources', () => {
      resourceManager.trackResourceUsage('element', 'test-id');
      
      // Advance time but not beyond threshold
      jest.advanceTimersByTime(5000);

      const unloadedCount = resourceManager.optimizeMemoryUsage();
      expect(unloadedCount).toBe(0);
    });

    it('should clear element cache when optimizing memory', () => {
      resourceManager.optimizeMemoryUsage();
      expect(mockElementLocator.clearCache).toHaveBeenCalled();
    });

    it('should clear state cache when optimizing memory', () => {
      resourceManager.optimizeMemoryUsage();
      expect(mockStateManager.clearCache).toHaveBeenCalled();
    });
  });
    // TODO: Implement statistics tracking

  // describe('statistics tracking', () => {
    //   it('should track resource statistics', () => {
  //     resourceManager.trackResourceUsage('element', 'test-id');
      
  //     const stats = resourceManager.getStatistics();
  //     expect(stats.totalResourcesTracked).toBe(1);
  //     expect(stats.totalResourcesUnloaded).toBe(0);
  //   });

  //   it('should track unloaded resources', () => {
  //     resourceManager.trackResourceUsage('element', 'test-id');
  //     resourceManager.optimizeMemoryUsage();

  //     const stats = resourceManager.getStatistics();
  //     expect(stats.totalResourcesUnloaded).toBeGreaterThan(0);
  //   });
  // });

  describe('resource usage monitoring', () => {
    it('should provide resource usage metrics', () => {
      const usage = resourceManager.getResourceUsage();
      expect(usage.memory).toBeDefined();
      expect(usage.cpu).toBeDefined();
      expect(usage.operations).toBeDefined();
      expect(usage.cache).toBeDefined();
    });

    it('should track cache sizes correctly', () => {
      resourceManager.trackResourceUsage('element', 'element-1');
      resourceManager.trackResourceUsage('element', 'element-2');
      resourceManager.trackResourceUsage('state', 'state-1');

      const usage = resourceManager.getResourceUsage();
      expect(usage.cache.elementCacheSize).toBe(2);
      expect(usage.cache.stateCacheSize).toBe(1);
    });
  });

  describe('manager control', () => {
    it('should enable and disable resource management', () => {
      resourceManager.setEnabled(false);
      resourceManager.trackResourceUsage('element', 'test-id');

      const usage = resourceManager.getResourceUsage();
      expect(usage.cache.elementCacheSize).toBe(0);

      resourceManager.setEnabled(true);
      resourceManager.trackResourceUsage('element', 'test-id');

      const updatedUsage = resourceManager.getResourceUsage();
      expect(updatedUsage.cache.elementCacheSize).toBe(1);
    });

    it('should reset all resources and statistics', () => {
      resourceManager.trackResourceUsage('element', 'test-id');
      resourceManager.reset();

      const stats = resourceManager.getStatistics();
      expect(stats.totalResourcesTracked).toBe(0);
      expect(stats.totalResourcesUnloaded).toBe(0);
    });
  });
}); 