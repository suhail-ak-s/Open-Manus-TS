import { ToolCallAgent } from './toolcall';
import { BrowserTool } from '../tool/browser';
import { WebSearchTool } from '../tool/web-search';
import { ToolCollection } from '../tool/base';
import { TerminateTool } from '../tool/terminate';
import { AgentState } from '../schema';
import { PrivateMemory } from './private-memory';
import { SharedMemory } from './shared-memory';
import log from '../utils/logger';

// Define AgentType enum here if not exported from schema
export enum AgentType {
  ORCHESTRATOR = 'orchestrator',
  PLANNING = 'planning',
  SWE = 'swe',
  BROWSER = 'browser',
  TERMINAL = 'terminal',
  PURCHASE = 'purchase',
  CERTIFICATE = 'certificate',
  BUDGET = 'budget',
  DEFECTS = 'defects',
}

/**
 * System prompt for the browser agent with ReAct pattern
 */
const SYSTEM_PROMPT = `
You are a Browser Agent within a multi-agent system. Your role is to gather information 
from the web, process it, and perform web-based tasks autonomously.

IMPORTANT: Your thinking process must follow the ReAct pattern (Reasoning, Acting, Observing):

1. REASONING:
   - Analyze what you know and what information you need
   - Identify gaps in your knowledge
   - Consider different approaches to gather information
   - Plan your next steps based on what you've learned so far

2. ACTING:
   - Use web_search tool to find information sources
   - Use browser tool to navigate to specific pages
   - Use browser tool to extract specific content from pages
   - Use terminate tool when you have enough information

3. OBSERVING:
   - Analyze the results of your searches and browsing
   - Extract key information and insights
   - Update your knowledge and plan accordingly
   - Determine if you need additional information

You decide when your task is complete. Use the terminate tool only when:
- You have gathered sufficient information from multiple sources
- You have verified critical information when possible
- You have organized and synthesized your findings into a comprehensive report
- Your final reasoning provides a complete answer to the original task

Remember that you are autonomous - you should make decisions about what to search for,
which websites to visit, and when to terminate based on your observations and reasoning.
Your goal is to provide the most comprehensive, accurate, and useful information possible.
`;

/**
 * Next step prompt for browser-specific thinking with ReAct guidance
 */
const BROWSER_NEXT_STEP_PROMPT = `
Based on the current state, decide your next action following the ReAct pattern:

1. THINK: What have I learned so far? What information am I still missing?
2. PLAN: What's the best next step to make progress? Do I need to:
   - Search for new information?
   - Visit a specific website?
   - Extract specific details from a page?
   - Compare information from different sources?
   - Synthesize what I've found so far?

3. DECIDE: Based on my plan, what specific tool should I use?
   - web_search: For finding new information sources
   - browser: For visiting websites and extracting content
   - terminate: When I have enough information to provide a complete answer

4. ACT: Execute your plan with the appropriate tool

Remember:
- Each step should build on previous findings
- If a website blocks access, try a different approach rather than retrying
- Use the terminate tool ONLY when you have enough information to provide a comprehensive answer
- Your final answer should synthesize all the information you've gathered
`;

/**
 * Agent specialized in browser automation and web research
 */
export class BrowserAgent extends ToolCallAgent {
  // Store original prompt to restore it later
  private originalNextStepPrompt?: string;
  private browserTool?: BrowserTool;
  private webSearchTool?: WebSearchTool;
  private terminateTool?: TerminateTool;
  private sharedMemory?: SharedMemory;
  private privateMemory?: PrivateMemory;
  private taskDescription: string = '';
  private accessIssuesCount: number = 0;

