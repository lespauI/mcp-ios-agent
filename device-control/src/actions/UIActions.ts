import { ElementLocator } from '../element/ElementLocator';
import { 
  ElementLocatorStrategy, 
  Coordinate, 
  TapOptions, 
  LongPressOptions, 
  TextInputOptions, 
  SwipeOptions, 
  ScrollOptions,
  ClipboardOptions
} from '../types';
import { sleep } from '../utils/helpers';
import { InputHandler } from './InputHandler';
import { ActionVerifier } from './ActionVerifier';
import { VisualChecker } from './VisualChecker';
import { ElementStateChecker } from './ElementStateChecker';

/**
 * Default options
 */
const DEFAULT_TAP_OPTIONS: TapOptions = {
  timeout: undefined,
  force: false,
  verifyEnabled: true,
  verifyVisible: true
};

const DEFAULT_LONG_PRESS_OPTIONS: LongPressOptions = {
  duration: 1000,
  pressure: 1
};

const DEFAULT_TEXT_INPUT_OPTIONS: TextInputOptions = {
  clearFirst: false,
  hideKeyboard: true,
  verifyInput: true
};

const DEFAULT_SWIPE_OPTIONS: SwipeOptions = {
  duration: 500,
  speed: 1
};

const DEFAULT_SCROLL_OPTIONS: ScrollOptions = {
  direction: 'down',
  distance: 200,
  duration: 500,
  maxScrolls: 10
};

/**
 * Manages UI interaction actions on iOS devices
 */
export class UIActions {
  /**
   * Creates a new UIActions instance
   * 
   * @param driver WebdriverIO driver instance
   * @param elementLocator ElementLocator instance
   */
  constructor(
    private driver: WebdriverIO.Browser,
    private elementLocator: ElementLocator
  ) {}
  
  /**
   * Tap on an element
   * 
   * @param strategy Element location strategy
   * @param value Element selector
   * @param options Tap options
   * @returns Promise that resolves when tap is complete
   */
  async tap(strategy: ElementLocatorStrategy, value: string, options: Partial<TapOptions> = {}): Promise<void> {
    const mergedOptions = { ...DEFAULT_TAP_OPTIONS, ...options };
    
    // Find the element (with timeout if specified)
    const element = mergedOptions.timeout
      ? await this.elementLocator.waitForElement(strategy, value, mergedOptions.timeout)
      : await this.elementLocator.findElement(strategy, value);
    
    if (mergedOptions.verifyEnabled) {
      const isEnabled = await element.isEnabled();
      if (!isEnabled) {
        throw new Error('Element is not enabled');
      }
    }

    if (mergedOptions.verifyVisible) {
      const isVisible = await element.isDisplayed();
      if (!isVisible) {
        throw new Error('Element is not visible');
      }
    }

    if (mergedOptions.force) {
      await element.touchAction('tap');
    } else {
      await element.click();
    }
  }
  
  /**
   * Long press on an element
   * 
   * @param strategy Element location strategy
   * @param selector Element selector
   * @param options Long press options
   * @returns Promise that resolves when long press is complete
   */
  async longPress(
    strategy: ElementLocatorStrategy,
    selector: string,
    options: Partial<LongPressOptions> = {}
  ): Promise<void> {
    const mergedOptions: LongPressOptions = { ...DEFAULT_LONG_PRESS_OPTIONS, ...options };
    
    // Find the element
    const element = await this.elementLocator.findElement(strategy, selector);
    
    if (mergedOptions.duration === DEFAULT_LONG_PRESS_OPTIONS.duration) {
      // Use simpler touchAction for default duration
      await element.touchAction('longPress');
    } else {
      // Use W3C actions for custom duration
      const location = await element.getLocation();
      const size = await element.getSize();
      
      // Calculate center point of the element
      const centerX = location.x + (size.width / 2);
      const centerY = location.y + (size.height / 2);
      
      await this.driver.performActions([
        {
          type: 'pointer',
          id: 'finger1',
          parameters: { pointerType: 'touch' },
          actions: [
            { type: 'pointerMove', duration: 0, x: centerX, y: centerY },
            { type: 'pointerDown', button: 0 },
            { type: 'pause', duration: mergedOptions.duration },
            { type: 'pointerUp', button: 0 }
          ]
        }
      ]);
    }
  }
  
