import { Logger } from '../utils/Logger';
import { EventSystem } from './EventSystem';
import { 
  AppiumEventType, 
  LogEvent, 
  ServerEvent, 
  SessionEvent, 
  CommandEvent,
  ConnectionEvent,
  DeviceEvent,
  AppStateEvent,
  AppCrashEvent 
} from '../types/events';

export class AppiumEventManager {
  private logger = new Logger('AppiumEventManager');
  private connectionMonitor: NodeJS.Timeout | null = null;
  private lastConnectionState: 'connected' | 'disconnected' | 'error' = 'disconnected';

  constructor(
    private driver: WebdriverIO.Browser,
    private eventSystem: EventSystem
  ) {}

  /**
   * Initialize the event manager and register Appium event handlers
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing AppiumEventManager');
    
    try {
      // Register handlers for Appium events
      this.registerEventHandlers();
      
      // Start connection monitoring
      this.monitorConnection(30000); // Check every 30 seconds
      
      this.logger.info('AppiumEventManager initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize AppiumEventManager', { error });
      throw error;
    }
  }

  /**
   * Register handlers for all Appium events
   */
  private registerEventHandlers(): void {
    // Log events
    this.driver.on('log', (data: any) => this.handleLogEvent(data));
    
    // Session events
    this.driver.on('session-created', (data: any) => this.handleSessionEvent('create', data));
    this.driver.on('session-deleted', (data: any) => this.handleSessionEvent('delete', data));
    
    // Command events
    this.driver.on('command', (data: any) => this.handleCommandEvent('start', data));
    this.driver.on('command-response', (data: any) => this.handleCommandEvent('end', data));
    this.driver.on('command-error', (data: any) => this.handleCommandEvent('error', data));
    
    // Device events
    this.driver.on('device-added', (data: any) => this.handleDeviceEvent('detected', data));
    this.driver.on('device-removed', (data: any) => this.handleDeviceEvent('lost', data));
    
    this.logger.debug('Registered all event handlers');
  }

  /**
   * Handle log events from Appium
   */
  private handleLogEvent(data: any): void {
    const logEvent: LogEvent = {
      level: data.level || 'info',
      message: data.message || 'Unknown log message',
      timestamp: data.timestamp || Date.now(),
      source: data.source || 'appium',
      details: data.details
    };
    
    this.eventSystem.publish(AppiumEventType.LOG, logEvent);
  }

  /**
   * Handle session lifecycle events
   */
  private handleSessionEvent(type: 'create' | 'delete' | 'error', data: any): void {
    const sessionEvent: SessionEvent = {
      sessionId: data.sessionId || 'unknown',
      state: type === 'create' ? 'created' : type === 'delete' ? 'deleted' : 'error',
      timestamp: Date.now(),
      capabilities: data.capabilities,
      error: data.error
    };
    
    const eventType = type === 'create' 
      ? AppiumEventType.SESSION_CREATE 
      : type === 'delete' 
        ? AppiumEventType.SESSION_DELETE 
        : AppiumEventType.SESSION_ERROR;
    
    this.eventSystem.publish(eventType, sessionEvent);
  }

  /**
   * Handle command events
   */
  private handleCommandEvent(type: 'start' | 'end' | 'error', data: any): void {
    const commandEvent: CommandEvent = {
      sessionId: data.sessionId || 'unknown',
      command: data.command || 'unknown',
      params: data.params,
      timestamp: Date.now(),
      duration: data.duration,
      result: data.result,
      error: data.error
    };
    
    const eventType = type === 'start' 
      ? AppiumEventType.COMMAND_START 
      : type === 'end' 
        ? AppiumEventType.COMMAND_END 
        : AppiumEventType.COMMAND_ERROR;
    
    this.eventSystem.publish(eventType, commandEvent);
  }

  /**
   * Handle device connection/disconnection events
   */
  private handleDeviceEvent(type: 'detected' | 'lost', data: any): void {
    const deviceEvent: DeviceEvent = {
      udid: data.udid || 'unknown',
      name: data.name || 'unknown device',
      type: data.isSimulator ? 'simulator' : 'real',
      timestamp: Date.now(),
      details: data
    };
    
    const eventType = type === 'detected' 
      ? AppiumEventType.DEVICE_DETECTED 
      : AppiumEventType.DEVICE_LOST;
    
    this.eventSystem.publish(eventType, deviceEvent);
  }

  /**
   * Monitor Appium server connection status
   */
  private monitorConnection(interval: number): void {
    this.logger.debug(`Starting connection monitor with interval ${interval}ms`);
    
    this.connectionMonitor = setInterval(async () => {
      try {
        const status = await this.driver.status();
        
        if (status && status.ready) {
          // Server is connected
          if (this.lastConnectionState !== 'connected') {
            this.lastConnectionState = 'connected';
            this.publishConnectionChange('connected');
          }
        } else {
          // Server is not ready
          if (this.lastConnectionState !== 'disconnected') {
            this.lastConnectionState = 'disconnected';
            this.publishConnectionChange('disconnected');
          }
        }
      } catch (error) {
        // Connection error
        if (this.lastConnectionState !== 'error') {
          this.lastConnectionState = 'error';
          this.publishConnectionChange('error', error);
        }
      }
    }, interval);
  }

  /**
   * Publish a connection state change event
   */
  private publishConnectionChange(state: 'connected' | 'disconnected' | 'error', details?: any): void {
    const connectionEvent: ConnectionEvent = {
      state,
      timestamp: Date.now(),
      details
    };
    
    this.eventSystem.publish(AppiumEventType.CONNECTION_CHANGE, connectionEvent);
    
    this.logger.info(`Connection state changed to ${state}`);
  }

  /**
   * Shutdown the event manager and clean up resources
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down AppiumEventManager');
    
    // Clear connection monitor
    if (this.connectionMonitor) {
      clearInterval(this.connectionMonitor);
      this.connectionMonitor = null;
    }
    
    // Could unregister event handlers here if the driver API supports it
    
    this.logger.info('AppiumEventManager shutdown complete');
  }
} 