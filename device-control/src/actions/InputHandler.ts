import { Logger } from '../utils/Logger';
import { ElementLocator } from '../element/ElementLocator';
import { ActionVerifier } from './ActionVerifier';
import { sleep } from '../utils/helpers';

export interface InputOptions {
  clearFirst?: boolean;
  verifyInput?: boolean;
  retryOnFailure?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  byChar?: boolean;
  charDelay?: number;
  escapeSpecialChars?: boolean;
  checkKeyboard?: boolean;
  secureInput?: boolean;
  useClipboard?: boolean; // Whether to use clipboard for input (useful for large text)
}

export interface InputResult {
  success: boolean;
  element?: WebdriverIO.Element;
  actualValue?: string;
  expectedValue: string;
  retryCount?: number;
}

/**
 * Handles text input operations with enhanced reliability
 */
export class InputHandler {
  private logger = new Logger('InputHandler');
  private readonly DEFAULT_MAX_RETRIES = 3;
  private readonly DEFAULT_RETRY_DELAY = 500; // 500ms
  private readonly DEFAULT_CHAR_DELAY = 50; // 50ms
  
  /**
   * Creates a new InputHandler instance
   * 
   * @param driver - WebDriverIO browser instance
   * @param elementLocator - Element locator instance
   * @param actionVerifier - Action verifier instance
   */
  constructor(
    private driver: WebdriverIO.Browser,
    private elementLocator: ElementLocator,
    private actionVerifier: ActionVerifier
  ) {}
  
  /**
   * Sets text in an input element with enhanced reliability
   * 
   * @param element - Element to input text into
   * @param text - Text to input
   * @param options - Input options
   * @returns Input result
   */
  async setText(
    element: WebdriverIO.Element,
    text: string,
    options: Partial<InputOptions> = {}
  ): Promise<InputResult> {
    const mergedOptions = {
      clearFirst: true,
      verifyInput: true,
      retryOnFailure: true,
      maxRetries: this.DEFAULT_MAX_RETRIES,
      retryDelay: this.DEFAULT_RETRY_DELAY,
      byChar: false,
      charDelay: this.DEFAULT_CHAR_DELAY,
      escapeSpecialChars: false,
      checkKeyboard: true,
      secureInput: false,
      useClipboard: false,
      ...options
    };
    
    let retryCount = 0;
    let success = false;
    let actualValue: string | undefined;
    
    // Add support for clipboard input
    if (mergedOptions.useClipboard) {
      this.logger.info('Using clipboard for text input');
      const clipboardSuccess = await this.setTextViaClipboard(element, text);
      
      if (clipboardSuccess && mergedOptions.verifyInput) {
        // Verify the input
        actualValue = await element.getAttribute('value');
        if (actualValue === text) {
          return { success: true, element, actualValue, expectedValue: text };
        } else {
          this.logger.warn('Text verification failed after clipboard input', {
            expected: text,
            actual: actualValue
          });
        }
      }
      
      return { 
        success: clipboardSuccess, 
        element, 
        expectedValue: text 
      };
    }
    
    do {
      try {
        // Clear the input field if specified
        if (mergedOptions.clearFirst) {
          await element.clearValue();
        }
        
        // Check if keyboard is shown if specified
        if (mergedOptions.checkKeyboard) {
          const keyboardShown = await this.isKeyboardShown();
          
          if (!keyboardShown) {
            // Try to activate the keyboard by clicking the element
            await element.click();
            await sleep(300); // Short wait for keyboard to appear
          }
        }
        
        // Input text character by character if specified
        if (mergedOptions.byChar) {
          for (const char of text) {
            await element.addValue(char);
            await sleep(mergedOptions.charDelay);
          }
        } else {
          // Input entire text at once
          if (mergedOptions.escapeSpecialChars) {
            await element.setValue(this.escapeSpecialCharacters(text));
          } else {
            await element.setValue(text);
          }
        }
        
        // Verify input if specified
        if (mergedOptions.verifyInput && !mergedOptions.secureInput) {
          actualValue = await element.getAttribute('value');
          
          // Check if the input value matches the expected text
          if (actualValue === text) {
            success = true;
          } else {
            this.logger.warn(`Input verification failed. Expected: "${text}", Actual: "${actualValue}"`);
            
            if (mergedOptions.retryOnFailure) {
              retryCount++;
              
              if (retryCount < mergedOptions.maxRetries) {
                this.logger.info(`Retrying input (${retryCount}/${mergedOptions.maxRetries})`);
                await sleep(mergedOptions.retryDelay);
              }
            }
          }
        } else {
          // If we can't verify (e.g., secure input), assume success
          success = true;
        }
      } catch (error) {
        this.logger.error(`Input operation failed: ${error}`);
        
        if (mergedOptions.retryOnFailure) {
          retryCount++;
          
          if (retryCount < mergedOptions.maxRetries) {
            this.logger.info(`Retrying input after error (${retryCount}/${mergedOptions.maxRetries})`);
            await sleep(mergedOptions.retryDelay);
          }
        }
      }
    } while (!success && mergedOptions.retryOnFailure && retryCount < mergedOptions.maxRetries);
    
    return {
      success,
      element,
      actualValue,
      expectedValue: text,
      retryCount
    };
  }
  
