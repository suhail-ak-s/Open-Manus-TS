import { BaseAgent } from './base';
import { ToolCallAgent } from './toolcall';
import { SharedMemory } from './shared-memory';
import { AgentState, Memory, Message } from '../schema';
import { LLM } from '../llm';
import log from '../utils/logger';
import { ToolCollection } from '../tool/base';
import { WebSearchTool } from '../tool/web-search';
import { BrowserTool } from '../tool/browser';
import { TerminalTool } from '../tool/terminal';
import { ReadFileTool, WriteFileTool, ListDirectoryTool } from '../tool/file-operations';
import config from '../config';
import visualizer, { EventType } from '../utils/visualization';
import documentationGenerator from '../utils/documentation-generator';
import { PrivateMemory } from './private-memory';
import { PlanningAgent } from './planning-agent';
import { StructuredPlan } from './structured-plan';
import { PlanStep } from './structured-plan';
import { BrowserAgent } from './browser';

// System prompt for the terminal agent
const TERMINAL_SYSTEM_PROMPT = `
You are a Terminal Agent within the OpenManus multi-agent system.
Your role is to execute terminal commands and system operations.

You can:
1. Run shell commands
2. Execute system utilities
3. Manage files and directories
4. Monitor system resources

Be careful with destructive commands and always verify before executing them.
`;

// System prompt for the SWE agent
const SWE_SYSTEM_PROMPT = `
You are a Software Engineering Agent within the OpenManus multi-agent system.
Your role is to handle all coding and software development tasks.

You can:
1. Write and modify code
2. Debug issues
3. Design software architectures
4. Explain technical concepts

Work closely with other agents to implement technical solutions.
`;

/**
 * System prompt for the multi-agent orchestrator
 */
const ORCHESTRATOR_SYSTEM_PROMPT = `
You are the Multi-Agent Orchestrator for the OpenManus system.
Your role is to coordinate multiple specialized agents to solve complex tasks.

You have access to the following specialized agents:
1. Planning Agent - Creates step-by-step plans to achieve goals
2. SWE Agent - Handles software engineering tasks
3. Browser Agent - Manages web interactions and information gathering
4. Terminal Agent - Executes terminal commands
/* Maritime agents commented out
5. Purchase Agent - Specializes in maritime vessel procurement and purchasing
6. Certificate Agent - Handles maritime vessel certifications and compliance
7. Budget Agent - Manages financial planning and budgeting for maritime fleet
8. Defects Agent - Handles vessel maintenance, defects tracking and repairs
*/

Your responsibilities:
- Analyze user requests to determine which agent(s) to use
- Coordinate agent activities and manage transitions between agents
- Maintain overall context and ensure progress toward goals
- Re-plan when necessary if the current approach isn't working

For each user request, follow this process:
1. Analyze the request to understand the overall goal
2. Determine if planning is needed or if a specialized agent can handle it directly
3. Coordinate the appropriate agents to handle different aspects of the task
4. Synthesize results from different agents into coherent responses

Remember that all agents share memory, so they can see what others have done.
`;

/**
 * Next step prompt for the orchestrator
 */
const ORCHESTRATOR_NEXT_STEP_PROMPT = `
Analyze the current situation and decide which agent should handle the next step.

Options:
1. Planning Agent - For creating or revising plans
2. SWE Agent - For software development and code tasks
3. Browser Agent - For web research and information gathering
4. Terminal Agent - For command execution and system operations
/* Maritime agents commented out
5. Purchase Agent - For maritime procurement, spare parts and vendor management
6. Certificate Agent - For maritime regulations, compliance and vessel certifications
7. Budget Agent - For financial planning, cost tracking and budget management
8. Defects Agent - For vessel maintenance, repairs and defect tracking
*/

First, THINK THROUGH what the current goal is and what progress has been made.
Then, decide which specialized agent is best suited for the next step.
`;

/**
 * Agent types supported by the multi-agent system
 */
export enum AgentType {
  ORCHESTRATOR = 'orchestrator',
  PLANNING = 'planning',
  SWE = 'swe',
  BROWSER = 'browser',
  TERMINAL = 'terminal',
  // Maritime agents commented out
  PURCHASE = 'purchase',
  CERTIFICATE = 'certificate',
  BUDGET = 'budget',
  DEFECTS = 'defects',
}

/**
 * Interface for agent selection logic
 */
interface AgentSelection {
  agentType: AgentType;
  reason: string;
}

/**
 * Multi-Agent Orchestrator that coordinates specialized agents
 */
export class MultiAgentOrchestrator extends ToolCallAgent {
  // Shared memory for all agents
  sharedMemory: SharedMemory;

  // Specialized agents
  private agents: Record<AgentType, ToolCallAgent>;

  // Private memories for each agent
  private privateMemories: Partial<Record<AgentType, PrivateMemory>> = {};

  // Currently active agent
  private activeAgentType: AgentType;

  // Current plan
  private currentPlan: StructuredPlan | null = null;

  // Current task ID
  private currentTaskId: string;
  private hasPlan: boolean;
  private taskStartTime: number;

  // Event handler - using declare to indicate we're using the parent class property
  declare eventHandler?: (event: any) => void;

  /**
   * Call the event handler if it exists
   * This is used by the visualization system
   */
  public handleEvent(event: any): void {
    if (this.eventHandler && typeof this.eventHandler === 'function') {
      try {
        this.eventHandler(event);
      } catch (error) {
        log.error(`Error calling event handler: ${(error as Error).message}`);
      }
    }
  }

  /**
   * Create a new multi-agent orchestrator
   */
  constructor(options: any = {}) {
    // Set up basic tools for the orchestrator
    const tools = new ToolCollection([new WebSearchTool(), new BrowserTool()]);

    // Set up the shared memory
    const sharedMemory = new SharedMemory({
      enableFileLogging: options.enableMemoryLogging || false,
      logFilePath: options.memoryLogPath || undefined,
      sessionId: options.taskId || `task_${Date.now()}`
    });
    
    // Connect event handler to shared memory if provided
    if (options.eventHandler) {
      sharedMemory.setEventHandler(options.eventHandler);
    }

    // Initialize the orchestrator
    super({
      ...options,
      name: 'MultiAgentOrchestrator',
      description: 'Coordinates multiple specialized agents',
      systemPrompt: ORCHESTRATOR_SYSTEM_PROMPT,
      nextStepPrompt: ORCHESTRATOR_NEXT_STEP_PROMPT,
      availableTools: tools,
      maxSteps: options.maxSteps || 30,
      memory: sharedMemory,
      toolChoices: 'auto',
    });

    this.sharedMemory = sharedMemory;
    this.activeAgentType = AgentType.ORCHESTRATOR;
    this.currentTaskId = options.taskId || `task_${Date.now()}`;
    this.hasPlan = false;
    this.taskStartTime = 0;
    this.eventHandler = options.eventHandler;

    // Initialize private memory for orchestrator
    this.privateMemories[AgentType.ORCHESTRATOR] = new PrivateMemory(AgentType.ORCHESTRATOR);

    // Register the orchestrator with shared memory
    this.sharedMemory.registerAgent(AgentType.ORCHESTRATOR, AgentState.IDLE, {
      type: AgentType.ORCHESTRATOR,
      role: 'coordinator',
    });

    // Initialize the visualizer with the task ID
    visualizer.setTaskId(this.currentTaskId);

    // Initialize specialized agents
    this.initializeAgents(options);

    // Add initialization event
    visualizer.addEvent(
      EventType.SYSTEM_MESSAGE,
      AgentType.ORCHESTRATOR,
      AgentState.IDLE,
      'Multi-agent system initialized'
    );
    
    // Register as the active multi-agent for visualization
    try {
      (global as any).__activeMultiAgent = this;
    } catch (error) {
      // Ignore errors for browser environments
    }
  }

  /**
   * Initialize all specialized agents
   */
  private initializeAgents(options: any): void {
    // Create LLM instances for each agent
    const planningLLM = new LLM();
    const sweLLM = new LLM();
    const browserLLM = new LLM();
    const terminalLLM = new LLM();
    
    /* Maritime agents commented out
    const purchaseLLM = new LLM();
    const certificateLLM = new LLM();
    const budgetLLM = new LLM();
    const defectsLLM = new LLM();
    */

    // Create a placeholder agent for maritime agents (commented out)
    const createPlaceholderAgent = (name: string): ToolCallAgent => {
      return new ToolCallAgent({
        name: `${name}Agent`,
        description: `Placeholder for ${name} agent (disabled)`,
        systemPrompt: '',
        maxSteps: 1,
        memory: this.sharedMemory,
        llm: new LLM(),
        toolChoices: 'auto',
        availableTools: new ToolCollection([]),
      });
    };

    // Create specialized agent instances
    this.agents = {
      [AgentType.ORCHESTRATOR]: this,
      [AgentType.PLANNING]: this.createPlanningAgent(planningLLM, options),
      [AgentType.SWE]: this.createSWEAgent(sweLLM, options),
      [AgentType.BROWSER]: this.createBrowserAgent(browserLLM, options),
      [AgentType.TERMINAL]: this.createTerminalAgent(terminalLLM, options),
      
      // Use placeholder agents for maritime agents (commented out)
      [AgentType.PURCHASE]: createPlaceholderAgent('Purchase'),
      [AgentType.CERTIFICATE]: createPlaceholderAgent('Certificate'),
      [AgentType.BUDGET]: createPlaceholderAgent('Budget'),
      [AgentType.DEFECTS]: createPlaceholderAgent('Defects'),
    };

    // Initialize private memory for each agent
    Object.keys(this.agents).forEach(type => {
      if (type !== AgentType.ORCHESTRATOR) {
        // Orchestrator already initialized
        this.privateMemories[type] = new PrivateMemory(type);
      }
    });

    // Register all agents with shared memory
    Object.entries(this.agents).forEach(([type, agent]) => {
      if (type !== AgentType.ORCHESTRATOR) {
        // Orchestrator already registered
        this.sharedMemory.registerAgent(type, AgentState.IDLE, {
          type,
          role: type,
        });
      }
    });

    log.info('All specialized agents initialized with private memory');
  }

  /**
   * Create the specialized planning agent
   */
  private createPlanningAgent(llm: LLM, options: any): PlanningAgent {
    log.info('Creating specialized Planning agent');

    // Create planning agent with our delta-enabled shared memory
    const agent = new PlanningAgent({
      llm,
      memory: this.sharedMemory, // Pass shared memory for delta events
      eventHandler: this.eventHandler, // Pass event handler for delta events
      maxSteps: 10,
      maxTokens: 2048,
      ...options,
    });

    // Register in shared memory
    this.sharedMemory.registerAgent(AgentType.PLANNING, AgentState.IDLE, {
      name: 'Planning Agent',
      role: 'Task planner',
      capabilities: ['create_structured_plans', 'revise_plans', 'analyze_requirements']
    });

    return agent;
  }

  /**
   * Create the specialized SWE agent
   */
  private createSWEAgent(llm: LLM, options: any): ToolCallAgent {
    log.info('Creating specialized Software Engineering agent');

    // Create SWE agent
    const tools = new ToolCollection();
    
    // Add file operation tools
    const fileTools = [new ReadFileTool(), new WriteFileTool(), new ListDirectoryTool()];
    tools.addTools(fileTools);

    // Create specialized agent to handle software engineering tasks
    const agent = new ToolCallAgent({
      ...options,
      name: 'SWEAgent',
      description: 'Software engineering specialist',
      systemPrompt: SWE_SYSTEM_PROMPT,
      llm,
      availableTools: tools,
      memory: this.sharedMemory,
      maxSteps: 20,
      eventHandler: this.eventHandler,
    });

    // Register in shared memory
    this.sharedMemory.registerAgent(AgentType.SWE, AgentState.IDLE, {
      name: 'Software Engineering Agent',
      role: 'Code specialist',
      capabilities: ['read_code', 'write_code', 'debug', 'implement_features']
    });

    return agent;
  }

  /**
   * Create the specialized browser agent
   */
  private createBrowserAgent(llm: LLM, options: any): ToolCallAgent {
    log.info('Creating specialized Browser agent');

    // Create browser agent with our delta-enabled shared memory
    const agent = new BrowserAgent({
      llm,
      memory: this.sharedMemory, // Pass shared memory for delta events
      eventHandler: this.eventHandler, // Pass event handler for delta events
      maxSteps: 15,
      maxTokens: 2048,
      ...options,
    });

    // Register in shared memory
    this.sharedMemory.registerAgent(AgentType.BROWSER, AgentState.IDLE, {
      name: 'Browser Agent',
      role: 'Web researcher',
      capabilities: ['search', 'browse', 'extract_info']
    });

    return agent;
  }

