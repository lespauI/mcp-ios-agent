import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { CloudDeviceAdapter } from '../../src/cloud/CloudDeviceAdapter';
import { CloudDeviceOptions, CloudProvider, DeviceProfile } from '../../src/types';

describe('CloudDeviceAdapter', () => {
  let baseDeviceProfile: DeviceProfile;
  
  beforeEach(() => {
    // Reset base device profile to a clean state
    baseDeviceProfile = {
      platformName: 'iOS',
      deviceName: 'iPhone 14',
      platformVersion: '16.0',
      automationName: 'XCUITest',
      app: '/path/to/app.ipa'
    };
  });
  
  describe('BrowserStack', () => {
    it('should enhance capabilities with BrowserStack options', () => {
      // Arrange
      const options: CloudDeviceOptions = {
        provider: CloudProvider.BROWSERSTACK,
        username: 'testuser',
        accessKey: 'accesskey123',
        projectName: 'Test Project',
        buildName: 'Build 123',
        testName: 'My Test'
      };
      
      const adapter = new CloudDeviceAdapter(options);
      
      // Act
      const enhancedCapabilities = adapter.enhanceCapabilities(baseDeviceProfile);
      
      // Assert
      expect(enhancedCapabilities.platformName).toBe('iOS');
      expect(enhancedCapabilities.deviceName).toBe('iPhone 14');
      expect(enhancedCapabilities['browserstack.user']).toBe('testuser');
      expect(enhancedCapabilities['browserstack.key']).toBe('accesskey123');
      expect(enhancedCapabilities['browserstack.project']).toBe('Test Project');
      expect(enhancedCapabilities['browserstack.build']).toBe('Build 123');
      expect(enhancedCapabilities['browserstack.name']).toBe('My Test');
      
      // Verify URL configuration
      expect(enhancedCapabilities.hostname).toBe('hub-cloud.browserstack.com');
      expect(enhancedCapabilities.port).toBe(4444);
      expect(enhancedCapabilities.protocol).toBe('https');
    });
    
    it('should get the correct BrowserStack connection URL', () => {
      // Arrange
      const options: CloudDeviceOptions = {
        provider: CloudProvider.BROWSERSTACK,
        username: 'testuser',
        accessKey: 'accesskey123'
      };
      
      const adapter = new CloudDeviceAdapter(options);
      
      // Act
      const url = adapter.getConnectionUrl();
      
      // Assert
      expect(url).toBe('https://hub-cloud.browserstack.com/wd/hub');
    });
  });
  
  describe('SauceLabs', () => {
    it('should enhance capabilities with SauceLabs options', () => {
      // Arrange
      const options: CloudDeviceOptions = {
        provider: CloudProvider.SAUCELABS,
        username: 'sauce_user',
        accessKey: 'sauce_key',
        projectName: 'Test Project',
        buildName: 'Build 123',
        testName: 'My Test',
        region: 'eu-central-1'
      };
      
      const adapter = new CloudDeviceAdapter(options);
      
      // Act
      const enhancedCapabilities = adapter.enhanceCapabilities(baseDeviceProfile);
      
      // Assert
      expect(enhancedCapabilities.platformName).toBe('iOS');
      expect(enhancedCapabilities.deviceName).toBe('iPhone 14');
      expect(enhancedCapabilities['sauce:options']).toBeDefined();
      expect(enhancedCapabilities['sauce:options'].username).toBe('sauce_user');
      expect(enhancedCapabilities['sauce:options'].accessKey).toBe('sauce_key');
      expect(enhancedCapabilities['sauce:options'].tunnelIdentifier).toBe('Test Project');
      expect(enhancedCapabilities['sauce:options'].build).toBe('Build 123');
      expect(enhancedCapabilities['sauce:options'].name).toBe('My Test');
      
      // Verify URL configuration
      expect(enhancedCapabilities.hostname).toBe('ondemand.eu-central-1.saucelabs.com');
      expect(enhancedCapabilities.port).toBe(443);
      expect(enhancedCapabilities.protocol).toBe('https');
    });
    
    it('should get the correct SauceLabs connection URL', () => {
      // Arrange
      const options: CloudDeviceOptions = {
        provider: CloudProvider.SAUCELABS,
        username: 'sauce_user',
        accessKey: 'sauce_key',
        region: 'eu-central-1'
      };
      
      const adapter = new CloudDeviceAdapter(options);
      
      // Act
      const url = adapter.getConnectionUrl();
      
      // Assert
      expect(url).toBe('https://ondemand.eu-central-1.saucelabs.com/wd/hub');
    });
  });
  
  describe('LambdaTest', () => {
    it('should enhance capabilities with LambdaTest options', () => {
      // Arrange
      const options: CloudDeviceOptions = {
        provider: CloudProvider.LAMBDATEST,
        username: 'lambda_user',
        accessKey: 'lambda_key',
        projectName: 'Test Project',
        buildName: 'Build 123',
        testName: 'My Test'
      };
      
      const adapter = new CloudDeviceAdapter(options);
      
      // Act
      const enhancedCapabilities = adapter.enhanceCapabilities(baseDeviceProfile);
      
      // Assert
      expect(enhancedCapabilities.platformName).toBe('iOS');
      expect(enhancedCapabilities.deviceName).toBe('iPhone 14');
      expect(enhancedCapabilities.user).toBe('lambda_user');
      expect(enhancedCapabilities.key).toBe('lambda_key');
      expect(enhancedCapabilities.project).toBe('Test Project');
      expect(enhancedCapabilities.build).toBe('Build 123');
      expect(enhancedCapabilities.name).toBe('My Test');
      
      // Verify URL configuration
      expect(enhancedCapabilities.hostname).toBe('mobile-hub.lambdatest.com');
      expect(enhancedCapabilities.port).toBe(80);
    });
    
    it('should get the correct LambdaTest connection URL', () => {
      // Arrange
      const options: CloudDeviceOptions = {
        provider: CloudProvider.LAMBDATEST,
        username: 'lambda_user',
        accessKey: 'lambda_key'
      };
      
      const adapter = new CloudDeviceAdapter(options);
      
      // Act
      const url = adapter.getConnectionUrl();
      
      // Assert
      expect(url).toBe('https://mobile-hub.lambdatest.com/wd/hub');
    });
  });
  
  describe('Perfecto', () => {
    it('should enhance capabilities with Perfecto options', () => {
      // Arrange
      const options: CloudDeviceOptions = {
        provider: CloudProvider.PERFECTO,
        accessKey: 'security_token',
        projectName: 'Test Project',
        buildName: 'Build 123',
        testName: 'My Test',
        region: 'us-east'
      };
      
      const adapter = new CloudDeviceAdapter(options);
      
      // Act
      const enhancedCapabilities = adapter.enhanceCapabilities(baseDeviceProfile);
      
      // Assert
      expect(enhancedCapabilities.platformName).toBe('iOS');
      expect(enhancedCapabilities.deviceName).toBe('iPhone 14');
      expect(enhancedCapabilities.securityToken).toBe('security_token');
      expect(enhancedCapabilities.projectName).toBe('Test Project');
      expect(enhancedCapabilities.jobName).toBe('Build 123');
      expect(enhancedCapabilities.testName).toBe('My Test');
      
      // Verify URL configuration
      expect(enhancedCapabilities.hostname).toBe('us-east.perfectomobile.com');
      expect(enhancedCapabilities.port).toBe(443);
      expect(enhancedCapabilities.protocol).toBe('https');
    });
    
    it('should get the correct Perfecto connection URL', () => {
      // Arrange
      const options: CloudDeviceOptions = {
        provider: CloudProvider.PERFECTO,
        accessKey: 'security_token',
        region: 'us-east'
      };
      
      const adapter = new CloudDeviceAdapter(options);
      
      // Act
      const url = adapter.getConnectionUrl();
      
      // Assert
      expect(url).toBe('https://us-east.perfectomobile.com/nexperience/perfectomobile/wd/hub');
    });
  });
  
  describe('Local', () => {
    it('should not modify capabilities for local execution', () => {
      // Arrange
      const options: CloudDeviceOptions = {
        provider: CloudProvider.LOCAL
      };
      
      const adapter = new CloudDeviceAdapter(options);
      
      // Act
      const enhancedCapabilities = adapter.enhanceCapabilities(baseDeviceProfile);
      
      // Assert - capabilities should remain largely unchanged
      expect(enhancedCapabilities).toEqual(baseDeviceProfile);
    });
    
    it('should get the correct local connection URL', () => {
      // Arrange
      const options: CloudDeviceOptions = {
        provider: CloudProvider.LOCAL
      };
      
      const adapter = new CloudDeviceAdapter(options);
      
      // Act
      const url = adapter.getConnectionUrl();
      
      // Assert
      expect(url).toBe('http://localhost:4723/wd/hub');
    });
  });
}); 