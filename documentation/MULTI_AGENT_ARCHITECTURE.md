# Multi-Agent Architecture in OpenManus TypeScript

OpenManus implements a sophisticated multi-agent architecture using a hub and spoke orchestration model.

## Hub and Spoke Orchestration Model

The hub and spoke model consists of:

- **Hub (Orchestrator)**: A central agent that coordinates the overall workflow
- **Spokes (Specialized Agents)**: Individual agents with specific capabilities

This architecture enables complex workflows where different agents collaborate to solve tasks that would be difficult for a single agent.

## Core Components

### MultiAgentOrchestrator

The `MultiAgentOrchestrator` serves as the hub in the architecture. It:

- Analyzes user requests
- Determines which specialized agents to use
- Coordinates transitions between agents
- Maintains overall context
- Synthesizes results from different agents

### Specialized Agents

OpenManus includes several specialized agents:

1. **Planning Agent**: Creates structured plans for complex tasks
2. **SWE Agent**: Handles code-related tasks
3. **Browser Agent**: Manages web browsing and information gathering
4. **Terminal Agent**: Executes terminal commands and system operations
5. **Domain-specific Agents**: Purchase, Certificate, Budget, and Defects agents

## Memory System

The multi-agent system implements:

1. **Shared Memory**: Common memory that all agents can access
2. **Private Memory**: Agent-specific memory that only the agent can access

## Flow System

The flow system provides higher-level orchestration capabilities:

- `BaseFlow`: Abstract base class for all flows
- `PlanningFlow`: A flow that creates and executes structured plans
- `FlowFactory`: Factory for creating different types of flows

## Multi-Channel Processor (MCP)

The Multi-Channel Processor handles different types of inputs through specialized agents:

- Text processing
- Image processing
- Browser interactions
- Tool outputs
- Document processing

## Advantages of the Hub and Spoke Model

1. **Specialization**: Each agent can focus on what it does best
2. **Scalability**: New agents can be added without changing the core architecture
3. **Flexibility**: The orchestrator can dynamically select the best agent for each subtask
4. **Centralized Control**: The hub maintains overall context and ensures progress
5. **Fault Tolerance**: If one agent gets stuck, the orchestrator can intervene

```
                   ┌───────────────┐
                   │               │
                   │  Orchestrator │
                   │    (Hub)      │
                   │               │
                   └───────┬───────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
  ┌────────▼─────┐ ┌───────▼────────┐ ┌────▼────────┐
  │              │ │                │ │             │
  │ Planning     │ │ Browser        │ │ Terminal    │
  │ Agent        │ │ Agent          │ │ Agent       │
  │              │ │                │ │             │
  └──────────────┘ └────────────────┘ └─────────────┘
           │               │               │
           │               │               │
  ┌────────▼─────┐ ┌───────▼────────┐ ┌────▼────────┐
  │              │ │                │ │             │
  │ SWE          │ │ Purchase       │ │ Budget      │
  │ Agent        │ │ Agent          │ │ Agent       │
  │              │ │                │ │             │
  └──────────────┘ └────────────────┘ └─────────────┘
```

## Agent Selection and Transition

The orchestrator selects which agent should handle each step using LLM-based reasoning:

1. Analyze the current situation
2. Determine which agent is best suited for the next step
3. Transition control to that agent
4. Collect results and update shared memory

```typescript
// Example of agent selection logic
private async selectAgent(): Promise<AgentSelection> {
  // Use LLM to analyze current state and determine the best agent
  const nextStep = await this.llm.getNextStepWithReasoning(this.sharedMemory.getMessages());
  
  // Parse the agent selection from the LLM response
  const agentType = this.parseAgentSelectionFromResponse(nextStep.reasoning);
  
  return {
    agentType,
    reason: nextStep.reasoning
  };
}
```

## Structured Planning

A key capability of the multi-agent system is structured planning:

1. The planning agent creates a detailed plan with steps
2. The orchestrator assigns each step to the appropriate specialized agent
3. Results from each step are fed back to update the plan as needed
4. The process continues until the plan is completed or revised

```typitten
private async executeStructuredPlan(): Promise<string[]> {
  const results: string[] = [];
  const completedSteps: Array<{ id: string; description: string; result: string }> = [];
  
  // Execute each step in the plan
  for (const step of this.currentPlan.steps) {
    // Execute step with appropriate agent
    const stepResult = await this.executeStep(step);
    
    // Store result
    results.push(stepResult);
    completedSteps.push({
      id: step.id,
      description: step.description,
      result: stepResult
    });
    
    // Review step with planning agent to see if plan needs adjustment
    const review = await this.reviewStepWithPlanningAgent(
      step,
      stepResult,
      completedSteps
    );
    
    // Update plan if needed
    if (review.planUpdated) {
      this.currentPlan = review.updatedPlan;
    }
    
    // Check if we should continue
    if (!review.shouldContinue) {
      break;
    }
  }
  
  return results;
}
```

## Visualization and Monitoring

The multi-agent system includes visualization capabilities:

- Agent transitions are tracked and visualized
- Memory access is monitored
- The reasoning process is documented

This helps users understand the multi-agent workflow and diagnose issues.

## How to Use the Multi-Agent System

### Basic Usage

```typescript
import { MultiAgentOrchestrator } from './agent/multi-agent';

// Create the orchestrator
const orchestrator = new MultiAgentOrchestrator({
  name: 'TaskOrchestrator',
  maxSteps: 30
});

// Run with a complex task
const result = await orchestrator.run(
  'Research the latest advancements in renewable energy, create a summary document, and save it to the file system'
);
```

### With Custom Agents

You can extend the system with custom agents:

```typescript
import { MultiAgentOrchestrator, AgentType } from './agent/multi-agent';
import { CustomAgent } from './agent/custom';

// Create the orchestrator
const orchestrator = new MultiAgentOrchestrator();

// Add a custom agent
orchestrator.addAgent('custom', new CustomAgent({
  name: 'Custom Agent',
  systemPrompt: '...',
  tools: customTools
}));

// Run with a task for the custom agent
const result = await orchestrator.run(
  'Perform a specialized task using the custom agent'
);
```

## Agent Coordination Patterns

The system implements several coordination patterns:

1. **Sequential**: Agents work in sequence, each completing its task before handing off
2. **Parallel**: Multiple agents work simultaneously on different aspects of a task
3. **Hierarchical**: Agents form a hierarchy with higher-level agents coordinating lower-level ones
4. **Dynamic**: The orchestrator re-evaluates and reassigns tasks based on intermediate results

## Conclusion

The hub and spoke multi-agent architecture in OpenManus provides a powerful framework for building complex AI systems. By combining specialized agents under central coordination, it can tackle tasks that would be difficult for a single agent, while maintaining coherent behavior and progress towards goals. 