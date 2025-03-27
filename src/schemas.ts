/**
 * Schema definitions for OpenManus
 *
 * This file contains JSON schema definitions for various components
 * of the OpenManus system, used for validation and documentation.
 */

/**
 * Parameter schema type
 */
export type ParameterSchema = {
  /**
   * The type of the parameter (string, number, boolean, object, array)
   */
  type: string;

  /**
   * Parameter description
   */
  description: string;

  /**
   * Whether the parameter is required
   */
  required?: boolean;

  /**
   * Default value if not provided
   */
  default?: any;

  /**
   * For enum types, the list of allowed values
   */
  enum?: string[];

  /**
   * For object types, the properties of the object
   */
  properties?: Record<string, ParameterSchema>;

  /**
   * For array types, the items schema
   */
  items?: ParameterSchema | ParameterSchema[];
};

/**
 * Tool parameter definition
 */
export type ToolParameters = Record<string, ParameterSchema>;

/**
 * Function definition schema for tool calling
 */
export interface FunctionDefinition {
  /**
   * Function name
   */
  name: string;

  /**
   * Function description
   */
  description: string;

  /**
   * Function parameters schema
   */
  parameters: {
    /**
     * Type of the parameter object
     */
    type: string;

    /**
     * Required parameter names
     */
    required?: string[];

    /**
     * Parameter definitions
     */
    properties: Record<string, ParameterSchema>;
  };
}

/**
 * Tool call schema
 */
export interface ToolCall {
  /**
   * Tool call ID
   */
  id: string;

  /**
   * Tool or function that was called
   */
  function: {
    /**
     * The name of the function that was called
     */
    name: string;

    /**
     * The arguments passed to the function
     */
    arguments: string;
  };
}

/**
 * Message content schema
 */
export type MessageContent =
  | string
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: string } };

/**
 * Message schema
 */
export interface MessageSchema {
  /**
   * Message role (user, assistant, system, tool)
   */
  role: 'user' | 'assistant' | 'system' | 'tool';

  /**
   * Message content
   */
  content: string | MessageContent[];

  /**
   * Optional name for the message
   */
  name?: string;

  /**
   * For assistant messages, tool calls
   */
  tool_calls?: ToolCall[];

  /**
   * For tool messages, the tool call ID
   */
  tool_call_id?: string;
}

/**
 * Agent options schema
 */
export interface AgentOptions {
  /**
   * Agent name
   */
  name?: string;

  /**
   * Agent description
   */
  description?: string;

  /**
   * System prompt
   */
  systemPrompt?: string;

  /**
   * Next step prompt (for reasoning)
   */
  nextStepPrompt?: string;

  /**
   * Max steps to run
   */
  maxSteps?: number;

  /**
   * Max observation length
   */
  maxObserve?: number;

  /**
   * Model to use
   */
  model?: string;

  /**
   * Available tools
   */
  availableTools?: any;

  /**
   * Whether to stream output
   */
  stream?: boolean;

  /**
   * Initial messages
   */
  initialMessages?: MessageSchema[];
}

/**
 * LLM configuration schema
 */
export interface LLMConfig {
  /**
   * Model name
   */
  model: string;

  /**
   * Base URL for API
   */
  base_url?: string;

  /**
   * API key
   */
  api_key?: string;

  /**
   * Max tokens to generate
   */
  max_tokens?: number;

  /**
   * Temperature
   */
  temperature?: number;

  /**
   * Top-p sampling
   */
  top_p?: number;

  /**
   * Whether to stream responses
   */
  stream?: boolean;

  /**
   * Custom headers
   */
  headers?: Record<string, string>;
}

/**
 * OpenManus Schema Definitions
 */

/**
 * Tool definition for LLM function calling
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<
      string,
      {
        type: string;
        description: string;
        enum?: string[];
      }
    >;
    required?: string[];
  };
}

/**
 * Tool parameter definition
 */
export interface ToolParameter {
  type: string;
  description: string;
  required: boolean;
  enum?: string[];
  default?: any;
}

/**
 * Tool result definition
 */
export interface ToolResult {
  content?: string;
  result?: string;
  error?: string;
  [key: string]: any;
}

/**
 * Agent configuration options
 */
export interface AgentConfig {
  name?: string;
  description?: string;
  model?: string;
  systemPrompt?: string;
  maxSteps?: number;
  stream?: boolean;
}

/**
 * LLM request message
 */
export interface Message {
  role: 'system' | 'user' | 'assistant' | 'function' | 'tool';
  content: string | null;
  name?: string;
  function_call?: {
    name: string;
    arguments: string;
  };
  tool_calls?: Array<{
    id: string;
    type: string;
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

/**
 * LLM completion options
 */
export interface CompletionOptions {
  model: string;
  messages: Message[];
  temperature?: number;
  max_tokens?: number;
  tools?: ToolDefinition[];
  tool_choice?: 'auto' | 'none' | { type: string; function: { name: string } };
  stream?: boolean;
}

/**
 * LLM completion response
 */
export interface CompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: Message;
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// Export empty object for default export - we use the named exports
export default {};
