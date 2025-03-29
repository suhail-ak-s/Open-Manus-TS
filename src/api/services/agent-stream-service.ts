import { MultiAgentOrchestrator, AgentType } from '../../agent/multi-agent';
import { AgentState } from '../../schema';
import { EventType } from '../../utils/visualization';
import { StreamController } from '../controllers/stream-controller';
import { StreamEventType } from '../models/stream-event';
import log from '../../utils/logger';
import config from '../../config';
import dotenv from 'dotenv';

// Ensure environment variables are loaded
dotenv.config();

// Map of session IDs to agent instances
const sessionAgents: Map<string, MultiAgentOrchestrator> = new Map();

/**
 * The AgentStreamService connects the multi-agent system to the stream controller
 */
export class AgentStreamService {
  /**
   * Create a new agent instance for a session
   *
   * @param sessionId The session ID
   * @returns The created agent instance
   */
  static createAgent(sessionId: string): MultiAgentOrchestrator {
    // Clean up any existing agent for this session
    this.cleanupAgent(sessionId);

    // Create a new agent with memory logging from environment variables
    const agent = new MultiAgentOrchestrator({
      maxSteps: 30,
      eventHandler: (event: any) => this.handleAgentEvent(sessionId, event),
      enableMemoryLogging: process.env.ENABLE_MEMORY_LOGGING === 'true',
      memoryLogPath: process.env.MEMORY_LOG_PATH || './memory-logs',
      taskId: sessionId,
    });

    // Store the agent
    sessionAgents.set(sessionId, agent);

    log.info(`Created new agent for session ${sessionId}`);

    // Emit agent creation event
    StreamController.createAndEmitEvent(
      StreamEventType.SYSTEM_START,
      AgentType.ORCHESTRATOR,
      AgentState.IDLE,
      'Agent created',
      { sessionId }
    );

    // Force a memory update event to populate the UI
    agent.handleEvent({
      type: 'memory_update',
      agent: AgentType.ORCHESTRATOR,
      state: AgentState.IDLE,
      message: 'Initial memory state',
      details: {
        type: 'initialization',
        sharedMemory: {},
        privateMemories: {},
        activeAgent: AgentType.ORCHESTRATOR,
        accessor: AgentType.ORCHESTRATOR,
        timestamp: Date.now(),
      },
    });

    return agent;
  }

  /**
   * Get an existing agent for a session or create a new one
   *
   * @param sessionId The session ID
   * @returns The agent instance
   */
  static getOrCreateAgent(sessionId: string): MultiAgentOrchestrator {
    const existingAgent = sessionAgents.get(sessionId);
    if (existingAgent) {
      return existingAgent;
    }

    return this.createAgent(sessionId);
  }

  /**
   * Clean up an agent instance for a session
   *
   * @param sessionId The session ID
   */
  static cleanupAgent(sessionId: string): void {
    const agent = sessionAgents.get(sessionId);
    if (agent) {
      // TODO: Add any cleanup logic needed for the agent
      sessionAgents.delete(sessionId);
      log.info(`Cleaned up agent for session ${sessionId}`);
    }
  }

  /**
   * Run a query through the multi-agent system
   *
   * @param sessionId The session ID
   * @param query The query to process
   * @returns A promise that resolves when the query is processed
   */
  static async runQuery(sessionId: string, query: string): Promise<string> {
    const agent = this.getOrCreateAgent(sessionId);

    // Emit query start event
    StreamController.createAndEmitEvent(
      StreamEventType.SYSTEM_START,
      AgentType.ORCHESTRATOR,
      AgentState.IDLE,
      'Processing query',
      { sessionId, query }
    );

    try {
      // Run the query
      const result = await agent.run(query);

      // Emit query end event
      StreamController.createAndEmitEvent(
        StreamEventType.SYSTEM_END,
        AgentType.ORCHESTRATOR,
        AgentState.IDLE,
        'Query processing completed',
        { sessionId, result }
      );

      return result;
    } catch (error) {
      // Emit error event
      StreamController.createAndEmitEvent(
        StreamEventType.SYSTEM_ERROR,
        AgentType.ORCHESTRATOR,
        AgentState.ERROR,
        `Error processing query: ${(error as Error).message}`,
        { sessionId, error: (error as Error).message }
      );

      throw error;
    }
  }

  /**
   * Handle events from the multi-agent system
   *
   * @param sessionId The session ID
   * @param event The event from the agent
   */
  static handleAgentEvent(sessionId: string, event: any): void {
    // Special handling for plan-related system messages
    if (
      event.type === EventType.SYSTEM_MESSAGE &&
      event.agent === AgentType.PLANNING &&
      event.message &&
      event.message.includes('structured plan:')
    ) {
      // Create plan details
      const details = this.createPlanDetails(event, sessionId);

      // Emit a plan created event
      StreamController.createAndEmitEvent(
        StreamEventType.PLAN_CREATED,
        event.agent,
        event.state || AgentState.RUNNING,
        event.message,
        details
      );
      return;
    }

    // Regular event handling for other events
    // Map internal event types to stream event types
    const streamEventType = this.mapEventType(event.type);

    // Extract agent type and state
    const agent = event.agent || AgentType.ORCHESTRATOR;
    const state = event.state || AgentState.RUNNING;

    // Create details object based on event type
    const details = this.createEventDetails(event, sessionId);

    // Emit the event to connected clients
    StreamController.createAndEmitEvent(
      streamEventType,
      agent,
      state,
      event.message || 'Agent event',
      details
    );
  }

