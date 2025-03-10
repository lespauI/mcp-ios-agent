import { Logger } from './Logger';
import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';

// Convert Node callbacks to Promises
const exec = util.promisify(childProcess.exec);

// Create promisified versions of fs functions if fs.promises is not available
const fsPromises = fs.promises || {
  access: util.promisify(fs.access),
  readFile: util.promisify(fs.readFile),
  writeFile: util.promisify(fs.writeFile),
  mkdir: util.promisify(fs.mkdir),
  stat: util.promisify(fs.stat),
  unlink: util.promisify(fs.unlink),
  readdir: util.promisify(fs.readdir)
};

const fsAccess = fsPromises.access;
const fsReadFile = fsPromises.readFile;

/**
 * Interface for iOS simulator information
 */
export interface IOSSimulator {
  name: string;
  udid: string;
  version: string;
  state: 'Booted' | 'Shutdown' | 'Unknown';
}

/**
 * Interface for Appium verification result
 */
export interface AppiumVerificationResult {
  installed: boolean;
  version?: string;
  path?: string;
  error?: string;
}

/**
 * Interface for Appium drivers verification result
 */
export interface AppiumDriversVerificationResult {
  installed: boolean;
  drivers: Record<string, { 
    installed: boolean; 
    version?: string;
    error?: string; 
  }>;
  error?: string;
}

/**
 * Interface for Xcode verification result
 */
export interface XcodeVerificationResult {
  installed: boolean;
  version?: string;
  buildVersion?: string;
  path?: string;
  error?: string;
}

/**
 * Interface for iOS simulators verification result
 */
export interface SimulatorsVerificationResult {
  available: boolean;
  simulators: IOSSimulator[];
  error?: string;
}

/**
 * Interface for iOS tools verification result
 */
export interface IOSToolsVerificationResult {
  ideviceinstaller: boolean;
  iosDeploy: boolean;
  carthage?: boolean;
  error?: string;
}

/**
 * Interface for Appium server check result
 */
export interface AppiumServerCheckResult {
  running: boolean;
  url: string;
  ready?: boolean;
  error?: string;
  statusCode?: number;
}

/**
 * Interface for complete environment verification options
 */
export interface EnvironmentVerificationOptions {
  checkAppium?: boolean;
  checkAppiumDrivers?: boolean;
  requiredDrivers?: string[];
  checkXcode?: boolean;
  checkSimulators?: boolean;
  checkTools?: boolean;
  checkServer?: boolean;
  serverUrl?: string;
}

/**
 * Interface for complete environment verification result
 */
export interface EnvironmentVerificationResult {
  ready: boolean;
  issues: string[];
  appium?: AppiumVerificationResult;
  appiumDrivers?: AppiumDriversVerificationResult;
  xcode?: XcodeVerificationResult;
  simulators?: SimulatorsVerificationResult;
  tools?: IOSToolsVerificationResult;
  server?: AppiumServerCheckResult;
}

/**
 * EnvironmentVerifier provides tools to validate the iOS automation environment
 * It checks Appium installation, iOS SDK, simulators, and connectivity
 */
export class EnvironmentVerifier {
  private logger = new Logger('EnvironmentVerifier');

  /**
   * Creates a new EnvironmentVerifier instance
   */
  constructor() {
    this.logger.info('EnvironmentVerifier initialized');
  }

