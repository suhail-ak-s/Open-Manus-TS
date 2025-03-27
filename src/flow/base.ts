import { BaseAgent } from '../agent/base';
import log from '../utils/logger';

/**
 * Base class for execution flows supporting multiple agents
 */
export abstract class BaseFlow {
  /**
   * Dictionary of agents by name/key
   */
  protected agents: Record<string, BaseAgent>;

  /**
   * Key of the primary agent
   */
  protected primaryAgentKey: string | null = null;

  /**
   * Create a new flow
   * @param agents Single agent, array of agents, or dictionary of agents
   */
  constructor(agents: BaseAgent | BaseAgent[] | Record<string, BaseAgent>) {
    // Handle different ways of providing agents
    if (agents instanceof BaseAgent) {
      this.agents = { default: agents };
    } else if (Array.isArray(agents)) {
      this.agents = {};
      agents.forEach((agent, index) => {
        this.agents[`agent_${index}`] = agent;
      });
    } else {
      this.agents = agents;
    }

    // If primary agent not specified, use first agent
    if (!this.primaryAgentKey && Object.keys(this.agents).length > 0) {
      this.primaryAgentKey = Object.keys(this.agents)[0];
    }

    log.info(`Initialized flow with ${Object.keys(this.agents).length} agents`);
  }

  /**
   * Get the primary agent for the flow
   */
  get primaryAgent(): BaseAgent {
    if (!this.primaryAgentKey || !(this.primaryAgentKey in this.agents)) {
      throw new Error('No primary agent available');
    }
    return this.agents[this.primaryAgentKey];
  }

  /**
   * Get a specific agent by key
   * @param key The key of the agent
   */
  getAgent(key: string): BaseAgent | null {
    return this.agents[key] || null;
  }

  /**
   * Add a new agent to the flow
   * @param key The key for the agent
   * @param agent The agent to add
   */
  addAgent(key: string, agent: BaseAgent): void {
    this.agents[key] = agent;
  }

  /**
   * Execute the flow with the given input
   * @param input The input text to process
   */
  abstract execute(input: string): Promise<string>;
}
