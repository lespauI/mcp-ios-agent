import { Logger } from '../utils/Logger';
import { VisualChecker, VisualCheckOptions, VisualComparisonResult } from './VisualChecker';
import { ElementStateChecker, ElementSelector, ElementState, ElementVerificationResult, VerificationOptions } from './ElementStateChecker';

export interface ActionVerificationOptions extends VerificationOptions {
  visualCheck?: boolean;
  stateCheck?: boolean;
  retry?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  undo?: () => Promise<void>;
  checkOptions?: {
    visual?: Partial<VisualCheckOptions>;
    state?: Partial<VerificationOptions>;
  };
}

export interface ActionVerificationResult {
  success: boolean;
  failureReason?: string;
  visualResult?: VisualComparisonResult;
  stateResult?: ElementVerificationResult;
  retry?: {
    attempted: boolean;
    count: number;
    success: boolean;
  };
  actionUndone?: boolean;
}

export interface CheckpointElement {
  strategy: string;
  selector: string;
  expectedState: ElementState;
}

export interface Checkpoint {
  name: string;
  elements: CheckpointElement[];
  options?: Partial<VerificationOptions>;
}

export interface CheckpointVerificationResult {
  success: boolean;
  checkpointName: string;
  elements: Array<ElementVerificationResult & { selector: ElementSelector }>;
}

/**
 * Verifies UI actions by checking visual changes and element states
 */
export class ActionVerifier {
  private logger = new Logger('ActionVerifier');
  private readonly DEFAULT_MAX_RETRIES = 3;
  private readonly DEFAULT_RETRY_DELAY = 1000; // 1 second
  
  /**
   * Creates a new ActionVerifier instance
   * 
   * @param driver - WebDriverIO browser instance
   * @param visualChecker - Visual checker instance
   * @param elementStateChecker - Element state checker instance
   */
  constructor(
    private driver: WebdriverIO.Browser,
    private visualChecker: VisualChecker,
    private elementStateChecker: ElementStateChecker
  ) {}
  
