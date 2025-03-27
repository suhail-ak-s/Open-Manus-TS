import { exec } from 'child_process';
import { promisify } from 'util';
import { BaseTool, formatToolResult, ToolParameter } from './base';
import { logger } from '../logging';
import { config } from '../config';

const execAsync = promisify(exec);

/**
 * Tool for executing Bash scripts securely
 */
export class BashTool extends BaseTool {
  name = 'bash';
  description = 'Execute a Bash script with configurable security options';

  parameters: Record<string, ToolParameter> = {
    script: {
      type: 'string',
      description: 'Bash script to execute',
      required: true,
    },
    timeout: {
      type: 'number',
      description: 'Timeout in seconds',
      required: false,
    },
    cwd: {
      type: 'string',
      description: 'Working directory for script execution',
      required: false,
    },
    allowedCommands: {
      type: 'array',
      description: 'List of allowed commands (if empty, no validation is performed)',
      required: false,
    },
  };

  requiredParams = ['script'];
  private defaultTimeout = 30; // 30 seconds

  // List of potentially dangerous commands that should be validated
  private dangerousCommands = [
    'rm -rf',
    'rm -r',
    'rmdir',
    'mkfs',
    'dd',
    ':(){ :|:& };:',
    'chmod -R',
    'chown -R',
    '> /dev/sda',
    '/dev/null',
    'fork bomb',
    '$(',
    '`',
    'eval',
    'exec',
    'wget',
    'curl -o',
    'curl --output',
    '/etc/passwd',
    '/etc/shadow',
  ];

  async execute(input: Record<string, any>): Promise<string | any> {
    const {
      script,
      timeout = this.defaultTimeout,
      cwd = process.cwd(),
      allowedCommands = [],
    } = input;

    // Validate script
    if (typeof script !== 'string' || script.trim() === '') {
      return formatToolResult('Error: Script parameter is empty or invalid');
    }

    // Check for dangerous commands if allowed commands are specified
    if (allowedCommands.length > 0) {
      const validation = this.validateScript(script, allowedCommands);
      if (!validation.isValid) {
        return formatToolResult(`Error: ${validation.reason}`);
      }
    } else {
      // If no specific allowed commands are provided, check for generally dangerous patterns
      for (const dangerous of this.dangerousCommands) {
        if (script.includes(dangerous)) {
          return formatToolResult(
            `Error: Script contains potentially dangerous command: ${dangerous}`
          );
        }
      }
    }

    try {
      logger.info('Executing Bash script');

      // Set maximum execution time
      const timeoutMs = timeout * 1000;

      // Execute the script
      const { stdout, stderr } = await execAsync(script, {
        timeout: timeoutMs,
        cwd,
        shell: '/bin/bash',
      });

      // Log execution results
      if (stderr) {
        logger.warn(`Bash script execution produced stderr: ${stderr}`);
      }

      // Return the result
      return formatToolResult(stdout || 'Script executed successfully (no output)');
    } catch (error: any) {
      const message = error.message || 'Unknown error';
      const stderr = error.stderr || '';

      logger.error(`Bash script execution error: ${message}`);

      // Format the error for better readability
      let errorMessage = message;
      if (error.signal === 'SIGTERM') {
        errorMessage = `Script execution timed out after ${timeout} seconds`;
      }

      return formatToolResult(`Error executing Bash script: ${errorMessage}\n${stderr}`);
    }
  }

  /**
   * Validate that the script only uses allowed commands
   * @param script Bash script to validate
   * @param allowedCommands List of allowed commands
   * @returns Result of validation with reason if invalid
   */
  private validateScript(
    script: string,
    allowedCommands: string[]
  ): { isValid: boolean; reason?: string } {
    // Simple command extraction and validation
    // This is a basic implementation and might need to be enhanced for more complex scripts
    const commandRegex = /^\s*([a-zA-Z0-9_\-\.\/]+)/gm;
    const commands: string[] = [];

    let match;
    while ((match = commandRegex.exec(script)) !== null) {
      const command = match[1].trim();
      if (command && !command.startsWith('#')) {
        commands.push(command);
      }
    }

    // Find commands that are not in the allowed list
    const disallowedCommands = commands.filter(cmd => !allowedCommands.includes(cmd));

    if (disallowedCommands.length > 0) {
      return {
        isValid: false,
        reason: `Disallowed commands: ${disallowedCommands.join(', ')}. Allowed commands are: ${allowedCommands.join(', ')}`,
      };
    }

    return { isValid: true };
  }
}
