import crypto from 'crypto';

/**
 * Generate a random ID with specified length
 * @param length Length of the ID (default: 10)
 * @returns Random ID string
 */
export function generateId(length: number = 10): string {
  const bytes = crypto.randomBytes(Math.ceil(length / 2));
  return bytes.toString('hex').slice(0, length);
}

/**
 * Sleep for specified milliseconds
 * @param ms Milliseconds to sleep
 * @returns Promise that resolves after the delay
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Truncate a string to a maximum length, adding ellipsis if needed
 * @param str String to truncate
 * @param maxLength Maximum length
 * @returns Truncated string
 */
export function truncate(str: string, maxLength: number = 100): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Format a date as an ISO string, with optional time
 * @param date Date to format (default: current date)
 * @param includeTime Whether to include time (default: true)
 * @returns Formatted date string
 */
export function formatDate(date: Date = new Date(), includeTime: boolean = true): string {
  if (includeTime) {
    return date.toISOString();
  }
  return date.toISOString().split('T')[0];
}

/**
 * Deep clone an object
 * @param obj Object to clone
 * @returns Cloned object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Check if a value is an object
 * @param value Value to check
 * @returns Whether the value is an object
 */
export function isObject(value: any): boolean {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Merge two objects recursively
 * @param target Target object
 * @param source Source object
 * @returns Merged object
 */
export function deepMerge(target: any, source: any): any {
  const output = { ...target };

  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] });
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }

  return output;
}

export default {
  generateId,
  sleep,
  truncate,
  formatDate,
  deepClone,
  isObject,
  deepMerge,
};
