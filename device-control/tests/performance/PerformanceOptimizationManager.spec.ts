import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { PerformanceOptimizationManager } from '../../src/performance/PerformanceOptimizationManager';
import { ElementLocator } from '../../src/element/ElementLocator';
import { UIStateCaptureManager } from '../../src/state/UIStateCaptureManager';
import { AppControlActions } from '../../src/actions/AppControlActions';
import { MetricCategory } from '../../src/types/performance';

jest.mock('../../src/utils/Logger');
jest.mock('../../src/element/ElementLocator');
jest.mock('../../src/state/UIStateCaptureManager');
jest.mock('../../src/actions/AppControlActions');

describe('PerformanceOptimizationManager', () => {
  let manager: PerformanceOptimizationManager;
  let mockElementLocator: jest.Mocked<ElementLocator>;
  let mockStateManager: jest.Mocked<UIStateCaptureManager>;
  let mockAppActions: jest.Mocked<AppControlActions>;

  beforeEach(() => {
    jest.useFakeTimers();
    mockElementLocator = {
      clearCache: jest.fn(),
      invalidateCacheEntries: jest.fn()
    } as unknown as jest.Mocked<ElementLocator>;

    mockStateManager = {
      clearCache: jest.fn()
    } as unknown as jest.Mocked<UIStateCaptureManager>;

    mockAppActions = {
      DEFAULT_TIMEOUT: 30000,
      DEFAULT_RETRIES: 3,
      launchApp: jest.fn(),
      terminateApp: jest.fn(),
      resetApp: jest.fn(),
      restartApp: jest.fn(),
      isAppInstalled: jest.fn(),
      installApp: jest.fn(),
      removeApp: jest.fn(),
      activateApp: jest.fn(),
      backgroundApp: jest.fn()
    } as unknown as jest.Mocked<AppControlActions>;

    manager = new PerformanceOptimizationManager(
      mockElementLocator,
      mockAppActions,
      mockStateManager
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with default settings', () => {
      expect(manager).toBeDefined();
      expect(manager.isEnabled()).toBe(true);
    });

    it('should initialize with custom options', () => {
      const customManager = new PerformanceOptimizationManager(
        mockElementLocator,
        mockAppActions,
        mockStateManager,
        {
          enabled: false,
          autoOptimize: true,
          autoOptimizeInterval: 60000
        }
      );
      expect(customManager.isEnabled()).toBe(false);
    });
  });

  describe('operation tracking', () => {
    it('should track operation performance', async () => {
      const operation = jest.fn<() => Promise<string>>().mockResolvedValue('success');
      const result = await manager.trackOperation<string>(
        'testOperation',
        MetricCategory.UI_ACTION,
        operation
      );

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalled();
    });

    it('should track operation with metadata', async () => {
      const operation = jest.fn<() => Promise<string>>().mockResolvedValue('success');
      const metadata = { testId: '123' };

      await manager.trackOperation<string>(
        'testOperation',
        MetricCategory.UI_ACTION,
        operation,
        metadata
      );

      expect(operation).toHaveBeenCalled();
    });
  });

  describe('auto-optimization', () => {
    it('should start auto-optimization when enabled', () => {
      manager.startAutoOptimization();
      jest.advanceTimersByTime(1000);

      const stats = manager.getOptimizationStats();
      expect(stats.autoOptimization.enabled).toBe(true);
    });

    it('should stop auto-optimization when disabled', () => {
      manager.startAutoOptimization();
      manager.stopAutoOptimization();

      const stats = manager.getOptimizationStats();
      expect(stats.autoOptimization.enabled).toBe(false);
    });
  });

  describe('optimization statistics', () => {
    it('should provide optimization statistics', () => {
      const stats = manager.getOptimizationStats();
      expect(stats.performance).toBeDefined();
      expect(stats.resources).toBeDefined();
      expect(stats.autoOptimization).toBeDefined();
      expect(stats.errors).toBeDefined();
      
      expect(stats.performance.trackedOperations).toBe(0);
      expect(stats.performance.baselines).toBe(0);
      expect(stats.performance.categories).toEqual({});
      
      expect(stats.autoOptimization.enabled).toBe(false);
      expect(stats.autoOptimization.interval).toBe(30000);
      expect(stats.autoOptimization.lastRun).toBe(0);
      
      expect(stats.errors.totalErrors).toBe(0);
      expect(stats.errors.recoveryAttempts).toBe(0);
      expect(stats.errors.successfulRecoveries).toBe(0);
      expect(stats.errors.errorTrends).toEqual([]);
    });
  });
}); 