import { Logger } from '../utils/Logger';

/**
 * Interface representing an accessibility ID prediction
 */
export interface AccessibilityIDPrediction {
  predictedId: string | null;
  confidence: number;
  pattern?: string;
}

/**
 * Analyzes the application to learn patterns for accessibility IDs
 * and predict accessibility IDs for elements missing them
 */
export class AccessibilityIDPredictor {
  private logger = new Logger('AccessibilityIDPredictor');
  private patterns: Map<string, Map<string, { accessibilityIdPattern: string; confidence: number }>> = new Map();
  
  constructor(private driver: WebdriverIO.Browser) {}
  
  /**
   * Analyze the application to learn accessibility ID patterns
   */
  async analyzeAppPatterns(): Promise<void> {
    this.logger.info('Analyzing application for accessibility ID patterns');
    
    try {
      // Get current page source
      const source = await this.driver.getPageSource();
      
      if (!source) {
        this.logger.warn('Could not retrieve page source');
        return;
      }
      
      // Find all elements with accessibilityId attributes
      const elementsWithIDs = await this.findElementsWithAccessibilityIDs();
      
      if (!elementsWithIDs || !elementsWithIDs.length) {
        this.logger.info('No elements with accessibility IDs found');
        return;
      }
      
      this.logger.info(`Found ${elementsWithIDs.length} elements with accessibility IDs`);
      
      // Group elements by tag name
      const elementsByType = await this.groupElementsByType(elementsWithIDs);
      
      // Analyze patterns for each element type
      for (const [elementType, elements] of elementsByType.entries()) {
        await this.analyzePatternForElementType(elementType, elements);
      }
      
      this.logger.info(`Analysis complete. Found patterns for ${this.patterns.size} element types`);
    } catch (error) {
      this.logger.error('Error analyzing app patterns', { error });
    }
  }
  
  /**
   * Find all elements with accessibility IDs in the current page
   */
  private async findElementsWithAccessibilityIDs(): Promise<WebdriverIO.Element[]> {
    try {
      let elements: WebdriverIO.Element[] = [];
      
      // Try WebdriverIO $$ method first
      if (typeof (this.driver as any).$$ === 'function') {
        elements = await (this.driver as any).$$('//*[@accessibilityId]');
      } 
      // Fall back to legacy findElements method
      else if (typeof (this.driver as any).findElements === 'function') {
        elements = await (this.driver as any).findElements('xpath', '//*[@accessibilityId]');
      }
      
      return elements || [];
    } catch (error) {
      this.logger.error('Error finding elements with accessibility IDs', { error });
      return [];
    }
  }
  
  /**
   * Group elements by their tag name (type)
   */
  private async groupElementsByType(elements: WebdriverIO.Element[]): Promise<Map<string, WebdriverIO.Element[]>> {
    const elementsByType = new Map<string, WebdriverIO.Element[]>();
    
    // Process each element to get its tag name
    for (const element of elements) {
      try {
        const tagName = await element.getTagName();
        
        if (!elementsByType.has(tagName)) {
          elementsByType.set(tagName, []);
        }
        
        elementsByType.get(tagName)!.push(element);
      } catch (error) {
        this.logger.debug('Error getting tag name for element', { error });
      }
    }
    
    return elementsByType;
  }
  
  /**
   * Analyze patterns for a specific element type
   */
  private async analyzePatternForElementType(elementType: string, elements: WebdriverIO.Element[]): Promise<void> {
    this.logger.debug(`Analyzing patterns for ${elementType} (${elements.length} elements)`);
    
    // Map to store potential patterns and their frequency
    const potentialPatterns = new Map<string, Map<string, number>>();
    
    // Analyze each element
    for (const element of elements) {
      try {
        const accessibilityId = await element.getAttribute('accessibilityId');
        
        if (!accessibilityId) {
          continue;
        }
        
        // Get common attributes that might be related to accessibilityId
        const attributes = ['label', 'text', 'content-desc', 'name', 'value'];
        
        for (const attribute of attributes) {
          const attributeValue = await element.getAttribute(attribute).catch(() => null);
          
          if (attributeValue) {
            // Try to identify a pattern between the attribute and accessibilityId
            const pattern = this.identifyPattern(attributeValue, accessibilityId);
            
            if (pattern) {
              if (!potentialPatterns.has(attribute)) {
                potentialPatterns.set(attribute, new Map());
              }
              
              const patternCount = potentialPatterns.get(attribute)!;
              const count = patternCount.get(pattern) || 0;
              patternCount.set(pattern, count + 1);
            }
          }
        }
      } catch (error) {
        this.logger.debug(`Error analyzing element attributes`, { error });
      }
    }
    
    // Set patterns with confidence scores
    const typePatterns = new Map<string, { accessibilityIdPattern: string; confidence: number }>();
    
    for (const [attribute, patterns] of potentialPatterns.entries()) {
      let bestPattern = '';
      let maxCount = 0;
      let totalElements = 0;
      
      for (const [pattern, count] of patterns.entries()) {
        totalElements += count;
        if (count > maxCount) {
          maxCount = count;
          bestPattern = pattern;
        }
      }
      
      if (bestPattern && totalElements > 0) {
        const confidence = maxCount / totalElements;
        
        // Only consider patterns with reasonable confidence
        if (confidence >= 0.5) {
          typePatterns.set(attribute, {
            accessibilityIdPattern: bestPattern,
            confidence
          });
        }
      }
    }
    
    if (typePatterns.size > 0) {
      this.patterns.set(elementType, typePatterns);
    }
  }
  
