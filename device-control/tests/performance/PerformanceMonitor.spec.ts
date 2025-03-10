import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { PerformanceMonitor } from '../../src/performance/PerformanceMonitor';
import { MetricCategory } from '../../src/types/performance';

jest.mock('../../src/utils/Logger');

describe('PerformanceMonitor', () => {
  let performanceMonitor: PerformanceMonitor;

  beforeEach(() => {
    jest.useFakeTimers();
    performanceMonitor = new PerformanceMonitor();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with default settings', () => {
      expect(performanceMonitor).toBeDefined();
    });

    it('should initialize with custom thresholds', () => {
      const monitor = new PerformanceMonitor({
        thresholds: {
          minorDeviation: 10,
          moderateDeviation: 20,
          severeDeviation: 30
        }
      });
      expect(monitor).toBeDefined();
    });
  });

  describe('operation tracking', () => {
    it('should track successful operation', async () => {
      const operation = jest.fn<() => Promise<string>>().mockResolvedValue('success');
      const result = await performanceMonitor.trackOperation<string>(
        'testOperation',
        MetricCategory.UI_ACTION,
        operation
      );

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalled();
      const metrics = performanceMonitor.getMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0].name).toBe('testOperation');
      expect(metrics[0].category).toBe(MetricCategory.UI_ACTION);
      expect(metrics[0].success).toBe(true);
    });

    it('should track failed operation', async () => {
      const error = new Error('test error');
      const operation = jest.fn<() => Promise<string>>().mockRejectedValue(error);

      await expect(performanceMonitor.trackOperation<string>(
        'failedOperation',
        MetricCategory.UI_ACTION,
        operation
      )).rejects.toThrow(error);

      const metrics = performanceMonitor.getMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0].name).toBe('failedOperation');
      expect(metrics[0].success).toBe(false);
    });

    it('should track operation with metadata', async () => {
      const metadata = { testId: '123', priority: 'high' };
      const operation = jest.fn<() => Promise<string>>().mockResolvedValue('success');

      await performanceMonitor.trackOperation<string>(
        'metadataOperation',
        MetricCategory.UI_ACTION,
        operation,
        metadata
      );

      const metrics = performanceMonitor.getMetrics();
      expect(metrics[0].metadata).toEqual(metadata);
    });
  });

  describe('baseline management', () => {
    // TODO: Implement baseline generation
    // it('should generate baselines from metrics', async () => {
    //   const operation = jest.fn<() => Promise<string>>().mockResolvedValue('success');
      
    //   // Create multiple samples
    //   for (let i = 0; i < 5; i++) {
    //     await performanceMonitor.trackOperation<string>(
    //       'baselineOperation',
    //       MetricCategory.UI_ACTION,
    //       operation
    //     );
    //   }

    //   const baselines = performanceMonitor.generateBaselines({
    //     minimumSamples: 3
    //   });

    //   expect(baselines).toHaveLength(1);
    //   expect(baselines[0].operationName).toBe('baselineOperation');
    //   expect(baselines[0].category).toBe(MetricCategory.UI_ACTION);
    //   expect(baselines[0].expectedDuration).toBeGreaterThan(0);
    // });

    it('should detect performance regressions', async () => {
      const fastOperation = jest.fn<() => Promise<string>>().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('success'), 10))
      );
      const slowOperation = jest.fn<() => Promise<string>>().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('success'), 100))
      );

      // Create baseline with fast operations
      for (let i = 0; i < 3; i++) {
        const promise = performanceMonitor.trackOperation<string>(
          'regressionTest',
          MetricCategory.UI_ACTION,
          fastOperation
        );
        jest.advanceTimersByTime(10);
        await promise;
      }

      const baselines = performanceMonitor.generateBaselines({
        minimumSamples: 3,
        tolerancePercentage: 50
      });

      // Test with slow operation
      const promise = performanceMonitor.trackOperation<string>(
        'regressionTest',
        MetricCategory.UI_ACTION,
        slowOperation
      );
      jest.advanceTimersByTime(100);
      await promise;

      const regressions = performanceMonitor.detectRegressions();
      expect(regressions.length).toBeGreaterThan(0);
      expect(regressions[0].isRegression).toBe(true);
      expect(regressions[0].operationName).toBe('regressionTest');
    }, 20000);
  });

  describe('performance reporting', () => {
    it('should generate performance report', async () => {
      const operation = jest.fn<() => Promise<string>>().mockResolvedValue('success');

      // Track multiple operations
      await performanceMonitor.trackOperation<string>(
        'reportOperation1',
        MetricCategory.UI_ACTION,
        operation
      );
      await performanceMonitor.trackOperation<string>(
        'reportOperation2',
        MetricCategory.ELEMENT_LOCATION,
        operation
      );

      const report = performanceMonitor.generatePerformanceReport();
      expect(report.totalOperations).toBe(2);
      expect(report.operationCounts).toBeDefined();
      expect(report.categoryCounts).toBeDefined();
      expect(report.summaries).toHaveLength(2);
    });

    it('should filter report by category', async () => {
      const operation = jest.fn<() => Promise<string>>().mockResolvedValue('success');

      await performanceMonitor.trackOperation<string>(
        'uiOperation',
        MetricCategory.UI_ACTION,
        operation
      );
      await performanceMonitor.trackOperation<string>(
        'elementOperation',
        MetricCategory.ELEMENT_LOCATION,
        operation
      );

      const report = performanceMonitor.generatePerformanceReport({
        categories: [MetricCategory.UI_ACTION]
      });

      expect(report.totalOperations).toBe(1);
      expect(report.summaries[0].category).toBe(MetricCategory.UI_ACTION);
    });
  });

  describe('resource monitoring', () => {
    it('should track resource usage', () => {
      const usage = performanceMonitor.getResourceUsage();
      expect(usage.memory).toBeDefined();
      expect(usage.cpu).toBeDefined();
      expect(usage.operations).toBeDefined();
      expect(usage.cache).toBeDefined();
    });
  });

  describe('monitor management', () => {
    it('should clear metrics', async () => {
      const operation = jest.fn<() => Promise<string>>().mockResolvedValue('success');
      await performanceMonitor.trackOperation<string>(
        'clearTest',
        MetricCategory.UI_ACTION,
        operation
      );

      performanceMonitor.clearMetrics();
      expect(performanceMonitor.getMetrics()).toHaveLength(0);
    });

    it('should clear baselines', async () => {
      const operation = jest.fn<() => Promise<string>>().mockResolvedValue('success');
      
      // Create baseline
      for (let i = 0; i < 3; i++) {
        await performanceMonitor.trackOperation<string>(
          'baselineClearTest',
          MetricCategory.UI_ACTION,
          operation
        );
      }

      performanceMonitor.generateBaselines({ minimumSamples: 3 });
      performanceMonitor.clearBaselines();
      expect(performanceMonitor.getBaselines()).toHaveLength(0);
    });

    it('should enable and disable monitoring', async () => {
      const operation = jest.fn<() => Promise<string>>().mockResolvedValue('success');
      
      performanceMonitor.setEnabled(false);
      await performanceMonitor.trackOperation<string>(
        'disabledTest',
        MetricCategory.UI_ACTION,
        operation
      );

      expect(performanceMonitor.getMetrics()).toHaveLength(0);

      performanceMonitor.setEnabled(true);
      await performanceMonitor.trackOperation<string>(
        'enabledTest',
        MetricCategory.UI_ACTION,
        operation
      );

      expect(performanceMonitor.getMetrics()).toHaveLength(1);
    });
  });
}); 