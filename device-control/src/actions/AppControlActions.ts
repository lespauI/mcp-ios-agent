import { ElementLocator } from '../element/ElementLocator';
import { Logger } from '../utils';

// Add WebdriverIO type declaration to fix typing issues
declare global {
  namespace WebdriverIO {
    interface Browser {
      terminateApp(bundleId?: string, options?: any): Promise<void>;
      activateApp(bundleId: string): Promise<void>;
      isAppInstalled(bundleId: string): Promise<boolean>;
      installApp(bundleId: string): Promise<void>;
      removeApp(bundleId: string): Promise<void>;
      reset(): Promise<void>;
      launchApp(): Promise<void>;
      closeApp(): Promise<void>;
      queryAppState(bundleId?: string): Promise<number>;
      background(seconds: number): Promise<void>;
      execute(command: string, args?: any): Promise<any>;
      executeScript(script: string, args?: any): Promise<any>;
      getContext(): Promise<string>;
    }
  }
}

// Helper for tests - will be undefined in production
const isTestEnvironment = typeof jest !== 'undefined';

export interface AppLaunchOptions {
  args?: string[];
  env?: Record<string, string>;
  deepLink?: string;
  timeout?: number;
  retries?: number;
  bundleId?: string;
  isTestEnvironment?: boolean;
}

export interface AppTerminateOptions {
  bundleId?: string;
  preserveState?: boolean;
  timeout?: number;
}

export interface AppResetOptions {
  bundleId?: string;
  fullReset?: boolean;
  preserveKeychain?: boolean;
  preserveSettings?: boolean;
}

export interface AppStateOptions {
  bundleId?: string;
  state?: 'foreground' | 'background' | 'notRunning' | 'running';
  checkResponsiveness?: boolean;
  timeout?: number;
}

export interface AppIdentityOptions {
  bundleId: string;
  bundleName?: string;
  bundleVersion?: string;
}

export interface BackgroundOptions {
  duration: number;
  waitForForeground?: boolean;
  timeout?: number;
}

export interface CrashDetectionOptions {
  bundleId?: string;
  timeout?: number;
  autoRecover?: boolean;
}

/**
 * AppControlActions class provides methods to control app lifecycle and state
 */
export class AppControlActions {
  private readonly logger = new Logger('AppControlActions');
  private readonly DEFAULT_TIMEOUT = 30000;
  private readonly DEFAULT_RETRIES = 3;

  constructor(
    private driver: WebdriverIO.Browser,
    private elementLocator: ElementLocator
  ) {}

