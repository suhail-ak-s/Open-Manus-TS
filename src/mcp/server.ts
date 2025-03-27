import express, { Request, Response } from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { BaseMCPManager, MCPContext } from './base';
import { logger } from '../logging';
import { BaseTool } from '../tool/base';
import { TerminateTool } from '../tool/terminate';
import { TerminalTool } from '../tool/terminal';
import { ReadFileTool, WriteFileTool, ListDirectoryTool } from '../tool/file-operations';

/**
 * Result from a tool execution
 */
interface ToolResult {
  /**
   * ID of the tool call
   */
  id: string;

  /**
   * Name of the tool called
   */
  name: string;

  /**
   * Result of the tool execution as a string
   */
  result: string;

  /**
   * Status of execution (success/error)
   */
  status: 'success' | 'error';

  /**
   * Timestamp of execution
   */
  timestamp: string;
}

/**
 * Model Context Protocol server for remote context management
 */
export class MCPServer {
  /**
   * Express app for handling HTTP requests
   */
  private app: express.Application;

  /**
   * HTTP server port
   */
  private port: number;

  /**
   * MCP manager for context handling
   */
  private mcpManager: BaseMCPManager;

  /**
   * Available tools for execution
   */
  private tools: Map<string, BaseTool>;

  /**
   * Server identifier
   */
  private serverId: string;

  /**
   * Track tool execution results
   */
  private toolResults: Map<string, ToolResult>;

  /**
   * Create a new MCP server
   * @param options Server options
   */
  constructor(options: { port?: number; name?: string } = {}) {
    this.port = options.port || 3000;
    this.serverId = options.name || 'openmanus-mcp';
    this.mcpManager = new BaseMCPManager();
    this.tools = new Map();
    this.toolResults = new Map();

    // Initialize the Express app
    this.app = express();
    this.app.use(express.json());
    this.app.use(cors());

    // Initialize standard tools
    this.registerTool(new TerminalTool());
    this.registerTool(new ReadFileTool());
    this.registerTool(new WriteFileTool());
    this.registerTool(new ListDirectoryTool());
    this.registerTool(new TerminateTool());

    // Set up routes
    this.setupRoutes();
  }

  /**
   * Register a tool with the server
   * @param tool Tool to register
   */
  registerTool(tool: BaseTool): void {
    this.tools.set(tool.name, tool);
    logger.debug(`Registered tool: ${tool.name}`);
  }

  /**
   * Set up API routes
   */
  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'ok',
        serverId: this.serverId,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      });
    });

    // List available tools
    this.app.get('/tools', (req: Request, res: Response) => {
      const toolList = Array.from(this.tools.entries()).map(([name, tool]) => ({
        name,
        description: tool.description,
        parameters: tool.parameters,
      }));

      res.json({
        tools: toolList,
      });
    });

    // Create a new context
    this.app.post('/contexts', (req: Request, res: Response) => {
      const { name } = req.body;
      const context = this.mcpManager.createContext(name);

      res.json({
        id: context.id,
        name: context.name,
        message_count: context.messages.length,
      });
    });

    // List all contexts
    this.app.get('/contexts', (req: Request, res: Response) => {
      const contexts = Array.from(this.mcpManager.contexts.values()).map(context => ({
        id: context.id,
        name: context.name,
        message_count: context.messages.length,
        is_current: context.id === this.mcpManager.currentContext?.id,
      }));

      res.json({ contexts });
    });

    // Get a specific context
    this.app.get('/contexts/:id', (req: Request, res: Response) => {
      const context = this.mcpManager.getContext(req.params.id);

      if (!context) {
        return res.status(404).json({ error: 'Context not found' });
      }

      res.json({
        id: context.id,
        name: context.name,
        messages: context.messages,
        is_current: context.id === this.mcpManager.currentContext?.id,
      });
    });

    // Switch to a context
    this.app.post('/contexts/:id/switch', (req: Request, res: Response) => {
      const success = this.mcpManager.switchContext(req.params.id);

      if (!success) {
        return res.status(404).json({ error: 'Context not found' });
      }

      const context = this.mcpManager.getContext(req.params.id);

      res.json({
        id: context?.id,
        name: context?.name,
        message_count: context?.messages.length,
        status: 'switched',
      });
    });

    // Add a message to the current context
    this.app.post('/messages', (req: Request, res: Response) => {
      const { message } = req.body;

      if (!message || !message.role || !message.content) {
        return res.status(400).json({ error: 'Invalid message format' });
      }

      if (!this.mcpManager.currentContext) {
        this.mcpManager.createContext('default');
      }

      this.mcpManager.addMessage(message);

      res.json({
        status: 'added',
        context_id: this.mcpManager.currentContext?.id,
        message_count: this.mcpManager.currentContext?.messages.length,
      });
    });

    // Execute a tool
    this.app.post('/tools/:name/execute', async (req: Request, res: Response) => {
      const { name } = req.params;
      const { arguments: args, tool_call_id } = req.body;

      const tool = this.tools.get(name);

      if (!tool) {
        return res.status(404).json({ error: `Tool ${name} not found` });
      }

      try {
        const callId = tool_call_id || uuidv4();
        const result = await tool.execute(args || {});

        const toolResult: ToolResult = {
          id: callId,
          name,
          result,
          status: 'success',
          timestamp: new Date().toISOString(),
        };

        this.toolResults.set(callId, toolResult);

        res.json(toolResult);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Error executing tool ${name}: ${errorMessage}`);

        res.status(500).json({
          id: tool_call_id || uuidv4(),
          name,
          result: `Error: ${errorMessage}`,
          status: 'error',
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Get a specific tool result
    this.app.get('/tool-results/:id', (req: Request, res: Response) => {
      const result = this.toolResults.get(req.params.id);

      if (!result) {
        return res.status(404).json({ error: 'Tool result not found' });
      }

      res.json(result);
    });
  }

  /**
   * Start the MCP server
   */
  start(): void {
    this.app.listen(this.port, () => {
      logger.info(`MCP Server started on port ${this.port}`);
      logger.info(`Server ID: ${this.serverId}`);
      logger.info(`Available tools: ${Array.from(this.tools.keys()).join(', ')}`);
    });
  }

  /**
   * Get the current MCP manager
   */
  getManager(): BaseMCPManager {
    return this.mcpManager;
  }
}

export default MCPServer;
