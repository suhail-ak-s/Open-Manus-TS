import { AgentType } from '../../agent/multi-agent';
import { AgentState } from '../../schema';

/**
 * Types of events that can be streamed to the client
 */
export enum StreamEventType {
  // System events
  SYSTEM_START = 'system_start',
  SYSTEM_END = 'system_end',
  SYSTEM_ERROR = 'system_error',

  // Agent events
  AGENT_THINKING = 'agent_thinking',
  AGENT_ACTING = 'agent_acting',
  AGENT_TRANSITION = 'agent_transition',

  // Orchestrator events
  ORCHESTRATOR_PLANNING = 'orchestrator_planning',
  ORCHESTRATOR_EXECUTING = 'orchestrator_executing',

  // Planning agent events
  PLAN_CREATED = 'plan_created',
  PLAN_UPDATED = 'plan_updated',
  PLAN_STEP_STARTED = 'plan_step_started',
  PLAN_STEP_COMPLETED = 'plan_step_completed',

  // Browser agent events
  BROWSER_SEARCH = 'browser_search',
  BROWSER_SEARCH_RESULTS = 'browser_search_results',
  BROWSER_NAVIGATE = 'browser_navigate',
  BROWSER_CONTENT = 'browser_content',
  BROWSER_SCREENSHOT = 'browser_screenshot',
  BROWSER_SCROLL = 'browser_scroll',
  BROWSER_ERROR = 'browser_error',

  // Terminal agent events
  TERMINAL_COMMAND = 'terminal_command',
  TERMINAL_OUTPUT = 'terminal_output',

  // SWE agent events
  SWE_READING_FILE = 'swe_reading_file',
  SWE_WRITING_FILE = 'swe_writing_file',
  SWE_CODE_ANALYSIS = 'swe_code_analysis',

  // New event type
  MEMORY_UPDATE = 'memory_update',
}

/**
 * Interface for search result items to be displayed in the UI
 */
export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
  favicon?: string; // URL to favicon or data URI
}

/**
 * Base interface for all stream events
 */
export interface StreamEvent {
  id: string;
  timestamp: number;
  type: StreamEventType;
  agent: AgentType;
  state: AgentState;
  message: string;
  details?: any;
}

/**
 * Browser navigation event
 */
export interface BrowserNavigationEvent extends StreamEvent {
  type: StreamEventType.BROWSER_NAVIGATE;
  details: {
    url: string;
    title?: string;
  };
}

/**
 * Browser screenshot event
 */
export interface BrowserScreenshotEvent extends StreamEvent {
  type: StreamEventType.BROWSER_SCREENSHOT;
  details: {
    url: string;
    imageData: string; // Base64 encoded image
  };
}

/**
 * Browser search results event
 */
export interface BrowserSearchResultsEvent extends StreamEvent {
  type: StreamEventType.BROWSER_SEARCH_RESULTS;
  details: {
    query: string;
    results: SearchResultItem[];
  };
}

/**
 * Plan event
 */
export interface PlanEvent extends StreamEvent {
  type: StreamEventType.PLAN_CREATED | StreamEventType.PLAN_UPDATED;
  details: {
    plan: any; // The plan structure
    title: string;
    description: string;
    steps: Array<{
      id: string;
      description: string;
      agent: AgentType;
      completed: boolean;
      dependsOn?: string[];
    }>;
  };
}

/**
 * Plan step event
 */
export interface PlanStepEvent extends StreamEvent {
  type: StreamEventType.PLAN_STEP_STARTED | StreamEventType.PLAN_STEP_COMPLETED;
  details: {
    stepId: string;
    description: string;
    agent: AgentType;
    result?: string;
  };
}

/**
 * Agent thinking event
 */
export interface AgentThinkingEvent extends StreamEvent {
  type: StreamEventType.AGENT_THINKING;
  details: {
    thinking: string;
    context?: string;
  };
}

/**
 * Agent acting event
 */
export interface AgentActingEvent extends StreamEvent {
  type: StreamEventType.AGENT_ACTING;
  details: {
    action: string;
    result?: string;
  };
}

/**
 * Memory update event
 */
export interface MemoryUpdateEvent extends StreamEvent {
  type: StreamEventType.MEMORY_UPDATE;
  details: {
    memoryType: string;
    sharedMemory: Record<string, any>;
    privateMemories: Record<string, any>;
    activeAgent: string;
    accessor: string;
    timestamp: number;
  };
}

/**
 * Create a new stream event
 */
export function createStreamEvent(
  type: StreamEventType,
  agent: AgentType,
  state: AgentState,
  message: string,
  details?: any
): StreamEvent {
  return {
    id: `event_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    timestamp: Date.now(),
    type,
    agent,
    state,
    message,
    details,
  };
}
