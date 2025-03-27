import { Memory, Message } from '../schema';
import log from '../utils/logger';

/**
 * PrivateMemory provides agent-specific memory for specialized reasoning.
 * Unlike SharedMemory, PrivateMemory is unique to each agent and not visible to others.
 */
export class PrivateMemory extends Memory {
  // Agent's personal context (agent-specific information)
  private context: Record<string, any> = {};

  // Working memory for complex reasoning (temporary data)
  private workingMemory: any[] = [];

  // Agent's specific tools and capabilities
  private capabilities: Set<string> = new Set();

  /**
   * Create a new private memory instance
   * @param agentId The ID of the agent this memory belongs to
   */
  constructor(private agentId: string) {
    super();
    log.info(`Private memory for agent ${agentId} initialized`);
  }

  /**
   * Store context information for specialized reasoning
   * @param key Context identifier
   * @param value Context value
   */
  setContext(key: string, value: any): void {
    this.context[key] = value;
  }

  /**
   * Retrieve context information
   * @param key Context identifier
   * @returns The stored context value or undefined
   */
  getContext(key: string): any {
    return this.context[key];
  }

  /**
   * Add a capability to the agent's known capabilities
   * @param capability The capability name
   */
  addCapability(capability: string): void {
    this.capabilities.add(capability);
  }

  /**
   * Check if the agent has a specific capability
   * @param capability The capability to check
   * @returns True if the agent has the capability
   */
  hasCapability(capability: string): boolean {
    return this.capabilities.has(capability);
  }

  /**
   * Get all registered capabilities
   * @returns Array of capability names
   */
  getCapabilities(): string[] {
    return Array.from(this.capabilities);
  }

  /**
   * Add an item to working memory for complex reasoning
   * @param item Any item to store temporarily
   */
  addToWorkingMemory(item: any): void {
    this.workingMemory.push(item);
  }

  /**
   * Get the complete working memory
   * @returns Array of working memory items
   */
  getWorkingMemory(): any[] {
    return [...this.workingMemory];
  }

  /**
   * Clear working memory when no longer needed
   */
  clearWorkingMemory(): void {
    this.workingMemory = [];
    log.info(`Working memory for agent ${this.agentId} cleared`);
  }

  /**
   * Get the most recent thinking process
   * This is useful for the orchestrator to understand agent reasoning
   * @returns The latest reasoning or null if none exists
   */
  getLatestReasoning(): string | null {
    const reasoningMessages = this.messages.filter(
      m => m.role === 'assistant' && m.content && m.content.includes('reasoning:')
    );

    if (reasoningMessages.length > 0) {
      return reasoningMessages[reasoningMessages.length - 1].content || null;
    }

    return null;
  }

  /**
   * Record specialized reasoning process
   * @param reasoning The reasoning to record
   */
  recordReasoning(reasoning: string): void {
    this.addMessage({
      role: 'assistant',
      content: `Agent ${this.agentId} reasoning: ${reasoning}`,
    });
  }
}
