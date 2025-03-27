import { ReActAgent } from './react';
import {
  AgentState,
  AgentStateData,
  ChatMessage,
  Memory,
  Message,
  ToolCall,
  ToolChoiceType,
  ToolResult,
} from '../schema';
import { ToolCollection } from '../tool/base';
import log from '../utils/logger';
import { LLM } from '../llm';
import { intelligentTruncate } from '../utils/text';

const TOOL_CALL_REQUIRED = 'Tool calls required but none provided';

/**
 * Agent that uses tool calling capabilities
 */
export class ToolCallAgent extends ReActAgent {
  // Tool-related properties
  availableTools: ToolCollection;
  toolChoices: ToolChoiceType;
  specialToolNames: string[];
  toolCalls: ToolCall[];
  private _currentBase64Image?: string;
  eventHandler?: (event: any) => void;

  constructor(options: any) {
    super(options);

    this.name = options.name || 'toolcall';
    this.description = options.description || 'An agent that can execute tool calls';

    this.availableTools = options.availableTools || new ToolCollection();
    this.toolChoices = options.toolChoices || 'auto';
    this.specialToolNames = options.specialToolNames || ['terminate'];
    this.eventHandler = options.eventHandler;

    this.toolCalls = [];
    this.maxSteps = options.maxSteps || 30;

    // Configure eventHandler for tools that support it
    this.configureToolEventHandlers();
  }

  /**
   * Configure event handlers for tools that support it
   */
  private configureToolEventHandlers(): void {
    if (!this.eventHandler) return;

    for (const tool of this.availableTools.tools) {
      if ('eventHandler' in tool && typeof (tool as any).eventHandler === 'undefined') {
        (tool as any).eventHandler = this.eventHandler;
      }
    }
  }

  /**
   * Get LLM's thinking with tool call identification
   */
  async think(): Promise<boolean> {
    // Add user message with next step prompt if configured
    if (this.nextStepPrompt) {
      const userMsg = { role: 'user' as const, content: this.nextStepPrompt };
      this.memory.addMessage(userMsg);
    }

    // Prepare messages
    const messages = this.memory.messages;
    const systemMsgs = this.systemPrompt
      ? [{ role: 'system' as const, content: this.systemPrompt }]
      : undefined;

    try {
      // Get response from LLM
      const toolDefinitions = this.availableTools.toParams();
      const response = await this.llm.askTool(
        messages,
        systemMsgs,
        toolDefinitions,
        this.toolChoices
      );

      // Extract tool calls and content
      this.toolCalls = response.tool_calls || [];
      const content = response.content || '';

      // DIRECT DEBUG - show exactly what we're getting
      console.log('\n\n');
      console.log('***** DIRECT DEBUG - CONTENT FROM LLM *****');
      console.log(content || 'NO CONTENT RETURNED');
      console.log('*******************************************');
      console.log('\n\n');

      // Log the agent's complete thought process
      if (content) {
        log.info(`✨ ${this.name}'s thoughts: ${content}`);
      }

      log.info(`🛠️ ${this.name} selected ${this.toolCalls.length} tools to use`);

      if (this.toolCalls.length > 0) {
        log.info(
          `🧰 Tools being prepared: ${this.toolCalls.map(call => call.function.name).join(', ')}`
        );
        if (this.toolCalls[0] && this.toolCalls[0].function) {
          log.info(`🔧 Tool arguments: ${this.toolCalls[0].function.arguments || '{}'}`);
        }
      }

      // Add the response to memory
      if (content || this.toolCalls.length > 0) {
        const assistantMsg =
          this.toolCalls.length > 0
            ? { role: 'assistant' as const, content, tool_calls: this.toolCalls }
            : { role: 'assistant' as const, content };
        this.memory.addMessage(assistantMsg);
      }

      // Handle different toolChoice modes
      if (this.toolChoices === 'none' && this.toolCalls.length > 0) {
        log.warning(`🤔 ${this.name} tried to use tools when they weren't available!`);
        return content ? true : false;
      }

      if (this.toolChoices === 'required' && this.toolCalls.length === 0) {
        return true; // Will be handled in act()
      }

      // For 'auto' mode, continue with content if no commands but content exists
      if (this.toolChoices === 'auto' && this.toolCalls.length === 0) {
        return Boolean(content);
      }

      return this.toolCalls.length > 0;
    } catch (error) {
      log.error(
        `🚨 Oops! The ${this.name}'s thinking process hit a snag: ${(error as Error).message}`
      );
      this.memory.addMessage({
        role: 'assistant' as const,
        content: `Error encountered while processing: ${(error as Error).message}`,
      });
      return false;
    }
  }

