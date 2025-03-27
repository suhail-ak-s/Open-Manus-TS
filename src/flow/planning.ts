import { BaseAgent } from '../agent/base';
import { BaseFlow } from './base';
import { LLM } from '../llm';
import { Memory, AgentState } from '../schema';
import log from '../utils/logger';
import { PlanningTool } from '../tool/planning';

/**
 * Enum for plan step status
 */
export enum PlanStepStatus {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  BLOCKED = 'blocked',
}

/**
 * Helper class for plan step status operations
 */
export class PlanStepStatusHelper {
  /**
   * Return a list of all possible step status values
   */
  static getAllStatuses(): string[] {
    return Object.values(PlanStepStatus);
  }

  /**
   * Return a list of values representing active statuses (not started or in progress)
   */
  static getActiveStatuses(): string[] {
    return [PlanStepStatus.NOT_STARTED, PlanStepStatus.IN_PROGRESS];
  }

  /**
   * Return a mapping of statuses to their marker symbols
   */
  static getStatusMarks(): Record<string, string> {
    return {
      [PlanStepStatus.COMPLETED]: '[✓]',
      [PlanStepStatus.IN_PROGRESS]: '[→]',
      [PlanStepStatus.BLOCKED]: '[!]',
      [PlanStepStatus.NOT_STARTED]: '[ ]',
    };
  }
}

/**
 * Interface for a plan step
 */
export interface PlanStep {
  id: string;
  description: string;
  status: string;
  dependsOn?: string[];
  type?: string;
  notes?: string;
}

/**
 * Interface for a plan
 */
export interface Plan {
  id: string;
  title: string;
  goal: string;
  steps: PlanStep[];
  status: 'created' | 'in_progress' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

/**
 * PlanningFlow manages the creation and execution of plans using agents
 */
export class PlanningFlow extends BaseFlow {
  private llm: LLM;
  private planningTool: PlanningTool;
  private executorKeys: string[];
  private activePlanId: string;
  private currentStepIndex: number | null = null;

  /**
   * Create a new planning flow
   * @param agents The agent(s) to use for execution
   * @param options Configuration options
   */
  constructor(
    agents: BaseAgent | BaseAgent[] | Record<string, BaseAgent>,
    options: {
      planId?: string;
      executors?: string[];
      llm?: LLM;
      planningTool?: PlanningTool;
    } = {}
  ) {
    super(agents);

    this.activePlanId = options.planId || `plan_${Date.now()}`;
    this.executorKeys = options.executors || Object.keys(this.agents);
    this.llm = options.llm || new LLM();
    this.planningTool = options.planningTool || new PlanningTool();

    // Set the default agent for the planning tool if it supports it
    if (this.primaryAgent && typeof this.planningTool.setDefaultAgent === 'function') {
      this.planningTool.setDefaultAgent(this.primaryAgent);
    }
  }

  /**
   * Get an appropriate executor agent for the current step
   * @param stepType Optional step type to match an agent
   */
  getExecutor(stepType?: string): BaseAgent {
    // If step type is provided and matches an agent key, use that agent
    if (stepType && stepType in this.agents) {
      return this.agents[stepType];
    }

    // Otherwise use the first available executor or fall back to primary agent
    for (const key of this.executorKeys) {
      if (key in this.agents) {
        return this.agents[key];
      }
    }

    // Fallback to primary agent
    return this.primaryAgent;
  }

