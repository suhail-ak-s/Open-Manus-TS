# Creating Custom Agents in OpenManus TypeScript

This guide explains how to create and integrate custom agents into the OpenManus ecosystem.

## Understanding Agent Types

OpenManus supports different types of agents:

1. **Base Agents**: Foundation for all agents
2. **Chain of Thought (CoT) Agents**: Basic reasoning agents
3. **ReAct Agents**: Reasoning with actions
4. **Tool Call Agents**: Direct tool usage
5. **Planning Agents**: Structured planning
6. **Domain-Specific Agents**: Specialized for certain tasks

## Basic Agent Implementation

To create a custom agent, extend one of the existing agent classes:

```typescript
import { ToolCallAgent } from 'openmanus';

export class MyCustomAgent extends ToolCallAgent {
  constructor(options: any = {}) {
    // Define custom tools
    const tools = new ToolCollection([
      // Add appropriate tools for your agent
    ]);

    // Set up agent config
    super({
      ...options,
      name: options.name || 'MyCustomAgent',
      description: options.description || 'A custom agent for specific tasks',
      systemPrompt: CUSTOM_SYSTEM_PROMPT,
      nextStepPrompt: CUSTOM_NEXT_STEP_PROMPT,
      availableTools: tools,
      maxSteps: options.maxSteps || 15,
    });
  }
}
```

## System and Next Step Prompts

Every agent needs two key prompts:

1. **System Prompt**: Sets the agent's overall behavior and capabilities
2. **Next Step Prompt**: Guides the agent's thinking for each step

Example system prompt:

```typescript
const CUSTOM_SYSTEM_PROMPT = `
You are a specialized agent that focuses on [specific domain].
You have access to tools for:
- [Tool 1]
- [Tool 2]
- [Tool 3]

Your task is to help users with [specific capabilities].

IMPORTANT: Always prioritize [key principles for this agent].
`;
```

Example next step prompt:

```typescript
const CUSTOM_NEXT_STEP_PROMPT = `
Analyze the current situation and decide on the next steps.

1. First, THINK THROUGH what you've learned so far and what you still need to know.
2. Then, explain your REASONING for choosing the next action.

Focus on [specific approach for this agent].
`;
```

## Adding Custom Tools

Your agent will likely need custom tools:

```typescript
import { BaseTool, ToolResult } from 'openmanus';

export class MyCustomTool extends BaseTool {
  name = 'my_custom_tool';
  description = 'Performs a specialized operation';
  
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
    this.validateParams(input);
    
    // Tool implementation logic
    const result = `Processed ${input.param1}`;
    
    return result;
  }
}
```

## Integrating with Multi-Agent System

To integrate your custom agent into the multi-agent system:

```typescript
import { MultiAgentOrchestrator } from 'openmanus';
import { MyCustomAgent } from './my-custom-agent';

// Add a new agent type to the enum
enum CustomAgentType {
  MY_CUSTOM = 'my_custom'
}

// Create the multi-agent orchestrator
const orchestrator = new MultiAgentOrchestrator();

// Add your custom agent
orchestrator.addAgent(CustomAgentType.MY_CUSTOM, new MyCustomAgent({
  name: 'My Custom Agent',
  // Additional configuration
}));

// Run with a task
const result = await orchestrator.run(
  'Perform a task that requires the custom agent capabilities'
);
```

## Best Practices

1. **Specialize Your Agent**: Each agent should have a clear, focused purpose
2. **Optimize Prompts**: Carefully design system and next step prompts
3. **Choose Appropriate Tools**: Only include tools relevant to the agent's purpose
4. **Test Thoroughly**: Test your agent in isolation before integrating
5. **Handle Edge Cases**: Consider unusual inputs and error states

## Example: Creating a Research Agent

Here's an example of a specialized research agent:

```typescript
import { ToolCallAgent } from 'openmanus';
import { WebSearchTool } from 'openmanus';
import { BrowserTool } from 'openmanus';
import { WriteFileTool } from 'openmanus';

const RESEARCH_SYSTEM_PROMPT = `
You are a specialized research agent that finds, analyzes, and summarizes information.
Your goal is to provide comprehensive, accurate research on any topic.

You have access to:
- Web search to find relevant information
- Browser to explore web pages in detail
- File tools to save your research

IMPORTANT: Always cite your sources and verify information from multiple sources.
`;

export class ResearchAgent extends ToolCallAgent {
  constructor(options: any = {}) {
    // Define research tools
    const tools = new ToolCollection([
      new WebSearchTool(),
      new BrowserTool(),
      new WriteFileTool()
    ]);

    // Set up agent config
    super({
      ...options,
      name: options.name || 'ResearchAgent',
      description: options.description || 'Specialized agent for research tasks',
      systemPrompt: RESEARCH_SYSTEM_PROMPT,
      availableTools: tools,
      maxSteps: options.maxSteps || 20,
    });
  }
}
```

## Conclusion

Creating custom agents allows you to extend OpenManus for specialized use cases. By following this guide, you can create agents that integrate seamlessly with the existing architecture while providing new capabilities. 