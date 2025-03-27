# Example Application: OpenManus Research Assistant

This document demonstrates a complete example application built with OpenManus TypeScript: a research assistant that can gather information, write documents, and create visualizations.

## Application Overview

The Research Assistant combines multiple specialized agents:

1. **Planning Agent**: Creates research plans and outlines
2. **Research Agent**: Searches the web for information
3. **Writing Agent**: Composes well-structured documents
4. **Data Analysis Agent**: Processes and analyzes data
5. **Visualization Agent**: Creates charts and visual elements

## Implementation

### Project Structure

```
research-assistant/
├── src/
│   ├── agents/
│   │   ├── index.ts
│   │   ├── planning-agent.ts
│   │   ├── research-agent.ts
│   │   ├── writing-agent.ts
│   │   ├── data-analysis-agent.ts
│   │   └── visualization-agent.ts
│   ├── tools/
│   │   ├── index.ts
│   │   ├── data-analysis-tools.ts
│   │   └── visualization-tools.ts
│   ├── prompts/
│   │   ├── planning-prompts.ts
│   │   ├── research-prompts.ts
│   │   ├── writing-prompts.ts
│   │   ├── data-analysis-prompts.ts
│   │   └── visualization-prompts.ts
│   ├── config.ts
│   ├── index.ts
│   └── server.ts
├── public/
│   ├── index.html
│   └── styles.css
├── package.json
└── tsconfig.json
```

### Agent Implementation

Here's an example of the Research Agent implementation:

```typescript
// src/agents/research-agent.ts
import { ToolCallAgent, ToolCollection } from 'openmanus';
import { WebSearchTool, BrowserTool } from 'openmanus';
import { RESEARCH_SYSTEM_PROMPT, RESEARCH_NEXT_STEP_PROMPT } from '../prompts/research-prompts';

export class ResearchAgent extends ToolCallAgent {
  constructor(options: any = {}) {
    // Set up research tools
    const tools = new ToolCollection([
      new WebSearchTool(),
      new BrowserTool()
    ]);

    // Initialize the agent
    super({
      ...options,
      name: 'ResearchAgent',
      description: 'Gathers information from various sources',
      systemPrompt: RESEARCH_SYSTEM_PROMPT,
      nextStepPrompt: RESEARCH_NEXT_STEP_PROMPT,
      availableTools: tools,
      maxSteps: options.maxSteps || 15
    });
  }
}
```

### Orchestrator Implementation

```typescript
// src/index.ts
import { MultiAgentOrchestrator, AgentType } from 'openmanus';
import { PlanningAgent } from './agents/planning-agent';
import { ResearchAgent } from './agents/research-agent';
import { WritingAgent } from './agents/writing-agent';
import { DataAnalysisAgent } from './agents/data-analysis-agent';
import { VisualizationAgent } from './agents/visualization-agent';

// Define custom agent types
enum ResearchAgentType {
  PLANNING = 'planning',
  RESEARCH = 'research',
  WRITING = 'writing',
  DATA_ANALYSIS = 'data_analysis',
  VISUALIZATION = 'visualization'
}

// Create and configure the orchestrator
export function createResearchAssistant() {
  // Initialize the orchestrator
  const orchestrator = new MultiAgentOrchestrator({
    name: 'ResearchAssistant',
    maxSteps: 50
  });

  // Add specialized agents
  orchestrator.addAgent(ResearchAgentType.PLANNING, new PlanningAgent());
  orchestrator.addAgent(ResearchAgentType.RESEARCH, new ResearchAgent());
  orchestrator.addAgent(ResearchAgentType.WRITING, new WritingAgent());
  orchestrator.addAgent(ResearchAgentType.DATA_ANALYSIS, new DataAnalysisAgent());
  orchestrator.addAgent(ResearchAgentType.VISUALIZATION, new VisualizationAgent());

  return orchestrator;
}
```

### Web Server

```typescript
// src/server.ts
import express from 'express';
import path from 'path';
import { createResearchAssistant } from './index';

const app = express();
const PORT = process.env.PORT || 3000;

// Create the research assistant
const researchAssistant = createResearchAssistant();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// API endpoint
app.post('/api/research', async (req, res) => {
  try {
    const { topic } = req.body;
    
    if (!topic) {
      return res.status(400).json({ error: 'Topic is required' });
    }
    
    // Run the research assistant
    const result = await researchAssistant.run(
      `Research the following topic and create a comprehensive report with visualizations: ${topic}`
    );
    
    return res.json({ result });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'An error occurred' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

## How It Works

1. The user submits a research topic through the web interface
2. The orchestrator analyzes the request and creates a plan using the Planning Agent
3. The Research Agent gathers information from the web
4. The Data Analysis Agent processes any numerical data
5. The Visualization Agent creates charts or diagrams
6. The Writing Agent composes the final document
7. The results are returned to the user

## Sample Request and Response

### Request
```json
{
  "topic": "The impact of artificial intelligence on healthcare in the last 5 years"
}
```

### Response
```json
{
  "result": {
    "title": "The Impact of Artificial Intelligence on Healthcare (2020-2025)",
    "sections": [
      {
        "title": "Executive Summary",
        "content": "This report examines the significant developments..."
      },
      {
        "title": "Key Applications",
        "content": "1. Diagnostic Imaging: AI has revolutionized..."
      },
      {
        "title": "Statistical Analysis",
        "content": "According to our research, adoption of AI in healthcare has increased by 63% since 2020..."
      }
    ],
    "visualizations": [
      {
        "title": "AI Adoption in Healthcare (2020-2025)",
        "type": "line_chart",
        "data_url": "/images/ai_adoption_chart.png"
      },
      {
        "title": "Key Application Areas",
        "type": "pie_chart",
        "data_url": "/images/application_areas_chart.png"
      }
    ],
    "sources": [
      "World Health Organization (2024)",
      "Journal of Medical AI, Volume 8, Issue 3",
      "Healthcare Technology Review, Annual Report 2025"
    ]
  }
}
```

## Extending the Application

The Research Assistant can be extended in several ways:

1. **Add Domain-Specific Agents**: For specialized fields like medicine or finance
2. **Implement Custom Tools**: For accessing proprietary data sources
3. **Enhance Visualization Capabilities**: Add more chart types and interactive elements
4. **Add Collaborative Features**: Allow multiple users to contribute to research

## Conclusion

This example demonstrates how OpenManus can be used to build a sophisticated multi-agent application. The hub and spoke architecture allows each agent to focus on its specialty while the orchestrator manages the overall workflow. 