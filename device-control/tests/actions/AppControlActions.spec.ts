import { AppControlActions } from '../../src/actions/AppControlActions';
import { ElementLocator } from '../../src/element/ElementLocator';

describe('AppControlActions', () => {
  let appControlActions: AppControlActions;
  let mockDriver: any;
  let mockElementLocator: any;

  beforeEach(() => {
    mockDriver = {
      execute: jest.fn(),
      executeScript: jest.fn(),
      terminateApp: jest.fn(),
      activateApp: jest.fn(),
      isAppInstalled: jest.fn(),
      installApp: jest.fn(),
      removeApp: jest.fn(),
      reset: jest.fn(),
      takeScreenshot: jest.fn(),
      launchApp: jest.fn(),
      closeApp: jest.fn(),
      queryAppState: jest.fn().mockResolvedValue(4), // Default to foreground state
      background: jest.fn(),
      isAppState: jest.fn(),
      getContext: jest.fn().mockResolvedValue('NATIVE_APP_com.example.app'),
    };

    mockElementLocator = jest.createMockFromModule('../../src/element/ElementLocator');
    
    appControlActions = new AppControlActions(mockDriver, mockElementLocator);
    // Mock verifyAppState to always return true to simplify tests
    jest.spyOn(appControlActions, 'verifyAppState').mockResolvedValue(true);
  });

  describe('launchApp', () => {
    it('should launch app with default options', async () => {
      await appControlActions.launchApp();
      
      expect(mockDriver.launchApp).toHaveBeenCalled();
    });

    it('should launch app with arguments and environment variables', async () => {
      const args = ['--debug'];
      const env = { TEST_MODE: 'true' };
      
      await appControlActions.launchApp({ args, env });
      
      expect(mockDriver.executeScript).toHaveBeenCalledWith('mobile: launchApp', {
        arguments: args,
        environment: env
      });
    });

    it('should launch app with deep link', async () => {
      const deepLink = 'myapp://settings';
      
      await appControlActions.launchApp({ deepLink });
      
      expect(mockDriver.executeScript).toHaveBeenCalledWith('mobile: launchApp', {
        uri: deepLink
      });
    });

    it('should retry launch on failure', async () => {
      mockDriver.launchApp
        .mockRejectedValueOnce(new Error('Launch failed'))
        .mockRejectedValueOnce(new Error('Launch failed'))
        .mockResolvedValueOnce(undefined);
      
      // Reset the mock to avoid interference from the beforeEach setup
      jest.spyOn(appControlActions, 'verifyAppState')
        .mockReset()
        .mockResolvedValue(true);
      
      await appControlActions.launchApp({ retries: 3 });
      
      expect(mockDriver.launchApp).toHaveBeenCalledTimes(3);
    });

    it('should handle launch failure with advanced parameters', async () => {
      mockDriver.executeScript.mockRejectedValueOnce(new Error('Launch failed'));
      
      await expect(appControlActions.launchApp({
        bundleId: 'test.bundle',
        args: ['--debug'],
        env: { TEST: 'true' },
        deepLink: 'myapp://test',
        retries: 1
      })).rejects.toThrow('Failed to launch app after 1 attempts');
    });

    it('should handle retry in test environment', async () => {
      mockDriver.launchApp
        .mockRejectedValueOnce(new Error('Launch failed'))
        .mockRejectedValueOnce(new Error('Launch failed'))
        .mockResolvedValueOnce(undefined);
      
      // Reset the mock to avoid interference from the beforeEach setup
      const verifyAppStateMock = jest.spyOn(appControlActions, 'verifyAppState')
        .mockReset()
        .mockResolvedValue(true);
      
      await appControlActions.launchApp({ isTestEnvironment: true, retries: 5 });
      
      expect(mockDriver.launchApp).toHaveBeenCalledTimes(3);
    });
  });

  describe('terminateApp', () => {
    beforeEach(() => {
      // Reset verifyAppState mock for terminate tests
      jest.spyOn(appControlActions, 'verifyAppState').mockResolvedValue(true);
    });

    it('should terminate app with default options', async () => {
      mockDriver.getContext.mockResolvedValue('NATIVE_APP_APP');
      await appControlActions.terminateApp();
      
      expect(mockDriver.terminateApp).toHaveBeenCalledWith('APP', { preserveState: undefined });
    });

    it('should terminate app with bundleId', async () => {
      const bundleId = 'com.example.app';
      
      await appControlActions.terminateApp({ bundleId });
      
      expect(mockDriver.terminateApp).toHaveBeenCalledWith(bundleId, { preserveState: undefined });
    });

    it('should terminate app with option to preserve state', async () => {
      mockDriver.getContext.mockResolvedValue('NATIVE_APP_APP');
      await appControlActions.terminateApp({ preserveState: true });
      
      expect(mockDriver.terminateApp).toHaveBeenCalledWith('APP', {
        preserveState: true
      });
    });

    it('should handle termination failure', async () => {
      mockDriver.terminateApp.mockRejectedValueOnce(new Error('App did not terminate correctly'));
      
      await expect(appControlActions.terminateApp({ bundleId: 'test.bundle' }))
        .rejects.toThrow('App did not terminate correctly');
    });

    it('should handle driver error during termination', async () => {
      mockDriver.terminateApp.mockRejectedValueOnce(new Error('Driver error'));
      
      await expect(appControlActions.terminateApp({ bundleId: 'test.bundle' }))
        .rejects.toThrow('Driver error');
    });
  });

  describe('resetApp', () => {
    it('should perform a full reset of the app', async () => {
      mockDriver.executeScript.mockResolvedValue(undefined);
      mockDriver.getContext.mockResolvedValue('NATIVE_APP_APP');
      
      await appControlActions.resetApp({ fullReset: true });
      
      expect(mockDriver.executeScript).toHaveBeenCalledWith('mobile: resetApp', {
        bundleId: 'APP',
        fullReset: true,
        preserveKeychain: false,
        preserveSettings: false
      });
    });

    it('should perform a data reset without reinstall', async () => {
      const bundleId = 'com.example.app';
      mockDriver.executeScript.mockResolvedValue(undefined);
      
      await appControlActions.resetApp({ bundleId });
      
      expect(mockDriver.executeScript).toHaveBeenCalledWith('mobile: resetApp', {
        bundleId,
        fullReset: false,
        preserveKeychain: false,
        preserveSettings: false
      });
    });

    it('should perform a selective reset', async () => {
      const bundleId = 'com.example.app';
      mockDriver.executeScript.mockResolvedValue(undefined);
      
      await appControlActions.resetApp({ 
        bundleId,
        preserveKeychain: true 
      });
      
      expect(mockDriver.executeScript).toHaveBeenCalledWith('mobile: resetApp', {
        bundleId,
        fullReset: false,
        preserveKeychain: true,
        preserveSettings: false
      });
    });

    it('should handle reset failure', async () => {
      mockDriver.executeScript.mockRejectedValueOnce(new Error('Reset failed'));
      mockDriver.getContext.mockResolvedValue('');
      
      await expect(appControlActions.resetApp())
        .rejects.toThrow('No bundle ID provided or current bundle ID could not be determined');
    });

    it('should handle selective reset with preservation options', async () => {
      const bundleId = 'test.bundle';
      mockDriver.executeScript.mockResolvedValue(undefined);
      
      await appControlActions.resetApp({
        bundleId,
        preserveKeychain: true,
        preserveSettings: true
      });
      
      expect(mockDriver.executeScript).toHaveBeenCalledWith('mobile: resetApp', {
        bundleId,
        fullReset: false,
        preserveKeychain: true,
        preserveSettings: true
      });
    });
  });

  describe('verifyAppState', () => {
    beforeEach(() => {
      // Restore original implementation for these tests
      jest.spyOn(appControlActions, 'verifyAppState').mockRestore();
    });

    it('should verify app is in foreground', async () => {
      mockDriver.queryAppState.mockResolvedValue(4); // 4 = running in foreground
      
      const result = await appControlActions.verifyAppState({ state: 'foreground' });
      
      expect(result).toBe(true);
      expect(mockDriver.queryAppState).toHaveBeenCalled();
    });

    it('should verify app is in background', async () => {
      mockDriver.queryAppState.mockResolvedValue(3); // 3 = running in background
      
      const result = await appControlActions.verifyAppState({ state: 'background' });
      
      expect(result).toBe(true);
      expect(mockDriver.queryAppState).toHaveBeenCalled();
    });

    it('should verify app is not running', async () => {
      mockDriver.queryAppState.mockResolvedValue(1); // 1 = not running
      
      const result = await appControlActions.verifyAppState({ state: 'notRunning' });
      
      expect(result).toBe(true);
      expect(mockDriver.queryAppState).toHaveBeenCalled();
    });

    it('should check app responsiveness', async () => {
      mockDriver.executeScript.mockResolvedValue({ responsive: true });
      
      const result = await appControlActions.verifyAppState({ checkResponsiveness: true });
      
      expect(result).toBe(true);
      expect(mockDriver.executeScript).toHaveBeenCalledWith('mobile: checkAppState', { 
        checkResponsiveness: true 
      });
    });

    it('should detect app crash', async () => {
      mockDriver.queryAppState.mockResolvedValue(0); // 0 = crashed
      
      const result = await appControlActions.verifyAppState({ state: 'running' });
      
      expect(result).toBe(false);
      expect(mockDriver.queryAppState).toHaveBeenCalled();
    });
  });

  describe('setBackgroundState', () => {
    it('should put app in background and return to foreground', async () => {
      jest.spyOn(appControlActions, 'verifyAppState').mockResolvedValue(true);
      
      await appControlActions.setBackgroundState({ duration: 1 });
      
      expect(mockDriver.background).toHaveBeenCalledWith(1);
    });

    it('should handle foreground verification failure', async () => {
      jest.spyOn(appControlActions, 'verifyAppState').mockResolvedValue(false);
      
      await expect(appControlActions.setBackgroundState({ duration: 1 }))
        .rejects.toThrow('App did not return to foreground');
    });

    it('should handle background operation failure', async () => {
      mockDriver.background.mockRejectedValueOnce(new Error('Background failed'));
      
      await expect(appControlActions.setBackgroundState({ duration: 1 }))
        .rejects.toThrow('Background failed');
    });
  });

  describe('verifyAppIdentity', () => {
    it('should verify app bundle ID, name and version', async () => {
      mockDriver.isAppInstalled.mockResolvedValue(true);
      mockDriver.executeScript.mockResolvedValue({
        name: 'TestApp',
        version: '1.0.0'
      });
      
      const result = await appControlActions.verifyAppIdentity({
        bundleId: 'test.bundle',
        bundleName: 'TestApp',
        bundleVersion: '1.0.0'
      });
      
      expect(result).toBe(true);
    });

    it('should return false if app not installed', async () => {
      mockDriver.isAppInstalled.mockResolvedValue(false);
      
      const result = await appControlActions.verifyAppIdentity({
        bundleId: 'test.bundle'
      });
      
      expect(result).toBe(false);
    });

    it('should return false if name or version mismatch', async () => {
      mockDriver.isAppInstalled.mockResolvedValue(true);
      mockDriver.executeScript.mockResolvedValue({
        name: 'WrongApp',
        version: '2.0.0'
      });
      
      const result = await appControlActions.verifyAppIdentity({
        bundleId: 'test.bundle',
        bundleName: 'TestApp',
        bundleVersion: '1.0.0'
      });
      
      expect(result).toBe(false);
    });

    it('should verify app identity matches expected values', async () => {
      const options = {
        bundleId: 'test.bundle',
        bundleName: 'TestApp',
        bundleVersion: '1.0.0'
      };
      
      mockDriver.isAppInstalled.mockResolvedValue(true);
      mockDriver.executeScript.mockResolvedValue({
        name: 'TestApp',
        version: '1.0.0'
      });
      
      const result = await appControlActions.verifyAppIdentity(options);
      
      expect(result).toBe(true);
      expect(mockDriver.isAppInstalled).toHaveBeenCalledWith('test.bundle');
      expect(mockDriver.executeScript).toHaveBeenCalledWith('mobile: getAppInfo', { 
        bundleId: 'test.bundle' 
      });
    });
  });

  describe('detectCrash', () => {
    it('should detect app crash', async () => {
      mockDriver.queryAppState.mockResolvedValue(0);
      
      const result = await appControlActions.detectCrash({
        bundleId: 'test.bundle'
      });
      
      expect(result).toBe(true);
    });

    it('should handle crash recovery', async () => {
      mockDriver.queryAppState
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(4);
      
      const result = await appControlActions.detectCrash({
        bundleId: 'test.bundle',
        autoRecover: true
      });
      
      expect(result).toBe(true);
      expect(mockDriver.launchApp).toHaveBeenCalled();
    });

    it('should handle error during crash detection', async () => {
      mockDriver.queryAppState.mockRejectedValueOnce(new Error('Query failed'));
      
      await expect(appControlActions.detectCrash({
        bundleId: 'test.bundle'
      })).rejects.toThrow('Query failed');
    });
  });
}); 