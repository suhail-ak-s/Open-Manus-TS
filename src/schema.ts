/**
 * Enum for message roles in chat models
 */
export enum Role {
  SYSTEM = 'system',
  USER = 'user',
  ASSISTANT = 'assistant',
  TOOL = 'tool',
}

/**
 * Role type for messages
 */
export type RoleType = 'system' | 'user' | 'assistant' | 'tool';

/**
 * Agent state enum for tracking agent execution states
 */
export enum AgentState {
  IDLE = 'idle',
  RUNNING = 'running',
  FINISHED = 'finished',
  ERROR = 'error',
}

/**
 * Define tool choice types
 */
export enum ToolChoice {
  AUTO = 'auto',
  REQUIRED = 'required',
  NONE = 'none',
}

export type ToolChoiceType = ToolChoice | { type: 'function'; function: { name: string } };

/**
 * Interface for tool calls
 */
export interface ToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Interface for chat messages
 */
export interface ChatMessage {
  role: RoleType;
  content: string;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

/**
 * Interface for message with additional metadata
 */
export interface Message extends ChatMessage {
  timestamp?: number;
  metadata?: Record<string, any>;
  base64_image?: string;
}

/**
 * Tool result interface
 */
export interface ToolResult {
  content: string;
  result?: string;
  error?: string;
  base64_image?: string;
  [key: string]: any;
}

/**
 * Memory class for storing and managing message history
 */
export class Memory {
  messages: Message[] = [];

  constructor() {
    this.messages = [];
  }

  addMessage(message: Message): void {
    this.messages.push({
      ...message,
      timestamp: message.timestamp || Date.now(),
    });
  }

  clear(): void {
    this.messages = [];
  }

  getMessages(): Message[] {
    return this.messages;
  }

  static systemMessage(content: string): Message {
    return {
      role: 'system',
      content,
      timestamp: Date.now(),
    };
  }

  static userMessage(content: string, base64_image?: string): Message {
    return {
      role: 'user',
      content,
      base64_image,
      timestamp: Date.now(),
    };
  }

  static assistantMessage(content: string): Message {
    return {
      role: 'assistant',
      content,
      timestamp: Date.now(),
    };
  }

  static toolMessage(
    content: string,
    tool_call_id: string,
    name?: string,
    base64_image?: string
  ): Message {
    return {
      role: 'tool',
      content,
      tool_call_id,
      name,
      base64_image,
      timestamp: Date.now(),
    };
  }

  static fromToolCalls(content: string | null, tool_calls: ToolCall[]): Message {
    return {
      role: 'assistant',
      content: content || '',
      tool_calls,
      timestamp: Date.now(),
    };
  }
}

/**
 * Interface for agent state data
 */
export interface AgentStateData {
  messages: ChatMessage[];
  tools: any[];
  rawMessages: any[];
  step: number;
  error: Error | null;
  data: Record<string, any>;
}

/**
 * Options for LLM completion requests
 */
export interface CompletionOptions {
  messages: ChatMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
}

/**
 * Interface for token counting
 */
export interface TokenCount {
  total: number;
  prompt: number;
  completion: number;
  model: string;
}

/**
 * Interface for model information
 */
export interface ModelInfo {
  name: string;
  provider: string;
  contextSize: number;
  capabilities: string[];
  description: string;
}

/**
 * Interface for tool definition in a format compatible with LLM APIs
 */
export interface ToolDefinition {
  type: string;
  function: {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

/**
 * Tool parameter definition
 */
export interface ToolParameter {
  type: string;
  description: string;
  enum?: string[];
  required?: boolean;
  properties?: Record<string, ToolParameter>;
  items?: ToolParameter;
}

export interface LLMOptions {
  apiKey: string;
  [key: string]: any;
}

export interface BaseLLMClient {
  chat(
    messages: ChatMessage[],
    tools?: any[],
    toolChoice?: 'auto' | 'none' | any
  ): Promise<ChatMessage>;
  complete(prompt: string): Promise<string>;
  embedding(text: string): Promise<number[]>;
}
