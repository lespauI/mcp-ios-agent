import { DeviceProfile } from '../types';
import { deepMerge } from '../utils/helpers';

/**
 * Default device profiles
 */
const DEFAULT_PROFILES: Record<string, DeviceProfile> = {
  'iphone-simulator': {
    platformName: 'iOS',
    deviceName: 'iPhone Simulator',
    platformVersion: '16.4',
    automationName: 'XCUITest'
  },
  'iphone-13': {
    platformName: 'iOS',
    deviceName: 'iPhone 13',
    platformVersion: '15.0',
    automationName: 'XCUITest'
  },
  'ipad-simulator': {
    platformName: 'iOS',
    deviceName: 'iPad Simulator',
    platformVersion: '16.4',
    automationName: 'XCUITest'
  }
};

/**
 * Manages device capability profiles for iOS devices
 */
export class DeviceCapabilityManager {
  private profiles: Record<string, DeviceProfile>;
  
  /**
   * Creates a new DeviceCapabilityManager
   * 
   * @param initialProfiles Initial profiles to use (defaults to built-in profiles)
   */
  constructor(initialProfiles: Record<string, DeviceProfile> = DEFAULT_PROFILES) {
    this.profiles = { ...initialProfiles };
  }
  
  /**
   * Registers a new device profile
   * 
   * @param name Profile name
   * @param profile Device profile configuration
   */
  registerProfile(name: string, profile: DeviceProfile): void {
    this.validateProfile(profile);
    this.profiles[name] = { ...profile };
  }
  
  /**
   * Gets a profile by name
   * 
   * @param name Profile name
   * @returns Device profile
   * @throws Error if profile not found
   */
  getProfile(name: string): DeviceProfile {
    if (!this.profiles[name]) {
      throw new Error(`Profile not found: ${name}`);
    }
    
    return { ...this.profiles[name] };
  }
  
  /**
   * Gets all available profile names
   * 
   * @returns Array of profile names
   */
  getAvailableProfiles(): string[] {
    return Object.keys(this.profiles);
  }
  
  /**
   * Selects a profile based on requirements
   * 
   * @param requirements Partial device profile with required properties
   * @returns Best matching device profile
   * @throws Error if no matching profile found
   */
  selectProfile(requirements: Partial<DeviceProfile>): DeviceProfile {
    // Filter profiles that match all requirements
    const matches = Object.entries(this.profiles)
      .filter(([_, profile]) => {
        // Check each requirement
        return Object.entries(requirements).every(([key, value]) => {
          if (key === 'deviceName' && typeof value === 'string' && typeof profile[key] === 'string') {
            // For deviceName, allow substring match
            return profile[key].includes(value);
          }
          
          // For other properties, require exact match
          return profile[key] === value;
        });
      });
    
    if (matches.length === 0) {
      throw new Error('No matching device profile found for requirements');
    }
    
    // Return the first match (could implement more sophisticated selection logic)
    return { ...matches[0][1] };
  }
  
  /**
   * Adjusts capabilities by merging with adjustments
   * 
   * @param profile Base device profile
   * @param adjustments Capability adjustments to apply
   * @returns Adjusted device profile
   */
  adjustCapabilities(profile: DeviceProfile, adjustments: Partial<DeviceProfile>): DeviceProfile {
    return deepMerge(profile, adjustments);
  }
  
  /**
   * Validates a device profile
   * 
   * @param profile Device profile to validate
   * @throws Error if profile is invalid
   */
  validateProfile(profile: DeviceProfile): void {
    // Check required fields
    if (!profile.platformName) {
      throw new Error('platformName is required');
    }
    
    if (!profile.deviceName) {
      throw new Error('deviceName is required');
    }
    
    if (!profile.platformVersion) {
      throw new Error('platformVersion is required');
    }
    
    if (!profile.automationName) {
      throw new Error('automationName is required');
    }
    
    // Additional validation could be added here
  }
} 