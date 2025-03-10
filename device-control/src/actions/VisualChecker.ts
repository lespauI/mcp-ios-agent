import { Logger } from '../utils/Logger';
import Jimp from 'jimp';
import { OpenCVImageProcessor } from '../utils/OpenCVImageProcessor';

export interface ScreenshotRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VisualCheckOptions {
  region?: ScreenshotRegion;
  threshold?: number;
  saveScreenshots?: boolean;
  screenshotNamePrefix?: string;
}

export interface VisualComparisonResult {
  changed: boolean;
  diffPercentage?: number;
  diffImage?: string;
  beforeImage?: string;
  afterImage?: string;
  region?: ScreenshotRegion;
}

/**
 * Handles visual verification of UI actions by comparing screenshots
 */
export class VisualChecker {
  private logger = new Logger('VisualChecker');
  private screenshots: Map<string, string> = new Map();
  private lastScreenshot: string | null = null;
  private readonly DEFAULT_THRESHOLD = 0.05; // 5% difference threshold
  
  // OpenCV integration
  private openCVProcessor: OpenCVImageProcessor | null = null;
  private useOpenCV: boolean = false;

  /**
   * Creates a new VisualChecker instance
   * 
   * @param driver WebDriver instance
   * @param useOpenCV Whether to use OpenCV for image processing (if available)
   */
  constructor(private driver: WebdriverIO.Browser, useOpenCV: boolean = true) {
    this.useOpenCV = useOpenCV;
    if (this.useOpenCV) {
      try {
        this.openCVProcessor = new OpenCVImageProcessor();
        this.logger.info('OpenCV image processor initialized successfully');
      } catch (error) {
        this.logger.warn('Failed to initialize OpenCV, falling back to Jimp', { error });
        this.useOpenCV = false;
      }
    }
  }
  
  /**
   * Takes a screenshot and optionally stores it with a name
   * 
   * @param name - Optional name to store the screenshot
   * @returns Base64 screenshot data
   */
  async takeScreenshot(name?: string): Promise<string> {
    try {
      const screenshot = await this.driver.takeScreenshot();
      
      if (name) {
        this.screenshots.set(name, screenshot);
      }
      
      this.lastScreenshot = screenshot;
      return screenshot;
    } catch (error) {
      this.logger.error('Failed to take screenshot', { error });
      throw new Error(`Failed to take screenshot: ${error}`);
    }
  }
  
  /**
   * Checks for visual changes since the last screenshot
   * 
   * @param options - Visual check options
   * @returns Visual comparison result
   */
  async checkForChanges(options: Partial<VisualCheckOptions> = {}): Promise<VisualComparisonResult> {
    const mergedOptions = {
      threshold: this.DEFAULT_THRESHOLD,
      saveScreenshots: false,
      ...options
    };
    
    try {
      // Ensure we have a baseline screenshot
      if (!this.lastScreenshot) {
        await this.takeScreenshot();
        return { changed: false };
      }
      
      const beforeScreenshot = this.lastScreenshot;
      const afterScreenshot = await this.takeScreenshot();
      
      // Store screenshots if requested
      if (mergedOptions.saveScreenshots) {
        const prefix = mergedOptions.screenshotNamePrefix || 'action';
        this.screenshots.set(`${prefix}_before`, beforeScreenshot);
        this.screenshots.set(`${prefix}_after`, afterScreenshot);
      }
      
      // Compare images
      const comparisonResult = await this.compareImages(
        beforeScreenshot,
        afterScreenshot,
        mergedOptions.region,
        mergedOptions.threshold
      );
      
      return {
        changed: comparisonResult.diffPercentage > mergedOptions.threshold,
        diffPercentage: comparisonResult.diffPercentage,
        diffImage: comparisonResult.diffImage,
        beforeImage: beforeScreenshot,
        afterImage: afterScreenshot,
        region: mergedOptions.region
      };
    } catch (error) {
      this.logger.error(`Failed to check for visual changes: ${error}`);
      throw new Error(`Failed to check for visual changes: ${error}`);
    }
  }
  
