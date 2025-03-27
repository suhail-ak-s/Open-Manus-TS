import { ToolCallAgent } from './toolcall';
import { LLM } from '../llm';
import { AgentState } from '../schema';
import { ToolCollection } from '../tool/base';
import { WebSearchTool } from '../tool/web-search';
import { BrowserTool } from '../tool/browser';
import log from '../utils/logger';
import { AgentType } from './multi-agent';
import { StructuredPlan } from './structured-plan';
import { PrivateMemory } from './private-memory';

/**
 * Enhanced PlanningAgent that creates structured plans
 * for the orchestrator to execute
 */
export class PlanningAgent extends ToolCallAgent {
  // Private memory for agent-specific reasoning
  private privateMemory: PrivateMemory;

  /**
   * Create a new planning agent
   */
  constructor(llm: LLM, options: any = {}) {
    // Planning agent needs web tools for research
    const planningTools = new ToolCollection([new WebSearchTool(), new BrowserTool()]);

    // Custom system prompt for planning
    const planningSystemPrompt = `
        You are a Planning Agent within the OpenManus multi-agent system.
        Your role is to create detailed, step-by-step plans for accomplishing complex tasks.

        Your plans should:
        1. Break down tasks into clear, actionable steps
        2. Assign each step to the most appropriate agent type:
           - PLANNING: For creating or refining sub-plans
           - BROWSER: For web research and information gathering
           - TERMINAL: For system operations and command execution
           - SWE: For software engineering tasks
           - PURCHASE: For maritime procurement, spare parts and vendor management
           - CERTIFICATE: For maritime regulations, compliance and vessel certifications
           - BUDGET: For financial planning, cost tracking and budget management
           - DEFECTS: For vessel maintenance, repairs and defect tracking
        3. Specify dependencies between steps when needed
        4. Include clear success criteria for each step

        IMPORTANT: Always produce your plan in a structured format that can be parsed:

        PLAN TITLE: <brief title for the plan>
        PLAN DESCRIPTION: <overview of what the plan will accomplish>

        STEPS:
        1. [AGENT_TYPE] <step description>
           DEPENDS_ON: <step numbers this depends on, if any>
        2. [AGENT_TYPE] <step description>
           DEPENDS_ON: <step numbers this depends on, if any>
        ... and so on

        Think carefully about which agent should handle each step.
        Ensure the steps logically build on each other towards the final goal.
        `;

    // Custom next step prompt
    const planningNextStepPrompt = `
        Think through your approach to creating this plan.
        Consider what information you need to gather and how to structure the steps.
        Then produce a complete plan that can be executed by the orchestrator.

        Remember to specify which agent should handle each step using the [AGENT_TYPE] format.
        Available agent types: PLANNING, BROWSER, TERMINAL, SWE, PURCHASE, CERTIFICATE, BUDGET, DEFECTS
        `;

    // Initialize the tool call agent
    super({
      name: 'PlanningAgent',
      description: 'Creates detailed plans for complex tasks',
      systemPrompt: planningSystemPrompt,
      nextStepPrompt: planningNextStepPrompt,
      maxSteps: 10,
      memory: options.memory,
      llm,
      toolChoices: 'auto',
      availableTools: planningTools,
    });

    // Initialize private memory
    this.privateMemory = new PrivateMemory(AgentType.PLANNING);

    // Add some initial data to private memory
    this.privateMemory.setContext('initialized', true);
    this.privateMemory.setContext('agent_role', 'Planning specialist');
    this.privateMemory.addCapability('create_structured_plans');
    this.privateMemory.addCapability('analyze_requirements');
    this.privateMemory.addCapability('decompose_tasks');

    // Manually emit a memory event if eventHandler is available
    this.emitMemoryEvent('planning_agent_initialized');

    log.info('Enhanced Planning Agent initialized');
  }

