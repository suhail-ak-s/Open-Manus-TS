import express from 'express';
import path from 'path';
import cors from 'cors';
import { CoTAgent } from './agent/cot';
import { ReActAgent } from './agent/react';
import { ToolCallAgent } from './agent/toolcall';
import { PlanningAgent } from './agent/planning';
import { ManusAgent } from './agent/manus';
import { LLM } from './llm';
import log from './utils/logger';
import { AgentState, Memory, Message, Role } from './schema';
import { ToolCollection } from './tool/base';
import config from './config';
import { initializeApi } from './api';

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Initialize LLM client
const llm = new LLM({
  api_key: process.env.OPENAI_API_KEY,
});

// Initialize tools
const tools = new ToolCollection();

// Initialize agents with type assertion to bypass strict type checking
const agents: Record<string, any> = {
  cot: new CoTAgent({
    name: 'Chain of Thought',
    llm,
    maxSteps: 5,
  } as any),
  react: new ReActAgent({
    name: 'ReAct',
    llm,
    maxSteps: 5,
  } as any),
  toolcall: new ToolCallAgent({
    name: 'Tool Calling',
    llm,
    tools,
    maxSteps: 5,
  } as any),
  planning: new PlanningAgent({
    name: 'Planning',
    llm,
    maxSteps: 5,
  } as any),
  manus: new ManusAgent({
    name: 'Manus',
    llm,
    tools,
    maxSteps: 5,
  } as any),
};

// Initialize the API with streaming support
initializeApi(app);

// Legacy API endpoint to process a message with a specific agent
app.post('/api/chat', async (req, res) => {
  try {
    const { agentType, message, memory = [] } = req.body;

    if (!agentType || !message) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    if (!agents[agentType]) {
      return res.status(400).json({ error: 'Invalid agent type' });
    }

    const agent = agents[agentType];

    // Create a memory object from the provided messages
    const agentMemory = new Memory();
    memory.forEach((msg: Message) => {
      agentMemory.messages.push(msg);
    });

    // Add the new user message
    agentMemory.messages.push({
      role: Role.USER,
      content: message,
    });

    // Create agent state
    const state = {
      type: AgentState.IDLE,
      memory: agentMemory,
      messages: [],
      step: 0,
      error: null,
      data: {},
      tools: [],
      rawMessages: [],
    };

    // Process the message with the agent
    await agent.processState(state);

    // Return the updated memory and any assistant messages
    return res.json({
      memory: state.memory.messages,
      response: state.memory.messages.filter((m: Message) => m.role === Role.ASSISTANT).pop(),
    });
  } catch (error) {
    log.error(`Error processing message: ${(error as Error).message}`);
    return res.status(500).json({ error: 'An error occurred while processing your message' });
  }
});

// Start the server
app.listen(PORT, () => {
  log.info(`Server running on port ${PORT}`);
  log.info(`Visit http://localhost:${PORT} to access the OpenManus UI`);
  log.info(`API endpoints available at http://localhost:${PORT}/api/`);
  log.info(`Streaming endpoint available at http://localhost:${PORT}/api/agent/stream`);
});

export default app;
