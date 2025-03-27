import { encode } from 'gpt-tokenizer';
import { logger } from '../logging';
import { ChatMessage, ToolCall } from '../schema';

// Constants for token limits
export const MAX_TOKENS_BY_MODEL: Record<string, number> = {
  'gpt-3.5-turbo': 4096,
  'gpt-3.5-turbo-16k': 16384,
  'gpt-4': 8192,
  'gpt-4-32k': 32768,
  'gpt-4-turbo': 128000,
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'claude-instant-1': 100000,
  'claude-2': 100000,
  'claude-2.1': 200000,
  'claude-3-opus-20240229': 200000,
  'claude-3-sonnet-20240229': 200000,
  'claude-3-haiku-20240307': 200000,
};

// Default token padding to reserve space for responses
export const DEFAULT_TOKEN_PADDING = 1000;

/**
 * Count tokens for a given string using the specified model
 */
export function countTokensForString(text: string, model: string): number {
  if (!text) return 0;

  try {
    // Get token count using gpt-tokenizer
    const tokens = encode(text);
    return tokens.length;
  } catch (error) {
    logger.warn(`Error counting tokens: ${(error as Error).message}`);
    // Fallback: estimate based on characters (average 4 chars per token)
    return Math.ceil(text.length / 4);
  }
}

/**
 * Count tokens for a tool call
 */
export function countTokensForToolCall(toolCall: ToolCall, model: string): number {
  try {
    // Count function name and arguments
    let tokenCount = 0;

    // Function name typically costs ~10 tokens
    tokenCount += countTokensForString(toolCall.function.name, model);

    // Arguments as JSON string
    if (toolCall.function.arguments) {
      const argsJson =
        typeof toolCall.function.arguments === 'string'
          ? toolCall.function.arguments
          : JSON.stringify(toolCall.function.arguments);

      tokenCount += countTokensForString(argsJson, model);
    }

    // Add overhead for function calling format (roughly ~15 tokens)
    tokenCount += 15;

    return tokenCount;
  } catch (error) {
    logger.warn(`Error counting tokens for tool call: ${(error as Error).message}`);
    // Fallback estimate
    return 50;
  }
}

/**
 * Count tokens for a chat message
 */
export function countTokensForMessage(message: ChatMessage, model: string): number {
  try {
    let tokenCount = 0;

    // Count tokens for content
    if (message.content) {
      tokenCount += countTokensForString(message.content, model);
    }

    // Count tokens for role (each role is about 4 tokens)
    tokenCount += 4;

    // Count tokens for tool calls if present
    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const toolCall of message.tool_calls) {
        tokenCount += countTokensForToolCall(toolCall, model);
      }
    }

    // Add overhead for message format (roughly ~5 tokens)
    tokenCount += 5;

    return tokenCount;
  } catch (error) {
    logger.warn(`Error counting tokens for message: ${(error as Error).message}`);
    // Fallback estimate based on content length
    return message.content ? Math.ceil(message.content.length / 4) + 10 : 10;
  }
}

/**
 * Count tokens for an array of chat messages
 */
export function countTokensForMessages(messages: ChatMessage[], model: string): number {
  let totalTokens = 0;

  for (const message of messages) {
    totalTokens += countTokensForMessage(message, model);
  }

  // Add overhead for the entire messages array format (roughly ~10 tokens)
  totalTokens += 10;

  return totalTokens;
}

/**
 * Get the maximum token limit for a given model
 */
export function getModelTokenLimit(model: string): number {
  // First try exact match
  if (model in MAX_TOKENS_BY_MODEL) {
    return MAX_TOKENS_BY_MODEL[model];
  }

  // Then try partial match
  for (const [modelName, limit] of Object.entries(MAX_TOKENS_BY_MODEL)) {
    if (model.includes(modelName)) {
      return limit;
    }
  }

  // Default to a conservative limit if model is unknown
  logger.warn(`Unknown model for token limit: ${model}, using default limit of 4096`);
  return 4096;
}

/**
 * Calculate the maximum tokens to generate based on the model and existing messages
 */
export function calculateMaxTokensToGenerate(
  messages: ChatMessage[],
  model: string,
  padding: number = DEFAULT_TOKEN_PADDING
): number {
  // Get the model's token limit
  const modelLimit = getModelTokenLimit(model);

  // Count tokens in the existing messages
  const usedTokens = countTokensForMessages(messages, model);

  // Calculate available tokens
  const availableTokens = modelLimit - usedTokens - padding;

  // Ensure we don't return a negative value
  return Math.max(1, availableTokens);
}
