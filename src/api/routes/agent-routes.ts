import express, { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { StreamController } from '../controllers/stream-controller';
import { AgentStreamService } from '../services/agent-stream-service';
import log from '../../utils/logger';

// Create router
const router = express.Router();

/**
 * POST /api/agent/query
 * Process a query through the multi-agent system
 */
router.post('/query', async (req: Request, res: Response) => {
  try {
    const { query } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Query is required and must be a string',
      });
    }

    // Get or create a session ID
    const sessionId = req.body.sessionId || uuidv4();

    log.info(`Processing query for session ${sessionId}: ${query}`);

    // Process the query
    const result = await AgentStreamService.runQuery(sessionId, query);

    // Return the result
    res.json({
      success: true,
      sessionId,
      result,
    });
  } catch (error) {
    log.error(`Error processing query: ${(error as Error).message}`);

    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /api/agent/stream
 * Stream events from the multi-agent system
 */
router.get('/stream', (req: Request, res: Response) => {
  try {
    // Get the session ID
    const sessionId = req.query.sessionId as string;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required',
      });
    }

    // Get the last event ID
    const lastEventId = req.headers['last-event-id'] as string;

    log.info(`Initializing stream for session ${sessionId}`);

    // Initialize the connection
    StreamController.initConnection(res, sessionId, lastEventId);
  } catch (error) {
    log.error(`Error initializing stream: ${(error as Error).message}`);

    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * DELETE /api/agent/session/:sessionId
 * Clean up a session
 */
router.delete('/session/:sessionId', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required',
      });
    }

    log.info(`Cleaning up session ${sessionId}`);

    // Clean up the agent
    AgentStreamService.cleanupAgent(sessionId);

    res.json({
      success: true,
      message: `Session ${sessionId} cleaned up`,
    });
  } catch (error) {
    log.error(`Error cleaning up session: ${(error as Error).message}`);

    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /api/agent/stream-post
 * Stream events with POST request support
 * This allows integrating with services that require POST instead of GET
 */
router.post('/stream-post', (req: Request, res: Response) => {
  try {
    // Get the session ID from request body
    const { sessionId, lastEventId, options } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required',
      });
    }

    log.info(`Initializing POST stream for session ${sessionId}`);

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // For Nginx

    // Initialize the connection with stream controller
    StreamController.initConnection(res, sessionId, lastEventId, options);

    // The StreamController will handle sending events to the client
    // The connection stays open until the client disconnects
  } catch (error) {
    log.error(`Error initializing POST stream: ${(error as Error).message}`);

    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

export default router;
