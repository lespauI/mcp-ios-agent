/**
 * Types and interfaces for UI State Capture
 */

export interface ScreenshotOptions {
  quality?: number;   // 1-100, JPEG quality
  format?: 'png' | 'jpeg'; 
  encoding?: 'base64' | 'binary';
  metadata?: boolean; // Include metadata like timestamp, resolution
  blocking?: boolean; // Whether to block execution during screenshot
  filename?: string;  // Custom filename 
  filePath?: string;  // Custom file path
}

export interface HierarchyOptions {
  format?: 'xml' | 'json';
  simplified?: boolean; // Simplified version without extra attributes
  formatted?: boolean;  // Pretty print the output
  cacheTimeout?: number; // How long to cache hierarchy
  includeOffscreen?: boolean; // Include elements not visible on screen
  highlighting?: boolean; // Generate highlighted version for debugging
}

export interface ElementPropertyOptions {
  properties?: string[]; // List of properties to retrieve
  batchSize?: number;    // Number of properties to retrieve in one call
  cacheTimeout?: number; // How long to cache properties
  deepFetch?: boolean;   // Whether to fetch properties of child elements
  filter?: string;       // Filter properties by pattern
}

export interface ElementBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ElementProperty {
  name: string;
  value: any;
  timestamp?: number;
}

export interface ElementProperties {
  elementId: string;
  properties: ElementProperty[];
  timestamp: number;
}

export interface ScreenshotResult {
  data: string;  // Base64 data or file path
  format: string;
  timestamp: number;
  dimensions?: {
    width: number;
    height: number;
  };
  metadata?: Record<string, any>;
  filePath?: string;
}

export interface HierarchyResult {
  data: string;   // XML or JSON data
  format: string;
  timestamp: number;
  elementCount: number;
  metadata?: Record<string, any>;
}

export interface StateComparisonResult {
  matches: boolean;
  differences?: {
    added: string[];
    removed: string[];
    changed: {
      [elementId: string]: {
        property: string;
        oldValue: any;
        newValue: any;
      }[];
    };
  };
  screenshot?: ScreenshotResult;
}

export interface StateCaptureOptions {
  screenshot?: boolean | ScreenshotOptions;
  hierarchy?: boolean | HierarchyOptions;
  properties?: boolean | ElementPropertyOptions;
}

export interface StateSnapshot {
  id: string;
  timestamp: number;
  screenshot?: ScreenshotResult;
  hierarchy?: HierarchyResult;
  properties?: ElementProperties[];
  metadata?: Record<string, any>;
} 