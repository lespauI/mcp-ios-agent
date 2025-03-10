import { InputHandler } from '../../src/actions/InputHandler';
import { ElementLocator } from '../../src/element/ElementLocator';
import { ActionVerifier } from '../../src/actions/ActionVerifier';
import { VisualChecker } from '../../src/actions/VisualChecker';
import { ElementStateChecker } from '../../src/actions/ElementStateChecker';
import { UIActions } from '../../src/actions/UIActions';

describe('Clipboard Operations', () => {
  // Mock browser instance
  const mockDriver = {
    execute: jest.fn(),
    $: jest.fn(),
    status: jest.fn().mockResolvedValue({ ready: true }),
  } as unknown as WebdriverIO.Browser;
  
  // Mock element
  const mockElement = {
    elementId: 'mock-element-123',
    click: jest.fn(),
    clearValue: jest.fn(),
    setValue: jest.fn(),
    getValue: jest.fn().mockResolvedValue('test text'),
    isDisplayed: jest.fn().mockResolvedValue(true),
    isEnabled: jest.fn().mockResolvedValue(true),
    isExisting: jest.fn().mockResolvedValue(true),
    waitForExist: jest.fn().mockResolvedValue(true)
  } as unknown as WebdriverIO.Element;
  
  // Mock dependencies
  const mockElementLocator = {
    findElement: jest.fn().mockResolvedValue(mockElement)
  } as unknown as ElementLocator;
  
  const mockVisualChecker = {} as unknown as VisualChecker;
  const mockElementStateChecker = {} as unknown as ElementStateChecker;
  const mockActionVerifier = {} as unknown as ActionVerifier;
  
  // Create instances
  let inputHandler: InputHandler;
  let uiActions: UIActions;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    inputHandler = new InputHandler(
      mockDriver, 
      mockElementLocator, 
      mockActionVerifier
    );
    
    uiActions = new UIActions(
      mockDriver,
      mockElementLocator
    );
    
    // Set up clipboard operation mocks
    mockDriver.execute.mockImplementation((command, args) => {
      if (command === 'mobile: getClipboard') {
        return 'clipboard content';
      }
      if (command === 'mobile: setClipboard') {
        return null; // success
      }
      if (command === 'mobile: performEditorAction') {
        return null; // success
      }
      return null;
    });
  });
  
  describe('InputHandler clipboard operations', () => {
    it('should get clipboard text', async () => {
      const result = await inputHandler.getClipboardText();
      
      expect(mockDriver.execute).toHaveBeenCalledWith(
        'mobile: getClipboard', 
        { contentType: 'plaintext' }
      );
      expect(result).toBe('clipboard content');
    });
    
    it('should set clipboard text', async () => {
      const result = await inputHandler.setClipboardText('test text');
      
      expect(mockDriver.execute).toHaveBeenCalledWith(
        'mobile: setClipboard', 
        { content: 'test text', contentType: 'plaintext' }
      );
      expect(result).toBe(true);
    });
    
    it('should paste from clipboard', async () => {
      const result = await inputHandler.pasteFromClipboard();
      
      expect(mockDriver.execute).toHaveBeenCalledWith(
        'mobile: performEditorAction', 
        { action: 'paste' }
      );
      expect(result).toBe(true);
    });
    
    it('should set text via clipboard', async () => {
      const result = await inputHandler.setTextViaClipboard(mockElement, 'test text');
      
      expect(mockElement.click).toHaveBeenCalled();
      expect(mockDriver.execute).toHaveBeenCalledWith(
        'mobile: setClipboard', 
        { content: 'test text', contentType: 'plaintext' }
      );
      expect(mockElement.clearValue).toHaveBeenCalled();
      expect(mockDriver.execute).toHaveBeenCalledWith(
        'mobile: performEditorAction', 
        { action: 'paste' }
      );
      expect(result).toBe(true);
    });
    
    it('should handle errors when getting clipboard text', async () => {
      mockDriver.execute.mockRejectedValueOnce(new Error('Failed to get clipboard'));
      
      const result = await inputHandler.getClipboardText();
      
      expect(result).toBe('');
    });
    
    it('should handle errors when setting clipboard text', async () => {
      mockDriver.execute.mockRejectedValueOnce(new Error('Failed to set clipboard'));
      
      const result = await inputHandler.setClipboardText('test text');
      
      expect(result).toBe(false);
    });
  });
  
  describe('UIActions clipboard operations', () => {
    it('should copy text to clipboard', async () => {
      await expect(uiActions.copyToClipboard('test text')).resolves.not.toThrow();
      
      expect(mockDriver.execute).toHaveBeenCalledWith(
        'mobile: setClipboard', 
        { content: 'test text', contentType: 'plaintext' }
      );
    });
    
    it('should get clipboard content', async () => {
      const result = await uiActions.getClipboardContent();
      
      expect(mockDriver.execute).toHaveBeenCalledWith(
        'mobile: getClipboard', 
        { contentType: 'plaintext' }
      );
      expect(result).toBe('clipboard content');
    });
    
    it('should paste to element', async () => {
      await expect(uiActions.pasteToElement('accessibilityId', 'test-id')).resolves.not.toThrow();
      
      expect(mockElementLocator.findElement).toHaveBeenCalledWith('accessibilityId', 'test-id');
      expect(mockElement.click).toHaveBeenCalled();
      expect(mockDriver.execute).toHaveBeenCalledWith(
        'mobile: performEditorAction', 
        { action: 'paste' }
      );
    });
    
    it('should throw error when paste fails', async () => {
      mockDriver.execute.mockRejectedValueOnce(new Error('Failed to paste'));
      
      await expect(uiActions.pasteToElement('accessibilityId', 'test-id')).rejects.toThrow('Failed to paste from clipboard');
    });
  });
}); 