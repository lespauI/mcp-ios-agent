import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { UIActions } from '../../src/actions/UIActions';
import { ElementLocator } from '../../src/element/ElementLocator';

describe('UIActions', () => {
  let uiActions: UIActions;
  let mockDriver: jest.Mocked<WebdriverIO.Browser>;
  let mockElementLocator: jest.Mocked<ElementLocator>;
  let mockElement: jest.Mocked<WebdriverIO.Element>;
  
  beforeEach(() => {
    // Create mock element
    mockElement = {
      click: jest.fn().mockResolvedValue(undefined),
      touchAction: jest.fn().mockResolvedValue(undefined),
      setValue: jest.fn().mockResolvedValue(undefined),
      clearValue: jest.fn().mockResolvedValue(undefined),
      getAttribute: jest.fn().mockResolvedValue(''),
      isDisplayed: jest.fn().mockResolvedValue(true),
      isEnabled: jest.fn().mockResolvedValue(true),
      getLocation: jest.fn().mockResolvedValue({ x: 10, y: 10 }),
      getSize: jest.fn().mockResolvedValue({ width: 100, height: 50 }),
      getText: jest.fn().mockResolvedValue('Hello World'),
      $: jest.fn(),
      $$: jest.fn()
    } as unknown as jest.Mocked<WebdriverIO.Element>;
    
    // Create mock driver
    mockDriver = {
      touchAction: jest.fn().mockResolvedValue(undefined),
      $: jest.fn().mockResolvedValue(mockElement),
      $$: jest.fn().mockResolvedValue([mockElement, mockElement]),
      executeScript: jest.fn().mockResolvedValue(undefined),
      performActions: jest.fn().mockResolvedValue(undefined),
      releaseActions: jest.fn().mockResolvedValue(undefined),
      getPageSource: jest.fn().mockResolvedValue('<xml>App Source</xml>'),
      takeScreenshot: jest.fn().mockResolvedValue('base64screenshot'),
      getWindowSize: jest.fn().mockResolvedValue({ width: 375, height: 812 }),
      status: jest.fn().mockResolvedValue({ ready: true }),
      deleteSession: jest.fn().mockResolvedValue(undefined),
      sessionId: 'test-session',
      capabilities: {}
    } as unknown as jest.Mocked<WebdriverIO.Browser>;
    
    // Create mock element locator
    mockElementLocator = {
      findElement: jest.fn().mockResolvedValue(mockElement),
      findElements: jest.fn().mockResolvedValue([mockElement, mockElement]),
      waitForElement: jest.fn().mockResolvedValue(mockElement),
      waitForElements: jest.fn().mockResolvedValue([mockElement, mockElement]),
      findElementWithFallbacks: jest.fn().mockResolvedValue(mockElement)
    } as jest.Mocked<ElementLocator>;
    
    // Create the UIActions instance for testing
    uiActions = new UIActions(mockDriver, mockElementLocator);
  });
  
  describe('tap', () => {
    it('should tap an element by accessibility ID', async () => {
      await uiActions.tap('accessibilityId', 'testButton');
      
      expect(mockElementLocator.findElement).toHaveBeenCalledWith('accessibilityId', 'testButton');
      expect(mockElement.click).toHaveBeenCalled();
    });
    
    it('should tap an element with options', async () => {
      await uiActions.tap('accessibilityId', 'testButton', { force: true, timeout: 5000 });
      
      expect(mockElementLocator.waitForElement).toHaveBeenCalledWith('accessibilityId', 'testButton', 5000);
    });
    
    it('should verify element is enabled before tapping', async () => {
      mockElement.isEnabled.mockResolvedValue(false);
      
      await expect(uiActions.tap('accessibilityId', 'disabledButton')).rejects.toThrow('Element is not enabled');
    });
  });
  
  describe('longPress', () => {
    it('should perform a long press on an element', async () => {
      await uiActions.longPress('accessibilityId', 'testButton');
      
      expect(mockElementLocator.findElement).toHaveBeenCalledWith('accessibilityId', 'testButton');
      expect(mockElement.touchAction).toHaveBeenCalledWith('longPress');
    });
    
    it('should long press with custom duration', async () => {
      await uiActions.longPress('accessibilityId', 'testButton', { duration: 2000 });
      
      expect(mockDriver.performActions).toHaveBeenCalled();
    });
  });
  
  describe('multiTap', () => {
    it('should perform multiple taps on an element', async () => {
      await uiActions.multiTap('accessibilityId', 'testButton', 3);
      
      expect(mockElementLocator.findElement).toHaveBeenCalledWith('accessibilityId', 'testButton');
      expect(mockElement.click).toHaveBeenCalledTimes(3);
    });
  });
  
  describe('enterText', () => {
    it('should enter text into an input field', async () => {
      await uiActions.enterText('accessibilityId', 'inputField', 'Hello World');
      
      expect(mockElementLocator.findElement).toHaveBeenCalledWith('accessibilityId', 'inputField');
      expect(mockElement.setValue).toHaveBeenCalledWith('Hello World');
    });
    
    it('should clear field before entering text when specified', async () => {
      await uiActions.enterText('accessibilityId', 'inputField', 'Hello World', { clearFirst: true });
      
      expect(mockElement.clearValue).toHaveBeenCalled();
      expect(mockElement.setValue).toHaveBeenCalledWith('Hello World');
    });
    
    it('should handle secure text field differently', async () => {
      mockElement.getAttribute.mockResolvedValueOnce('XCUIElementTypeSecureTextField');
      
      await uiActions.enterText('accessibilityId', 'passwordField', 'password123');
      
      // Should handle secure text field differently
      expect(mockDriver.executeScript).toHaveBeenCalled();
    });
  });
  
  describe('clearText', () => {
    it('should clear text from an input field', async () => {
      await uiActions.clearText('accessibilityId', 'inputField');
      
      expect(mockElementLocator.findElement).toHaveBeenCalledWith('accessibilityId', 'inputField');
      expect(mockElement.clearValue).toHaveBeenCalled();
    });
  });
  
  describe('swipe', () => {
    it('should perform a swipe gesture with coordinates', async () => {
      await uiActions.swipe({ x: 100, y: 200 }, { x: 300, y: 400 });
      
      expect(mockDriver.performActions).toHaveBeenCalled();
    });
    
    it('should swipe from element to element', async () => {
      await uiActions.swipeFromElementToElement('accessibilityId', 'element1', 'accessibilityId', 'element2');
      
      expect(mockElementLocator.findElement).toHaveBeenCalledWith('accessibilityId', 'element1');
      expect(mockElementLocator.findElement).toHaveBeenCalledWith('accessibilityId', 'element2');
      expect(mockDriver.performActions).toHaveBeenCalled();
    });
  });
  
  describe('scroll', () => {
    it('should scroll down', async () => {
      await uiActions.scrollDown();
      
      expect(mockDriver.performActions).toHaveBeenCalled();
    });
    
    it('should scroll up', async () => {
      await uiActions.scrollUp();
      
      expect(mockDriver.performActions).toHaveBeenCalled();
    });
    
    it('should scroll until element is visible', async () => {
      // First attempt element is not found, then found on second try
      mockElementLocator.findElement
        .mockRejectedValueOnce(new Error('Not found'))
        .mockResolvedValueOnce(mockElement);
      
      await uiActions.scrollUntilElementVisible('accessibilityId', 'deepElement');
      
      expect(mockDriver.performActions).toHaveBeenCalled();
      expect(mockElementLocator.findElement).toHaveBeenCalledTimes(2);
    });
    
    it('should throw error if element not found after maximum scrolls', async () => {
      // Element is never found
      mockElementLocator.findElement.mockRejectedValue(new Error('Not found'));
      
      await expect(uiActions.scrollUntilElementVisible('accessibilityId', 'nonExistentElement', { maxScrolls: 3 }))
        .rejects.toThrow('Element not found after 3 scrolls');
      
      expect(mockDriver.performActions).toHaveBeenCalledTimes(3);
    });
  });
  
  describe('dragAndDrop', () => {
    it('should perform drag and drop between elements', async () => {
      await uiActions.dragAndDrop('accessibilityId', 'sourceElement', 'accessibilityId', 'targetElement');
      
      expect(mockElementLocator.findElement).toHaveBeenCalledWith('accessibilityId', 'sourceElement');
      expect(mockElementLocator.findElement).toHaveBeenCalledWith('accessibilityId', 'targetElement');
      expect(mockDriver.performActions).toHaveBeenCalled();
    });
  });
}); 