  /**
   * Try to identify a pattern between an attribute value and accessibility ID
   */
  private identifyPattern(attributeValue: string, accessibilityId: string): string | null {
    if (!attributeValue || !accessibilityId) {
      return null;
    }
    
    // Common patterns to check
    const patterns = [
      // Value to lowercase + suffix (e.g., "Login" -> "login_button")
      { pattern: `{{value.toLowerCase()}}_button`, test: (val: string) => accessibilityId === `${val.toLowerCase()}_button` },
      { pattern: `{{value.toLowerCase()}}_field`, test: (val: string) => accessibilityId === `${val.toLowerCase()}_field` },
      { pattern: `{{value.toLowerCase()}}_view`, test: (val: string) => accessibilityId === `${val.toLowerCase()}_view` },
      
      // Prefix + value to lowercase (e.g., "Login" -> "btn_login")
      { pattern: `btn_{{value.toLowerCase()}}`, test: (val: string) => accessibilityId === `btn_${val.toLowerCase()}` },
      { pattern: `txt_{{value.toLowerCase()}}`, test: (val: string) => accessibilityId === `txt_${val.toLowerCase()}` },
      
      // Replace spaces with underscores (e.g., "Sign Up" -> "sign_up_button")
      { pattern: `{{value.toLowerCase().replace(' ', '_')}}_button`, test: (val: string) => accessibilityId === `${val.toLowerCase().replace(/ /g, '_')}_button` },
      
      // Value to CamelCase (e.g., "sign up" -> "signUpButton")
      { pattern: `{{value.toLowerCase().replace(' ', '')}}Button`, test: (val: string) => {
        const camelCase = val.toLowerCase().replace(/(?:^\w|[A-Z]|\b\w)/g, 
          (letter, index) => index === 0 ? letter.toLowerCase() : letter.toUpperCase()).replace(/\s+/g, '');
        return accessibilityId === `${camelCase}Button`;
      }}
    ];
    
    // Try each pattern
    for (const { pattern, test } of patterns) {
      if (test(attributeValue)) {
        return pattern;
      }
    }
    
    // If no pattern matches, check if the ID is a direct copy of the attribute
    if (accessibilityId === attributeValue) {
      return '{{value}}';
    }
    
    return null;
  }
  
  /**
   * Predict accessibility ID for an element without one
   */
  async predictAccessibilityID(element: WebdriverIO.Element): Promise<AccessibilityIDPrediction> {
    try {
      // Don't predict if element already has an accessibility ID
      const existingId = await element.getAttribute('accessibilityId');
      if (existingId) {
        return { predictedId: null, confidence: 0 };
      }
      
      const tagName = await element.getTagName();
      
      // Check if we have patterns for this element type
      if (!this.patterns.has(tagName)) {
        // Try to learn from similar elements
        await this.learnFromSimilarElements(element);
      }
      
      // Get patterns for this element type
      const typePatterns = this.patterns.get(tagName);
      if (!typePatterns || typePatterns.size === 0) {
        return { predictedId: null, confidence: 0 };
      }
      
      let bestPattern = '';
      let bestAttribute = '';
      let bestConfidence = 0;
      let predictedId: string | null = null;
      
      // Try each pattern with the element's attributes
      for (const [attribute, { accessibilityIdPattern, confidence }] of typePatterns.entries()) {
        const attributeValue = await element.getAttribute(attribute).catch(() => null);
        
        if (attributeValue) {
          // If this pattern has higher confidence than previous ones
          if (confidence > bestConfidence) {
            // Apply pattern to attribute value
            const patternResult = this.applyPattern(accessibilityIdPattern, attributeValue);
            
            if (patternResult) {
              bestPattern = accessibilityIdPattern;
              bestAttribute = attribute;
              bestConfidence = confidence;
              predictedId = patternResult;
            }
          }
        }
      }
      
      if (predictedId) {
        this.logger.debug(`Predicted accessibility ID "${predictedId}" for ${tagName} element`, {
          pattern: bestPattern,
          attribute: bestAttribute,
          confidence: bestConfidence
        });
      } else {
        this.logger.debug(`Could not predict accessibility ID for ${tagName} element`);
      }
      
      return {
        predictedId,
        confidence: bestConfidence,
        pattern: bestPattern
      };
    } catch (error) {
      this.logger.error('Error predicting accessibility ID', { error });
      return { predictedId: null, confidence: 0 };
    }
  }
  
