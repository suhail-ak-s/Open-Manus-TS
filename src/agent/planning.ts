import { BaseAgent } from './base';
import { BaseAgentOptions } from '../types';
import { AgentState, AgentStateData, Memory, ChatMessage } from '../schema';
import { logger } from '../logging';
import log from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

/**
 * Interface for Plan structure
 */
interface Plan {
  goal: string;
  tasks: PlanTask[];
  status: 'created' | 'in_progress' | 'completed' | 'failed';
}

/**
 * Interface for Plan Task
 */
interface PlanTask {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  result?: string;
  dependsOn?: string[];
}

/**
 * System prompt for planning
 */
const PLANNING_SYSTEM_PROMPT = `
You are an AI planning assistant that helps users break down complex tasks into manageable steps.
For each task, you should:
1. Analyze and understand the overall goal
2. Break down the task into logical sub-tasks
3. Identify dependencies between sub-tasks
4. Prioritize sub-tasks based on importance and dependencies
5. Provide clear, executable steps for each sub-task

Always think step-by-step and be precise in your instructions.
`;

/**
 * Next step prompt for planning
 */
const PLANNING_NEXT_STEP_PROMPT = `
Let's create a detailed plan for this task.
Break it down into smaller sub-tasks, and for each sub-task:
1. Provide a clear title
2. List the specific steps needed
3. Note any dependencies on other sub-tasks
4. Estimate complexity (low/medium/high)

Make sure the plan is comprehensive and actionable.
`;

/**
 * Planning agent for task decomposition and management
 */
export class PlanningAgent extends BaseAgent {
  private plan: Plan | null = null;

  /**
   * Create a new Planning Agent
   * @param options Agent options
   */
  constructor(options: BaseAgentOptions = {}) {
    const defaultSystemPrompt = `You are a planning agent that breaks down complex tasks into manageable subtasks.
When given a goal, develop a plan with clearly defined subtasks that build towards the ultimate goal.
For each subtask:
1. Provide a clear description of what needs to be done
2. Identify any dependencies on other subtasks
3. Ensure the sequence is logical and builds towards the goal

Your output should be a well-structured plan that can be followed step by step.`;

    super({
      name: options.name || 'PlanningAgent',
      description: options.description,
      systemPrompt: options.systemPrompt || defaultSystemPrompt,
      memory: options.memory ? new Memory() : undefined,
      maxSteps: options.maxSteps,
    });

    logger.debug('PlanningAgent initialized');
  }

  /**
   * Abstract method that must be implemented to fulfill BaseAgent requirements
   */
  async step(): Promise<string> {
    // Implement step method for planning
    return 'Planning step completed';
  }