  /**
   * Verifies an action by checking visual changes and element state
   * 
   * @param action - Action to perform and verify
   * @param elementSelector - Element selector for state verification
   * @param options - Verification options
   * @returns Verification result
   */
  async verifyAction(
    action: () => Promise<void>,
    elementSelector?: ElementSelector,
    options: Partial<ActionVerificationOptions> = {}
  ): Promise<ActionVerificationResult> {
    const mergedOptions = {
      visualCheck: true,
      stateCheck: !!elementSelector,
      retry: false,
      maxRetries: this.DEFAULT_MAX_RETRIES,
      retryDelay: this.DEFAULT_RETRY_DELAY,
      checkOptions: {
        visual: {},
        state: {}
      },
      ...options
    };
    
    // Initialize result
    const result: ActionVerificationResult = {
      success: false,
      retry: {
        attempted: false,
        count: 0,
        success: false
      }
    };
    
    // Take a screenshot before the action if visual check is enabled
    if (mergedOptions.visualCheck) {
      await this.visualChecker.takeScreenshot();
    }
    
    // Try to perform the action
    let actionSuccess = false;
    let retryCount = 0;
    let lastError: any;
    
    do {
      try {
        await action();
        actionSuccess = true;
      } catch (error) {
        lastError = error;
        this.logger.warn(`Action failed: ${error}`);
        
        // Increment retry count
        retryCount++;
        
        if (mergedOptions.retry && retryCount < mergedOptions.maxRetries) {
          result.retry!.attempted = true;
          result.retry!.count = retryCount;
          
          this.logger.info(`Retrying action (${retryCount}/${mergedOptions.maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, mergedOptions.retryDelay));
        } else {
          // If we've exhausted retries or retry is not enabled
          result.retry!.attempted = mergedOptions.retry;
          result.retry!.count = retryCount;
          break;
        }
      }
    } while (!actionSuccess && mergedOptions.retry && retryCount < mergedOptions.maxRetries);
    
    // If action succeeded, verify its effects
    if (actionSuccess) {
      // Verify visual changes if enabled
      if (mergedOptions.visualCheck) {
        const visualResult = await this.visualChecker.checkForChanges(
          mergedOptions.checkOptions.visual
        );
        result.visualResult = visualResult;
        
        if (!visualResult.changed) {
          result.success = false;
          result.failureReason = 'No visual changes detected after action';
        } else {
          result.success = true;
        }
      }
      
      // Verify element state if enabled and element selector provided
      if (mergedOptions.stateCheck && elementSelector) {
        const stateResult = await this.elementStateChecker.verifyElementState(
          elementSelector,
          { visible: true, enabled: true }, // Default checks
          mergedOptions.checkOptions.state
        );
        result.stateResult = stateResult;
        
        // Update success if visual check wasn't performed or succeeded
        if (!mergedOptions.visualCheck || result.success) {
          result.success = stateResult.verified;
          
          if (!stateResult.verified) {
            result.failureReason = `Element state verification failed: ${stateResult.reason}`;
          }
        }
      } else if (!mergedOptions.visualCheck) {
        // If neither check was performed, consider it a success
        result.success = true;
      }
      
      // Set retry success
      if (result.retry!.attempted) {
        result.retry!.success = result.success;
      }
    } else {
      // Action failed even after retries
      result.success = false;
      result.failureReason = `Action failed: ${lastError}`;
      
      // Try to undo the failed action if an undo function was provided
      if (mergedOptions.undo) {
        try {
          await mergedOptions.undo();
          result.actionUndone = true;
        } catch (undoError) {
          this.logger.error(`Failed to undo action: ${undoError}`);
        }
      }
    }
    
    return result;
  }
  
  /**
   * Verifies a checkpoint by checking all elements match their expected states
   * 
   * @param checkpoint - Checkpoint definition
   * @returns Checkpoint verification result
   */
  async verifyCheckpoint(checkpoint: Checkpoint): Promise<CheckpointVerificationResult> {
    this.logger.info(`Verifying checkpoint: ${checkpoint.name}`);
    
    const elementResults: Array<ElementVerificationResult & { selector: ElementSelector }> = [];
    let allVerified = true;
    
    for (const element of checkpoint.elements) {
      const selector: ElementSelector = {
        strategy: element.strategy as any,
        selector: element.selector
      };
      
      const result = await this.elementStateChecker.verifyElementState(
        selector,
        element.expectedState,
        checkpoint.options
      );
      
      elementResults.push({
        ...result,
        selector
      });
      
      if (!result.verified) {
        allVerified = false;
        this.logger.warn(`Element verification failed for ${element.strategy}:${element.selector} - ${result.reason}`);
      }
    }
    
    return {
      success: allVerified,
      checkpointName: checkpoint.name,
      elements: elementResults
    };
  }
  
  /**
   * Verifies multiple checkpoints in sequence
   * 
   * @param checkpoints - Array of checkpoints to verify
   * @param failFast - Whether to stop on first failure
   * @returns Array of checkpoint verification results
   */
  async verifyMultipleCheckpoints(
    checkpoints: Checkpoint[],
    failFast: boolean = false
  ): Promise<CheckpointVerificationResult[]> {
    const results: CheckpointVerificationResult[] = [];
    
    for (const checkpoint of checkpoints) {
      const result = await this.verifyCheckpoint(checkpoint);
      results.push(result);
      
      if (failFast && !result.success) {
        break;
      }
    }
    
    return results;
  }
  
  /**
   * Creates a visual checkpoint that can be compared later
   * 
   * @param name - Name to identify the checkpoint
   * @param region - Optional region to capture
   * @returns True if successful
   */
  async createVisualCheckpoint(name: string, region?: VisualCheckOptions['region']): Promise<boolean> {
    try {
      return await this.visualChecker.saveScreenshot(name, region);
    } catch (error) {
      this.logger.error(`Failed to create visual checkpoint ${name}: ${error}`);
      return false;
    }
  }
  
  /**
   * Compares current screen with a previously saved visual checkpoint
   * 
   * @param checkpointName - Name of the checkpoint to compare against
   * @param options - Visual check options
   * @returns Visual comparison result
   */
  async compareWithVisualCheckpoint(
    checkpointName: string,
    options: Partial<VisualCheckOptions> = {}
  ): Promise<VisualComparisonResult> {
    const currentName = `${checkpointName}_current`;
    await this.visualChecker.takeScreenshot(currentName);
    
    return this.visualChecker.compareScreenshots(
      checkpointName,
      currentName,
      options
    );
  }
} 