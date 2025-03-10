// Increase the default timeout for all tests
jest.setTimeout(10000);

// Create a more comprehensive mock of WebdriverIO browser
const mockElement = {
  elementId: 'mock-element-id',
  selector: 'mock-selector',
  isDisplayed: jest.fn().mockResolvedValue(true),
  isEnabled: jest.fn().mockResolvedValue(true),
  getText: jest.fn().mockResolvedValue('mock text'),
  getValue: jest.fn().mockResolvedValue('mock value'),
  getAttribute: jest.fn().mockResolvedValue('mock attribute'),
  getTagName: jest.fn().mockResolvedValue('div'),
  getRect: jest.fn().mockResolvedValue({ x: 0, y: 0, width: 100, height: 100 }),
  click: jest.fn().mockResolvedValue(undefined),
  setValue: jest.fn().mockResolvedValue(undefined),
  clearValue: jest.fn().mockResolvedValue(undefined),
  waitForDisplayed: jest.fn().mockResolvedValue(true),
  waitForExist: jest.fn().mockResolvedValue(true)
};

const mockBrowser = {
  $: jest.fn().mockResolvedValue(mockElement),
  $$: jest.fn().mockResolvedValue([mockElement]),
  sessionId: 'mock-session-id',
  capabilities: {
    platformName: 'iOS',
    deviceName: 'iPhone Simulator',
    platformVersion: '15.0'
  },
  execute: jest.fn().mockResolvedValue(null),
  executeScript: jest.fn().mockResolvedValue(null),
  getWindowRect: jest.fn().mockResolvedValue({ x: 0, y: 0, width: 375, height: 812 }),
  getWindowSize: jest.fn().mockResolvedValue({ width: 375, height: 812 }),
  takeScreenshot: jest.fn().mockResolvedValue('base64Screenshot'),
  getPageSource: jest.fn().mockResolvedValue('<xml>mock page source</xml>'),
  performActions: jest.fn().mockResolvedValue(undefined),
  releaseActions: jest.fn().mockResolvedValue(undefined),
  setTimeout: jest.fn().mockResolvedValue(undefined),
  launchApp: jest.fn().mockResolvedValue(undefined),
  terminateApp: jest.fn().mockResolvedValue(undefined),
  activateApp: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
  once: jest.fn(),
  addListener: jest.fn(),
  removeListener: jest.fn()
};

// Mock WebdriverIO's remote function
jest.mock('webdriverio', () => ({
  remote: jest.fn().mockResolvedValue(mockBrowser)
}));

// Add global access to the mocks for tests that need to customize behavior
global.mockElement = mockElement;
global.mockBrowser = mockBrowser;

// Fix issues with fs.promises in Node.js versions
if (typeof jest !== 'undefined') {
  const fs = require('fs');
  if (!fs.promises) {
    const util = require('util');
    fs.promises = {
      access: util.promisify(fs.access),
      readFile: util.promisify(fs.readFile),
      writeFile: util.promisify(fs.writeFile),
      mkdir: util.promisify(fs.mkdir),
      stat: util.promisify(fs.stat),
      unlink: util.promisify(fs.unlink),
      readdir: util.promisify(fs.readdir)
    };
  }
}

// Global teardown to ensure all resources are properly cleaned up
afterAll(async () => {
  // Clean up all timers
  jest.useRealTimers();
  
  try {
    // Force cleanup of any Redis connections
    const redisManagerPath = './src/utils/RedisClientManager';
    try {
      const { RedisClientManager } = require(redisManagerPath);
      if (RedisClientManager.getAllInstances && typeof RedisClientManager.getAllInstances === 'function') {
        const redisManagers = RedisClientManager.getAllInstances();
        if (Array.isArray(redisManagers)) {
          await Promise.all(redisManagers.map(manager => manager.disconnect().catch(() => {})));
        }
      }
    } catch (moduleError) {
      console.warn(`Error loading module ${redisManagerPath}:`, moduleError.message);
    }
    
    // Force cleanup of MemoryManager timers
    const memoryManagerPath = './src/utils/MemoryManager';
    try {
      const { MemoryManager } = require(memoryManagerPath);
      const memoryManager = MemoryManager.getInstance();
      if (memoryManager && typeof memoryManager.stopMonitoring === 'function') {
        memoryManager.stopMonitoring();
      }
    } catch (moduleError) {
      console.warn(`Error loading module ${memoryManagerPath}:`, moduleError.message);
    }
    
    // Clean up any event listeners
    const eventSystemPath = './src/session/EventSystem';
    try {
      const { EventSystem } = require(eventSystemPath);
      if (EventSystem.getInstance && typeof EventSystem.getInstance === 'function') {
        const eventSystem = EventSystem.getInstance();
        if (eventSystem && typeof eventSystem.clearAllListeners === 'function') {
          eventSystem.clearAllListeners();
        }
      }
    } catch (moduleError) {
      console.warn(`Error loading module ${eventSystemPath}:`, moduleError.message);
    }
  } catch (error) {
    console.warn('Error during global cleanup:', error);
  }
  
  // Allow time for cleanup operations to complete
  await new Promise(resolve => setTimeout(resolve, 500));
}); 