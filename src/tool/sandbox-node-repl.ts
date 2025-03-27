import { BaseTool, formatToolResult, ToolParameter } from './base';
import { logger } from '../logging';
import { sandboxNodeExecutor } from '../sandbox/node-executor';

/**
 * Tool for executing JavaScript/TypeScript code in a sandboxed environment
 */
export class SandboxNodeREPLTool extends BaseTool {
  name = 'sandbox_node_repl';
  description = 'Execute JavaScript/TypeScript code in a secure sandboxed environment';

  parameters: Record<string, ToolParameter> = {
    code: {
      type: 'string',
      description: 'JavaScript/TypeScript code to execute',
      required: true,
    },
    timeout: {
      type: 'number',
      description: 'Timeout in seconds',
      required: false,
    },
    useTypeScript: {
      type: 'boolean',
      description: 'Whether to execute as TypeScript code',
      required: false,
    },
    allowedImports: {
      type: 'array',
      description: 'List of allowed imports (if empty, no imports are allowed)',
      required: false,
    },
  };

  // Set required parameters
  requiredParams = ['code'];

  // Default timeout in seconds
  private defaultTimeout: number = 30;

  async execute(input: Record<string, any>): Promise<string | any> {
    const {
      code,
      timeout = this.defaultTimeout,
      useTypeScript = false,
      allowedImports = [],
    } = input;

    // Validate code
    if (typeof code !== 'string' || code.trim() === '') {
      return formatToolResult('Error: Code parameter is empty or invalid');
    }

    // Validate code for security concerns
    const validation = sandboxNodeExecutor.validateCode(code, allowedImports);
    if (!validation.isValid) {
      return formatToolResult(`Error: ${validation.reason}`);
    }

    try {
      logger.info(`Executing ${useTypeScript ? 'TypeScript' : 'JavaScript'} code in sandbox`);

      // Execute the code in the sandbox
      const result = useTypeScript
        ? await sandboxNodeExecutor.executeTypeScript(code, timeout * 1000)
        : await sandboxNodeExecutor.executeJavaScript(code, timeout * 1000);

      // Process the result
      if (result.code === 0) {
        return formatToolResult(result.output);
      } else {
        return formatToolResult(`Error: ${result.error}`);
      }
    } catch (error) {
      const message = (error as Error).message;
      logger.error(`Sandbox execution error: ${message}`);

      // Format the error for better readability
      let errorMessage = message;
      if (message.includes('timeout')) {
        errorMessage = `Execution timed out after ${timeout} seconds`;
      }

      return formatToolResult(`Error executing code in sandbox: ${errorMessage}`);
    }
  }
}