  /**
   * Tap an element multiple times in succession
   * 
   * @param strategy Element location strategy
   * @param selector Element selector
   * @param count Number of taps to perform
   * @param interval Time between taps in milliseconds
   * @returns Promise that resolves when all taps are complete
   */
  async multiTap(
    strategy: ElementLocatorStrategy,
    selector: string,
    count: number,
    interval: number = 100
  ): Promise<void> {
    if (count <= 0) {
      throw new Error('Tap count must be greater than 0');
    }
    
    // Find the element
    const element = await this.elementLocator.findElement(strategy, selector);
    
    // Perform multiple taps
    for (let i = 0; i < count; i++) {
      await element.click();
      
      // Wait between taps (except after the last one)
      if (i < count - 1) {
        await sleep(interval);
      }
    }
  }
  
  /**
   * Enter text into an input field
   * 
   * @param strategy Element location strategy
   * @param selector Element selector
   * @param text Text to enter
   * @param options Text input options
   * @returns Promise that resolves when text entry is complete
   */
  async enterText(
    strategy: ElementLocatorStrategy,
    selector: string,
    text: string,
    options: Partial<TextInputOptions> = {}
  ): Promise<void> {
    const mergedOptions: TextInputOptions = { ...DEFAULT_TEXT_INPUT_OPTIONS, ...options };
    
    // Find the element
    const element = await this.elementLocator.findElement(strategy, selector);
    
    // Check if it's a secure text field
    const elementType = await element.getAttribute('type');
    const isSecureField = elementType && elementType.includes('Secure');
    
    // Clear the field first if specified
    if (mergedOptions.clearFirst) {
      await element.clearValue();
    }
    
    // Use different approach for secure fields if needed
    if (isSecureField) {
      // Use JavaScript executor for secure fields to avoid keyboard issues
      await this.driver.executeScript(
        'mobile: setValue',
        [{ element, text }]
      );
    } else {
      // Use standard setValue for regular input fields
      await element.setValue(text);
    }
    
    // Verify input if specified
    if (mergedOptions.verifyInput && !isSecureField) {
      const value = await element.getText();
      if (value !== text) {
        throw new Error(`Text verification failed. Expected: "${text}", Actual: "${value}"`);
      }
    }
    
    // Hide keyboard if specified
    if (mergedOptions.hideKeyboard) {
      try {
        await this.driver.executeScript('mobile: hideKeyboard', [{}]);
      } catch (error) {
        // Ignore errors when hiding keyboard
      }
    }
  }
  
  /**
   * Clear text from an input field
   * 
   * @param strategy Element location strategy
   * @param selector Element selector
   * @returns Promise that resolves when clearing is complete
   */
  async clearText(
    strategy: ElementLocatorStrategy,
    selector: string
  ): Promise<void> {
    // Find the element
    const element = await this.elementLocator.findElement(strategy, selector);
    
    // Clear the value
    await element.clearValue();
  }
  
  /**
   * Swipe from one coordinate to another
   * 
   * @param from Starting coordinate
   * @param to Ending coordinate
   * @param options Swipe options
   * @returns Promise that resolves when swipe is complete
   */
  async swipe(
    from: Coordinate,
    to: Coordinate,
    options: Partial<SwipeOptions> = {}
  ): Promise<void> {
    const mergedOptions: SwipeOptions = { ...DEFAULT_SWIPE_OPTIONS, ...options };
    
    // Perform swipe using W3C actions
    await this.driver.performActions([
      {
        type: 'pointer',
        id: 'finger1',
        parameters: { pointerType: 'touch' },
        actions: [
          { type: 'pointerMove', duration: 0, x: from.x, y: from.y },
          { type: 'pointerDown', button: 0 },
          { type: 'pointerMove', duration: mergedOptions.duration, x: to.x, y: to.y },
          { type: 'pointerUp', button: 0 }
        ]
      }
    ]);
    
    // Release actions to clean up
    await this.driver.releaseActions();
  }
  
