import { PythonSearchEngine } from './tool/search/python-search';
import { logger } from './logging';

async function runTest() {
  try {
    logger.info('Starting search test');

    // Test DuckDuckGo search
    const ddgEngine = new PythonSearchEngine('duckduckgo');
    logger.info('Testing DuckDuckGo search...');
    const ddgResults = await ddgEngine.performSearch('TypeScript web development', 5);
    logger.info(`DuckDuckGo results: ${JSON.stringify(ddgResults, null, 2)}`);
    await ddgEngine.dispose();

    // Test Google search
    const googleEngine = new PythonSearchEngine('google');
    logger.info('Testing Google search...');
    const googleResults = await googleEngine.performSearch('TypeScript web development', 5);
    logger.info(`Google results: ${JSON.stringify(googleResults, null, 2)}`);
    await googleEngine.dispose();

    logger.info('Search test completed successfully');
  } catch (error) {
    logger.error(`Search test error: ${(error as Error).message}`);
    if (error instanceof Error && error.stack) {
      logger.error(`Stack trace: ${error.stack}`);
    }
  }
}

// Run the test
runTest();
