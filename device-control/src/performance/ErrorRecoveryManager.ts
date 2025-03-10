import { Logger } from '../utils/Logger';
import { sleep } from '../utils/helpers';
import { AppControlActions } from '../actions/AppControlActions';
import { RecoveryStrategy, ErrorTrend } from '../types/performance';

/**
 * Default recovery strategy
 */
const DEFAULT_RECOVERY_STRATEGY: Omit<RecoveryStrategy, 'recoveryActions'> & {
  recoveryActions: Array<{ errorType: string; action: 'retry' | 'restart' }>;
} = {
  enabled: true,
  maxRetries: 3,
  retryDelay: 1000,
  exponentialBackoff: true,
  recoveryActions: [
    {
      errorType: 'NoSuchElementError',
      action: 'retry'
    },
    {
      errorType: 'StaleElementReferenceError',
      action: 'retry'
    },
    {
      errorType: 'TimeoutError',
      action: 'retry'
    },
    {
      errorType: 'WebDriverError',
      action: 'retry'
    },
    {
      errorType: 'AppCrashError',
      action: 'restart'
    },
    {
      errorType: 'SessionNotCreatedError',
      action: 'restart'
    }
  ]
};

/**
 * Error categories for grouping similar errors
 */
const ERROR_CATEGORIES = {
  // Element errors
  element: [
    'NoSuchElementError',
    'StaleElementReferenceError',
    'ElementNotVisibleError',
    'ElementNotInteractableError',
    'ElementClickInterceptedError'
  ],
  // Timeout errors
  timeout: [
    'TimeoutError',
    'ScriptTimeoutError',
    'AsyncTimeoutError'
  ],
  // Session errors
  session: [
    'SessionNotCreatedError',
    'NoSuchSessionError',
    'SessionNotFoundError'
  ],
  // Application errors
  application: [
    'AppCrashError',
    'AppNotRespondingError',
    'AppTerminatedError'
  ],
  // Network errors
  network: [
    'NetworkError',
    'ConnectFailedError',
    'ConnectionRefusedError'
  ],
  // WebDriver errors
  webdriver: [
    'WebDriverError',
    'UnknownError',
    'UnknownCommandError',
    'UnsupportedCommandError'
  ]
};

// Type guard to check if an error is a specific error type by name
function isErrorType(error: Error, errorType: string): boolean {
  return error.name === errorType || error.constructor.name === errorType;
}

interface RecoveryAction {
  name: string;
  action: (error: Error, context: Record<string, any>) => Promise<boolean>;
}

/**
 * Error recovery manager for handling errors and implementing retry strategies
 */
export class ErrorRecoveryManager {
  private enabled: boolean = true;
  private recoveryStrategy: RecoveryStrategy;
  private recoveryStrategies: Map<string, RecoveryStrategy> = new Map();
  private errorTrends: Map<string, ErrorTrend> = new Map();
  private logger: Logger;

  constructor(
    defaultStrategy: Partial<RecoveryStrategy> = {},
    private readonly appControl: AppControlActions
  ) {
    this.logger = new Logger('ErrorRecoveryManager');
    
    // Convert recovery actions array to Map
    const recoveryActionsMap = new Map<string, (error: Error, context: Record<string, any>) => Promise<boolean>>();
    DEFAULT_RECOVERY_STRATEGY.recoveryActions.forEach(action => {
      recoveryActionsMap.set(action.errorType, async () => action.action === 'retry');
    });

    this.recoveryStrategy = {
      ...DEFAULT_RECOVERY_STRATEGY,
      recoveryActions: recoveryActionsMap,
      ...defaultStrategy
    };

    this.initializeDefaultRecoveryActions();
  }

  private initializeDefaultRecoveryActions(): void {
    this.recoveryStrategy.recoveryActions.set('NoSuchElementError', async (error, context) => {
      await this.appControl.resetApp();
      return true;
    });

    this.recoveryStrategy.recoveryActions.set('TimeoutError', async (error, context) => {
      await this.appControl.restartApp();
      return true;
    });

    this.recoveryStrategy.recoveryActions.set('AppCrashError', async (error, context) => {
      await this.appControl.launchApp();
      return true;
    });
  }

  public enable(): void {
    this.enabled = true;
  }