  /**
   * Map internal event types to stream event types
   *
   * @param eventType The internal event type
   * @returns The mapped stream event type
   */
  private static mapEventType(eventType: EventType | string): StreamEventType {
    // Handle browser-specific events that come directly from the browser tool
    // These aren't in the EventType enum, so handle them separately
    if (typeof eventType === 'string') {
      switch (eventType) {
        case 'browser_navigate':
          return StreamEventType.BROWSER_NAVIGATE;
        case 'browser_search':
          return StreamEventType.BROWSER_SEARCH;
        case 'browser_search_results':
          return StreamEventType.BROWSER_SEARCH_RESULTS;
        case 'browser_content':
          return StreamEventType.BROWSER_CONTENT;
        case 'browser_screenshot':
          return StreamEventType.BROWSER_SCREENSHOT;
        case 'browser_error':
          return StreamEventType.BROWSER_ERROR;
        case 'browser_action':
        case 'browser_action_result':
          return StreamEventType.AGENT_ACTING;
        case 'tool_use':
        case 'tool_result':
          return StreamEventType.AGENT_ACTING;
        case 'memory_update':
          return StreamEventType.MEMORY_UPDATE;
      }
    }

    // Map internal event types to stream event types (existing code)
    const eventTypeMap: Partial<Record<EventType, StreamEventType>> = {
      [EventType.AGENT_THINKING]: StreamEventType.AGENT_THINKING,
      [EventType.AGENT_ACTING]: StreamEventType.AGENT_ACTING,
      [EventType.AGENT_SELECTION]: StreamEventType.AGENT_TRANSITION,
      [EventType.AGENT_TRANSITION]: StreamEventType.AGENT_TRANSITION,
      [EventType.TOOL_USE]: StreamEventType.AGENT_ACTING,
      [EventType.USER_INPUT]: StreamEventType.SYSTEM_START,
      [EventType.SYSTEM_MESSAGE]: StreamEventType.SYSTEM_START,
      [EventType.ERROR]: StreamEventType.SYSTEM_ERROR,
      [EventType.COMPLETION]: StreamEventType.SYSTEM_END,
      [EventType.LOOP_DETECTED]: StreamEventType.SYSTEM_ERROR,
      [EventType.INTERVENTION]: StreamEventType.SYSTEM_START,
    };

    // Special handling for system messages that contain plans
    if (eventType === EventType.SYSTEM_MESSAGE) {
      return StreamEventType.SYSTEM_START;
    }

    return eventTypeMap[eventType] || StreamEventType.SYSTEM_START;
  }

  /**
   * Create event details based on event type
   *
   * @param event The agent event
   * @param sessionId The session ID
   * @returns The formatted event details
   */
  private static createEventDetails(event: any, sessionId: string): any {
    // Base details that are included in all events
    const details: any = {
      sessionId,
      agent: event.agent || AgentType.ORCHESTRATOR,
      state: event.state || AgentState.RUNNING,
    };

    // For browser-specific events, add URL info if available
    if (
      event.type === 'browser_navigate' ||
      event.type === 'browser_screenshot' ||
      event.type === 'browser_content'
    ) {
      details.url = event.details?.url;
      details.title = event.details?.title;
      details.originalEvent = event.type;
    }

    // For search events, include the query
    if (event.type === 'browser_search' || event.type === 'browser_search_results') {
      details.query = event.details?.query;
      details.originalEvent = event.type;
    }

    // For tool usage, capture tool info
    if (event.type === 'tool_use') {
      details.tool = event.details?.tool;
      details.action = event.details?.action;
      details.arguments = event.details?.arguments;
      details.originalEvent = event.type;
    }

    // For tool results, capture the returned data
    if (event.type === 'tool_result') {
      details.tool = event.details?.tool;
      details.result = event.details?.result;
      details.originalEvent = event.type;

      // Special handling for browser screenshots
      if (
        event.details?.tool === 'browser' &&
        event.details?.imageData &&
        typeof event.details.imageData === 'string'
      ) {
        details.imageData = event.details.imageData;
        details.url = event.details?.url;
        details.title = event.details?.title;
      }

      // Special handling for web search results
      if (
        event.details?.tool === 'web_search' &&
        event.details?.fullResult &&
        typeof event.details.fullResult === 'string'
      ) {
        try {
          // Extract and structure search results
          details.search_results = this.extractSearchResultsFromText(event.details.fullResult);
          details.query = event.details?.arguments?.query || '';
          details.fullResult = event.details.fullResult;
        } catch (error) {
          log.warning(`Error extracting search results: ${error}`);
          details.error = `Error extracting search results: ${(error as Error).message}`;
          details.fullResult = event.details.fullResult;
        }
      }
    }

    // Special handling for memory updates
    if (event.type === 'memory_update') {
      // Use the internal memory update type for more specific UI handling
      details.type = event.details?.type || 'update';
      
      // For delta updates, include only what changed
      if (event.details?.delta) {
        details.delta = event.details.delta;
        details.accessor = event.details.accessor;
        details.timestamp = event.details.timestamp;
      } 
      // For full state updates (legacy), include everything
      else {
        details.sharedMemory = event.details?.sharedMemory || {};
        details.privateMemories = event.details?.privateMemories || {};
        details.activeAgent = event.details?.activeAgent;
        details.accessor = event.details?.accessor;
        details.timestamp = event.details?.timestamp || Date.now();
      }
    }

    // Include original details when appropriate
    if (event.details && !event.details.tool && !event.details.type) {
      details.details = event.details;
    }

    return details;
  }