  /**
   * Create the specialized terminal agent
   */
  private createTerminalAgent(llm: LLM, options: any): ToolCallAgent {
    log.info('Creating specialized Terminal agent');

    // Create terminal agent
    const tools = new ToolCollection();
    tools.addTool(new TerminalTool());

    // Create specialized agent to handle terminal commands
    const agent = new ToolCallAgent({
      ...options,
      name: 'TerminalAgent',
      description: 'Terminal command specialist',
      systemPrompt: TERMINAL_SYSTEM_PROMPT,
      llm,
      availableTools: tools,
      memory: this.sharedMemory,
      maxSteps: 15,
      eventHandler: this.eventHandler,
    });

    // Register in shared memory
    this.sharedMemory.registerAgent(AgentType.TERMINAL, AgentState.IDLE, {
      name: 'Terminal Agent',
      role: 'Command-line specialist',
      capabilities: ['run_commands', 'install_packages', 'file_operations']
    });

    return agent;
  }

  /**
   * Create the purchase agent specialized in procurement and purchasing for maritime vessels
   */
  /* Maritime agent commented out
  private createPurchaseAgent(llm: LLM, options: any): ToolCallAgent {
    const purchaseSystemPrompt = `
        You are a Purchase Agent within the OpenManus multi-agent system for Synergy Marine Group.
        Your role is to handle all procurement and purchasing related queries for a fleet of 600+ vessels.

        You are specialized in:
        1. Spare parts procurement processes
        2. Vendor management and evaluation
        3. Purchase order tracking and status
        4. Cost optimization strategies
        5. Emergency procurement protocols
        6. Inventory management systems

        As a mock agent for demo purposes:
        - Provide realistic but simulated answers about maritime procurement
        - Use fictional but plausible data about vendors, parts, and purchasing workflows
        - Reference fictional purchase orders with realistic IDs (e.g., PO-2023-45678)
        - Mention realistic spare parts specific to maritime vessels (engines, pumps, navigation equipment)
        - Discuss fictional but plausible cost-saving measures

        Remember you are demonstrating capabilities to Synergy Marine Group who manages 600+ vessels.
        `;

    // Purchase agent uses only LLM capabilities for the demo
    const purchaseTools = new ToolCollection([]);

    return new ToolCallAgent({
      name: 'PurchaseAgent',
      description: 'Handles procurement and purchasing for maritime vessels',
      systemPrompt: purchaseSystemPrompt,
      maxSteps: 8,
      memory: this.sharedMemory,
      llm,
      toolChoices: 'auto',
      availableTools: purchaseTools,
    });
  }
  */

  /**
   * Create the certificate agent specialized in maritime certifications and compliance
   */
  /* Maritime agent commented out
  private createCertificateAgent(llm: LLM, options: any): ToolCallAgent {
    const certificateSystemPrompt = `
        You are a Certificate Agent within the OpenManus multi-agent system for Synergy Marine Group.
        Your role is to handle all maritime certification and compliance related queries for a fleet of 600+ vessels.

        You are specialized in:
        1. Maritime regulatory frameworks (IMO, SOLAS, MARPOL)
        2. Vessel certification requirements and renewal processes
        3. Classification society requirements
        4. Flag state compliance regulations
        5. Port state control inspection preparation
        6. Safety management certifications
        7. Environmental compliance certifications

        As a mock agent for demo purposes:
        - Provide realistic but simulated answers about maritime regulations and certifications
        - Use fictional but plausible certificate IDs and expiration dates
        - Reference realistic regulatory requirements based on IMO, SOLAS, and MARPOL conventions
        - Mention classification societies like Lloyd's Register, DNV-GL, ABS, etc.
        - Discuss realistic compliance challenges and solutions for various vessel types
        - Create fictional but realistic inspection scenarios and preparation requirements

        Remember you are demonstrating capabilities to Synergy Marine Group who manages 600+ vessels.
        `;

    // Certificate agent uses only LLM capabilities for the demo
    const certificateTools = new ToolCollection([]);

    return new ToolCallAgent({
      name: 'CertificateAgent',
      description: 'Handles maritime certifications and compliance',
      systemPrompt: certificateSystemPrompt,
      maxSteps: 8,
      memory: this.sharedMemory,
      llm,
      toolChoices: 'auto',
      availableTools: certificateTools,
    });
  }
  */

  /**
   * Create the budget agent specialized in maritime financial management
   */
  /* Maritime agent commented out
  private createBudgetAgent(llm: LLM, options: any): ToolCallAgent {
    const budgetSystemPrompt = `
        You are a Budget Agent within the OpenManus multi-agent system for Synergy Marine Group.
        Your role is to handle all financial and budgetary queries for a fleet of 600+ vessels.

        You are specialized in:
        1. Vessel operational budget planning
        2. Cost tracking and variance analysis
        3. Expense categorization for maritime operations
        4. Budget forecasting for fleet management
        5. Capital expenditure planning
        6. Cost-saving recommendations
        7. Financial reporting for vessel operations

        As a mock agent for demo purposes:
        - Provide realistic but simulated answers about maritime financial management
        - Use fictional but plausible budget figures appropriate for vessel operations
        - Reference fictional budget reports with realistic IDs and time periods
        - Mention specific expense categories like fuel, crew costs, maintenance, port charges
        - Present fictional but plausible cost analysis with realistic percentage breakdowns
        - Discuss realistic budget forecasting methods and financial planning approaches
        - Create fictional ROI calculations for vessel improvements and maintenance decisions

        Remember you are demonstrating capabilities to Synergy Marine Group who manages 600+ vessels.
        `;

    // Budget agent uses only LLM capabilities for the demo
    const budgetTools = new ToolCollection([]);

    return new ToolCallAgent({
      name: 'BudgetAgent',
      description: 'Handles budgetary and financial planning for maritime fleet',
      systemPrompt: budgetSystemPrompt,
      maxSteps: 8,
      memory: this.sharedMemory,
      llm,
      toolChoices: 'auto',
      availableTools: budgetTools,
    });
  }
  */

  /**
   * Create the defects agent specialized in maritime vessel maintenance and repairs
   */
  /* Maritime agent commented out
  private createDefectsAgent(llm: LLM, options: any): ToolCallAgent {
    const defectsSystemPrompt = `
        You are a Defects Agent within the OpenManus multi-agent system for Synergy Marine Group.
        Your role is to handle all maintenance, defect tracking, and repair related queries for a fleet of 600+ vessels.

        You are specialized in:
        1. Vessel maintenance scheduling and planning
        2. Defect identification and categorization
        3. Critical equipment failure analysis
        4. Repair procedures and protocols
        5. Preventive maintenance strategies
        6. Condition monitoring systems
        7. Dry-docking planning and coordination

        As a mock agent for demo purposes:
        - Provide realistic but simulated answers about vessel maintenance and defect management
        - Use fictional but plausible defect IDs, maintenance schedules, and repair timelines
        - Reference common maritime equipment like main engines, auxiliary engines, boilers, pumps
        - Mention specific failure modes and troubleshooting techniques for vessel equipment
        - Discuss realistic preventive maintenance strategies with specific timeframes
        - Create fictional but plausible repair procedures for common maritime equipment issues
        - Provide realistic dry-docking scenarios, requirements, and planning considerations

        Remember you are demonstrating capabilities to Synergy Marine Group who manages 600+ vessels.
        `;

    // Defects agent uses only LLM capabilities for the demo
    const defectsTools = new ToolCollection([]);

    return new ToolCallAgent({
      name: 'DefectsAgent',
      description: 'Handles vessel maintenance, defects and repairs',
      systemPrompt: defectsSystemPrompt,
      maxSteps: 8,
      memory: this.sharedMemory,
      llm,
      toolChoices: 'auto',
      availableTools: defectsTools,
    });
  }
  */

  /**
   * Determine which agent should handle the current step
   */
  private async selectAgent(): Promise<AgentSelection> {
    log.thinking('Orchestrator is selecting the next agent...');

    // Get recent messages for context
    const recentMessages = this.sharedMemory.messages.slice(-5);
    const lastUserMessage = recentMessages.find(m => m.role === 'user')?.content || '';

    // Build selection prompt
    const selectionPrompt = `
        Based on the current context and the following recent messages:

        ${recentMessages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n')}

        Select the most appropriate agent to handle the next step.
        Available agents: planning, swe, browser, terminal

        First analyze the goal, then provide your selection in the format:
        AGENT: <agent_type>
        REASON: <reason for selection>
        `;

    // Get LLM recommendation
    let selection: AgentSelection;
    try {
      const response = await this.llm.ask([{ role: 'user', content: selectionPrompt }]);

      // Parse the response to extract agent and reason
      const agentMatch = response.match(/AGENT:\s*(\w+)/i);
      const reasonMatch = response.match(/REASON:\s*(.+?)(?=\n|$)/is);

      const agentType = agentMatch?.[1]?.toLowerCase();
      const reason = reasonMatch?.[1]?.trim() || 'No specific reason provided';

      // Validate agent type
      let validAgentType: AgentType;
      switch (agentType) {
        case 'planning':
          validAgentType = AgentType.PLANNING;
          break;
        case 'swe':
          validAgentType = AgentType.SWE;
          break;
        case 'browser':
          validAgentType = AgentType.BROWSER;
          break;
        case 'terminal':
          validAgentType = AgentType.TERMINAL;
          break;
        default:
          // Default to orchestrator itself if no valid selection
          validAgentType = AgentType.ORCHESTRATOR;
      }

      selection = {
        agentType: validAgentType,
        reason,
      };
    } catch (error) {
      log.error(`Error selecting agent: ${(error as Error).message}`);
      // Default to orchestrator if there's an error
      selection = {
        agentType: AgentType.ORCHESTRATOR,
        reason: 'Failed to select specialized agent due to an error',
      };
    }

    log.info(`Selected agent: ${selection.agentType} because: ${selection.reason}`);
    return selection;
  }