  /**
   * Verifies that Appium is installed and gets its version
   * 
   * @returns Verification result with installation status and version
   */
  async verifyAppium(): Promise<AppiumVerificationResult> {
    try {
      // Try command line first
      try {
        const { stdout } = await exec('appium -v');
        const version = stdout.trim();
        
        return {
          installed: true,
          version,
          path: 'global'
        };
      } catch (cmdError) {
        // Command line check failed, try local installation
        try {
          // Check if appium exists in node_modules
          const nodeModulesPath = path.resolve(process.cwd(), 'node_modules', 'appium');
          await fsAccess(nodeModulesPath);
          
          // Read package.json to get version
          const packageJsonPath = path.resolve(nodeModulesPath, 'package.json');
          const packageJson = JSON.parse(await fsReadFile(packageJsonPath, 'utf8'));
          
          return {
            installed: true,
            version: packageJson.version,
            path: nodeModulesPath
          };
        } catch (localError) {
          throw new Error('Appium not found in PATH or local node_modules');
        }
      }
    } catch (error) {
      this.logger.error('Failed to verify Appium installation', { error });
      
      return {
        installed: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Verifies that required Appium drivers are installed
   * 
   * @param requiredDrivers Array of required driver names (e.g., ['xcuitest'])
   * @returns Verification result with driver details
   */
  async verifyAppiumDrivers(requiredDrivers: string[] = ['xcuitest']): Promise<AppiumDriversVerificationResult> {
    const result: AppiumDriversVerificationResult = {
      installed: true,
      drivers: {}
    };

    try {
      // Initialize driver results
      for (const driver of requiredDrivers) {
        result.drivers[driver] = { installed: false };
      }
      
      // Check for appium-xcuitest-driver in package.json
      try {
        const packageJsonPath = path.resolve(process.cwd(), 'package.json');
        const packageJson = JSON.parse(await fsReadFile(packageJsonPath, 'utf8'));
        
        const dependencies = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies
        };
        
        // Check for appium-xcuitest-driver
        if (dependencies['appium-xcuitest-driver']) {
          result.drivers['xcuitest'] = {
            installed: true,
            version: dependencies['appium-xcuitest-driver'].replace(/^\^|~/, '')
          };
        }
        
        // Check other drivers if needed
        // ...
      } catch (error) {
        this.logger.warn('Failed to check package.json for drivers', { error });
      }
      
      // Try appium driver list as a fallback
      try {
        const { stdout } = await exec('appium driver list --installed');
        
        for (const driver of requiredDrivers) {
          if (stdout.includes(driver)) {
            const versionMatch = new RegExp(`${driver}@([\\d.]+)`).exec(stdout);
            result.drivers[driver] = {
              installed: true,
              version: versionMatch ? versionMatch[1] : undefined
            };
          }
        }
      } catch (error) {
        this.logger.warn('Failed to list Appium drivers via CLI', { error });
      }
      
      // Check if all required drivers are installed
      result.installed = requiredDrivers.every(driver => result.drivers[driver]?.installed);
      
      if (!result.installed) {
        const missingDrivers = requiredDrivers.filter(driver => !result.drivers[driver]?.installed);
        result.error = `Missing required drivers: ${missingDrivers.join(', ')}`;
      }
      
      return result;
    } catch (error) {
      this.logger.error('Failed to verify Appium drivers', { error });
      
      return {
        installed: false,
        drivers: {},
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Verifies that Xcode is installed and gets its version
   * 
   * @returns Verification result with installation status and version
   */
  async verifyXcode(): Promise<XcodeVerificationResult> {
    try {
      const { stdout } = await exec('xcodebuild -version');
      const lines = stdout.trim().split('\n');
      
      if (lines.length < 2) {
        throw new Error('Unexpected Xcode version output format');
      }
      
      // Parse version and build
      const versionMatch = lines[0].match(/Xcode\s+(\d+\.\d+(\.\d+)?)/);
      const buildMatch = lines[1].match(/Build version\s+(\w+)/);
      
      if (!versionMatch) {
        throw new Error('Could not parse Xcode version');
      }
      
      return {
        installed: true,
        version: versionMatch[1],
        buildVersion: buildMatch ? buildMatch[1] : undefined,
        path: '/Applications/Xcode.app'
      };
    } catch (error) {
      this.logger.error('Failed to verify Xcode installation', { error });
      
      return {
        installed: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Verifies iOS simulators availability and lists them
   * 
   * @returns Verification result with simulator details
   */
  async verifySimulators(): Promise<SimulatorsVerificationResult> {
    try {
      const { stdout } = await exec('xcrun simctl list devices');
      const simulators: IOSSimulator[] = [];
      
      // Parse simulator list
      let currentiOSVersion = '';
      
      stdout.split('\n').forEach(line => {
        // Check for iOS version headers
        const versionMatch = line.match(/--\s+iOS\s+([\d.]+)/);
        if (versionMatch) {
          currentiOSVersion = versionMatch[1];
          return;
        }
        
        // Parse simulator entries
        const simulatorMatch = line.match(/\s+(.*?)\s+\(([-0-9A-F]+)\)\s+\((\w+)\)/);
        if (simulatorMatch && currentiOSVersion) {
          simulators.push({
            name: simulatorMatch[1].trim(),
            udid: simulatorMatch[2],
            version: currentiOSVersion,
            state: simulatorMatch[3] as 'Booted' | 'Shutdown' | 'Unknown'
          });
        }
      });
      
      return {
        available: simulators.length > 0,
        simulators
      };
    } catch (error) {
      this.logger.error('Failed to verify iOS simulators', { error });
      
      return {
        available: false,
        simulators: [],
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Verifies that required iOS tools are installed
   * 
   * @returns Verification result with tools status
   */
  async verifyIOSTools(): Promise<IOSToolsVerificationResult> {
    const result: IOSToolsVerificationResult = {
      ideviceinstaller: false,
      iosDeploy: false
    };

    try {
      // Check for tools using brew
      try {
        const { stdout } = await exec('brew list');
        result.ideviceinstaller = stdout.includes('ideviceinstaller');
        result.iosDeploy = stdout.includes('ios-deploy');
        result.carthage = stdout.includes('carthage');
      } catch (brewError) {
        // Brew check failed, try direct commands
        try {
          await exec('ideviceinstaller --version');
          result.ideviceinstaller = true;
        } catch {
          // Tool not found
        }
        
        try {
          await exec('ios-deploy --version');
          result.iosDeploy = true;
        } catch {
          // Tool not found
        }
      }
      
      return result;
    } catch (error) {
      this.logger.error('Failed to verify iOS tools', { error });
      
      return {
        ...result,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Checks if Appium server is running at the given URL
   * 
   * @param url Appium server URL
   * @returns Check result with server status
   */
  async checkAppiumServer(url: string = 'http://localhost:4723'): Promise<AppiumServerCheckResult> {
    try {
      const response = await fetch(`${url}/status`);
      
      if (!response.ok) {
        return {
          running: true,
          url,
          ready: false,
          statusCode: response.status,
          error: `Server returned status ${response.status}`
        };
      }
      
      const data = await response.json();
      const ready = data?.value?.ready === true;
      
      return {
        running: true,
        url,
        ready,
        statusCode: response.status
      };
    } catch (error) {
      this.logger.error('Failed to check Appium server', { error });
      
      return {
        running: false,
        url,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Performs a complete environment verification
   * 
   * @param options Verification options
   * @returns Comprehensive verification result
   */
  async verifyEnvironment(options: EnvironmentVerificationOptions = {}): Promise<EnvironmentVerificationResult> {
    const defaultOptions: EnvironmentVerificationOptions = {
      checkAppium: true,
      checkAppiumDrivers: true,
      requiredDrivers: ['xcuitest'],
      checkXcode: true,
      checkSimulators: true,
      checkTools: true,
      checkServer: false,
      serverUrl: 'http://localhost:4723'
    };
    
    const mergedOptions = { ...defaultOptions, ...options };
    const result: EnvironmentVerificationResult = {
      ready: true,
      issues: []
    };

    // Verify Appium
    if (mergedOptions.checkAppium) {
      result.appium = await this.verifyAppium();
      
      if (!result.appium.installed) {
        result.ready = false;
        result.issues.push(`Appium is not installed: ${result.appium.error}`);
      }
    }
    
    // Verify Appium Drivers
    if (mergedOptions.checkAppiumDrivers) {
      result.appiumDrivers = await this.verifyAppiumDrivers(mergedOptions.requiredDrivers);
      
      if (!result.appiumDrivers.installed) {
        result.ready = false;
        result.issues.push(`Missing required Appium drivers: ${result.appiumDrivers.error}`);
      }
    }
    
    // Verify Xcode
    if (mergedOptions.checkXcode) {
      result.xcode = await this.verifyXcode();
      
      if (!result.xcode.installed) {
        result.ready = false;
        result.issues.push(`Xcode is not installed: ${result.xcode.error}`);
      }
    }
    
    // Verify Simulators
    if (mergedOptions.checkSimulators) {
      result.simulators = await this.verifySimulators();
      
      if (!result.simulators.available) {
        result.ready = false;
        result.issues.push(`No iOS simulators available: ${result.simulators.error}`);
      }
    }
    
    // Verify iOS Tools
    if (mergedOptions.checkTools) {
      result.tools = await this.verifyIOSTools();
      
      if (!result.tools.ideviceinstaller) {
        result.issues.push('ideviceinstaller is not installed (required for real device testing)');
      }
      
      if (!result.tools.iosDeploy) {
        result.issues.push('ios-deploy is not installed (required for real device testing)');
      }
    }
    
    // Check Appium Server
    if (mergedOptions.checkServer) {
      result.server = await this.checkAppiumServer(mergedOptions.serverUrl);
      
      if (!result.server.running) {
        result.ready = false;
        result.issues.push(`Appium server is not running at ${mergedOptions.serverUrl}: ${result.server.error}`);
      } else if (result.server.ready === false) {
        result.ready = false;
        result.issues.push(`Appium server is not ready at ${mergedOptions.serverUrl}`);
      }
    }
    
    return result;
  }
} 