  /**
   * Execute the planning flow with the given input
   * @param input The input text to process
   */
  async execute(input: string): Promise<string> {
    try {
      if (!this.primaryAgent) {
        throw new Error('No primary agent available');
      }

      log.plan(`=====================================`);
      log.plan(`STARTING PLANNING FLOW: ${input}`);
      log.plan(`=====================================`);

      // Create initial plan if input provided
      if (input) {
        await this.createInitialPlan(input);

        // Verify plan was created successfully
        // Note: We'll need to implement this check once we have the plan storage
      }

      let result = `🗓️ EXECUTING PLAN FOR: ${input}\n\n`;

      while (true) {
        // Get current step to execute
        const [stepIndex, stepInfo] = await this.getCurrentStepInfo();
        this.currentStepIndex = stepIndex;

        // Exit if no more steps or plan completed
        if (this.currentStepIndex === null) {
          result += await this.finalizePlan();
          break;
        }

        // Execute current step with appropriate agent
        const stepType = stepInfo?.type;
        const executor = this.getExecutor(stepType);

        // Log current step execution
        log.plan(
          `Executing step ${this.currentStepIndex + 1}: ${stepInfo?.text || 'Unknown step'}`
        );

        const stepResult = await this.executeStep(executor, stepInfo);
        result += `\n➡️ STEP ${this.currentStepIndex + 1}: ${stepInfo?.text || 'Unknown step'}\n`;
        result += stepResult + '\n';

        // Check if agent wants to terminate
        if (executor.state === AgentState.FINISHED) {
          break;
        }
      }

      log.plan(`=======================================`);
      log.plan(`PLANNING FLOW COMPLETED`);
      log.plan(`=======================================`);

      return result;
    } catch (error) {
      log.error(`Error in PlanningFlow: ${(error as Error).message}`);
      return `Execution failed: ${(error as Error).message}`;
    }
  }

