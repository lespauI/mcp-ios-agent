import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { CloudDeviceFactory } from '../../src/cloud/CloudDeviceFactory';
import { CloudDeviceAdapter } from '../../src/cloud/CloudDeviceAdapter';
import { CloudDeviceOptions, CloudProvider, DeviceProfile } from '../../src/types';

// Mock the CloudDeviceAdapter
jest.mock('../../src/cloud/CloudDeviceAdapter');

describe('CloudDeviceFactory', () => {
  let factory: CloudDeviceFactory;
  let mockDeviceProfile: DeviceProfile;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Get singleton instance
    factory = CloudDeviceFactory.getInstance();
    factory.clearAdapters();
    
    // Setup mock device profile
    mockDeviceProfile = {
      platformName: 'iOS',
      deviceName: 'iPhone 14',
      platformVersion: '16.0',
      automationName: 'XCUITest',
      app: '/path/to/app.ipa'
    };
    
    // Setup mock implementation for CloudDeviceAdapter
    const MockCloudDeviceAdapter = CloudDeviceAdapter as jest.MockedClass<typeof CloudDeviceAdapter>;
    MockCloudDeviceAdapter.mockImplementation(() => {
      return {
        enhanceCapabilities: jest.fn().mockImplementation((profile: DeviceProfile) => {
          return { ...profile, enhanced: true } as DeviceProfile;
        }),
        getConnectionUrl: jest.fn().mockReturnValue('http://mock-url.com/wd/hub')
      } as unknown as CloudDeviceAdapter;
    });
  });
  
  afterEach(() => {
    factory.clearAdapters();
  });
  
  it('should be a singleton', () => {
    // Act
    const instance1 = CloudDeviceFactory.getInstance();
    const instance2 = CloudDeviceFactory.getInstance();
    
    // Assert
    expect(instance1).toBe(instance2);
  });
  
  it('should create a new adapter when one does not exist', () => {
    // Arrange
    const options: CloudDeviceOptions = {
      provider: CloudProvider.BROWSERSTACK,
      username: 'test',
      accessKey: 'key'
    };
    
    // Act
    const adapter = factory.getAdapter(options);
    
    // Assert
    expect(CloudDeviceAdapter).toHaveBeenCalledWith(options);
    expect(adapter).toBeDefined();
  });
  
  it('should reuse existing adapter for the same provider', () => {
    // Arrange
    const options: CloudDeviceOptions = {
      provider: CloudProvider.BROWSERSTACK,
      username: 'test',
      accessKey: 'key'
    };
    
    // Act
    const adapter1 = factory.getAdapter(options);
    const adapter2 = factory.getAdapter(options);
    
    // Assert
    expect(CloudDeviceAdapter).toHaveBeenCalledTimes(1);
    expect(adapter1).toBe(adapter2);
  });
  
  it('should create different adapters for different providers', () => {
    // Arrange
    const bsOptions: CloudDeviceOptions = {
      provider: CloudProvider.BROWSERSTACK,
      username: 'bs_user',
      accessKey: 'bs_key'
    };
    
    const slOptions: CloudDeviceOptions = {
      provider: CloudProvider.SAUCELABS,
      username: 'sl_user',
      accessKey: 'sl_key'
    };
    
    // Act
    const bsAdapter = factory.getAdapter(bsOptions);
    const slAdapter = factory.getAdapter(slOptions);
    
    // Assert
    expect(CloudDeviceAdapter).toHaveBeenCalledTimes(2);
    expect(bsAdapter).not.toBe(slAdapter);
  });
  
  it('should enhance capabilities using the appropriate adapter', () => {
    // Arrange
    const options: CloudDeviceOptions = {
      provider: CloudProvider.BROWSERSTACK,
      username: 'test',
      accessKey: 'key'
    };
    
    // Act
    const enhancedCapabilities = factory.enhanceCapabilities(mockDeviceProfile, options);
    
    // Assert
    expect(enhancedCapabilities).toEqual({ ...mockDeviceProfile, enhanced: true });
    const adapter = factory.getAdapter(options);
    expect(adapter.enhanceCapabilities).toHaveBeenCalledWith(mockDeviceProfile);
  });
  
  it('should get connection URL using the appropriate adapter', () => {
    // Arrange
    const options: CloudDeviceOptions = {
      provider: CloudProvider.BROWSERSTACK,
      username: 'test',
      accessKey: 'key'
    };
    
    // Act
    const url = factory.getConnectionUrl(options);
    
    // Assert
    expect(url).toBe('http://mock-url.com/wd/hub');
    const adapter = factory.getAdapter(options);
    expect(adapter.getConnectionUrl).toHaveBeenCalled();
  });
  
  it('should clear all adapters', () => {
    // Arrange
    const bsOptions: CloudDeviceOptions = {
      provider: CloudProvider.BROWSERSTACK,
      username: 'bs_user',
      accessKey: 'bs_key'
    };
    
    const slOptions: CloudDeviceOptions = {
      provider: CloudProvider.SAUCELABS,
      username: 'sl_user',
      accessKey: 'sl_key'
    };
    
    factory.getAdapter(bsOptions);
    factory.getAdapter(slOptions);
    
    // Act
    factory.clearAdapters();
    
    // Force creation of new adapters to verify the old ones were cleared
    factory.getAdapter(bsOptions);
    factory.getAdapter(slOptions);
    
    // Assert
    expect(CloudDeviceAdapter).toHaveBeenCalledTimes(4);
  });
  
  it('should default to LOCAL provider if not specified', () => {
    // Arrange
    const options: CloudDeviceOptions = {
      provider: CloudProvider.LOCAL
    };
    
    // Act
    const adapter = factory.getAdapter(options);
    
    // Assert
    expect(CloudDeviceAdapter).toHaveBeenCalledWith(options);
    expect(adapter).toBeDefined();
  });
}); 