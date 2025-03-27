import { ToolCallAgent } from '../agent/toolcall';
import { BaseMCPManager, MCPContext, MCPManager } from './base';
import { ToolCollection } from '../tool/base';
import { TerminateTool } from '../tool/terminate';
import { Message } from '../types';
import { logger } from '../logging';

/**
 * MCP-specific tool to manage contexts
 */
export class MCPTool {
  name: string = 'mcp';
  description: string = 'Manage multiple conversation contexts';
  parameters: Record<string, any> = {
    action: {
      type: 'string',
      enum: ['create', 'switch', 'list', 'summary'],
      description: 'The MCP action to perform',
    },
    context_name: {
      type: 'string',
      description: 'Name for the context when creating',
      required: false,
    },
    context_id: {
      type: 'string',
      description: 'ID of the context for switch action',
      required: false,
    },
  };

  private manager: MCPManager;

  constructor(manager: MCPManager) {
    this.manager = manager;
  }

  async call(args: any): Promise<string> {
    const { action, context_name, context_id } = args;

    switch (action) {
      case 'create':
        const newContext = this.manager.createContext(context_name);
        return `Created new context: ${newContext.name} (ID: ${newContext.id})`;

      case 'switch':
        if (!context_id) {
          return 'Error: context_id is required for switch action';
        }
        const success = this.manager.switchContext(context_id);
        if (success) {
          const context = this.manager.getContext(context_id)!;
          return `Switched to context: ${context.name} (ID: ${context.id})`;
        } else {
          return `Failed to switch context. Context ID ${context_id} not found.`;
        }

      case 'list':
        const contexts = Array.from(this.manager.contexts.values());
        const currentId = this.manager.currentContext?.id;
        const contextList = contexts
          .map(ctx => {
            const isCurrent = ctx.id === currentId ? '(current)' : '';
            return `- ${ctx.name} (ID: ${ctx.id}) ${isCurrent}`;
          })
          .join('\n');
        return `Available contexts:\n${contextList}`;

      case 'summary':
        if (context_id) {
          const context = this.manager.getContext(context_id);
          if (!context) {
            return `Context ID ${context_id} not found.`;
          }
          return context.getSummary();
        } else if (this.manager.currentContext) {
          return this.manager.currentContext.getSummary();
        } else {
          return 'No active context.';
        }

      default:
        return `Unknown action: ${action}`;
    }
  }
}

/**
 * System prompt for MCP agent
 */
const MCP_SYSTEM_PROMPT = `
You are an agent that can manage multiple conversation contexts using the Model Context Protocol (MCP).
You can create new contexts, switch between them, and list all available contexts.
Use the 'mcp' tool to manage contexts and keep track of different conversation threads.
`;

/**
 * Agent that supports the Model Context Protocol for managing multiple conversation contexts
 */
export class MCPAgent extends ToolCallAgent {
  mcpManager: MCPManager;
  mcpTool: MCPTool;

  constructor(options: any = {}) {
    const mcpManager = options.mcpManager || new BaseMCPManager();
    const mcpTool = new MCPTool(mcpManager);

    // Create tools collection with MCP tool and terminate tool
    const tools = new ToolCollection([mcpTool, new TerminateTool()]);

    // Add any additional tools provided
    if (options.additionalTools && Array.isArray(options.additionalTools)) {
      tools.addTools(options.additionalTools);
    }

    super({
      ...options,
      name: options.name || 'MCPAgent',
      description: options.description || 'An agent that supports multiple conversation contexts',
      systemPrompt: options.systemPrompt || MCP_SYSTEM_PROMPT,
      availableTools: tools,
      maxSteps: options.maxSteps || 10,
    });

    // Store MCP manager and tool for access
    this.mcpManager = mcpManager;
    this.mcpTool = mcpTool;

    // Special tools that should trigger termination
    this.specialToolNames = ['terminate'];
  }

  /**
   * Override observe to store messages in current context
   */
  async observe(result: string): string {
    // Store message in MCP context if possible
    if (this.mcpManager.currentContext) {
      // Attempt to parse as a message if it's not a string
      const message = typeof result === 'object' ? result : { role: 'assistant', content: result };
      this.mcpManager.addMessage(message);
    }

    // Call parent's observe method
    return super.observe(result);
  }

  /**
   * Create a new context
   */
  createContext(name?: string): MCPContext {
    return this.mcpManager.createContext(name);
  }

  /**
   * Switch to a different context
   */
  switchContext(id: string): boolean {
    const success = this.mcpManager.switchContext(id);
    if (success) {
      // Update memory with current context messages
      const context = this.mcpManager.getContext(id)!;
      this.memory.messages = [...context.messages];
      logger.debug(
        `Updated agent memory with ${context.messages.length} messages from context ${context.name}`
      );
    }
    return success;
  }

  /**
   * Get all available contexts
   */
  getContexts(): MCPContext[] {
    return Array.from(this.mcpManager.contexts.values());
  }
}

export default MCPAgent;
