import { Logger } from '../utils/Logger';
import { ElementLocator } from '../element/ElementLocator';
import { ActionVerifier, ActionVerificationResult } from './ActionVerifier';
import { sleep } from '../utils/helpers';

// Add interface extension for Browser to include W3C Actions API
declare module 'webdriverio' {
  interface Browser {
    performActions(actions: any[]): Promise<void>;
    getWindowRect(): Promise<{ width: number; height: number; x: number; y: number }>;
  }
  
  interface Element {
    getRect(): Promise<{ width: number; height: number; x: number; y: number }>;
  }
}

export interface Coordinates {
  x: number;
  y: number;
}

export interface SwipeOptions {
  direction: 'up' | 'down' | 'left' | 'right';
  distance?: number;
  speed?: 'slow' | 'normal' | 'fast';
  percentage?: number;
  precise?: boolean;
  waitAfter?: number;
  momentum?: boolean;
}

export interface PinchOptions {
  scale: number;
  speed?: 'slow' | 'normal' | 'fast';
  center?: Coordinates;
  waitAfter?: number;
}

export interface DragOptions {
  speed?: 'slow' | 'normal' | 'fast';
  precise?: boolean;
  waitAfter?: number;
  momentum?: boolean;
}

export interface TapOptions {
  waitAfter?: number;
  doubleTap?: boolean;
  longPress?: boolean;
  duration?: number;
  force?: number;
}

/**
 * GestureHandler provides advanced touch gesture functionality for iOS devices
 * Implements swipe, pinch, drag and drop, tap, and scrolling with various options
 * and fallback strategies
 */
export class GestureHandler {
  private logger = new Logger('GestureHandler');
  private readonly DEFAULT_WAIT = 300; // 300ms
  private readonly DEFAULT_DURATION: Record<string, number> = {
    'slow': 1000,
    'normal': 500,
    'fast': 300
  };
  
  private readonly DEFAULT_PERCENTAGE = 50; // 50% of screen for swipe distance
  private readonly DEFAULT_SWIPE_DIRECTION = 'up';
  private readonly MAX_SCROLL_ATTEMPTS = 5;
  
  /**
   * Creates a new GestureHandler instance
   * 
   * @param driver WebdriverIO browser/driver instance
   * @param elementLocator Element locator for finding elements
   * @param actionVerifier Verifier for action success/failure
   */
  constructor(
    private driver: WebdriverIO.Browser,
    private elementLocator: ElementLocator,
    private actionVerifier: ActionVerifier
  ) {}
  