  /**
   * Compares two named screenshots
   * 
   * @param beforeName - Name of first screenshot
   * @param afterName - Name of second screenshot
   * @param options - Visual check options
   * @returns Visual comparison result
   */
  async compareScreenshots(
    beforeName: string,
    afterName: string,
    options: Partial<VisualCheckOptions> = {}
  ): Promise<VisualComparisonResult> {
    const mergedOptions = {
      threshold: this.DEFAULT_THRESHOLD,
      ...options
    };
    
    try {
      const beforeScreenshot = this.screenshots.get(beforeName);
      const afterScreenshot = this.screenshots.get(afterName);
      
      if (!beforeScreenshot) {
        throw new Error(`Screenshot with name '${beforeName}' not found`);
      }
      
      if (!afterScreenshot) {
        throw new Error(`Screenshot with name '${afterName}' not found`);
      }
      
      // Compare images
      const comparisonResult = await this.compareImages(
        beforeScreenshot,
        afterScreenshot,
        mergedOptions.region,
        mergedOptions.threshold
      );
      
      return {
        changed: comparisonResult.diffPercentage > mergedOptions.threshold,
        diffPercentage: comparisonResult.diffPercentage,
        diffImage: comparisonResult.diffImage,
        beforeImage: beforeScreenshot,
        afterImage: afterScreenshot,
        region: mergedOptions.region
      };
    } catch (error) {
      this.logger.error(`Failed to compare screenshots: ${error}`);
      throw new Error(`Failed to compare screenshots: ${error}`);
    }
  }
  
  /**
   * Gets a stored screenshot by name
   * 
   * @param name - Name of the screenshot
   * @returns Base64 screenshot data or null if not found
   */
  getScreenshot(name: string): string | null {
    return this.screenshots.get(name) || null;
  }
  
  /**
   * Clears all stored screenshots
   */
  clearScreenshots(): void {
    this.screenshots.clear();
    this.lastScreenshot = null;
  }
  
  /**
   * Compare two images using either OpenCV (preferred) or Jimp
   */
  private async compareImages(
    beforeImage: string,
    afterImage: string,
    region?: ScreenshotRegion,
    threshold: number = this.DEFAULT_THRESHOLD
  ): Promise<{ diffPercentage: number; diffImage: string }> {
    // Use OpenCV if available and enabled
    if (this.useOpenCV && this.openCVProcessor) {
      try {
        // Convert base64 to OpenCV images
        const img1 = await this.openCVProcessor.loadImageFromBase64(beforeImage);
        const img2 = await this.openCVProcessor.loadImageFromBase64(afterImage);
        
        // Compare images
        const result = await this.openCVProcessor.compareImages(img1, img2, region);
        
        // Convert diff image back to base64
        const diffBase64 = await this.openCVProcessor.imageToBase64(result.diffImage);
        
        return {
          diffPercentage: result.diffPercentage,
          diffImage: diffBase64
        };
      } catch (error) {
        this.logger.error('OpenCV comparison failed, falling back to Jimp', { error });
        // Fall back to Jimp if OpenCV fails
      }
    }
    
    // Fallback to Jimp implementation
    try {
      // Convert base64 to Jimp images
      const img1 = await Jimp.read(Buffer.from(beforeImage, 'base64'));
      const img2 = await Jimp.read(Buffer.from(afterImage, 'base64'));
      
      // If region is specified, crop images
      if (region) {
        img1.crop(region.x, region.y, region.width, region.height);
        img2.crop(region.x, region.y, region.width, region.height);
      }
      
      // Create diff image
      const { width, height } = img1.bitmap;
      const diffImage = new Jimp(width, height);
      
      // Calculate pixel differences
      let diffPixels = 0;
      const totalPixels = width * height;
      
      for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
          const pixel1 = Jimp.intToRGBA(img1.getPixelColor(x, y));
          const pixel2 = Jimp.intToRGBA(img2.getPixelColor(x, y));
          
          // Compare pixel colors with some tolerance
          const colorDiff = Math.abs(pixel1.r - pixel2.r) + 
                           Math.abs(pixel1.g - pixel2.g) + 
                           Math.abs(pixel1.b - pixel2.b);
          
          if (colorDiff > 30) { // Threshold for difference
            diffPixels++;
            diffImage.setPixelColor(0xFF0000FF, x, y); // Red for differences
          } else {
            diffImage.setPixelColor(img1.getPixelColor(x, y), x, y);
          }
        }
      }
      
