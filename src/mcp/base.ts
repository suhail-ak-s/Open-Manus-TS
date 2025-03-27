import { Message } from '../types';
import { generateId } from '../utils';
import { logger } from '../logging';

/**
 * Base interface for MCP context
 */
export interface MCPContext {
  /**
   * Unique identifier for this context
   */
  id: string;

  /**
   * Name of this context
   */
  name: string;

  /**
   * Array of messages in this context
   */
  messages: Message[];

  /**
   * Add a message to this context
   */
  addMessage(message: Message): void;

  /**
   * Get context summary as string
   */
  getSummary(): string;
}

/**
 * Base MCP context implementation
 */
export class BaseMCPContext implements MCPContext {
  id: string;
  name: string;
  messages: Message[];

  constructor(name: string = 'default', id?: string) {
    this.id = id || generateId();
    this.name = name;
    this.messages = [];
  }

  addMessage(message: Message): void {
    this.messages.push(message);
    logger.debug(`Added message to context ${this.name}: ${message.role}`);
  }

  getSummary(): string {
    const messageCount = this.messages.length;
    if (messageCount === 0) {
      return `Empty context "${this.name}"`;
    }

    const roles = this.messages.map(m => m.role);
    const uniqueRoles = [...new Set(roles)];
    const roleCounts = uniqueRoles
      .map(role => {
        const count = roles.filter(r => r === role).length;
        return `${role}: ${count}`;
      })
      .join(', ');

    return `Context "${this.name}" with ${messageCount} messages (${roleCounts})`;
  }
}

/**
 * MCP manager interface - handles multiple contexts
 */
export interface MCPManager {
  /**
   * All available contexts
   */
  contexts: Map<string, MCPContext>;

  /**
   * Current active context
   */
  currentContext: MCPContext | null;

  /**
   * Create a new context
   */
  createContext(name?: string): MCPContext;

  /**
   * Get context by ID
   */
  getContext(id: string): MCPContext | null;

  /**
   * Switch to a different context
   */
  switchContext(id: string): boolean;

  /**
   * Add message to current context
   */
  addMessage(message: Message): void;
}

/**
 * Base MCP manager implementation
 */
export class BaseMCPManager implements MCPManager {
  contexts: Map<string, MCPContext>;
  currentContext: MCPContext | null;

  constructor() {
    this.contexts = new Map();
    this.currentContext = null;
  }

  createContext(name: string = 'context-' + generateId(6)): MCPContext {
    const context = new BaseMCPContext(name);
    this.contexts.set(context.id, context);

    // If this is the first context, make it current
    if (this.contexts.size === 1) {
      this.currentContext = context;
    }

    logger.debug(`Created new context: ${name} (${context.id})`);
    return context;
  }

  getContext(id: string): MCPContext | null {
    return this.contexts.get(id) || null;
  }

  switchContext(id: string): boolean {
    const context = this.getContext(id);
    if (!context) {
      logger.warn(`Cannot switch to context: ${id} - not found`);
      return false;
    }

    this.currentContext = context;
    logger.debug(`Switched to context: ${context.name} (${context.id})`);
    return true;
  }

  addMessage(message: Message): void {
    if (!this.currentContext) {
      // Create default context if none exists
      logger.debug('No current context, creating default');
      this.createContext('default');
    }

    this.currentContext?.addMessage(message);
  }
}

export default BaseMCPManager;