  constructor(options: any = {}) {
    // Create tools collection with browser, web search and terminate tools
    const browserTool = new BrowserTool(options.eventHandler ? { eventHandler: options.eventHandler } : {});
    const webSearchTool = new WebSearchTool();
    const terminateTool = new TerminateTool();

    const tools = new ToolCollection([browserTool, webSearchTool, terminateTool]);

    // Add any additional tools provided
    if (options.additionalTools && Array.isArray(options.additionalTools)) {
      tools.addTools(options.additionalTools);
    }

    // Set up private memory if not provided
    const privateMemory = options.privateMemory || new PrivateMemory('browser');
    
    // Store shared memory reference if provided
    const sharedMemory = options.memory;

    super({
      ...options,
      name: options.name || 'BrowserAgent',
      description: options.description || 'An agent that can research information from the web',
      systemPrompt: options.systemPrompt || SYSTEM_PROMPT,
      nextStepPrompt: options.nextStepPrompt || BROWSER_NEXT_STEP_PROMPT,
      availableTools: tools,
      maxSteps: options.maxSteps || 15,
      maxObserve: options.maxObserve || 10000,
      memory: privateMemory, // Use private memory by default
    });

    // Store the tools for later use
    this.browserTool = browserTool;
    this.webSearchTool = webSearchTool;
    this.terminateTool = terminateTool;
    this.sharedMemory = sharedMemory;
    this.privateMemory = privateMemory;

    // Pass event handler to shared memory if it exists
    if (options.eventHandler && sharedMemory && 
        typeof sharedMemory.setEventHandler === 'function') {
      sharedMemory.setEventHandler(options.eventHandler);
    }

    // Store special tools that should trigger termination
    this.specialToolNames = ['terminate'];

    // Store the original prompt for later
    this.originalNextStepPrompt = this.nextStepPrompt;
  }

  /**
   * Set the task description
   */
  setTask(description: string): void {
    this.taskDescription = description;
    
    // Reset counters
    this.accessIssuesCount = 0;
  }

  /**
   * Check if the terminate tool was called in the agent's most recent actions
   */
  private hasTerminateToolCall(): boolean {
    // Look for terminate tool calls in the agent's memory
    const recentMessages = this.memory.messages.slice(-3);
    
    for (const message of recentMessages) {
      if (message.role === 'assistant' && message.tool_calls) {
        // Check if any of the tool calls is the terminate tool
        for (const toolCall of message.tool_calls) {
          if (toolCall.function?.name === 'terminate') {
            return true;
          }
        }
      }
    }
    
    return false;
  }

  /**
   * Extract reasoning from the most recent terminate tool call
   */
  private extractTerminateReasoning(): string | null {
    // Look for terminate tool calls in the agent's memory
    const recentMessages = this.memory.messages.slice(-5);
    
    for (const message of recentMessages) {
      if (message.role === 'assistant' && message.tool_calls) {
        // Look through all tool calls
        for (const toolCall of message.tool_calls) {
          if (toolCall.function?.name === 'terminate') {
            try {
              // Parse the arguments from the tool call
              const args = JSON.parse(toolCall.function.arguments);
              if (args && args.reasoning) {
                return args.reasoning;
              }
            } catch (error) {
              // If JSON parsing fails, try to extract the reasoning using regex
              const argsString = toolCall.function.arguments;
              const reasoningMatch = argsString.match(/"reasoning"\s*:\s*"([^"]*)"/);
              if (reasoningMatch && reasoningMatch[1]) {
                return reasoningMatch[1];
              }
            }
          }
        }
      }
    }
    
