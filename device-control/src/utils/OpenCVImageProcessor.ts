import { Logger } from './Logger';
import { ScreenshotRegion } from '../actions/VisualChecker';
import * as fs from 'fs';
import * as path from 'path';
import CVMock, { MatMock } from './mocks/opencv-mock';

let cv: any;
try {
  cv = require('opencv4nodejs-prebuilt');
} catch (error) {
  // If the native module isn't available, use the mock implementation
  cv = CVMock;
}

/**
 * Interface for image comparison result
 */
export interface ImageComparisonResult {
  diffPercentage: number;
  diffImage: any; // OpenCV Mat object
  diffImageBase64?: string;
}

/**
 * Interface for template matching options
 */
export interface TemplateMatchingOptions {
  threshold?: number;
  method?: number;
  visualize?: boolean;
}

/**
 * Interface for template matching result
 */
export interface TemplateMatchingResult {
  found: boolean;
  location?: { x: number; y: number };
  confidence: number;
  visualResult?: any; // OpenCV Mat object
}

/**
 * Interface for detected object
 */
export interface DetectedObject {
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  area: number;
  contour?: any; // OpenCV Contour
}

/**
 * Interface for region highlighting options
 */
export interface RegionHighlightOptions {
  color?: [number, number, number];
  thickness?: number;
  text?: boolean;
}

/**
 * OpenCVImageProcessor provides advanced image processing capabilities 
 * using the OpenCV library for tasks like image comparison, template matching,
 * object detection, and advanced visual analysis.
 */
export class OpenCVImageProcessor {
  private logger = new Logger('OpenCVImageProcessor');
  private outputDir = path.resolve(process.cwd(), 'visual-output');

  constructor(outputDirectory?: string) {
    this.outputDir = outputDirectory || this.outputDir;
    this.ensureOutputDirectoryExists();
  }

  /**
   * Ensures the output directory exists
   */
  private ensureOutputDirectoryExists(): void {
    try {
      if (!fs.existsSync(this.outputDir)) {
        fs.mkdirSync(this.outputDir, { recursive: true });
        this.logger.info(`Created output directory: ${this.outputDir}`);
      }
    } catch (error) {
      this.logger.error('Failed to create output directory', { error });
    }
  }

  /**
   * Loads an image from a Base64 string
   * 
   * @param base64Image Base64 encoded image string
   * @returns OpenCV Mat object
   */
  async loadImageFromBase64(base64Image: string): Promise<any> {
    try {
      // Strip off the data:image/png;base64, part if present
      const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      
      // Convert buffer to OpenCV mat
      return cv.imdecode(buffer);
    } catch (error) {
      this.logger.error('Failed to load image from Base64', { error });
      throw new Error(`Failed to load image from Base64: ${error}`);
    }
  }

  /**
   * Crops an image to the specified region
   * 
   * @param image OpenCV Mat object
   * @param region Region to crop
   * @returns Cropped OpenCV Mat object
   */
  async cropImage(image: any, region: ScreenshotRegion): Promise<any> {
    try {
      // Ensure region is within image bounds
      const { width, height } = image.sizes;
      
      const x = Math.max(0, Math.min(region.x, width - 1));
      const y = Math.max(0, Math.min(region.y, height - 1));
      const w = Math.min(region.width, width - x);
      const h = Math.min(region.height, height - y);
      
      // Create a rect with the region
      const rect = new cv.Rect(x, y, w, h);
      
      // Crop the image
      return image.getRegion(rect);
    } catch (error) {
      this.logger.error('Failed to crop image', { error });
      throw new Error(`Failed to crop image: ${error}`);
    }
  }

  /**
   * Loads an image from a file
   * 
   * @param filePath Path to the image file
   * @returns OpenCV Mat object
   */
  async loadImageFromFile(filePath: string): Promise<any> {
    try {
      const image = cv.imread(filePath);
      
      if (image.empty()) {
        throw new Error(`Failed to load image from file: ${filePath}`);
      }
      
      return image;
    } catch (error) {
      this.logger.error(`Failed to load image from file: ${filePath}`, { error });
      throw error;
    }
  }

