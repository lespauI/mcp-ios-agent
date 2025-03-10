/**
 * WebDriverIO Type Extensions
 * 
 * This file extends the WebDriverIO types to include methods and properties needed for iOS automation.
 * Compatible with WebdriverIO v8+ and Appium 2.0+
 */

declare namespace WebdriverIO {
  // Extend Browser to include both standard WebDriverIO Browser and Appium mobile capabilities
  interface Browser extends EventEmitter {
    // App management
    terminateApp(bundleId?: string, options?: any): Promise<void>;
    activateApp(bundleId: string): Promise<void>;
    isAppInstalled(bundleId: string): Promise<boolean>;
    installApp(appPath: string): Promise<void>;
    removeApp(bundleId: string): Promise<void>;
    reset(): Promise<void>;
    launchApp(): Promise<void>;
    closeApp(): Promise<void>;
    queryAppState(bundleId?: string): Promise<number>;
    background(seconds: number): Promise<void>;
    
    // Session methods
    execute<T>(script: string | ((...args: any[]) => T), ...args: any[]): Promise<T>;
    executeScript<T>(script: string | ((...args: any[]) => T), ...args: any[]): Promise<T>;
    status(): Promise<{ ready: boolean, message?: string }>;
    deleteSession(): Promise<void>;
    
    // Element location
    $(selector: string): Promise<WebdriverIO.Element>;
    $$(selector: string): Promise<WebdriverIO.Element[]>;
    findElement(strategy: string, selector: string): Promise<WebdriverIO.Element>;
    findElements(strategy: string, selector: string): Promise<WebdriverIO.Element[]>;
    
    // Screenshot methods
    takeScreenshot(): Promise<string>;
    saveScreenshot(filePath: string): Promise<void>;
    
    // Window/screen methods
    getWindowSize(): Promise<{ width: number, height: number }>;
    getWindowRect(): Promise<{ x: number, y: number, width: number, height: number }>;
    
    // XML source
    getPageSource(): Promise<string>;
    
    // Context switching
    getContexts(): Promise<string[]>;
    getContext(): Promise<string>;
    switchContext(context: string): Promise<void>;
    
    // Enhanced mobile commands for WebdriverIO v8+
    switchContext(options: { 
      name?: string; 
      title?: string | RegExp; 
      url?: string | RegExp; 
      webviewTitle?: string | RegExp; 
      context?: string;
      timeout?: number;
    }): Promise<void>;
    
    getContexts(options?: { 
      returnDetailedContexts?: boolean;
      androidWebviewConnectionRetryTime?: number;
      androidWebviewConnectTimeout?: number;
    }): Promise<string[] | any[]>;
    
    // Mobile gestures
    touchAction(actions: any): Promise<void>; // Deprecated but included for backward compatibility
    touchPerform(actions: any[]): Promise<void>;
    performActions(actions: any[]): Promise<void>;
    
    // Mobile commands
    mobile: {
      launchApp(options?: any): Promise<void>;
      terminateApp(bundleId: string, options?: any): Promise<void>;
      resetApp(options?: any): Promise<void>;
    };
    
    // EventEmitter methods
    on(event: string, listener: (...args: any[]) => void): this;
    once(event: string, listener: (...args: any[]) => void): this;
    off(event: string, listener: (...args: any[]) => void): this;
    addListener(event: string, listener: (...args: any[]) => void): this;
    removeListener(event: string, listener: (...args: any[]) => void): this;
    
    // Capabilities and session
    sessionId: string;
    capabilities: {
      platformName: string;
      platformVersion?: string;
      deviceName?: string;
      app?: string;
      automationName?: string;
      [key: string]: any;
    };
    
    // Mobile flags
    isMobile: boolean;
    isIOS: boolean;
    isAndroid: boolean;
  }

  interface Element {
    // Element ID
    elementId: string;
    selector: string;
    
    // Attribute and property methods
    getAttribute(attributeName: string): Promise<string | null>;
    getProperty(propertyName: string): Promise<any>;
    getTagName(): Promise<string>;
    getText(): Promise<string>;
    getValue(): Promise<string>;
    
    // State methods
    isDisplayed(): Promise<boolean>;
    isEnabled(): Promise<boolean>;
    isSelected(): Promise<boolean>;
    isExisting(): Promise<boolean>;
    
    // Location and dimension methods
    getLocation(): Promise<{ x: number, y: number }>;
    getSize(): Promise<{ width: number, height: number }>;
    getRect(): Promise<{ x: number, y: number, width: number, height: number }>; // WebDriver standard
    
    // Action methods
    click(): Promise<void>;
    doubleClick(): Promise<void>;
    setValue(value: string): Promise<void>;
    clearValue(): Promise<void>;
    addValue(value: string): Promise<void>;
    touchAction(action: string | object): Promise<void>; // Deprecated but included for backward compatibility
    
    // Wait methods
    waitForExist(options?: { timeout?: number, reverse?: boolean, interval?: number }): Promise<boolean>;
    waitForDisplayed(options?: { timeout?: number, reverse?: boolean, interval?: number }): Promise<boolean>;
    waitForEnabled(options?: { timeout?: number, reverse?: boolean, interval?: number }): Promise<boolean>;
    waitForClickable(options?: { timeout?: number, reverse?: boolean, interval?: number }): Promise<boolean>;
    
    // iOS specific methods
    type(text: string): Promise<void>;
    
    // Child element methods
    $(selector: string): Promise<WebdriverIO.Element>;
    $$(selector: string): Promise<WebdriverIO.Element[]>;
    
    // Gesture methods
    performGesture(gestureId: string): Promise<void>;
    
    // Mobile gesture commands
    longPress(options?: { duration?: number }): Promise<void>;
    touchAndHold(options?: { duration?: number }): Promise<void>;
    drag(destination: Element | { x: number, y: number }, options?: { duration?: number }): Promise<void>;
    
    // Mobile element-specific methods
    scrollIntoView(options?: { block?: 'start' | 'center' | 'end', inline?: 'start' | 'center' | 'end' }): Promise<void>;
  }
  
  // Add EventEmitter interface
  interface EventEmitter {
    on(event: string, listener: (...args: any[]) => void): this;
    once(event: string, listener: (...args: any[]) => void): this;
    off(event: string, listener: (...args: any[]) => void): this;
    addListener(event: string, listener: (...args: any[]) => void): this;
    removeListener(event: string, listener: (...args: any[]) => void): this;
    emit(event: string, ...args: any[]): boolean;
    eventNames(): (string | symbol)[];
    listenerCount(type: string | symbol): number;
    listeners(event: string | symbol): Function[];
    removeAllListeners(event?: string | symbol): this;
  }
  
  // For ElementLocatorStrategy issue
  type ElementLocatorStrategy = 
    | 'id' 
    | 'accessibility id' 
    | 'class name' 
    | 'name' 
    | 'xpath' 
    | 'css selector' 
    | 'tag name' 
    | 'link text' 
    | 'partial link text'
    | 'ios class chain'
    | 'ios predicate'
    | 'android uiautomator'
    | 'android viewtag'
    | 'android datamatcher'
    | 'android viewmatcher'
    | string;
}

export {}; 