  /**
   * Swipe from one element to another
   * 
   * @param fromStrategy Element location strategy for starting element
   * @param fromSelector Element selector for starting element
   * @param toStrategy Element location strategy for ending element
   * @param toSelector Element selector for ending element
   * @param options Swipe options
   * @returns Promise that resolves when swipe is complete
   */
  async swipeFromElementToElement(
    fromStrategy: ElementLocatorStrategy,
    fromSelector: string,
    toStrategy: ElementLocatorStrategy,
    toSelector: string,
    options: Partial<SwipeOptions> = {}
  ): Promise<void> {
    // Find both elements
    const fromElement = await this.elementLocator.findElement(fromStrategy, fromSelector);
    const toElement = await this.elementLocator.findElement(toStrategy, toSelector);
    
    // Get element locations and sizes
    const fromLocation = await fromElement.getLocation();
    const fromSize = await fromElement.getSize();
    const toLocation = await toElement.getLocation();
    const toSize = await toElement.getSize();
    
    // Calculate center points
    const fromCenter: Coordinate = {
      x: fromLocation.x + (fromSize.width / 2),
      y: fromLocation.y + (fromSize.height / 2)
    };
    
    const toCenter: Coordinate = {
      x: toLocation.x + (toSize.width / 2),
      y: toLocation.y + (toSize.height / 2)
    };
    
    // Perform the swipe
    await this.swipe(fromCenter, toCenter, options);
  }
  
  /**
   * Scroll down on the screen
   * 
   * @param options Scroll options
   * @returns Promise that resolves when scroll is complete
   */
  async scrollDown(options: Partial<ScrollOptions> = {}): Promise<void> {
    const mergedOptions: ScrollOptions = { 
      ...DEFAULT_SCROLL_OPTIONS, 
      ...options,
      direction: 'down'
    };
    
    // Get screen dimensions
    const size = await this.driver.getWindowSize();
    
    // Calculate scroll coordinates
    const startX = size.width / 2;
    const startY = size.height * 0.7;
    const endX = startX;
    const endY = startY - (mergedOptions.distance || 200);
    
    // Perform the scroll
    await this.swipe(
      { x: startX, y: startY },
      { x: endX, y: endY },
      { duration: mergedOptions.duration }
    );
  }
  
  /**
   * Scroll up on the screen
   * 
   * @param options Scroll options
   * @returns Promise that resolves when scroll is complete
   */
  async scrollUp(options: Partial<ScrollOptions> = {}): Promise<void> {
    const mergedOptions: ScrollOptions = { 
      ...DEFAULT_SCROLL_OPTIONS, 
      ...options,
      direction: 'up'
    };
    
    // Get screen dimensions
    const size = await this.driver.getWindowSize();
    
    // Calculate scroll coordinates
    const startX = size.width / 2;
    const startY = size.height * 0.3;
    const endX = startX;
    const endY = startY + (mergedOptions.distance || 200);
    
    // Perform the scroll
    await this.swipe(
      { x: startX, y: startY },
      { x: endX, y: endY },
      { duration: mergedOptions.duration }
    );
  }
  
  /**
   * Scroll until an element is visible
   * 
   * @param strategy Element location strategy
   * @param selector Element selector
   * @param options Scroll options
   * @returns Promise that resolves when element is found or max scrolls reached
   */
  async scrollUntilElementVisible(
    strategy: ElementLocatorStrategy,
    selector: string,
    options: Partial<ScrollOptions> = {}
  ): Promise<void> {
    const mergedOptions: ScrollOptions = { ...DEFAULT_SCROLL_OPTIONS, ...options };
    let scrollCount = 0;
    
    while (scrollCount < (mergedOptions.maxScrolls || 10)) {
      // Try to find the element
      try {
        await this.elementLocator.findElement(strategy, selector);
        return; // Element found, return
      } catch (error) {
        // Element not found, scroll and try again
        if (mergedOptions.direction === 'up') {
          await this.scrollUp(mergedOptions);
        } else {
          await this.scrollDown(mergedOptions);
        }
        
        scrollCount++;
      }
    }
    
    // Element not found after maximum scrolls
    throw new Error(`Element not found after ${scrollCount} scrolls: ${strategy}=${selector}`);
  }
  
