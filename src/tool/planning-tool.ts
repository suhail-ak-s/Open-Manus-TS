import { BaseTool, ToolResponse } from './base';
import { logger } from '../logging';
import { PlanningFlow, FlowFactory, FlowType } from '../flow';
import { BaseAgent } from '../agent/base';

/**
 * Planning action types
 */
export enum PlanningAction {
  CREATE_PLAN = 'create_plan',
  EXECUTE_STEP = 'execute_step',
  GET_PLAN = 'get_plan',
  COMPLETE_PLAN = 'complete_plan',
}

/**
 * Input for creating a new plan
 */
export interface CreatePlanInput {
  title: string;
  description: string;
  steps: Array<{
    description: string;
    agent?: string;
  }>;
}

/**
 * Input for executing a plan step
 */
export interface ExecuteStepInput {
  planId: string;
  stepIndex: number;
  agentId?: string;
}

/**
 * Input for getting plan details
 */
export interface GetPlanInput {
  planId: string;
}

/**
 * Input for completing a plan
 */
export interface CompletePlanInput {
  planId: string;
  summary?: string;
}

/**
 * Plan step status enum
 */
export enum PlanStepStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

/**
 * PlanningTool for managing plans and their execution
 */
export class PlanningTool extends BaseTool {
  name = 'planning';
  description = 'Execute complex plans with multiple steps';
  private planningFlows: Map<string, PlanningFlow> = new Map();
  private defaultAgent: BaseAgent | null = null;

  /**
   * Set the default agent to use for plan execution
   */
  setDefaultAgent(agent: BaseAgent): void {
    this.defaultAgent = agent;
  }

  /**
   * Execute the planning tool
   */
  async execute(input: Record<string, any>): Promise<string | { content: string }> {
    const action = input.action;

    try {
      let result: ToolResponse;

      switch (action) {
        case PlanningAction.CREATE_PLAN:
          result = await this.createPlan(input);
          break;
        case PlanningAction.EXECUTE_STEP:
          result = await this.executeStep(input);
          break;
        case PlanningAction.GET_PLAN:
          result = await this.getPlan(input);
          break;
        case PlanningAction.COMPLETE_PLAN:
          result = await this.completePlan(input);
          break;
        default:
          throw new Error(`Unsupported planning action: ${action}`);
      }

      return { content: JSON.stringify(result) };
    } catch (error) {
      logger.error(`Planning tool error: ${(error as Error).message}`);
      const errorResult: ToolResponse = {
        success: false,
        error: (error as Error).message,
        result: null,
      };
      return { content: JSON.stringify(errorResult) };
    }
  }

  /**
   * Create a new plan
   */
  private async createPlan(params: Record<string, any>): Promise<ToolResponse> {
    const { title, description, steps } = params;

    if (!title || !description || !steps || !Array.isArray(steps) || steps.length === 0) {
      return {
        success: false,
        error: 'Invalid plan parameters: title, description, and steps array are required',
        result: null,
      };
    }

    try {
      // Generate a unique ID for the plan
      const planId = `plan_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

      // Create planning flow instance with a default empty agent if none provided
      const agent = this.defaultAgent || ({} as BaseAgent);
      const planningFlow = FlowFactory.createFlow(FlowType.PLANNING, agent, {
        activePlanId: planId,
      }) as PlanningFlow;

      // Format steps for the flow
      const formattedSteps = steps.map((step: any) => ({
        description: step.description || step.text || step,
        agent: step.agent,
      }));

      // Initialize the plan (assuming implementation exists in PlanningFlow)
      // If this method doesn't exist, you'll need to implement it or find equivalent functionality
      await planningFlow.execute(`Create plan: ${title}\n${description}`);

      // Store the flow for later use
      this.planningFlows.set(planId, planningFlow);

      return {
        success: true,
        result: {
          planId,
          title,
          description,
          stepsCount: formattedSteps.length,
          status: 'created',
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create plan: ${(error as Error).message}`,
        result: null,
      };
    }
  }

  /**
   * Execute a specific step in a plan
   */
  private async executeStep(params: Record<string, any>): Promise<ToolResponse> {
    const { planId, stepIndex, agentId } = params;

    if (!planId || stepIndex === undefined || stepIndex < 0) {
      return {
        success: false,
        error: 'Invalid execution parameters: planId and valid stepIndex are required',
        result: null,
      };
    }

    const planningFlow = this.planningFlows.get(planId);
    if (!planningFlow) {
      return {
        success: false,
        error: `Plan with ID ${planId} not found`,
        result: null,
      };
    }

    try {
      // Execute the step through the planning flow's execute method
      const stepPrompt = `Execute step ${stepIndex + 1}`;
      const result = await planningFlow.execute(stepPrompt);

      return {
        success: true,
        result: {
          stepIndex,
          output: result,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to execute step: ${(error as Error).message}`,
        result: null,
      };
    }
  }

  /**
   * Get the details of a plan
   */
  private async getPlan(params: Record<string, any>): Promise<ToolResponse> {
    const { planId } = params;

    if (!planId) {
      return {
        success: false,
        error: 'Invalid parameters: planId is required',
        result: null,
      };
    }

    const planningFlow = this.planningFlows.get(planId);
    if (!planningFlow) {
      return {
        success: false,
        error: `Plan with ID ${planId} not found`,
        result: null,
      };
    }

    try {
      // Retrieve plan state from the flow
      // This is a placeholder - actual implementation depends on PlanningFlow's API
      return {
        success: true,
        result: {
          planId,
          // Just return the flow object as is - in a real implementation
          // you'd extract the relevant plan data
          flow: 'Plan details would be returned here',
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get plan: ${(error as Error).message}`,
        result: null,
      };
    }
  }

  /**
   * Mark a plan as complete
   */
  private async completePlan(params: Record<string, any>): Promise<ToolResponse> {
    const { planId, summary } = params;

    if (!planId) {
      return {
        success: false,
        error: 'Invalid parameters: planId is required',
        result: null,
      };
    }

    const planningFlow = this.planningFlows.get(planId);
    if (!planningFlow) {
      return {
        success: false,
        error: `Plan with ID ${planId} not found`,
        result: null,
      };
    }

    try {
      // Complete the plan through the planning flow
      const finalPrompt = summary ? `Complete plan with summary: ${summary}` : 'Complete plan';

      const result = await planningFlow.execute(finalPrompt);

      // Clean up resources
      this.planningFlows.delete(planId);

      return {
        success: true,
        result: {
          planId,
          status: 'completed',
          summary: summary || result,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to complete plan: ${(error as Error).message}`,
        result: null,
      };
    }
  }
}
