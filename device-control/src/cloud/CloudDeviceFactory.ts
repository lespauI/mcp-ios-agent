import { CloudDeviceAdapter } from './CloudDeviceAdapter';
import { CloudDeviceOptions, CloudProvider, DeviceProfile } from '../types';
import { Logger } from '../utils/Logger';

export class CloudDeviceFactory {
  private static instance: CloudDeviceFactory;
  private logger: Logger;
  private adapters: Map<CloudProvider, CloudDeviceAdapter>;

  private constructor() {
    this.logger = new Logger('CloudDeviceFactory');
    this.adapters = new Map<CloudProvider, CloudDeviceAdapter>();
  }

  public static getInstance(): CloudDeviceFactory {
    if (!CloudDeviceFactory.instance) {
      CloudDeviceFactory.instance = new CloudDeviceFactory();
    }
    return CloudDeviceFactory.instance;
  }

  public getAdapter(options: CloudDeviceOptions): CloudDeviceAdapter {
    const provider = options.provider || CloudProvider.LOCAL;
    
    if (!this.adapters.has(provider)) {
      this.logger.info(`Creating new adapter for provider: ${provider}`);
      this.adapters.set(provider, new CloudDeviceAdapter(options));
    } else {
      this.logger.debug(`Reusing existing adapter for provider: ${provider}`);
    }
    
    return this.adapters.get(provider)!;
  }

  public enhanceCapabilities(deviceProfile: DeviceProfile, options: CloudDeviceOptions): DeviceProfile {
    const adapter = this.getAdapter(options);
    return adapter.enhanceCapabilities(deviceProfile);
  }

  public getConnectionUrl(options: CloudDeviceOptions): string {
    const adapter = this.getAdapter(options);
    return adapter.getConnectionUrl();
  }

  public clearAdapters(): void {
    this.adapters.clear();
    this.logger.debug('All cloud adapters have been cleared');
  }
} 