  /**
   * Launches the app with specified options
   */
  async launchApp(options: AppLaunchOptions = {}): Promise<void> {
    const { args, env, deepLink, timeout = 15000, retries = 5, bundleId, isTestEnvironment = false } = options;
    let attempt = 0;
    let lastError: Error | undefined;
    const retryDelay = 1000; // 1 second delay between retries

    while (attempt < retries) {
      try {
        if (args || env || deepLink) {
          const params: Record<string, any> = {};
          if (args) params.arguments = args;
          if (env) params.environment = env;
          if (deepLink) params.uri = deepLink;
          if (bundleId) params.bundleId = bundleId;
          
          // Use executeScript instead of execute for WebDriverIO v8+ compatibility
          await this.driver.executeScript('mobile: launchApp', params);
        } else {
          // Use built-in launchApp method if available
          if (typeof this.driver.launchApp === 'function') {
            await this.driver.launchApp();
          } else {
            // Fallback to execute script if launchApp is not available
            await this.driver.executeScript('mobile: launchApp', {
              bundleId: bundleId || await this.getCurrentBundleId()
            });
          }
        }

        this.logger.info('Successfully launched the app');
        return;
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(`App launch attempt ${attempt + 1} failed`, { error });
        attempt++;

        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }

    throw new Error(`Failed to launch app after ${retries} attempts: ${lastError?.message}`);
  }

  /**
   * Terminates the app
   */
  async terminateApp(options: AppTerminateOptions = {}): Promise<void> {
    const { bundleId, preserveState, timeout = 10000 } = options;
    
    try {
      const appBundleId = bundleId || await this.getCurrentBundleId();
      
      if (!appBundleId) {
        throw new Error('No bundle ID provided or current bundle ID could not be determined');
      }
      
      // Use executeScript instead of execute for WebDriverIO v8+ compatibility
      if (typeof this.driver.terminateApp === 'function') {
        await this.driver.terminateApp(appBundleId, { preserveState });
      } else {
        await this.driver.executeScript('mobile: terminateApp', {
          bundleId: appBundleId,
          preserveState
        });
      }
      
      this.logger.info(`Successfully terminated app: ${appBundleId}`);
    } catch (error) {
      this.logger.error('Failed to terminate app', { error });
      throw error;
    }
  }

  /**
   * Resets the app state
   */
  async resetApp(options: AppResetOptions = {}): Promise<void> {
    const { bundleId, fullReset = false, preserveKeychain = false, preserveSettings = false } = options;
    
    try {
      const appBundleId = bundleId || await this.getCurrentBundleId();
      
      if (!appBundleId) {
        throw new Error('No bundle ID provided or current bundle ID could not be determined');
      }
      
      // Use executeScript instead of execute for WebDriverIO v8+ compatibility
      await this.driver.executeScript('mobile: resetApp', {
        bundleId: appBundleId,
        fullReset,
        preserveKeychain,
        preserveSettings
      });
      
      this.logger.info(`Successfully reset app: ${appBundleId}`);
    } catch (error) {
      this.logger.error('Failed to reset app', { error });
      throw error;
    }
  }

  /**
   * Verifies the current state of the app
   */
  async verifyAppState(options: AppStateOptions = {}): Promise<boolean> {
    const { 
      bundleId, 
      state, 
      checkResponsiveness,
      timeout = this.DEFAULT_TIMEOUT
    } = options;
    
    this.logger.info('Verifying app state', { options });
    
    try {
      if (checkResponsiveness) {
        // Check app responsiveness
        const result = await this.driver.executeScript('mobile: checkAppState', { 
          checkResponsiveness 
        }) as { responsive?: boolean };
        
        return result?.responsive === true;
      }
      
      if (state) {
        const appState = await this.driver.queryAppState(bundleId);
        
        // App states according to XCUITest:
        // 0: Not installed / Crashed
        // 1: Not running
        // 2: Running in background suspended
        // 3: Running in background
        // 4: Running in foreground
        
        switch (state) {
          case 'foreground':
            return appState === 4;
          case 'background':
            return appState === 3 || appState === 2;
          case 'running':
            return appState === 2 || appState === 3 || appState === 4;
          case 'notRunning':
            return appState === 1;
          default:
            return false;
        }
      }
      
      // Default check - is app running at all?
      const appState = await this.driver.queryAppState(bundleId);
      return appState > 0;
    } catch (error) {
      this.logger.error('Failed to verify app state', { error });
      return false;
    }
  }

  /**
   * Puts the app in background for specified duration
   */
  async setBackgroundState(options: BackgroundOptions): Promise<void> {
    const { 
      duration,
      waitForForeground = true,
      timeout = this.DEFAULT_TIMEOUT
    } = options;

    this.logger.info('Setting app to background state', { options });

    try {
      await this.driver.background(duration);

      if (waitForForeground) {
        const isInForeground = await this.verifyAppState({ 
          state: 'foreground',
          timeout 
        });

        if (!isInForeground) {
          throw new Error('App did not return to foreground after background duration');
        }
      }

      this.logger.info('Background state operation completed');
    } catch (error) {
      this.logger.error('Failed to set background state', { error });
      throw error;
    }
  }

  /**
   * Verifies app identity matches expected values
   */
  async verifyAppIdentity(options: AppIdentityOptions): Promise<boolean> {
    const { bundleId, bundleName, bundleVersion } = options;

    this.logger.info('Verifying app identity', { options });

    try {
      const isInstalled = await this.driver.isAppInstalled(bundleId);
      if (!isInstalled) {
        return false;
      }

      if (bundleName || bundleVersion) {
        const appInfo = await this.driver.executeScript('mobile: getAppInfo', { bundleId }) as {
          name?: string;
          version?: string;
        };

        if (bundleName && appInfo.name !== bundleName) {
          return false;
        }

        if (bundleVersion && appInfo.version !== bundleVersion) {
          return false;
        }
      }

      return true;
    } catch (error) {
      this.logger.error('Failed to verify app identity', { error });
      return false;
    }
  }

  /**
   * Detects if app has crashed and optionally recovers
   */
  async detectCrash(options: CrashDetectionOptions = {}): Promise<boolean> {
    const { 
      bundleId,
      timeout = this.DEFAULT_TIMEOUT,
      autoRecover = false
    } = options;

    this.logger.info('Checking for app crash', { options });

    try {
      const appState = await this.driver.queryAppState(bundleId);
      const hasCrashed = appState === 0;

      if (hasCrashed) {
        this.logger.warn('App crash detected');

        if (autoRecover) {
          this.logger.info('Attempting crash recovery');
          await this.launchApp({ bundleId, timeout });
          return true;
        }
      }

      return hasCrashed;
    } catch (error) {
      this.logger.error('Failed to detect app crash', { error });
      throw error;
    }
  }

  /**
   * Gets the current bundle ID of the active app
   * @returns The current bundle ID or undefined if it cannot be determined
   */
  async getCurrentBundleId(): Promise<string | undefined> {
    try {
      // Get active application info using mobile: command
      const appInfo = await this.driver.executeScript('mobile: activeAppInfo', {});
      
      if (appInfo && typeof appInfo === 'object' && 'bundleId' in appInfo) {
        return appInfo.bundleId as string;
      }
      
      // Fallback to using current context
      const currentContext = await this.driver.getContext();
      if (currentContext && currentContext.startsWith('NATIVE_APP')) {
        const contextDetails = currentContext.split('_');
        if (contextDetails.length > 1) {
          return contextDetails[1];
        }
      }
      
      return undefined;
    } catch (error) {
      this.logger.error('Failed to determine current bundle ID', { error });
      return undefined;
    }
  }

  async restartApp(): Promise<void> {
    // Implementation of restartApp method
  }
} 