      // Calculate difference percentage
      const diffPercentage = (diffPixels / totalPixels) * 100;
      
      // Convert diff image to base64
      const diffBuffer = await diffImage.getBufferAsync(Jimp.MIME_PNG);
      const diffBase64 = diffBuffer.toString('base64');
      
      return {
        diffPercentage,
        diffImage: diffBase64
      };
    } catch (error) {
      this.logger.error('Failed to compare images', { error });
      throw error;
    }
  }

  /**
   * Saves a screenshot with a specific name
   * 
   * @param name - Name to identify the screenshot
   * @param region - Optional region to capture
   * @returns True if successful
   */
  async saveScreenshot(name: string, region?: ScreenshotRegion): Promise<boolean> {
    try {
      const screenshot = await this.takeScreenshot();
      
      // If region is specified, crop the screenshot
      if (region) {
        let imageData: string;
        
        if (this.useOpenCV && this.openCVProcessor) {
          try {
            const img = await this.openCVProcessor.loadImageFromBase64(screenshot);
            const croppedImg = await this.openCVProcessor.cropImage(img, region);
            imageData = await this.openCVProcessor.imageToBase64(croppedImg);
          } catch (error) {
            this.logger.warn('OpenCV crop failed, falling back to Jimp', { error });
            imageData = await this.cropWithJimp(screenshot, region);
          }
        } else {
          imageData = await this.cropWithJimp(screenshot, region);
        }
        
        this.screenshots.set(name, imageData);
      } else {
        this.screenshots.set(name, screenshot);
      }
      
      return true;
    } catch (error) {
      this.logger.error(`Failed to save screenshot ${name}: ${error}`);
      return false;
    }
  }
  
  /**
   * Compares current screen with a saved screenshot
   * 
   * @param checkpointName - Name of the saved screenshot to compare with
   * @param options - Visual check options
   * @returns Visual comparison result
   */
  async compareWithSavedScreenshot(
    checkpointName: string,
    options: Partial<VisualCheckOptions> = {}
  ): Promise<VisualComparisonResult> {
    const mergedOptions = {
      threshold: this.DEFAULT_THRESHOLD,
      ...options
    };
    
    try {
      const savedScreenshot = this.getScreenshot(checkpointName);
      
      if (!savedScreenshot) {
        throw new Error(`Saved screenshot '${checkpointName}' not found`);
      }
      
      const currentScreenshot = await this.takeScreenshot();
      
      // Compare images
      const comparisonResult = await this.compareImages(
        savedScreenshot,
        currentScreenshot,
        mergedOptions.region,
        mergedOptions.threshold
      );
      
      return {
        changed: comparisonResult.diffPercentage > mergedOptions.threshold,
        diffPercentage: comparisonResult.diffPercentage,
        diffImage: comparisonResult.diffImage,
        beforeImage: savedScreenshot,
        afterImage: currentScreenshot,
        region: mergedOptions.region
      };
    } catch (error) {
      this.logger.error(`Failed to compare with saved screenshot: ${error}`);
      throw new Error(`Failed to compare with saved screenshot: ${error}`);
    }
  }
  
  /**
   * Helper method to crop an image using Jimp
   * 
   * @param base64Image - Base64 encoded image
   * @param region - Region to crop
   * @returns Base64 encoded cropped image
   */
  private async cropWithJimp(base64Image: string, region: ScreenshotRegion): Promise<string> {
    const img = await Jimp.read(Buffer.from(base64Image, 'base64'));
    img.crop(region.x, region.y, region.width, region.height);
    const buffer = await img.getBufferAsync(Jimp.MIME_PNG);
    return buffer.toString('base64');
  }
} 