  public disable(): void {
    this.enabled = false;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(enabled: boolean): void {
    if (enabled) {
      this.enable();
    } else {
      this.disable();
    }
  }

  public resetErrorTrends(): void {
    this.errorTrends.clear();
    this.logger.info('Error trends reset');
  }

  public getErrorTrends(): Map<string, ErrorTrend> {
    return this.errorTrends;
  }

  private getStrategyForError(errorType: string): RecoveryStrategy | undefined {
    return this.recoveryStrategies.get(errorType) || this.recoveryStrategy;
  }

  private async executeRecoveryAction(error: Error, context: Record<string, any> = {}): Promise<void> {
    const errorType = error.name || error.constructor.name;
    const strategy = this.getStrategyForError(errorType);
    const recoveryAction = strategy?.recoveryActions.get(errorType);
    
    if (!strategy || !recoveryAction) {
      this.logger.warn(`No recovery action defined for error type: ${errorType}`);
      return;
    }

    try {
      const success = await recoveryAction(error, context);
      this.updateErrorTrendWithRecovery(errorType, success);
      if (!success) {
        throw new Error(`Recovery action failed for ${errorType}`);
      }
    } catch (recoveryError) {
      this.logger.error(`Recovery action failed for ${errorType}:`, recoveryError);
      this.updateErrorTrendWithRecovery(errorType, false);
      throw recoveryError;
    }
  }

  public async executeWithRecovery<T>(
    operation: () => Promise<T>,
    context: Record<string, any> = {},
    customStrategy?: Partial<RecoveryStrategy>
  ): Promise<T> {
    if (!this.enabled) {
      return operation();
    }

    let lastError: Error | null = null;
    let attempts = 0;
    const maxAttempts = customStrategy?.maxRetries ?? this.recoveryStrategy.maxRetries;
    const retryDelay = customStrategy?.retryDelay ?? this.recoveryStrategy.retryDelay;
    const useExponentialBackoff = customStrategy?.exponentialBackoff ?? this.recoveryStrategy.exponentialBackoff;

    while (attempts <= maxAttempts) {
      try {
        if (attempts > 0) {
          const delay = useExponentialBackoff ? retryDelay * Math.pow(2, attempts - 1) : retryDelay;
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        const result = await operation();
        if (lastError) {
          this.updateErrorTrendWithRecovery(lastError.name || lastError.constructor.name, true);
        }
        return result;
      } catch (error) {
        lastError = error as Error;
        this.trackError(lastError);
        
        if (attempts < maxAttempts) {
          await this.executeRecoveryAction(lastError, context);
          this.updateErrorTrendWithRecovery(lastError.name || lastError.constructor.name, false);
        }
        
        attempts++;
      }
    }

    if (lastError) {
      throw lastError;
    }

    throw new Error('Operation failed without an error');
  }

  private trackError(error: Error): void {
    const errorType = error.name || error.constructor.name;
    const trend = this.errorTrends.get(errorType) || {
      errorType,
      occurrences: 0,
      recoveryAttempts: 0,
      successfulRecoveries: 0,
      failedRecoveries: 0,
      lastOccurrence: new Date()
    };

    trend.occurrences++;
    trend.lastOccurrence = new Date();
    this.errorTrends.set(errorType, trend);
  }

  private updateErrorTrendWithRecovery(errorType: string, successful: boolean): void {
    const trend = this.errorTrends.get(errorType);
    if (trend) {
      trend.recoveryAttempts++;
      if (successful) {
        trend.successfulRecoveries++;
      } else {
        trend.failedRecoveries++;
      }
      this.errorTrends.set(errorType, trend);
    }
  }

  /**
   * Analyze error patterns and trends
   */
  analyzeErrorPatterns(): Record<string, any> {
    const patterns: Record<string, any> = {};
    
    // Analyze error trends by category
    for (const [errorType, trend] of this.errorTrends.entries()) {
      // Find category for error type
      const category = Object.entries(ERROR_CATEGORIES).find(([_, types]) => 
        types.includes(errorType)
      )?.[0] || 'unknown';
      
      if (!patterns[category]) {
        patterns[category] = {
          totalErrors: 0,
          recoveryAttempts: 0,
          successfulRecoveries: 0,
          errors: []
        };
      }
      
      patterns[category].totalErrors += trend.occurrences;
      patterns[category].recoveryAttempts += trend.recoveryAttempts;
      patterns[category].successfulRecoveries += trend.successfulRecoveries;
      patterns[category].errors.push({
        type: errorType,
        occurrences: trend.occurrences,
        recoveryAttempts: trend.recoveryAttempts,
        successRate: trend.recoveryAttempts > 0 ? 
          trend.successfulRecoveries / trend.recoveryAttempts : 0,
        lastOccurrence: trend.lastOccurrence
      });
    }
    
    // Calculate success rates and sort by frequency
    Object.values(patterns).forEach(category => {
      category.successRate = category.recoveryAttempts > 0 ? 
        category.successfulRecoveries / category.recoveryAttempts : 0;
      category.errors.sort((a: any, b: any) => b.occurrences - a.occurrences);
    });
    
    return patterns;
  }
} 