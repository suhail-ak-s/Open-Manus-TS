import { ToolCallAgent } from './toolcall';
import { BrowserTool } from '../tool/browser';
import { ToolCollection } from '../tool/base';
import { TerminateTool } from '../tool/terminate';

/**
 * System prompt for the browser agent
 */
const SYSTEM_PROMPT = `
You are a browser automation agent that can help users interact with web pages.
You can visit URLs, click on elements, fill out forms, extract content, and take screenshots.
Always think step-by-step about how to accomplish the user's goal by breaking it down into individual browser actions.
`;

/**
 * Next step prompt for browser-specific thinking
 */
const BROWSER_NEXT_STEP_PROMPT = `
Analyze the current browser state and decide on next steps.
Based on the current webpage and what you see:
1. What information do you see on the page that's relevant to the task?
2. What is the next browser action you should take to make progress?
3. If you're stuck, try using 'extract' to analyze the page structure, or 'screenshot' to see the current state.
`;

/**
 * Agent specialized in browser automation
 */
export class BrowserAgent extends ToolCallAgent {
  // Store original prompt to restore it later
  private originalNextStepPrompt?: string;
  private browserTool?: BrowserTool;

  constructor(options: any = {}) {
    // Create tools collection with browser and terminate tools
    const browserTool = new BrowserTool();
    const terminateTool = new TerminateTool();

    const tools = new ToolCollection([browserTool, terminateTool]);

    // Add any additional tools provided
    if (options.additionalTools && Array.isArray(options.additionalTools)) {
      tools.addTools(options.additionalTools);
    }

    super({
      ...options,
      name: options.name || 'BrowserAgent',
      description: options.description || 'An agent that can automate browser interactions',
      systemPrompt: options.systemPrompt || SYSTEM_PROMPT,
      nextStepPrompt: options.nextStepPrompt || BROWSER_NEXT_STEP_PROMPT,
      availableTools: tools,
      maxSteps: options.maxSteps || 15,
      maxObserve: options.maxObserve || 10000,
    });

    // Store the browser tool for later cleanup
    this.browserTool = browserTool;

    // Store special tools that should trigger termination
    this.specialToolNames = ['terminate'];

    // Store the original prompt for later
    this.originalNextStepPrompt = this.nextStepPrompt;
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
}

export default BrowserAgent;
