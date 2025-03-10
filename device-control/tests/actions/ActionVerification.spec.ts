import { jest, expect } from '@jest/globals';
import { ActionVerifier } from '../../src/actions/ActionVerifier';
import { VisualChecker } from '../../src/actions/VisualChecker';
import { ElementStateChecker, ElementSelector } from '../../src/actions/ElementStateChecker';
import { ElementLocator } from '../../src/element/ElementLocator';

describe('ActionVerifier', () => {
  let driver: any;
  let elementLocator: ElementLocator;
  let visualChecker: VisualChecker;
  let elementStateChecker: ElementStateChecker;
  let actionVerifier: ActionVerifier;
  
  beforeEach(() => {
    // Create mock driver
    driver = {
      takeScreenshot: jest.fn().mockResolvedValue('base64screenshot'),
      executeScript: jest.fn().mockResolvedValue({}),
      findElement: jest.fn().mockResolvedValue({
        isDisplayed: jest.fn().mockResolvedValue(true),
        isEnabled: jest.fn().mockResolvedValue(true),
        getAttribute: jest.fn().mockResolvedValue('value'),
        getText: jest.fn().mockResolvedValue('text')
      })
    };
    
    // Mock the element locator
    elementLocator = {
      findElement: jest.fn().mockResolvedValue({
        isDisplayed: jest.fn().mockResolvedValue(true),
        isEnabled: jest.fn().mockResolvedValue(true),
        getAttribute: jest.fn().mockResolvedValue('value'),
        getText: jest.fn().mockResolvedValue('text')
      }),
      waitForElement: jest.fn().mockResolvedValue({
        isDisplayed: jest.fn().mockResolvedValue(true),
        isEnabled: jest.fn().mockResolvedValue(true)
      })
    } as any;
    
    // Create the component instances
    visualChecker = new VisualChecker(driver);
    elementStateChecker = new ElementStateChecker(driver, elementLocator);
    actionVerifier = new ActionVerifier(driver, visualChecker, elementStateChecker);

    // Spy on the verification methods and mock their behavior
    jest.spyOn(visualChecker, 'takeScreenshot').mockResolvedValue();
    jest.spyOn(visualChecker, 'checkForChanges').mockResolvedValue({ changed: true });
    jest.spyOn(elementStateChecker, 'verifyElementState').mockResolvedValue({ verified: true });
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('verifyAction', () => {
    it('should verify an action using both visual and element state checks', async () => {
      // Perform the action verification
      const action = jest.fn().mockResolvedValue(undefined);
      const elementSelector: ElementSelector = { strategy: 'xpath', selector: '//button' };
      
      const result = await actionVerifier.verifyAction(action, elementSelector);
      
      // Verify the action was called
      expect(action).toHaveBeenCalled();
      
      // Verify the result is positive
      expect(result.success).toBe(true);
      
      // Verify both visual and element state checks were performed
      expect(visualChecker.checkForChanges).toHaveBeenCalled();
      expect(elementStateChecker.verifyElementState).toHaveBeenCalled();
    });
    
    it('should return failure when no visual changes are detected', async () => {
      // Mock the checks to return failure
      (visualChecker.checkForChanges as jest.MockedFunction<any>).mockResolvedValue({ changed: false });
      
      // Perform the action verification
      const action = jest.fn().mockResolvedValue(undefined);
      const elementSelector: ElementSelector = { strategy: 'xpath', selector: '//button' };
      
      const result = await actionVerifier.verifyAction(action, elementSelector);
      
      // Verify the result is negative
      expect(result.success).toBe(false);
      expect(result.failureReason).toContain('No visual changes');
    });

    it('should return failure when element state verification fails', async () => {
      // Mock visual check to succeed but element check to fail
      (visualChecker.checkForChanges as jest.MockedFunction<any>).mockResolvedValue({ changed: true });
      (elementStateChecker.verifyElementState as jest.MockedFunction<any>).mockResolvedValue({ 
        verified: false,
        reason: 'Element state verification failed'
      });
      
      // Perform the action verification
      const action = jest.fn().mockResolvedValue(undefined);
      const elementSelector: ElementSelector = { strategy: 'xpath', selector: '//button' };
      
      const result = await actionVerifier.verifyAction(action, elementSelector);
      
      // Verify the result is negative
      expect(result.success).toBe(false);
      expect(result.failureReason).toContain('Element state verification failed');
    });
    
    it('should perform retry for failed actions', async () => {
      // Make the action fail on first attempt, succeed on second
      const action = jest.fn()
        .mockRejectedValueOnce(new Error('Action failed'))
        .mockResolvedValueOnce(undefined);
      
      // Perform the action verification with retry
      const elementSelector: ElementSelector = { strategy: 'xpath', selector: '//button' };
      const options = { retry: true, maxRetries: 2 };
      
      const result = await actionVerifier.verifyAction(action, elementSelector, options);
      
      // Verify the action was retried
      expect(action).toHaveBeenCalledTimes(2);
      
      // Verify the result is positive
      expect(result.success).toBe(true);
      expect(result.retry?.attempted).toBe(true);
      expect(result.retry?.count).toBe(1);
      expect(result.retry?.success).toBe(true);
    });
    
    it('should attempt to undo a failed action', async () => {
      // Mock a failing action
      const action = jest.fn().mockRejectedValue(new Error('Action failed'));
      
      // Mock the undo function
      const undoFn = jest.fn().mockResolvedValue(undefined);
      
      // Perform the action verification with undo
      const elementSelector: ElementSelector = { strategy: 'xpath', selector: '//button' };
      const options = { undo: undoFn };
      
      const result = await actionVerifier.verifyAction(action, elementSelector, options);
      
      // Verify the undo was called
      expect(undoFn).toHaveBeenCalled();
      
      // Verify the result is negative
      expect(result.success).toBe(false);
      expect(result.actionUndone).toBe(true);
    });

    it('should verify action with only visual check if no element selector', async () => {
      // Perform the action verification without element selector
      const action = jest.fn().mockResolvedValue(undefined);
      
      const result = await actionVerifier.verifyAction(action);
      
      // Verify the action was called
      expect(action).toHaveBeenCalled();
      
      // Verify only visual check was performed, not element check
      expect(visualChecker.checkForChanges).toHaveBeenCalled();
      expect(elementStateChecker.verifyElementState).not.toHaveBeenCalled();
      
      // Verify the result is positive
      expect(result.success).toBe(true);
    });

    it('should handle action failure even with retries', async () => {
      // Mock a consistently failing action
      const action = jest.fn().mockRejectedValue(new Error('Action failed'));
      
      // Perform the action verification with retry
      const elementSelector: ElementSelector = { strategy: 'xpath', selector: '//button' };
      const options = { retry: true, maxRetries: 2 };
      
      const result = await actionVerifier.verifyAction(action, elementSelector, options);
      
      // Verify the action was retried
      expect(action).toHaveBeenCalledTimes(2); 
      
      // Verify the result is negative
      expect(result.success).toBe(false);
      expect(result.failureReason).toContain('Action failed');
      expect(result.retry?.attempted).toBe(true);
      expect(result.retry?.count).toBe(2);
      expect(result.retry?.success).toBe(false);
    });
  });
  
  describe('verifyCheckpoint', () => {
    it('should verify all elements in a checkpoint are in the expected state', async () => {
      // Define a checkpoint with multiple elements
      const checkpoint = {
        name: 'Login Screen',
        elements: [
          { strategy: 'xpath', selector: '//button[@text="Login"]', expectedState: { visible: true } },
          { strategy: 'xpath', selector: '//input[@id="username"]', expectedState: { enabled: true } }
        ]
      };
      
      // Verify the checkpoint
      const result = await actionVerifier.verifyCheckpoint(checkpoint);
      
      // Verify the result
      expect(result.success).toBe(true);
      expect(result.elements.length).toBe(2);
      expect(result.elements.every(e => e.verified)).toBe(true);
    });
    
    it('should return failure if any element does not match expected state', async () => {
      // Mock the element state checker to pass for first element, fail for second
      (elementStateChecker.verifyElementState as jest.MockedFunction<any>)
        .mockResolvedValueOnce({ verified: true })
        .mockResolvedValueOnce({ 
          verified: false,
          reason: 'Element not in expected state'
        });
      
      // Define a checkpoint with multiple elements
      const checkpoint = {
        name: 'Login Screen',
        elements: [
          { strategy: 'xpath', selector: '//button[@text="Login"]', expectedState: { visible: true } },
          { strategy: 'xpath', selector: '//input[@id="username"]', expectedState: { enabled: true } }
        ]
      };
      
      // Verify the checkpoint
      const result = await actionVerifier.verifyCheckpoint(checkpoint);
      
      // Verify the result
      expect(result.success).toBe(false);
      expect(result.elements[0].verified).toBe(true);
      expect(result.elements[1].verified).toBe(false);
    });

    it('should handle empty checkpoint elements array', async () => {
      // Define a checkpoint with no elements
      const checkpoint = {
        name: 'Empty Screen',
        elements: []
      };
      
      // Verify the checkpoint
      const result = await actionVerifier.verifyCheckpoint(checkpoint);
      
      // Verify the result
      expect(result.success).toBe(true);
      expect(result.elements.length).toBe(0);
    });
  });

  describe('verifyMultipleCheckpoints', () => {
    it('should verify multiple checkpoints in sequence', async () => {
      // Define checkpoints
      const checkpoints = [
        {
          name: 'Login Screen',
          elements: [
            { strategy: 'xpath', selector: '//button', expectedState: { visible: true } }
          ]
        },
        {
          name: 'Dashboard',
          elements: [
            { strategy: 'xpath', selector: '//header', expectedState: { visible: true } }
          ]
        }
      ];
      
      // Mock verifyCheckpoint to return success
      jest.spyOn(actionVerifier, 'verifyCheckpoint')
        .mockResolvedValueOnce({
          success: true,
          checkpointName: 'Login Screen',
          elements: [{ verified: true, selector: { strategy: 'xpath', selector: '//button' } }]
        })
        .mockResolvedValueOnce({
          success: true,
          checkpointName: 'Dashboard',
          elements: [{ verified: true, selector: { strategy: 'xpath', selector: '//header' } }]
        });
      
      // Verify multiple checkpoints
      const results = await actionVerifier.verifyMultipleCheckpoints(checkpoints);
      
      // Verify the results
      expect(results.length).toBe(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });
    
    it('should stop on first failure with failFast option', async () => {
      // Define checkpoints
      const checkpoints = [
        {
          name: 'Login Screen',
          elements: [
            { strategy: 'xpath', selector: '//button', expectedState: { visible: true } }
          ]
        },
        {
          name: 'Dashboard',
          elements: [
            { strategy: 'xpath', selector: '//header', expectedState: { visible: true } }
          ]
        }
      ];
      
      // Mock verifyCheckpoint to fail on first checkpoint
      jest.spyOn(actionVerifier, 'verifyCheckpoint')
        .mockResolvedValueOnce({
          success: false,
          checkpointName: 'Login Screen',
          elements: [{ verified: false, selector: { strategy: 'xpath', selector: '//button' } }]
        })
        .mockResolvedValueOnce({
          success: true,
          checkpointName: 'Dashboard',
          elements: [{ verified: true, selector: { strategy: 'xpath', selector: '//header' } }]
        });
      
      // Verify multiple checkpoints with failFast
      const results = await actionVerifier.verifyMultipleCheckpoints(checkpoints, true);
      
      // Verify only first checkpoint was checked
      expect(results.length).toBe(1);
      expect(results[0].success).toBe(false);
      expect(actionVerifier.verifyCheckpoint).toHaveBeenCalledTimes(1);
    });
  });

  describe('createVisualCheckpoint', () => {
    it('should create a visual checkpoint', async () => {
      // Mock the underlying methods but don't clear the existing mocks
      jest.spyOn(visualChecker, 'takeScreenshot').mockResolvedValue('screenshot-data');
      jest.spyOn(visualChecker, 'saveScreenshot').mockResolvedValue(true);
      
      const result = await actionVerifier.createVisualCheckpoint('login-screen');
      
      expect(result).toBe(true);
      expect(visualChecker.saveScreenshot).toHaveBeenCalledWith('login-screen', undefined);
    });
    
    it('should create a visual checkpoint with region', async () => {
      // Mock the underlying methods but don't clear the existing mocks
      jest.spyOn(visualChecker, 'takeScreenshot').mockResolvedValue('screenshot-data');
      jest.spyOn(visualChecker, 'saveScreenshot').mockResolvedValue(true);
      
      const region = { x: 0, y: 0, width: 100, height: 100 };
      const result = await actionVerifier.createVisualCheckpoint('login-screen', region);
      
      expect(result).toBe(true);
      expect(visualChecker.saveScreenshot).toHaveBeenCalledWith('login-screen', region);
    });
  });

  describe('compareWithVisualCheckpoint', () => {
    it('should compare current screen with saved checkpoint', async () => {
      // Mock the underlying methods but don't clear the existing mocks
      jest.spyOn(visualChecker, 'takeScreenshot').mockResolvedValue('screenshot-data');
      jest.spyOn(visualChecker, 'getScreenshot').mockReturnValue('screenshot-data');
      jest.spyOn(visualChecker, 'compareScreenshots').mockResolvedValue({
        changed: false,
        diffPercentage: 0,
        diffImage: ''
      });
      
      const result = await actionVerifier.compareWithVisualCheckpoint('login-screen');
      
      expect(result.changed).toBe(false);
      expect(visualChecker.compareScreenshots).toHaveBeenCalledWith('login-screen', expect.any(String), {});
    });
    
    it('should compare with options', async () => {
      // Mock the underlying methods but don't clear the existing mocks
      jest.spyOn(visualChecker, 'takeScreenshot').mockResolvedValue('screenshot-data');
      jest.spyOn(visualChecker, 'getScreenshot').mockReturnValue('screenshot-data');
      jest.spyOn(visualChecker, 'compareScreenshots').mockResolvedValue({
        changed: true,
        diffPercentage: 10,
        diffImage: 'base64diff'
      });
      
      const options = { threshold: 0.1, region: { x: 0, y: 0, width: 100, height: 100 } };
      const result = await actionVerifier.compareWithVisualCheckpoint('login-screen', options);
      
      expect(result.changed).toBe(true);
      expect(result.diffPercentage).toBe(10);
      expect(visualChecker.compareScreenshots).toHaveBeenCalledWith('login-screen', expect.any(String), options);
    });
  });
}); 