import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { MemoryManager, MemoryEventType } from '../../src/utils/MemoryManager';
import * as os from 'os';

// Mock os and process modules
jest.mock('os', () => ({
  totalmem: jest.fn()
}));

// Save original process.memoryUsage
const originalMemoryUsage = process.memoryUsage;

// Mock setInterval and clearInterval
const originalSetInterval = global.setInterval;
const originalClearInterval = global.clearInterval;

describe('MemoryManager', () => {
  let memoryManager: MemoryManager;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock process.memoryUsage
    process.memoryUsage = jest.fn().mockReturnValue({
      rss: 1024 * 1024 * 100, // 100 MB
      heapTotal: 1024 * 1024 * 50, // 50 MB
      heapUsed: 1024 * 1024 * 30, // 30 MB
      external: 1024 * 1024 * 10, // 10 MB
      arrayBuffers: 1024 * 1024 * 5 // 5 MB
    });
    
    // Mock os.totalmem
    (os.totalmem as jest.Mock).mockReturnValue(1024 * 1024 * 1024); // 1 GB
    
    // Mock setInterval and clearInterval
    global.setInterval = jest.fn().mockReturnValue(123);
    global.clearInterval = jest.fn();
    
    // Get singleton instance
    memoryManager = MemoryManager.getInstance();
    
    // Stop monitoring if it's running
    memoryManager.stopMonitoring();
    
    // Reset event listeners
    memoryManager.removeAllListeners();
  });
  
  afterEach(() => {
    // Restore original process.memoryUsage
    process.memoryUsage = originalMemoryUsage;
    
    // Restore original setInterval and clearInterval
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
    
    // Stop monitoring
    memoryManager.stopMonitoring();
  });
  
  it('should be a singleton', () => {
    // Act
    const instance1 = MemoryManager.getInstance();
    const instance2 = MemoryManager.getInstance();
    
    // Assert
    expect(instance1).toBe(instance2);
  });
  
  it('should get memory usage with percentage', () => {
    // Act
    const memoryUsage = memoryManager.getMemoryUsage();
    
    // Assert
    expect(memoryUsage.rss).toBe(1024 * 1024 * 100);
    expect(memoryUsage.heapTotal).toBe(1024 * 1024 * 50);
    expect(memoryUsage.heapUsed).toBe(1024 * 1024 * 30);
    expect(memoryUsage.external).toBe(1024 * 1024 * 10);
    expect(memoryUsage.arrayBuffers).toBe(1024 * 1024 * 5);
    expect(memoryUsage.percentage).toBe(9.765625); // (100MB / 1GB) * 100
  });
  
  it('should allow setting custom thresholds', () => {
    // Act
    memoryManager.setThresholds({
      warning: 50,
      critical: 75,
      action: 95
    });
    
    // Assert - we can't directly access private properties, so we'll test indirectly
    // by triggering memory checks and listening for events
    
    // Mock memory usage to trigger warning (60%)
    process.memoryUsage = jest.fn().mockReturnValue({
      rss: 1024 * 1024 * 1024 * 0.6, // 60% of total memory
      heapTotal: 1024 * 1024 * 50,
      heapUsed: 1024 * 1024 * 30,
      external: 1024 * 1024 * 10
    });
    
    // Set up event listener
    const warningListener = jest.fn();
    memoryManager.on(MemoryEventType.WARNING, warningListener);
    
    // Trigger memory check
    (memoryManager as any).checkMemory();
    
    // Assert warning was triggered
    expect(warningListener).toHaveBeenCalled();
  });
  
  it('should start and stop monitoring', () => {
    // Act - start monitoring
    memoryManager.startMonitoring(1000);
    
    // Assert
    expect(global.setInterval).toHaveBeenCalledWith(expect.any(Function), 1000);
    
    // Act - stop monitoring
    memoryManager.stopMonitoring();
    
    // Assert
    expect(global.clearInterval).toHaveBeenCalled();
  });
  
  it('should emit warning event when memory usage exceeds warning threshold', () => {
    // Arrange
    memoryManager.setThresholds({
      warning: 70,
      critical: 80,
      action: 90
    });
    
    // Set up event listener before changing memory usage
    const warningListener = jest.fn();
    memoryManager.on(MemoryEventType.WARNING, warningListener);
    
    // Reset the lastState to ensure the event is emitted
    (memoryManager as any).lastState = null;
    
    // Now mock memory usage to trigger warning
    process.memoryUsage = jest.fn().mockReturnValue({
      rss: 1024 * 1024 * 1024 * 0.75, // 75% of total memory
      heapTotal: 1024 * 1024 * 50,
      heapUsed: 1024 * 1024 * 30,
      external: 1024 * 1024 * 10
    });
    
    // Act - directly call the private method
    (memoryManager as any).checkMemory();
    
    // Assert
    expect(warningListener).toHaveBeenCalledWith(expect.objectContaining({
      percentage: 75
    }));
  });
  
  it('should emit critical event when memory usage exceeds critical threshold', () => {
    // Arrange
    memoryManager.setThresholds({
      warning: 70,
      critical: 80,
      action: 90
    });
    
    process.memoryUsage = jest.fn().mockReturnValue({
      rss: 1024 * 1024 * 1024 * 0.87, // 87% of total memory
      heapTotal: 1024 * 1024 * 50,
      heapUsed: 1024 * 1024 * 30,
      external: 1024 * 1024 * 10
    });
    
    const criticalListener = jest.fn();
    memoryManager.on(MemoryEventType.CRITICAL, criticalListener);
    
    // Act - directly call the private method
    (memoryManager as any).checkMemory();
    
    // Assert
    expect(criticalListener).toHaveBeenCalledWith(expect.objectContaining({
      percentage: 87
    }));
  });
  
  it('should emit action needed event and attempt to release memory when usage exceeds action threshold', () => {
    // Arrange
    memoryManager.setThresholds({
      warning: 70,
      critical: 80,
      action: 90
    });
    
    process.memoryUsage = jest.fn().mockReturnValue({
      rss: 1024 * 1024 * 1024 * 0.95, // 95% of total memory
      heapTotal: 1024 * 1024 * 50,
      heapUsed: 1024 * 1024 * 30,
      external: 1024 * 1024 * 10
    });
    
    const actionListener = jest.fn();
    memoryManager.on(MemoryEventType.ACTION_NEEDED, actionListener);
    
    // Spy on releaseMemory
    const releaseMemorySpy = jest.spyOn(memoryManager, 'releaseMemory');
    
    // Act - directly call the private method
    (memoryManager as any).checkMemory();
    
    // Assert
    expect(actionListener).toHaveBeenCalledWith(expect.objectContaining({
      percentage: 95
    }));
    expect(releaseMemorySpy).toHaveBeenCalled();
  });
  
  it('should emit recovered event when memory usage returns to normal', () => {
    // Arrange - first set the internal state to indicate we're in a warning state
    memoryManager.setThresholds({
      warning: 70,
      critical: 80,
      action: 90
    });
    
    // First trigger a warning state
    process.memoryUsage = jest.fn().mockReturnValue({
      rss: 1024 * 1024 * 1024 * 0.75, // 75% of total memory
      heapTotal: 1024 * 1024 * 50,
      heapUsed: 1024 * 1024 * 30,
      external: 1024 * 1024 * 10
    });
    
    // Set the internal state
    (memoryManager as any).memoryState = {
      isWarning: true,
      isCritical: false,
      isActionNeeded: false
    };
    
    // Now simulate recovery
    process.memoryUsage = jest.fn().mockReturnValue({
      rss: 1024 * 1024 * 1024 * 0.50, // 50% of total memory
      heapTotal: 1024 * 1024 * 50,
      heapUsed: 1024 * 1024 * 30,
      external: 1024 * 1024 * 10
    });
    
    const recoveredListener = jest.fn();
    memoryManager.on(MemoryEventType.RECOVERED, recoveredListener);
    
    // Act - directly call the private method
    (memoryManager as any).checkMemory();
    
    // Assert
    expect(recoveredListener).toHaveBeenCalledWith(expect.objectContaining({
      percentage: 50
    }));
  });
  
  it('should emit memory:release_requested event when releaseMemory is called', () => {
    // Arrange
    const releaseRequestedListener = jest.fn();
    memoryManager.on('memory:release_requested', releaseRequestedListener);
    
    // Act
    memoryManager.releaseMemory();
    
    // Assert
    expect(releaseRequestedListener).toHaveBeenCalled();
  });
}); 