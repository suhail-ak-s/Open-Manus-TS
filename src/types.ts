import { MessageSchema, ToolCall, MessageContent, FunctionDefinition } from './schemas';

/**
 * Re-export basic types from schemas
 */
export type Message = MessageSchema;
export type ToolCallType = ToolCall;
export type ContentType = MessageContent;

/**
 * Memory interface for storing agent state
 */
export interface Memory {
  /**
   * Messages in the conversation
   */
  messages: Message[];

  /**
   * Add a message to memory
   */
  addMessage(message: Message): void;

  /**
   * Get the last N messages
   */
  getLastMessages(n: number): Message[];

  /**
   * Get messages by role
   */
  getMessagesByRole(role: string): Message[];

  /**
   * Clear memory
   */
  clear(): void;
}

/**
 * Agent state for tracking progress
 */
export interface AgentStateProps {
  /**
   * Current step number
   */
  step: number;

  /**
   * Whether the agent is done
   */
  done: boolean;

  /**
   * Current reasoning
   */
  reasoning?: string;

  /**
   * Last observation
   */
  observation?: string;

  /**
   * Last action
   */
  action?: string;

  /**
   * Last answer
   */
  answer?: string;
}

/**
 * Configuration for LLM API calls
 */
export interface LLMCallOptions {
  /**
   * Model to use
   */
  model: string;

  /**
   * Messages to send
   */
  messages: Message[];

  /**
   * Temperature (0-1)
   */
  temperature?: number;

  /**
   * Max tokens to generate
   */
  max_tokens?: number;

  /**
   * Whether to stream the response
   */
  stream?: boolean;

  /**
   * Function definitions for tool calling
   */
  functions?: FunctionDefinition[];

  /**
   * Tools to call
   */
  tools?: any[];

  /**
   * Callback for streaming
   */
  onStream?: (chunk: any) => void;
}

/**
 * Response from LLM API call
 */
export interface LLMResponse {
  /**
   * Response message
   */
  message: Message;

  /**
   * Raw response from API
   */
  raw?: any;
}

/**
 * Tool execution result
 */
export interface ToolResult {
  /**
   * Tool name
   */
  name: string;

  /**
   * Result of tool execution
   */
  result: string;

  /**
   * Tool call ID
   */
  tool_call_id: string;
}

/**
 * Callback functions for agent events
 */
export interface AgentCallbacks {
  /**
   * Called when agent thinks
   */
  onThink?: (reasoning: string) => void;

  /**
   * Called when agent acts
   */
  onAct?: (action: string, toolName: string, args: any) => void;

  /**
   * Called when agent observes
   */
  onObserve?: (observation: string) => void;

  /**
   * Called when agent finishes
   */
  onFinish?: (answer: string) => void;

  /**
   * Called on error
   */
  onError?: (error: Error) => void;
}

/**
 * Tool execution options
 */
export interface ToolExecuteOptions {
  /**
   * Arguments for tool execution
   */
  args: any;

  /**
   * Tool call ID
   */
  toolCallId: string;

  /**
   * Agent state
   */
  agentState?: AgentStateProps;
}

/**
 * Common type definitions for OpenManus
 */

import { BaseTool, ToolCollection } from './tool/base';
import { AgentMemory } from './agent/memory';

/**
 * Agent state
 */
export enum AgentState {
  INITIALIZED = 'initialized',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  TERMINATED = 'terminated',
}

/**
 * Agent step type
 */
export interface AgentStep {
  id: string;
  timestamp: number;
  type: 'thought' | 'action' | 'observation' | 'result';
  content: string;
  metadata?: Record<string, any>;
}

/**
 * Base agent options
 */
export interface BaseAgentOptions {
  name?: string;
  description?: string;
  systemPrompt?: string;
  model?: string;
  maxSteps?: number;
  temperature?: number;
  memory?: AgentMemory;
  availableTools?: ToolCollection | BaseTool[];
  stream?: boolean;
  llm?: any; // Allow LLM injection
}

/**
 * Log levels
 */
export enum LogLevel {
  TRACE = 'trace',
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal',
  SILENT = 'silent',
}

/**
 * Logger options
 */
export interface LoggerOptions {
  level?: LogLevel;
  prettyPrint?: boolean;
  destination?: string | NodeJS.WritableStream;
}

/**
 * Browser tool options
 */
export interface BrowserOptions {
  headless?: boolean;
  userAgent?: string;
  viewport?: {
    width: number;
    height: number;
  };
  timeout?: number;
}

/**
 * Web search options
 */
export interface WebSearchOptions {
  engine?: 'google' | 'bing' | 'duckduckgo';
  apiKey?: string;
  maxResults?: number;
}

/**
 * Function or tool calling formats
 */
export enum CallingFormat {
  FUNCTION_CALLING = 'function_calling',
  TOOL_CALLING = 'tool_calling',
  JSON = 'json',
  STRUCTURED_PROMPT = 'structured_prompt',
}

export default {
  // These are exported only as types, not values
};
