import { exec } from 'child_process';
import { promisify } from 'util';
import { BaseTool, ToolParams, ToolResult } from './base';
import log from '../utils/logger';

const execAsync = promisify(exec);

/**
 * Terminal tool for executing shell commands
 */
export class TerminalTool extends BaseTool {
  name = 'terminal';
  description = 'Execute a terminal command and get the result';

  constructor() {
    super();
    this.parameters = {
      command: ToolParams.string('The command to execute', true),
      cwd: ToolParams.string('Working directory for command execution', false),
      timeout: ToolParams.number('Timeout in milliseconds', false, 30000),
    };
    this.requiredParams = ['command'];
  }

  /**
   * Execute the terminal command
   * @param input Command parameters
   */
  async execute(input: {
    command: string;
    cwd?: string;
    timeout?: number;
  }): Promise<string | ToolResult> {
    this.validateParams(input);

    const { command, cwd, timeout = 30000 } = input;

    try {
      log.info(`Executing command: ${command}`);

      const options = {
        cwd: cwd || process.cwd(),
        timeout: timeout,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      };

      const { stdout, stderr } = await execAsync(command, options);

      if (stderr) {
        log.warning(`Command produced errors: ${stderr}`);
      }

      return {
        content: stdout || 'Command executed successfully with no output',
        error: stderr || undefined,
      };
    } catch (error) {
      const errorMsg = `Error executing command: ${(error as Error).message}`;
      log.error(errorMsg);

      return {
        content: errorMsg,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Check if a command might be risky
   * @param command Command to check
   */
  private isRiskyCommand(command: string): boolean {
    // List of potentially dangerous commands
    const riskyPatterns = [
      /\brm\s+(-rf?|--recursive)\b/, // rm -rf
      /\bmkfs\b/, // mkfs
      /\bdd\b.*\bof=/, // dd of=
      /\b(shutdown|reboot|halt)\b/, // system commands
      /\b(wget|curl)\b.*\b\|\s*sh\b/, // piping to shell
    ];

    return riskyPatterns.some(pattern => pattern.test(command));
  }
}

export default TerminalTool;
