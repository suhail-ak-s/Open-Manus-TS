/**
 * Format tool result in a standardized way
 * @param message Main message from the tool
 * @param data Optional data to include in the result
 * @returns Formatted tool result as a string
 */
export function formatToolResult(message: string, data?: any): string {
  if (!data) {
    return message;
  }

  let result = message + '\n\n';

  // Format the data based on its type
  if (typeof data === 'string') {
    result += data;
  } else if (typeof data === 'object') {
    try {
      // Try to stringify the object with pretty formatting
      result += JSON.stringify(data, null, 2);
    } catch (error) {
      // Fallback to simple representation
      result += String(data);
    }
  } else {
    result += String(data);
  }

  return result;
}

export default {
  formatToolResult,
};
