import { AgentState, Memory, Message } from '../schema';
import log from '../utils/logger';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

// Define memory event types
export enum MemoryEventType {
  INITIALIZE = 'initialize',
  AGENT_STATE_UPDATED = 'agent_state_updated',
  MESSAGE_ADDED = 'message_added',
  PLAN_UPDATED = 'plan_updated',
  PLAN_STEP_UPDATED = 'plan_step_updated',
  AGENT_DATA_CLEARED = 'agent_data_cleared'
}

// Interface for memory deltas
export interface MemoryDelta {
  type: MemoryEventType;
  agentId?: string; // The agent that made the change
  data: any; // The specific data that changed
  timestamp: number;
}

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

  // Event emitter for memory changes
  private eventEmitter: EventEmitter = new EventEmitter();

  // Event handler function that can be set by the parent system
  public eventHandler?: (event: any) => void;

  // File logging configuration
  private enableFileLogging: boolean = false;
  private logFilePath: string = '';
  private sessionId: string = '';

  /**
   * Create a new shared memory instance
   */
  constructor(options: { enableFileLogging?: boolean, logFilePath?: string, sessionId?: string } = {}) {
    super();
    
    // Initialize file logging if enabled
    this.enableFileLogging = options.enableFileLogging || false;
    this.logFilePath = options.logFilePath || path.join(process.cwd(), 'memory-logs');
    this.sessionId = options.sessionId || `session_${Date.now()}`;
    
    if (this.enableFileLogging) {
      this.initializeFileLogging();
    }
    
    log.info('Shared memory system initialized');
  }

  /**
   * Initialize file logging directory
   */
  private initializeFileLogging(): void {
    try {
      // Create logs directory if it doesn't exist
      if (!fs.existsSync(this.logFilePath)) {
        fs.mkdirSync(this.logFilePath, { recursive: true });
        log.info(`Created memory logs directory at ${this.logFilePath}`);
      }
      
      // Create session-specific directory
      const sessionDir = path.join(this.logFilePath, this.sessionId);
      if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
      }
      
      // Create an initial metadata file with session info
      const metadataPath = path.join(sessionDir, 'session-info.json');
      const metadata = {
        sessionId: this.sessionId,
        startTime: new Date().toISOString(),
        systemInfo: {
          platform: process.platform,
          nodeVersion: process.version
        }
      };
      
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
      log.info(`Memory file logging enabled for session ${this.sessionId}`);
    } catch (error) {
      log.error(`Failed to initialize memory file logging: ${error instanceof Error ? error.message : String(error)}`);
      this.enableFileLogging = false; // Disable if initialization fails
    }
  }

  /**
   * Write a memory delta to file
   */
  private writeToFile(delta: MemoryDelta, event: any): void {
    if (!this.enableFileLogging) return;
    
    try {
      const sessionDir = path.join(this.logFilePath, this.sessionId);
      
      // Create a timestamped filename for this update
      const timestamp = new Date().toISOString().replace(/:/g, '-');
      const filename = `memory_${delta.type}_${timestamp}.json`;
      const filePath = path.join(sessionDir, filename);
      
      // Prepare data to write
      const data = {
        deltaType: delta.type,
        timestamp: delta.timestamp,
        agentId: delta.agentId || 'system',
        data: delta.data,
        fullEvent: event
      };
      
      // Write to file
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      
      // Update memory snapshot file
      this.updateMemorySnapshot(sessionDir);
      
      log.debug(`Wrote memory delta to ${filePath}`);
    } catch (error) {
      log.error(`Failed to write memory delta to file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Update the current memory snapshot file
   */
  private updateMemorySnapshot(sessionDir: string): void {
    try {
      const snapshotPath = path.join(sessionDir, 'current_memory_state.json');
      
      // Prepare snapshot data
      const snapshot = {
        timestamp: new Date().toISOString(),
        agentStates: this.getAgentStates(),
        messages: this.messages,
        messageContributors: Object.fromEntries(this.messageContributors),
        plans: Array.from(this.plans.entries()).reduce((obj, [key, value]) => {
          obj[key] = value;
          return obj;
        }, {} as Record<string, string[]>)
      };
      
      // Write snapshot
      fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
    } catch (error) {
      log.error(`Failed to update memory snapshot: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Enable or disable file logging
   */
  setFileLogging(enable: boolean, options?: { logFilePath?: string, sessionId?: string }): void {
    // If enabling and it wasn't enabled before
    if (enable && !this.enableFileLogging) {
      if (options?.logFilePath) {
        this.logFilePath = options.logFilePath;
      }
      
      if (options?.sessionId) {
        this.sessionId = options.sessionId;
      }
      
      this.enableFileLogging = true;
      this.initializeFileLogging();
    } else {
      // Just update the enabled state
      this.enableFileLogging = enable;
    }
    
    log.info(`Memory file logging ${this.enableFileLogging ? 'enabled' : 'disabled'}`);
  }

  /**
   * Set the event handler function
   */
  setEventHandler(handler: (event: any) => void): void {
    this.eventHandler = handler;
    log.info('Event handler set for shared memory');
  }

  /**
   * Emit a memory delta event
   */
  private emitDelta(delta: MemoryDelta): void {
    if (this.eventHandler) {
      try {
        const event = {
          type: 'memory_update',
          agent: delta.agentId || 'system',
          state: delta.agentId ? this.getAgentState(delta.agentId) : AgentState.IDLE,
          message: `Memory updated: ${delta.type}`,
          details: {
            type: delta.type,
            delta: delta.data,
            accessor: delta.agentId || 'system',
            timestamp: delta.timestamp,
          },
        };
        
        // Write to file before emitting the event
        this.writeToFile(delta, event);
        
        // Emit event
        this.eventHandler(event);
      } catch (error) {
        log.error(`Error emitting memory delta: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else if (this.enableFileLogging) {
      // If no event handler but file logging is enabled, still write to file
      const event = {
        type: 'memory_update',
        agent: delta.agentId || 'system',
        state: delta.agentId ? this.getAgentState(delta.agentId) : AgentState.IDLE,
        message: `Memory updated: ${delta.type}`,
        details: {
          type: delta.type,
          delta: delta.data,
          accessor: delta.agentId || 'system',
          timestamp: delta.timestamp,
        },
      };
      
      this.writeToFile(delta, event);
    }
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

    // Emit delta event for agent registration
    this.emitDelta({
      type: MemoryEventType.INITIALIZE,
      agentId,
      data: {
        agentId,
        state: initialState,
        metadata
      },
      timestamp: Date.now()
    });
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

    // Emit delta event for state update
    this.emitDelta({
      type: MemoryEventType.AGENT_STATE_UPDATED,
      agentId,
      data: {
        agentId,
        state
      },
      timestamp: Date.now()
    });
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

    // Emit delta event for message addition
    this.emitDelta({
      type: MemoryEventType.MESSAGE_ADDED,
      agentId: contributorId,
      data: {
        messageIndex,
        message,
        contributorId
      },
      timestamp: Date.now()
    });
  }

  /**
   * Override the parent addMessage method to track contributor as system if not specified
   */
  addMessage(message: Message): void {
    this.addMessageWithContributor(message, 'system');
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
   * @param contributorId ID of the agent that contributed this plan
   */
  storePlan(taskId: string, steps: string[], contributorId: string = 'planning'): void {
    this.plans.set(taskId, steps);
    log.info(`Plan for task ${taskId} stored with ${steps.length} steps`);

    // Emit delta event for plan storage
    this.emitDelta({
      type: MemoryEventType.PLAN_UPDATED,
      agentId: contributorId,
      data: {
        taskId,
        steps,
        action: 'created'
      },
      timestamp: Date.now()
    });
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
   * @param contributorId ID of the agent updating the step
   */
  updatePlanStep(taskId: string, stepIndex: number, newStep: string, contributorId: string = 'planning'): void {
    const plan = this.plans.get(taskId);
    if (plan && stepIndex >= 0 && stepIndex < plan.length) {
      const oldStep = plan[stepIndex];
      plan[stepIndex] = newStep;
      this.plans.set(taskId, plan);
      log.info(`Updated step ${stepIndex} for task ${taskId}`);

      // Emit delta event for plan step update
      this.emitDelta({
        type: MemoryEventType.PLAN_STEP_UPDATED,
        agentId: contributorId,
        data: {
          taskId,
          stepIndex,
          oldStep,
          newStep
        },
        timestamp: Date.now()
      });
    }
  }

  /**
   * Clear all data for a specific agent
   *
   * @param agentId Agent identifier
   * @param contributorId ID of the agent requesting the clear
   */
  clearAgentData(agentId: string, contributorId: string = 'system'): void {
    // Store what we're about to delete for the delta event
    const stateBeforeDelete = this.agentStates.get(agentId);
    const metadataBeforeDelete = this.agentMetadata.get(agentId);
    
    // Find all message indices contributed by this agent
    const messageIndices: number[] = [];
    this.messageContributors.forEach((contributorId, index) => {
      if (contributorId === agentId) {
        messageIndices.push(index);
      }
    });

    // Remove agent's state and metadata
    this.agentStates.delete(agentId);
    this.agentMetadata.delete(agentId);

    // Remove the contributor records
    messageIndices.forEach(index => this.messageContributors.delete(index));

    log.info(`Cleared data for agent ${agentId}`);

    // Emit delta event for agent data clearing
    this.emitDelta({
      type: MemoryEventType.AGENT_DATA_CLEARED,
      agentId: contributorId,
      data: {
        targetAgentId: agentId,
        stateBeforeDelete,
        metadataBeforeDelete,
        messageIndicesRemoved: messageIndices
      },
      timestamp: Date.now()
    });
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

  /**
   * Get a snapshot of all current agents and their states
   * 
   * @returns Record of agent IDs to their current states
   */
  getAgentStates(): Record<string, AgentState> {
    const states: Record<string, AgentState> = {};
    this.agentStates.forEach((state, agentId) => {
      states[agentId] = state;
    });
    return states;
  }

  /**
   * Send a full initialization event with the current state of memory
   * 
   * @param accessorId ID of the agent requesting the snapshot
   */
  sendMemorySnapshot(accessorId: string = 'system'): void {
    if (!this.eventHandler) return;

    // Build the full state
    const agentStates = this.getAgentStates();
    const messageCount = this.messages.length;
    const planCount = this.plans.size;
    
    // Send a full initialization event
    this.emitDelta({
      type: MemoryEventType.INITIALIZE,
      agentId: accessorId,
      data: {
        agentStates,
        messageCount,
        planCount,
        messages: this.messages,
        messageContributors: Object.fromEntries(this.messageContributors),
      },
      timestamp: Date.now()
    });
  }
}

export default SharedMemory;
