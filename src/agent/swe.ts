import { BaseAgent } from './base';
import { BaseAgentOptions } from '../types';
import { AgentState, AgentStateData, Memory, ChatMessage } from '../schema';
import { logger } from '../logging';
import { ToolCollection } from '../tool/base';
import { ReadFileTool, WriteFileTool, ListDirectoryTool } from '../tool/file-operations';
import { TerminalTool } from '../tool/terminal';

/**
 * Software engineering agent specialized for coding tasks
 */
export class SWEAgent extends BaseAgent {
  // Tool-related properties
  availableTools: ToolCollection;

  /**
   * Create a new Software Engineering Agent
   * @param options Agent options
   */
  constructor(options: BaseAgentOptions = {}) {
    const defaultSystemPrompt = `You are an expert software engineer. You are assisting a user with programming and software development tasks.
When given a coding task:
1. Think through the problem step by step
2. Consider the appropriate architecture, patterns and best practices
3. Provide clean, well-structured code that follows language conventions
4. Include helpful comments when necessary
5. Test your solution and fix any bugs

You have tools available for reading and writing files, navigating directories, and running terminal commands.`;

    // Set up default tools for software engineering
    const defaultTools = new ToolCollection();
    defaultTools.addTool(new ReadFileTool());
    defaultTools.addTool(new WriteFileTool());
    defaultTools.addTool(new ListDirectoryTool());
    defaultTools.addTool(new TerminalTool());

    super({
      name: options.name || 'SWEAgent',
      description: options.description,
      systemPrompt: options.systemPrompt || defaultSystemPrompt,
      memory: options.memory ? new Memory() : undefined,
      maxSteps: options.maxSteps,
    });

    // Set available tools
    this.availableTools =
      options.availableTools instanceof ToolCollection ? options.availableTools : defaultTools;

    logger.debug('SWEAgent initialized with software engineering tools');
  }

  /**
   * Custom step implementation for software engineering tasks
   * This method is called repeatedly during the agent's run cycle
   */
  async step(): Promise<string> {
    logger.debug('SWEAgent performing step');

    // Process the current state and determine next action
    const lastMessage = this.memory.messages[this.memory.messages.length - 1];
    const nextAction = lastMessage.content || 'No specific action to take';

    // Execute the determined action
    // This is a placeholder - in a real implementation, this would process the message
    // and take specific actions based on its content
    logger.debug(`SWEAgent executing action: ${nextAction.substring(0, 50)}...`);

    return `Executed: ${nextAction.substring(0, 100)}`;
  }

  /**
   * Execute a software engineering task
   * @param task The software task to execute
   * @returns Result of execution
   */
  async executeSWETask(task: string): Promise<string> {
    this.memory.clear();
    this.state = AgentState.IDLE;
    this.currentStep = 0;
    this.memory.addMessage(Memory.userMessage(task));

    try {
      const result = await this.run(task);
      return result;
    } catch (error) {
      logger.error(`Error executing SWE task: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Process the agent state (implementation of abstract method)
   */
  protected async processState(state: AgentStateData): Promise<AgentStateData> {
    logger.debug('SWEAgent processing state');

    try {
      // Find the last user message
      const lastUserMessage = state.messages.find((m: ChatMessage) => m.role === 'user');
      if (!lastUserMessage) {
        throw new Error('No user message found');
      }

      // Process using executeSWETask
      const result = await this.executeSWETask(lastUserMessage.content);

      // Add the result as an assistant message
      state.messages.push({
        role: 'assistant',
        content: result,
      });

      return state;
    } catch (error) {
      logger.error(`Error in SWEAgent processing: ${(error as Error).message}`);
      state.error = error as Error;
      return state;
    }
  }
}