  /**
   * Override the think method to include agent selection and visualization
   */
  async think(): Promise<boolean> {
    // Get the last assistant message for documentation
    const lastMessages = this.memory.messages.slice(-3);
    const assistantMsg = lastMessages.find(m => m.role === 'assistant')?.content || '';

    // Add thinking event to visualization
    const thinkEventId = visualizer.addEvent(
      EventType.AGENT_THINKING,
      this.activeAgentType,
      this.state,
      `${this.activeAgentType} agent thinking on step ${this.currentStep}`,
      undefined,
      this.currentStep
    );

    // Add to documentation with detailed content
    documentationGenerator.addEvent({
      id: `${this.currentTaskId}_thinking_${Date.now()}`,
      timestamp: Date.now(),
      type: EventType.AGENT_THINKING,
      agent: this.activeAgentType,
      state: this.state,
      message: assistantMsg || `${this.activeAgentType} agent thinking on step ${this.currentStep}`,
      details: {
        recentMessages: this.memory.messages.slice(-3).map(m => ({
          role: m.role,
          content:
            m.content?.substring(0, 500) + (m.content && m.content.length > 500 ? '...' : ''),
        })),
      },
      step: this.currentStep,
    });

    // Check for stuck/loop conditions before proceeding
    if (this.isAgentStuck()) {
      log.warning(
        `Detected agent ${this.activeAgentType} stuck in a loop. Orchestrator intervening.`
      );

      // Add loop detection event
      const loopEventId = visualizer.addEvent(
        EventType.LOOP_DETECTED,
        this.activeAgentType,
        this.state,
        `Detected ${this.activeAgentType} agent stuck in a loop`,
        undefined,
        this.currentStep,
        thinkEventId
      );

      // Add to documentation
      documentationGenerator.addEvent({
        id: `${this.currentTaskId}_loop_${Date.now()}`,
        timestamp: Date.now(),
        type: EventType.LOOP_DETECTED,
        agent: this.activeAgentType,
        state: this.state,
        message: `Detected ${this.activeAgentType} agent stuck in a loop`,
        step: this.currentStep,
      });

      // Add intervention event
      const interventionId = visualizer.addEvent(
        EventType.INTERVENTION,
        AgentType.ORCHESTRATOR,
        AgentState.RUNNING,
        'Orchestrator intervening to resolve loop',
        undefined,
        this.currentStep,
        loopEventId
      );

      // Add to documentation
      documentationGenerator.addEvent({
        id: `${this.currentTaskId}_intervention_${Date.now()}`,
        timestamp: Date.now(),
        type: EventType.INTERVENTION,
        agent: AgentType.ORCHESTRATOR,
        state: AgentState.RUNNING,
        message: 'Orchestrator intervening to resolve loop',
        step: this.currentStep,
      });

      // Force switch back to orchestrator
      this.activeAgentType = AgentType.ORCHESTRATOR;
      this.sharedMemory.updateAgentState(AgentType.ORCHESTRATOR, AgentState.RUNNING);

      // Add transition event
      visualizer.addEvent(
        EventType.AGENT_TRANSITION,
        AgentType.ORCHESTRATOR,
        AgentState.RUNNING,
        `Switched to orchestrator agent for intervention`,
        undefined,
        this.currentStep,
        interventionId
      );

      // Add to documentation
      documentationGenerator.addEvent({
        id: `${this.currentTaskId}_transition_${Date.now()}`,
        timestamp: Date.now(),
        type: EventType.AGENT_TRANSITION,
        agent: AgentType.ORCHESTRATOR,
        state: AgentState.RUNNING,
        message: `Switched to orchestrator agent for intervention`,
        step: this.currentStep,
      });

      // Add intervention message
      this.memory.addMessage({
        role: 'system',
        content: `The ${this.activeAgentType} agent appears to be stuck in a loop. The orchestrator is intervening to move the task forward.`,
      });

      // Add guidance for what to do next
      this.memory.addMessage({
        role: 'user',
        content: `Please make an executive decision to continue with this trip planning task.
                Either proceed with a default plan for a popular destination,
                or finalize the process and ask the user for more specific preferences.`,
      });

      return super.think();
    }

    // First step requires special handling for initial agent selection
    if (this.currentStep === 1) {
      // Add selection event
      const selectionEventId = visualizer.addEvent(
        EventType.AGENT_SELECTION,
        AgentType.ORCHESTRATOR,
        this.state,
        'Selecting initial agent for task',
        undefined,
        this.currentStep,
        thinkEventId
      );

      // Add an initial user message to prime the agent selection
      const selectionPrompt = `
            Based on the user query, select the most appropriate agent to handle this task:

            USER QUERY: ${this.memory.messages.find(m => m.role === 'user')?.content || ''}

            Available agents:
            1. Planning Agent - Creates detailed plans for complex tasks (trip planning, project planning, etc.)
            2. SWE Agent - Software engineering tasks (coding, debugging, technical design)
            3. Browser Agent - Web browsing and information gathering
            4. Terminal Agent - Command execution and system operations

            Analyze the query and explain which agent should handle it and why.
            IMPORTANT: DO NOT use any tools or execute any actions in this phase. Just explain your reasoning.
            `;

      this.memory.addMessage({ role: 'user', content: selectionPrompt });

      // Use standard thinking to get a response, but we'll override the tool calls
      await this.llm.ask(this.memory.messages);

      // Get the last assistant message
      const assistantMsgs = this.memory.messages.filter(m => m.role === 'assistant');
      const lastAssistantMsg = assistantMsgs[assistantMsgs.length - 1];

      // Only take the content part, ignore any tool calls
      if (lastAssistantMsg) {
        const content = lastAssistantMsg.content || '';

        // Parse the response to determine the selected agent
        const agentType = this.parseAgentSelectionFromResponse(content);

        // Add the processed response to memory (without tool calls)
        this.memory.addMessage({
          role: 'assistant',
          content,
        });

        if (agentType !== AgentType.ORCHESTRATOR) {
          log.info(`Initial agent selection: ${agentType}`);

          // Add selected agent event
          visualizer.addEvent(
            EventType.AGENT_TRANSITION,
            agentType,
            AgentState.IDLE,
            `Selected ${agentType} agent to handle the task`,
            { reasoning: content },
            this.currentStep,
            selectionEventId
          );

          this.activeAgentType = agentType;
          this.sharedMemory.updateAgentState(agentType, AgentState.RUNNING);

          // Add a transition message
          this.memory.addMessage({
            role: 'system',
            content: `Transferring task to ${agentType} agent for handling...`,
          });

          // Create a new clean memory context for the agent
          const agent = this.agents[this.activeAgentType];

          // Get the original user request
          const originalUserRequest = this.memory.messages.find(
            m =>
              m.role === 'user' &&
              m.content &&
              !m.content.includes('Based on the user query, select')
          )?.content;

          if (originalUserRequest) {
            // Start with a clean memory for the specialized agent
            agent.memory.messages = [];

            // Add the agent's system prompt
            if (agent.systemPrompt) {
              agent.memory.addMessage({
                role: 'system',
                content: agent.systemPrompt,
              });
            }

            // Add a specific direction to begin with reasoning
            agent.memory.addMessage({
              role: 'system',
              content: `Begin by explaining your approach to this task. Think through the process step by step before using any tools.`,
            });

            // Add the original user request
            agent.memory.addMessage({
              role: 'user',
              content: originalUserRequest,
            });

            // Add the next step prompt if it exists
            if (agent.nextStepPrompt) {
              agent.memory.addMessage({
                role: 'user',
                content: agent.nextStepPrompt,
              });
            }
          }

          // Add agent start event
          visualizer.addEvent(
            EventType.AGENT_THINKING,
            agentType,
            AgentState.RUNNING,
            `${agentType} agent starting work on task`,
            undefined,
            this.currentStep,
            selectionEventId
          );

          // Let the selected agent think on the original query with clean context
          return await agent.think();
        }

        return true;
      }

      return false;
    }

    // For subsequent steps, use the existing selection logic
    const selection = await this.selectAgent();

    // Add selection event
    const subsequentSelectionId = visualizer.addEvent(
      EventType.AGENT_SELECTION,
      AgentType.ORCHESTRATOR,
      this.state,
      `Selecting agent for step ${this.currentStep}`,
      { selection },
      this.currentStep,
      thinkEventId
    );

    // If a different agent is selected, switch to it
    if (selection.agentType !== this.activeAgentType) {
      log.info(`Switching from ${this.activeAgentType} to ${selection.agentType}`);

      // Add transition event
      visualizer.addEvent(
        EventType.AGENT_TRANSITION,
        selection.agentType,
        AgentState.IDLE,
        `Switching from ${this.activeAgentType} to ${selection.agentType}`,
        { reason: selection.reason },
        this.currentStep,
        subsequentSelectionId
      );

      this.activeAgentType = selection.agentType;

      // Update agent states
      this.sharedMemory.updateAgentState(this.activeAgentType, AgentState.RUNNING);

      // Add a transition message
      this.memory.addMessage({
        role: 'system',
        content: `Transferring task to ${selection.agentType} agent because: ${selection.reason}`,
      });
    }

    // If orchestrator remains active, use standard thinking
    if (this.activeAgentType === AgentType.ORCHESTRATOR) {
      return super.think();
    }

    // Let the selected agent think
    const agent = this.agents[this.activeAgentType];
    return await agent.think();
  }

  /**
   * Check if the current agent is stuck in a loop
   */
  private isAgentStuck(): boolean {
    // If we're in the first 2 steps, not enough history to detect loops
    if (this.currentStep < 3) {
      return false;
    }

    // Get recent messages from current agent
    const recentMessages = this.memory.messages.slice(-6);
    const assistantMessages = recentMessages.filter(m => m.role === 'assistant');

    // Need at least 3 messages to detect a pattern
    if (assistantMessages.length < 3) {
      return false;
    }

    // Check for repetition in the last 3 assistant messages
    const lastMessages = assistantMessages.slice(-3).map(m => m.content || '');

    // Content similarity check
    let similarityScore = 0;
    for (let i = 0; i < lastMessages.length - 1; i++) {
      const current = lastMessages[i];
      const next = lastMessages[i + 1];

      // Calculate similarity ratio (Crude measure: looking for key phrases)
      const phrases = [
        'gather user preferences',
        'destination preferences',
        'information needed',
        'directly ask the user',
        'not yet provided specific preferences',
      ];

      const matchCount = phrases.filter(
        phrase => current.toLowerCase().includes(phrase) && next.toLowerCase().includes(phrase)
      ).length;

      // If more than 3 key phrases match, consider messages very similar
      if (matchCount >= 3) {
        similarityScore++;
      }
    }

    // If similarity score is high, the agent is likely stuck
    return similarityScore >= 1;
  }

  /**
   * Special intervention method for when agents are stuck
   */
  private async interveneForStuckAgent(): Promise<string> {
    // Determine what kind of task we're working on
    if (this.activeAgentType === AgentType.PLANNING) {
      // For trip planning, make an executive decision to proceed
      log.info('Orchestrator intervening in trip planning task');

      // Switch to using the browser agent to gather information
      this.activeAgentType = AgentType.BROWSER;
      this.sharedMemory.updateAgentState(AgentType.BROWSER, AgentState.RUNNING);

      // Clear the memory and start fresh
      const agent = this.agents[AgentType.BROWSER];
      agent.memory.messages = [];

      // Add clear direction to the browser agent
      agent.memory.addMessage({
        role: 'system',
        content: `The planning process was stuck due to missing user preferences. Please search for popular 7-day trip destinations and gather information to create a sample itinerary. Focus on providing concrete information rather than asking for more preferences.`,
      });

      return 'Orchestrator intervention: switching to Browser Agent to gather information for a default trip plan';
    }

    // Default intervention
    return 'Orchestrator intervention: restarting the task with revised approach';
  }

  /**
   * Parse agent selection from the orchestrator's reasoning
   */
  private parseAgentSelectionFromResponse(content: string): AgentType {
    // Look for direct mentions of specific agents
    const planningMentions = [
      /planning agent/i,
      /agent.*planning/i,
      /plan.*trip/i,
      /create.*plan/i,
      /step.by.step plan/i,
    ];

    const sweMentions = [/swe agent/i, /software.*agent/i, /coding/i, /developer/i, /engineer/i];

    const browserMentions = [
      /browser agent/i,
      /web.*agent/i,
      /search/i,
      /browse/i,
      /information gathering/i,
      /research/i,
    ];

    const terminalMentions = [
      /terminal agent/i,
      /command.*agent/i,
      /system operation/i,
      /execute command/i,
    ];

    /* Maritime agents commented out
    const purchaseMentions = [
      /purchase agent/i,
      /procurement/i,
      /spare parts/i,
      /buying/i,
      /vendor/i,
      /supplier/i,
      /supply chain/i,
      /purchase order/i,
      /inventory/i,
    ];

    const certificateMentions = [
      /certificate agent/i,
      /certification/i,
      /regulatory/i,
      /compliance/i,
      /maritime regulations/i,
      /safety certificate/i,
      /vessel certification/i,
      /imo/i,
      /solas/i,
      /marpol/i,
      /classification/i,
    ];

    const budgetMentions = [
      /budget agent/i,
      /financial/i,
      /cost/i,
      /budget/i,
      /expense/i,
      /finance/i,
      /spending/i,
      /operational cost/i,
      /forecast/i,
    ];

    const defectsMentions = [
      /defects agent/i,
      /maintenance/i,
      /repair/i,
      /defect/i,
      /vessel maintenance/i,
      /equipment failure/i,
      /breakdown/i,
      /technical issue/i,
      /dry dock/i,
    ];
    */

    // Check if the response strongly indicates a specific agent
    if (planningMentions.some(pattern => pattern.test(content))) {
      return AgentType.PLANNING;
    }

    if (sweMentions.some(pattern => pattern.test(content))) {
      return AgentType.SWE;
    }

    if (browserMentions.some(pattern => pattern.test(content))) {
      return AgentType.BROWSER;
    }

    if (terminalMentions.some(pattern => pattern.test(content))) {
      return AgentType.TERMINAL;
    }

    /* Maritime agents commented out
    if (purchaseMentions.some(pattern => pattern.test(content))) {
      return AgentType.PURCHASE;
    }

    if (certificateMentions.some(pattern => pattern.test(content))) {
      return AgentType.CERTIFICATE;
    }

    if (budgetMentions.some(pattern => pattern.test(content))) {
      return AgentType.BUDGET;
    }

    if (defectsMentions.some(pattern => pattern.test(content))) {
      return AgentType.DEFECTS;
    }
    */

    // Default to orchestrator if no clear pattern
    return AgentType.ORCHESTRATOR;
  }