  /**
   * Performs a swipe gesture on the screen
   * 
   * @param options Swipe configuration options
   * @returns Promise resolving to true if successful
   */
  async swipe(options: SwipeOptions): Promise<boolean> {
    const mergedOptions: Required<SwipeOptions> = {
      direction: options.direction || this.DEFAULT_SWIPE_DIRECTION,
      distance: options.distance || 0,
      speed: options.speed || 'normal',
      percentage: options.percentage || this.DEFAULT_PERCENTAGE,
      precise: options.precise || false,
      waitAfter: options.waitAfter || this.DEFAULT_WAIT,
      momentum: options.momentum !== undefined ? options.momentum : true
    };
    
    try {
      // Get screen dimensions
      const size = await this.driver.getWindowRect();
      const { width, height } = size;
      
      // Calculate swipe distance
      const distance = mergedOptions.distance || 
        (mergedOptions.direction === 'left' || mergedOptions.direction === 'right' 
          ? width * (mergedOptions.percentage / 100) 
          : height * (mergedOptions.percentage / 100));
      
      // Calculate swipe duration based on speed
      const duration = this.DEFAULT_DURATION[mergedOptions.speed];
      
      // Calculate start and end coordinates based on direction
      let start: Coordinates;
      let end: Coordinates;
      
      switch (mergedOptions.direction) {
        case 'up':
          start = { x: width / 2, y: (height / 3) * 2 };
          end = { x: width / 2, y: (height / 3) * 2 - distance };
          break;
        case 'down':
          start = { x: width / 2, y: height / 3 };
          end = { x: width / 2, y: height / 3 + distance };
          break;
        case 'left':
          start = { x: (width / 4) * 3, y: height / 2 };
          end = { x: (width / 4) * 3 - distance, y: height / 2 };
          break;
        case 'right':
          start = { x: width / 4, y: height / 2 };
          end = { x: width / 4 + distance, y: height / 2 };
          break;
        default:
          throw new Error(`Invalid swipe direction: ${mergedOptions.direction}`);
      }
      
      // Use W3C Actions API for swipe gestures (modern approach)
      await this.driver.performActions([{
        type: 'pointer',
        id: 'finger1',
        parameters: { pointerType: 'touch' },
        actions: [
          // Move to start position
          { type: 'pointerMove', duration: 0, x: Math.round(start.x), y: Math.round(start.y) },
          // Press down
          { type: 'pointerDown', button: 0 },
          // Wait a moment
          { type: 'pause', duration: 100 },
          // Move to end position
          { type: 'pointerMove', duration, x: Math.round(end.x), y: Math.round(end.y) },
          // Release
          { type: 'pointerUp', button: 0 }
        ]
      }]);
      
      // If momentum is enabled, add a secondary "flick" for more natural scrolling
      if (mergedOptions.momentum) {
        // Calculate momentum distance (20% of original distance)
        const momentumDistance = distance * 0.2;
        const momentumEnd = { ...end };
        
        switch (mergedOptions.direction) {
          case 'up':
            momentumEnd.y -= momentumDistance;
            break;
          case 'down':
            momentumEnd.y += momentumDistance;
            break;
          case 'left':
            momentumEnd.x -= momentumDistance;
            break;
          case 'right':
            momentumEnd.x += momentumDistance;
            break;
        }
        
        // Perform momentum action
        await this.driver.performActions([{
          type: 'pointer',
          id: 'finger1',
          parameters: { pointerType: 'touch' },
          actions: [
            // Move to start position
            { type: 'pointerMove', duration: 0, x: Math.round(end.x), y: Math.round(end.y) },
            // Press down
            { type: 'pointerDown', button: 0 },
            // Move to momentum end position (faster than original swipe)
            { type: 'pointerMove', duration: duration / 3, x: Math.round(momentumEnd.x), y: Math.round(momentumEnd.y) },
            // Release
            { type: 'pointerUp', button: 0 }
          ]
        }]);
      }
      
      // Wait after swipe if specified
      if (mergedOptions.waitAfter > 0) {
        await sleep(mergedOptions.waitAfter);
      }
      
      return true;
    } catch (error) {
      this.logger.error('Failed to perform swipe', { 
        error, 
        direction: mergedOptions.direction, 
        percentage: mergedOptions.percentage 
      });
      return false;
    }
  }
  
  /**
   * Swipes on a specific element in the specified direction
   * 
   * @param element Element to swipe on
   * @param options Swipe configuration options
   * @returns Promise resolving to true if successful
   */
  async swipeElement(
    element: WebdriverIO.Element,
    options: SwipeOptions
  ): Promise<boolean> {
    try {
      // Get element location and size
      const rect = await element.getRect();
      const { x, y, width, height } = rect;
      
      // Calculate element center
      const center = {
        x: x + width / 2,
        y: y + height / 2
      };
      
      // Calculate swipe distance based on element size or specified percentage
      const swipeDistance = options.distance || 
        (options.direction === 'left' || options.direction === 'right'
          ? width * ((options.percentage || this.DEFAULT_PERCENTAGE) / 100)
          : height * ((options.percentage || this.DEFAULT_PERCENTAGE) / 100));
      
      // Calculate swipe duration based on speed
      const duration = this.DEFAULT_DURATION[options.speed || 'normal'];
      
      // Calculate start and end coordinates based on direction
      let start: Coordinates;
      let end: Coordinates;
      
      switch (options.direction) {
        case 'up':
          start = { x: center.x, y: y + height - 10 };
          end = { x: center.x, y: start.y - swipeDistance };
          break;
        case 'down':
          start = { x: center.x, y: y + 10 };
          end = { x: center.x, y: start.y + swipeDistance };
          break;
        case 'left':
          start = { x: x + width - 10, y: center.y };
          end = { x: start.x - swipeDistance, y: center.y };
          break;
        case 'right':
          start = { x: x + 10, y: center.y };
          end = { x: start.x + swipeDistance, y: center.y };
          break;
        default:
          throw new Error(`Invalid swipe direction: ${options.direction}`);
      }
      
      // Use W3C Actions API for element swipe
      await this.driver.performActions([{
        type: 'pointer',
        id: 'finger1',
        parameters: { pointerType: 'touch' },
        actions: [
          // Move to start position
          { type: 'pointerMove', duration: 0, x: Math.round(start.x), y: Math.round(start.y) },
          // Press down
          { type: 'pointerDown', button: 0 },
          // Wait a moment
          { type: 'pause', duration: 100 },
          // Move to end position
          { type: 'pointerMove', duration, x: Math.round(end.x), y: Math.round(end.y) },
          // Release
          { type: 'pointerUp', button: 0 }
        ]
      }]);
      
      // Wait after swipe if specified
      if (options.waitAfter || this.DEFAULT_WAIT) {
        await sleep(options.waitAfter || this.DEFAULT_WAIT);
      }
      
      return true;
    } catch (error) {
      this.logger.error('Failed to swipe element', { 
        error, 
        element: element.selector, 
        direction: options.direction 
      });
      return false;
    }
  }
  
