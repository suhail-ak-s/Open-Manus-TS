import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { BaseTool, formatToolResult, ToolParameter } from './base';
import { logger } from '../logging';

/**
 * Tool for executing Node.js JavaScript/TypeScript code in a REPL-like environment
 */
export class NodeREPLTool extends BaseTool {
  name = 'node_repl';
  description = 'Execute JavaScript/TypeScript code and return the result';

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
    outputToFile: {
      type: 'boolean',
      description: 'Whether to save output to file instead of returning it directly',
      required: false,
    },
    allowedImports: {
      type: 'array',
      description: 'List of allowed imports (if empty, all imports are allowed)',
      required: false,
    },
    useTypeScript: {
      type: 'boolean',
      description: 'Whether to execute as TypeScript code (requires ts-node)',
      required: false,
    },
  };

  private tempDir: string;
  private defaultTimeout: number = 30; // 30 seconds default timeout

  constructor() {
    super();

    // Create a temporary directory for scripts
    this.tempDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }

    // Set required parameters
    this.requiredParams = ['code'];
  }

  async execute(input: Record<string, any>): Promise<string | any> {
    const {
      code,
      timeout = this.defaultTimeout,
      outputToFile = false,
      allowedImports = [],
      useTypeScript = false,
    } = input;

    // Validate code
    if (typeof code !== 'string' || code.trim() === '') {
      return formatToolResult('Error: Code parameter is empty or invalid');
    }

    // Validate imports if allowedImports is provided
    if (allowedImports.length > 0) {
      const importValidation = this.validateImports(code, allowedImports);
      if (importValidation) {
        return formatToolResult(`Error: ${importValidation}`);
      }
    }

    try {
      // Generate a unique filename for this execution
      const scriptId = uuidv4().substring(0, 8);
      const fileExtension = useTypeScript ? 'ts' : 'js';
      const scriptPath = path.join(this.tempDir, `script_${scriptId}.${fileExtension}`);

      // Write the code to a temporary file
      fs.writeFileSync(scriptPath, code);

      // Execute the JavaScript/TypeScript script
      const result = await this.executeNodeScript(scriptPath, timeout, useTypeScript);

      // Handle the result
      if (outputToFile) {
        const outputPath = path.join(this.tempDir, `output_${scriptId}.txt`);
        fs.writeFileSync(outputPath, result);
        return formatToolResult(
          `JavaScript/TypeScript code executed. Output saved to: ${outputPath}`
        );
      } else {
        return formatToolResult(result);
      }
    } catch (error) {
      logger.error(`Node.js execution error: ${(error as Error).message}`);

      // Format the error for better readability
      let errorMessage = (error as Error).message;
      if (errorMessage.includes('ETIMEDOUT')) {
        errorMessage = `Execution timed out after ${timeout} seconds`;
      }

      return formatToolResult(`Error executing JavaScript/TypeScript code: ${errorMessage}`);
    } finally {
      // Cleanup could happen here if needed
    }
  }

  /**
   * Execute a Node.js script with a timeout
   * @param scriptPath Path to the JavaScript/TypeScript script
   * @param timeoutSeconds Timeout in seconds
   * @param useTypeScript Whether to execute using ts-node
   * @returns Output of the script
   */
  private executeNodeScript(
    scriptPath: string,
    timeoutSeconds: number,
    useTypeScript: boolean
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      // Determine command based on whether we're running TypeScript or JavaScript
      const command = useTypeScript ? 'npx' : 'node';
      const args = useTypeScript ? ['ts-node', scriptPath] : [scriptPath];

      // Spawn Node process
      const nodeProcess = spawn(command, args);

      let output = '';
      let errorOutput = '';

      // Collect stdout
      nodeProcess.stdout.on('data', data => {
        output += data.toString();
      });

      // Collect stderr
      nodeProcess.stderr.on('data', data => {
        errorOutput += data.toString();
      });

      // Handle process completion
      nodeProcess.on('close', code => {
        // Clean up the temporary script
        try {
          fs.unlinkSync(scriptPath);
        } catch (e) {
          logger.error(`Failed to delete temporary script: ${scriptPath}`);
        }

        if (code === 0) {
          resolve(output.trim());
        } else {
          reject(new Error(errorOutput || `Process exited with code ${code}`));
        }
      });

      // Set timeout
      const timeoutId = setTimeout(() => {
        nodeProcess.kill();
        reject(new Error('ETIMEDOUT: Execution timed out'));
      }, timeoutSeconds * 1000);

      // Clear timeout if process completes
      nodeProcess.on('close', () => {
        clearTimeout(timeoutId);
      });
    });
  }

  /**
   * Validate that the code only imports allowed modules
   * @param code JavaScript/TypeScript code to validate
   * @param allowedImports List of allowed imports
   * @returns Error message if imports are not allowed, null if valid
   */
  private validateImports(code: string, allowedImports: string[]): string | null {
    // Regex to match various import patterns in JavaScript/TypeScript
    const importPatterns = [
      /^\s*import\s+.*\s+from\s+['"]([^'"]+)['"]/gm, // import x from 'module'
      /^\s*import\s+['"]([^'"]+)['"]/gm, // import 'module'
      /^\s*const\s+.*\s+=\s+require\s*\(\s*['"]([^'"]+)['"]\s*\)/gm, // const x = require('module')
      /^\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/gm, // require('module')
    ];

    const disallowedImports: string[] = [];

    for (const pattern of importPatterns) {
      let match;
      while ((match = pattern.exec(code)) !== null) {
        const fullImport = match[1];
        // Get the base module name (e.g., 'lodash' from 'lodash/map')
        const importName = fullImport.split('/')[0];

        // Skip relative imports
        if (importName.startsWith('.')) continue;

        if (!allowedImports.includes(importName)) {
          disallowedImports.push(importName);
        }
      }
    }

    if (disallowedImports.length > 0) {
      return `Disallowed imports: ${disallowedImports.join(', ')}. Allowed imports are: ${allowedImports.join(', ')}`;
    }

    return null;
  }
}
