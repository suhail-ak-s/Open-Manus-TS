import { BaseTool, formatToolResult, ToolParameter } from './base';
import { logger } from '../logging';
import { sandboxClient } from '../sandbox/client';

/**
 * Tool for executing Bash scripts in a sandboxed environment
 */
export class SandboxBashTool extends BaseTool {
  name = 'sandbox_bash';
  description = 'Execute a Bash script in a secure sandboxed environment';

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
    allowedCommands: {
      type: 'array',
      description: 'List of allowed commands (if empty, no validation is performed)',
      required: false,
    },
  };

  requiredParams = ['script'];
  private defaultTimeout = 30; // 30 seconds

  // List of potentially dangerous commands that should always be blocked
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
    'sudo',
    'su',
    'apt',
    'apt-get',
    'yum',
    'pacman',
    'npm',
    'pip',
    'ssh',
    'scp',
    'nmap',
    'nc',
  ];

  async execute(input: Record<string, any>): Promise<string | any> {
    const { script, timeout = this.defaultTimeout, allowedCommands = [] } = input;

    // Validate script
    if (typeof script !== 'string' || script.trim() === '') {
      return formatToolResult('Error: Script parameter is empty or invalid');
    }

    // First check for explicitly dangerous commands
    for (const dangerous of this.dangerousCommands) {
      if (script.includes(dangerous)) {
        return formatToolResult(`Error: Script contains prohibited command: ${dangerous}`);
      }
    }

    // Then check against allowed commands if specified
    if (allowedCommands.length > 0) {
      const validation = this.validateScript(script, allowedCommands);
      if (!validation.isValid) {
        return formatToolResult(`Error: ${validation.reason}`);
      }
    }

    try {
      logger.info('Executing Bash script in sandbox');

      // Set maximum execution time
      const timeoutMs = timeout * 1000;

      // Execute the script using the sandbox client
      const result = await sandboxClient.runCommand(script, timeoutMs);

      // Log execution results
      if (result.stderr) {
        logger.warn(`Sandboxed Bash execution produced stderr: ${result.stderr}`);
      }

      // Return the result
      if (result.code === 0) {
        return formatToolResult(result.stdout || 'Script executed successfully (no output)');
      } else {
        return formatToolResult(
          `Script execution failed with exit code ${result.code}:\n${result.stderr}`
        );
      }
    } catch (error) {
      const message = (error as Error).message;
      logger.error(`Sandboxed Bash execution error: ${message}`);

      // Format the error for better readability
      let errorMessage = message;
      if (message.includes('timeout')) {
        errorMessage = `Script execution timed out after ${timeout} seconds`;
      }

      return formatToolResult(`Error executing script in sandbox: ${errorMessage}`);
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
