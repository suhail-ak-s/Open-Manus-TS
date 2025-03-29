import { MultiAgentOrchestrator, AgentType } from './agent/multi-agent';
import log from './utils/logger';

// Add explicit debug logging
log.debug('Starting debug script');

// This function adds enhanced logging for debugging shared memory operations
function addSharedMemoryDebugLogging(orchestrator) {
  const originalAddMessageWithContributor = orchestrator.sharedMemory.addMessageWithContributor;
  
  // Override the method to add detailed logging
  orchestrator.sharedMemory.addMessageWithContributor = function(message, contributorId) {
    log.debug(`SHARED MEMORY DEBUG: Adding message from ${contributorId}`);
    log.debug(`SHARED MEMORY DEBUG: Message content length: ${message.content?.length || 0}`);
    log.debug(`SHARED MEMORY DEBUG: Message timestamp: ${message.timestamp}`);
    
    // Call the original method and return its result
    const result = originalAddMessageWithContributor.call(this, message, contributorId);
    
    // Log success confirmation and memory size
    log.debug(`SHARED MEMORY DEBUG: Message added successfully. Total messages: ${this.messages.length}`);
    return result;
  };
  
  log.info('Enhanced shared memory debugging enabled');
}

async function debugBrowserAgent() {
  log.info('Starting browser agent debugging session');
  
  // Create orchestrator with debug event handler
  const orchestrator = new MultiAgentOrchestrator({
    eventHandler: (event) => {
      if (event.type === 'memory_update') {
        log.debug(`Memory event: ${event.details?.type} from ${event.details?.activeAgent}`);
      }
    }
  });
  
  // Add enhanced debugging
  addSharedMemoryDebugLogging(orchestrator);
  
  // Add specific browser agent debugging
  const browserAgent = orchestrator['agents'][AgentType.BROWSER];
  const originalThink = browserAgent.think;
  const originalAct = browserAgent.act;
  
  // Override think method to add debugging
  browserAgent.think = async function() {
    log.debug('BROWSER AGENT DEBUG: Starting think method');
    const result = await originalThink.apply(this);
    log.debug('BROWSER AGENT DEBUG: Completed think method');
    return result;
  };
  
  // Override act method to add debugging
  browserAgent.act = async function() {
    log.debug('BROWSER AGENT DEBUG: Starting act method');
    const result = await originalAct.apply(this);
    log.debug(`BROWSER AGENT DEBUG: Completed act method with result length: ${result?.length || 0}`);
    return result;
  };
  
  // Run a simple test task that uses the browser agent
  try {
    log.info('Running test task with browser agent...');
    const result = await orchestrator.run('Find the best flights to Japan for next month');
    log.info(`Task completed with result: ${result}`);
  } catch (error) {
    log.error(`Error running test task: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error) {
      log.error(error.stack || 'No stack trace available');
    }
  }
}

// Run the debug function
debugBrowserAgent().catch(err => {
  const errorMessage = `Error in debug script: ${err instanceof Error ? err.message : String(err)}`;
  log.error(errorMessage);
}); 