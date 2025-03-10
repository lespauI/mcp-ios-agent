/**
 * Performance Optimization Demo
 * 
 * This example demonstrates how to use the Performance Optimization Manager to
 * optimize the performance of your test automation.
 */

import { 
  SessionManager, 
  ElementLocator, 
  UIStateCaptureManager,
  PerformanceOptimizationManager,
  UIActions,
  AppControlActions,
  MetricCategory
} from '../src';
import { resolve } from 'path';

async function main() {
  console.log('Starting Performance Optimization Demo');
  
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
    
    // Initialize the Performance Optimization Manager
    console.log('Initializing Performance Optimization Manager...');
    const performanceManager = new PerformanceOptimizationManager(
      elementLocator,
      stateManager,
      appActions,
      {
        autoOptimize: true,
        autoOptimizeInterval: 30000, // 30 seconds
        monitorOptions: {
          thresholds: {
            minorDeviation: 0.2,   // 20%
            moderateDeviation: 0.5, // 50%
            severeDeviation: 1.0    // 100%
          }
        },
        resourceOptions: {
          caching: {
            enabled: true,
            ttl: 5000, // 5 seconds
            invalidationStrategy: 'lru'
          },
          batching: {
            enabled: true,
            maxBatchSize: 10,
            batchTimeoutMs: 100
          }
        },
        recoveryOptions: {
          recoveryStrategy: {
            maxRetries: 3,
            retryDelay: 1000,
            exponentialBackoff: true
          }
        }
      }
    );
    
    // Launch the app
    console.log('Launching app...');
    await appActions.launchApp();
    
    // Demo 1: Tracking Operation Performance
    console.log('\nDemo 1: Tracking Operation Performance');
    
    // Track a UI action
    console.log('Tracking tap operation...');
    try {
      await performanceManager.trackOperation(
        'tap_login_button',
        MetricCategory.UI_ACTION,
        async () => {
          // Find and tap on a button
          try {
            await uiActions.tap('accessibilityId', 'loginButton');
            return true;
          } catch (error) {
            console.log('Could not find login button, using alternative...');
            try {
              await uiActions.tap('xpath', '//XCUIElementTypeButton[@name="Login"]');
              return true;
            } catch {
              console.log('No login button found on screen');
              return false;
            }
          }
        },
        { screen: 'login' }
      );
    } catch (error) {
      console.log(`Operation failed: ${error}`);
    }
    
    // Track more operations to build metrics
    for (let i = 0; i < 5; i++) {
      console.log(`Performing sample operation ${i+1}...`);
      
      // Track element finding
      await performanceManager.trackOperation(
        'find_element',
        MetricCategory.ELEMENT_LOCATION,
        async () => {
          try {
            await elementLocator.findElement('accessibilityId', `element_${i}`);
          } catch {
            // Ignore errors, just for demonstration
          }
          return true;
        }
      );
      
      // Track state capture
      await performanceManager.trackOperation(
        'capture_screenshot',
        MetricCategory.STATE_CAPTURE,
        async () => {
          await stateManager.captureScreenshot();
          return true;
        }
      );
      
      // Add a small delay between operations
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Generate a performance report
    console.log('\nGenerating performance report...');
    const report = performanceManager.generatePerformanceReport();
    
    console.log(`Performance Report Summary:`);
    console.log(`- Total operations: ${report.totalOperations}`);
    console.log(`- Total duration: ${report.totalDuration}ms`);
    console.log('- Operations by category:');
    Object.entries(report.categoryCounts).forEach(([category, count]) => {
      if (count > 0) {
        console.log(`  * ${category}: ${count} operations`);
      }
    });
    
    console.log('- Top operations by duration:');
    report.summaries.slice(0, 3).forEach(summary => {
      console.log(`  * ${summary.name}: avg ${summary.averageDuration.toFixed(2)}ms, ${summary.successRate.toFixed(1)}% success`);
    });
    
    // Demo 2: Error Recovery
    console.log('\nDemo 2: Error Recovery');
    console.log('Executing operation with recovery...');
    
    try {
      // Execute an operation that might fail, with automatic recovery
      const result = await performanceManager.executeWithRecovery(
        async () => {
          // Simulate an operation that sometimes fails
          const randomValue = Math.random();
          if (randomValue < 0.5) {
            throw new Error('NoSuchElementError');
          }
          return 'Operation succeeded';
        },
        { operationType: 'test_recovery', screen: 'login' }
      );
      
      console.log(`Recovery demo result: ${result}`);
    } catch (error) {
      console.log(`Recovery failed after all retries: ${error}`);
    }
    
    // Demo 3: Resource Optimization
    console.log('\nDemo 3: Resource Optimization');
    
    // Track some resources
    console.log('Tracking resources...');
    for (let i = 0; i < 10; i++) {
      performanceManager.trackResource('element', `element_${i}`, { size: 1000 * i });
    }
    
    // Get resource statistics
    const resourceStats = performanceManager.getResourceManager().getStatistics();
    console.log('Resource statistics:');
    console.log(`- Total resources tracked: ${resourceStats.totalResourcesTracked}`);
    console.log(`- Unloaded resources: ${resourceStats.totalResourcesUnloaded}`);
    
    // Optimize memory usage
    console.log('Optimizing memory usage...');
    const optimized = performanceManager.optimizeMemoryUsage();
    console.log(`Optimized memory by unloading ${optimized} resources`);
    
    // Demo 4: Performance Optimization
    console.log('\nDemo 4: Performance Optimization');
    console.log('Applying performance optimizations...');
    
    const optimizationResults = await performanceManager.optimizePerformance();
    
    console.log('Optimization results:');
    optimizationResults.forEach(result => {
      console.log(`- Category: ${result.category}`);
      console.log(`  * Before: ${result.before.averageDuration.toFixed(2)}ms, ${result.before.successRate.toFixed(1)}% success`);
      console.log(`  * After: ${result.after.averageDuration.toFixed(2)}ms, ${result.after.successRate.toFixed(1)}% success`);
      console.log(`  * Improvement: ${result.improvement.durationPercentage.toFixed(1)}% faster, ${result.improvement.successRate.toFixed(1)}% more successful`);
    });
    
    // Demo 5: Error Pattern Analysis
    console.log('\nDemo 5: Error Pattern Analysis');
    
    // Simulate some errors
    const errorTypes = ['NoSuchElementError', 'TimeoutError', 'StaleElementReferenceError'];
    for (let i = 0; i < 20; i++) {
      try {
        await performanceManager.executeWithRecovery(
          async () => {
            // Randomly pick an error type
            const randomError = errorTypes[Math.floor(Math.random() * errorTypes.length)];
            throw new Error(randomError);
          },
          { operation: `test_${i}` }
        );
      } catch {
        // Ignore errors, just for demonstration
      }
    }
    
    // Analyze error patterns
    const errorAnalysis = performanceManager.analyzeErrorPatterns();
    
    console.log('Error analysis:');
    console.log(`- Total errors: ${errorAnalysis.totalErrors}`);
    console.log('- Errors by category:');
    Object.entries(errorAnalysis.errorsByCategory).forEach(([category, count]) => {
      console.log(`  * ${category}: ${count}`);
    });
    
    console.log('- Top error types:');
    errorAnalysis.topErrors.forEach(error => {
      console.log(`  * ${error.type}: ${error.occurrences} occurrences, recovery success: ${
        error.recoverySuccess / (error.recoverySuccess + error.recoveryFailure) * 100
      }%`);
    });
    
    // Get overall performance stats
    console.log('\nOverall Optimization Statistics:');
    const stats = performanceManager.getOptimizationStats();
    console.log(`- Performance: ${stats.performance.trackedOperations} operations, ${stats.performance.baselines} baselines`);
    console.log(`- Resources: ${stats.resources.totalResourcesTracked} tracked, ${stats.resources.totalResourcesUnloaded} unloaded`);
    console.log(`- Errors: ${stats.errors.trends} error trends, ${stats.errors.recoveryActions.length} recovery actions`);
    console.log(`- Memory usage: ${stats.memory}`);
    
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