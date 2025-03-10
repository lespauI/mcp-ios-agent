/**
 * Advanced Synchronization Framework Demo
 * 
 * This example demonstrates how to use the Synchronization Manager to create
 * sophisticated waiting and synchronization strategies.
 */

import { 
  SessionManager, 
  ElementLocator, 
  UIStateCaptureManager,
  SynchronizationManager,
  UIActions,
  AppControlActions,
  TimeoutProfile,
  CompoundCondition
} from '../src';
import { resolve } from 'path';

async function main() {
  console.log('Starting Advanced Synchronization Demo');
  
  // Initialize the session manager
  const sessionManager = new SessionManager(
    async () => {
      const remote = require('webdriverio').remote;
      return await remote({
        capabilities: {
          platformName: 'iOS',
          'appium:deviceName': 'iPhone Simulator',
          'appium:platformVersion': '16.4',
          'appium:automationName': 'XCUITest',
          'appium:app': resolve(__dirname, '../../path/to/your.app'), // Update this path
          'appium:noReset': true
        }
      });
    }
  );
  
  try {
    // Create a session
    console.log('Creating Appium session...');
    const session = await sessionManager.createSession();
    console.log(`Session created with ID: ${session.id}`);
    
    // Get the driver for this session
    const driver = (await sessionManager as any).sessions.get(session.id).driver;
    
    // Initialize required components
    const elementLocator = new ElementLocator(driver);
    const uiActions = new UIActions(driver, elementLocator);
    const appActions = new AppControlActions(driver, elementLocator);
    const stateManager = new UIStateCaptureManager(
      driver, 
      elementLocator,
      { outputDirectory: resolve(__dirname, '../screenshots') }
    );
    
    // Initialize the Synchronization Manager
    console.log('Initializing Synchronization Manager...');
    
    // Create custom timeout profiles
    const fastProfile: TimeoutProfile = {
      name: 'fast',
      description: 'Fast timeouts for quick tests',
      config: {
        global: 5000, // 5 seconds
        operation: {
          click: 2000,
          find: 2000,
        },
        elementType: {
          button: 3000,
          input: 4000
        }
      }
    };
    
    const slowProfile: TimeoutProfile = {
      name: 'slow',
      description: 'Slow timeouts for unreliable networks',
      config: {
        global: 30000, // 30 seconds
        operation: {
          click: 15000,
          find: 15000,
        },
        elementType: {
          button: 20000,
          input: 25000
        }
      },
      dynamicAdjustment: true
    };
    
    const syncManager = new SynchronizationManager(
      driver,
      elementLocator,
      stateManager,
      {
        initialProfiles: {
          fast: fastProfile,
          slow: slowProfile
        },
        timeoutAlertConfig: {
          threshold: 70, // Alert at 70% of timeout
          logLevel: 'warn'
        },
        stateValidationOptions: {
          validateScreenState: true,
          captureBeforeWait: true,
          captureAfterWait: true
        }
      }
    );
    
    // Launch the app
    console.log('Launching app...');
    await appActions.launchApp();
    
    // Use the synchronization manager to wait for elements
    console.log('Waiting for app to load...');
    
    // Set the active timeout profile
    syncManager.setActiveProfile('fast');
    console.log(`Active profile: ${syncManager.getActiveProfile().name}`);
    
    // Demo 1: Simple Element Wait
    console.log('\nDemo 1: Simple Element Wait');
    try {
      console.log('Waiting for element to be visible...');
      const result = await syncManager.waitForElementVisible('accessibilityId', 'loginButton', {
        timeout: 10000,
        errorMessage: 'Login button not found',
        requireVisible: true
      });
      
      if (result.success) {
        console.log(`Found element in ${result.elapsedTime}ms after ${result.operations} checks`);
        console.log(`Performance: ${JSON.stringify(result.performance)}`);
        
        // Perform action on the element
        if (result.value) {
          await uiActions.tap('accessibilityId', 'loginButton');
          console.log('Tapped on login button');
        }
      }
    } catch (error) {
      console.log(`Element wait failed: ${error}`);
    }
    
    // Demo 2: Compound Condition
    console.log('\nDemo 2: Compound Condition');
    try {
      // Create a compound condition
      const condition: CompoundCondition = {
        type: 'and',
        conditions: [
          {
            strategy: 'accessibilityId',
            selector: 'usernameField',
            condition: 'exists'
          },
          {
            strategy: 'accessibilityId',
            selector: 'passwordField',
            condition: 'exists'
          }
        ]
      };
      
      console.log('Waiting for login form to be ready (username AND password fields exist)...');
      const result = await syncManager.waitForCompoundCondition(condition, {
        timeout: 10000,
        interval: 500
      });
      
      if (result.success) {
        console.log(`Compound condition met in ${result.elapsedTime}ms after ${result.operations} checks`);
        
        // Enter credentials
        await uiActions.enterText('accessibilityId', 'usernameField', 'testuser');
        await uiActions.enterText('accessibilityId', 'passwordField', 'password');
        console.log('Entered login credentials');
      }
    } catch (error) {
      console.log(`Compound condition wait failed: ${error}`);
    }
    
    // Demo 3: Custom Condition
    console.log('\nDemo 3: Custom Condition');
    try {
      // Change to slow profile for this operation
      syncManager.setActiveProfile('slow');
      
      console.log('Waiting for custom condition (login success or error message)...');
      const result = await syncManager.waitForCustom(async () => {
        try {
          // Check for success condition (dashboard element)
          const dashboardElement = await elementLocator.findElement('accessibilityId', 'dashboard', {
            timeout: 1000
          });
          if (await dashboardElement.isDisplayed()) {
            console.log('Login successful - dashboard found');
            return true;
          }
        } catch {}
        
        try {
          // Check for error condition (error message)
          const errorElement = await elementLocator.findElement('accessibilityId', 'errorMessage', {
            timeout: 1000
          });
          if (await errorElement.isDisplayed()) {
            console.log('Login failed - error message found');
            return true;
          }
        } catch {}
        
        // Neither condition met yet
        return false;
      });
      
      if (result.success) {
        console.log(`Custom condition met in ${result.elapsedTime}ms`);
      }
    } catch (error) {
      console.log(`Custom condition wait failed: ${error}`);
    }
    
    // Demo 4: Wait for Element Text
    console.log('\nDemo 4: Wait for Element Text');
    try {
      console.log('Waiting for welcome message text...');
      const result = await syncManager.waitForElementText(
        'accessibilityId', 
        'welcomeMessage', 
        'Welcome to the App!',
        {
          timeout: 5000,
          interval: 500
        }
      );
      
      if (result.success) {
        console.log(`Text found in ${result.elapsedTime}ms`);
      }
    } catch (error) {
      console.log(`Text wait failed: ${error}`);
    }
    
    // Display metrics
    console.log('\nWait Performance Metrics:');
    const metrics = syncManager.getWaitMetrics() as Map<string, any>;
    metrics.forEach((metric, operationType) => {
      console.log(`- ${operationType}: ${metric.totalOperations} operations, avg ${metric.averageWaitTime.toFixed(1)}ms, ${metric.successRate.toFixed(1)}% success rate`);
    });
    
    // Clean up and close the session
    console.log('\nDemo completed, terminating session...');
    await sessionManager.terminateSession(session.id);
    
  } catch (error) {
    console.error('Demo failed with error:', error);
  } finally {
    // Shut down the session manager
    console.log('Shutting down session manager...');
    await sessionManager.shutdown();
  }
}

// Run the demo
main().catch(console.error); 