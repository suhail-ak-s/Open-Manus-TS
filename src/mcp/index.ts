import { logger } from '../logging';
import { BaseAgent } from '../agent/base';
import { ToolCollection } from '../tool';
import { AgentState, ChatMessage } from '../schema';

/**
 * Channel type for multi-processing
 */
export enum ChannelType {
  TEXT = 'text',
  IMAGE = 'image',
  AUDIO = 'audio',
  VIDEO = 'video',
  TOOL_OUTPUT = 'tool_output',
  BROWSER = 'browser',
  DOCUMENT = 'document',
}

/**
 * Channel input interface
 */
export interface ChannelInput {
  type: ChannelType;
  content: string;
  metadata?: Record<string, any>;
}

/**
 * Channel output result
 */
export interface ChannelOutput {
  type: ChannelType;
  content: string;
  raw?: any;
  metadata?: Record<string, any>;
}

/**
 * Multi-Channel Processor options
 */
export interface MCPOptions {
  toolCollection?: ToolCollection;
  agents?: Record<ChannelType, BaseAgent>;
  defaultAgent?: BaseAgent;
  context?: Record<string, any>;
}

/**
 * Multi-Channel Processor (MCP) class
 * Handles processing of multiple types of inputs through specialized agents
 */
export class MultiChannelProcessor {
  private toolCollection?: ToolCollection;
  private agents: Map<ChannelType, BaseAgent> = new Map();
  private defaultAgent?: BaseAgent;
  private context: Record<string, any> = {};

  /**
   * Create a new Multi-Channel Processor
   */
  constructor(options: MCPOptions = {}) {
    this.toolCollection = options.toolCollection;
    this.defaultAgent = options.defaultAgent;
    this.context = options.context || {};

    // Set up channel-specific agents if provided
    if (options.agents) {
      for (const [channel, agent] of Object.entries(options.agents)) {
        this.agents.set(channel as ChannelType, agent);
      }
    }
  }

  /**
   * Set an agent for a specific channel type
   */
  setAgent(channel: ChannelType, agent: BaseAgent): void {
    this.agents.set(channel, agent);
  }

  /**
   * Set the default agent for unassigned channels
   */
  setDefaultAgent(agent: BaseAgent): void {
    this.defaultAgent = agent;
  }

  /**
   * Set the tool collection for agents
   */
  setToolCollection(toolCollection: ToolCollection): void {
    this.toolCollection = toolCollection;
  }

  /**
   * Get the appropriate agent for a channel
   */
  private getAgentForChannel(channel: ChannelType): BaseAgent {
    // Get the channel-specific agent or fall back to default
    const agent = this.agents.get(channel) || this.defaultAgent;

    // Throw if no agent is available
    if (!agent) {
      throw new Error(`No agent available for channel type: ${channel}`);
    }

    return agent;
  }

  /**
   * Process a single channel input
   */
  async processChannel(input: ChannelInput): Promise<ChannelOutput> {
    try {
      logger.info(`Processing ${input.type} channel...`);

      // Get the appropriate agent for this channel
      const agent = this.getAgentForChannel(input.type);

      // Prepare the prompt based on channel type
      const prompt = this.prepareChannelPrompt(input);

      // Process with the agent
      const state: AgentState = {
        messages: [{ role: 'user', content: prompt }],
        tools: this.toolCollection?.tools || [],
        rawMessages: [],
        step: 0,
        error: null,
        data: {},
      };

      // Run the agent with the state
      const result = await agent.process(state);

      // Extract response
      const lastMessage = result.messages[result.messages.length - 1];
      const content = lastMessage?.content || '';

      return {
        type: input.type,
        content,
        raw: result,
        metadata: {
          ...input.metadata,
          processed: true,
          toolsUsed: result.tools?.map(t => t.name) || [],
        },
      };
    } catch (error) {
      logger.error(`Error processing ${input.type} channel: ${(error as Error).message}`);

      return {
        type: input.type,
        content: `Error processing ${input.type} channel: ${(error as Error).message}`,
        metadata: {
          ...input.metadata,
          error: (error as Error).message,
          processed: false,
        },
      };
    }
  }

  /**
   * Process multiple channel inputs in parallel
   */
  async processChannels(inputs: ChannelInput[]): Promise<Record<ChannelType, ChannelOutput>> {
    const results: Record<ChannelType, ChannelOutput> = {} as Record<ChannelType, ChannelOutput>;

    // Process all channels in parallel
    const processingPromises = inputs.map(input =>
      this.processChannel(input).then(output => {
        results[input.type] = output;
      })
    );

    // Wait for all channels to be processed
    await Promise.all(processingPromises);

    return results;
  }

  /**
   * Process multiple channels and generate a unified response
   */
  async processAndMerge(inputs: ChannelInput[]): Promise<string> {
    // Process all channels
    const channelResults = await this.processChannels(inputs);

    // Check if we have a text channel to use as base response
    if (channelResults[ChannelType.TEXT]) {
      return channelResults[ChannelType.TEXT].content;
    }

    // Otherwise, merge all responses
    let mergedResponse = '';

    for (const [type, output] of Object.entries(channelResults)) {
      mergedResponse += `[${type}]: ${output.content}\n\n`;
    }

    return mergedResponse.trim();
  }

  /**
   * Prepare a prompt for a specific channel type
   */
  private prepareChannelPrompt(input: ChannelInput): string {
    switch (input.type) {
      case ChannelType.TEXT:
        return input.content;

      case ChannelType.IMAGE:
        return `Process the following image:\n${input.content}`;

      case ChannelType.AUDIO:
        return `Transcribe and analyze the following audio content:\n${input.content}`;

      case ChannelType.VIDEO:
        return `Analyze the following video content:\n${input.content}`;

      case ChannelType.TOOL_OUTPUT:
        return `Process the following tool output:\n${input.content}`;

      case ChannelType.BROWSER:
        return `Process the following browser content:\n${input.content}`;

      case ChannelType.DOCUMENT:
        return `Extract information from the following document:\n${input.content}`;

      default:
        return input.content;
    }
  }

  /**
   * Set context data that will be available to all channels
   */
  setContext(key: string, value: any): void {
    this.context[key] = value;
  }

  /**
   * Get context data
   */
  getContext(key: string): any {
    return this.context[key];
  }

  /**
   * Clear all context data
   */
  clearContext(): void {
    this.context = {};
  }
}
