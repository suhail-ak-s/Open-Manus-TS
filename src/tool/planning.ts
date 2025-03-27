import { BaseTool } from './base';
import { formatToolResult } from '../utils/format';
import { Plan, PlanStep, PlanStepStatus } from '../flow/planning';
import log from '../utils/logger';
import { BaseAgent } from '../agent/base';

/**
 * Tool for managing plans and their execution
 */
export class PlanningTool extends BaseTool {
  name = 'planning';
  description = 'Create and manage plans with multiple steps';

  // Storage for plans
  plans: Record<string, Plan> = {};

  // Default agent for plan execution
  private defaultAgent: BaseAgent | null = null;

  /**
   * Set the default agent to use for plan execution
   */
  setDefaultAgent(agent: BaseAgent): void {
    this.defaultAgent = agent;
  }

  /**
   * Define tool parameters
   */
  defineParameters(): Record<string, any> {
    return {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'Command to execute: create, get, update, delete, mark_step',
          required: true,
          enum: ['create', 'get', 'update', 'delete', 'mark_step'],
        },
        plan_id: {
          type: 'string',
          description: 'ID of the plan',
          required: false,
        },
        title: {
          type: 'string',
          description: 'Title of the plan',
          required: false,
        },
        goal: {
          type: 'string',
          description: 'Goal to achieve with the plan',
          required: false,
        },
        steps: {
          type: 'array',
          description: 'List of step descriptions',
          required: false,
          items: {
            type: 'string',
            description: 'Step description',
          },
        },
        step_index: {
          type: 'number',
          description: 'Index of the step to update',
          required: false,
        },
        step_status: {
          type: 'string',
          description: 'Status to set for the step',
          required: false,
          enum: ['not_started', 'in_progress', 'completed', 'blocked'],
        },
        step_notes: {
          type: 'string',
          description: 'Notes for the step',
          required: false,
        },
      },
      required: ['command'],
    };
  }

  /**
   * Execute the planning tool
   */
  async execute(params: Record<string, any>): Promise<string> {
    if (!params.command) {
      return formatToolResult('Command parameter is required');
    }

    try {
      switch (params.command) {
        case 'create':
          return this.createPlan(params);
        case 'get':
          return this.getPlanById(params.plan_id);
        case 'update':
          return this.updatePlan(params);
        case 'mark_step':
          return this.markStep(params);
        case 'delete':
          return this.deletePlan(params.plan_id);
        default:
          return formatToolResult(`Unknown command: ${params.command}`);
      }
    } catch (error) {
      log.error(`Error in planning tool: ${(error as Error).message}`);
      return formatToolResult(`Failed to execute command: ${(error as Error).message}`);
    }
  }

  /**
   * Create a new plan
   */
  private createPlan(params: Record<string, any>): string {
    if (!params.plan_id) {
      params.plan_id = `plan_${Date.now()}`;
    }

    if (this.plans[params.plan_id]) {
      return formatToolResult(`Plan with ID ${params.plan_id} already exists`);
    }

    // Create plan steps
    const steps: PlanStep[] = [];
    if (params.steps && Array.isArray(params.steps)) {
      for (let i = 0; i < params.steps.length; i++) {
        steps.push({
          id: `step_${i}`,
          description: params.steps[i],
          status: PlanStepStatus.NOT_STARTED,
        });
      }
    }

    // Create the plan
    this.plans[params.plan_id] = {
      id: params.plan_id,
      title: params.title || 'Untitled Plan',
      goal: params.goal || '',
      steps,
      status: 'created',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    log.plan(`Created plan: ${params.plan_id} with ${steps.length} steps`);
    return formatToolResult(`Plan created with ID ${params.plan_id}`);
  }

  /**
   * Get a plan by ID
   */
  async getPlan(planId: string): Promise<Plan | null> {
    if (!planId || !this.plans[planId]) {
      return null;
    }
    return this.plans[planId];
  }

  /**
   * Get a plan's formatted text by ID
   */
  private getPlanById(planId: string): string {
    if (!planId || !this.plans[planId]) {
      return formatToolResult(`Plan with ID ${planId} not found`);
    }

    const plan = this.plans[planId];

    // Format the plan as text
    let result = `# ${plan.title}\n\n`;

    if (plan.goal) {
      result += `**Goal:** ${plan.goal}\n\n`;
    }

    result += '## Steps:\n\n';

    // Count steps by status
    const statusCounts: Record<string, number> = {
      [PlanStepStatus.NOT_STARTED]: 0,
      [PlanStepStatus.IN_PROGRESS]: 0,
      [PlanStepStatus.COMPLETED]: 0,
      [PlanStepStatus.BLOCKED]: 0,
    };

    // Status marks for each status
    const statusMarks: Record<string, string> = {
      [PlanStepStatus.NOT_STARTED]: '[ ]',
      [PlanStepStatus.IN_PROGRESS]: '[→]',
      [PlanStepStatus.COMPLETED]: '[✓]',
      [PlanStepStatus.BLOCKED]: '[!]',
    };

    // Calculate progress
    plan.steps.forEach(step => {
      statusCounts[step.status] = (statusCounts[step.status] || 0) + 1;
    });

    const completed = statusCounts[PlanStepStatus.COMPLETED] || 0;
    const total = plan.steps.length;
    const progress = total > 0 ? (completed / total) * 100 : 0;

    result += `Progress: ${completed}/${total} steps completed (${progress.toFixed(1)}%)\n\n`;

    // List steps with status
    plan.steps.forEach((step, index) => {
      const statusMark = statusMarks[step.status] || '[ ]';
      result += `${index + 1}. ${statusMark} ${step.description}\n`;

      if (step.notes) {
        result += `   Notes: ${step.notes}\n`;
      }

      result += '\n';
    });

    return result;
  }

  /**
   * Update an existing plan
   */
  private updatePlan(params: Record<string, any>): string {
    if (!params.plan_id || !this.plans[params.plan_id]) {
      return formatToolResult(`Plan with ID ${params.plan_id} not found`);
    }

    const plan = this.plans[params.plan_id];

    if (params.title) {
      plan.title = params.title;
    }

    if (params.goal) {
      plan.goal = params.goal;
    }

    if (params.status) {
      plan.status = params.status;
    }

    if (params.steps && Array.isArray(params.steps)) {
      plan.steps = params.steps.map((desc: string, i: number) => ({
        id: `step_${i}`,
        description: desc,
        status: i < plan.steps.length ? plan.steps[i].status : PlanStepStatus.NOT_STARTED,
        notes: i < plan.steps.length ? plan.steps[i].notes : undefined,
      }));
    }

    plan.updatedAt = new Date();

    log.plan(`Updated plan: ${params.plan_id}`);
    return formatToolResult(`Plan ${params.plan_id} updated successfully`);
  }

  /**
   * Update the status of a step in a plan
   */
  private markStep(params: Record<string, any>): string {
    if (!params.plan_id || !this.plans[params.plan_id]) {
      return formatToolResult(`Plan with ID ${params.plan_id} not found`);
    }

    if (params.step_index === undefined || params.step_index === null) {
      return formatToolResult('Step index is required');
    }

    if (!params.step_status) {
      return formatToolResult('Step status is required');
    }

    const plan = this.plans[params.plan_id];
    const stepIndex = Number(params.step_index);

    if (stepIndex < 0 || stepIndex >= plan.steps.length) {
      return formatToolResult(`Invalid step index: ${stepIndex}`);
    }

    // Update step status
    plan.steps[stepIndex].status = params.step_status;

    // Add notes if provided
    if (params.step_notes) {
      plan.steps[stepIndex].notes = params.step_notes;
    }

    plan.updatedAt = new Date();

    // If all steps are completed, mark plan as completed
    const allCompleted = plan.steps.every(step => step.status === PlanStepStatus.COMPLETED);
    if (allCompleted) {
      plan.status = 'completed';
    } else if (plan.status !== 'failed') {
      plan.status = 'in_progress';
    }

    log.plan(`Marked step ${stepIndex} as ${params.step_status} in plan ${params.plan_id}`);
    return formatToolResult(`Step ${stepIndex} marked as ${params.step_status}`);
  }

  /**
   * Delete a plan
   */
  private deletePlan(planId: string): string {
    if (!planId || !this.plans[planId]) {
      return formatToolResult(`Plan with ID ${planId} not found`);
    }

    delete this.plans[planId];
    log.plan(`Deleted plan: ${planId}`);
    return formatToolResult(`Plan ${planId} deleted successfully`);
  }
}

export default PlanningTool;
