import { DeviceProfile, CloudDeviceOptions, CloudProvider } from '../types';
import { Logger } from '../utils/Logger';

/**
 * CloudDeviceAdapter configures and connects to cloud-based device farms
 * Supports BrowserStack, SauceLabs, LambdaTest, and Perfecto
 */
export class CloudDeviceAdapter {
  private logger = new Logger('CloudDeviceAdapter');
  
  /**
   * Creates a new CloudDeviceAdapter
   * 
   * @param options Cloud device options
   */
  constructor(private options: CloudDeviceOptions) {
    this.logger.info(`Initializing cloud device adapter for ${options.provider}`);
  }
  
  /**
   * Enhances device capabilities with cloud-specific configuration
   * 
   * @param baseDeviceProfile Base device profile
   * @returns Enhanced device profile with cloud configuration
   */
  enhanceCapabilities(baseDeviceProfile: DeviceProfile): DeviceProfile {
    this.logger.debug('Enhancing device capabilities for cloud provider', {
      provider: this.options.provider,
      deviceProfile: baseDeviceProfile
    });
    
    // Create a copy of the device profile to avoid modifying the original
    const enhancedCapabilities = { ...baseDeviceProfile };
    
    // Add provider-specific capabilities
    switch (this.options.provider) {
      case CloudProvider.BROWSERSTACK:
        this.configureBrowserStack(enhancedCapabilities);
        break;
        
      case CloudProvider.SAUCELABS:
        this.configureSauceLabs(enhancedCapabilities);
        break;
        
      case CloudProvider.LAMBDATEST:
        this.configureLambdaTest(enhancedCapabilities);
        break;
        
      case CloudProvider.PERFECTO:
        this.configurePerfecto(enhancedCapabilities);
        break;
        
      case CloudProvider.LOCAL:
        // No additional configuration needed for local execution
        this.logger.info('Using local execution, no cloud capabilities added');
        break;
        
      default:
        this.logger.warn(`Unknown cloud provider: ${this.options.provider}`);
    }
    
    return enhancedCapabilities;
  }
  
  /**
   * Configures BrowserStack-specific capabilities
   * 
   * @param capabilities Device capabilities to enhance
   */
  private configureBrowserStack(capabilities: DeviceProfile): void {
    // Add BrowserStack specific capabilities
    capabilities['browserstack.user'] = this.options.username;
    capabilities['browserstack.key'] = this.options.accessKey;
    
    if (this.options.projectName) {
      capabilities['browserstack.project'] = this.options.projectName;
    }
    
    if (this.options.buildName) {
      capabilities['browserstack.build'] = this.options.buildName;
    }
    
    if (this.options.testName) {
      capabilities['browserstack.name'] = this.options.testName;
    }
    
    if (this.options.debug) {
      capabilities['browserstack.debug'] = true;
      capabilities['browserstack.console'] = 'verbose';
    }
    
    if (this.options.networkLogs) {
      capabilities['browserstack.networkLogs'] = true;
    }
    
    if (this.options.deviceLogs) {
      capabilities['browserstack.deviceLogs'] = true;
    }
    
    // Set remote hub URL for BrowserStack
    capabilities.hostname = 'hub-cloud.browserstack.com';
    capabilities.port = 4444;
    capabilities.protocol = 'https';
    
    // Configure local testing if needed
    if (capabilities.app && capabilities.app.startsWith('bs://')) {
      this.logger.info('Using pre-uploaded app from BrowserStack');
    } else if (capabilities.app) {
      this.logger.info('App will be uploaded to BrowserStack during session creation');
    }
    
    // Configure proxy if specified
    if (this.options.proxy) {
      capabilities['browserstack.proxy'] = {
        host: this.options.proxy.host,
        port: this.options.proxy.port,
        protocol: this.options.proxy.protocol || 'http'
      };
      
      if (this.options.proxy.username && this.options.proxy.password) {
        capabilities['browserstack.proxy'].auth = {
          username: this.options.proxy.username,
          password: this.options.proxy.password
        };
      }
    }
  }
  