  /**
   * Saves an image to a file
   * 
   * @param image OpenCV Mat object
   * @param filePath Path to save the image
   */
  async saveImageToFile(image: any, filePath: string): Promise<void> {
    try {
      const directory = path.dirname(filePath);
      
      if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
      }
      
      const success = cv.imwrite(filePath, image);
      
      if (!success) {
        throw new Error(`Failed to save image to file: ${filePath}`);
      }
      
      this.logger.debug(`Saved image to file: ${filePath}`);
    } catch (error) {
      this.logger.error(`Failed to save image to file: ${filePath}`, { error });
      throw error;
    }
  }

  /**
   * Compares two images and returns the difference
   * 
   * @param image1 First image (OpenCV Mat)
   * @param image2 Second image (OpenCV Mat)
   * @param region Optional region to compare
   * @returns Comparison result with difference percentage and visual diff
   */
  async compareImages(image1: any, image2: any, region?: ScreenshotRegion): Promise<ImageComparisonResult> {
    try {
      // Create copies to avoid modifying originals
      let img1 = image1;
      let img2 = image2;
      
      // If region is specified, crop images
      if (region) {
        img1 = img1.getRegion(new cv.Rect(region.x, region.y, region.width, region.height));
        img2 = img2.getRegion(new cv.Rect(region.x, region.y, region.width, region.height));
      }
      
      // Ensure images are the same size
      if (img1.cols !== img2.cols || img1.rows !== img2.rows) {
        img2 = img2.resize(img1.rows, img1.cols);
      }
      
      // Convert to grayscale for better comparison
      const gray1 = img1.cvtColor(cv.COLOR_BGR2GRAY);
      const gray2 = img2.cvtColor(cv.COLOR_BGR2GRAY);
      
      // Calculate absolute difference between images
      const diffImage = gray1.absdiff(gray2);
      
      // Apply threshold to make differences more visible
      const thresholdImage = diffImage.threshold(30, 255, cv.THRESH_BINARY);
      
      // Count non-zero pixels to determine difference
      const nonZeroPixels = thresholdImage.countNonZero();
      const totalPixels = thresholdImage.rows * thresholdImage.cols;
      const diffPercentage = (nonZeroPixels / totalPixels) * 100;
      
      // Create a visual diff image
      const visualDiff = img1.copy();
      
      // Highlight differences in red
      const diffMask = thresholdImage.cvtColor(cv.COLOR_GRAY2BGR);
      const redMask = diffMask.copy();
      
      // Visual representation of differences
      img2.copyTo(visualDiff, thresholdImage);
      
      return {
        diffPercentage,
        diffImage: visualDiff
      };
    } catch (error) {
      this.logger.error('Failed to compare images', { error });
      throw error;
    }
  }

  /**
   * Finds a template image within a source image
   * 
   * @param source Source image to search in
   * @param template Template image to find
   * @param options Optional matching parameters
   * @returns Result with match location and confidence
   */
  async findTemplate(source: any, template: any, options: TemplateMatchingOptions = {}): Promise<TemplateMatchingResult> {
    try {
      const defaultOptions = {
        threshold: 0.7,
        method: cv.TM_CCOEFF_NORMED,
        visualize: false
      };
      
      const mergedOptions = { ...defaultOptions, ...options };
      
      // Perform template matching
      const matched = source.matchTemplate(template, mergedOptions.method);
      const { maxLoc, maxVal } = matched.minMaxLoc();
      
      const result: TemplateMatchingResult = {
        found: maxVal >= mergedOptions.threshold,
        confidence: maxVal,
        location: maxVal >= mergedOptions.threshold ? { x: maxLoc.x, y: maxLoc.y } : undefined
      };
      
      // Create visual result if requested
      if (mergedOptions.visualize && result.found) {
        const visualResult = source.copy();
        
        // Draw rectangle around match
        const { x, y } = maxLoc;
        const width = template.cols;
        const height = template.rows;
        
        visualResult.rectangle(
          new cv.Point(x, y),
          new cv.Point(x + width, y + height),
          new cv.Vec3(0, 255, 0), // Green
          2
        );
        
        result.visualResult = visualResult;
      }
      
      return result;
    } catch (error) {
      this.logger.error('Failed to find template', { error });
      throw error;
    }
  }

  /**
   * Detects objects in an image using contour detection
   * 
   * @param image Source image
   * @param minArea Minimum area to consider (default: 100)
   * @returns Array of detected objects
   */
  async detectObjects(image: any, minArea: number = 100): Promise<DetectedObject[]> {
    try {
      // Convert to grayscale
      const gray = image.cvtColor(cv.COLOR_BGR2GRAY);
      
      // Apply threshold to create binary image
      const threshold = gray.threshold(127, 255, cv.THRESH_BINARY);
      
      // Find contours
      const contours = cv.findContours(threshold, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
      
      // Filter and process contours
      const objects: DetectedObject[] = [];
      
      for (const contour of contours) {
        const area = this.computeContourArea(contour);
        
        if (area >= minArea) {
          const rect = this.getBoundingRect(contour);
          
          objects.push({
            bounds: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height
            },
            area: area,
            contour: contour
          });
        }
      }
      
      return objects;
    } catch (error) {
      this.logger.error('Failed to detect objects', { error });
      throw error;
    }
  }

  /**
   * Highlights regions in an image
   * 
   * @param image Source image
   * @param regions Array of regions to highlight
   * @param options Highlighting options
   * @returns Image with highlighted regions
   */
  async highlightRegions(image: any, regions: ScreenshotRegion[], options: RegionHighlightOptions = {}): Promise<any> {
    try {
      const defaultOptions = {
        color: [0, 255, 0] as [number, number, number], // Green
        thickness: 2,
        text: true
      };
      
      const mergedOptions = { ...defaultOptions, ...options };
      
      // Create a copy to avoid modifying original
      const result = image.copy();
      
      // Draw rectangles for each region
      regions.forEach((region, index) => {
        const { x, y, width, height } = region;
        
        // Draw rectangle
        result.rectangle(
          new cv.Point(x, y),
          new cv.Point(x + width, y + height),
          new cv.Vec3(...mergedOptions.color),
          mergedOptions.thickness
        );
        
        // Add text label if specified
        if (mergedOptions.text) {
          result.putText(
            `Region ${index + 1}`,
            new cv.Point(x, y - 5),
            cv.FONT_HERSHEY_SIMPLEX,
            0.5,
            new cv.Vec3(...mergedOptions.color),
            1
          );
        }
      });
      
      return result;
    } catch (error) {
      this.logger.error('Failed to highlight regions', { error });
      throw error;
    }
  }

  /**
   * Converts an image to a buffer with specified format
   * 
   * @param image OpenCV Mat object
   * @param format Output format (e.g., '.png', '.jpg')
   * @returns Buffer containing the image data
   */
  async imageToBuffer(image: any, format: string = '.png'): Promise<Buffer> {
    try {
      return cv.imencode(format, image);
    } catch (error) {
      this.logger.error('Failed to convert image to buffer', { error });
      throw error;
    }
  }

  /**
   * Converts an image to Base64 string
   * 
   * @param image OpenCV Mat object
   * @param format Output format (e.g., '.png', '.jpg')
   * @returns Base64 encoded string
   */
  async imageToBase64(image: any, format: string = '.png'): Promise<string> {
    try {
      const buffer = await this.imageToBuffer(image, format);
      const mimeType = format === '.png' ? 'image/png' : 'image/jpeg';
      
      return `data:${mimeType};base64,${buffer.toString('base64')}`;
    } catch (error) {
      this.logger.error('Failed to convert image to Base64', { error });
      throw error;
    }
  }

  /**
   * Computes contour area
   * 
   * @param contour Array of points representing a contour
   * @returns The contour area
   */
  private computeContourArea(contour: Array<{ x: number; y: number }>): number {
    return cv.contourArea(contour);
  }

  /**
   * Gets bounding rectangle for a contour
   * 
   * @param contour Array of points representing a contour
   * @returns The bounding rectangle {x, y, width, height}
   */
  private getBoundingRect(contour: Array<{ x: number; y: number }>): { x: number; y: number; width: number; height: number } {
    return cv.boundingRect(contour);
  }
} 