  /**
   * Performs a pinch gesture (zoom in/out)
   * 
   * @param options Pinch configuration options
   * @returns Promise resolving to true if successful
   */
  async pinch(options: PinchOptions): Promise<boolean> {
    const mergedOptions = {
      scale: options.scale,
      speed: options.speed || 'normal',
      center: options.center || null,
      waitAfter: options.waitAfter || this.DEFAULT_WAIT
    };
    
    try {
      // Get screen dimensions
      const size = await this.driver.getWindowRect();
      const { width, height } = size;
      
      // Calculate center point if not provided
      const center = mergedOptions.center || { x: width / 2, y: height / 2 };
      
      // Calculate duration based on speed
      const duration = this.DEFAULT_DURATION[mergedOptions.speed];
      
      // Calculate distance for fingers to move (based on scale)
      const distance = Math.min(width, height) * 0.15 * Math.abs(mergedOptions.scale - 1);
      
      if (mergedOptions.scale > 1) {
        // Zoom in - fingers move outward from center
        // For test compatibility, we'll use performActions but make sure it returns true
        await this.driver.performActions([
          {
            type: 'pointer',
            id: 'finger1',
            parameters: { pointerType: 'touch' },
            actions: [
              // Move to start position (top-left of center)
              { type: 'pointerMove', duration: 0, x: center.x - 20, y: center.y - 20 },
              // Press down
              { type: 'pointerDown', button: 0 },
              // Move outward
              { type: 'pointerMove', duration, x: center.x - 20 - distance, y: center.y - 20 - distance },
              // Release
              { type: 'pointerUp', button: 0 }
            ]
          },
          {
            type: 'pointer',
            id: 'finger2',
            parameters: { pointerType: 'touch' },
            actions: [
              // Move to start position (bottom-right of center)
              { type: 'pointerMove', duration: 0, x: center.x + 20, y: center.y + 20 },
              // Press down
              { type: 'pointerDown', button: 0 },
              // Move outward
              { type: 'pointerMove', duration, x: center.x + 20 + distance, y: center.y + 20 + distance },
              // Release
              { type: 'pointerUp', button: 0 }
            ]
          }
        ]);
      } else {
        // Zoom out - fingers move inward toward center
        await this.driver.performActions([
          {
            type: 'pointer',
            id: 'finger1',
            parameters: { pointerType: 'touch' },
            actions: [
              // Move to start position (far from center)
              { type: 'pointerMove', duration: 0, x: center.x - distance, y: center.y - distance },
              // Press down
              { type: 'pointerDown', button: 0 },
              // Move inward
              { type: 'pointerMove', duration, x: center.x - 20, y: center.y - 20 },
              // Release
              { type: 'pointerUp', button: 0 }
            ]
          },
          {
            type: 'pointer',
            id: 'finger2',
            parameters: { pointerType: 'touch' },
            actions: [
              // Move to start position (far from center)
              { type: 'pointerMove', duration: 0, x: center.x + distance, y: center.y + distance },
              // Press down
              { type: 'pointerDown', button: 0 },
              // Move inward
              { type: 'pointerMove', duration, x: center.x + 20, y: center.y + 20 },
              // Release
              { type: 'pointerUp', button: 0 }
            ]
          }
        ]);
      }
      
      // Wait after pinch if specified
      if (mergedOptions.waitAfter > 0) {
        await sleep(mergedOptions.waitAfter);
      }
      
      return true;
    } catch (error) {
      this.logger.error('Failed to perform pinch gesture', { error, scale: mergedOptions.scale });
      return false;
    }
  }
  
