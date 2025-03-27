import express, { Application } from 'express';
import cors from 'cors';
import agentRoutes from './routes/agent-routes';
import { StreamController } from './controllers/stream-controller';
import log from '../utils/logger';

// Initialize the API
export function initializeApi(app: Application): void {
  // Setup middleware
  app.use(cors());
  app.use(express.json());

  // Set up routes
  app.use('/api/agent', agentRoutes);

  // Register a heartbeat endpoint
  app.get('/api/heartbeat', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  log.info('API initialized');
}

// Export all API components
export { StreamController } from './controllers/stream-controller';
export { AgentStreamService } from './services/agent-stream-service';
export { StreamEventType, StreamEvent } from './models/stream-event';
