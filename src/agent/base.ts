import { AgentState, AgentStateData, Memory, Message, RoleType } from '../schema';
import { LLM } from '../llm';
import log from '../utils/logger';

/**
 * Abstract base class for all agents in the OpenManus framework.
 *
 * The BaseAgent provides the foundational functionality for:
 * - State management and transitions
 * - Memory management for conversation history
 * - Common agent lifecycle operations
 * - Execution control with step tracking and limits
 * - Stuck detection and recovery
 *
 * All agent subclasses should extend this class and implement
 * the abstract methods to define their specific behavior.
 *
 * @example
 * ```typescript
 * class MyCustomAgent extends BaseAgent {
 *   constructor() {
 *     super({
 *       name: 'my-agent',
 *       description: 'A custom agent for specific tasks',
 *       systemPrompt: 'You are a helpful assistant',
 *       maxSteps: 5
 *     });
 *   }
 *
 *   async step(): Promise<string> {
 *     // Custom implementation
 *     return "Step completed";
 *   }
 *
 *   protected async processState(state: AgentStateData): Promise<AgentStateData> {
 *     // Custom state processing logic
 *     return state;
 *   }
 * }
 * ```
 */
export abstract class BaseAgent {
  /** Unique name of the agent */
  name: string;

  /** Optional description of the agent's purpose and capabilities */
  description?: string;

  /** System-level instruction prompt for the agent */
  systemPrompt?: string;

  /** Prompt used to determine the next action */
  nextStepPrompt?: string;

  /** Language model instance used for reasoning */
  llm: LLM;

  /** Memory store for the agent's conversation history */
  memory: Memory;

  /** Current execution state of the agent */
  state: AgentState;

  /** Maximum number of steps before automatic termination */
  maxSteps: number;

  /** Current step counter during execution */
  currentStep: number;

  /** Threshold for detecting duplicate responses/stuck states */
  duplicateThreshold: number;

  /**
   * Create a new agent with the specified configuration
   *
   * @param options - Configuration options for the agent
   * @param options.name - Unique name of the agent
   * @param options.description - Optional description of the agent's purpose
   * @param options.systemPrompt - System-level instruction prompt
   * @param options.nextStepPrompt - Prompt for determining next actions
   * @param options.llm - Language model instance (defaults to new LLM)
   * @param options.memory - Memory instance (defaults to new Memory)
   * @param options.maxSteps - Maximum execution steps (defaults to 10)
   */
  constructor({
    name,
    description,
    systemPrompt,
    nextStepPrompt,
    llm,
    memory,
    maxSteps = 10,
  }: {
    name: string;
    description?: string;
    systemPrompt?: string;
    nextStepPrompt?: string;
    llm?: LLM;
    memory?: Memory;
    maxSteps?: number;
  }) {
    this.name = name;
    this.description = description;
    this.systemPrompt = systemPrompt;
    this.nextStepPrompt = nextStepPrompt;
    this.llm = llm || new LLM();
    this.memory = memory || new Memory();
    this.state = AgentState.IDLE;
    this.maxSteps = maxSteps;
    this.currentStep = 0;
    this.duplicateThreshold = 2;
  }

  /**
   * Safely transition to a new state and execute code in that state
   * This acts as a context manager for state transitions to ensure proper state management.
   *
   * @param newState - The state to transition to during execution
   * @param callback - Async function to execute within the new state
   * @returns Promise resolving to the callback result
   * @throws Error if the state is invalid or if the callback throws
   *
   * @example
   * ```typescript
   * await agent.withState(AgentState.RUNNING, async () => {
   *   // Code to execute in RUNNING state
   *   return "Operation complete";
   * });
   * ```
   */
  async withState<T>(newState: AgentState, callback: () => Promise<T>): Promise<T> {
    if (typeof newState !== 'string' || !Object.values(AgentState).includes(newState)) {
      throw new Error(`Invalid state: ${newState}`);
    }

    const previousState = this.state;
    this.state = newState;

    try {
      return await callback();
    } catch (error) {
      this.state = AgentState.ERROR;
      throw error;
    } finally {
      this.state = previousState;
    }
  }

  /**
   * Add a message to the agent's memory
   *
   * @param role - The role of the message sender (user, system, assistant, tool)
   * @param content - The message content
   * @param base64_image - Optional base64 encoded image
   * @param options - Additional options (e.g., tool_call_id for tool messages)
   * @throws Error if the role is unsupported or required parameters are missing
   *
   * @example
   * ```typescript
   * // Add a user message
   * agent.updateMemory('user', 'Hello, can you help me?');
   *
   * // Add a tool result
   * agent.updateMemory('tool', 'Search completed', undefined, {
   *   tool_call_id: 'call_123',
   *   name: 'search'
   * });
   * ```
   */
  updateMemory(
    role: RoleType,
    content: string,
    base64_image?: string,
    options: Record<string, any> = {}
  ): void {
    let message: Message;

    switch (role) {
      case 'user':
        message = Memory.userMessage(content, base64_image);
        break;
      case 'system':
        message = Memory.systemMessage(content);
        break;
      case 'assistant':
        message = Memory.assistantMessage(content);
        break;
      case 'tool':
        if (!options.tool_call_id) {
          throw new Error('Tool call ID is required for tool messages');
        }
        message = Memory.toolMessage(content, options.tool_call_id, options.name, base64_image);
        break;
      default:
        throw new Error(`Unsupported message role: ${role}`);
    }

    this.memory.addMessage(message);
  }