  /**
   * Override the act method to use the active agent and track in visualization
   */
  async act(): Promise<string> {
    // Get the last assistant message for documentation
    const lastAssistantMsg = this.memory.messages.find(m => m.role === 'assistant')?.content || '';

    // Add acting event to visualization
    const actEventId = visualizer.addEvent(
      EventType.AGENT_ACTING,
      this.activeAgentType,
      this.state,
      `${this.activeAgentType} agent acting on step ${this.currentStep}`,
      undefined,
      this.currentStep
    );

    // Add to documentation with richer content
    documentationGenerator.addEvent({
      id: `${this.currentTaskId}_acting_${Date.now()}`,
      timestamp: Date.now(),
      type: EventType.AGENT_ACTING,
      agent: this.activeAgentType,
      state: this.state,
      message:
        lastAssistantMsg || `${this.activeAgentType} agent acting on step ${this.currentStep}`,
      details: {
        latestThought: lastAssistantMsg,
      },
      step: this.currentStep,
    });

    let result: string;

    // If orchestrator is active, use standard acting
    if (this.activeAgentType === AgentType.ORCHESTRATOR) {
      result = await super.act();
    } else {
      // Let the selected agent act
      const agent = this.agents[this.activeAgentType];
      result = await agent.act();
    }

    // If the result contains tool usage, add tool event
    if (result.includes('Using tool') || result.includes('tool completed')) {
      // Extract tool information if available
      const toolMatch = result.match(/Using tool: (\w+)(.*)/);
      const toolName = toolMatch ? toolMatch[1] : 'unknown';

      const toolEventId = visualizer.addEvent(
        EventType.TOOL_USE,
        this.activeAgentType,
        this.state,
        `Tool usage: ${result.substring(0, 100)}...`,
        { result, toolName },
        this.currentStep,
        actEventId
      );

      // Try to extract more information for documentation
      const toolDetails: any = {
        result,
        fullOutput: result,
      };

      // Look for URLs in browser tools
      const urlMatch = result.match(/https?:\/\/[^\s)]+/);
      if (urlMatch) {
        toolDetails.url = urlMatch[0];
      }

      // Look for search queries
      const searchMatch = result.match(/query: "([^"]+)"/);
      if (searchMatch) {
        toolDetails.query = searchMatch[1];
      }

      // Look for content extraction
      const contentMatch = result.match(/Content: ```([\s\S]+?)```/);
      if (contentMatch) {
        toolDetails.extractedContent = contentMatch[1];
      }

