import { ToolCallAgent } from './agent/toolcall';
import { TerminateTool } from './tool/terminate';
import { WebSearchTool } from './tool/web-search';
import { ToolCollection } from './tool/base';
import { LLM } from './llm';
import { Memory } from './schema';
import log from './utils/logger';

/**
 * Test script for TerminateTool and Browser Agent integration
 */
async function testTerminateTool() {
  log.info('Testing terminate tool with browser agent...');
  
  // Create a memory instance
  const memory = new Memory();
  
  // Initialize LLM
  const llm = new LLM();
  
  // Create tools
  const terminateTool = new TerminateTool();
  const webSearchTool = new WebSearchTool();
  const tools = new ToolCollection([terminateTool, webSearchTool]);
  
  // Create browser agent
  const agent = new ToolCallAgent({
    name: 'TestBrowserAgent',
    description: 'Agent for testing terminate tool',
    systemPrompt: `
      You are a Browser Agent for testing the terminate tool.
      Your task is to perform a simple web search and then use the terminate tool
      to provide your final reasoning and conclusions.
      
      For this test:
      1. Use web_search to search for a topic
      2. Analyze the results briefly
      3. Use the terminate tool with your reasoning
      
      Always use the terminate tool when you've completed your task.
    `,
    maxSteps: 5,
    memory,
    llm,
    toolChoices: 'auto',
    availableTools: tools,
  });
  
  // Add test query
  memory.addMessage({
    role: 'user',
    content: 'Search for information about Mars and provide a summary.'
  });
  
  try {
    // Execute agent
    log.info('Starting agent execution...');
    
    // First think step
    await agent.think();
    log.info('Agent completed think() step');
    
    // First act step
    const result1 = await agent.act();
    log.info(`Agent act() result (length: ${result1.length}):\n${result1.substring(0, 200)}...`);
    
    // Second think step
    await agent.think();
    log.info('Agent completed second think() step');
    
    // Second act step (should use terminate)
    const result2 = await agent.act();
    log.info(`Agent second act() result (length: ${result2.length}):\n${result2.substring(0, 200)}...`);
    
    // Check if terminate was used
    if (result2.includes('Task terminated with final reasoning')) {
      log.success('✅ Terminate tool was used successfully!');
      
      // Extract the reasoning
      const terminateMatch = result2.match(/terminate\s*\(\s*reasoning\s*=\s*["'](.*?)["']/s);
      if (terminateMatch && terminateMatch[1]) {
        const reasoning = terminateMatch[1];
        log.info(`Extracted reasoning (${reasoning.length} chars):\n${reasoning.substring(0, 200)}...`);
      } else {
        log.error('❌ Could not extract reasoning from terminate call');
      }
    } else {
      log.error('❌ Terminate tool was not used');
    }
    
    // Get all messages
    const messages = memory.messages;
    log.info(`Memory contains ${messages.length} messages`);
    log.info(`Last assistant message: ${messages.filter(m => m.role === 'assistant').pop()?.content?.substring(0, 100)}...`);
    
  } catch (error) {
    log.error(`Test failed with error: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) {
      log.error(error.stack);
    }
  }
}

// Run the test
testTerminateTool().catch(err => {
  log.error(`Unhandled error in test: ${err instanceof Error ? err.message : String(err)}`);
}); 