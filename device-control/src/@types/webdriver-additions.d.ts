/**
 * Additional WebDriverIO Type Declarations
 * This file adds missing methods to the WebDriverIO namespace
 */

// Extend the existing WebDriverIO namespace with missing methods
declare namespace WebdriverIO {
  interface Browser {
    getWindowRect(): Promise<{ x: number, y: number, width: number, height: number }>;
    performActions(actions: any[]): Promise<void>;
    executeScript<T>(script: string | ((...args: any[]) => T), ...args: any[]): Promise<T>;
    getWindowSize(): Promise<{ width: number, height: number }>;
    takeScreenshot(): Promise<string>;
    getPageSource(): Promise<string>;
    sessionId: string;
    capabilities: any;
  }

  interface Element {
    elementId: string;
    selector: string;
    getRect(): Promise<{ x: number, y: number, width: number, height: number }>;
    isDisplayed(): Promise<boolean>;
    isEnabled(): Promise<boolean>;
    getText(): Promise<string>;
    getAttribute(attributeName: string): Promise<string | null>;
    getTagName(): Promise<string>;
  }
} 