      // Add to documentation with more detailed information
      documentationGenerator.addEvent({
        id: `${this.currentTaskId}_tool_${Date.now()}`,
        timestamp: Date.now(),
        type: EventType.TOOL_USE,
        agent: this.activeAgentType,
        state: this.state,
        message: `Using tool: ${toolName} - ${result.substring(0, 200)}...`,
        details: toolDetails,
        step: this.currentStep,
      });
    }

    return result;
  }

  /**
   * Create a task ID for the current request
   */
  private generateTaskId(request: string): string {
    const timestamp = Date.now();
    const hash = Math.floor(Math.random() * 10000);
    return `task_${timestamp}_${hash}`;
  }

  /**
   * Reset the orchestrator state for a new run
   */
  private resetState(): void {
    this.activeAgentType = AgentType.ORCHESTRATOR;
    this.hasPlan = false;
    this.currentPlan = null;
    this.currentStep = 0;
    this.taskStartTime = Date.now();

    // Reset all agent states
    Object.keys(this.agents).forEach(type => {
      this.sharedMemory.updateAgentState(type as AgentType, AgentState.IDLE);
    });
  }

  /**
   * Override the run method to use structured planning
   */
  async run(request?: string): Promise<string> {
    if (this.state !== AgentState.IDLE) {
      throw new Error(`Cannot run agent from state: ${this.state}`);
    }

    // Reset state for a new run
    this.resetState();
    this.currentTaskId = this.generateTaskId(request || 'No request provided');
    this.taskStartTime = Date.now(); // Store task start time for duration calculation

    // Store current request for reference
    const currentRequest = request;

    // Initialize documentation generator
    documentationGenerator.initTask(this.currentTaskId, currentRequest);

    // Add initial request to memory
    if (currentRequest) {
      this.memory.addMessage({
        role: 'user',
        content: currentRequest,
      });
    }

    // Update orchestrator state
    this.state = AgentState.RUNNING;
    this.activeAgentType = AgentType.ORCHESTRATOR;
    this.sharedMemory.updateAgentState(AgentType.ORCHESTRATOR, AgentState.RUNNING);

    // Add a run start event
    visualizer.addEvent(
      EventType.SYSTEM_MESSAGE,
      AgentType.ORCHESTRATOR,
      AgentState.RUNNING,
      `Orchestrator starting new task: ${this.currentTaskId}`
    );

    // Determine if the request needs planning
    const needsPlanning = await this.doesRequestNeedPlanning(currentRequest);
    log.info(`Request planning assessment: ${needsPlanning ? 'Needs planning' : 'Simple request'}`);

    // Add planning decision event
    visualizer.addEvent(
      EventType.SYSTEM_MESSAGE,
      AgentType.ORCHESTRATOR,
      AgentState.RUNNING,
      `Orchestrator determined request ${needsPlanning ? 'requires' : 'does not require'} planning`,
      { needsPlanning }
    );

    const results: string[] = [];
    let finalAnswer = '';

    try {
      if (needsPlanning) {
        // PLANNING PHASE
        log.info('Starting planning phase for complex request');

        // Add planning phase event
        visualizer.addEvent(
          EventType.SYSTEM_MESSAGE,
          AgentType.ORCHESTRATOR,
          AgentState.RUNNING,
          `Orchestrator determined this request requires planning`,
          { needsPlanning, phase: 'planning' }
        );

        // Add to documentation
        documentationGenerator.addEvent({
          id: `${this.currentTaskId}_planning_phase_${Date.now()}`,
          timestamp: Date.now(),
          type: EventType.SYSTEM_MESSAGE,
          agent: AgentType.ORCHESTRATOR,
          state: AgentState.RUNNING,
          message: `Starting planning phase for request`,
          details: { request, needsPlanning: true },
        });

        // Request a structured plan
        const plan = await this.requestStructuredPlan(currentRequest);

        // EXECUTION PHASE
        log.info('Starting execution phase for structured plan');

        // Add execution phase event
        visualizer.addEvent(
          EventType.SYSTEM_MESSAGE,
          AgentType.ORCHESTRATOR,
          AgentState.RUNNING,
          `Orchestrator beginning plan execution phase`,
          { phase: 'execution', planId: plan.id }
        );

        // Add to documentation
        documentationGenerator.addEvent({
          id: `${this.currentTaskId}_execution_phase_${Date.now()}`,
          timestamp: Date.now(),
          type: EventType.SYSTEM_MESSAGE,
          agent: AgentType.ORCHESTRATOR,
          state: AgentState.RUNNING,
          message: `Starting execution phase for structured plan`,
          details: { planId: plan.id, title: plan.title },
        });

        // Execute the plan
        const planResults = await this.executeStructuredPlan();
        results.push(...planResults);

        // Generate a final answer by synthesizing all information gathered
        finalAnswer = await this.generateFinalAnswer(currentRequest, planResults);
        results.push(`FINAL ANSWER: ${finalAnswer}`);

        // Add final results to memory
        this.memory.addMessage({
          role: 'system',
          content: `Task execution completed with results:\n${planResults.join('\n')}\n\nFinal answer: ${finalAnswer}`,
        });
      } else {
        // Simple request that doesn't need planning
        log.info('Handling simple request without planning');

        // Add simple handling event
        visualizer.addEvent(
          EventType.SYSTEM_MESSAGE,
          AgentType.ORCHESTRATOR,
          AgentState.RUNNING,
          `Orchestrator handling simple request directly`,
          { needsPlanning, directExecution: true }
        );

        // Execute request directly by thinking and acting as orchestrator
        this.memory.addMessage({
          role: 'system',
          content: `This request will be handled directly without complex planning.`,
        });

        // Execute steps until task completion
        let stepAttempts = 0;
        const maxSteps = 10;

        while (stepAttempts < maxSteps) {
          stepAttempts++;
          this.currentStep = stepAttempts;

          try {
            // Think
            await this.think();

            // Act
            const actionResult = await this.act();
            results.push(actionResult);

            // Check if we're done
            if (
              actionResult.includes('TASK_COMPLETE') ||
              actionResult.includes('task is complete')
            ) {
              log.info('Task marked as complete by orchestrator');
              break;
            }
          } catch (error) {
            log.error(`Error during step ${stepAttempts}: ${(error as Error).message}`);
            this.memory.addMessage({
              role: 'system',
              content: `Error during execution: ${(error as Error).message}`,
            });
            results.push(`Error: ${(error as Error).message}`);
            break;
          }
        }

        // For simple requests, generate a direct answer
        finalAnswer = await this.generateDirectAnswer(results);
        results.push(`FINAL ANSWER: ${finalAnswer}`);
      }

      // Final step to summarize the task execution
      await this.summarizeAgentResults();

      // Update state
      this.state = AgentState.IDLE;
      this.sharedMemory.updateAgentState(AgentType.ORCHESTRATOR, AgentState.IDLE);
    } catch (error) {
      log.error(`Error during task execution: ${(error as Error).message}`);
      this.memory.addMessage({
        role: 'system',
        content: `Error during task execution: ${(error as Error).message}`,
      });

      results.push(`Error: ${(error as Error).message}`);
      finalAnswer = `Unable to complete the task due to an error: ${(error as Error).message}`;

      // Update state
      this.state = AgentState.ERROR;
      this.sharedMemory.updateAgentState(AgentType.ORCHESTRATOR, AgentState.ERROR);
    }

    // Add the final answer to documentation
    documentationGenerator.addEvent({
      id: `${this.currentTaskId}_final_answer_${Date.now()}`,
      timestamp: Date.now(),
      type: EventType.COMPLETION,
      agent: AgentType.ORCHESTRATOR,
      state: AgentState.FINISHED,
      message: `Task completed with final answer`,
      details: {
        finalAnswer,
        taskDuration: Date.now() - this.taskStartTime,
        results: results.slice(-5), // Include last few results for context
      },
    });

    // Generate visualizations
    try {
      const jsonPath = visualizer.saveToJson();
      log.info(`Saved visualization data to: ${jsonPath}`);

      const htmlPath = visualizer.generateD3Visualization();
      log.info(`Generated interactive visualization at: ${htmlPath}`);

      // Add paths to results
      results.push(`Visualization JSON: ${jsonPath}`);
      results.push(`Interactive visualization: ${htmlPath}`);
    } catch (error) {
      log.error(`Error generating visualizations: ${(error as Error).message}`);
    }

    // Generate documentation report
    try {
      const reportPath = documentationGenerator.generateTaskReport();
      log.info(`Generated documentation report at: ${reportPath}`);
      results.push(`Documentation report: ${reportPath}`);

      // Generate user-friendly report
      const userReportPath = documentationGenerator.generateUserFriendlyReport();
      log.info(`Generated user-friendly report at: ${userReportPath}`);
      results.push(`User-friendly report: ${userReportPath}`);
    } catch (error) {
      log.error(`Error generating documentation: ${(error as Error).message}`);
    }

    return finalAnswer;
  }

  /**
   * Generate a comprehensive final answer from all gathered information
   * for complex requests that required planning
   */
  private async generateFinalAnswer(request: string, results: string[]): Promise<string> {
    log.info('Generating final answer from execution results');

    try {
      // If there are no results, provide a default answer
      if (!results || results.length === 0) {
        return `I've attempted to address your request about "${request}", but wasn't able to gather sufficient information. Please try a more specific request or provide additional details.`;
      }

      const prompt = `
            Synthesize a comprehensive answer based on the execution results of this task.

            ORIGINAL REQUEST: ${request}

            EXECUTION RESULTS:
            ${results.join('\n').substring(0, 3000)}

            Create a clear, concise summary that directly answers the user's request.
            Focus on delivering the most important information and findings.
            Be specific and concrete rather than general or vague.
            Include any key decisions made, information gathered, and final conclusions.
            `;

      const response = await this.llm.ask([{ role: 'user', content: prompt }]);

      // Add a synthesis event to visualization
      visualizer.addEvent(
        EventType.SYSTEM_MESSAGE,
        AgentType.ORCHESTRATOR,
        AgentState.RUNNING,
        'Orchestrator synthesizing final answer',
        {
          request,
          synthesisLength: response.length,
        }
      );

      return (
        response ||
        `Based on my analysis, I've gathered information about your request: "${request}". The plan execution was ${this.currentPlan?.getCompletionPercentage() || 0}% complete.`
      );
    } catch (error) {
      log.error(`Error generating final answer: ${(error as Error).message}`);
      return `I've gathered information about "${request}" but encountered an error while synthesizing the final answer. The execution was completed with ${this.currentPlan?.getCompletionPercentage() || 0}% of the plan steps finished.`;
    }
  }

  /**
   * Generate a direct answer for simple requests
   */
  private async generateDirectAnswer(results: string[]): Promise<string> {
    log.info('Generating direct answer for simple request');

    try {
      // If there are no results, provide a default answer
      if (!results || results.length === 0) {
        const recentMessages = this.memory.messages.slice(-5);
        const userRequest = recentMessages.find(m => m.role === 'user')?.content || 'your request';
        return `I've processed your request about "${userRequest}", but wasn't able to gather sufficient information. Please try a more specific request.`;
      }

      const recentMessages = this.memory.messages.slice(-5);
      const userRequest = recentMessages.find(m => m.role === 'user')?.content || '';

      const prompt = `
            Based on the following conversation and results, provide a direct answer to the user's request.

            CONVERSATION:
            ${recentMessages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n')}

            RESULTS FROM EXECUTION:
            ${results.join('\n').substring(0, 1000)}

            Provide a clear, direct answer that addresses the user's request.
            `;

      const response = await this.llm.ask([{ role: 'user', content: prompt }]);

      return (
        response ||
        `Based on my analysis of your request: "${userRequest}", I've found relevant information but was unable to generate a complete answer.`
      );
    } catch (error) {
      log.error(`Error generating direct answer: ${(error as Error).message}`);
      return `I've processed your request but encountered an error while preparing the final answer. Here's what I found: ${results.slice(-2).join(' ')}`;
    }
  }

  /**
   * Summarize results from all agents involved in the task
   */
  private summarizeAgentResults(): void {
    // Track agent activity
    const agentActivity: Record<
      AgentType,
      {
        actions: number;
        transitions: number;
        decisions: number;
      }
    > = {
      [AgentType.ORCHESTRATOR]: { actions: 0, transitions: 0, decisions: 0 },
      [AgentType.PLANNING]: { actions: 0, transitions: 0, decisions: 0 },
      [AgentType.BROWSER]: { actions: 0, transitions: 0, decisions: 0 },
      [AgentType.TERMINAL]: { actions: 0, transitions: 0, decisions: 0 },
      [AgentType.SWE]: { actions: 0, transitions: 0, decisions: 0 },
      [AgentType.PURCHASE]: { actions: 0, transitions: 0, decisions: 0 },
      [AgentType.CERTIFICATE]: { actions: 0, transitions: 0, decisions: 0 },
      [AgentType.BUDGET]: { actions: 0, transitions: 0, decisions: 0 },
      [AgentType.DEFECTS]: { actions: 0, transitions: 0, decisions: 0 },
    };

    // Force the orchestrator to be included in used agents
    const usedAgentTypes = new Set<AgentType>([AgentType.ORCHESTRATOR]);

    // Count messages by contributor
    this.sharedMemory.messages.forEach((message, index) => {
      const contributorId = this.sharedMemory.getMessageContributor(index);
      if (contributorId) {
        usedAgentTypes.add(contributorId as AgentType);

        // Track as an action
        if (contributorId in agentActivity) {
          agentActivity[contributorId as AgentType].actions++;
        }
      }
    });

    // Add explicit tracking of orchestrator transitions
    if (this.currentPlan) {
      // Every completed step represents a transition and a decision
      const completedSteps = this.currentPlan.getCompletedSteps();
      agentActivity[AgentType.ORCHESTRATOR].transitions += completedSteps.length;
      agentActivity[AgentType.ORCHESTRATOR].decisions += completedSteps.length;

      // Count agent usage from the plan
      completedSteps.forEach(step => {
        usedAgentTypes.add(step.assignedAgent);

        // Increment action count for the agent that executed the step
        if (step.assignedAgent in agentActivity) {
          agentActivity[step.assignedAgent].actions++;
        }
      });
    } else {
      // For non-plan based execution, assume at least one orchestrator decision
      agentActivity[AgentType.ORCHESTRATOR].decisions += 1;
    }

    // Always ensure orchestrator has at least minimum counts
    agentActivity[AgentType.ORCHESTRATOR].decisions = Math.max(
      agentActivity[AgentType.ORCHESTRATOR].decisions,
      1
    );

    // Format agent list with activity counts
    const agentList = Array.from(usedAgentTypes)
      .map(agentType => {
        const activity = agentActivity[agentType];
        return `${agentType}${activity ? ` (${activity.actions} actions)` : ''}`;
      })
      .join(', ');

    log.info(`Task completed using agents: ${agentList}`);

    // Generate a detailed activity summary
    let activitySummary = `## Agent Activity Summary\n\n`;
    activitySummary += `### Orchestrator Activity\n`;
    activitySummary += `- Orchestration decisions: ${agentActivity[AgentType.ORCHESTRATOR].decisions}\n`;
    activitySummary += `- Agent transitions managed: ${agentActivity[AgentType.ORCHESTRATOR].transitions}\n`;
    activitySummary += `- Direct actions: ${agentActivity[AgentType.ORCHESTRATOR].actions}\n\n`;

    activitySummary += `### Agent Contributions\n`;
    for (const [agentType, activity] of Object.entries(agentActivity)) {
      if (agentType !== AgentType.ORCHESTRATOR && activity.actions > 0) {
        activitySummary += `- ${agentType}: ${activity.actions} actions\n`;
      }
    }

    // Add a final summary to documentation
    documentationGenerator.addEvent({
      id: `${this.currentTaskId}_final_summary_${Date.now()}`,
      timestamp: Date.now(),
      type: EventType.COMPLETION,
      agent: AgentType.ORCHESTRATOR,
      state: AgentState.FINISHED,
      message: `Task completed using the following agents: ${agentList}`,
      details: {
        agentActivity,
        activitySummary,
        totalMessages: this.sharedMemory.messages.length,
        totalSteps: this.currentStep,
      },
    });
  }

  /**
   * Transition to a specialized agent for a specific task and then return to orchestrator
   */
  private async transitionToAgent(targetAgent: AgentType, reason: string): Promise<void> {
    log.info(`Transitioning from ${this.activeAgentType} to ${targetAgent} because: ${reason}`);

    // Skip if already the target agent
    if (this.activeAgentType === targetAgent) {
      log.info(`Already using ${targetAgent}, no transition needed`);
      return;
    }

    // Add transition event to visualization
    visualizer.addEvent(
      EventType.AGENT_TRANSITION,
      targetAgent,
      AgentState.IDLE,
      `Transitioning to ${targetAgent} agent: ${reason}`,
      { reason }
    );

    // Add to documentation
    documentationGenerator.addEvent({
      id: `${this.currentTaskId}_transition_${Date.now()}`,
      timestamp: Date.now(),
      type: EventType.AGENT_TRANSITION,
      agent: this.activeAgentType,
      state: this.state,
      message: `Transitioning to ${targetAgent} agent: ${reason}`,
      details: { reason },
    });

    // Update agent states
    this.sharedMemory.updateAgentState(this.activeAgentType, AgentState.IDLE);
    this.sharedMemory.updateAgentState(targetAgent, AgentState.RUNNING);

    // Switch active agent
    const previousAgent = this.activeAgentType;
    this.activeAgentType = targetAgent;

    // Add a transition message
    this.memory.addMessage({
      role: 'system',
      content: `Transferring task to ${targetAgent} agent because: ${reason}`,
    });

    try {
      // Execute the target agent for a single step
      const agent = this.agents[targetAgent];
      await agent.think();
      await agent.act();

      // After agent completes, always return to orchestrator
      if (targetAgent !== AgentType.ORCHESTRATOR) {
        // Mark the specialized agent as completed
        this.sharedMemory.updateAgentState(targetAgent, AgentState.IDLE);

        // Add transition back to orchestrator event
        visualizer.addEvent(
          EventType.AGENT_TRANSITION,
          AgentType.ORCHESTRATOR,
          AgentState.IDLE,
          `Returning to orchestrator after ${targetAgent} completed its task`,
          { previousAgent: targetAgent }
        );

        // Add to documentation
        documentationGenerator.addEvent({
          id: `${this.currentTaskId}_return_to_orchestrator_${Date.now()}`,
          timestamp: Date.now(),
          type: EventType.AGENT_TRANSITION,
          agent: targetAgent,
          state: AgentState.IDLE,
          message: `Returning to orchestrator after completing task`,
          details: {
            previousAgent: targetAgent,
            result: 'Task execution completed',
          },
        });

        // Set orchestrator as active again
        this.activeAgentType = AgentType.ORCHESTRATOR;
        this.sharedMemory.updateAgentState(AgentType.ORCHESTRATOR, AgentState.RUNNING);

        // Add a transition message
        this.memory.addMessage({
          role: 'system',
          content: `${targetAgent} agent has completed its task. Control returned to orchestrator.`,
        });
      }
    } catch (error) {
      log.error(`Error during agent transition: ${(error as Error).message}`);

      // Return to orchestrator on error
      this.activeAgentType = AgentType.ORCHESTRATOR;
      this.sharedMemory.updateAgentState(AgentType.ORCHESTRATOR, AgentState.RUNNING);

      // Add error message
      this.memory.addMessage({
        role: 'system',
        content: `Error during ${targetAgent} execution: ${(error as Error).message}. Control returned to orchestrator.`,
      });
    }
  }

  /**
   * Request a structured plan from the planning agent
   */
  private async requestStructuredPlan(request: string): Promise<StructuredPlan> {
    log.info('Requesting structured plan from planning agent');

    // First transition to the planning agent
    await this.transitionToAgent(AgentType.PLANNING, 'Creating structured plan for the task');

    // Get the planning agent
    const planningAgent = this.agents[AgentType.PLANNING] as PlanningAgent;

    // Create the structured plan
    const plan = await planningAgent.createStructuredPlan(request);

    // Store the plan
    this.currentPlan = plan;
    this.hasPlan = true;

    // Add plan to visualization
    visualizer.addEvent(
      EventType.SYSTEM_MESSAGE,
      AgentType.PLANNING,
      AgentState.RUNNING,
      `Created structured plan: ${plan.title}`,
      { plan: plan.toJSON() }
    );

    // Add to documentation
    documentationGenerator.addEvent({
      id: `${this.currentTaskId}_plan_created_${Date.now()}`,
      timestamp: Date.now(),
      type: EventType.SYSTEM_MESSAGE,
      agent: AgentType.PLANNING,
      state: AgentState.RUNNING,
      message: `Created structured plan: ${plan.title}`,
      details: {
        plan: plan.toJSON(),
        summary: plan.getSummary(),
      },
    });

    // Add a message to shared memory about the plan
    this.memory.addMessage({
      role: 'system',
      content: `The planning agent has created a structured plan:\n\n${plan.getSummary()}`,
    });

    return plan;
  }

  /**
   * Execute the current structured plan
   */
  private async executeStructuredPlan(): Promise<string[]> {
    if (!this.currentPlan) {
      return ['No plan to execute'];
    }

    const results: string[] = [];
    const completedStepsDetails: Array<{ id: string; description: string; result: string }> = [];

    // Add plan execution event
    visualizer.addEvent(
      EventType.SYSTEM_MESSAGE,
      AgentType.ORCHESTRATOR,
      AgentState.RUNNING,
      `Beginning execution of plan: ${this.currentPlan.title}`,
      { plan: this.currentPlan.toJSON() }
    );

    // Add to documentation
    documentationGenerator.addEvent({
      id: `${this.currentTaskId}_plan_execution_start_${Date.now()}`,
      timestamp: Date.now(),
      type: EventType.SYSTEM_MESSAGE,
      agent: AgentType.ORCHESTRATOR,
      state: AgentState.RUNNING,
      message: `Beginning execution of plan: ${this.currentPlan.title}`,
      details: {
        plan: this.currentPlan.toJSON(),
        summary: this.currentPlan.getSummary(),
      },
    });

    // Execute steps in dependency order until plan is complete
    let stepAttempts = 0;
    const maxStepAttempts = 20; // Prevent infinite loops
    let shouldContinuePlan = true;

    // Enhanced tracking for better progress management
    const executedStepIds = new Set<string>();
    let consecutiveIdenticalSteps = 0;
    let lastExecutedStepId = '';
    let stuckCounter = 0;

    // Track agent usage to ensure a mix of specialized agents
    const agentUsage: Record<AgentType, number> = {
      [AgentType.ORCHESTRATOR]: 0,
      [AgentType.PLANNING]: 0,
      [AgentType.BROWSER]: 0,
      [AgentType.TERMINAL]: 0,
      [AgentType.SWE]: 0,
      [AgentType.PURCHASE]: 0,
      [AgentType.CERTIFICATE]: 0,
      [AgentType.BUDGET]: 0,
      [AgentType.DEFECTS]: 0,
    };

    while (
      !this.currentPlan.isCompleted() &&
      stepAttempts < maxStepAttempts &&
      shouldContinuePlan
    ) {
      stepAttempts++;

      // Get all next executable steps (those whose dependencies are satisfied)
      const executableSteps = this.currentPlan.getExecutableSteps();

      if (executableSteps.length === 0) {
        log.warning('No executable steps found, but plan is not complete');
        results.push('Plan execution halted: No executable steps found');
        break;
      }

      // Prioritize steps based on agent type to ensure a balanced execution
      // Prefer using less-used agents first, with special preference for browser/research steps early on
      const prioritizedSteps = [...executableSteps].sort((a, b) => {
        // First prefer steps that gather information (browser agent)
        if (a.assignedAgent === AgentType.BROWSER && b.assignedAgent !== AgentType.BROWSER) {
          return -1;
        }
        if (a.assignedAgent !== AgentType.BROWSER && b.assignedAgent === AgentType.BROWSER) {
          return 1;
        }

        // Then prefer less-used agents to ensure balance
        return agentUsage[a.assignedAgent] - agentUsage[b.assignedAgent];
      });

      // Select the highest priority step
      const nextStep = prioritizedSteps[0];

      // Loop detection - check if we're stuck on the same step repeatedly
      if (nextStep.id === lastExecutedStepId) {
        consecutiveIdenticalSteps++;

        if (consecutiveIdenticalSteps >= 2) {
          log.warning(
            `Loop detected: Same step (${nextStep.id}: ${nextStep.description}) attempted ${consecutiveIdenticalSteps} times in a row`
          );
          results.push(
            `Loop detected while executing plan. Marking step "${nextStep.description}" as complete to progress.`
          );

          // Force the step to complete to break the loop
          this.currentPlan.completeStep(
            nextStep.id,
            `Step forcibly completed by orchestrator to break execution loop.`
          );

          // Add loop detection event
          visualizer.addEvent(
            EventType.LOOP_DETECTED,
            AgentType.ORCHESTRATOR,
            AgentState.RUNNING,
            `Loop detected executing step: ${nextStep.description}`,
            { step: nextStep, consecutiveAttempts: consecutiveIdenticalSteps }
          );

          // Add to documentation
          documentationGenerator.addEvent({
            id: `${this.currentTaskId}_loop_detection_${Date.now()}`,
            timestamp: Date.now(),
            type: EventType.LOOP_DETECTED,
            agent: AgentType.ORCHESTRATOR,
            state: AgentState.RUNNING,
            message: `Loop detected executing step: ${nextStep.description}`,
            details: { step: nextStep, consecutiveAttempts: consecutiveIdenticalSteps },
          });

          // Move on to the next iteration to get a different step
          continue;
        }
      } else {
        // Reset counter when we move to a different step
        consecutiveIdenticalSteps = 0;
        lastExecutedStepId = nextStep.id;
      }

      // Log the step we're about to execute and its assigned agent
      log.info(
        `Executing plan step ${stepAttempts}: "${nextStep.description}" using ${nextStep.assignedAgent} agent`
      );

      // Log dependency information
      const deps = this.currentPlan.getStepDependencies(nextStep.id);
      if (deps && deps.length > 0) {
        const completedDeps = deps.filter(dep => this.currentPlan?.isStepCompleted(dep) ?? false);
        log.info(`Step has ${deps.length} dependencies, ${completedDeps.length} satisfied`);
      }

      // Increment the usage counter for this agent type
      agentUsage[nextStep.assignedAgent]++;

      // Execute the step with the specialized agent
      let stepResult;
      try {
        stepResult = await this.executeStep(nextStep);
        results.push(stepResult);

        // Add to completed steps tracking
        completedStepsDetails.push({
          id: nextStep.id,
          description: nextStep.description,
          result: stepResult,
        });

        // Mark the step as complete in the plan
        this.currentPlan.completeStep(nextStep.id, stepResult);

        // Reset stuck counter on successful execution
        stuckCounter = 0;
      } catch (error) {
        log.error(`Error executing step: ${(error as Error).message}`);
        results.push(`Error executing step: ${(error as Error).message}`);

        // Increment stuck counter
        stuckCounter++;

        if (stuckCounter >= 3) {
          log.warning(
            `Multiple execution errors detected. Marking step as complete to make progress.`
          );
          this.currentPlan.completeStep(
            nextStep.id,
            `Step marked complete after errors: ${(error as Error).message}`
          );
          stuckCounter = 0;
        }

        // Continue with next step
        continue;
      }

      // Check progress by counting completed steps
      const totalSteps = this.currentPlan.getAllSteps().length;
      const completedSteps = this.currentPlan.getCompletedSteps().length;
      log.info(
        `Plan progress: ${completedSteps}/${totalSteps} steps completed (${Math.round((completedSteps / totalSteps) * 100)}%)`
      );

      // Only review with planning agent after the initial information gathering
      // This ensures we have real data before planning the day-by-day itineraries
      const hasExecutedBrowserSteps = agentUsage[AgentType.BROWSER] > 0;
      const isAfterInitialResearch = hasExecutedBrowserSteps && completedSteps >= 3;

      if (isAfterInitialResearch && nextStep.assignedAgent === AgentType.PLANNING) {
        // Have the planning agent review the step execution
        const reviewResult = await this.reviewStepWithPlanningAgent(
          nextStep,
          stepResult,
          completedStepsDetails
        );

        // Update the plan if needed
        if (reviewResult.planUpdated) {
          this.currentPlan = reviewResult.updatedPlan;

          // Add plan update notification to results
          results.push(`Plan updated by planning agent: ${reviewResult.feedback}`);

          // Add plan update event
          visualizer.addEvent(
            EventType.SYSTEM_MESSAGE,
            AgentType.PLANNING,
            AgentState.RUNNING,
            `Updated plan after step execution: ${reviewResult.feedback}`,
            {
              plan: this.currentPlan.toJSON(),
              feedback: reviewResult.feedback,
            }
          );

          // Add to documentation
          documentationGenerator.addEvent({
            id: `${this.currentTaskId}_plan_update_after_step_${Date.now()}`,
            timestamp: Date.now(),
            type: EventType.SYSTEM_MESSAGE,
            agent: AgentType.PLANNING,
            state: AgentState.RUNNING,
            message: `Planning agent updated plan after step execution`,
            details: {
              executedStep: nextStep,
              feedback: reviewResult.feedback,
              updatedPlan: this.currentPlan.toJSON(),
            },
          });

          // Inform the agents about the plan update
          this.memory.addMessage({
            role: 'system',
            content: `The planning agent has reviewed the execution results and updated the plan: ${reviewResult.feedback}`,
          });
        } else {
          // Add the feedback to results even if plan wasn't updated
          results.push(`Planning agent feedback: ${reviewResult.feedback}`);

          // Add feedback event
          visualizer.addEvent(
            EventType.SYSTEM_MESSAGE,
            AgentType.PLANNING,
            AgentState.RUNNING,
            `Step execution review: ${reviewResult.feedback}`,
            {
              feedback: reviewResult.feedback,
            }
          );

          // Add to documentation
          documentationGenerator.addEvent({
            id: `${this.currentTaskId}_step_review_${Date.now()}`,
            timestamp: Date.now(),
            type: EventType.SYSTEM_MESSAGE,
            agent: AgentType.PLANNING,
            state: AgentState.RUNNING,
            message: `Planning agent reviewed step execution: ${nextStep.description}`,
            details: {
              executedStep: nextStep,
              feedback: reviewResult.feedback,
            },
          });
        }

        // Check if we should continue with the plan
        shouldContinuePlan = reviewResult.shouldContinue;
        if (!shouldContinuePlan) {
          log.info('Planning agent has recommended stopping plan execution');
          results.push('Plan execution stopped based on planning agent recommendation');

          // Add early termination event
          visualizer.addEvent(
            EventType.SYSTEM_MESSAGE,
            AgentType.PLANNING,
            AgentState.RUNNING,
            `Recommended stopping plan execution: ${reviewResult.feedback}`,
            {
              reason: reviewResult.feedback,
            }
          );

          // Add to documentation
          documentationGenerator.addEvent({
            id: `${this.currentTaskId}_plan_early_termination_${Date.now()}`,
            timestamp: Date.now(),
            type: EventType.SYSTEM_MESSAGE,
            agent: AgentType.PLANNING,
            state: AgentState.RUNNING,
            message: `Planning agent recommended stopping plan execution`,
            details: {
              reason: reviewResult.feedback,
            },
          });

          break;
        }
      } else {
        log.info(`Skipping planning agent review for step with agent ${nextStep.assignedAgent}`);
      }
    }

    // Mark plan as complete if all steps were executed successfully
    if (shouldContinuePlan && stepAttempts < maxStepAttempts && !this.currentPlan.getNextStep()) {
      this.currentPlan.markCompleted();
    }

    // Check completion status and add appropriate events
    if (this.currentPlan.isCompleted()) {
      const completionMsg = `Plan execution completed: ${this.currentPlan.title}`;
      log.info(completionMsg);
      results.push(completionMsg);

      // Add completion event
      visualizer.addEvent(
        EventType.COMPLETION,
        AgentType.ORCHESTRATOR,
        AgentState.RUNNING,
        completionMsg,
        {
          plan: this.currentPlan.toJSON(),
          completionPercentage: this.currentPlan.getCompletionPercentage(),
        }
      );

      // Add to documentation
      documentationGenerator.addEvent({
        id: `${this.currentTaskId}_plan_execution_complete_${Date.now()}`,
        timestamp: Date.now(),
        type: EventType.COMPLETION,
        agent: AgentType.ORCHESTRATOR,
        state: AgentState.RUNNING,
        message: completionMsg,
        details: {
          plan: this.currentPlan.toJSON(),
          completionPercentage: this.currentPlan.getCompletionPercentage(),
          finalSummary: this.currentPlan.getSummary(),
        },
      });
    } else if (!shouldContinuePlan) {
      // Plan was intentionally stopped early by the planning agent
      const earlyStopMsg = `Plan execution stopped early by planning agent recommendation (${this.currentPlan.getCompletionPercentage()}% complete)`;
      log.info(earlyStopMsg);
      results.push(earlyStopMsg);

      // Add early completion event
      visualizer.addEvent(
        EventType.COMPLETION,
        AgentType.ORCHESTRATOR,
        AgentState.RUNNING,
        earlyStopMsg,
        {
          plan: this.currentPlan.toJSON(),
          completionPercentage: this.currentPlan.getCompletionPercentage(),
          earlyCompletion: true,
        }
      );

      // Add to documentation
      documentationGenerator.addEvent({
        id: `${this.currentTaskId}_plan_early_completion_${Date.now()}`,
        timestamp: Date.now(),
        type: EventType.COMPLETION,
        agent: AgentType.ORCHESTRATOR,
        state: AgentState.RUNNING,
        message: earlyStopMsg,
        details: {
          plan: this.currentPlan.toJSON(),
          completionPercentage: this.currentPlan.getCompletionPercentage(),
          earlyCompletion: true,
        },
      });
    } else {
      const incompleteMsg = `Plan execution incomplete: ${this.currentPlan.getCompletionPercentage()}% complete`;
      log.warning(incompleteMsg);
      results.push(incompleteMsg);

      // Add incomplete event
      visualizer.addEvent(
        EventType.ERROR,
        AgentType.ORCHESTRATOR,
        AgentState.RUNNING,
        incompleteMsg,
        {
          plan: this.currentPlan.toJSON(),
          completionPercentage: this.currentPlan.getCompletionPercentage(),
          incompleteSteps: this.currentPlan.getIncompleteSteps().length,
        }
      );

      // Add to documentation
      documentationGenerator.addEvent({
        id: `${this.currentTaskId}_plan_execution_incomplete_${Date.now()}`,
        timestamp: Date.now(),
        type: EventType.ERROR,
        agent: AgentType.ORCHESTRATOR,
        state: AgentState.RUNNING,
        message: incompleteMsg,
        details: {
          plan: this.currentPlan.toJSON(),
          completionPercentage: this.currentPlan.getCompletionPercentage(),
          incompleteSteps: this.currentPlan.getIncompleteSteps().map(s => s.description),
        },
      });
    }

    // Log agent usage statistics
    log.info(
      `Agent usage during plan execution: ${Object.entries(agentUsage)
        .filter(([_, count]) => count > 0)
        .map(([agent, count]) => `${agent}: ${count} steps`)
        .join(', ')}`
    );

    return results;
  }

  /**
   * Have the planning agent review a step execution and potentially update the plan
   */
  private async reviewStepWithPlanningAgent(
    executedStep: PlanStep,
    stepResult: string,
    completedSteps: Array<{ id: string; description: string; result: string }>
  ): Promise<{
    feedback: string;
    shouldContinue: boolean;
    planUpdated: boolean;
    updatedPlan: StructuredPlan;
  }> {
    log.info(`Reviewing execution of step: ${executedStep.description}`);

    if (!this.currentPlan) {
      return {
        feedback: 'No current plan to review',
        shouldContinue: false,
        planUpdated: false,
        updatedPlan: new StructuredPlan('Empty Plan', 'No plan available'),
      };
    }

    // Get the planning agent
    const planningAgent = this.agents[AgentType.PLANNING] as PlanningAgent;

    // Store current state
    const previousActiveAgent = this.activeAgentType;

    // Update states for planning execution
    this.activeAgentType = AgentType.PLANNING;
    this.sharedMemory.updateAgentState(AgentType.ORCHESTRATOR, AgentState.IDLE);
    this.sharedMemory.updateAgentState(AgentType.PLANNING, AgentState.RUNNING);

    // Add a transition message
    this.memory.addMessage({
      role: 'system',
      content: `Transferring task to planning agent for reviewing step execution: ${executedStep.description}`,
    });

    try {
      // Have the planning agent review the step execution
      const stepInfo = {
        id: executedStep.id,
        description: executedStep.description,
        assignedAgent: executedStep.assignedAgent,
      };

      const reviewResult = await planningAgent.reviewStepExecution(
        this.currentPlan,
        stepInfo,
        stepResult,
        completedSteps
      );

      // Reset states
      this.activeAgentType = previousActiveAgent;
      this.sharedMemory.updateAgentState(AgentType.PLANNING, AgentState.IDLE);
      this.sharedMemory.updateAgentState(AgentType.ORCHESTRATOR, AgentState.RUNNING);

      // Add a transition back message
      this.memory.addMessage({
        role: 'system',
        content: `Planning agent completed the review. Control returned to orchestrator.`,
      });

      // Add review result to memory for documentation
      this.memory.addMessage({
        role: 'system',
        content: `Planning agent review result: Continue=${reviewResult.shouldContinue}, Changes=${reviewResult.updatedPlan.id !== this.currentPlan.id}, Feedback=${reviewResult.feedback.substring(0, 100)}...`,
      });

      // Determine if the plan was updated meaningfully
      const planUpdated =
        reviewResult.updatedPlan.id !== this.currentPlan.id ||
        JSON.stringify(reviewResult.updatedPlan.toJSON()) !==
          JSON.stringify(this.currentPlan.toJSON());

      // Force continue unless there's a specific reason not to
      // This helps prevent getting stuck in loops
      let shouldContinue = true;
      if (!reviewResult.shouldContinue) {
        // Only stop if there's a clear indication in the feedback
        const stopIndicators = [
          'complete',
          'finished',
          'done',
          'goal achieved',
          'objective met',
          'critical error',
          'cannot proceed',
          'insurmountable issue',
        ];

        const hasStopIndicator = stopIndicators.some(indicator =>
          reviewResult.feedback.toLowerCase().includes(indicator)
        );

        shouldContinue = !hasStopIndicator;

        if (shouldContinue) {
          log.info('Overriding planning agent recommendation to stop - no clear reason found');
        }
      }

      return {
        feedback: reviewResult.feedback,
        shouldContinue,
        planUpdated,
        updatedPlan: reviewResult.updatedPlan,
      };
    } catch (error) {
      // Reset states on error
      this.activeAgentType = previousActiveAgent;
      this.sharedMemory.updateAgentState(AgentType.PLANNING, AgentState.IDLE);
      this.sharedMemory.updateAgentState(AgentType.ORCHESTRATOR, AgentState.RUNNING);

      const errorMessage = `Error during planning agent review: ${(error as Error).message}`;
      log.error(errorMessage);

      // Add error message
      this.memory.addMessage({
        role: 'system',
        content: errorMessage,
      });

      // On error, default to continuing with the current plan
      return {
        feedback: errorMessage,
        shouldContinue: true,
        planUpdated: false,
        updatedPlan: this.currentPlan,
      };
    }
  }

  /**
   * Execute a single step from the plan
   */
  private async executeStep(step: PlanStep): Promise<string> {
    log.info(
      `Orchestrator decision: Executing step "${step.description}" with agent ${step.assignedAgent}`
    );

    // Add step execution event
    const stepEventId = visualizer.addEvent(
      EventType.AGENT_SELECTION,
      AgentType.ORCHESTRATOR,
      AgentState.RUNNING,
      `Orchestrator selecting ${step.assignedAgent} to execute: ${step.description}`,
      {
        step,
        agent: step.assignedAgent,
        orchestratorDecision: true,
      }
    );

    // Add to documentation
    documentationGenerator.addEvent({
      id: `${this.currentTaskId}_orchestrator_decision_${Date.now()}`,
      timestamp: Date.now(),
      type: EventType.AGENT_SELECTION,
      agent: AgentType.ORCHESTRATOR,
      state: AgentState.RUNNING,
      message: `Orchestrator selecting ${step.assignedAgent} to execute: ${step.description}`,
      details: {
        step,
        assignedAgent: step.assignedAgent,
        orchestratorDecision: true,
      },
    });

    try {
      let resultMessage = '';

      // Handle execution differently based on agent type
      if (step.assignedAgent === AgentType.PLANNING) {
        // For planning agent, we need special handling to avoid loops
        resultMessage = await this.executeStepWithPlanningAgent(step);
      } else if (step.assignedAgent === AgentType.BROWSER) {
        // For browser agent, we need to ensure it actually performs web searches
        resultMessage = await this.executeStepWithBrowserAgent(step);
      } else {
        // For other specialized agents, transition control directly
        await this.transitionToAgent(
          step.assignedAgent,
          `Executing plan step: ${step.description}`
        );

        // Log when control returns to orchestrator
        log.info(`Orchestrator regained control after ${step.assignedAgent} completed step`);

        // Get the active agent that just completed the step
        const agent = this.agents[step.assignedAgent];

        // First try to get the agent's reasoning from its memory
        const agentReasoningMessage = agent.memory.messages
          .filter(m => m.role === 'assistant')
          .pop();
          
        let resultMessage = '';
        
        // If we found the agent's reasoning, use that
        if (agentReasoningMessage?.content) {
          resultMessage = agentReasoningMessage.content;
        } 
        // Otherwise fallback to the last few messages
        else {
          // Get the result from the last message
          const lastMessages = this.memory.messages.slice(-3);
          resultMessage = lastMessages
            .filter(m => m.role === 'assistant' || m.role === 'tool')
            .map(m => m.content || '')
            .join('\n');
        }
          
        // Add the agent's results to shared memory with proper attribution
        if (resultMessage.trim().length > 0) {
          this.sharedMemory.addMessageWithContributor(
            {
              role: 'assistant',
              content: resultMessage,
              timestamp: Date.now(),
            },
            step.assignedAgent
          );
        }
      }

      // Add step completion event
      visualizer.addEvent(
        EventType.AGENT_TRANSITION,
        AgentType.ORCHESTRATOR,
        AgentState.RUNNING,
        `Orchestrator received results from ${step.assignedAgent} for step: ${step.description}`,
        {
          step,
          result: resultMessage.substring(0, 200),
          returnToOrchestrator: true,
        },
        undefined,
        stepEventId
      );

      // Add to documentation
      documentationGenerator.addEvent({
        id: `${this.currentTaskId}_orchestrator_evaluation_${Date.now()}`,
        timestamp: Date.now(),
        type: EventType.AGENT_TRANSITION,
        agent: AgentType.ORCHESTRATOR,
        state: AgentState.RUNNING,
        message: `Orchestrator received results from ${step.assignedAgent} for step: ${step.description}`,
        details: {
          step,
          result: resultMessage,
          returnToOrchestrator: true,
        },
      });

      // Force a concrete result if none was provided
      if (!resultMessage || resultMessage.trim().length === 0) {
        resultMessage = `Step "${step.description}" executed by ${step.assignedAgent} agent. (No specific output was returned)`;
      }

      return resultMessage;
    } catch (error) {
      const errorMsg = `Error executing step: ${(error as Error).message}`;
      log.error(errorMsg);

      // Add error event
      visualizer.addEvent(
        EventType.ERROR,
        step.assignedAgent,
        AgentState.ERROR,
        errorMsg,
        {
          step,
          error: (error as Error).message,
        },
        undefined,
        stepEventId
      );

      // Add to documentation
      documentationGenerator.addEvent({
        id: `${this.currentTaskId}_step_error_${Date.now()}`,
        timestamp: Date.now(),
        type: EventType.ERROR,
        agent: step.assignedAgent,
        state: AgentState.ERROR,
        message: errorMsg,
        details: {
          step,
          error: (error as Error).message,
          stack: (error as Error).stack,
        },
      });

      return `Error: ${(error as Error).message}`;
    }
  }

  /**
   * Execute a step specifically with the browser agent
   * Using the enhanced BrowserAgent class
   */
  private async executeStepWithBrowserAgent(step: PlanStep): Promise<string> {
    log.info(`Executing browser agent step: ${step.description}`);

    // Get the browser agent
    const browserAgent = this.agents[AgentType.BROWSER] as BrowserAgent;

    // Store current state
    const previousActiveAgent = this.activeAgentType;

    // Update states for browser execution
    this.activeAgentType = AgentType.BROWSER;
    this.sharedMemory.updateAgentState(AgentType.ORCHESTRATOR, AgentState.IDLE);
    this.sharedMemory.updateAgentState(AgentType.BROWSER, AgentState.RUNNING);

    // Add a transition message
    this.memory.addMessage({
      role: 'system',
      content: `Transferring task to browser agent for: ${step.description}`,
    });

    // Get context from previous steps if available
    const relevantContext = this.getPreviousStepResults(step);

    try {
      // Use the enhanced executeResearch method
      const comprehensiveResult = await browserAgent.executeResearch(
        step.description,
        relevantContext
      );
      
      // Reset states
      this.activeAgentType = previousActiveAgent;
      this.sharedMemory.updateAgentState(AgentType.BROWSER, AgentState.IDLE);
      this.sharedMemory.updateAgentState(AgentType.ORCHESTRATOR, AgentState.RUNNING);

      // Add a transition back message
      this.memory.addMessage({
        role: 'system',
        content: `Browser agent completed the research task. Control returned to orchestrator.`,
      });

      // Return the comprehensive result
      return comprehensiveResult;

    } catch (error) {
      // Reset states on error
      this.activeAgentType = previousActiveAgent;
      this.sharedMemory.updateAgentState(AgentType.BROWSER, AgentState.IDLE);
      this.sharedMemory.updateAgentState(AgentType.ORCHESTRATOR, AgentState.RUNNING);

      log.error(`Error during browser agent execution: ${(error as Error).message}`);

      // Add error message
      this.memory.addMessage({
        role: 'system',
        content: `Error during browser agent execution: ${(error as Error).message}. Control returned to orchestrator.`,
      });

      throw error;
    }
  }

  /**
   * Format browser results into a cohesive response
   */
  private formatBrowserResults(...results: string[]): string {
    const browserAgent = this.agents[AgentType.BROWSER] as BrowserAgent;
    if (browserAgent && typeof browserAgent.formatBrowserResults === 'function') {
      return browserAgent.formatBrowserResults(...results);
    }
    return "Unable to format browser results - method moved to BrowserAgent class";
  }

  /**
   * Extract relevant details from page content based on domain
   */
  private extractRelevantDetails(content: string, domain: string): string {
    // Truncate content if too long
    if (content.length > 5000) {
      content = content.substring(0, 5000) + '...';
    }

    // For travel websites, try to extract specific details
    if (
      domain.includes('kayak') ||
      domain.includes('expedia') ||
      domain.includes('makemytrip') ||
      domain.includes('skyscanner')
    ) {
      // Try to extract pricing information
      const priceMatches = content.match(/(\$\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g);
      const prices = priceMatches ? [...new Set(priceMatches)].slice(0, 5) : [];

      // Try to extract flight times/durations
      const durationMatches = content.match(
        /(\d{1,2}h\s+\d{1,2}m|\d{1,2}\s+hrs?\s+\d{1,2}\s+mins?)/g
      );
      const durations = durationMatches ? [...new Set(durationMatches)].slice(0, 5) : [];

      // Try to extract airlines
      const commonAirlines = [
        'ANA',
        'Japan Airlines',
        'Delta',
        'United',
        'American',
        'Alaska',
        'JAL',
        'All Nippon',
        'Asiana',
        'Korean Air',
        'EVA Air',
      ];

      let airlines: string[] = [];
      commonAirlines.forEach(airline => {
        if (content.includes(airline)) {
          airlines.push(airline);
        }
      });

      // Format the extracted details
      let formatted = '';

      if (prices.length > 0) {
        formatted += '**Prices Found:**\n- ' + prices.join('\n- ') + '\n\n';
      }

      if (airlines.length > 0) {
        formatted += '**Airlines Mentioned:**\n- ' + airlines.join('\n- ') + '\n\n';
      }

      if (durations.length > 0) {
        formatted += '**Flight Durations:**\n- ' + durations.join('\n- ') + '\n\n';
      }

      // If we extracted specific details, add them plus some context
      if (formatted) {
        return formatted + '**Additional Context:**\n' + content.substring(0, 1000) + '...';
      }
    }

    // For most domains, just return the content
    return content;
  }

  /**
   * Get relevant context from previous steps
   */
  private getPreviousStepResults(currentStep: PlanStep): string {
    if (!this.currentPlan) {
      return 'No previous context available.';
    }

    const allSteps = this.currentPlan.getAllSteps();
    const completedSteps = this.currentPlan.getCompletedSteps();

    // Don't continue if no completed steps
    if (completedSteps.length === 0) {
      return 'This is the first step of the plan.';
    }

    // Get current step index
    const currentStepIndex = allSteps.findIndex(step => step.id === currentStep.id);
    if (currentStepIndex <= 0) {
      return 'No previous steps to reference.';
    }

    // Get previous steps
    const previousSteps = allSteps.slice(0, currentStepIndex);

    // Extract results from completed previous steps
    const relevantContext = previousSteps
      .filter(step => step.completed && step.result)
      .map(
        step =>
          `- ${step.description}: ${step.result?.substring(0, 200)}${step.result && step.result.length > 200 ? '...' : ''}`
      )
      .join('\n');

    return relevantContext || 'No relevant previous context found.';
  }

  /**
   * Execute a step specifically with the planning agent
   * Special handling to avoid loops and ensure progress
   */
  private async executeStepWithPlanningAgent(step: PlanStep): Promise<string> {
    log.info(`Executing planning agent step: ${step.description}`);

    // Get the planning agent
    const planningAgent = this.agents[AgentType.PLANNING] as PlanningAgent;

    // Store current state
    const previousActiveAgent = this.activeAgentType;

    // Update states for planning execution
    this.activeAgentType = AgentType.PLANNING;
    this.sharedMemory.updateAgentState(AgentType.ORCHESTRATOR, AgentState.IDLE);
    this.sharedMemory.updateAgentState(AgentType.PLANNING, AgentState.RUNNING);

    // Add a transition message
    this.memory.addMessage({
      role: 'system',
      content: `Transferring task to planning agent for: ${step.description}`,
    });

    // Directly create a clear and specific message for the planning agent
    const directiveMessage = {
      role: 'user' as const,
      content: `Execute this specific planning task: ${step.description}

            Focus only on completing this specific step in the plan.
            Provide a concrete output that answers the requirements of this step.
            Do not ask for additional user preferences or try to revise the plan at this stage.
            Return a specific, actionable result rather than general recommendations.`,
    };

    // Add to planning agent's memory
    planningAgent.memory.addMessage(directiveMessage);

    try {
      // Have the planning agent think and act
      await planningAgent.think();
      const planningResult = await planningAgent.act();
      
      // Extract the planning agent's reasoning/conclusion from its memory
      const planningReasoningMessage = planningAgent.memory.messages
        .filter(m => m.role === 'assistant')
        .pop();
        
      // Collect the full reasoning chain from all assistant messages
      const reasoningChain = planningAgent.memory.messages
        .filter(m => m.role === 'assistant')
        .map(m => m.content || '')
        .join('\n\n=== NEXT REASONING STEP ===\n\n');
        
      // Use the agent's reasoning if available, otherwise use the raw result
      const finalPlanningContent = planningReasoningMessage?.content || planningResult;
      
      // Create a comprehensive result that includes the chain of thought for documentation purposes
      let comprehensiveResult = "# Planning Results\n\n";
      
      // Add the final reasoning/plan as a summary
      comprehensiveResult += "## Final Plan\n";
      comprehensiveResult += finalPlanningContent + "\n\n";
      
      // Add the full reasoning chain
      comprehensiveResult += "## Planning Process\n";
      comprehensiveResult += reasoningChain;

      // Reset states
      this.activeAgentType = previousActiveAgent;
      this.sharedMemory.updateAgentState(AgentType.PLANNING, AgentState.IDLE);
      this.sharedMemory.updateAgentState(AgentType.ORCHESTRATOR, AgentState.RUNNING);

      // Add a transition back message
      this.memory.addMessage({
        role: 'system',
        content: `Planning agent completed the task. Control returned to orchestrator.`,
      });

      // For shared memory, only store the agent's final synthesis
      this.sharedMemory.addMessageWithContributor(
        {
          role: 'assistant',
          // Only store the agent's final reasoning, not the full chain
          content: finalPlanningContent,
          timestamp: Date.now(),
        },
        AgentType.PLANNING
      );

      // Return the full comprehensive result for documentation purposes
      return comprehensiveResult;
    } catch (error) {
      // Reset states on error
      this.activeAgentType = previousActiveAgent;
      this.sharedMemory.updateAgentState(AgentType.PLANNING, AgentState.IDLE);
      this.sharedMemory.updateAgentState(AgentType.ORCHESTRATOR, AgentState.RUNNING);

      log.error(`Error during planning agent execution: ${(error as Error).message}`);

      // Add error message
      this.memory.addMessage({
        role: 'system',
        content: `Error during planning agent execution: ${(error as Error).message}. Control returned to orchestrator.`,
      });

      // Add error message to shared memory from the planning agent
      this.sharedMemory.addMessageWithContributor(
        {
          role: 'assistant',
          content: `Planning error: ${(error as Error).message}. Unable to complete planning task.`,
          timestamp: Date.now(),
        },
        AgentType.PLANNING
      );

      return `Error in planning step: ${(error as Error).message}`;
    }
  }

  /**
   * Refine the current plan based on execution results
   */
  private async refinePlan(executionResults: string): Promise<void> {
    if (!this.currentPlan) {
      return;
    }

    log.info('Refining plan based on execution results');

    // Add plan refinement event
    visualizer.addEvent(
      EventType.SYSTEM_MESSAGE,
      AgentType.ORCHESTRATOR,
      AgentState.RUNNING,
      `Refining plan based on execution results`,
      {
        originalPlan: this.currentPlan.toJSON(),
        executionResults: executionResults.substring(0, 200),
      }
    );

    // Add to documentation
    documentationGenerator.addEvent({
      id: `${this.currentTaskId}_plan_refinement_${Date.now()}`,
      timestamp: Date.now(),
      type: EventType.SYSTEM_MESSAGE,
      agent: AgentType.ORCHESTRATOR,
      state: AgentState.RUNNING,
      message: `Refining plan based on execution results`,
      details: {
        originalPlan: this.currentPlan.toJSON(),
        executionResults,
      },
    });

    try {
      // Transition to planning agent for refinement
      await this.transitionToAgent(AgentType.PLANNING, 'Refining plan based on execution results');

      // Get the planning agent
      const planningAgent = this.agents[AgentType.PLANNING] as PlanningAgent;

      // Refine the plan
      const refinedPlan = await planningAgent.refinePlan(this.currentPlan, executionResults);

      // Update the current plan
      this.currentPlan = refinedPlan;

      // Add plan updated event
      visualizer.addEvent(
        EventType.SYSTEM_MESSAGE,
        AgentType.PLANNING,
        AgentState.RUNNING,
        `Updated plan: ${refinedPlan.title}`,
        { plan: refinedPlan.toJSON() }
      );

      // Add to documentation
      documentationGenerator.addEvent({
        id: `${this.currentTaskId}_plan_updated_${Date.now()}`,
        timestamp: Date.now(),
        type: EventType.SYSTEM_MESSAGE,
        agent: AgentType.PLANNING,
        state: AgentState.RUNNING,
        message: `Updated plan: ${refinedPlan.title}`,
        details: {
          plan: refinedPlan.toJSON(),
          summary: refinedPlan.getSummary(),
        },
      });

      // Add a message to shared memory about the updated plan
      this.memory.addMessage({
        role: 'system',
        content: `The planning agent has updated the plan:\n\n${refinedPlan.getSummary()}`,
      });
    } catch (error) {
      log.error(`Error refining plan: ${(error as Error).message}`);
    }
  }

  /**
   * Determine if a request needs complex planning
   */
  private async doesRequestNeedPlanning(request: string): Promise<boolean> {
    log.info(`Determining if request needs planning: ${request}`);

    // Simple heuristic first: check for planning keywords
    const planningKeywords = [
      'plan',
      'create',
      'schedule',
      'organize',
      'develop',
      'build',
      'design',
      'itinerary',
      'trip',
      'journey',
      'vacation',
      'project',
      'strategy',
      'roadmap',
    ];

    // If any keyword is present, it's likely to need planning
    const hasKeywords = planningKeywords.some(keyword =>
      request.toLowerCase().includes(keyword.toLowerCase())
    );

    if (hasKeywords) {
      log.info(`Request contains planning keywords, likely needs planning`);
      return true;
    }

    // For more complex cases, ask the LLM
    const planningPrompt = `
        Determine if the following request requires a complex, multi-step plan:

        REQUEST: ${request}

        A request needs planning if:
        1. It involves multiple steps or stages
        2. It requires coordinating different types of actions
        3. It has dependencies between steps
        4. It would benefit from a structured approach

        Simple requests like questions, single commands, or basic information retrieval don't need planning.

        Answer with YES or NO only.
        `;

    try {
      const response = await this.llm.ask([{ role: 'user', content: planningPrompt }]);

      // Check if the response contains "YES"
      return response.toUpperCase().includes('YES');
    } catch (error) {
      log.error(`Error determining if request needs planning: ${(error as Error).message}`);

      // Default to false in case of error
      return false;
    }
  }

  /**
   * Extract search terms from step description
   */
  private extractSearchTerms(description: string): string {
    // Extract search terms from the step description using a simple heuristic
    // This could be enhanced with more sophisticated NLP techniques
    const aboutMatch = description.match(/about\s+([^,.]+)/i);
    const forMatch = description.match(/for\s+([^,.]+)/i);
    const researchMatch = description.match(/research\s+([^,.]+)/i);
    const findMatch = description.match(/find\s+([^,.]+)/i);

    // Return the first match found, or the entire description if no match
    return aboutMatch?.[1] || forMatch?.[1] || researchMatch?.[1] || findMatch?.[1] || description;
  }
}

export default MultiAgentOrchestrator;
