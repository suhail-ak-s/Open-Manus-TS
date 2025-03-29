import { BaseTool, formatToolResult, ToolParameter } from './base';
import { ToolResult } from '../schema';
import log from '../utils/logger';

/**
 * Tool for agents to signal task completion and provide final reasoning
 */
export class TerminateTool extends BaseTool {
  name = 'terminate';
  description = 'Signals that you have completed the assigned task and provides your final reasoning and conclusions';
  parameters: Record<string, ToolParameter> = {
    reasoning: {
      type: 'string',
      description: 'Your complete final reasoning, analysis and conclusions about the task',
      required: true,
    },
  };
  requiredParams = ['reasoning'];

  /**
   * Execute the terminate action
   * @param input Terminate parameters
   */
  async execute(input: { reasoning: string }): Promise<string | ToolResult> {
    const { reasoning } = input;

    log.info(`Task terminated with reasoning: ${reasoning.substring(0, 100)}...`);

    return formatToolResult(`Task terminated with final reasoning: ${reasoning.substring(0, 50)}...`);
  }
}

export default TerminateTool;
