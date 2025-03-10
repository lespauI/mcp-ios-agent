import { Logger } from './Logger';
import * as os from 'os';
import { EventEmitter } from 'events';

export interface MemoryUsage {
  rss: number;        // Resident Set Size - total memory allocated for the process execution
  heapTotal: number;  // Total size of the allocated heap
  heapUsed: number;   // Actual memory used during execution
  external: number;   // Memory used by C++ objects bound to JavaScript objects
  arrayBuffers?: number; // Memory allocated for ArrayBuffers and SharedArrayBuffers
  percentage: number; // Percentage of total system memory used
}

export interface MemoryThresholds {
  warning: number;    // Percentage threshold for warning (default: 70%)
  critical: number;   // Percentage threshold for critical alerts (default: 85%)
  action: number;     // Percentage threshold for taking action (default: 90%)
}

export enum MemoryEventType {
  WARNING = 'memory:warning',
  CRITICAL = 'memory:critical',
  ACTION_NEEDED = 'memory:action_needed',
  RECOVERED = 'memory:recovered'
}

export class MemoryManager extends EventEmitter {
  private static instance: MemoryManager;
  private logger: Logger;
  private thresholds: MemoryThresholds;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private lastState: MemoryEventType | null = null;
  private gcAvailable: boolean;
  
  private constructor() {
    super();
    this.logger = new Logger('MemoryManager');
    this.thresholds = {
      warning: 70,
      critical: 85,
      action: 90
    };
    
    // Check if global.gc is available (requires --expose-gc flag)
    this.gcAvailable = typeof global.gc === 'function';
    if (!this.gcAvailable) {
      this.logger.warn('Garbage collection not exposed. Run with --expose-gc flag for better memory management.');
    }
  }
  
  public static getInstance(): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager();
    }
    return MemoryManager.instance;
  }
  
  public getMemoryUsage(): MemoryUsage {
    const memoryUsage = process.memoryUsage();
    const totalMemory = os.totalmem();
    const percentage = (memoryUsage.rss / totalMemory) * 100;
    
    return {
      ...memoryUsage,
      percentage
    };
  }
  
  public setThresholds(thresholds: Partial<MemoryThresholds>): void {
    this.thresholds = {
      ...this.thresholds,
      ...thresholds
    };
    this.logger.info(`Memory thresholds updated: warning=${this.thresholds.warning}%, critical=${this.thresholds.critical}%, action=${this.thresholds.action}%`);
  }
  
  public startMonitoring(intervalMs: number = 30000): void {
    if (this.monitoringInterval) {
      this.stopMonitoring();
    }
    
    this.logger.info(`Starting memory monitoring with interval of ${intervalMs}ms`);
    const intervalId = setInterval(() => this.checkMemory(), intervalMs);
    
    // Use unref when available (Node.js environment) but not in Jest test environment
    if (typeof intervalId.unref === 'function') {
      intervalId.unref();
    }
    
    this.monitoringInterval = intervalId;
  }
  
  public stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      this.logger.info('Memory monitoring stopped');
    }
  }
  
  public forceGarbageCollection(): boolean {
    if (this.gcAvailable) {
      try {
        this.logger.debug('Forcing garbage collection');
        (global as any).gc();
        return true;
      } catch (error: any) {
        this.logger.error('Error during forced garbage collection', error);
        return false;
      }
    }
    return false;
  }
  
  public releaseMemory(): void {
    // Force garbage collection if available
    this.forceGarbageCollection();
    
    // Clear any internal caches or large objects that can be recreated
    this.logger.info('Attempting to release memory');
    
    // Emit event so other components can release their memory
    this.emit('memory:release_requested');
  }
  
  private checkMemory(): void {
    const memoryUsage = this.getMemoryUsage();
    this.logger.debug(`Memory usage: ${memoryUsage.percentage.toFixed(2)}% (${this.formatBytes(memoryUsage.rss)} / ${this.formatBytes(os.totalmem())})`);
    
    // Determine the current state based on memory usage
    let currentState: MemoryEventType | null = null;
    
    if (memoryUsage.percentage >= this.thresholds.action) {
      currentState = MemoryEventType.ACTION_NEEDED;
    } else if (memoryUsage.percentage >= this.thresholds.critical) {
      currentState = MemoryEventType.CRITICAL;
    } else if (memoryUsage.percentage >= this.thresholds.warning) {
      currentState = MemoryEventType.WARNING;
    } else if (this.lastState !== null) {
      currentState = MemoryEventType.RECOVERED;
    }
    
    // Only emit events when the state changes
    if (currentState !== null && currentState !== this.lastState) {
      this.lastState = currentState;
      
      switch (currentState) {
        case MemoryEventType.WARNING:
          this.logger.warn(`Memory usage warning: ${memoryUsage.percentage.toFixed(2)}%`);
          break;
        case MemoryEventType.CRITICAL:
          this.logger.error(`Memory usage critical: ${memoryUsage.percentage.toFixed(2)}%`);
          break;
        case MemoryEventType.ACTION_NEEDED:
          this.logger.error(`Memory usage requires action: ${memoryUsage.percentage.toFixed(2)}%`);
          this.releaseMemory();
          break;
        case MemoryEventType.RECOVERED:
          this.logger.info(`Memory usage recovered: ${memoryUsage.percentage.toFixed(2)}%`);
          this.lastState = null;
          break;
      }
      
      // Emit the event
      this.emit(currentState, memoryUsage);
    }
  }
  
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
} 