    return null;
  }

  /**
   * Check if a result indicates website access issues
   */
  private hasAccessIssues(result: string): boolean {
    return result.includes('bot detection') ||
      result.includes('blocked') ||
      result.includes('access denied') ||
      (result.includes('Navigation to') && result.includes('failed'));
  }

  /**
   * Extract data from search results and page content
   */
  private extractToolData(result: string, dataPrefix = ''): string {
    let data = '';
    
    // Extract search results
    if (result.includes('web_search results:')) {
      const searchDataMatch = result.match(/web_search results:[^]*?(?=Using tool:|$)/);
      if (searchDataMatch) {
        data += `### ${dataPrefix}Search Results\n${searchDataMatch[0].trim()}\n\n`;
      }
    }
    
    // Extract page content
    if (result.includes('PAGE CONTENT:')) {
      const contentMatches = result.match(/PAGE CONTENT:([^]*?)(?=Using tool:|$)/g);
      if (contentMatches && contentMatches.length > 0) {
        data += `### ${dataPrefix}Website Content\n${contentMatches.join('\n').trim()}\n\n`;
      }
    }
    
    return data;
  }

  /**
   * Format results from multiple act steps into a cohesive response
   */
  private formatResults(results: string[]): string {
    // Filter out empty results
    const validResults = results.filter(r => r && r.trim().length > 0);

    if (validResults.length === 0) {
      return 'No useful information found during research.';
    }

    if (validResults.length === 1) {
      return validResults[0];
    }

    // Create a combined result with appropriate headings
    let combined = '# Research Results\n\n';

    // Keep track of websites we've seen
    const websites: Record<string, string> = {};

    // Extract website-specific content
    validResults.forEach(result => {
      // Extract URL if present
      const urlMatch = result.match(/navigated to ([^"\n]+)/);
      const url = urlMatch ? urlMatch[1] : '';

      if (url) {
        try {
          // Get domain name for heading
          const domain = new URL(url).hostname.replace('www.', '');

          // Extract content if available
          const contentMatch = result.match(/PAGE CONTENT:([\s\S]+)$/);
          const content = contentMatch ? contentMatch[1].trim() : '';

          if (content) {
            // Store content by domain to combine multiple results from same site
            if (!websites[domain]) {
              websites[domain] = content;
            } else {
              websites[domain] += '\n\n' + content;
            }
          }
        } catch (e) {
          // If URL parsing fails, just use the result as is
          combined += result + '\n\n';
        }
      } else if (result.includes('web_search')) {
        // Handle search results differently
        combined += '## Search Results\n\n' + result + '\n\n';
      } else {
        // Add other results as is
        combined += result + '\n\n';
      }
    });

    // Add website-specific content sections
    Object.entries(websites).forEach(([domain, content]) => {
      combined += `## Information from ${domain}\n\n`;
      combined += content.substring(0, 2000) + (content.length > 2000 ? '...' : '') + '\n\n';
    });

    return combined;
  }

  /**
   * Execute the research task with a simple think-act loop
   */
  async executeResearch(taskDescription: string, context: string = ''): Promise<string> {
    this.setTask(taskDescription);
    log.info(`BrowserAgent executing research: ${taskDescription}`);
    
    // Reset memory
    this.memory.messages = [];
    
    // Initialize with system prompt
    this.memory.addMessage({
      role: 'system',
      content: this.systemPrompt,
    });
    
    // Add task directive
    this.memory.addMessage({
      role: 'user',
      content: `TASK: ${taskDescription}
      
      ${context ? `CONTEXT: ${context}\n\n` : ''}
      
      Research this topic thoroughly using web search and browsing.
      When you have sufficient information, use the terminate tool with your final reasoning.`
    });
    
    // Update shared memory if available to show that browser agent is working on a task
    if (this.sharedMemory) {
      // Register browser agent if not already registered
      this.sharedMemory.registerAgent(AgentType.BROWSER, AgentState.RUNNING, {
        name: 'Browser Agent',
        role: 'Web researcher',
        currentTask: taskDescription
      });
      
      // Add research task to shared memory
      this.sharedMemory.addMessageWithContributor(
        {
          role: 'user',
          content: `Researching: ${taskDescription}`,
          timestamp: Date.now(),
        },
        AgentType.BROWSER
      );
    }
    
    // Track state
    let stepCount = 0;
    const maxSteps = this.maxSteps || 15;
    let finalReasoning: string | null = null;
    
    try {
      // Simple think-act loop until termination or max steps
      while (stepCount < maxSteps) {
        stepCount++;
        log.info(`BrowserAgent step ${stepCount}/${maxSteps}`);
        
        // Think
        await this.think();
        
        // Act
        const actionResult = await this.act();
        
        // REMOVED: No longer add intermediate steps to shared memory
        // Just log the action result locally
        log.info(`Browser research step ${stepCount}: ${actionResult?.substring(0, 100)}...`);
        
        // Check if termination was called
        if (this.hasTerminateToolCall()) {
          finalReasoning = this.extractTerminateReasoning();
          log.info(`Browser agent terminated at step ${stepCount}`);
          break;
        }
        
        // Nudge toward termination if we're getting close to max steps
        if (stepCount >= maxSteps - 2) {
          this.memory.addMessage({
            role: 'system',
            content: 'Consider using the terminate tool with your final reasoning and conclusions.'
          });
        }
      }
      
      // If we reached max steps without termination, use the last assistant message
      if (!finalReasoning) {
        log.warning(`BrowserAgent reached max steps (${maxSteps}) without termination`);
        
        const lastAssistantMessage = this.memory.messages
          .filter(m => m.role === 'assistant')
          .pop();
          
        if (lastAssistantMessage?.content) {
          finalReasoning = lastAssistantMessage.content;
        } else {
          // Fall back to a basic summary
          finalReasoning = `Research on "${taskDescription}" was conducted, but no final conclusion was reached.`;
        }
      }
      
      // Update shared memory with the final reasoning
      if (this.sharedMemory) {
        this.sharedMemory.addMessageWithContributor(
          {
            role: 'assistant',
            content: finalReasoning,
            timestamp: Date.now(),
          },
          AgentType.BROWSER
        );
        
        // Update agent state
        this.sharedMemory.updateAgentState(AgentType.BROWSER, AgentState.IDLE);
      }
      
      return finalReasoning;
      
    } catch (error) {
      const errorMessage = `Error during browser agent execution: ${(error as Error).message}`;
      log.error(errorMessage);
      
      // Update shared memory with error
      if (this.sharedMemory) {
        this.sharedMemory.addMessageWithContributor(
          {
            role: 'assistant',
            content: `Research error: ${(error as Error).message}`,
            timestamp: Date.now(),
          },
          AgentType.BROWSER
        );
        
        this.sharedMemory.updateAgentState(AgentType.BROWSER, AgentState.ERROR);
      }
      
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Extract search terms from a description
   */
  private extractSearchTerms(description: string): string {
    // Extract search terms from the description using a simple heuristic
    const aboutMatch = description.match(/about\s+([^,.]+)/i);
    const forMatch = description.match(/for\s+([^,.]+)/i);
    const researchMatch = description.match(/research\s+([^,.]+)/i);
    const findMatch = description.match(/find\s+([^,.]+)/i);

    // Return the first match found, or the entire description if no match
    return aboutMatch?.[1] || forMatch?.[1] || researchMatch?.[1] || findMatch?.[1] || description;
  }

  /**
   * Override think to provide browser-specific context
   */
  async think(): Promise<boolean> {
    // Check if browser is being used in recent messages
    const recentMessages = this.memory.messages.slice(-3);
    const browserInUse = recentMessages.some(msg => {
      if (msg.role === 'assistant' && msg.tool_calls) {
        return msg.tool_calls.some(call => call.function.name === 'browser');
      }
      return false;
    });

    // If browser is in use, override with browser-specific prompt temporarily
    if (browserInUse && this.originalNextStepPrompt) {
      this.nextStepPrompt = BROWSER_NEXT_STEP_PROMPT;
    }

    // Call parent's think method
    const result = await super.think();

    // Restore original prompt
    if (this.originalNextStepPrompt) {
      this.nextStepPrompt = this.originalNextStepPrompt;
    }

    return result;
  }

  /**
   * Clean up resources when done
   */
  async cleanup(): Promise<void> {
    // Close the browser if it's open
    if (this.browserTool) {
      await this.browserTool.dispose();
    }
  }

  /**
   * Override run to ensure cleanup happens
   */
  async run(request?: string): Promise<string> {
    try {
      return await super.run(request);
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Format results from multiple act steps into a cohesive response
   * This is a legacy method for backward compatibility
   */
  formatBrowserResults(...results: string[]): string {
    return this.formatResults(results);
  }
}

export default BrowserAgent;
