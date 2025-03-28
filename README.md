# OpenManus TypeScript

[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5+-blue.svg)](https://www.typescriptlang.org/)

OpenManus TypeScript is a modular agentic system that provides a framework for building, orchestrating, and deploying intelligent AI agents. Inspired by the original OpenManus Python project, this TypeScript implementation uses a hub and spoke orchestration model for flexible agent coordination.

## 🌟 Features

- **Agentic Architecture**: Implements a hub and spoke orchestration model for coordinating multiple agents
- **Multiple Agent Types**:
  - Chain of Thought (CoT) - Uses reasoning to break complex problems into steps
  - ReAct - Combines reasoning and action steps 
  - Tool Calling - Allows agents to use specialized tools
  - Planning - Creates structured plans before execution
  - Manus - A multi-stage reasoning agent that combines multiple strategies

- **LLM Integration**:
  - OpenAI API support with streaming
  - Extensible architecture for other LLM providers

- **Tool Collection**:
  - Browser tools for web automation
  - File system tools
  - Web search capabilities
  - Terminal and command execution
  - Python and Node.js REPL integration
  - Custom tools via simple API

- **Web Interface**:
  - Interactive chat with different agent types
  - Visualization of agent reasoning processes
  - Comparison of agent behaviors

- **Memory Logging**:
  - File-based logging of shared memory updates
  - Session-based organization of memory logs
  - Complete snapshots of agent state transitions
  - Detailed debug information for agent interactions

## 📋 Prerequisites

- Node.js 18 or higher
- TypeScript 5 or higher
- OpenAI API key

## 🚀 Getting Started

### Installation

```bash
# Clone the repository
git clone https://github.com/suhail-ak-s/Open-Manus-TS.git
cd Open-Manus-TS

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env to add your API keys
```

### Configuration

Create a `.env` file in the root directory with the following content:

```
OPENAI_API_KEY=your_api_key_here
MODEL=gpt-4o
SANDBOX_MODE=false
LOG_LEVEL=info
ENABLE_MEMORY_LOGGING=true
MEMORY_LOG_PATH=./memory-logs
```

Memory logging is primarily configured through the `.env` file. Setting `ENABLE_MEMORY_LOGGING=true` enables logging of all shared memory operations, and `MEMORY_LOG_PATH` controls where these logs are stored. You can still override these settings with command line arguments if needed.

### Running the Server

```bash
# Start the server
npm run server

# For development with auto-restart
npm run dev:server
```

Memory logging is configured exclusively through the `.env` file. Set `ENABLE_MEMORY_LOGGING=true` to enable logging, and `MEMORY_LOG_PATH` to specify where log files should be stored.

Once the server is running, visit [http://localhost:8080](http://localhost:8080) to access the web interface. If memory logging is enabled, memory logs will be available at [http://localhost:8080/memory-logs](http://localhost:8080/memory-logs).

### Building the Project

```bash
npm run build
```

### Formatting the Code

```bash
npm run format
```

## 🧠 Agent Types

### Chain of Thought (CoT)

The CoT agent uses a step-by-step reasoning approach to solve complex problems by breaking them down into logical steps. It's effective for tasks requiring careful analysis.

### ReAct

The ReAct agent combines **Re**asoning and **Act**ion steps, alternating between thinking about the problem and taking actions. This approach is ideal for tasks requiring both reasoning and interaction with the environment.

### Tool Calling

The Tool Calling agent can use specialized external tools to help solve problems. These tools include web search, file operations, browser automation, and more.

### Planning

The Planning agent creates structured plans before execution, breaking tasks into manageable steps with dependencies. This approach is effective for complex multi-step tasks.

### Manus

The Manus agent is a versatile multi-stage reasoning agent that combines all of the above strategies for solving complex tasks. It's the most advanced agent type in OpenManus.

## 🔧 Key Components

### Hub and Spoke Orchestration

OpenManus uses a hub and spoke orchestration model where:

- The **Hub** (central orchestrator) manages the overall workflow and coordinates between specialized agents
- The **Spokes** (specialized agents) focus on specific tasks or capabilities

This architecture enables complex multi-agent workflows where agents can collaborate on solving problems.

### Memory Logging System

The memory logging system captures detailed information about the shared memory state and updates:

```typescript
// Memory logging is configured via .env file
ENABLE_MEMORY_LOGGING=true
MEMORY_LOG_PATH=./memory-logs

// You can also configure it programmatically
const sharedMemory = new SharedMemory({
  enableFileLogging: true,
  logFilePath: './memory-logs',
  sessionId: 'custom-session-id'
});
```

Memory logs are organized by session and include:
- Initial agent registrations
- Agent state transitions
- Message additions to shared memory
- Plan updates and modifications
- Complete memory snapshots for each state change

These logs are useful for:
- Debugging complex agent interactions
- Auditing agent decision-making processes
- Recovering from failures
- Analyzing agent performance and behavior
- Visualizing the flow of information between agents

### Tool System

The tool system allows agents to interact with the outside world:

```typescript
// Example of using a browser tool
const browserTool = new BrowserTool();
await browserTool.execute({
  action: 'go_to_url',
  url: 'https://www.example.com'
});
```

Available tools include:
- Browser tools (navigation, interaction, content extraction)
- File system tools (read, write, list)
- Terminal tools (execute commands)
- Web search tools
- Code execution tools (Python, Node.js)
- And more...

### Flow System

The flow system provides higher-level orchestration capabilities:

```typescript
// Example of using a planning flow
const result = await runPlanningFlow({
  request: 'Create a detailed travel plan for Paris',
  sandbox: true
});
```

## 🛠️ Development

### Project Structure

```
openmanus-ts/
├── src/
│   ├── agent/         # Agent implementations
│   ├── llm/           # LLM integrations
│   ├── tool/          # Tool implementations
│   ├── flow/          # Flow orchestration
│   ├── mcp/           # Main control program
│   ├── utils/         # Utility functions
│   ├── config/        # Configuration
│   ├── schema/        # TypeScript schemas
│   ├── types/         # TypeScript types
│   ├── prompt/        # Agent prompts
│   ├── server.ts      # Web server
│   └── index.ts       # Main exports
├── public/            # Web interface files
├── tests/             # Test files
└── examples/          # Example usage
```

### Creating Custom Tools

You can create custom tools by extending the `BaseTool` class:

```typescript
import { BaseTool, ToolResult } from 'openmanus';

export class MyCustomTool extends BaseTool {
  name = 'my_custom_tool';
  description = 'A custom tool that does something interesting';
  
  parameters = {
    param1: {
      type: 'string',
      description: 'First parameter',
      required: true
    },
    param2: {
      type: 'number',
      description: 'Second parameter',
      required: false
    }
  };
  
  requiredParams = ['param1'];
  
  async execute(input: Record<string, any>): Promise<string | ToolResult> {
    // Validate parameters
    this.validateParams(input);
    
    // Implement tool logic here
    const result = `Tool executed with: ${input.param1}`;
    
    // Return the result
    return result;
  }
}
```

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Related Projects

- [OpenManus Python](https://github.com/mannaandpoem/OpenManus) - The original Python implementation with 40k+ stars
- [LangChain](https://github.com/langchain-ai/langchain)
- [AutoGPT](https://github.com/Significant-Gravitas/Auto-GPT)

## 👥 Contributors

- OpenManus Contributors

## 🧠 Multi-Agent Architecture

OpenManus implements a sophisticated multi-agent architecture using a hub and spoke orchestration model:

- **Hub (Orchestrator)**: The central agent that coordinates the overall workflow
- **Spokes (Specialized Agents)**: Individual agents with specific capabilities

This architecture enables complex workflows where different agents collaborate to solve tasks that would be difficult for a single agent. Benefits include:

1. **Specialization**: Each agent focuses on what it does best
2. **Scalability**: New agents can be added without changing the core architecture
3. **Flexibility**: The orchestrator dynamically selects the best agent for each subtask

The multi-agent system includes:
- Shared memory for agent collaboration
- Private memory for agent-specific processing
- Structured planning for complex tasks
- Visualization tools to monitor agent activities

For more details, see the [Multi-Agent Architecture Documentation](documentation/MULTI_AGENT_ARCHITECTURE.md).

## 💾 Memory Logging

OpenManus includes a comprehensive memory logging system that captures all shared memory updates to disk. This is useful for:

- Debugging agent behavior
- Analyzing decision-making processes
- Auditing agent actions
- Recovering from failures

### Log Structure

Memory logs are organized by sessions, with each session containing:

```
memory-logs/
├── session_12345678/
│   ├── session-info.json            # Session metadata
│   ├── current_memory_state.json    # Latest memory snapshot
│   ├── memory_message_added_*.json  # Individual memory delta events
│   ├── memory_agent_state_*.json    # Agent state transitions
│   └── ...
└── session_87654321/
    └── ...
```

### Enabling Memory Logging

Memory logging can be enabled in two ways:

1. **Environment Variables** (Recommended):
   ```
   ENABLE_MEMORY_LOGGING=true
   MEMORY_LOG_PATH=./memory-logs
   ```

2. **Programmatically**:
   ```typescript
   import { runManus } from 'openmanus';
   
   await runManus({
     request: 'Your request here',
     enableMemoryLogging: true,
     memoryLogPath: './custom-logs'
   });
   ```

3. **At Runtime**:
   ```typescript
   import { SharedMemory } from 'openmanus';
   
   const memory = new SharedMemory();
   memory.setFileLogging(true, {
     logFilePath: './custom-logs', 
     sessionId: 'custom_session'
   });
   ```
