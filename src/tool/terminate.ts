import { BaseTool, formatToolResult, ToolParameter } from './base';
import { ToolResult } from '../schema';
import log from '../utils/logger';

/**
 * Tool for terminating agent execution
 */
export class TerminateTool extends BaseTool {
  name = 'terminate';
  description = 'Finish the current task and end execution';
  parameters: Record<string, ToolParameter> = {
    reason: {
      type: 'string',
      description: 'Reason for terminating the execution',
      required: true,
    },
  };
  requiredParams = ['reason'];

  /**
   * Execute the terminate action
   * @param input Terminate parameters
   */
  async execute(input: { reason: string }): Promise<string | ToolResult> {
    const { reason } = input;

    log.info(`Terminating execution: ${reason}`);

    return formatToolResult(`Task completed: ${reason}`);
  }
}

export default TerminateTool;
