import { describe, it, expect, beforeEach } from '@jest/globals';
import { DeviceCapabilityManager } from '../../src/capabilities/DeviceCapabilityManager';
import { DeviceProfile } from '../../src/types';

describe('DeviceCapabilityManager', () => {
  let capabilityManager: DeviceCapabilityManager;
  
  beforeEach(() => {
    capabilityManager = new DeviceCapabilityManager();
  });
  
  it('should have default profiles', () => {
    expect(capabilityManager.getAvailableProfiles().length).toBeGreaterThan(0);
  });
  
  it('should register a new device profile', () => {
    const profile: DeviceProfile = {
      platformName: 'iOS',
      deviceName: 'Custom iPhone',
      platformVersion: '17.0',
      automationName: 'XCUITest',
      app: '/path/to/app.app'
    };
    
    capabilityManager.registerProfile('custom-iphone', profile);
    
    expect(capabilityManager.getProfile('custom-iphone')).toEqual(profile);
  });
  
  it('should throw error when requesting non-existent profile', () => {
    expect(() => {
      capabilityManager.getProfile('non-existent-profile');
    }).toThrow('Profile not found');
  });
  
  it('should override existing profile', () => {
    const originalProfile = capabilityManager.getAvailableProfiles()[0];
    const profileName = originalProfile;
    
    const updatedProfile: DeviceProfile = {
      platformName: 'iOS',
      deviceName: 'Updated Device',
      platformVersion: '16.0',
      automationName: 'XCUITest'
    };
    
    capabilityManager.registerProfile(profileName, updatedProfile);
    
    expect(capabilityManager.getProfile(profileName)).toEqual(updatedProfile);
  });
  
  it('should select appropriate profile based on requirements', () => {
    // Add several test profiles
    capabilityManager.registerProfile('iphone-15', {
      platformName: 'iOS',
      deviceName: 'iPhone 15',
      platformVersion: '17.0',
      automationName: 'XCUITest'
    });
    
    capabilityManager.registerProfile('iphone-14', {
      platformName: 'iOS',
      deviceName: 'iPhone 14',
      platformVersion: '16.0',
      automationName: 'XCUITest'
    });
    
    capabilityManager.registerProfile('ipad-pro', {
      platformName: 'iOS',
      deviceName: 'iPad Pro',
      platformVersion: '16.0',
      automationName: 'XCUITest'
    });
    
    // Test selection based on platformVersion
    const profile1 = capabilityManager.selectProfile({ platformVersion: '17.0' });
    expect(profile1.deviceName).toBe('iPhone 15');
    
    // Test selection based on deviceName containing substring
    // Use the name from the default profiles that matches "iPad"
    const profile2 = capabilityManager.selectProfile({ deviceName: 'iPad' });
    expect(profile2.deviceName).toContain('iPad');
  });
  
  it('should apply capability adjustments', () => {
    const baseProfile: DeviceProfile = {
      platformName: 'iOS',
      deviceName: 'iPhone 14',
      platformVersion: '16.0',
      automationName: 'XCUITest'
    };
    
    const adjustments = {
      app: '/path/to/app.app',
      noReset: true,
      otherCapabilities: {
        shouldUseCompactUI: true,
        language: 'en'
      }
    };
    
    const adjustedProfile = capabilityManager.adjustCapabilities(baseProfile, adjustments);
    
    expect(adjustedProfile).toEqual({
      ...baseProfile,
      ...adjustments
    });
  });
  
  it('should validate capabilities and throw error on invalid ones', () => {
    const invalidProfile = {
      platformName: 'iOS',
      // Missing required deviceName
      platformVersion: '16.0',
      automationName: 'XCUITest'
    };
    
    expect(() => {
      capabilityManager.validateProfile(invalidProfile as DeviceProfile);
    }).toThrow('deviceName is required');
  });

  // New test cases to improve branch coverage

  it('should throw error when selecting profile with no matches', () => {
    expect(() => {
      capabilityManager.selectProfile({ platformVersion: '99.0' });
    }).toThrow('No matching device profile found');
  });

  it('should handle multiple matching profiles by returning first match', () => {
    capabilityManager.registerProfile('iphone-16-1', {
      platformName: 'iOS',
      deviceName: 'iPhone 16',
      platformVersion: '16.0',
      automationName: 'XCUITest'
    });

    capabilityManager.registerProfile('iphone-16-2', {
      platformName: 'iOS',
      deviceName: 'iPhone 16 Pro',
      platformVersion: '16.0',
      automationName: 'XCUITest'
    });

    const profile = capabilityManager.selectProfile({ platformVersion: '16.0' });
    expect(profile.platformVersion).toBe('16.0');
  });

  it('should validate all required capabilities', () => {
    const invalidProfiles = [
      {
        deviceName: 'iPhone',
        platformVersion: '16.0',
        automationName: 'XCUITest'
      } as Partial<DeviceProfile>,
      {
        platformName: 'iOS',
        deviceName: 'iPhone',
        automationName: 'XCUITest'
      } as Partial<DeviceProfile>,
      {
        platformName: 'iOS',
        deviceName: 'iPhone',
        platformVersion: '16.0'
      } as Partial<DeviceProfile>
    ];

    invalidProfiles.forEach(profile => {
      expect(() => {
        capabilityManager.validateProfile(profile as DeviceProfile);
      }).toThrow();
    });
  });

  it('should handle empty requirements when selecting profile', () => {
    const profile = capabilityManager.selectProfile({});
    expect(profile).toBeDefined();
  });

  it('should handle exact matches in profile selection', () => {
    capabilityManager.registerProfile('exact-match', {
      platformName: 'iOS',
      deviceName: 'Exact iPhone',
      platformVersion: '16.0',
      automationName: 'XCUITest'
    });

    const profile = capabilityManager.selectProfile({
      deviceName: 'Exact iPhone',
      platformVersion: '16.0'
    });

    expect(profile.deviceName).toBe('Exact iPhone');
    expect(profile.platformVersion).toBe('16.0');
  });

  it('should merge complex capability adjustments', () => {
    const baseProfile: DeviceProfile = {
      platformName: 'iOS',
      deviceName: 'iPhone 14',
      platformVersion: '16.0',
      automationName: 'XCUITest',
      otherCapabilities: {
        existingOption: true
      }
    };

    const adjustments = {
      otherCapabilities: {
        newOption: false,
        language: 'en'
      },
      webviewConnectTimeout: 5000
    };

    const adjustedProfile = capabilityManager.adjustCapabilities(baseProfile, adjustments);
    expect(adjustedProfile.otherCapabilities).toEqual({
      existingOption: true,
      newOption: false,
      language: 'en'
    });
    expect(adjustedProfile.webviewConnectTimeout).toBe(5000);
  });

  it('should handle undefined otherCapabilities in adjustments', () => {
    const baseProfile: DeviceProfile = {
      platformName: 'iOS',
      deviceName: 'iPhone 14',
      platformVersion: '16.0',
      automationName: 'XCUITest',
      otherCapabilities: {
        existingOption: true
      }
    };

    const adjustments = {
      webviewConnectTimeout: 5000
    };

    const adjustedProfile = capabilityManager.adjustCapabilities(baseProfile, adjustments);
    expect(adjustedProfile.otherCapabilities).toEqual({
      existingOption: true
    });
  });
}); 