  /**
   * Apply a pattern to an attribute value to generate an accessibility ID
   */
  private applyPattern(pattern: string, value: string): string {
    if (!pattern.includes('{{')) {
      // Static pattern, no replacement needed
      return pattern;
    }
    
    // Extract the dynamic part inside {{ }}
    const match = pattern.match(/\{\{(.*?)\}\}/);
    if (!match) {
      return pattern;
    }
    
    const dynamicPart = match[1];
    
    // Security check to limit eval scope
    const allowedTransforms = ['toLowerCase', 'toUpperCase', 'replace', 'trim', 'substring', 'substr', 'slice'];
    
    // Verify transformation is limited to allowed methods
    if (!allowedTransforms.some(transform => dynamicPart.includes(transform))) {
      if (dynamicPart !== 'value') {
        this.logger.warn(`Pattern contains potentially unsafe transformation: ${dynamicPart}`);
        return pattern.replace(/\{\{.*?\}\}/, value);
      }
    }
    
    try {
      // Apply the transformation safely using Function instead of eval
      // Replace "value" with the actual string value
      const processedValue = new Function('value', `return ${dynamicPart}`)(value);
      
      // Replace the placeholder with the processed value
      return pattern.replace(/\{\{.*?\}\}/, processedValue);
    } catch (error) {
      this.logger.error(`Error applying pattern ${pattern}`, { error });
      return pattern.replace(/\{\{.*?\}\}/, value);
    }
  }
  
  /**
   * Find elements similar to the given element
   */
  async findSimilarElements(element: WebdriverIO.Element): Promise<WebdriverIO.Element[]> {
    try {
      const tagName = await element.getTagName();
      
      // Try both WebdriverIO methods and legacy methods
      // First try to find a root element with accessibilityId
      let root: WebdriverIO.Element | undefined;
      if (typeof (this.driver as any).$ === 'function') {
        root = await (this.driver as any).$('//*[@accessibilityId]');
      } else if (typeof (this.driver as any).findElement === 'function') {
        root = await (this.driver as any).findElement('xpath', '//*[@accessibilityId]');
      }
      
      if (!root) {
        return [];
      }
      
      // Find all elements with the same tag name under that root
      let elements: WebdriverIO.Element[] = [];
      if (typeof (root as any).$$ === 'function') {
        elements = await (root as any).$$(`.//*[local-name()='${tagName}']`);
      } else if (typeof (root as any).findElements === 'function') {
        elements = await (root as any).findElements('xpath', `.//*[local-name()='${tagName}']`);
      }
      
      return elements || [];
    } catch (error) {
      this.logger.error('Error finding similar elements', { error });
      return [];
    }
  }
  
  /**
   * Learn accessibility ID patterns from similar elements
   */
  async learnFromSimilarElements(element: WebdriverIO.Element): Promise<void> {
    try {
      const tagName = await element.getTagName();
      
      // Find similar elements with accessibility IDs
      const similarElements = await this.findSimilarElements(element);
      
      if (!similarElements || similarElements.length === 0) {
        this.logger.debug(`No similar elements found for ${tagName}`);
        return;
      }
      
      this.logger.debug(`Learning from ${similarElements.length} similar elements`);
      
      // Analyze elements
      await this.analyzePatternForElementType(tagName, similarElements);
    } catch (error) {
      this.logger.error('Error learning from similar elements', { error });
    }
  }
  
  /**
   * Get the current patterns that have been learned
   */
  getPatterns(): Map<string, Map<string, { accessibilityIdPattern: string; confidence: number }>> {
    return this.patterns;
  }
} 