  /**
   * Add hints about tool usage based on the conversation context
   */
  private addToolUsageHint(): void {
    // Get the last few user messages
    const recentMessages = this.memory.messages.filter(msg => msg.role === 'user').slice(-2);

    if (recentMessages.length === 0) {
      return;
    }

    // Check for information queries that should use web_search
    const lastUserMsg = recentMessages[recentMessages.length - 1].content || '';
    const informationQuery =
      lastUserMsg.toLowerCase().includes('weather') ||
      lastUserMsg.toLowerCase().includes('news') ||
      lastUserMsg.toLowerCase().includes('current') ||
      lastUserMsg.toLowerCase().includes('latest') ||
      lastUserMsg.toLowerCase().includes('today');

    // For information queries, add a hint to use web_search
    if (informationQuery) {
      // Check if web_search tool is available
      const hasWebSearchTool = this.availableTools.tools.some(
        tool => tool.name === 'web_search' || tool.name === 'web-search'
      );

      if (hasWebSearchTool) {
        // Check if we've already reminded about web_search in recent conversation
        const recentConversation = this.memory.messages.slice(-4);
        const alreadyReminded = recentConversation.some(
          msg => msg.content && msg.content.includes('web_search')
        );

        if (!alreadyReminded) {
          this.memory.addMessage({
            role: 'system' as const,
            content:
              'This appears to be a request for current information. Please use the web_search tool to get up-to-date information.',
          });
        }
      }
    }
  }

  /**
   * Execute tool calls based on thinking
   */
  async act(): Promise<string> {
    if (this.toolCalls.length === 0) {
      if (this.toolChoices === 'required') {
        throw new Error(TOOL_CALL_REQUIRED);
      }

      // Return last message content if no tool calls
      const lastMessage = this.memory.messages[this.memory.messages.length - 1];
      return lastMessage.content || 'No content or commands to execute';
    }

    // Log tools being used
    const toolNames = this.toolCalls.map(tc => tc.function.name).join(', ');
    log.plan(`${this.name} plans to use the following tools: ${toolNames}`);
    log.info(`${this.name} selected ${this.toolCalls.length} tools to use`);

    // Emit agent acting event
    this.emitAgentEvent('agent_acting', {
      tools: toolNames,
      thinking: this.memory.messages[this.memory.messages.length - 1]?.content || '',
    });

    const results: string[] = [];

    for (let i = 0; i < this.toolCalls.length; i++) {
      const command = this.toolCalls[i];

      // Log the step number and details
      log.step(i + 1, this.toolCalls.length, `Using tool ${command.function.name}`);

      // Log tool selection with detailed arguments
      log.toolSelect(command.function.name, command.function.arguments || '{}');

      // Emit tool use event
      this.emitAgentEvent('tool_use', {
        tool: command.function.name,
        args: command.function.arguments ? JSON.parse(command.function.arguments) : {},
        step: i + 1,
        totalSteps: this.toolCalls.length,
      });

      // Reset base64 image for each tool call
      this._currentBase64Image = undefined;

      // Execute the tool
      const result = await this.executeTool(command);

      // Process search results specially for web_search
      let eventDetails: any = {
        tool: command.function.name,
        result: typeof result === 'string' ? result.substring(0, 150) : 'Complex result object',
        step: i + 1,
        totalSteps: this.toolCalls.length,
        base64_image: this._currentBase64Image,
      };

      // Special handling for web_search results to extract structured results
      if (command.function.name === 'web_search' && typeof result === 'string') {
        try {
          // Extract query from tool arguments
          let query = '';
          try {
            const args = JSON.parse(command.function.arguments || '{}');
            query = args.query || '';
          } catch (e) {
            // If parsing fails, try to extract from result
            const queryMatch = result.match(/Search results for "([^"]+)"/);
            if (queryMatch && queryMatch[1]) {
              query = queryMatch[1];
            }
          }

          // Add query to event details
          if (query) {
            eventDetails.query = query;
          }

          // Extract JSON results if available (from HTML comment format)
          const jsonMatch = result.match(/<!-- JSON_RESULTS: (.*?) -->/);
          if (jsonMatch && jsonMatch[1]) {
            try {
              const parsedData = JSON.parse(jsonMatch[1]);
              if (parsedData.results && Array.isArray(parsedData.results)) {
                // Pass structured results separately from the truncated text
                eventDetails.search_results = parsedData.results.map((item: any) => ({
                  title: item.title || '',
                  url: item.url || item.link || '',
                  snippet: item.snippet || '',
                  favicon:
                    item.favicon ||
                    `https://www.google.com/s2/favicons?domain=${new URL(item.url || item.link || '').hostname}`,
                }));
                log.info(
                  `Successfully extracted ${eventDetails.search_results.length} structured search results`
                );
              } else {
                log.warning('JSON_RESULTS found but no valid results array');
              }
            } catch (parseError) {
              log.error(`Error parsing JSON_RESULTS: ${(parseError as Error).message}`);
            }
          } else {
            // If no JSON_RESULTS comment, try to extract from the text
            log.warning(
              'No JSON_RESULTS found in web_search result, falling back to text extraction'
            );
          }

          // Include the full result for complete processing
          eventDetails.fullResult = result;
        } catch (e) {
          log.error(`Error in web_search result processing: ${(e as Error).message}`);
        }
      }

      // Emit tool result event
      this.emitAgentEvent('tool_result', eventDetails);

      // Log completion with emoji
      log.info(
        `🎯 Tool '${command.function.name}' completed its mission! Result: ${result.substring(0, 150)}${result.length > 150 ? '...' : ''}`
      );

      // Add tool response to memory
      const toolMsg: Message = {
        role: 'tool' as const,
        content: result,
        tool_call_id: command.id,
        name: command.function.name,
        base64_image: this._currentBase64Image,
      };

      this.memory.addMessage(toolMsg);
      results.push(result);
    }

