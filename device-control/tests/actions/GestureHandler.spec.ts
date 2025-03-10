/**
 * GestureHandler test
 */

// Mock the Logger
jest.mock("../../src/utils/Logger", () => {
  return {
    Logger: jest.fn().mockImplementation(() => ({
      error: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn()
    }))
  };
});

// Mock the sleep function
jest.mock("../../src/utils/helpers", () => ({
  sleep: jest.fn().mockResolvedValue(undefined)
}));

// Import the module after mocking
const { GestureHandler } = require("../../src/actions/GestureHandler");
const { sleep } = require("../../src/utils/helpers");

describe("GestureHandler", () => {
  let mockDriver;
  let mockElementLocator;
  let mockActionVerifier;
  let gestureHandler;
  let mockElement;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up mock element
    mockElement = {
      elementId: "mock-element-id",
      getRect: jest.fn().mockResolvedValue({ x: 100, y: 200, width: 100, height: 50 }),
      isDisplayed: jest.fn().mockResolvedValue(true)
    };
    
    // Mock the WebDriverIO driver
    mockDriver = {
      getWindowRect: jest.fn().mockResolvedValue({ width: 375, height: 812, x: 0, y: 0 }),
      performActions: jest.fn().mockResolvedValue(undefined),
      executeScript: jest.fn().mockResolvedValue(undefined)
    };

    // Mock element locator and action verifier
    mockElementLocator = {};
    mockActionVerifier = {
      verifyAction: jest.fn().mockResolvedValue({ success: true })
    };

    // Create the GestureHandler instance
    gestureHandler = new GestureHandler(
      mockDriver,
      mockElementLocator,
      mockActionVerifier
    );
  });

  describe("swipe", () => {
    it("should perform a swipe gesture with correct parameters", async () => {
      // Arrange
      const swipeOptions = { direction: "up" };
      
      // Act
      const result = await gestureHandler.swipe(swipeOptions);
      
      // Assert
      expect(result).toBe(true);
      expect(mockDriver.getWindowRect).toHaveBeenCalled();
      expect(mockDriver.performActions).toHaveBeenCalled();
      
      // Verify the actions structure
      const actionsArg = mockDriver.performActions.mock.calls[0][0];
      expect(actionsArg[0].type).toBe("pointer");
      expect(actionsArg[0].parameters).toEqual({ pointerType: "touch" });
      expect(actionsArg[0].actions.some(a => a.type === "pointerDown")).toBe(true);
      expect(actionsArg[0].actions.some(a => a.type === "pointerMove")).toBe(true);
      expect(actionsArg[0].actions.some(a => a.type === "pointerUp")).toBe(true);
    });
    
    it("should handle errors during swipe", async () => {
      // Arrange
      mockDriver.performActions.mockRejectedValueOnce(new Error("Swipe error"));
      
      // Act
      const result = await gestureHandler.swipe({ direction: "up" });
      
      // Assert
      expect(result).toBe(false);
    });
  });
  
  describe("tap", () => {
    it("should tap on coordinates", async () => {
      // Act
      const result = await gestureHandler.tap({ x: 100, y: 200 });
      
      // Assert
      expect(result).toBe(true);
      expect(mockDriver.performActions).toHaveBeenCalled();
      
      const actionsArg = mockDriver.performActions.mock.calls[0][0];
      expect(actionsArg[0].actions.some(a => 
        a.type === "pointerMove" && a.x === 100 && a.y === 200
      )).toBe(true);
    });
    
    it("should tap on an element", async () => {
      // Act
      const result = await gestureHandler.tap(mockElement);
      
      // Assert
      expect(result).toBe(true);
      expect(mockElement.getRect).toHaveBeenCalled();
      expect(mockDriver.performActions).toHaveBeenCalled();
    });
  });
  
  describe("scrollToElement", () => {
    it("should use mobile scroll command when available", async () => {
      // Act
      const result = await gestureHandler.scrollToElement(mockElement);
      
      // Assert
      expect(result).toBe(true);
      expect(mockDriver.executeScript).toHaveBeenCalledWith(
        "mobile: scroll", 
        { elementId: "mock-element-id", toVisible: true }
      );
    });
    
    it("should fall back to manual scrolling when mobile command fails", async () => {
      // Arrange
      mockDriver.executeScript.mockRejectedValueOnce(new Error("Mobile scroll not supported"));
      mockElement.isDisplayed
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);
      
      // Act
      const result = await gestureHandler.scrollToElement(mockElement, { direction: "down" });
      
      // Assert
      expect(result).toBe(true);
      expect(mockDriver.performActions).toHaveBeenCalled();
    });
  });
});