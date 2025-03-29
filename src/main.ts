import { ManusAgent } from './agent/manus';
import { logger } from './logging';
import { config } from './config';
import { ToolCollection } from './tool/base';
import { TerminalTool } from './tool/terminal';
import { ReadFileTool, WriteFileTool, ListDirectoryTool } from './tool/file-operations';
import {
  SandboxReadFileTool,
  SandboxWriteFileTool,
  SandboxListDirectoryTool,
  SandboxDeleteFileTool,
  SandboxCreateDirectoryTool,
  SandboxNodeREPLTool,
  SandboxBashTool,
  SandboxFileSaverTool,
} from './tool';
import { TerminateTool } from './tool/terminate';
import { BrowserTool } from './tool/browser';
import { WebSearchTool } from './tool/web-search';
import { PlanningTool } from './tool/planning';
import { StrReplaceEditorTool } from './tool/str-replace-editor';
import { NodeREPLTool } from './tool/node-repl';
import { PythonREPLTool } from './tool/python-repl';
import { BashTool } from './tool/bash';
import { FileSaverTool } from './tool/file-saver';
import { ChatCompletionTool } from './tool/chat-completion';
import { FlowFactory, FlowType } from './flow';
import { BaseAgent } from './agent/base';
import { SharedMemory } from './agent/shared-memory';
import dotenv from 'dotenv';
import path from 'path';

// Ensure environment variables are loaded
dotenv.config();

// Debug check for API key
if (process.env.OPENAI_API_KEY) {
  logger.info(`API key found in environment: ${process.env.OPENAI_API_KEY.substring(0, 3)}...`);
} else {
  logger.warn('No API key found in environment variables!');
}

/**
 * Run the OpenManus system with specified options
 * @param options Options for running the system
 * @returns Promise that resolves when the agent completes
 */
export async function runManus(options: {
  request?: string;
  systemPrompt?: string;
  tools?: string[];
  model?: string;
  maxSteps?: number;
  maxObserve?: number;
  stream?: boolean;
  sandbox?: boolean;
  enableMemoryLogging?: boolean;
  memoryLogPath?: string;
}): Promise<string> {
  const {
    request = 'How can I help you today?',
    systemPrompt,
    tools: toolNames = ['terminal', 'file', 'browser'],
    model = process.env.MODEL || 'gpt-4o',
    maxSteps = 10,
    maxObserve = 8000,
    stream = true,
    sandbox = process.env.SANDBOX_MODE === 'true',
    enableMemoryLogging = process.env.ENABLE_MEMORY_LOGGING === 'true' || false,
    memoryLogPath = process.env.MEMORY_LOG_PATH || path.join(process.cwd(), 'memory-logs'),
  } = options;

  logger.info(`Starting OpenManus with model: ${model}${sandbox ? ' in sandbox mode' : ''}`);
  if (enableMemoryLogging) {
    logger.info(`Memory logging enabled, logs will be stored at: ${memoryLogPath}`);
  }

  // Create tool collection based on requested tools
  const toolCollection = new ToolCollection();

  // Always include the terminate tool
  toolCollection.addTool(new TerminateTool());

  // Add requested tools
  if (toolNames.includes('terminal')) {
    toolCollection.addTool(new TerminalTool());
  }

  if (toolNames.includes('file')) {
    // Use standard file operations
    toolCollection.addTool(new ReadFileTool());
    toolCollection.addTool(new WriteFileTool());
    toolCollection.addTool(new ListDirectoryTool());
    toolCollection.addTool(new FileSaverTool());
  }

  if (toolNames.includes('browser')) {
    toolCollection.addTool(new BrowserTool());
  }

  if (toolNames.includes('web_search')) {
    toolCollection.addTool(new WebSearchTool());
  }

  if (toolNames.includes('code_execution')) {
    // Use standard code execution
    toolCollection.addTool(new NodeREPLTool());
  }

  // Initialize shared memory with logging options
  const sharedMemory = new SharedMemory({
    enableFileLogging: enableMemoryLogging,
    logFilePath: memoryLogPath,
    sessionId: `manus_session_${Date.now()}`
  });

  // Create and configure the agent
  const agent = new ManusAgent({
    name: 'OpenManus',
    systemPrompt,
    availableTools: toolCollection,
    model,
    maxSteps,
    maxObserve,
    memory: sharedMemory
  });

  // Send the initial request to start the conversation
  const response = await agent.run(request);
  return response;
}

/**
 * Create a default tool collection based on sandbox mode
 * @param sandbox Whether to use sandbox mode
 * @returns A tool collection with appropriate tools
 */
function createDefaultToolCollection(sandbox: boolean = false): ToolCollection {
  const toolCollection = new ToolCollection();

  // Always include terminal and terminate tools
  toolCollection.addTool(new TerminalTool());
  toolCollection.addTool(new TerminateTool());

  if (sandbox) {
    // Add sandboxed tools
    toolCollection.addTool(new SandboxReadFileTool());
    toolCollection.addTool(new SandboxWriteFileTool());
    toolCollection.addTool(new SandboxListDirectoryTool());
    toolCollection.addTool(new SandboxDeleteFileTool());
    toolCollection.addTool(new SandboxCreateDirectoryTool());
    toolCollection.addTool(new SandboxNodeREPLTool());
    toolCollection.addTool(new SandboxBashTool());
    toolCollection.addTool(new SandboxFileSaverTool());
  } else {
    // Add standard tools
    toolCollection.addTool(new ReadFileTool());
    toolCollection.addTool(new WriteFileTool());
    toolCollection.addTool(new ListDirectoryTool());
    toolCollection.addTool(new NodeREPLTool());
    toolCollection.addTool(new PythonREPLTool());
    toolCollection.addTool(new BashTool());
    toolCollection.addTool(new FileSaverTool());
  }

  // Add tools that are the same in both modes
  toolCollection.addTool(new BrowserTool());
  toolCollection.addTool(new WebSearchTool());
  toolCollection.addTool(new StrReplaceEditorTool());
  toolCollection.addTool(new ChatCompletionTool());
  toolCollection.addTool(new PlanningTool());

  return toolCollection;
}

