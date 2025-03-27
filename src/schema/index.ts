import { z } from 'zod';

// Define role types
export const RoleType = z.enum(['user', 'system', 'assistant', 'tool']);
export type RoleType = z.infer<typeof RoleType>;

// Define agent states
export enum AgentState {
  IDLE = 'idle',
  RUNNING = 'running',
  FINISHED = 'finished',
  ERROR = 'error',
}

// Define tool choice types
export enum ToolChoice {
  AUTO = 'auto',
  REQUIRED = 'required',
  NONE = 'none',
}

export type ToolChoiceType = ToolChoice | { type: 'function'; function: { name: string } };

// Base Message interface
export interface Message {
  role: RoleType;
  content: string;
  tool_call_id?: string;
  name?: string;
  base64_image?: string;
  tool_calls?: ToolCall[];
  timestamp?: number;
  metadata?: Record<string, any>;
}

// Tool Call interfaces
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
  name?: string;
  arguments?: string | Record<string, any>;
}

// Tool definition interfaces
export interface ToolParameter {
  type: string;
  description: string;
  enum?: string[];
  required?: boolean;
  properties?: Record<string, ToolParameter>;
  items?: ToolParameter;
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, ToolParameter>;
      required?: string[];
    };
  };
}

// Tool result interface
export interface ToolResult {
  content: string;
  result?: string;
  error?: string;
  base64_image?: string;
  [key: string]: any;
}

// Memory class to store conversation history
export class Memory {
  messages: Message[] = [];

  constructor(initialMessages: Message[] = []) {
    this.messages = initialMessages;
  }

  addMessage(message: Message): void {
    this.messages.push(message);
  }

  clear(): void {
    this.messages = [];
  }

  static userMessage(content: string, base64_image?: string): Message {
    return { role: 'user', content, base64_image };
  }

  static systemMessage(content: string): Message {
    return { role: 'system', content };
  }

  static assistantMessage(content: string): Message {
    return { role: 'assistant', content, tool_calls: [] };
  }

  static toolMessage(
    content: string,
    tool_call_id: string,
    name?: string,
    base64_image?: string
  ): Message {
    return { role: 'tool', content, tool_call_id, name, base64_image };
  }

  static fromToolCalls(content: string | null, tool_calls: ToolCall[]): Message {
    return {
      role: 'assistant',
      content: content || '',
      tool_calls,
    };
  }
}