  /**
   * Process the user query by creating and executing a plan
   * @param query User query/goal
   * @returns Result of processing
   */
  async run(query: string): Promise<string> {
    if (this.state !== AgentState.IDLE) {
      // Reset state if needed
      this.memory.clear();
      this.state = AgentState.IDLE;
    }

    this.state = AgentState.RUNNING;
    const runId = uuidv4();

    logger.info(`Starting PlanningAgent run ${runId} with goal: ${query}`);

    // Add the user query to the conversation
    this.memory.addMessage(Memory.userMessage(query));

    try {
      // Generate a plan for the goal
      this.plan = await this.createPlan(query);

      logger.info(`Plan created with ${this.plan.tasks.length} tasks`);

      // Format and return the plan
      const formattedPlan = this.formatPlan(this.plan);

      // Set state to completed
      this.state = AgentState.FINISHED;

      logger.info(`PlanningAgent run ${runId} completed successfully`);
      return formattedPlan;
    } catch (error) {
      this.state = AgentState.ERROR;
      logger.error(`PlanningAgent run failed: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Create a plan for the given goal
   * @param goal The goal to create a plan for
   * @returns Created plan
   */
  private async createPlan(goal: string): Promise<Plan> {
    const planningPrompt = `
Goal: ${goal}

Create a comprehensive plan to achieve this goal. Break it down into subtasks and specify dependencies where appropriate.
For each task, provide:
1. A clear description
2. Any dependencies on other tasks (by task number)

Format your response as a numbered list of tasks, with dependencies noted in parentheses.
`;

    // Add the planning prompt to the conversation
    this.memory.addMessage(Memory.userMessage(planningPrompt));

    // Log plan creation
    log.plan(`Creating plan for goal: ${goal}`);

    // Make the LLM request for plan creation
    const result = await this.llm.ask(this.memory.messages);
    const planText = result || '';

    // Add the plan to the conversation history
    this.memory.addMessage(Memory.assistantMessage(planText));

    // Log the generated plan
    log.plan(`Plan generated: \n${planText}`);

    // Parse the plan text into a structured plan
    return this.parsePlanFromText(goal, planText);
  }

  /**
   * Parse plan text into a structured plan
   * @param goal The main goal
   * @param planText Text of the plan from the LLM
   * @returns Structured plan
   */
  private parsePlanFromText(goal: string, planText: string): Plan {
    const tasks: PlanTask[] = [];

    // Regular expression to match tasks in format: 1. Description (depends on: 2, 3)
    const taskRegex = /(\d+)\.?\s+([^(]+)(?:\s*\((?:depends on|references|after):?\s*([^)]+)\))?/gi;

    let match;
    while ((match = taskRegex.exec(planText)) !== null) {
      const taskId = match[1];
      const description = match[2].trim();
      const dependencies = match[3] ? match[3].split(/,\s*/).map(dep => dep.trim()) : [];

      tasks.push({
        id: taskId,
        description,
        status: 'pending',
        dependsOn: dependencies.length > 0 ? dependencies : undefined,
      });
    }

    // If no tasks were parsed with the regex, try to split by lines and numbers
    if (tasks.length === 0) {
      const lines = planText
        .split('\n')
        .filter(line => line.trim().length > 0)
        .filter(line => /^\d+\./.test(line.trim()));

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const taskId = (i + 1).toString();
        const description = line.replace(/^\d+\.\s*/, '');

        tasks.push({
          id: taskId,
          description,
          status: 'pending',
        });
      }
    }

    return {
      goal,
      tasks,
      status: 'created',
    };
  }

  /**
   * Format the plan into a readable string
   * @param plan Plan to format
   * @returns Formatted plan string
   */
  private formatPlan(plan: Plan): string {
    let result = `# Plan for: ${plan.goal}\n\n`;

    for (const task of plan.tasks) {
      result += `${task.id}. ${task.description}\n`;

      if (task.dependsOn && task.dependsOn.length > 0) {
        result += `   Depends on: ${task.dependsOn.join(', ')}\n`;
      }

      result += `   Status: ${task.status}\n\n`;
    }

    return result;
  }

  /**
   * Get the current plan
   * @returns Current plan or null if no plan exists
   */
  getPlan(): Plan | null {
    return this.plan;
  }

  /**
   * Reset the agent state and clear the plan
   */
  reset(): void {
    this.memory.clear();
    this.state = AgentState.IDLE;
    this.currentStep = 0;
    this.plan = null;
  }

  /**
   * Process the agent state (implementation of abstract method)
   */
  protected async processState(state: AgentStateData): Promise<AgentStateData> {
    logger.debug('PlanningAgent processing state');

    try {
      // Find the last user message
      const lastUserMessage = state.messages.find((m: ChatMessage) => m.role === 'user');
      if (!lastUserMessage) {
        throw new Error('No user message found');
      }

      // Generate a plan based on the user message
      const result = await this.run(lastUserMessage.content);

      // Add the plan as an assistant message
      state.messages.push({
        role: 'assistant',
        content: result,
      });

      return state;
    } catch (error) {
      logger.error(`Error in PlanningAgent processing: ${(error as Error).message}`);
      state.error = error as Error;
      return state;
    }
  }
}

export default PlanningAgent;
