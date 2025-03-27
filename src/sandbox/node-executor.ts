import { sandboxClient } from './client';
import { logger } from '../logging';

/**
 * Interface for Node.js execution result
 */
export interface NodeExecutionResult {
  code: number;
  output: string;
  error: string;
}

/**
 * Sandbox NodeJS executor for secure JavaScript/TypeScript code execution
 */
export class SandboxNodeExecutor {
  private static instance: SandboxNodeExecutor;

  /**
   * Create a new sandboxed Node.js executor
   */
  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get the sandboxed Node.js executor instance (singleton)
   */
  public static getInstance(): SandboxNodeExecutor {
    if (!SandboxNodeExecutor.instance) {
      SandboxNodeExecutor.instance = new SandboxNodeExecutor();
    }
    return SandboxNodeExecutor.instance;
  }

  /**
   * Execute JavaScript code in the sandbox
   * @param code JavaScript code to execute
   * @param timeout Timeout in milliseconds
   */
  public async executeJavaScript(code: string, timeout?: number): Promise<NodeExecutionResult> {
    try {
      return await sandboxClient.executeNodeCode(code, false, timeout);
    } catch (error) {
      logger.error(`Failed to execute JavaScript: ${(error as Error).message}`);
      return {
        code: 1,
        output: '',
        error: `Failed to execute JavaScript: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Execute TypeScript code in the sandbox
   * @param code TypeScript code to execute
   * @param timeout Timeout in milliseconds
   */
  public async executeTypeScript(code: string, timeout?: number): Promise<NodeExecutionResult> {
    try {
      return await sandboxClient.executeNodeCode(code, true, timeout);
    } catch (error) {
      logger.error(`Failed to execute TypeScript: ${(error as Error).message}`);
      return {
        code: 1,
        output: '',
        error: `Failed to execute TypeScript: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Validate JavaScript/TypeScript code for security concerns
   * @param code JavaScript/TypeScript code to validate
   * @param allowedImports Array of allowed import packages
   */
  public validateCode(
    code: string,
    allowedImports: string[] = []
  ): { isValid: boolean; reason?: string } {
    // Simple import validation
    const importRegex =
      /import\s+(?:(?:\{[^}]*\})|(?:\*\s+as\s+[a-zA-Z_$][a-zA-Z0-9_$]*)|(?:[a-zA-Z_$][a-zA-Z0-9_$]*))\s+from\s+['"]([@a-zA-Z0-9_$\-\/\.]+)['"]/g;

    let match;
    while ((match = importRegex.exec(code)) !== null) {
      const importPath = match[1];

      // If it's a relative path, it's allowed
      if (importPath.startsWith('./') || importPath.startsWith('../')) {
        continue;
      }

      // Check if the import is in the allowed list
      const isAllowed = allowedImports.some(allowed => {
        // Check for exact match or package/subpath match
        return importPath === allowed || importPath.startsWith(`${allowed}/`);
      });

      if (!isAllowed) {
        return {
          isValid: false,
          reason: `Import not allowed: ${importPath}`,
        };
      }
    }

    // Check for potentially dangerous code patterns
    const dangerousPatterns = [
      { pattern: /process\.env/g, reason: 'Accessing process.env is not allowed' },
      { pattern: /require\(.*\)/g, reason: 'Using require() is not allowed' },
      { pattern: /fs\./g, reason: 'Direct file system access is not allowed' },
      { pattern: /child_process/g, reason: 'Using child_process is not allowed' },
      { pattern: /http\.Server/g, reason: 'Creating HTTP servers is not allowed' },
      { pattern: /net\.Server/g, reason: 'Creating network servers is not allowed' },
    ];

    for (const { pattern, reason } of dangerousPatterns) {
      if (pattern.test(code)) {
        return {
          isValid: false,
          reason,
        };
      }
    }

    return { isValid: true };
  }
}

// Export a singleton instance
export const sandboxNodeExecutor = SandboxNodeExecutor.getInstance();
