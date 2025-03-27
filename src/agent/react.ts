import { BaseAgent } from './base';
import { AgentStateData, ChatMessage } from '../schema';
import log from '../utils/logger';
import { intelligentTruncate } from '../utils/text';

/**
 * Implementation of the ReAct (Reasoning + Acting) agent pattern
 * This agent follows a cycle of thinking, then acting, then observing
 */
export class ReActAgent extends BaseAgent {
  // Optional observation limit
  maxObserve?: number;

  constructor(options: any) {
    super(options);
    this.maxObserve = options.maxObserve;
  }

  /**
   * Execute a single step in the agent's workflow
   * For ReAct, this consists of thinking, acting, and observing
   */
  async step(): Promise<string> {
    // THINK: Analyze the current situation and decide what to do
    const shouldAct = await this.think();
    if (!shouldAct) {
      return 'No action needed';
    }

    // ACT: Execute the action determined during thinking
    const result = await this.act();

    // OBSERVE: Observe the results of the action
    return this.observe(result);
  }

  /**
   * Think about the current state and decide what to do next
   * @returns Boolean indicating whether action is needed
   */
  async think(): Promise<boolean> {
    log.thinking(`${this.name} is thinking...`);

    if (this.nextStepPrompt) {
      const userMsg = { role: 'user' as const, content: this.nextStepPrompt };
      this.memory.addMessage(userMsg);
    }

    try {
      // Get response from LLM
      const systemMsgs = this.systemPrompt
        ? [{ role: 'system' as const, content: this.systemPrompt }]
        : undefined;
      const response = await this.llm.ask(this.memory.messages, systemMsgs);

      // Log the full thought process
      log.thought(response);

      // Add the response to memory
      this.memory.addMessage({ role: 'assistant', content: response });

      return true;
    } catch (error) {
      log.error(`Error during thinking: ${(error as Error).message}`);
      this.memory.addMessage({
        role: 'assistant',
        content: `Error during thinking: ${(error as Error).message}`,
      });
      return false;
    }
  }

  /**
   * Act based on the thinking step
   * This is meant to be overridden by subclasses
   */
  async act(): Promise<string> {
    // Default implementation - just return the last thinking result
    const lastMessage = this.memory.messages[this.memory.messages.length - 1];
    return lastMessage.content || 'No action taken';
  }

  /**
   * Observe the results of the action
   * @param result Result from the act step
   */
  observe(result: string): string {
    // Use intelligent truncation if configured
    if (this.maxObserve && typeof this.maxObserve === 'number') {
      return intelligentTruncate(result, this.maxObserve);
    }
    return result;
  }

  /**
   * Process the agent state (implementation of abstract method)
   */
  protected async processState(state: AgentStateData): Promise<AgentStateData> {
    log.info(`ReActAgent processing state at step ${state.step}`);

    // Simple processing: just run a step
    try {
      // If no messages, create error
      if (state.messages.length === 0) {
        throw new Error('No messages to process');
      }

      // Get the last user message
      const lastUserMessage = state.messages.find((m: ChatMessage) => m.role === 'user');
      if (!lastUserMessage) {
        throw new Error('No user message found');
      }

      // Process the message using our regular step logic, but adapted for AgentStateData
      const systemMsgs = state.messages.filter((m: ChatMessage) => m.role === 'system');

      // Run the step method to get a response
      const result = await this.step();

      // Add assistant message to state
      state.messages.push({
        role: 'assistant',
        content: result,
      });

      return state;
    } catch (error) {
      log.error(`Error in ReActAgent processing: ${(error as Error).message}`);
      state.error = error as Error;
      return state;
    }
  }
}

export default ReActAgent;