  /**
   * Sets text in an input element by searching for it
   * 
   * @param strategy - Element locator strategy
   * @param selector - Element selector
   * @param text - Text to input
   * @param options - Input options
   * @returns Input result
   */
  async setTextBySelector(
    strategy: string,
    selector: string,
    text: string,
    options: Partial<InputOptions> = {}
  ): Promise<InputResult> {
    try {
      const element = await this.elementLocator.findElement(strategy as any, selector);
      return this.setText(element, text, options);
    } catch (error) {
      this.logger.error(`Failed to find element for text input: ${error}`);
      
      return {
        success: false,
        expectedValue: text
      };
    }
  }
  
  /**
   * Types text using the keyboard without a specific input element
   * 
   * @param text - Text to type
   * @param options - Input options
   * @returns Success status
   */
  async typeText(
    text: string,
    options: Partial<InputOptions> = {}
  ): Promise<boolean> {
    const mergedOptions = {
      byChar: true,
      charDelay: this.DEFAULT_CHAR_DELAY,
      escapeSpecialChars: false,
      ...options
    };
    
    try {
      // Check if keyboard is shown
      const keyboardShown = await this.isKeyboardShown();
      
      if (!keyboardShown) {
        this.logger.warn('Keyboard is not shown, cannot type text');
        return false;
      }
      
      // Type text character by character
      if (mergedOptions.byChar) {
        for (const char of text) {
          await this.driver.executeScript('mobile: pressKey', {
            key: mergedOptions.escapeSpecialChars ? this.escapeSpecialCharacters(char) : char
          });
          await sleep(mergedOptions.charDelay);
        }
      } else {
        // Type entire text at once (not recommended for reliability)
        await this.driver.executeScript('mobile: pressKey', {
          key: mergedOptions.escapeSpecialChars ? this.escapeSpecialCharacters(text) : text
        });
      }
      
      return true;
    } catch (error) {
      this.logger.error(`Failed to type text: ${error}`);
      return false;
    }
  }
  
  /**
   * Checks if the keyboard is currently shown
   * 
   * @returns True if keyboard is shown
   */
  async isKeyboardShown(): Promise<boolean> {
    try {
      const result = await this.driver.executeScript('mobile: isKeyboardShown');
      return !!result;
    } catch (error) {
      // If the command is not supported, try to find keyboard element
      try {
        const keyboardElement = await this.elementLocator.findElement(
          'class name',
          'XCUIElementTypeKeyboard',
          { timeout: 1000 }
        );
        return !!keyboardElement;
      } catch (elementError) {
        return false;
      }
    }
  }
  
