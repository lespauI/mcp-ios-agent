import { InputHandler } from '../../src/actions/InputHandler';
import { ElementLocator } from '../../src/element/ElementLocator';
import { ActionVerifier } from '../../src/actions/ActionVerifier';
import { sleep } from '../../src/utils/helpers';

// Mock the imports
jest.mock('../../src/utils/Logger');
jest.mock('../../src/utils/helpers', () => ({
  sleep: jest.fn().mockResolvedValue(undefined)
}));

describe('InputHandler', () => {
  // Mock dependencies
  const mockDriver = {
    executeScript: jest.fn(),
    getWindowSize: jest.fn().mockResolvedValue({ width: 375, height: 812 }),
    touchAction: jest.fn().mockResolvedValue(undefined)
  } as unknown as WebdriverIO.Browser;
  
  const mockElement = {
    clearValue: jest.fn().mockResolvedValue(undefined),
    setValue: jest.fn().mockResolvedValue(undefined),
    addValue: jest.fn().mockResolvedValue(undefined),
    getAttribute: jest.fn().mockResolvedValue(''),
    click: jest.fn().mockResolvedValue(undefined)
  } as unknown as WebdriverIO.Element;
  
  const mockElementLocator = {
    findElement: jest.fn()
  } as unknown as ElementLocator;
  
  const mockActionVerifier = {} as ActionVerifier;
  
  let inputHandler: InputHandler;
  
  beforeEach(() => {
    jest.clearAllMocks();
    inputHandler = new InputHandler(
      mockDriver,
      mockElementLocator,
      mockActionVerifier
    );
  });
  
  describe('setText', () => {
    it('should set text in an element with default options', async () => {
      (mockElement.getAttribute as jest.Mock).mockResolvedValue('test text');
      
      const result = await inputHandler.setText(mockElement, 'test text');
      
      expect(result.success).toBe(true);
      expect(mockElement.clearValue).toHaveBeenCalled();
      expect(mockElement.setValue).toHaveBeenCalledWith('test text');
      expect(mockElement.getAttribute).toHaveBeenCalledWith('value');
      expect(result.expectedValue).toBe('test text');
      expect(result.actualValue).toBe('test text');
    });
    
    it('should not clear input field if clearFirst is false', async () => {
      (mockElement.getAttribute as jest.Mock).mockResolvedValue('test text');
      
      await inputHandler.setText(mockElement, 'test text', { clearFirst: false });
      
      expect(mockElement.clearValue).not.toHaveBeenCalled();
      expect(mockElement.setValue).toHaveBeenCalledWith('test text');
    });
    
    it('should input text character by character if byChar is true', async () => {
      (mockElement.getAttribute as jest.Mock).mockResolvedValue('test');
      
      await inputHandler.setText(mockElement, 'test', { byChar: true });
      
      expect(mockElement.addValue).toHaveBeenCalledTimes(4); // 't', 'e', 's', 't'
      expect(sleep).toHaveBeenCalledTimes(5); // sleep after each character + once for keyboard check
    });
    
    it('should escape special characters if specified', async () => {
      (mockElement.getAttribute as jest.Mock).mockResolvedValue('test\ntext');
      
      await inputHandler.setText(mockElement, 'test\ntext', { escapeSpecialChars: true });
      
      // Should call setValue with escaped text
      expect(mockElement.setValue).toHaveBeenCalledWith('test\\ntext');
    });
    
    it('should check for keyboard and click element if keyboard is not shown', async () => {
      (mockElement.getAttribute as jest.Mock).mockResolvedValue('test text');
      
      // First isKeyboardShown call returns false
      jest.spyOn(inputHandler, 'isKeyboardShown')
        .mockResolvedValueOnce(false);
      
      await inputHandler.setText(mockElement, 'test text', { checkKeyboard: true });
      
      expect(inputHandler.isKeyboardShown).toHaveBeenCalled();
      expect(mockElement.click).toHaveBeenCalled();
      expect(sleep).toHaveBeenCalled(); // Wait for keyboard to appear
    });
    
    it('should not verify input if verifyInput is false', async () => {
      await inputHandler.setText(mockElement, 'test text', { verifyInput: false });
      
      expect(mockElement.getAttribute).not.toHaveBeenCalled();
      expect(mockElement.setValue).toHaveBeenCalledWith('test text');
    });
    
    it('should retry on input verification failure', async () => {
      // First call returns wrong text, second call returns correct text
      (mockElement.getAttribute as jest.Mock)
        .mockResolvedValueOnce('wrong text')
        .mockResolvedValueOnce('test text');
      
      const result = await inputHandler.setText(mockElement, 'test text', { 
        retryOnFailure: true,
        maxRetries: 3,
        retryDelay: 100
      });
      
      expect(result.success).toBe(true);
      expect(result.retryCount).toBe(1);
      expect(mockElement.setValue).toHaveBeenCalledTimes(2);
      expect(sleep).toHaveBeenCalledWith(100); // Wait between retries
    });
    
    it('should fail after max retries if verification keeps failing', async () => {
      // Always returns wrong text
      (mockElement.getAttribute as jest.Mock).mockResolvedValue('wrong text');
      
      const result = await inputHandler.setText(mockElement, 'test text', { 
        maxRetries: 2,
        retryDelay: 10
      });
      
      expect(result.success).toBe(false);
      expect(result.retryCount).toBe(2);
      expect(mockElement.setValue).toHaveBeenCalledTimes(2); // Initial + 1 retry, index starts at 0
    });
    
    it('should handle errors during text input', async () => {
      // Simulate setValue throwing an error
      (mockElement.setValue as jest.Mock).mockRejectedValueOnce(new Error('Input error'));
      
      const result = await inputHandler.setText(mockElement, 'test text', {
        retryOnFailure: false
      });
      
      expect(result.success).toBe(false);
    });
    
    it('should assume success for secure input where verification is not possible', async () => {
      const result = await inputHandler.setText(mockElement, 'password', { 
        verifyInput: true,
        secureInput: true
      });
      
      expect(result.success).toBe(true);
      expect(mockElement.getAttribute).not.toHaveBeenCalled();
    });
  });
  
  describe('setTextBySelector', () => {
    it('should find element and set text', async () => {
      mockElementLocator.findElement.mockResolvedValue(mockElement);
      (mockElement.getAttribute as jest.Mock).mockResolvedValue('test text');
      
      const result = await inputHandler.setTextBySelector('id', 'input-field', 'test text');
      
      expect(mockElementLocator.findElement).toHaveBeenCalledWith('id', 'input-field');
      expect(result.success).toBe(true);
      expect(mockElement.setValue).toHaveBeenCalledWith('test text');
    });
    
    it('should handle error when element is not found', async () => {
      mockElementLocator.findElement.mockRejectedValue(new Error('Element not found'));
      
      const result = await inputHandler.setTextBySelector('id', 'non-existent', 'test text');
      
      expect(result.success).toBe(false);
      expect(result.expectedValue).toBe('test text');
    });
  });
  
  describe('typeText', () => {
    it('should type text through mobile pressKey command', async () => {
      jest.spyOn(inputHandler, 'isKeyboardShown').mockResolvedValue(true);
      
      const result = await inputHandler.typeText('test text');
      
      expect(result).toBe(true);
      expect(mockDriver.executeScript).toHaveBeenCalledTimes(9); // 9 characters including space
      expect(sleep).toHaveBeenCalledTimes(9); // sleep after each character
    });
    
    it('should fail if keyboard is not shown', async () => {
      jest.spyOn(inputHandler, 'isKeyboardShown').mockResolvedValue(false);
      
      const result = await inputHandler.typeText('test text');
      
      expect(result).toBe(false);
      expect(mockDriver.executeScript).not.toHaveBeenCalled();
    });
    
    it('should type all text at once if byChar is false', async () => {
      jest.spyOn(inputHandler, 'isKeyboardShown').mockResolvedValue(true);
      
      const result = await inputHandler.typeText('test text', { byChar: false });
      
      expect(result).toBe(true);
      expect(mockDriver.executeScript).toHaveBeenCalledTimes(1);
      expect(mockDriver.executeScript).toHaveBeenCalledWith('mobile: pressKey', { key: 'test text' });
    });
    
    it('should escape special characters if specified', async () => {
      jest.spyOn(inputHandler, 'isKeyboardShown').mockResolvedValue(true);
      
      const result = await inputHandler.typeText('test\ntext', { 
        byChar: false, 
        escapeSpecialChars: true 
      });
      
      expect(result).toBe(true);
      expect(mockDriver.executeScript).toHaveBeenCalledWith('mobile: pressKey', { key: 'test\\ntext' });
    });
    
    it('should handle errors during typing', async () => {
      jest.spyOn(inputHandler, 'isKeyboardShown').mockResolvedValue(true);
      mockDriver.executeScript.mockRejectedValue(new Error('Command failed'));
      
      const result = await inputHandler.typeText('test text');
      
      expect(result).toBe(false);
    });
  });
  
  describe('isKeyboardShown', () => {
    it('should check if keyboard is shown using mobile command', async () => {
      mockDriver.executeScript.mockResolvedValue(true);
      
      const result = await inputHandler.isKeyboardShown();
      
      expect(result).toBe(true);
      expect(mockDriver.executeScript).toHaveBeenCalledWith('mobile: isKeyboardShown');
    });
    
    it('should fall back to finding keyboard element if mobile command fails', async () => {
      // Mobile command fails
      mockDriver.executeScript.mockRejectedValue(new Error('Command not supported'));
      
      // But element lookup succeeds
      mockElementLocator.findElement.mockResolvedValue(mockElement);
      
      const result = await inputHandler.isKeyboardShown();
      
      expect(result).toBe(true);
      expect(mockElementLocator.findElement).toHaveBeenCalledWith('class name', 'XCUIElementTypeKeyboard', expect.any(Object));
    });
    
    it('should return false if keyboard is not found', async () => {
      // Mobile command fails
      mockDriver.executeScript.mockRejectedValue(new Error('Command not supported'));
      
      // Element lookup also fails
      mockElementLocator.findElement.mockRejectedValue(new Error('Element not found'));
      
      const result = await inputHandler.isKeyboardShown();
      
      expect(result).toBe(false);
    });
  });
  
  describe('dismissKeyboard', () => {
    it('should not attempt to dismiss keyboard if already dismissed', async () => {
      jest.spyOn(inputHandler, 'isKeyboardShown').mockResolvedValue(false);
      
      const result = await inputHandler.dismissKeyboard();
      
      expect(result).toBe(true);
      expect(mockDriver.executeScript).not.toHaveBeenCalled();
    });
    
    it('should dismiss keyboard using mobile command', async () => {
      jest.spyOn(inputHandler, 'isKeyboardShown').mockResolvedValue(true);
      mockDriver.executeScript.mockResolvedValue(undefined);
      
      const result = await inputHandler.dismissKeyboard();
      
      expect(result).toBe(true);
      expect(mockDriver.executeScript).toHaveBeenCalledWith('mobile: hideKeyboard');
    });
    
    it('should try pressing return key if mobile command fails', async () => {
      jest.spyOn(inputHandler, 'isKeyboardShown').mockResolvedValue(true);
      
      // First call fails (hideKeyboard), second call succeeds (pressKey)
      mockDriver.executeScript
        .mockRejectedValueOnce(new Error('Command not supported'))
        .mockResolvedValueOnce(undefined);
      
      const result = await inputHandler.dismissKeyboard();
      
      expect(result).toBe(true);
      expect(mockDriver.executeScript).toHaveBeenCalledWith('mobile: pressKey', { key: 'return' });
    });
    
    it('should try tapping outside the keyboard as last resort', async () => {
      jest.spyOn(inputHandler, 'isKeyboardShown').mockResolvedValue(true);
      
      // Both mobile commands fail
      mockDriver.executeScript
        .mockRejectedValueOnce(new Error('hideKeyboard not supported'))
        .mockRejectedValueOnce(new Error('pressKey not supported'));
      
      const result = await inputHandler.dismissKeyboard();
      
      expect(result).toBe(true);
      expect(mockDriver.touchAction).toHaveBeenCalledWith({
        action: 'tap',
        x: 10,
        y: 10
      });
    });
    
    it('should handle all dismissal methods failing', async () => {
      jest.spyOn(inputHandler, 'isKeyboardShown').mockResolvedValue(true);
      
      // All methods fail
      mockDriver.executeScript
        .mockRejectedValueOnce(new Error('hideKeyboard not supported'))
        .mockRejectedValueOnce(new Error('pressKey not supported'));
      mockDriver.touchAction.mockRejectedValue(new Error('TouchAction failed'));
      
      const result = await inputHandler.dismissKeyboard();
      
      expect(result).toBe(false);
    });
  });
  
  describe('escapeSpecialCharacters', () => {
    it('should escape newlines', () => {
      // Access the private method using type casting
      const escaped = (inputHandler as any).escapeSpecialCharacters('line1\nline2');
      expect(escaped).toBe('line1\\nline2');
    });
    
    it('should escape tabs, quotes and backslashes', () => {
      const escaped = (inputHandler as any).escapeSpecialCharacters('test\t"quote\'s"\\');
      expect(escaped).toBe('test\\t\\"quote\\\'s\\"\\\\');
    });
    
    it('should escape multiple special characters', () => {
      const escaped = (inputHandler as any).escapeSpecialCharacters('a\nb\tc\rd\fe\\f"g\'');
      expect(escaped).toBe('a\\nb\\tc\\rd\\fe\\\\f\\"g\\\'');
    });
  });
}); 