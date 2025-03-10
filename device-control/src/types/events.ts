export enum AppiumEventType {
  LOG = 'appium:log',
  SERVER_START = 'appium:server:start',
  SERVER_STOP = 'appium:server:stop',
  SERVER_ERROR = 'appium:server:error',
  SESSION_CREATE = 'appium:session:create',
  SESSION_DELETE = 'appium:session:delete',
  SESSION_ERROR = 'appium:session:error',
  COMMAND_START = 'appium:command:start',
  COMMAND_END = 'appium:command:end',
  COMMAND_ERROR = 'appium:command:error',
  CONNECTION_CHANGE = 'appium:connection:change',
  DEVICE_DETECTED = 'appium:device:detected',
  DEVICE_LOST = 'appium:device:lost',
  APP_STATE_CHANGE = 'app:state:change',
  APP_CRASH = 'app:crash',
  NETWORK_ISSUE = 'network:issue'
}

export interface LogEvent {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: number;
  source?: string;
  details?: any;
}

export interface ServerEvent {
  state: 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
  timestamp: number;
  details?: any;
}

export interface SessionEvent {
  sessionId: string;
  state: 'creating' | 'created' | 'deleting' | 'deleted' | 'error';
  timestamp: number;
  capabilities?: Record<string, any>;
  error?: any;
}

export interface CommandEvent {
  sessionId: string;
  command: string;
  params?: any[];
  timestamp: number;
  duration?: number; // For command:end events
  result?: any; // For command:end events
  error?: any; // For command:error events
}

export interface ConnectionEvent {
  state: 'connected' | 'disconnected' | 'error';
  timestamp: number;
  details?: any;
}

export interface DeviceEvent {
  udid: string;
  name: string;
  type: 'simulator' | 'real';
  timestamp: number;
  details?: any;
}

export interface AppStateEvent {
  sessionId: string;
  bundleId: string;
  state: 'foreground' | 'background' | 'notRunning' | 'running';
  timestamp: number;
  details?: any;
}

export interface AppCrashEvent {
  sessionId: string;
  bundleId: string;
  timestamp: number;
  crashLog?: string;
  details?: any;
}

export interface NetworkEvent {
  sessionId: string;
  type: 'timeout' | 'disconnect' | 'error';
  timestamp: number;
  details?: any;
}

export type AppiumEvent = 
  | { type: AppiumEventType.LOG; data: LogEvent }
  | { type: AppiumEventType.SERVER_START; data: ServerEvent }
  | { type: AppiumEventType.SERVER_STOP; data: ServerEvent }
  | { type: AppiumEventType.SERVER_ERROR; data: ServerEvent }
  | { type: AppiumEventType.SESSION_CREATE; data: SessionEvent }
  | { type: AppiumEventType.SESSION_DELETE; data: SessionEvent }
  | { type: AppiumEventType.SESSION_ERROR; data: SessionEvent }
  | { type: AppiumEventType.COMMAND_START; data: CommandEvent }
  | { type: AppiumEventType.COMMAND_END; data: CommandEvent }
  | { type: AppiumEventType.COMMAND_ERROR; data: CommandEvent }
  | { type: AppiumEventType.CONNECTION_CHANGE; data: ConnectionEvent }
  | { type: AppiumEventType.DEVICE_DETECTED; data: DeviceEvent }
  | { type: AppiumEventType.DEVICE_LOST; data: DeviceEvent }
  | { type: AppiumEventType.APP_STATE_CHANGE; data: AppStateEvent }
  | { type: AppiumEventType.APP_CRASH; data: AppCrashEvent }
  | { type: AppiumEventType.NETWORK_ISSUE; data: NetworkEvent }; 