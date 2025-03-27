import { BaseAgent } from './base';
import { ToolCollection } from '../tool/base';
import { TerminateTool } from '../tool/terminate';
import { logger } from '../logging';
import { AgentStateData, ChatMessage } from '../schema';

/**
 * System prompt for Chain of Thought
 */
const COT_SYSTEM_PROMPT = `
You are an AI assistant that uses Chain of Thought reasoning to solve complex problems.
When answering questions:
1. Break down the problem into explicit steps
2. Reason through each step clearly
3. Trace your logic carefully
4. Consider different approaches when appropriate
5. Come to a well-reasoned conclusion

Always show your step-by-step thinking before providing the final answer.
`;

/**
 * Next step prompt for Chain of Thought
 */
const COT_NEXT_STEP_PROMPT = `
Let's think through this step-by-step:
1. What are we trying to solve?
2. What information do we have?
3. What are the key constraints or requirements?
4. What approaches could work?
5. What are the pros and cons of each approach?
6. Which approach seems best and why?
7. How do we apply this approach?
8. What is our final answer?
`;

/**
 * Chain of Thought (CoT) agent for step-by-step reasoning
 */
export class CoTAgent extends BaseAgent {
  private model: string;
  private temperature: number;

  constructor(options: any = {}) {
    // Create tools collection with terminate tool
    const terminateTool = new TerminateTool();
    const tools = new ToolCollection([terminateTool]);

    // Add any additional tools provided
    if (options.additionalTools && Array.isArray(options.additionalTools)) {
      tools.addTools(options.additionalTools);
    }

    super({
      ...options,
      name: options.name || 'CoTAgent',
      description: options.description || 'An agent that uses Chain of Thought reasoning',
      systemPrompt: options.systemPrompt || COT_SYSTEM_PROMPT,
      nextStepPrompt: options.nextStepPrompt || COT_NEXT_STEP_PROMPT,
      availableTools: tools,
      maxSteps: options.maxSteps || 3,
    });

    // Store model and temperature for later use
    this.model = options.model || 'gpt-4';
    this.temperature = options.temperature || 0.7;
  }

  /**
   * Execute a single step in the agent's workflow
   * For CoT, this involves detailed reasoning through a problem
   */
  async step(): Promise<string> {
    logger.debug('CoT agent step');

    // Generate reasoning based on the problem
    await this.generateReasoning();

    // Extract reasoning and conclusion from the last assistant message
    const lastMessage = this.memory.messages[this.memory.messages.length - 1];
    if (lastMessage.role === 'assistant' && typeof lastMessage.content === 'string') {
      const content = lastMessage.content;

      // Find the final conclusion (typically after "Therefore," or "In conclusion,")
      const conclusionMarkers = [
        'therefore,',
        'thus,',
        'so,',
        'in conclusion,',
        'finally,',
        'as a result,',
        'consequently,',
      ];

      let conclusion = content;
      for (const marker of conclusionMarkers) {
        const markerIndex = content.toLowerCase().lastIndexOf(marker);
        if (markerIndex !== -1) {
          conclusion = content.substring(markerIndex);
          break;
        }
      }

      return conclusion;
    }

    return 'No conclusion reached';
  }

  /**
   * Generate reasoning based on the current problem
   */
  private async generateReasoning(): Promise<void> {
    // Get the current messages
    const messages = this.memory.messages;

    // Generate completion using LLM
    const response = await this.llm.ask(messages);

    // Add the LLM's reasoning to memory
    if (response) {
      this.memory.addMessage({
        role: 'assistant',
        content: response,
      });
    }
  }

  /**
   * Solve a problem using Chain of Thought reasoning
   * @param problem The problem to solve
   * @returns Reasoning and conclusion
   */
  async solve(problem: string): Promise<string> {
    // Clear previous conversation
    this.memory.clear();

    // Add the problem as user input
    this.memory.addMessage({
      role: 'user',
      content: problem,
    });

    // Run the CoT process
    return await this.run();
  }

  /**
   * Process the agent state (implementation of abstract method)
   */
  protected async processState(state: AgentStateData): Promise<AgentStateData> {
    logger.debug('CoTAgent processing state');

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

      // Process the message using solve logic
      const result = await this.solve(lastUserMessage.content);

      // Add assistant message to state
      state.messages.push({
        role: 'assistant',
        content: result,
      });

      return state;
    } catch (error) {
      logger.error(`Error in CoTAgent processing: ${(error as Error).message}`);
      state.error = error as Error;
      return state;
    }
  }
}

export default CoTAgent;