  /**
   * Configures SauceLabs-specific capabilities
   * 
   * @param capabilities Device capabilities to enhance
   */
  private configureSauceLabs(capabilities: DeviceProfile): void {
    // Add SauceLabs specific capabilities
    capabilities['sauce:options'] = {
      username: this.options.username,
      accessKey: this.options.accessKey,
      build: this.options.buildName,
      name: this.options.testName
    };
    
    if (this.options.projectName) {
      capabilities['sauce:options'].tunnelIdentifier = this.options.projectName;
    }
    
    if (this.options.region) {
      const region = this.options.region.toLowerCase();
      capabilities.hostname = `ondemand.${region}.saucelabs.com`;
    } else {
      capabilities.hostname = 'ondemand.us-west-1.saucelabs.com';
    }
    
    capabilities.port = 443;
    capabilities.protocol = 'https';
    
    // Enable extended debugging if requested
    if (this.options.debug) {
      capabilities['sauce:options'].extendedDebugging = true;
    }
    
    if (this.options.consoleLogs) {
      capabilities['sauce:options'].capturePerformance = true;
    }
    
    // Configure proxy if specified
    if (this.options.proxy) {
      capabilities['sauce:options'].proxy = {
        proxyHost: this.options.proxy.host,
        proxyPort: this.options.proxy.port,
        proxyProtocol: this.options.proxy.protocol || 'http'
      };
      
      if (this.options.proxy.username && this.options.proxy.password) {
        capabilities['sauce:options'].proxy.proxyAuth = 
          `${this.options.proxy.username}:${this.options.proxy.password}`;
      }
    }
  }
  
  /**
   * Configures LambdaTest-specific capabilities
   * 
   * @param capabilities Device capabilities to enhance
   */
  private configureLambdaTest(capabilities: DeviceProfile): void {
    // Add LambdaTest specific capabilities
    capabilities.user = this.options.username;
    capabilities.key = this.options.accessKey;
    
    if (this.options.projectName) {
      capabilities.project = this.options.projectName;
    }
    
    if (this.options.buildName) {
      capabilities.build = this.options.buildName;
    }
    
    if (this.options.testName) {
      capabilities.name = this.options.testName;
    }
    
    if (this.options.debug) {
      capabilities.visual = true;
      capabilities.network = true;
      capabilities.console = true;
    }
    
    // Set remote hub URL for LambdaTest
    capabilities.hostname = 'mobile-hub.lambdatest.com';
    capabilities.port = 80;
    
    // Configure proxy if specified
    if (this.options.proxy) {
      capabilities.proxy = {
        host: this.options.proxy.host,
        port: this.options.proxy.port,
        protocol: this.options.proxy.protocol || 'http'
      };
      
      if (this.options.proxy.username && this.options.proxy.password) {
        capabilities.proxy.auth = {
          username: this.options.proxy.username,
          password: this.options.proxy.password
        };
      }
    }
  }
  
  /**
   * Configures Perfecto-specific capabilities
   * 
   * @param capabilities Device capabilities to enhance
   */
  private configurePerfecto(capabilities: DeviceProfile): void {
    // Add Perfecto specific capabilities
    capabilities.securityToken = this.options.accessKey;
    
    if (this.options.projectName) {
      capabilities.projectName = this.options.projectName;
    }
    
    if (this.options.buildName) {
      capabilities.jobName = this.options.buildName;
    }
    
    if (this.options.testName) {
      capabilities.testName = this.options.testName;
    }
    
    // Set remote hub URL for Perfecto
    if (this.options.region) {
      capabilities.hostname = `${this.options.region}.perfectomobile.com`;
    } else {
      capabilities.hostname = 'cloud.perfectomobile.com';
    }
    
    capabilities.port = 443;
    capabilities.protocol = 'https';
    
    // Configure proxy if specified
    if (this.options.proxy) {
      capabilities.proxy = {
        httpProxy: `${this.options.proxy.protocol || 'http'}://${this.options.proxy.host}:${this.options.proxy.port}`
      };
      
      if (this.options.proxy.username && this.options.proxy.password) {
        capabilities.proxy.proxyAuth = 
          `${this.options.proxy.username}:${this.options.proxy.password}`;
      }
    }
  }
  
  /**
   * Gets the connection URL for the configured cloud provider
   * 
   * @returns Connection URL for the cloud service
   */
  getConnectionUrl(): string {
    switch (this.options.provider) {
      case CloudProvider.BROWSERSTACK:
        return 'https://hub-cloud.browserstack.com/wd/hub';
        
      case CloudProvider.SAUCELABS:
        const region = this.options.region?.toLowerCase() || 'us-west-1';
        return `https://ondemand.${region}.saucelabs.com/wd/hub`;
        
      case CloudProvider.LAMBDATEST:
        return 'https://mobile-hub.lambdatest.com/wd/hub';
        
      case CloudProvider.PERFECTO:
        const perfectoRegion = this.options.region || 'cloud';
        return `https://${perfectoRegion}.perfectomobile.com/nexperience/perfectomobile/wd/hub`;
        
      case CloudProvider.LOCAL:
        return 'http://localhost:4723/wd/hub';
        
      default:
        this.logger.warn(`Unknown cloud provider: ${this.options.provider}, using default local URL`);
        return 'http://localhost:4723/wd/hub';
    }
  }
} 