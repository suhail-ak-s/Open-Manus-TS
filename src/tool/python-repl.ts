import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { BaseTool, formatToolResult, ToolParameter } from './base';
import { logger } from '../logging';

/**
 * Tool for executing Python code in a REPL-like environment
 */
export class PythonREPLTool extends BaseTool {
  name = 'python_repl';
  description = 'Execute Python code and return the result';

  parameters: Record<string, ToolParameter> = {
    code: {
      type: 'string',
      description: 'Python code to execute',
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
      const scriptPath = path.join(this.tempDir, `script_${scriptId}.py`);

      // Write the code to a temporary file
      fs.writeFileSync(scriptPath, code);

      // Execute the Python script
      const result = await this.executePythonScript(scriptPath, timeout);

      // Handle the result
      if (outputToFile) {
        const outputPath = path.join(this.tempDir, `output_${scriptId}.txt`);
        fs.writeFileSync(outputPath, result);
        return formatToolResult(`Python code executed. Output saved to: ${outputPath}`);
      } else {
        return formatToolResult(result);
      }
    } catch (error) {
      logger.error(`Python execution error: ${(error as Error).message}`);

      // Format the error for better readability
      let errorMessage = (error as Error).message;
      if (errorMessage.includes('ETIMEDOUT')) {
        errorMessage = `Execution timed out after ${timeout} seconds`;
      }

      return formatToolResult(`Error executing Python code: ${errorMessage}`);
    }
  }

  /**
   * Execute a Python script with a timeout
   * @param scriptPath Path to the Python script
   * @param timeoutSeconds Timeout in seconds
   * @returns Output of the script
   */
  private executePythonScript(scriptPath: string, timeoutSeconds: number): Promise<string> {
    return new Promise((resolve, reject) => {
      // Detect Python command (python or python3)
      const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';

      // Spawn Python process
      const pythonProcess = spawn(pythonCommand, [scriptPath]);

      let output = '';
      let errorOutput = '';

      // Collect stdout
      pythonProcess.stdout.on('data', data => {
        output += data.toString();
      });

      // Collect stderr
      pythonProcess.stderr.on('data', data => {
        errorOutput += data.toString();
      });

      // Handle process completion
      pythonProcess.on('close', code => {
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
        pythonProcess.kill();
        reject(new Error('ETIMEDOUT: Execution timed out'));
      }, timeoutSeconds * 1000);

      // Clear timeout if process completes
      pythonProcess.on('close', () => {
        clearTimeout(timeoutId);
      });
    });
  }

  /**
   * Validate that the code only imports allowed modules
   * @param code Python code to validate
   * @param allowedImports List of allowed imports
   * @returns Error message if imports are not allowed, null if valid
   */
  private validateImports(code: string, allowedImports: string[]): string | null {
    // Simple regex to match import statements
    const importRegex = /^\s*(import|from)\s+([a-zA-Z0-9_\.]+)/gm;
    let match;
    const disallowedImports = [];

    while ((match = importRegex.exec(code)) !== null) {
      const importName = match[2].split('.')[0]; // Get the base module name
      if (!allowedImports.includes(importName)) {
        disallowedImports.push(importName);
      }
    }

    if (disallowedImports.length > 0) {
      return `Disallowed imports: ${disallowedImports.join(', ')}. Allowed imports are: ${allowedImports.join(', ')}`;
    }

    return null;
  }
}