  /**
   * Execute the agent's main loop to process a request
   *
   * This is the primary entry point for using an agent. It accepts an optional
   * initial request, runs the agent through its step-based execution loop
   * until completion, and returns the execution results.
   *
   * @param request - Optional initial user request to process
   * @returns Promise resolving to a string summarizing the execution results
   * @throws Error if the agent cannot be run from its current state
   *
   * @example
   * ```typescript
   * const agent = new MyAgent();
   * const result = await agent.run("Please help me analyze this data");
   * console.log(result);
   * ```
   */
  async run(request?: string): Promise<string> {
    if (this.state !== AgentState.IDLE) {
      throw new Error(`Cannot run agent from state: ${this.state}`);
    }

    if (request) {
      this.updateMemory('user', request);
    }

    const results: string[] = [];

    try {
      await this.withState(AgentState.RUNNING, async () => {
        while (this.currentStep < this.maxSteps && this.state !== AgentState.FINISHED) {
          this.currentStep++;
          log.step(this.currentStep, this.maxSteps, `Executing step`);

          const stepResult = await this.step();

          // Check for stuck state
          if (this.isStuck()) {
            this.handleStuckState();
          }

          results.push(`Step ${this.currentStep}: ${stepResult}`);
        }

        if (this.currentStep >= this.maxSteps) {
          this.currentStep = 0;
          this.state = AgentState.IDLE;
          results.push(`Terminated: Reached max steps (${this.maxSteps})`);
        }
      });
    } catch (error) {
      const errorMessage = `Error during execution: ${(error as Error).message}`;
      log.error(errorMessage);
      results.push(errorMessage);
    }

    return results.join('\n') || 'No steps executed';
  }

  /**
   * Execute a single step in the agent's workflow
   *
   * This abstract method must be implemented by subclasses to define
   * their specific step behavior. Each step typically involves the agent
   * reasoning about its current state and taking appropriate actions.
   *
   * @returns Promise resolving to a string describing the step result
   */
  abstract step(): Promise<string>;

  /**
   * Handle stuck state by adding a prompt to change strategy
   *
   * This is called when the agent detects that it's stuck in a loop,
   * repeating the same actions or responses. It modifies the next step
   * prompt to encourage the agent to try different approaches.
   */
  handleStuckState(): void {
    const stuckPrompt =
      'Observed duplicate responses. Consider new strategies and avoid repeating ineffective paths already attempted.';
    this.nextStepPrompt = `${stuckPrompt}\n${this.nextStepPrompt}`;
    log.warning(`Agent detected stuck state. Added prompt: ${stuckPrompt}`);
  }

  /**
   * Check if the agent is stuck in a loop by detecting duplicate content
   *
   * @returns Boolean indicating whether the agent is stuck
   */
  isStuck(): boolean {
    if (this.memory.messages.length < 2) {
      return false;
    }

    const lastMessage = this.memory.messages[this.memory.messages.length - 1];
    if (!lastMessage.content) {
      return false;
    }

    // Count identical content occurrences
    let duplicateCount = 0;
    for (let i = this.memory.messages.length - 2; i >= 0; i--) {
      const msg = this.memory.messages[i];
      if (msg.role === 'assistant' && msg.content === lastMessage.content) {
        duplicateCount++;
      }
    }

    return duplicateCount >= this.duplicateThreshold;
  }

  /**
   * Process an agent state and return the updated state
   * This method is used for state-based processing when integrating with external systems.
   *
   * @param state - The current agent state to process
   * @returns Promise resolving to the updated agent state
   */
  async process(state: AgentStateData): Promise<AgentStateData> {
    log.info(`${this.name} processing state at step ${state.step}`);

    try {
      // Implement default processing logic
      const result = await this.processState(state);
      return result;
    } catch (error) {
      log.error(`Error in agent processing: ${(error as Error).message}`);
      state.error = error as Error;
      return state;
    }
  }

  /**
   * Process the agent state
   * This abstract method must be implemented by subclasses to define
   * their specific state processing behavior.
   *
   * @param state - The current agent state
   * @returns Promise resolving to the updated agent state
   */
  protected abstract processState(state: AgentStateData): Promise<AgentStateData>;
}

export default BaseAgent;
