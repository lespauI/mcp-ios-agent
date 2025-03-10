import { Logger } from '../utils/Logger';
import { generateId } from '../utils/helpers';
import { ElementLocator } from '../element/ElementLocator';
import {
  ScreenshotOptions,
  HierarchyOptions,
  ElementPropertyOptions,
  ScreenshotResult,
  HierarchyResult,
  ElementProperties,
  StateCaptureOptions,
  StateSnapshot,
  StateComparisonResult,
  ElementProperty
} from '../types/state';
import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import { DOMParser } from 'xmldom';

// Promise-based fs functions
const writeFile = util.promisify(fs.writeFile);
const mkdir = util.promisify(fs.mkdir);
const stat = util.promisify(fs.stat);

/**
 * Default screenshot options
 */
const DEFAULT_SCREENSHOT_OPTIONS: ScreenshotOptions = {
  quality: 80,
  format: 'png',
  encoding: 'base64',
  metadata: true,
  blocking: false
};

/**
 * Default hierarchy options
 */
const DEFAULT_HIERARCHY_OPTIONS: HierarchyOptions = {
  format: 'xml',
  simplified: false,
  formatted: true,
  cacheTimeout: 5000, // 5 seconds
  includeOffscreen: false,
  highlighting: false
};

/**
 * Default property options
 */
const DEFAULT_PROPERTY_OPTIONS: ElementPropertyOptions = {
  batchSize: 10,
  cacheTimeout: 5000, // 5 seconds
  deepFetch: false
};

/**
 * UI State Capture Manager
 * Responsible for capturing and analyzing the UI state
 */
export class UIStateCaptureManager {
  private logger: Logger = new Logger('UIStateCaptureManager');
  private lastScreenshot: ScreenshotResult | null = null;
  private lastHierarchy: HierarchyResult | null = null;
  private propertyCache: Map<string, ElementProperties> = new Map();
  private hierarchyCache: { data: string; timestamp: number } | null = null;
  private stateHistory: Map<string, StateSnapshot> = new Map();
  private outputDirectory: string;

  /**
   * Create a new UI State Capture Manager
   */
  constructor(
    private driver: WebdriverIO.Browser,
    private elementLocator: ElementLocator,
    options: { outputDirectory?: string } = {}
  ) {
    this.outputDirectory = options.outputDirectory || './screenshots';
    this.ensureOutputDirectoryExists();
  }

  /**
   * Ensure that the output directory exists
   */
  private async ensureOutputDirectoryExists(): Promise<void> {
    try {
      await stat(this.outputDirectory);
    } catch (error) {
      await mkdir(this.outputDirectory, { recursive: true });
      this.logger.info(`Created output directory: ${this.outputDirectory}`);
    }
  }

