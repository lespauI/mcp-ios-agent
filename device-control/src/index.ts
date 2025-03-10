// Export session management components
export { SessionManager, defaultDriverFactory } from './session/SessionManager';

// Export capability management components
export { DeviceCapabilityManager } from './capabilities/DeviceCapabilityManager';

// Export element location components
export { ElementLocator } from './element/ElementLocator';

// Export UI action components
export { UIActions } from './actions/UIActions';

// Export app control components
export { AppControlActions } from './actions/AppControlActions';
export type { 
  AppLaunchOptions, 
  AppTerminateOptions, 
  AppResetOptions, 
  AppStateOptions 
} from './actions/AppControlActions';

// Export UI state capture components
export { UIStateCaptureManager } from './state/UIStateCaptureManager';

// Export synchronization components
export { SynchronizationManager } from './synchronization/SynchronizationManager';

// Export performance optimization components
export { PerformanceOptimizationManager } from './performance/PerformanceOptimizationManager';
export { PerformanceMonitor } from './performance/PerformanceMonitor';
export { ResourceManager } from './performance/ResourceManager';
export { ErrorRecoveryManager } from './performance/ErrorRecoveryManager';

// Export logging utilities
export { Logger } from './utils/Logger';

// Export types
export * from './types';

// Export utility functions
export * from './utils/helpers'; 