  /**
   * Drag and drop from one element to another
   * 
   * @param fromStrategy Element location strategy for source element
   * @param fromSelector Element selector for source element
   * @param toStrategy Element location strategy for target element
   * @param toSelector Element selector for target element
   * @returns Promise that resolves when drag and drop is complete
   */
  async dragAndDrop(
    fromStrategy: ElementLocatorStrategy,
    fromSelector: string,
    toStrategy: ElementLocatorStrategy,
    toSelector: string
  ): Promise<void> {
    // Find both elements
    const fromElement = await this.elementLocator.findElement(fromStrategy, fromSelector);
    const toElement = await this.elementLocator.findElement(toStrategy, toSelector);
    
    // Get element locations and sizes
    const fromLocation = await fromElement.getLocation();
    const fromSize = await fromElement.getSize();
    const toLocation = await toElement.getLocation();
    const toSize = await toElement.getSize();
    
    // Calculate center points
    const fromCenter: Coordinate = {
      x: fromLocation.x + (fromSize.width / 2),
      y: fromLocation.y + (fromSize.height / 2)
    };
    
    const toCenter: Coordinate = {
      x: toLocation.x + (toSize.width / 2),
      y: toLocation.y + (toSize.height / 2)
    };
    
    // Perform drag and drop using W3C actions
    await this.driver.performActions([
      {
        type: 'pointer',
        id: 'finger1',
        parameters: { pointerType: 'touch' },
        actions: [
          { type: 'pointerMove', duration: 0, x: fromCenter.x, y: fromCenter.y },
          { type: 'pointerDown', button: 0 },
          { type: 'pause', duration: 500 }, // Hold for a moment
          { type: 'pointerMove', duration: 1000, x: toCenter.x, y: toCenter.y },
          { type: 'pause', duration: 500 }, // Hold again before release
          { type: 'pointerUp', button: 0 }
        ]
      }
    ]);
    
    // Release actions to clean up
    await this.driver.releaseActions();
  }
  
  /**
   * Copy text to clipboard
   * 
   * @param text - Text to copy to clipboard
   * @param options - Optional clipboard options
   * @returns Promise resolving to void
   */
  async copyToClipboard(text: string, options: Partial<ClipboardOptions> = {}): Promise<void> {
    const inputHandler = new InputHandler(this.driver, this.elementLocator, 
      new ActionVerifier(this.driver, new VisualChecker(this.driver), new ElementStateChecker(this.driver, this.elementLocator)));
    
    const success = await inputHandler.setClipboardText(text);
    if (!success) {
      throw new Error('Failed to copy text to clipboard');
    }
  }
  
  /**
   * Get text from clipboard
   * 
   * @returns Promise resolving to clipboard content
   */
  async getClipboardContent(): Promise<string> {
    const inputHandler = new InputHandler(this.driver, this.elementLocator, 
      new ActionVerifier(this.driver, new VisualChecker(this.driver), new ElementStateChecker(this.driver, this.elementLocator)));
    
    return await inputHandler.getClipboardText();
  }
  
  /**
   * Paste text from clipboard into an element
   * 
   * @param strategy - Element location strategy
   * @param selector - Element selector
   * @param options - Optional clipboard options
   * @returns Promise resolving to void
   */
  async pasteToElement(
    strategy: ElementLocatorStrategy, 
    selector: string, 
    options: Partial<ClipboardOptions> = {}
  ): Promise<void> {
    // Find the element
    const element = await this.elementLocator.findElement(strategy, selector);
    
    // Click to focus the element
    await element.click();
    
    // Create an input handler instance
    const inputHandler = new InputHandler(this.driver, this.elementLocator, 
      new ActionVerifier(this.driver, new VisualChecker(this.driver), new ElementStateChecker(this.driver, this.elementLocator)));
    
    // Paste from clipboard
    const success = await inputHandler.pasteFromClipboard();
    if (!success) {
      throw new Error('Failed to paste from clipboard');
    }
  }
} 