  /**
   * Capture a screenshot
   */
  async captureScreenshot(options: Partial<ScreenshotOptions> = {}): Promise<ScreenshotResult> {
    const mergedOptions = { ...DEFAULT_SCREENSHOT_OPTIONS, ...options };
    const timestamp = Date.now();

    try {
      this.logger.info('Capturing screenshot', { 
        blocking: mergedOptions.blocking, 
        format: mergedOptions.format 
      });

      // Take screenshot using WebDriver
      let screenshotData: string;
      
      if (mergedOptions.blocking) {
        screenshotData = await this.driver.takeScreenshot();
      } else {
        // Non-blocking screenshot capture
        screenshotData = await Promise.race([
          this.driver.takeScreenshot(),
          new Promise<string>(resolve => setTimeout(() => {
            this.driver.takeScreenshot().then(resolve);
          }, 0))
        ]);
      }

      // Get window size for metadata
      const dimensions = await this.driver.getWindowSize();

      // Create result with metadata
      const result: ScreenshotResult = {
        data: screenshotData,
        format: mergedOptions.format || 'png',
        timestamp,
        dimensions,
        metadata: mergedOptions.metadata ? {
          sessionId: this.driver.sessionId,
          timestamp,
          capabilities: this.driver.capabilities
        } : undefined
      };

      // Save to disk if filename provided
      if (mergedOptions.filename || mergedOptions.filePath) {
        const filePath = mergedOptions.filePath || 
          path.join(this.outputDirectory, mergedOptions.filename || `screenshot_${timestamp}.${mergedOptions.format}`);
        
        await this.saveScreenshotToDisk(screenshotData, filePath);
        result.filePath = filePath;
      }

      // Cache the result
      this.lastScreenshot = result;
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Screenshot capture failed: ${errorMessage}`);
      throw new Error(`Failed to capture screenshot: ${errorMessage}`);
    }
  }

  /**
   * Save screenshot data to disk
   */
  private async saveScreenshotToDisk(data: string, filePath: string): Promise<void> {
    try {
      // Create directory if it doesn't exist
      const directory = path.dirname(filePath);
      await mkdir(directory, { recursive: true });

      // Remove data URI prefix if present (data:image/png;base64,)
      const base64Data = data.includes('base64,') ? data.split('base64,')[1] : data;
      
      // Save the file
      await writeFile(filePath, base64Data, 'base64');
      this.logger.info(`Screenshot saved to ${filePath}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to save screenshot: ${errorMessage}`);
      throw new Error(`Failed to save screenshot: ${errorMessage}`);
    }
  }

  /**
   * Extract XML hierarchy
   */
  async extractHierarchy(options: Partial<HierarchyOptions> = {}): Promise<HierarchyResult> {
    const mergedOptions = { ...DEFAULT_HIERARCHY_OPTIONS, ...options };
    const timestamp = Date.now();

    // Check cache first if enabled
    if (this.hierarchyCache && 
        timestamp - this.hierarchyCache.timestamp < (mergedOptions.cacheTimeout || 5000)) {
      this.logger.info('Using cached hierarchy');
      return {
        data: this.hierarchyCache.data,
        format: mergedOptions.format || 'xml',
        timestamp: this.hierarchyCache.timestamp,
        elementCount: this.countElementsInHierarchy(this.hierarchyCache.data)
      };
    }

    try {
      this.logger.info('Extracting UI hierarchy');
      
      // Get page source using WebDriver
      const pageSource = await this.driver.getPageSource();
      
      // Process the hierarchy based on options
      let processedData = pageSource;
      
      if (mergedOptions.simplified) {
        processedData = this.simplifyHierarchy(pageSource);
      }
      
      if (mergedOptions.formatted && mergedOptions.format === 'xml') {
        processedData = this.formatXml(processedData);
      }
      
      // Convert to JSON if requested
      if (mergedOptions.format === 'json') {
        processedData = this.convertXmlToJson(processedData);
      }
      
      // Create result
      const elementCount = this.countElementsInHierarchy(processedData);
      
      const result: HierarchyResult = {
        data: processedData,
        format: mergedOptions.format || 'xml',
        timestamp,
        elementCount,
        metadata: {
          sessionId: this.driver.sessionId,
          timestamp
        }
      };
      
      // Update cache
      this.hierarchyCache = {
        data: processedData,
        timestamp
      };
      
      // Add highlighting if requested
      if (mergedOptions.highlighting) {
        result.metadata = {
          ...result.metadata,
          highlightedVersion: this.createHighlightedHierarchy(processedData)
        };
      }
      
      this.lastHierarchy = result;
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Hierarchy extraction failed: ${errorMessage}`);
      throw new Error(`Failed to extract hierarchy: ${errorMessage}`);
    }
  }

  /**
   * Simplify XML hierarchy by removing less useful attributes
   */
  private simplifyHierarchy(xml: string): string {
    // Remove less useful attributes to make hierarchy more readable
    return xml
      .replace(/index="[^"]*"/g, '')
      .replace(/enabled="[^"]*"/g, '')
      .replace(/visible="[^"]*"/g, '')
      .replace(/valid="[^"]*"/g, '')
      .replace(/hint="[^"]*"/g, '')
      .replace(/package="[^"]*"/g, '');
  }

  /**
   * Format XML with proper indentation
   */
  private formatXml(xml: string): string {
    try {
      // Skip formatting for large XML documents to improve performance
      if (xml.length > 100000) {
        this.logger.info('XML document too large, skipping formatting');
        return xml;
      }

      // Use a more efficient approach without creating lots of intermediary strings
      let formatted = '';
      let indent = '';
      let depth = 0;
      
      // Pre-compile regex patterns
      const openTagPattern = /^<[^\/][^>]*[^\/]>$/;
      const closeTagPattern = /^<\/[^>]*>$/;
      const selfClosingPattern = /^<[^>]*\/>$/;
      
      const lines = xml.split(/>\s*</);
      const totalLines = lines.length;
      
      for (let i = 0; i < totalLines; i++) {
        const line = lines[i];
        
        // Handle indentation based on tag type
        if (closeTagPattern.test('<' + line + '>')) {
          depth--;
          indent = '  '.repeat(Math.max(0, depth));
        } else {
          indent = '  '.repeat(depth);
          if (openTagPattern.test('<' + line + '>') && !selfClosingPattern.test('<' + line + '>')) {
            depth++;
          }
        }
        
        formatted += (i === 0 ? '' : indent) + '<' + line + '>' + '\n';
      }
      
      return formatted;
    } catch (error) {
      this.logger.warn('Failed to format XML, returning original');
      return xml;
    }
  }

  /**
   * Convert XML to JSON
   */
  private convertXmlToJson(xml: string): string {
    try {
      // Skip conversion for very large XML documents
      if (xml.length > 100000) {
        this.logger.info('XML document too large, skipping conversion to JSON');
        return JSON.stringify({ error: 'Document too large for conversion', length: xml.length });
      }

      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xml, 'application/xml');
      
      // Use a more efficient implementation with memoization
      const processed = new WeakMap();
      
      const convertNodeToJson = (node: Node): any => {
        // Return cached result if already processed this node
        if (processed.has(node)) {
          return processed.get(node);
        }
        
        if (node.nodeType === Node.TEXT_NODE) {
          const value = node.nodeValue?.trim() || '';
          processed.set(node, value);
          return value;
        }
        
        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as Element;
          const result: any = {
            type: element.nodeName
          };
          
          // Add attributes - process them in bulk
          if (element.attributes && element.attributes.length > 0) {
            const attrCount = element.attributes.length;
            for (let i = 0; i < attrCount; i++) {
              const attr = element.attributes[i];
              result[attr.name] = attr.value;
            }
          }
          
          // Add children - only process if there are actual elements
          if (element.childNodes && element.childNodes.length > 0) {
            const childElements = Array.from(element.childNodes)
              .filter(child => child.nodeType === Node.ELEMENT_NODE || 
                              (child.nodeType === Node.TEXT_NODE && child.nodeValue?.trim()));
            
            if (childElements.length > 0) {
              result.children = childElements.map(convertNodeToJson).filter(Boolean);
            }
          }
          
          processed.set(node, result);
          return result;
        }
        
        return null;
      };
      
      const jsonResult = convertNodeToJson(xmlDoc.documentElement);
      return JSON.stringify(jsonResult);
    } catch (error) {
      this.logger.warn('Failed to convert XML to JSON, returning original XML');
      return xml;
    }
  }

  /**
   * Count the number of elements in the hierarchy
   */
  private countElementsInHierarchy(data: string): number {
    if (data.startsWith('{')) {
      // JSON format
      try {
        const json = JSON.parse(data);
        
        const countElements = (node: any): number => {
          let count = 1; // Count this node
          
          if (node.children && Array.isArray(node.children)) {
            for (const child of node.children) {
              count += countElements(child);
            }
          }
          
          return count;
        };
        
        return countElements(json);
      } catch {
        return 0;
      }
    } else {
      // XML format - simple count of opening tags
      return (data.match(/<[^/][^>]*>/g) || []).length;
    }
  }

  /**
   * Create a highlighted version of the hierarchy for debugging
   */
  private createHighlightedHierarchy(data: string): string {
    // This is a placeholder for a more sophisticated implementation
    // In a real implementation, this would generate an HTML file with 
    // highlighted elements for better visualization
    return `<html><body><pre>${data.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre></body></html>`;
  }

  /**
   * Batch retrieve element properties
   */
  async batchRetrieveProperties(
    elements: WebdriverIO.Element[], 
    options: Partial<ElementPropertyOptions> = {}
  ): Promise<ElementProperties[]> {
    const mergedOptions = { ...DEFAULT_PROPERTY_OPTIONS, ...options };
    const timestamp = Date.now();
    const results: ElementProperties[] = [];
    
    // Default properties to retrieve if not specified
    const propertiesToRetrieve = mergedOptions.properties || [
      'text', 'label', 'visible', 'enabled', 'selected', 'value'
    ];
    
    try {
      this.logger.info(`Retrieving properties for ${elements.length} elements`, { 
        batchSize: mergedOptions.batchSize || DEFAULT_PROPERTY_OPTIONS.batchSize,
        properties: propertiesToRetrieve 
      });
      
      // Process elements in batches
      const batchSize = mergedOptions.batchSize || DEFAULT_PROPERTY_OPTIONS.batchSize || 10;
      for (let i = 0; i < elements.length; i += batchSize) {
        const batch = elements.slice(i, i + batchSize);
        const batchPromises: Promise<ElementProperties>[] = [];
        
        for (const element of batch) {
          batchPromises.push(this.retrieveElementProperties(element, propertiesToRetrieve));
        }
        
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
      }
      
      // Update cache
      for (const result of results) {
        this.propertyCache.set(result.elementId, {
          ...result,
          timestamp
        });
      }
      
      return results;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Property retrieval failed: ${errorMessage}`);
      throw new Error(`Failed to retrieve properties: ${errorMessage}`);
    }
  }

  /**
   * Retrieve properties for a single element
   */
  private async retrieveElementProperties(
    element: WebdriverIO.Element, 
    properties: string[]
  ): Promise<ElementProperties> {
    const elementProperties: ElementProperty[] = [];
    const elementId = element.toString(); // Get WebDriver element ID
    
    // Check cache first if available
    const cached = this.propertyCache.get(elementId);
    if (cached && Date.now() - cached.timestamp < 5000) {
      return cached;
    }
    
    try {
      // Process each property
      for (const property of properties) {
        try {
          let value: any = null;
          
          // Get property based on name
          switch (property) {
            case 'text':
              value = await element.getText();
              break;
            case 'visible':
              value = await element.isDisplayed();
              break;
            case 'enabled':
              value = await element.isEnabled();
              break;
            case 'selected':
              // This is commonly used for checkboxes, radio buttons, etc.
              try {
                value = await element.getAttribute('selected') === 'true';
              } catch {
                value = false;
              }
              break;
            default:
              // Try to get it as an attribute
              try {
                value = await element.getAttribute(property);
              } catch {
                value = null;
              }
          }
          
          elementProperties.push({
            name: property,
            value,
            timestamp: Date.now()
          });
        } catch (propError) {
          // Log error but continue with other properties
          this.logger.warn(`Failed to retrieve property ${property}`);
          elementProperties.push({
            name: property,
            value: null,
            timestamp: Date.now()
          });
        }
      }
      
      return {
        elementId,
        properties: elementProperties,
        timestamp: Date.now()
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to retrieve properties for element: ${errorMessage}`);
      
      // Return empty properties with error indicator
      return {
        elementId,
        properties: properties.map(p => ({ 
          name: p, 
          value: null,
          timestamp: Date.now()
        })),
        timestamp: Date.now()
      };
    }
  }

  /**
   * Capture a complete UI state snapshot
   */
  async captureState(options: StateCaptureOptions = {}): Promise<StateSnapshot> {
    const timestamp = Date.now();
    const snapshotId = generateId();
    
    // Create empty snapshot
    const snapshot: StateSnapshot = {
      id: snapshotId,
      timestamp,
      metadata: {
        sessionId: this.driver.sessionId,
        capabilities: this.driver.capabilities
      }
    };
    
    try {
      this.logger.info('Capturing UI state snapshot');
      
      // Capture screenshot if requested
      if (options.screenshot) {
        const screenshotOptions = typeof options.screenshot === 'object' 
          ? options.screenshot 
          : {};
        
        snapshot.screenshot = await this.captureScreenshot(screenshotOptions);
      }
      
      // Extract hierarchy if requested
      if (options.hierarchy) {
        const hierarchyOptions = typeof options.hierarchy === 'object' 
          ? options.hierarchy 
          : {};
        
        snapshot.hierarchy = await this.extractHierarchy(hierarchyOptions);
      }
      
      // Get element properties if requested
      if (options.properties) {
        const propertyOptions = typeof options.properties === 'object' 
          ? options.properties 
          : {};
        
        // Find visible elements
        const elements = await this.elementLocator.findElements('xpath', '//*');
        
        // Get properties
        snapshot.properties = await this.batchRetrieveProperties(elements, propertyOptions);
      }
      
      // Store in history
      this.stateHistory.set(snapshotId, snapshot);
      
      return snapshot;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`State capture failed: ${errorMessage}`);
      throw new Error(`Failed to capture state: ${errorMessage}`);
    }
  }

  /**
   * Compare two state snapshots
   */
  compareStates(baseState: StateSnapshot, currentState: StateSnapshot): StateComparisonResult {
    this.logger.info(`Comparing states ${baseState.id} and ${currentState.id}`);
    
    // Initialize comparison result
    const result: StateComparisonResult = {
      matches: true,
      differences: {
        added: [],
        removed: [],
        changed: {}
      }
    };
    
    // Compare element properties if available
    if (baseState.properties && currentState.properties) {
      // Create maps for quick lookup
      const baseProps = new Map<string, ElementProperties>();
      const currentProps = new Map<string, ElementProperties>();
      
      baseState.properties.forEach(ep => baseProps.set(ep.elementId, ep));
      currentState.properties.forEach(ep => currentProps.set(ep.elementId, ep));
      
      // Find removed elements
      baseProps.forEach((_, id) => {
        if (!currentProps.has(id)) {
          result.differences!.removed.push(id);
          result.matches = false;
        }
      });
      
      // Find added elements
      currentProps.forEach((_, id) => {
        if (!baseProps.has(id)) {
          result.differences!.added.push(id);
          result.matches = false;
        }
      });
      
      // Compare properties of common elements
      baseProps.forEach((baseElem, id) => {
        const currentElem = currentProps.get(id);
        if (currentElem) {
          const propertyChanges: { property: string; oldValue: any; newValue: any }[] = [];
          
          // Create maps for quick lookup
          const baseElemProps = new Map<string, ElementProperty>();
          const currentElemProps = new Map<string, ElementProperty>();
          
          baseElem.properties.forEach(p => baseElemProps.set(p.name, p));
          currentElem.properties.forEach(p => currentElemProps.set(p.name, p));
          
          // Compare properties
          baseElemProps.forEach((baseProp, propName) => {
            const currentProp = currentElemProps.get(propName);
            if (currentProp && JSON.stringify(baseProp.value) !== JSON.stringify(currentProp.value)) {
              propertyChanges.push({
                property: propName,
                oldValue: baseProp.value,
                newValue: currentProp.value
              });
            }
          });
          
          if (propertyChanges.length > 0) {
            result.differences!.changed[id] = propertyChanges;
            result.matches = false;
          }
        }
      });
    }
    
    // If states match exactly, remove empty differences object
    if (result.matches) {
      delete result.differences;
    } else {
      // Add screenshot for reference if available
      result.screenshot = currentState.screenshot;
    }
    
    return result;
  }

  /**
   * Get a previous state snapshot by ID
   */
  getStateById(id: string): StateSnapshot | undefined {
    return this.stateHistory.get(id);
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.propertyCache.clear();
    this.hierarchyCache = null;
    this.lastScreenshot = null;
    this.lastHierarchy = null;
    this.logger.info('Cleared all cache data');
  }

  /**
   * Get the number of stored state snapshots
   */
  getStateHistorySize(): number {
    return this.stateHistory.size;
  }

  /**
   * Clear state history
   */
  clearStateHistory(): void {
    this.stateHistory.clear();
    this.logger.info('Cleared state history');
  }

  /**
   * Clean up old screenshots to prevent excessive disk usage
   * @param maxAgeMs Maximum age of files to keep in milliseconds (default: 1 hour)
   * @param maxCount Maximum number of files to keep (default: 100)
   */
  async cleanupScreenshots(maxAgeMs: number = 3600000, maxCount: number = 100): Promise<number> {
    try {
      const readdir = util.promisify(fs.readdir);
      const unlink = util.promisify(fs.unlink);
      
      // Read all files in the screenshots directory
      const screenshotsDir = path.join(this.outputDirectory, 'screenshots');
      
      // Check if directory exists
      try {
        await stat(screenshotsDir);
      } catch (error) {
        // Directory doesn't exist, nothing to clean up
        return 0;
      }
      
      const files = await readdir(screenshotsDir);
      
      // Filter for screenshot files and get their stats
      const fileStats = await Promise.all(
        files
          .filter(file => file.endsWith('.png') || file.endsWith('.jpg'))
          .map(async (file) => {
            const filePath = path.join(screenshotsDir, file);
            const fileStat = await stat(filePath);
            return {
              name: file,
              path: filePath,
              ctime: fileStat.ctime.getTime(),
              size: fileStat.size
            };
          })
      );
      
      // Sort by creation time (newest first)
      fileStats.sort((a, b) => b.ctime - a.ctime);
      
      // Identify files to delete (too old or exceeding count)
      const now = Date.now();
      const filesToDelete = fileStats.filter(
        (file, index) => index >= maxCount || now - file.ctime > maxAgeMs
      );
      
      // Delete excess files
      if (filesToDelete.length > 0) {
        this.logger.info(`Cleaning up ${filesToDelete.length} old screenshot files`);
        
        // Delete files in parallel
        await Promise.all(filesToDelete.map(file => unlink(file.path)));
        
        return filesToDelete.length;
      }
      
      return 0;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to clean up screenshots: ${errorMessage}`);
      return 0;
    }
  }

  /**
   * Perform regular cleanup of resources
   * This should be called periodically by the application
   */
  async performMaintenance(): Promise<void> {
    await Promise.all([
      this.cleanupScreenshots(),
      this.clearCache()
    ]);
  }
} 