  /**
   * Dismisses the keyboard if it's shown
   * 
   * @returns True if keyboard was dismissed
   */
  async dismissKeyboard(): Promise<boolean> {
    try {
      const keyboardShown = await this.isKeyboardShown();
      
      if (!keyboardShown) {
        return true; // Keyboard already dismissed
      }
      
      // Try using the mobile command first
      try {
        await this.driver.executeScript('mobile: hideKeyboard');
        return true;
      } catch (commandError) {
        // If mobile command fails, try pressing return key
        try {
          await this.driver.executeScript('mobile: pressKey', { key: 'return' });
          return true;
        } catch (returnKeyError) {
          // If return key fails, try tapping outside the keyboard
          try {
            // Get screen size
            const size = await this.driver.getWindowSize();
            
            // Tap in the top-left corner (usually outside of keyboard)
            await this.driver.touchAction({
              action: 'tap',
              x: 10,
              y: 10
            });
            
            return true;
          } catch (tapError) {
            this.logger.error(`Failed to dismiss keyboard: ${tapError}`);
            return false;
          }
        }
      }
    } catch (error) {
      this.logger.error(`Failed to check/dismiss keyboard: ${error}`);
      return false;
    }
  }
  
  /**
   * Escapes special characters in text for input
   * 
   * @param text - Text to escape
   * @returns Escaped text
   * @private
   */
  private escapeSpecialCharacters(text: string): string {
    // Replace special characters with their escaped versions
    return text
      .replace(/\\/g, '\\\\') // Backslash
      .replace(/\n/g, '\\n')   // New line
      .replace(/\r/g, '\\r')   // Carriage return
      .replace(/\t/g, '\\t')   // Tab
      .replace(/\f/g, '\\f')   // Form feed
      .replace(/'/g, '\\\'')   // Single quote
      .replace(/"/g, '\\"');   // Double quote
  }
  
  /**
   * Gets the current content of the device clipboard
   * 
   * @returns Promise resolving to clipboard text content
   */
  async getClipboardText(): Promise<string> {
    try {
      // Execute a script to get the clipboard content (iOS specific)
      const content = await this.driver.execute(
        'mobile: getClipboard', 
        { contentType: 'plaintext' }
      );
      
      this.logger.info('Retrieved clipboard content');
      return content as string;
    } catch (error) {
      this.logger.error('Failed to get clipboard content', { error });
      return '';
    }
  }
  
  /**
   * Sets text to the device clipboard
   * 
   * @param text - Text to set in the clipboard
   * @returns Promise resolving to true if successful
   */
  async setClipboardText(text: string): Promise<boolean> {
    try {
      // Execute a script to set the clipboard content (iOS specific)
      await this.driver.execute(
        'mobile: setClipboard', 
        { content: text, contentType: 'plaintext' }
      );
      
      this.logger.info('Set clipboard content');
      return true;
    } catch (error) {
      this.logger.error('Failed to set clipboard content', { error });
      return false;
    }
  }
  
  /**
   * Pastes text from clipboard into the focused element
   * 
   * @returns Promise resolving to true if successful
   */
  async pasteFromClipboard(): Promise<boolean> {
    try {
      // Execute the keyboard shortcut for paste
      await this.driver.execute(
        'mobile: performEditorAction', 
        { action: 'paste' }
      );
      
      this.logger.info('Pasted text from clipboard');
      return true;
    } catch (error) {
      this.logger.error('Failed to paste from clipboard', { error });
      return false;
    }
  }
  
  /**
   * Sets text in an input element using the clipboard
   * This is useful for large text inputs as it's more reliable than character-by-character typing
   * 
   * @param element - WebDriverIO element
   * @param text - Text to set
   * @returns Promise resolving to true if successful
   */
  async setTextViaClipboard(element: WebdriverIO.Element, text: string): Promise<boolean> {
    try {
      // Focus the element first
      await element.click();
      
      // Set clipboard content
      const clipboardSet = await this.setClipboardText(text);
      if (!clipboardSet) {
        this.logger.error('Failed to set clipboard content for paste operation');
        return false;
      }
      
      // Clear existing content if needed
      await element.clearValue();
      
      // Paste the clipboard content
      const pasteSuccess = await this.pasteFromClipboard();
      return pasteSuccess;
    } catch (error) {
      this.logger.error('Failed to set text via clipboard', { error });
      return false;
    }
  }
} 