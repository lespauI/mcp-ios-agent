import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ErrorRecoveryManager } from '../../src/performance/ErrorRecoveryManager';
import { AppControlActions } from '../../src/actions/AppControlActions';
import { RecoveryStrategy } from '../../src/types/performance';
import { AppResetOptions, AppLaunchOptions, AppTerminateOptions } from '../../src/types';

// Mock Logger
jest.mock('../../src/utils/Logger');

describe('ErrorRecoveryManager', () => {
  let errorRecoveryManager: ErrorRecoveryManager;
  let mockAppActions: jest.Mocked<AppControlActions>;

  beforeEach(() => {
    mockAppActions = {
      resetApp: jest.fn().mockResolvedValue(undefined),
      restartApp: jest.fn().mockResolvedValue(undefined),
      launchApp: jest.fn().mockResolvedValue(undefined),
      terminateApp: jest.fn().mockResolvedValue(undefined),
      verifyAppState: jest.fn().mockResolvedValue(undefined),
      setBackgroundState: jest.fn().mockResolvedValue(undefined),
      verifyAppIdentity: jest.fn().mockResolvedValue(undefined),
      detectCrash: jest.fn().mockResolvedValue(undefined),
      getCurrentBundleId: jest.fn().mockResolvedValue('com.example.app')
    } as jest.Mocked<AppControlActions>;
    errorRecoveryManager = new ErrorRecoveryManager({}, mockAppActions);
  });

  describe('initialization', () => {
    it('should initialize with default settings', () => {
      const manager = new ErrorRecoveryManager({}, mockAppActions);
      expect(manager).toBeDefined();
      expect(manager.getErrorTrends()).toBeDefined();
    });

    it('should initialize with custom strategy', () => {
      const customStrategy: Partial<RecoveryStrategy> = {
        maxRetries: 5,
        retryDelay: 2000
      };
      const manager = new ErrorRecoveryManager(customStrategy, mockAppActions);
      expect(manager).toBeDefined();
    });

    it('should initialize with disabled state', () => {
      const manager = new ErrorRecoveryManager({}, mockAppActions);
      manager.disable();
      expect(manager).toBeDefined();
    });
  });

  describe('executeWithRecovery', () => {
    it('should execute successful operation without recovery', async () => {
      const operation = jest.fn<() => Promise<string>>()
        .mockResolvedValue('success');

      const result = await errorRecoveryManager.executeWithRecovery(operation);
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry failed operation', async () => {
      const error = new Error('test error');
      error.name = 'NoSuchElementError';
      const operation = jest.fn<() => Promise<string>>()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce('success');

      const result = await errorRecoveryManager.executeWithRecovery(operation);
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
      expect(mockAppActions.resetApp).toHaveBeenCalled();
    });

    it('should respect max retries', async () => {
      const error = new Error('test error');
      error.name = 'NoSuchElementError';
      const operation = jest.fn<() => Promise<string>>()
        .mockRejectedValue(error);

      await expect(errorRecoveryManager.executeWithRecovery(operation))
        .rejects.toThrow(error);
      expect(operation).toHaveBeenCalledTimes(4); // Initial + 3 retries
    });

    it('should handle custom recovery strategy', async () => {
      const error = new Error('test error');
      error.name = 'NoSuchElementError';
      const operation = jest.fn<() => Promise<string>>()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce('success');

      const customStrategy: Partial<RecoveryStrategy> = {
        maxRetries: 1,
        retryDelay: 100
      };

      const result = await errorRecoveryManager.executeWithRecovery(operation, {}, customStrategy);
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should execute recovery actions for specific error types', async () => {
      const error = new Error('test error');
      error.name = 'AppCrashError';
      const operation = jest.fn<() => Promise<string>>()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce('success');

      const result = await errorRecoveryManager.executeWithRecovery(operation);
      expect(result).toBe('success');
      expect(mockAppActions.launchApp).toHaveBeenCalled();
    });

    it('should handle errors during recovery action', async () => {
      const error = new Error('test error');
      error.name = 'AppCrashError';
      mockAppActions.launchApp.mockRejectedValueOnce(new Error('Recovery failed'));
      const operation = jest.fn<() => Promise<string>>()
        .mockRejectedValue(error);

      await expect(errorRecoveryManager.executeWithRecovery(operation))
        .rejects.toThrow('Recovery failed');
    });
  });

  describe('Error tracking', () => {
    it('should track error trends', async () => {
      const error = new Error('test error');
      error.name = 'TestError';
      const operation = jest.fn<() => Promise<string>>()
        .mockRejectedValue(error);

      await expect(errorRecoveryManager.executeWithRecovery(operation))
        .rejects.toThrow(error);

      const trends = errorRecoveryManager.getErrorTrends();
      const trend = trends.get('TestError');
      expect(trend).toBeDefined();
      expect(trend?.occurrences).toBe(4); // Initial + 3 retries
      expect(trend?.recoveryAttempts).toBe(3); // 3 retries
      expect(trend?.successfulRecoveries).toBe(0);
    }, 20000);

    it('should track multiple occurrences of the same error', async () => {
      const error = new Error('test error');
      error.name = 'TestError';
      const operation = jest.fn<() => Promise<string>>()
        .mockRejectedValue(error);

      await expect(errorRecoveryManager.executeWithRecovery(operation))
        .rejects.toThrow(error);
      await expect(errorRecoveryManager.executeWithRecovery(operation))
        .rejects.toThrow(error);

      const trends = errorRecoveryManager.getErrorTrends();
      const trend = trends.get('TestError');
      expect(trend).toBeDefined();
      expect(trend?.occurrences).toBe(8); // 2 * (Initial + 3 retries)
      expect(trend?.recoveryAttempts).toBe(6); // 2 * 3 retries
      expect(trend?.successfulRecoveries).toBe(0);
    }, 20000);
  });

  describe('Exponential backoff', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should apply exponential backoff between retries', async () => {
      const error = new Error('test error');
      error.name = 'TestError';
      const operation = jest.fn<() => Promise<string>>()
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');

      const promise = errorRecoveryManager.executeWithRecovery(operation);

      // First retry after 1000ms
      await jest.advanceTimersByTimeAsync(1000);

      // Second retry after 2000ms
      await jest.advanceTimersByTimeAsync(2000);

      // Third retry after 4000ms
      await jest.advanceTimersByTimeAsync(4000);

      const result = await promise;
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    }, 30000);
  });

  describe('error categorization', () => {
    it('should handle element errors', async () => {
      const error = new Error('test error');
      error.name = 'NoSuchElementError';
      const operation = jest.fn<() => Promise<string>>()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce('success');

      const result = await errorRecoveryManager.executeWithRecovery(operation);
      expect(result).toBe('success');
      expect(mockAppActions.resetApp).toHaveBeenCalled();
    });

    it('should handle timeout errors', async () => {
      const error = new Error('test error');
      error.name = 'TimeoutError';
      const operation = jest.fn<() => Promise<string>>()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce('success');

      const result = await errorRecoveryManager.executeWithRecovery(operation);
      expect(result).toBe('success');
      expect(mockAppActions.restartApp).toHaveBeenCalled();
    });

    it('should handle application errors', async () => {
      const error = new Error('test error');
      error.name = 'AppCrashError';
      const operation = jest.fn<() => Promise<string>>()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce('success');

      const result = await errorRecoveryManager.executeWithRecovery(operation);
      expect(result).toBe('success');
      expect(mockAppActions.launchApp).toHaveBeenCalled();
    });
  });
}); 