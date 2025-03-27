import { logger } from '../logging';

/**
 * Represents a message in a conversation
 */
export interface Message {
  role: 'system' | 'user' | 'assistant' | 'function' | 'tool';
  content: string;
  name?: string;
  toolCalls?: any[];
  toolCallId?: string;
}

/**
 * Manages agent conversation history and memory
 */
export class AgentMemory {
  private messages: Message[] = [];
  private maxTokenLimit: number;
  private systemMessage: Message | null = null;

  /**
   * Create a new agent memory
   * @param maxTokenLimit Maximum number of tokens to store (approximate)
   */
  constructor(maxTokenLimit = 16000) {
    this.maxTokenLimit = maxTokenLimit;
  }

  /**
   * Add a message to the conversation history
   * @param message Message to add
   */
  addMessage(message: Message): void {
    // If it's a system message, store it separately
    if (message.role === 'system') {
      this.systemMessage = message;
      return;
    }

    this.messages.push(message);

    // Check if we need to prune messages to stay under token limit
    // This is a simple approximation - in a real implementation,
    // we would use a tokenizer to count tokens accurately
    const estimatedTokens = this.estimateTokens();
    if (estimatedTokens > this.maxTokenLimit) {
      this.pruneMessages();
    }
  }

  /**
   * Add a user message to the conversation
   * @param content Content of the user message
   */
  addUserMessage(content: string): void {
    this.addMessage({ role: 'user', content });
  }

  /**
   * Add an assistant message to the conversation
   * @param content Content of the assistant message
   */
  addAssistantMessage(content: string): void {
    this.addMessage({ role: 'assistant', content });
  }

  /**
   * Add a tool result to the conversation
   * @param name Name of the tool
   * @param content Content/result from the tool
   * @param toolCallId ID of the tool call this is responding to
   */
  addToolMessage(name: string, content: string, toolCallId: string): void {
    this.addMessage({
      role: 'tool',
      name,
      content,
      toolCallId,
    });
  }

  /**
   * Set the system message
   * @param content Content of the system message
   */
  setSystemMessage(content: string): void {
    this.systemMessage = { role: 'system', content };
  }

  /**
   * Get all messages including the system message if present
   */
  getMessages(): Message[] {
    const result: Message[] = [];

    // Add system message at the beginning if exists
    if (this.systemMessage) {
      result.push(this.systemMessage);
    }

    // Add the rest of the messages
    result.push(...this.messages);

    return result;
  }

  /**
   * Clear all messages except the system message
   */
  clear(): void {
    this.messages = [];
    logger.debug('Agent memory cleared, keeping system message');
  }

  /**
   * Get the number of messages in the memory
   */
  get length(): number {
    return this.messages.length + (this.systemMessage ? 1 : 0);
  }

  /**
   * Estimate the number of tokens in all messages
   * This is a very simple approximation - 1 token ~= 4 characters
   */
  private estimateTokens(): number {
    let totalChars = 0;

    // Count system message if exists
    if (this.systemMessage) {
      totalChars += this.systemMessage.content.length;
    }

    // Count all other messages
    for (const message of this.messages) {
      totalChars += message.content.length;

      // Add extra for metadata
      totalChars += message.role.length + 10;

      if (message.name) {
        totalChars += message.name.length;
      }
    }

    // Approximate tokens (1 token ~= 4 chars)
    return Math.ceil(totalChars / 4);
  }

  /**
   * Prune older messages to stay under token limit
   * Keeps the most recent messages
   */
  private pruneMessages(): void {
    logger.info('Pruning agent memory to stay under token limit');

    // Keep removing oldest messages until we're under the limit
    while (this.estimateTokens() > this.maxTokenLimit && this.messages.length > 0) {
      // Always keep the most recent messages, so remove from the beginning
      // But never remove the system message
      this.messages.shift();
    }

    logger.debug(`Memory pruned, ${this.messages.length} messages remaining`);
  }
}
