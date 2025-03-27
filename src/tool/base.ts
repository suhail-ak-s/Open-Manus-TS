import { ToolDefinition } from '../schema';

/**
 * Interface for defining parameters of a tool
 */
export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required?: boolean;
  enum?: string[];
  default?: any;
  properties?: Record<string, ToolParameter>;
  items?: ToolParameter;
}

/**
 * Type definition for tool parameters
 */
export type ToolParameters = Record<string, ToolParameter>;

/**
 * Interface for tool results
 */
export interface ToolResult {
  content: string;
  result?: string;
  error?: string;
  base64_image?: string;
  [key: string]: any;
}

/**
 * Interface for standardized tool responses
 */
export interface ToolResponse {
  success: boolean;
  result: any;
  error?: string;
}

/**
 * Helper class for creating consistent tool parameters
 */
export class ToolParams {
  /**
   * Create a string parameter
   * @param description Parameter description
   * @param required Whether parameter is required
   * @param options Additional options
   */
  static string(
    description: string,
    required: boolean = false,
    options: { enum?: string[]; default?: string } = {}
  ): ToolParameter {
    return {
      type: 'string',
      description,
      required,
      ...(options.enum ? { enum: options.enum } : {}),
      ...(options.default !== undefined ? { default: options.default } : {}),
    };
  }

  /**
   * Create a number parameter
   * @param description Parameter description
   * @param required Whether parameter is required
   * @param defaultValue Default value
   */
  static number(
    description: string,
    required: boolean = false,
    defaultValue?: number
  ): ToolParameter {
    return {
      type: 'number',
      description,
      required,
      ...(defaultValue !== undefined ? { default: defaultValue } : {}),
    };
  }

  /**
   * Create a boolean parameter
   * @param description Parameter description
   * @param required Whether parameter is required
   * @param defaultValue Default value
   */
  static boolean(
    description: string,
    required: boolean = false,
    defaultValue?: boolean
  ): ToolParameter {
    return {
      type: 'boolean',
      description,
      required,
      ...(defaultValue !== undefined ? { default: defaultValue } : {}),
    };
  }

  /**
   * Create an object parameter
   * @param description Parameter description
   * @param required Whether parameter is required
   */
  static object(description: string, required: boolean = false): ToolParameter {
    return {
      type: 'object',
      description,
      required,
    };
  }

  /**
   * Create an array parameter
   * @param description Parameter description
   * @param required Whether parameter is required
   * @param itemsType Type of array items
   */
  static array(
    description: string,
    required: boolean = false,
    itemsType: ToolParameter = { type: 'string', description: 'Array item', required: false }
  ): ToolParameter {
    return {
      type: 'array',
      description,
      required,
      items: itemsType,
    };
  }
}

/**
 * Base class for all tools that can be used by agents
 */
export abstract class BaseTool {
  abstract name: string;
  abstract description: string;
  parameters: Record<string, ToolParameter> = {};
  requiredParams: string[] = [];

  /**
   * Execute the tool with the given input
   * @param input Tool input parameters
   */
  abstract execute(input: Record<string, any>): Promise<string | ToolResult>;

  /**
   * Convert the tool to an OpenAI function definition
   */
  toFunctionDefinition(): ToolDefinition {
    // Convert parameters to OpenAI format
    const properties: Record<string, any> = {};

    for (const [paramName, param] of Object.entries(this.parameters)) {
      // Copy parameter but remove the 'required' field which is not part of OpenAI's schema
      const { required, ...paramWithoutRequired } = param;

      // Process nested items in arrays
      if (param.type === 'array' && param.items) {
        const { required: itemRequired, ...itemWithoutRequired } = param.items;
        paramWithoutRequired.items = itemWithoutRequired;
      }

      // Process nested properties in objects
      if (param.type === 'object' && param.properties) {
        const processedProperties: Record<string, any> = {};
        for (const [propName, propValue] of Object.entries(param.properties)) {
          const { required: propRequired, ...propWithoutRequired } = propValue;
          processedProperties[propName] = propWithoutRequired;
        }
        paramWithoutRequired.properties = processedProperties;
      }

      properties[paramName] = paramWithoutRequired;
    }

    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: 'object',
          properties: properties,
          required: this.requiredParams.length > 0 ? this.requiredParams : undefined,
        },
      },
    };
  }

  /**
   * Validate that all required parameters are present
   * @param input Tool input parameters
   */
  validateParams(input: Record<string, any>): void {
    for (const param of this.requiredParams) {
      if (input[param] === undefined) {
        throw new Error(`Missing required parameter: ${param}`);
      }
    }
  }
}

/**
 * Collection of tools that can be used by agents
 */
export class ToolCollection {
  tools: BaseTool[];
  private toolMap: Record<string, BaseTool> = {};

  constructor(tools: BaseTool[] = []) {
    this.tools = [];
    if (tools.length > 0) {
      this.addTools(tools);
    }
  }

  addTools(tools: BaseTool[]): void {
    this.tools = [...this.tools, ...tools];
    // Update the tool map
    for (const tool of tools) {
      this.toolMap[tool.name] = tool;
    }
  }

  addTool(tool: BaseTool): void {
    this.tools.push(tool);
    this.toolMap[tool.name] = tool;
  }

  getTool(name: string): BaseTool | undefined {
    return this.toolMap[name];
  }

  /**
   * Convert all tools to OpenAI function definitions
   */
  toParams(): ToolDefinition[] {
    return this.tools.map(tool => tool.toFunctionDefinition());
  }

  /**
   * Execute a tool by name with the given input
   * @param name Tool name
   * @param toolInput Tool input parameters
   */
  async execute(name: string, toolInput: Record<string, any>): Promise<string | ToolResult> {
    const tool = this.getTool(name);
    if (!tool) {
      throw new Error(`Tool '${name}' not found`);
    }

    try {
      tool.validateParams(toolInput);
      return await tool.execute(toolInput);
    } catch (error) {
      const errorMessage = `Error executing tool '${name}': ${(error as Error).message}`;
      return { content: errorMessage };
    }
  }
}

/**
 * Format a result as a ToolResult object
 * @param content Text content
 * @param base64_image Optional base64 encoded image
 */
export function formatToolResult(content: string, base64_image?: string): ToolResult {
  return {
    content,
    base64_image,
  };
}

export default BaseTool;
