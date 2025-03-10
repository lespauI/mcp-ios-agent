import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { VisualChecker, ScreenshotRegion, VisualCheckOptions } from '../../src/actions/VisualChecker';
import * as jimp from 'jimp';
import { OpenCVImageProcessor } from '../../src/utils/OpenCVImageProcessor';

// Mock the jimp module
jest.mock('jimp', () => {
  // Create a mock image object
  const mockImage = {
    bitmap: { width: 100, height: 100 },
    crop: jest.fn().mockReturnThis(),
    getPixelColor: jest.fn().mockReturnValue(0xFFFFFFFF),
    setPixelColor: jest.fn().mockReturnThis(),
    getBufferAsync: jest.fn().mockResolvedValue(Buffer.from('mockImageBuffer'))
  };

  // Create the jimp mock
  return {
    read: jest.fn().mockResolvedValue(mockImage),
    MIME_PNG: 'image/png',
    intToRGBA: jest.fn().mockImplementation(() => ({ r: 100, g: 100, b: 100, a: 255 })),
    // Constructor function
    default: jest.fn().mockImplementation(() => mockImage)
  };
});

// Mock the OpenCVImageProcessor
jest.mock('../../src/utils/OpenCVImageProcessor');

describe('VisualChecker', () => {
  let mockDriver: any;
  let visualChecker: VisualChecker;
  let mockScreenshot: string;
  let mockOpenCVProcessor: any;
  let mockCompareImages: jest.Mock;

  beforeEach(() => {
    // Create a sample base64 image
    mockScreenshot = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    // Mock the WebDriverIO driver
    mockDriver = {
      takeScreenshot: jest.fn().mockResolvedValue(mockScreenshot)
    };

    // Reset OpenCVImageProcessor mock
    (OpenCVImageProcessor as jest.Mock).mockClear();
    (OpenCVImageProcessor as jest.Mock).mockImplementation(() => ({
      loadImageFromBase64: jest.fn().mockResolvedValue({}),
      compareImages: jest.fn().mockResolvedValue({ diffPercentage: 0.01, diffImage: {} }),
      imageToBase64: jest.fn().mockResolvedValue('diff-image-base64')
    }));

    // Create the VisualChecker instance
    visualChecker = new VisualChecker(mockDriver as WebdriverIO.Browser);

    // Mock the OpenCVImageProcessor constructor
    mockOpenCVProcessor = {
      compareImages: jest.fn().mockResolvedValue({
        diffPercentage: 0.05,
        diffImage: 'diffImage'
      }),
      loadImageFromBase64: jest.fn().mockResolvedValue('loadedImage'),
      cropImage: jest.fn().mockResolvedValue('croppedImage'),
      imageToBase64: jest.fn().mockResolvedValue('processedBase64Image')
    };

    // Mock the OpenCVImageProcessor constructor
    (OpenCVImageProcessor as jest.Mock) = jest.fn().mockImplementation(() => mockOpenCVProcessor);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('takeScreenshot', () => {
    it('should call driver.takeScreenshot and return the screenshot', async () => {
      // Act
      const result = await visualChecker.takeScreenshot();

      // Assert
      expect(mockDriver.takeScreenshot).toHaveBeenCalled();
      expect(result).toBe(mockScreenshot);
    });

    it('should store the screenshot when a name is provided', async () => {
      // Arrange
      const name = 'test-screenshot';

      // Act
      await visualChecker.takeScreenshot(name);
      const storedScreenshot = visualChecker.getScreenshot(name);

      // Assert
      expect(storedScreenshot).toBe(mockScreenshot);
    });

    it('should throw an error when takeScreenshot fails', async () => {
      // Arrange
      const error = new Error('Screenshot failed');
      mockDriver.takeScreenshot.mockRejectedValueOnce(error);

      // Act & Assert
      await expect(visualChecker.takeScreenshot()).rejects.toThrow();
    });
  });

  describe('checkForChanges', () => {
    it('should return {changed: false} if there is no baseline screenshot', async () => {
      // Act
      const result = await visualChecker.checkForChanges();

      // Assert
      expect(result.changed).toBe(false);
      expect(mockDriver.takeScreenshot).toHaveBeenCalled();
    });
  });

  describe('compareScreenshots', () => {
    it('should compare two named screenshots', async () => {
      // Store two screenshots
      await visualChecker.takeScreenshot('before');
      
      const afterScreenshot = 'data:image/png;base64,differentBase64Data';
      mockDriver.takeScreenshot.mockResolvedValue(afterScreenshot);
      await visualChecker.takeScreenshot('after');
      
      // Mock compareImages behavior
      const mockCompareImages = jest.fn().mockResolvedValue({
        diffPercentage: 0.1,
        diffImage: 'mockDiffImage'
      });
      
      Object.defineProperty(VisualChecker.prototype, 'compareImages', {
        value: mockCompareImages,
        configurable: true
      });
      
      const result = await visualChecker.compareScreenshots('before', 'after');
      
      expect(result).toBeDefined();
      expect(result.beforeImage).toBe(mockScreenshot);
      expect(result.afterImage).toBe(afterScreenshot);
      expect(mockCompareImages).toHaveBeenCalled();
    });
    
    it('should throw error if before screenshot is not found', async () => {
      await expect(visualChecker.compareScreenshots('nonexistent', 'after')).rejects.toThrow('not found');
    });
    
    it('should throw error if after screenshot is not found', async () => {
      await visualChecker.takeScreenshot('before');
      
      await expect(visualChecker.compareScreenshots('before', 'nonexistent')).rejects.toThrow('not found');
    });
    
    it('should use provided region for comparison', async () => {
      // Store screenshots
      await visualChecker.takeScreenshot('before');
      await visualChecker.takeScreenshot('after');
      
      const region: ScreenshotRegion = { x: 10, y: 10, width: 100, height: 100 };
      
      // Mock compareImages behavior
      const mockCompareImages = jest.fn().mockResolvedValue({
        diffPercentage: 0.1,
        diffImage: 'mockDiffImage'
      });
      
      Object.defineProperty(VisualChecker.prototype, 'compareImages', {
        value: mockCompareImages,
        configurable: true
      });
      
      await visualChecker.compareScreenshots('before', 'after', { region });
      
      // Verify region was passed to compareImages
      expect(mockCompareImages).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        region,
        expect.anything()
      );
    });
  });
  
  describe('getScreenshot', () => {
    it('should return screenshot by name', async () => {
      await visualChecker.takeScreenshot('test');
      
      const screenshot = visualChecker.getScreenshot('test');
      
      expect(screenshot).toBe(mockScreenshot);
    });
    
    it('should return null if screenshot not found', () => {
      const screenshot = visualChecker.getScreenshot('nonexistent');
      
      expect(screenshot).toBeNull();
    });
  });
  
  describe('clearScreenshots', () => {
    it('should clear all stored screenshots', async () => {
      await visualChecker.takeScreenshot('test1');
      await visualChecker.takeScreenshot('test2');
      
      visualChecker.clearScreenshots();
      
      expect(visualChecker.getScreenshot('test1')).toBeNull();
      expect(visualChecker.getScreenshot('test2')).toBeNull();
    });
  });
}); 