/**
 * Run the OpenManus Planning Flow system with specified options
 * @param options Options for running the planning flow
 * @returns Promise that resolves when the flow completes
 */
export async function runPlanningFlow(options: {
  request: string;
  agents?: BaseAgent | BaseAgent[] | Record<string, BaseAgent>;
  executors?: string[];
  planId?: string;
  sandbox?: boolean;
  enableMemoryLogging?: boolean;
  memoryLogPath?: string;
}): Promise<string> {
  const {
    request,
    agents,
    executors,
    planId,
    sandbox = process.env.SANDBOX_MODE === 'true',
    enableMemoryLogging = process.env.ENABLE_MEMORY_LOGGING === 'true' || false,
    memoryLogPath = process.env.MEMORY_LOG_PATH || path.join(process.cwd(), 'memory-logs'),
  } = options;

  logger.info(`Starting OpenManus Planning Flow${sandbox ? ' in sandbox mode' : ''}`);
  if (enableMemoryLogging) {
    logger.info(`Memory logging enabled, logs will be stored at: ${memoryLogPath}`);
  }

  // Create a default agent if not provided
  const flowAgents =
    agents ||
    new ManusAgent({
      name: 'OpenManus-Planner',
      availableTools: createDefaultToolCollection(sandbox),
    });

  // Create flow options
  const flowOptions: Record<string, any> = {};
  if (executors) flowOptions.executors = executors;
  if (planId) flowOptions.planId = planId;
  flowOptions.sandbox = sandbox;
  flowOptions.enableMemoryLogging = enableMemoryLogging;
  flowOptions.memoryLogPath = memoryLogPath;
  flowOptions.taskId = planId;

  // Create the planning flow
  const planningFlow = FlowFactory.createFlow(FlowType.PLANNING, flowAgents, flowOptions);

  // Execute the flow with the request
  const result = await planningFlow.execute(request);
  return result;
}

/**
 * Main function to run from command line
 */
async function main() {
  const args = process.argv.slice(2);

  // Extract the flow type if specified with --flow=
  let flowType: string | null = null;
  let toolParam: string | null = null;
  let request: string;
  let enableMemoryLogging: boolean = process.env.ENABLE_MEMORY_LOGGING === 'true' || false;
  let memoryLogPath: string | undefined = process.env.MEMORY_LOG_PATH;

  // Process command line arguments
  const processedArgs = [];
  for (const arg of args) {
    if (arg.startsWith('--flow=')) {
      flowType = arg.substring(7);
    } else if (arg.startsWith('--tool=')) {
      toolParam = arg.substring(7);
    } else if (arg.startsWith('--log-memory')) {
      enableMemoryLogging = true;
    } else if (arg.startsWith('--memory-log-path=')) {
      memoryLogPath = arg.substring(17);
    } else {
      processedArgs.push(arg);
    }
  }

  // Join the remaining arguments as the request
  request = processedArgs.join(' ');
  if (!request) {
    request = 'Help me solve this problem: How can I find large files in my directory?';
  }

  try {
    let result: string;

    // Execute the appropriate flow based on arguments
    if (flowType === 'planning') {
      logger.info(`Starting with planning flow: "${request}"`);
      result = await runPlanningFlow({
        request,
        sandbox: false,
        enableMemoryLogging,
        memoryLogPath,
      });
    } else {
      // Determine which tools to include based on the request
      const tools = ['terminal', 'file'];

      // Add explicitly requested tool
      if (toolParam) {
        tools.push(toolParam);
      }

      // Always include web_search for information queries
      if (
        request.toLowerCase().includes('weather') ||
        request.toLowerCase().includes('news') ||
        request.toLowerCase().includes('current') ||
        request.toLowerCase().includes('today') ||
        request.toLowerCase().includes('latest')
      ) {
        if (!tools.includes('web_search')) {
          tools.push('web_search');
        }
        if (!tools.includes('browser')) {
          tools.push('browser');
        }
      }

      // Always include code execution for coding tasks
      if (
        request.toLowerCase().includes('code') ||
        request.toLowerCase().includes('script') ||
        request.toLowerCase().includes('program')
      ) {
        tools.push('code_execution');
      }

      logger.info(`Starting with tools: ${tools.join(', ')}`);

      // Run standard agent
      result = await runManus({
        request,
        tools,
        maxSteps: 15,
        enableMemoryLogging,
        memoryLogPath,
      });
    }

    console.log(result);
  } catch (error) {
    logger.error(`Error in main: ${(error as Error).message}`);
    console.error(`Error: ${(error as Error).message}`);
  }
}

// Run main function if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error(`Unhandled error: ${error}`);
    process.exit(1);
  });
}

export default { runManus, runPlanningFlow };
