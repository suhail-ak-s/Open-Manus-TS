import { runManus } from './main';
import { logger } from './logging';
import { intelligentTruncate, truncateContent } from './utils/text';

/**
 * Test script to demonstrate enhanced logging and intelligent truncation in OpenManus
 */
async function testEnhancedLogging() {
  logger.info('Starting enhanced logging test');

  // Test the truncation functions
  const longText = 'A'.repeat(10000);
  const truncated = truncateContent(longText, 1000);
  const intelligentlyTruncated = intelligentTruncate(longText, 1000);

  logger.info(`Simple truncation length: ${truncated.length}`);
  logger.info(`Intelligent truncation length: ${intelligentlyTruncated.length}`);

  try {
    // Run a query that will use browser and web search tools
    const result = await runManus({
      request: 'Plan a 7 day trip to Europe',
      tools: ['terminal', 'file', 'web_search', 'browser'],
      maxSteps: 15,
      maxObserve: 2000, // Set a smaller maxObserve to trigger truncation
      model: 'gpt-4o',
      stream: true,
    });

    logger.info('Test completed successfully');
    logger.info('Result: ' + result);
  } catch (error) {
    logger.error(`Test failed: ${(error as Error).message}`);
  }
}

// Run the test if this script is called directly
if (require.main === module) {
  testEnhancedLogging().catch(error => {
    logger.error(`Unhandled error: ${error.message}`);
    process.exit(1);
  });
}

export default testEnhancedLogging;
