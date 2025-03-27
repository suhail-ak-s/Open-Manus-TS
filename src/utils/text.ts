/**
 * Constants for text processing
 */
export const MAX_RESPONSE_LENGTH = 8000;
export const TRUNCATED_MESSAGE =
  '\n\n<response clipped><NOTE>To save on context, this response has been truncated. ' +
  'Consider using more specific tool parameters or filtering to reduce the output size.</NOTE>';

/**
 * Truncate content and append a notice if content exceeds the specified length
 * @param content The content to potentially truncate
 * @param truncateAfter The maximum length before truncation (defaults to MAX_RESPONSE_LENGTH)
 * @returns The potentially truncated content with a notice
 */
export function truncateContent(
  content: string,
  truncateAfter: number = MAX_RESPONSE_LENGTH
): string {
  if (!truncateAfter || content.length <= truncateAfter) {
    return content;
  }

  return content.substring(0, truncateAfter) + TRUNCATED_MESSAGE;
}

/**
 * Intelligently summarize large text by keeping important parts
 *
 * This function attempts to keep:
 * - The beginning of the text (first 1/3 of truncateAfter)
 * - The end of the text (last 1/3 of truncateAfter)
 * - A middle portion indicating content was removed
 *
 * @param content The content to potentially truncate
 * @param truncateAfter The maximum length before truncation (defaults to MAX_RESPONSE_LENGTH)
 * @returns The intelligently summarized content
 */
export function intelligentTruncate(
  content: string,
  truncateAfter: number = MAX_RESPONSE_LENGTH
): string {
  if (!truncateAfter || content.length <= truncateAfter) {
    return content;
  }

  // Calculate portions to keep
  const frontPortion = Math.floor(truncateAfter / 3);
  const backPortion = Math.floor(truncateAfter / 3);

  // Extract the beginning and end
  const beginning = content.substring(0, frontPortion);
  const ending = content.substring(content.length - backPortion);

  // Create a middle message
  const middleMessage = `\n\n... [${content.length - frontPortion - backPortion} characters omitted] ...\n\n`;

  // Combine the parts
  return beginning + middleMessage + ending;
}

export default {
  truncateContent,
  intelligentTruncate,
  MAX_RESPONSE_LENGTH,
  TRUNCATED_MESSAGE,
};