    return results.join('\n\n');
  }

  /**
   * Execute a single tool call
   */
  async executeTool(command: ToolCall): Promise<string> {
    if (!command || !command.function) {
      throw new Error('Invalid tool call: missing function');
    }

    const name = command.function.name || '';

    try {
      // Parse arguments
      const args = JSON.parse(command.function.arguments || '{}');

      // Execute the tool
      log.tool(`Activating tool: '${name}'...`);
      const result = await this.availableTools.execute(name, args);

      // Handle special tools
      await this.handleSpecialTool(name, result);

      // Check if result is a ToolResult object with base64_image
      if (
        typeof result === 'object' &&
        result !== null &&
        'base64_image' in result &&
        result.base64_image
      ) {
        // Store the base64_image for later use in tool_message
        this._currentBase64Image = result.base64_image;
      }

      // Format result for display
      const resultStr = typeof result === 'string' ? result : result?.content || '';

      // Log the detailed tool result (untruncated for logging purposes)
      log.toolResult(name, resultStr);

      // Truncate the result for the LLM to prevent token overflow
      const truncatedResult = this.maxObserve
        ? intelligentTruncate(resultStr, this.maxObserve as number)
        : resultStr;

      const observation = truncatedResult
        ? `Observed output of cmd \`${name}\` executed:\n${truncatedResult}`
        : `Cmd \`${name}\` completed with no output`;

      return observation;
    } catch (error) {
      const errorMsg = `Error executing tool '${name}': ${(error as Error).message}`;
      log.error(`📝 Oops! Error with tool '${name}': ${(error as Error).message}`);
      return errorMsg;
    }
  }

  /**
   * Handle special tool execution and state changes
   */
  async handleSpecialTool(name: string, result: string | ToolResult): Promise<void> {
    if (!this.isSpecialTool(name)) {
      return;
    }

    if (this.shouldFinishExecution(name, result)) {
      log.info(`Special tool '${name}' has completed the task!`);
      this.state = AgentState.FINISHED;
    }
  }

  /**
   * Determine if a tool execution should finish the agent
   */
  shouldFinishExecution(name: string, result: string | ToolResult): boolean {
    return true;
  }

  /**
   * Check if a tool name is in the special tools list
   */
  isSpecialTool(name: string): boolean {
    return this.specialToolNames.map(n => n.toLowerCase()).includes(name.toLowerCase());
  }

  /**
   * Process the agent state (implementation of abstract method)
   */
  protected async processState(state: AgentStateData): Promise<AgentStateData> {
    log.info(`ToolCallAgent processing state at step ${state.step}`);

    // Simple processing implementation
    try {
      // Check if tools are available
      if (!state.tools || state.tools.length === 0) {
        log.warning('No tools provided for ToolCallAgent');
      }

      // If no messages, create error
      if (state.messages.length === 0) {
        throw new Error('No messages to process');
      }

      // Get the last user message
      const lastUserMessage = state.messages.find((m: ChatMessage) => m.role === 'user');
      if (!lastUserMessage) {
        throw new Error('No user message found');
      }

      // Update our internal state with the messages
      for (const msg of state.messages) {
        // Skip if message is already in memory
        if (this.memory.messages.find(m => m.role === msg.role && m.content === msg.content)) {
          continue;
        }

        // Add message to memory
        if (msg.role === 'user') {
          this.updateMemory('user', msg.content);
        } else if (msg.role === 'system') {
          this.updateMemory('system', msg.content);
        } else if (msg.role === 'assistant') {
          this.updateMemory('assistant', msg.content);
        }
      }

      // Run a step
      const result = await this.step();

      // Add assistant message to state
      state.messages.push({
        role: 'assistant' as const,
        content: result,
      });

      return state;
    } catch (error) {
      log.error(`Error in ToolCallAgent processing: ${(error as Error).message}`);
      state.error = error as Error;
      return state;
    }
  }

  /**
   * Emit an agent event if an event handler is available
   */
  private emitAgentEvent(type: string, details: any): void {
    if (this.eventHandler) {
      try {
        this.eventHandler({
          type,
          agent: this.name.toLowerCase().replace('agent', ''),
          state: 'running',
          message: `${this.name} ${type.replace('_', ' ')}`,
          details,
        });
      } catch (error) {
        log.error(
          `Error emitting agent event: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }
}

export default ToolCallAgent;
