import { Logger } from '../utils/Logger';

/**
 * Ranks XPath query results to select the best matching element
 * by applying confidence scoring and fuzzy text matching
 */
export class XPathRanker {
  private logger = new Logger('XPathRanker');

  /**
   * Rank a list of elements based on various heuristics
   * 
   * @param elements Elements to rank
   * @param textCriteria Optional text to match against element text
   * @param fuzzyMatch Whether to use fuzzy text matching
   * @returns Ranked array of elements
   */
  async rankElements(
    elements: WebdriverIO.Element[],
    textCriteria?: string,
    fuzzyMatch: boolean = false
  ): Promise<WebdriverIO.Element[]> {
    if (!elements.length) {
      return [];
    }

    try {
      // Calculate confidence score for each element
      const scoredElements = await Promise.all(
        elements.map(async (element) => {
          const score = await this.calculateConfidenceScore(element, textCriteria, fuzzyMatch);
          return { element, score };
        })
      );

      // Sort by confidence score (descending)
      scoredElements.sort((a, b) => b.score - a.score);

      this.logger.debug(`Ranked ${elements.length} elements by confidence scores`);

      // Return just the elements, in ranked order
      return scoredElements.map((scored) => scored.element);
    } catch (error) {
      this.logger.error('Error ranking elements', { error });
      return elements; // Return original ordering on error
    }
  }

  /**
   * Find the best matching element from a list based on confidence scoring
   * 
   * @param elements Elements to evaluate
   * @param textCriteria Optional text to match
   * @param fuzzyMatch Whether to use fuzzy matching
   * @returns The best matching element or null if none found
   */
  async findBestMatch(
    elements: WebdriverIO.Element[],
    textCriteria?: string,
    fuzzyMatch: boolean = false
  ): Promise<WebdriverIO.Element | null> {
    if (!elements.length) {
      return null;
    }

    const rankedElements = await this.rankElements(elements, textCriteria, fuzzyMatch);
    return rankedElements[0] || null;
  }

  /**
   * Calculate a confidence score for an element based on various attributes
   * Higher scores indicate higher confidence that the element is the correct match
   * 
   * @param element Element to score
   * @param textCriteria Optional text to match
   * @param fuzzyMatch Whether to use fuzzy matching for text
   * @returns Confidence score (0-1)
   */
  async calculateConfidenceScore(
    element: WebdriverIO.Element,
    textCriteria?: string,
    fuzzyMatch: boolean = false
  ): Promise<number> {
    let score = 0;
    
    try {
      // Check accessibility ID (high confidence indicator)
      const accessibilityId = await element.getAttribute('accessibilityId');
      if (accessibilityId) {
        score += 0.4; // Large boost for having an accessibility ID
        
        // Additional points if the accessibility ID contains the text criteria
        if (textCriteria && accessibilityId.toLowerCase().includes(textCriteria.toLowerCase())) {
          score += 0.1;
        }
      }
      
      // Check visibility (visible elements are more likely the target)
      const isVisible = await element.isDisplayed();
      if (isVisible) {
        score += 0.3;
      }
      
      // Check if element has a text match
      if (textCriteria) {
        try {
          const elementText = await element.getText();
          
          if (elementText) {
            if (fuzzyMatch) {
              // Use fuzzy matching with confidence score
              const textMatchScore = this.getFuzzyMatchScore(textCriteria, elementText);
              score += 0.3 * textMatchScore;
            } else {
              // Exact text match
              if (elementText.toLowerCase() === textCriteria.toLowerCase()) {
                score += 0.3;
              } else if (elementText.toLowerCase().includes(textCriteria.toLowerCase())) {
                score += 0.2;
              }
            }
          }
        } catch (error) {
          // Some elements might not support getText()
          this.logger.debug('Could not get text for element', { error });
        }
      }
      
      // Additional scoring factors
      const isEnabled = await element.isEnabled().catch(() => false);
      if (isEnabled) {
        score += 0.1;
      }
      
      // Normalize the score to be between 0 and 1
      return Math.min(1, score);
    } catch (error) {
      this.logger.error('Error calculating confidence score', { error });
      return 0;
    }
  }

  /**
   * Calculate a fuzzy match score between two strings
   * 
   * @param target Target string to match against
   * @param actual Actual string to compare
   * @returns Score between 0 (no match) and 1 (perfect match)
   */
  getFuzzyMatchScore(target: string, actual: string): number {
    if (!target || !actual) {
      return 0;
    }
    
    // Normalize strings
    const normalizedTarget = target.toLowerCase().trim();
    const normalizedActual = actual.toLowerCase().trim();
    
    // Perfect match
    if (normalizedTarget === normalizedActual) {
      return 1;
    }
    
    // One string contains the other
    if (normalizedActual.includes(normalizedTarget) || normalizedTarget.includes(normalizedActual)) {
      // Calculate containment score based on length ratio
      const containmentScore = Math.min(
        normalizedTarget.length, 
        normalizedActual.length
      ) / Math.max(
        normalizedTarget.length, 
        normalizedActual.length
      );
      
      return 0.7 + (0.3 * containmentScore);
    }
    
    // Calculate Levenshtein distance for more complex fuzzy matching
    const distance = this.levenshteinDistance(normalizedTarget, normalizedActual);
    const maxLength = Math.max(normalizedTarget.length, normalizedActual.length);
    
    // Convert distance to similarity score (0-1)
    const similarity = 1 - (distance / maxLength);
    
    return similarity;
  }

  /**
   * Calculate Levenshtein distance between two strings
   * (Number of insertions, deletions or substitutions needed to transform one string to another)
   * 
   * @param a First string
   * @param b Second string
   * @returns Distance value
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];
    
    // Initialize matrix
    for (let i = 0; i <= a.length; i++) {
      matrix[i] = [];
      matrix[i][0] = i;
    }
    
    for (let j = 0; j <= b.length; j++) {
      matrix[0][j] = j;
    }
    
    // Fill matrix
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,      // deletion
          matrix[i][j - 1] + 1,      // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }
    
    return matrix[a.length][b.length];
  }
} 