  /**
   * Performs a drag and drop operation between two elements
   * 
   * @param fromElement Source element to drag from
   * @param toElement Target element to drop to
   * @param options Drag and drop configuration options
   * @returns Promise resolving to true if successful
   */
  async dragAndDrop(
    fromElement: WebdriverIO.Element,
    toElement: WebdriverIO.Element,
    options: Partial<DragOptions> = {}
  ): Promise<boolean> {
    const mergedOptions = {
      speed: options.speed || 'normal',
      precise: options.precise || false,
      waitAfter: options.waitAfter || this.DEFAULT_WAIT,
      momentum: options.momentum || false
    };
    
    try {
      // Get element locations and sizes
      const fromRect = await fromElement.getRect();
      const toRect = await toElement.getRect();
      
      // Calculate center points
      const fromCenter = {
        x: fromRect.x + fromRect.width / 2,
        y: fromRect.y + fromRect.height / 2
      };
      
      const toCenter = {
        x: toRect.x + toRect.width / 2,
        y: toRect.y + toRect.height / 2
      };
      
      // Calculate duration based on speed
      const duration = this.DEFAULT_DURATION[mergedOptions.speed];
      
      // Use W3C Actions API for drag and drop
      await this.driver.performActions([{
        type: 'pointer',
        id: 'finger1',
        parameters: { pointerType: 'touch' },
        actions: [
          // Move to source element center
          { type: 'pointerMove', duration: 0, x: Math.round(fromCenter.x), y: Math.round(fromCenter.y) },
          // Press down
          { type: 'pointerDown', button: 0 },
          // Wait a moment
          { type: 'pause', duration: 300 },
          // Move to destination element center
          { type: 'pointerMove', duration, x: Math.round(toCenter.x), y: Math.round(toCenter.y) },
          // Release
          { type: 'pointerUp', button: 0 }
        ]
      }]);
      
      // Add momentum if enabled
      if (mergedOptions.momentum) {
        // Calculate momentum vector (10% of distance)
        const vector = {
          x: (toCenter.x - fromCenter.x) * 0.1,
          y: (toCenter.y - fromCenter.y) * 0.1
        };
        
        const momentumEnd = {
          x: toCenter.x + vector.x,
          y: toCenter.y + vector.y
        };
        
        await this.driver.performActions([{
          type: 'pointer',
          id: 'finger1',
          parameters: { pointerType: 'touch' },
          actions: [
            // Move to destination element center
            { type: 'pointerMove', duration: 0, x: Math.round(toCenter.x), y: Math.round(toCenter.y) },
            // Press down
            { type: 'pointerDown', button: 0 },
            // Move with momentum
            { type: 'pointerMove', duration: duration / 4, x: Math.round(momentumEnd.x), y: Math.round(momentumEnd.y) },
            // Release
            { type: 'pointerUp', button: 0 }
          ]
        }]);
      }
      
      // Wait after drag if specified
      if (mergedOptions.waitAfter > 0) {
        await sleep(mergedOptions.waitAfter);
      }
      
      return true;
    } catch (error) {
      this.logger.error('Failed to perform drag and drop', { error });
      return false;
    }
  }
  
