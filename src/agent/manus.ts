import { ToolCallAgent } from './toolcall';
import { ToolCollection } from '../tool/base';
import { TerminalTool } from '../tool/terminal';
import { ReadFileTool, WriteFileTool, ListDirectoryTool } from '../tool/file-operations';
import { WebSearchTool } from '../tool/web-search';
import { BrowserTool } from '../tool/browser';
import config from '../config';

/**
 * System prompt for the Manus agent
 */
const SYSTEM_PROMPT = `
You are Manus, a versatile AI assistant that can help with various tasks.
You have access to tools for:
- Terminal commands
- File operations
- Web browsing
- Web search
- Python execution

CRITICAL INSTRUCTION: For questions about current information like weather, news, or events, you MUST use the web_search tool.
DO NOT try to answer questions about current data from your internal knowledge, as it may be outdated.

IMPORTANT: You should actively use your tools to solve tasks rather than relying solely on your internal knowledge.
For questions about current information, always use web search or browser tools.
For file operations, always use the appropriate file tools rather than trying to guess file contents.
For terminal commands, use the terminal tool to execute them.

THINKING PROCESS: Always explain your reasoning process BEFORE selecting tools. For each step:
1. First analyze what information you need and why
2. Explain which tool would be most appropriate to get this information
3. Only THEN use the tool

Your workspace directory is: ${config.workspaceRoot}
`;

/**
 * Next step prompt for the Manus agent
 */
const NEXT_STEP_PROMPT = `
Analyze the current situation and decide on the next steps.

First, THINK THROUGH what you've learned so far and what you still need to know.
Then, explain your REASONING for choosing the next action. Consider:
- What information do you need?
- What tools would be most appropriate?
- What is your plan for obtaining the required information?

Remember to use your tools when necessary to complete tasks - don't just rely on what you know.
If the task requires gathering information, use web_search or browser tools.
If the task involves files, use the file operation tools.
`;

/**
 * Manus is a versatile general-purpose agent that can solve various tasks
 * using multiple tools and capabilities.
 */
export class ManusAgent extends ToolCallAgent {
  constructor(options: any = {}) {
    // Initialize with basic tools
    const tools = new ToolCollection([
      new TerminalTool(),
      new ReadFileTool(),
      new WriteFileTool(),
      new ListDirectoryTool(),
      new WebSearchTool(),
      new BrowserTool(),
    ]);

    // Set up agent config
    super({
      ...options,
      name: options.name || 'Manus',
      description: options.description || 'A versatile agent that can solve various tasks',
      systemPrompt: SYSTEM_PROMPT,
      nextStepPrompt: NEXT_STEP_PROMPT,
      availableTools: tools,
      maxSteps: options.maxSteps || 20,
      maxObserve: options.maxObserve || 10000,
      toolChoices: 'auto',
    });

    // Special tools that should trigger termination
    this.specialToolNames = ['terminate'];
  }

  /**
   * Override the shouldFinishExecution method to provide custom behavior
   */
  shouldFinishExecution(name: string): boolean {
    // Terminate only if the tool name is 'terminate'
    return name.toLowerCase() === 'terminate';
  }
}

export default ManusAgent;
