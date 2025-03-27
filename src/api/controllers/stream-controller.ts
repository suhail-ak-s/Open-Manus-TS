import { Response } from 'express';
import { EventEmitter } from 'events';
import { AgentType } from '../../agent/multi-agent';
import { AgentState } from '../../schema';
import { createStreamEvent, StreamEvent, StreamEventType } from '../models/stream-event';
import log from '../../utils/logger';

// Global event emitter for streaming events
const streamEventEmitter = new EventEmitter();
// Increase max listeners to avoid warnings when many clients connect
streamEventEmitter.setMaxListeners(100);

// Client connection tracking
interface ClientConnection {
  id: string;
  response: Response;
  sessionId: string;
  lastEventId?: string;
  options?: any;
}

// Active client connections
const clients: Map<string, ClientConnection> = new Map();

/**
 * The StreamController manages SSE connections and event streaming
 */
export class StreamController {
  /**
   * Initialize a new SSE connection for a client
   *
   * @param response Express response object to send SSE events
   * @param sessionId The session ID for the client
   * @param lastEventId The last event ID received by the client
   * @param options Additional options for the connection
   * @returns A client connection ID
   */
  static initConnection(
    response: Response,
    sessionId: string,
    lastEventId?: string,
    options?: any
  ): string {
    // Set required SSE headers
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no'); // For Nginx

    // Create a client ID
    const clientId = `client_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    // Store client connection with any provided options
    clients.set(clientId, {
      id: clientId,
      response,
      sessionId,
      lastEventId,
      options,
    });

    // Log the connection
    log.info(`SSE client connected: ${clientId} for session ${sessionId}`);

    // Send a connection established event
    const event = createStreamEvent(
      StreamEventType.SYSTEM_START,
      AgentType.ORCHESTRATOR,
      AgentState.IDLE,
      'Connection established',
      { sessionId, timestamp: Date.now() }
    );

    this.sendEventToClient(clientId, event);

    // Handle client disconnection
    response.on('close', () => {
      log.info(`SSE client disconnected: ${clientId}`);
      clients.delete(clientId);
    });

    return clientId;
  }

  /**
   * Send an event to a specific client
   *
   * @param clientId The client ID to send the event to
   * @param event The event to send
   */
  static sendEventToClient(clientId: string, event: StreamEvent): void {
    const client = clients.get(clientId);
    if (!client) {
      return;
    }

    try {
      const { response } = client;

      // Format the event as SSE
      response.write(`id: ${event.id}\n`);
      response.write(`event: ${event.type}\n`);
      response.write(`data: ${JSON.stringify(event)}\n\n`);

      // Update the last event ID
      client.lastEventId = event.id;
    } catch (error) {
      log.error(`Error sending event to client ${clientId}: ${(error as Error).message}`);
      // Clean up disconnected clients
      clients.delete(clientId);
    }
  }

  /**
   * Send an event to all clients for a specific session
   *
   * @param sessionId The session ID to send the event to
   * @param event The event to send
   */
  static sendEventToSession(sessionId: string, event: StreamEvent): void {
    for (const [clientId, client] of clients.entries()) {
      if (client.sessionId === sessionId) {
        this.sendEventToClient(clientId, event);
      }
    }
  }

  /**
   * Send an event to all connected clients
   *
   * @param event The event to send
   */
  static broadcastEvent(event: StreamEvent): void {
    for (const clientId of clients.keys()) {
      this.sendEventToClient(clientId, event);
    }
  }

  /**
   * Emit an event to be sent to connected clients
   *
   * @param event The event to emit
   */
  static emitEvent(event: StreamEvent): void {
    streamEventEmitter.emit('event', event);
  }

  /**
   * Create and emit a new event
   *
   * @param type The event type
   * @param agent The agent that generated the event
   * @param state The agent's state
   * @param message The event message
   * @param details Additional event details
   */
  static createAndEmitEvent(
    type: StreamEventType,
    agent: AgentType,
    state: AgentState,
    message: string,
    details?: any
  ): void {
    const event = createStreamEvent(type, agent, state, message, details);
    this.emitEvent(event);
  }

  /**
   * Set up event listeners for the stream controller
   */
  static setupEventListeners(): void {
    streamEventEmitter.on('event', (event: StreamEvent) => {
      // Broadcast to all clients or to specific session
      if (event.details?.sessionId) {
        this.sendEventToSession(event.details.sessionId, event);
      } else {
        this.broadcastEvent(event);
      }
    });
  }
}

// Initialize event listeners
StreamController.setupEventListeners();