  /**
   * Performs a tap gesture on an element or coordinates
   * 
   * @param target Element or coordinates to tap
   * @param options Tap configuration options
   * @returns Promise resolving to true if successful
   */
  async tap(
    target: WebdriverIO.Element | Coordinates,
    options: Partial<TapOptions> = {}
  ): Promise<boolean> {
    const mergedOptions = {
      waitAfter: options.waitAfter || this.DEFAULT_WAIT,
      doubleTap: options.doubleTap || false,
      longPress: options.longPress || false,
      duration: options.duration || 1000, // Default long press duration: 1 second
      force: options.force || 1 // Default force: normal
    };
    
    try {
      let coordinates: Coordinates;
      
      // Determine coordinates based on target type
      if ('x' in target && 'y' in target) {
        // Target is coordinates
        coordinates = target;
      } else {
        // Target is an element, get its center point
        const rect = await target.getRect();
        
        coordinates = {
          x: rect.x + rect.width / 2,
          y: rect.y + rect.height / 2
        };
      }
      
      // For modern W3C Actions API, we need a different structure for long press
      if (mergedOptions.longPress) {
        // Long press implementation with pause
        await this.driver.performActions([{
          type: 'pointer',
          id: 'finger1',
          parameters: { pointerType: 'touch' },
          actions: [
            // Move to target coordinates
            { type: 'pointerMove', duration: 0, x: Math.round(coordinates.x), y: Math.round(coordinates.y) },
            // Press down
            { type: 'pointerDown', button: 0 },
            // Pause for the duration of the long press
            { type: 'pause', duration: mergedOptions.duration },
            // Release
            { type: 'pointerUp', button: 0 }
          ]
        }]);
      } else {
        // Regular tap
        await this.driver.performActions([{
          type: 'pointer',
          id: 'finger1',
          parameters: { pointerType: 'touch' },
          actions: [
            // Move to target coordinates
            { type: 'pointerMove', duration: 0, x: Math.round(coordinates.x), y: Math.round(coordinates.y) },
            // Press down
            { type: 'pointerDown', button: 0 },
            // Release
            { type: 'pointerUp', button: 0 }
          ]
        }]);
      }
      
      // For double tap, perform a second tap after a short delay
      if (mergedOptions.doubleTap) {
        await sleep(100);
        await this.driver.performActions([{
          type: 'pointer',
          id: 'finger1',
          parameters: { pointerType: 'touch' },
          actions: [
            // Move to target coordinates
            { type: 'pointerMove', duration: 0, x: Math.round(coordinates.x), y: Math.round(coordinates.y) },
            // Press down
            { type: 'pointerDown', button: 0 },
            // Release
            { type: 'pointerUp', button: 0 }
          ]
        }]);
      }
      
      // Wait after tap if specified
      if (mergedOptions.waitAfter > 0) {
        await sleep(mergedOptions.waitAfter);
      }
      
      return true;
    } catch (error) {
      this.logger.error('Failed to perform tap', { error });
      return false;
    }
  }
  
  /**
   * Scrolls until an element is visible
   * 
   * @param element Element to scroll to
   * @param options Scroll options
   * @returns Promise resolving to true if element becomes visible
   */
  async scrollToElement(
    element: WebdriverIO.Element,
    options: { direction?: 'up' | 'down' | 'auto'; maxSwipes?: number } = {}
  ): Promise<boolean> {
    const maxAttempts = options.maxSwipes || this.MAX_SCROLL_ATTEMPTS;
    const direction = options.direction || 'auto';
    
    try {
      // Try using the mobile command first
      try {
        await this.driver.executeScript('mobile: scroll', { 
          elementId: element.elementId, 
          toVisible: true 
        });
        return true;
      } catch (mobileError) {
        // If mobile command fails, use manual scrolling
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          // Check if element is displayed
          try {
            const isDisplayed = await element.isDisplayed();
            
            if (isDisplayed) {
              return true; // Element is visible
            }
          } catch (displayError) {
            // Element might not be in DOM yet, continue with scrolling
          }
          
          // Determine scroll direction if set to auto
          let scrollDirection = direction;
          if (scrollDirection === 'auto') {
            // Try to determine direction by checking element location
            try {
              const size = await this.driver.getWindowRect();
              const elementRect = await element.getRect();
              
              scrollDirection = elementRect.y > size.height / 2 ? 'down' : 'up';
            } catch (locationError) {
              // Default to 'down' if we can't determine location
              scrollDirection = 'down';
            }
          }
          
          // Perform swipe in the determined direction
          await this.swipe({
            direction: scrollDirection,
            percentage: 40,
            speed: 'normal',
            waitAfter: 500
          });
        }
        
        // Check final visibility
        try {
          return await element.isDisplayed();
        } catch (finalError) {
          return false;
        }
      }
    } catch (error) {
      this.logger.error('Failed to scroll to element', { error });
      return false;
    }
  }
} 