  /**
   * Emit a memory event to update the UI
   */
  private emitMemoryEvent(eventType: string): void {
    if (this.eventHandler) {
      try {
        // Create memory snapshot
        const memory = {
          context: this.privateMemory['context'] || {},
          workingMemory: this.privateMemory['workingMemory'] || [],
          capabilities: Array.from(this.privateMemory['capabilities'] || []),
          messages: this.privateMemory.messages || [],
        };

        // Emit event
        this.eventHandler({
          type: 'memory_update',
          agent: AgentType.PLANNING,
          state: this.state,
          message: `Planning memory ${eventType}`,
          details: {
            type: eventType,
            privateMemories: {
              [AgentType.PLANNING]: memory,
            },
            activeAgent: AgentType.PLANNING,
            timestamp: Date.now(),
          },
        });

        log.debug(`Emitted planning memory event: ${eventType}`);
      } catch (error) {
        log.error(
          `Error emitting memory event: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  /**
   * Create a structured plan from the user request
   * @param request User request
   * @returns A structured plan
   */
  async createStructuredPlan(request: string): Promise<StructuredPlan> {
    log.info(`Creating structured plan for request: ${request}`);

    // Store information in private memory
    this.privateMemory.recordReasoning(`Planning for request: ${request}`);
    this.privateMemory.setContext('current_task', request);
    this.privateMemory.setContext('planning_stage', 'initial_plan_creation');
    this.privateMemory.addToWorkingMemory({
      type: 'planning_request',
      timestamp: Date.now(),
      request,
    });

    // Emit memory event after updating private memory
    this.emitMemoryEvent('creating_plan');

    // Add request to memory
    this.memory.addMessage({
      role: 'user',
      content: `Create a structured plan for: ${request}`,
    });

    // Add guidance for plan format
    this.memory.addMessage({
      role: 'system',
      content: `Remember to output the plan in the following format:

            PLAN TITLE: <brief title for the plan>
            PLAN DESCRIPTION: <overview of what the plan will accomplish>

            STEPS:
            1. [AGENT_TYPE] <step description>
               DEPENDS_ON: <step numbers this depends on, if any>
            2. [AGENT_TYPE] <step description>
               DEPENDS_ON: <step numbers this depends on, if any>
            ... and so on

            Available agent types: PLANNING, BROWSER, TERMINAL, SWE, PURCHASE, CERTIFICATE, BUDGET, DEFECTS

            PURCHASE: For maritime procurement, spare parts and vendor management
            CERTIFICATE: For maritime regulations, compliance and vessel certifications
            BUDGET: For financial planning, cost tracking and budget management
            DEFECTS: For vessel maintenance, repairs and defect tracking
            `,
    });

    // Execute thinking step to generate response
    await this.think();

    // Get the assistant's response
    const assistantMessages = this.memory.messages.filter(m => m.role === 'assistant');
    const lastAssistantMsg = assistantMessages[assistantMessages.length - 1];
    const planText = lastAssistantMsg?.content || '';

    // Parse the plan text into a structured plan
    return this.parsePlanFromText(request, planText);
  }

  /**
   * Parse the text response into a structured plan
   */
  private parsePlanFromText(request: string, planText: string): StructuredPlan {
    // Extract title and description
    const titleMatch = planText.match(/PLAN TITLE:\s*(.+?)(?=\n|$)/i);
    const descriptionMatch = planText.match(
      /PLAN DESCRIPTION:\s*(.+?)(?=\n\s*STEPS|\n\s*STEP|\n\s*\d|\n\s*$)/is
    );

    const title = titleMatch ? titleMatch[1].trim() : `Plan for: ${request.substring(0, 50)}`;
    const description = descriptionMatch
      ? descriptionMatch[1].trim()
      : `Generated plan for handling: ${request}`;

    // Create a new structured plan
    const plan = new StructuredPlan(title, description);

    // Extract steps
    const stepsMatch = planText.match(/STEPS?:(.+)$/is);
    if (!stepsMatch) {
      // If no steps found, add a default step
      plan.addStep(`Research and gather information about: ${request}`, AgentType.BROWSER);
      return plan;
    }

    const stepsText = stepsMatch[1];

    // Match step pattern: number followed by agent type in brackets, then description
    const stepRegex = /(\d+)\.\s*\[([^\]]+)\]\s*([^\n]+)(?:\s+DEPENDS_ON:\s*([^\n]+))?/g;

    let match;
    const stepIds: { [stepNumber: string]: string } = {};

    // First pass: create all steps and store their IDs
    while ((match = stepRegex.exec(stepsText)) !== null) {
      const [_, stepNumber, agentTypeStr, description, dependsOnText] = match;

      // Convert agent type string to enum
      let agentType = AgentType.PLANNING;
      switch (agentTypeStr.toUpperCase()) {
        case 'BROWSER':
          agentType = AgentType.BROWSER;
          break;
        case 'TERMINAL':
          agentType = AgentType.TERMINAL;
          break;
        case 'SWE':
          agentType = AgentType.SWE;
          break;
        case 'PURCHASE':
          agentType = AgentType.PURCHASE;
          break;
        case 'CERTIFICATE':
          agentType = AgentType.CERTIFICATE;
          break;
        case 'BUDGET':
          agentType = AgentType.BUDGET;
          break;
        case 'DEFECTS':
          agentType = AgentType.DEFECTS;
          break;
        case 'PLANNING':
        default:
          agentType = AgentType.PLANNING;
      }

      // Add step to plan and store its ID
      const stepId = plan.addStep(description.trim(), agentType);
      stepIds[stepNumber] = stepId;
    }

    // Second pass: set up dependencies
    const dependencyRegex = /(\d+)\.\s*\[([^\]]+)\]\s*([^\n]+)(?:\s+DEPENDS_ON:\s*([^\n]+))?/g;
    while ((match = dependencyRegex.exec(stepsText)) !== null) {
      const [_, stepNumber, __, ___, dependsOnText] = match;

      if (dependsOnText) {
        // Parse dependencies (comma-separated step numbers)
        const dependsOn = dependsOnText
          .split(',')
          .map(d => d.trim())
          .filter(d => stepIds[d]) // Only keep valid step references
          .map(d => stepIds[d]); // Convert to step IDs

        if (dependsOn.length > 0) {
          // Update the step with dependencies
          const stepId = stepIds[stepNumber];
          const step = plan.getStepById(stepId);
          if (step) {
            step.dependsOn = dependsOn;
          }
        }
      }
    }

    // Record the plan in private memory for reference
    this.privateMemory.addToWorkingMemory({
      type: 'structured_plan',
      timestamp: Date.now(),
      plan: plan.toJSON(),
    });

    // Store additional context about the parsed plan
    this.privateMemory.setContext('current_plan_id', plan.id);
    this.privateMemory.setContext('planning_stage', 'plan_parsed');

    // Get all steps in the plan and count them
    const allSteps = plan.getAllSteps();
    const stepCount = allSteps.length;
    this.privateMemory.recordReasoning(
      `Successfully parsed plan: ${title} with ${stepCount} steps`
    );

    // Store specific capabilities needed for this plan
    const uniqueAgentTypes = new Set<string>();
    allSteps.forEach(step => {
      if (step && step.assignedAgent) {
        uniqueAgentTypes.add(String(step.assignedAgent));
      }
    });

    Array.from(uniqueAgentTypes).forEach(agentType => {
      this.privateMemory.addCapability(`work_with_${agentType.toLowerCase()}`);
    });

    // Emit memory event with updated plan details
    this.emitMemoryEvent('plan_parsed');

    return plan;
  }

  /**
   * Refine a plan based on execution results
   */
  async refinePlan(plan: StructuredPlan, executionResults: string): Promise<StructuredPlan> {
    log.info(`Refining plan based on execution results`);

    // Record reasoning
    this.privateMemory.recordReasoning(`Refining plan ${plan.id} based on execution results`);
    this.privateMemory.setContext('planning_stage', 'plan_refinement');
    this.privateMemory.addToWorkingMemory({
      type: 'execution_results',
      planId: plan.id,
      results: executionResults,
      timestamp: Date.now(),
    });

    // Emit memory event for refinement
    this.emitMemoryEvent('refining_plan');

    // Add request to memory
    this.memory.addMessage({
      role: 'user',
      content: `Refine the following plan based on the execution results:

            CURRENT PLAN:
            ${plan.getSummary()}

            EXECUTION RESULTS:
            ${executionResults}

            Please modify the plan accordingly, adding new steps or adjusting existing ones.
            Output the complete revised plan in the structured format.`,
    });

    // Execute thinking step to generate response
    await this.think();

    // Get the assistant's response
    const assistantMessages = this.memory.messages.filter(m => m.role === 'assistant');
    const lastAssistantMsg = assistantMessages[assistantMessages.length - 1];
    const planText = lastAssistantMsg?.content || '';

    // Parse the updated plan
    return this.parsePlanFromText(plan.description, planText);
  }

  /**
   * Review the execution of a single step and provide feedback or plan updates
   * @param plan Current structured plan
   * @param step The step that was just executed
   * @param stepResult The result of the step execution
   * @param completedSteps List of all completed steps so far
   * @returns Updated plan and feedback
   */
  async reviewStepExecution(
    plan: StructuredPlan,
    step: { id: string; description: string; assignedAgent: AgentType },
    stepResult: string,
    completedSteps: Array<{ id: string; description: string; result: string }>
  ): Promise<{
    updatedPlan: StructuredPlan;
    feedback: string;
    shouldContinue: boolean;
  }> {
    log.info(`Reviewing execution of step: ${step.description}`);

    // Record reasoning in private memory
    this.privateMemory.recordReasoning(`Reviewing execution of step ${step.id} in plan ${plan.id}`);

    // Format all completed steps for context
    const completedStepsFormatted = completedSteps
      .map(
        (s, i) =>
          `${i + 1}. [${s.id}] ${s.description}\n   Result: ${s.result.substring(0, 200)}${s.result.length > 200 ? '...' : ''}`
      )
      .join('\n\n');

    // Add review request to memory
    this.memory.addMessage({
      role: 'user',
      content: `Review the execution of the following step in our plan:

PLAN: ${plan.title}
${plan.description}

STEP JUST EXECUTED:
[${step.id}] ${step.description} (Assigned to: ${step.assignedAgent} agent)

RESULT OF EXECUTION:
${stepResult}

PREVIOUSLY COMPLETED STEPS:
${completedStepsFormatted || 'None yet - this was the first step.'}

REMAINING STEPS:
${plan
  .getIncompleteSteps()
  .map(s => `- [${s.id}] ${s.description} (Assigned to: ${s.assignedAgent} agent)`)
  .join('\n')}

Based on this step's result, please:
1. Provide specific feedback about this step's outcome
2. Determine if we should continue with the remaining steps
3. If needed, suggest specific modifications to the remaining steps

IMPORTANT: You are now in the EXECUTION PHASE. The plan has already been created and we are now executing it step by step.
Do NOT restart planning or try to create a completely new plan unless absolutely necessary.
Focus on evaluating THIS specific step's result and providing targeted feedback or adjustments to the EXISTING plan.

Your response should include:
- FEEDBACK: your analysis of the step result
- CONTINUE: [YES/NO] - whether plan execution should continue
- PLAN_CHANGES: [NONE/MODIFY] - whether the plan needs changes

If the plan needs MINOR modifications, follow with your complete revised plan in the structured format:

PLAN TITLE: <title>
PLAN DESCRIPTION: <description>

STEPS:
1. [AGENT_TYPE] <step description>
   DEPENDS_ON: <step numbers this depends on, if any>
...and so on
`,
    });

    // Execute thinking step to generate response
    await this.think();

    // Get the assistant's response
    const assistantMessages = this.memory.messages.filter(m => m.role === 'assistant');
    const lastAssistantMsg = assistantMessages[assistantMessages.length - 1];
    const responseText = lastAssistantMsg?.content || '';

    // Default to continuing execution unless explicitly told to stop
    let shouldContinue = true;
    let feedback = 'Proceeding with plan execution.';
    let needsChanges = false;

    // Parse the response
    const feedbackMatcher = /FEEDBACK:\s*(.+?)(?=\n\s*CONTINUE:|\n\s*PLAN_CHANGES:|\n\s*$)/is.exec(
      responseText
    );
    if (feedbackMatcher) {
      feedback = feedbackMatcher[1].trim();
    }

    const continueMatcher = /CONTINUE:\s*(YES|NO)/i.exec(responseText);
    if (continueMatcher) {
      shouldContinue = continueMatcher[1].toUpperCase() === 'YES';
    }

    const changesMatcher = /PLAN_CHANGES:\s*(NONE|MODIFY)/i.exec(responseText);
    if (changesMatcher) {
      needsChanges = changesMatcher[1].toUpperCase() === 'MODIFY';
    }

    // Only parse the plan if changes were requested AND the plan continues
    let updatedPlan = plan;
    if (needsChanges && shouldContinue) {
      // Find the start of the new plan
      const planTitleIndex = responseText.indexOf('PLAN TITLE:');
      if (planTitleIndex !== -1) {
        // Extract the plan text and parse it
        const planText = responseText.substring(planTitleIndex);
        updatedPlan = this.parsePlanFromText(plan.description, planText);

        // Preserve the completed steps including the current step
        const allCompletedSteps = [
          ...completedSteps,
          {
            id: step.id,
            description: step.description,
            result: stepResult,
          },
        ];

        // Preserve the completion status of already completed steps
        for (const completedStep of allCompletedSteps) {
          const existingStep = updatedPlan.getStepById(completedStep.id);
          if (existingStep) {
            updatedPlan.completeStep(completedStep.id, completedStep.result);
          }
        }
      } else {
        // If we can't find a new plan but changes were requested, just update the current plan
        updatedPlan.completeStep(step.id, stepResult);
        log.warning('Plan changes requested but no valid plan format found in response');
      }
    } else {
      // If no changes needed, just mark the current step complete
      updatedPlan.completeStep(step.id, stepResult);
    }

    log.info(
      `Planning agent review result: Continue=${shouldContinue}, Changes=${needsChanges}, Feedback=${feedback.substring(0, 50)}...`
    );

    return {
      updatedPlan,
      feedback,
      shouldContinue,
    };
  }
}
