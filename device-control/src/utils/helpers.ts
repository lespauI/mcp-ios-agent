/**
 * Utility function to pause execution for a specified time
 * 
 * @param ms Time to sleep in milliseconds
 * @returns Promise that resolves after the specified time
 */
export const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Utility to deep merge objects
 * 
 * @param target Target object
 * @param source Source object
 * @returns Merged object
 */
export const deepMerge = <T extends Record<string, any>>(target: T, source: Partial<T>): T => {
  const output = { ...target } as T;

  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      const sourceKey = key as keyof typeof source;
      const targetKey = key as keyof typeof target;
      
      if (isObject(source[sourceKey])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[sourceKey] });
        } else {
          // Use type assertion to handle the generic constraint
          (output as any)[key] = deepMerge(target[targetKey] as any, source[sourceKey] as any);
        }
      } else {
        Object.assign(output, { [key]: source[sourceKey] });
      }
    });
  }

  return output;
};

/**
 * Check if a value is an object
 * 
 * @param item Item to check
 * @returns True if the item is an object
 */
export const isObject = (item: any): item is Record<string, any> => {
  return item && typeof item === 'object' && !Array.isArray(item);
};

/**
 * Generate a unique ID
 * 
 * @returns Unique ID string
 */
export const generateId = (): string => {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}; 