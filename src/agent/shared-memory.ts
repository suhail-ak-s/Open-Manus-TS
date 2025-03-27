import { AgentState, Memory, Message } from '../schema';
import log from '../utils/logger';

/**
 * SharedMemory provides a centralized memory store for multiple agents to use.
 * It allows agents to share conversation history, state information, and
 * execution context across the multi-agent system.
 */
export class SharedMemory extends Memory {
  // Track states for different agents
  private agentStates: Map<string, AgentState> = new Map();

  // Track metadata for agents (like their roles/types)
  private agentMetadata: Map<string, Record<string, any>> = new Map();

  // Track which agent contributed which message
  private messageContributors: Map<number, string> = new Map();

  // Record execution plans (for the planning agent)
  private plans: Map<string, string[]> = new Map();

  /**
   * Create a new shared memory instance
   */
  constructor() {
    super();
    log.info('Shared memory system initialized');
  }

  /**
   * Register an agent with the shared memory system
   *
   * @param agentId Unique identifier for the agent
   * @param initialState Initial state for the agent
   * @param metadata Additional metadata about the agent
   */
  registerAgent(
    agentId: string,
    initialState: AgentState = AgentState.IDLE,
    metadata: Record<string, any> = {}
  ): void {
    this.agentStates.set(agentId, initialState);
    this.agentMetadata.set(agentId, metadata);
    log.info(`Agent ${agentId} registered with shared memory`);
  }

  /**
   * Update an agent's state in the shared memory
   *
   * @param agentId Agent identifier
   * @param state New state
   */
  updateAgentState(agentId: string, state: AgentState): void {
    this.agentStates.set(agentId, state);
    log.info(`Agent ${agentId} state updated to ${state}`);
  }

  /**
   * Get an agent's current state
   *
   * @param agentId Agent identifier
   * @returns The agent's current state
   */
  getAgentState(agentId: string): AgentState {
    return this.agentStates.get(agentId) || AgentState.IDLE;
  }

  /**
   * Add a message to memory with a reference to which agent contributed it
   *
   * @param message The message to add
   * @param contributorId ID of the agent that contributed this message
   */
  addMessageWithContributor(message: Message, contributorId: string): void {
    super.addMessage(message);
    // Store the index of the message in the array as the key
    const messageIndex = this.messages.length - 1;
    this.messageContributors.set(messageIndex, contributorId);
  }

  /**
   * Get all messages contributed by a specific agent
   *
   * @param agentId Agent identifier
   * @returns Array of messages contributed by the agent
   */
  getAgentMessages(agentId: string): Message[] {
    return this.messages.filter((_, index) => {
      return this.messageContributors.get(index) === agentId;
    });
  }

  /**
   * Store a plan for a given task
   *
   * @param taskId Identifier for the task
   * @param steps Array of plan steps
   */
  storePlan(taskId: string, steps: string[]): void {
    this.plans.set(taskId, steps);
    log.info(`Plan for task ${taskId} stored with ${steps.length} steps`);
  }

  /**
   * Get the plan for a specific task
   *
   * @param taskId Task identifier
   * @returns The plan steps or undefined if no plan exists
   */
  getPlan(taskId: string): string[] | undefined {
    return this.plans.get(taskId);
  }

  /**
   * Update a specific step in a plan
   *
   * @param taskId Task identifier
   * @param stepIndex Index of the step to update
   * @param newStep New step content
   */
  updatePlanStep(taskId: string, stepIndex: number, newStep: string): void {
    const plan = this.plans.get(taskId);
    if (plan && stepIndex >= 0 && stepIndex < plan.length) {
      plan[stepIndex] = newStep;
      this.plans.set(taskId, plan);
      log.info(`Updated step ${stepIndex} for task ${taskId}`);
    }
  }

  /**
   * Clear all data for a specific agent
   *
   * @param agentId Agent identifier
   */
  clearAgentData(agentId: string): void {
    // Remove agent's state and metadata
    this.agentStates.delete(agentId);
    this.agentMetadata.delete(agentId);

    // Find all message indices contributed by this agent
    const messageIndices: number[] = [];
    this.messageContributors.forEach((contributorId, index) => {
      if (contributorId === agentId) {
        messageIndices.push(index);
      }
    });

    // Remove the contributor records
    messageIndices.forEach(index => this.messageContributors.delete(index));

    log.info(`Cleared data for agent ${agentId}`);
  }

  /**
   * Get the agent that contributed a specific message
   *
   * @param messageIndex Index of the message in the messages array
   * @returns The agent ID that contributed the message, or undefined if not found
   */
  getMessageContributor(messageIndex: number): string | undefined {
    return this.messageContributors.get(messageIndex);
  }
}

export default SharedMemory;
