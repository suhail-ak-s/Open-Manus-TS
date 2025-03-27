# OpenManus TypeScript Quick Start Guide

This guide will help you get started with OpenManus TypeScript quickly.

## Prerequisites

- Node.js 18 or higher
- NPM 8 or higher
- An OpenAI API key with access to GPT-4 or similar models

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/suhail-ak-s/Open-Manus-TS.git
   cd Open-Manus-TS
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up your environment:
   ```bash
   cp .env.example .env
   ```

4. Edit the `.env` file and add your OpenAI API key:
   ```
   OPENAI_API_KEY=your-api-key-here
   ```

## Running the Web Interface

Start the server:

```bash
npm run server
```

Open your browser and navigate to http://localhost:8080

The web interface allows you to:
- Choose different agent types
- Send requests to agents
- View agent responses and reasoning
- Visualize the agent's thinking process

## Basic Examples

### Simple CLI Usage

```typescript
// Import the OpenManus main function
import { runManus } from 'openmanus';

// Run the Manus agent with a request
const response = await runManus({
  request: 'What is the weather in New York today?',
  tools: ['web_search', 'browser'],
  model: 'gpt-4o',
  maxSteps: 5
});

console.log(response);
```

### Using the Planning Flow

```typescript
// Import the planning flow runner
import { runPlanningFlow } from 'openmanus';

// Run a planning flow for a complex task
const result = await runPlanningFlow({
  request: 'Plan a 3-day trip to Paris with budget considerations',
  sandbox: true
});

console.log(result);
```

## Agent Types

- **Chain of Thought (CoT)**: Basic reasoning agent
- **ReAct**: Reasoning with actions
- **Tool Calling**: Direct tool usage
- **Planning**: Structured planning
- **Manus**: Advanced multi-stage reasoning

Try different agent types for different tasks to see which performs best!

## Tool Selection

Different tools are appropriate for different tasks:

- For web-related tasks: `browser`, `web_search`
- For file operations: `file`
- For system commands: `terminal`
- For code execution: `node_repl`, `python_repl`

## Next Steps

- Explore the [examples](./examples) directory for more usage patterns
- Read the full [documentation](./documentation) for advanced features
- Try creating your own custom tools by extending the `BaseTool` class 