  /**
   * Create an initial plan based on the request
   * @param request The user request
   */
  private async createInitialPlan(request: string): Promise<void> {
    log.plan(`Creating initial plan with ID: ${this.activePlanId}`);

    try {
      // Create a prompt specifically for planning
      const planPrompt = `
Create a detailed, step-by-step plan to accomplish this goal:
${request}

Your plan should:
1. Break the goal into logical sequential steps
2. Be specific about what actions to take at each step
3. Consider potential obstacles and include steps to address them
4. Include 3-7 steps (more for complex tasks)

Respond with ONLY a numbered list of steps, with each step starting with an action verb.
`;

      // Use the LLM to generate a better plan
      const planResult = await this.llm.ask([
        {
          role: 'system',
          content: 'You are a planning assistant that creates clear, actionable plans.',
        },
        { role: 'user', content: planPrompt },
      ]);

      // Extract steps from the plan result
      const steps = this.extractStepsFromText(planResult);

      if (steps.length === 0) {
        // Fallback to default steps if none were extracted
        log.warning(`Failed to extract steps from plan: ${planResult}`);

        // Create a plan using the planning tool with default steps
        await this.planningTool.execute({
          command: 'create',
          plan_id: this.activePlanId,
          title: `Plan for: ${request.slice(0, 50)}${request.length > 50 ? '...' : ''}`,
          goal: request,
          steps: [`Analyze request: ${request}`, 'Execute task', 'Verify results'],
        });
      } else {
        // Create a plan with the extracted steps
        await this.planningTool.execute({
          command: 'create',
          plan_id: this.activePlanId,
          title: `Plan for: ${request.slice(0, 50)}${request.length > 50 ? '...' : ''}`,
          goal: request,
          steps: steps,
        });
      }

      log.plan(`Plan created with ${steps.length || 3} steps`);
    } catch (error) {
      log.error(`Error creating plan: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Extract step descriptions from the planning text
   */
  private extractStepsFromText(text: string): string[] {
    const steps: string[] = [];

    // Look for numbered steps (1. Step description)
    const lines = text.split('\n');

    for (const line of lines) {
      // Match lines that start with a number followed by a period or colon
      const match = line.trim().match(/^\d+[\.\):](.+)/);
      if (match) {
        const step = match[1].trim();
        if (step) {
          steps.push(step);
        }
      }
    }

    return steps;
  }

  /**
   * Get current step info based on plan status
   * @returns Tuple of [stepIndex, stepInfo]
   */
  private async getCurrentStepInfo(): Promise<[number | null, any | null]> {
    try {
      // Get the current plan if getPlan is available
      const plan =
        typeof this.planningTool.getPlan === 'function'
          ? await this.planningTool.getPlan(this.activePlanId)
          : this.planningTool.plans?.[this.activePlanId];

      if (!plan) {
        log.error(`Plan with ID ${this.activePlanId} not found`);
        return [null, null];
      }

      // Find first non-completed step
      for (let i = 0; i < plan.steps.length; i++) {
        const step = plan.steps[i];

        if (
          step.status === PlanStepStatus.NOT_STARTED ||
          step.status === PlanStepStatus.IN_PROGRESS
        ) {
          // Extract step type/category if available
          const stepInfo: any = { text: step.description };

          // Try to extract step type from the text (e.g., [SEARCH] or [CODE])
          const typeMatch = step.description.match(/\[([A-Z_]+)\]/);
          if (typeMatch) {
            stepInfo.type = typeMatch[1].toLowerCase();
          }

          // Mark current step as in_progress
          try {
            await this.planningTool.execute({
              command: 'mark_step',
              plan_id: this.activePlanId,
              step_index: i,
              step_status: PlanStepStatus.IN_PROGRESS,
            });
          } catch (error) {
            log.warning(`Error marking step as in_progress: ${(error as Error).message}`);
          }

          return [i, stepInfo];
        }
      }

      // No active steps found
      return [null, null];
    } catch (error) {
      log.error(`Error getting current step info: ${(error as Error).message}`);
      return [null, null];
    }
  }

  /**
   * Execute a single step using the specified agent
   * @param agent The agent to use for execution
   * @param stepInfo Information about the step
   */
  private async executeStep(agent: BaseAgent, stepInfo: any): Promise<string> {
    try {
      // Create a prompt for the agent based on the step
      const stepPrompt = `Execute this step: ${stepInfo.text}
Your job is to complete this specific step in our overall plan.
Think carefully about what's needed and use the appropriate tools.
Once you've completed the task, provide a summary of what you've accomplished.`;

      // Reset the agent if needed
      if (agent.state !== AgentState.IDLE) {
        agent.memory = new Memory();
        agent.state = AgentState.IDLE;
        agent.currentStep = 0;
      }

      // Execute the step
      const result = await agent.run(stepPrompt);

      // Mark step as completed
      if (this.currentStepIndex !== null) {
        await this.markStepCompleted();
      }

      return result;
    } catch (error) {
      log.error(`Error executing step: ${(error as Error).message}`);
      return `Step execution failed: ${(error as Error).message}`;
    }
  }

  /**
   * Mark the current step as completed
   */
  private async markStepCompleted(): Promise<void> {
    if (this.currentStepIndex === null) {
      return;
    }

    try {
      // Mark the step as completed
      await this.planningTool.execute({
        command: 'mark_step',
        plan_id: this.activePlanId,
        step_index: this.currentStepIndex,
        step_status: PlanStepStatus.COMPLETED,
      });

      log.plan(`Marked step ${this.currentStepIndex} as completed in plan ${this.activePlanId}`);
    } catch (error) {
      log.warning(`Failed to update plan status: ${(error as Error).message}`);
    }
  }

  /**
   * Finalize the plan and provide a summary
   */
  private async finalizePlan(): Promise<string> {
    // Get the plan text
    const planText = await this.getPlanText();

    // Create a summary
    const summary = `Plan execution completed: ${this.activePlanId}\n\n${planText}`;

    return summary;
  }

  /**
   * Get the current plan as formatted text
   */
  private async getPlanText(): Promise<string> {
    try {
      const result = await this.planningTool.execute({
        command: 'get',
        plan_id: this.activePlanId,
      });

      return result;
    } catch (error) {
      log.error(`Error getting plan: ${(error as Error).message}`);
      return `Could not retrieve plan with ID ${this.activePlanId}`;
    }
  }
}
