/**
 * UI State Capture Manager Demo
 * 
 * This example demonstrates how to use the UI State Capture Manager to capture and analyze the UI state
 * of an iOS application.
 */

import { 
  SessionManager, 
  ElementLocator, 
  UIStateCaptureManager,
  UIActions,
  AppControlActions
} from '../src';
import { resolve } from 'path';

async function main() {
  console.log('Starting UI State Capture Demo');
  
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
    
    // Initialize the UI State Capture Manager
    const stateCaptureManager = new UIStateCaptureManager(
      driver, 
      elementLocator,
      { outputDirectory: resolve(__dirname, '../screenshots') }
    );
    
    // Launch the app
    console.log('Launching app...');
    await appActions.launchApp();
    
    // Capture the initial state
    console.log('Capturing initial state...');
    const initialState = await stateCaptureManager.captureState({
      screenshot: true,
      hierarchy: true,
      properties: true
    });
    
    console.log(`Initial state captured with ID: ${initialState.id}`);
    console.log(`Screenshot saved to: ${initialState.screenshot?.filePath}`);
    console.log(`Hierarchy contains ${initialState.hierarchy?.elementCount} elements`);
    console.log(`Captured properties for ${initialState.properties?.length} elements`);
    
    // Perform some UI actions
    console.log('Performing UI actions...');
    
    // Find and tap on a button (adjust selector as needed)
    try {
      await uiActions.tap('accessibilityId', 'loginButton');
      console.log('Tapped on login button');
    } catch (error) {
      console.log('Could not find login button, continuing...');
    }
    
    // Wait a moment for UI to update
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Capture the state after actions
    console.log('Capturing state after actions...');
    const updatedState = await stateCaptureManager.captureState({
      screenshot: true,
      hierarchy: true,
      properties: true
    });
    
    console.log(`Updated state captured with ID: ${updatedState.id}`);
    
    // Compare the two states
    console.log('Comparing states...');
    const comparison = stateCaptureManager.compareStates(initialState, updatedState);
    
    if (comparison.matches) {
      console.log('States are identical - no changes detected');
    } else {
      console.log('States are different:');
      
      if (comparison.differences?.added.length) {
        console.log(`- ${comparison.differences.added.length} new elements added`);
      }
      
      if (comparison.differences?.removed.length) {
        console.log(`- ${comparison.differences.removed.length} elements removed`);
      }
      
      const changedElementCount = Object.keys(comparison.differences?.changed || {}).length;
      if (changedElementCount > 0) {
        console.log(`- ${changedElementCount} elements changed properties`);
        
        // Show some examples of changed properties
        const changedElements = Object.keys(comparison.differences?.changed || {});
        if (changedElements.length > 0) {
          const firstChangedElement = changedElements[0];
          const changes = comparison.differences?.changed[firstChangedElement];
          
          console.log('Example changes for element:');
          changes?.forEach(change => {
            console.log(`  - Property '${change.property}' changed from '${change.oldValue}' to '${change.newValue}'`);
          });
        }
      }
    }
    
    // Clean up and close the session
    console.log('Demo completed, terminating session...');
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