  /**
   * Try to extract search results from text
   */
  private static extractSearchResultsFromText(text: string): any[] {
    // Try to find JSON search results from HTML comment format
    try {
      const jsonMatch = text.match(/<!-- JSON_RESULTS: (.*?) -->/);
      if (jsonMatch && jsonMatch[1]) {
        const parsedData = JSON.parse(jsonMatch[1]);
        if (parsedData.results && Array.isArray(parsedData.results)) {
          return parsedData.results.map((item: any) => ({
            title: item.title || '',
            url: item.url || item.link || '',
            snippet: item.snippet || '',
            favicon:
              item.favicon ||
              `https://www.google.com/s2/favicons?domain=${new URL(item.url || item.link || '').hostname}`,
          }));
        }
      }
    } catch (e) {
      // Continue with legacy format if JSON parsing fails
    }

    // Try the old JSON format as a fallback
    try {
      const jsonMatch = text.match(/Search results for "[^"]+":[\s\n]+({\s*"query":[\s\S]+)/);
      if (jsonMatch && jsonMatch[1]) {
        const parsedData = JSON.parse(jsonMatch[1]);
        if (parsedData.results && Array.isArray(parsedData.results)) {
          return parsedData.results.map((item: any) => ({
            title: item.title || '',
            url: item.url || item.link || '',
            snippet: item.snippet || '',
            favicon:
              item.favicon ||
              `https://www.google.com/s2/favicons?domain=${new URL(item.url || item.link || '').hostname}`,
          }));
        }
      }
    } catch (e) {
      // Continue with legacy format if JSON parsing fails
    }

    // Fall back to legacy format extraction
    const results = [];
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const titleRegex = /\d+\.\s+(.+?)\s+-\s+https?:\/\//g;

    // Extract URLs
    const urls = text.match(urlRegex) || [];

    // Extract titles
    const titles = [];
    let match;
    while ((match = titleRegex.exec(text)) !== null) {
      titles.push(match[1]);
    }

    // Create results
    for (let i = 0; i < Math.min(urls.length, titles.length); i++) {
      const url = urls[i];
      const hostname = new URL(url).hostname;

      results.push({
        title: titles[i] || `Result ${i + 1}`,
        url: url,
        snippet: this.extractSnippetForUrl(text, url),
        favicon: `https://www.google.com/s2/favicons?domain=${hostname}`,
      });
    }

    return results;
  }

  /**
   * Extract a snippet from text for a given URL
   */
  private static extractSnippetForUrl(text: string, url: string): string {
    // Find the index of the URL
    const urlIndex = text.indexOf(url);
    if (urlIndex === -1) return '';

    // Get text after the URL, up to 150 chars
    const startIndex = urlIndex + url.length;
    let endIndex = text.indexOf('\n', startIndex);
    if (endIndex === -1) endIndex = text.length;

    // Get the snippet
    const snippet = text.substring(startIndex, endIndex).trim();

    // Clean up the snippet
    return snippet.replace(/^[^a-zA-Z0-9]*/, '').substring(0, 150);
  }

  /**
   * Create details specific to a plan event
   *
   * @param event The plan event
   * @param sessionId The session ID
   * @returns Plan details
   */
  private static createPlanDetails(event: any, sessionId: string): any {
    // Check if we have plan data
    if (!event.details || !event.details.plan) {
      return {
        sessionId,
        originalEvent: event.type,
        message: event.message,
      };
    }

    try {
      const plan = event.details.plan;

      // Extract plan steps
      const steps = Array.isArray(plan.steps)
        ? plan.steps.map((step: any) => ({
            id: step.id || '',
            description: step.description || '',
            agent: step.assignedAgent || '',
            completed: !!step.completed,
            dependsOn: step.dependsOn || [],
          }))
        : [];

      // Return formatted plan details
      return {
        sessionId,
        originalEvent: event.type,
        plan: plan,
        title: plan.title || 'Structured Plan',
        description: plan.description || '',
        steps: steps,
        eventType: StreamEventType.PLAN_CREATED,
      };
    } catch (error) {
      // If there's an error parsing plan details, return basic info
      return {
        sessionId,
        originalEvent: event.type,
        message: event.message,
        error: `Error parsing plan details: ${(error as Error).message}`,
      };
    }
  }
}
