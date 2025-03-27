import { python } from 'pythonia';
import * as path from 'path';
import { WebSearchEngine, SearchResult } from './base';
import { logger } from '../../logging';

/**
 * Python-based search engine implementation using pythonia to leverage Python's search libraries
 */
export class PythonSearchEngine extends WebSearchEngine {
  private engineType: 'google' | 'duckduckgo';
  private pythonModule: any = null;
  private webSearch: any = null;
  private initialized: boolean = false;

  /**
   * Create a new PythonSearchEngine
   *
   * @param engineType The type of search engine to use ('google' or 'duckduckgo')
   */
  constructor(engineType: 'google' | 'duckduckgo' = 'google') {
    super();
    this.engineType = engineType;
  }

  /**
   * Get the name of the search engine
   */
  get name(): string {
    return `python-${this.engineType}`;
  }

  /**
   * Initialize the Python environment and load the search module
   */
  private async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      logger.info('Initializing Python search engine');

      // Get the path to the Python script
      const scriptPath = path.resolve(process.cwd(), 'python_search/web_search.py');
      logger.info(`Loading Python script from: ${scriptPath}`);

      // Import the Python module
      this.pythonModule = await python(scriptPath);

      // Create an instance of the WebSearch class
      this.webSearch = await this.pythonModule.WebSearch();

      this.initialized = true;
      logger.info('Python search engine initialized successfully');
    } catch (error) {
      logger.error(`Failed to initialize Python search engine: ${(error as Error).message}`);
      if (error instanceof Error && error.stack) {
        logger.error(`Stack trace: ${error.stack}`);
      }
      throw new Error(`Python search engine initialization failed: ${(error as Error).message}`);
    }
  }

  /**
   * Perform a search using the Python implementation
   * @param query Search query
   * @param numResults Number of results to return
   * @returns Promise with array of search results
   */
  async performSearch(query: string, numResults: number): Promise<Array<SearchResult>> {
    this.logSearchAttempt(query);

    try {
      // Initialize the Python environment if not already
      await this.initialize();

      // Log request details
      logger.info(
        `Python-${this.engineType} search request: query="${query}", max_results=${numResults}`
      );

      // Execute the search with wrapped error handling
      let results: SearchResult[] = [];
      try {
        // Call the Python search method
        const resultsJsonString = await this.webSearch.search(query, this.engineType, numResults);

        // Parse the JSON string into a JavaScript array
        let jsResults: any[] = [];
        try {
          jsResults = JSON.parse(resultsJsonString);
          logger.info(`Successfully parsed JSON results from Python-${this.engineType}`);
        } catch (jsonError) {
          logger.error(
            `Failed to parse JSON from Python-${this.engineType}: ${(jsonError as Error).message}`
          );
          logger.debug(`Raw JSON string: ${resultsJsonString}`);
          throw new Error(`Failed to parse search results: ${(jsonError as Error).message}`);
        }

        logger.info(`Python-${this.engineType} response type: ${typeof jsResults}`);
        logger.info(`Python-${this.engineType} results count: ${jsResults?.length || 0}`);

        // Validate response
        if (!jsResults || jsResults.length === 0) {
          logger.info(`Python-${this.engineType} returned 0 results`);
          return [];
        }

        // Map results to standardized format
        for (const item of jsResults) {
          try {
            if (!item || typeof item !== 'object') {
              logger.warn(`Skipping invalid result item: ${JSON.stringify(item)}`);
              continue;
            }

            // Access JavaScript object properties directly (no need for await)
            const jsItem = {
              title: item.title || 'No Title',
              link: item.link || '',
              snippet: item.snippet || '',
            };

            results.push(jsItem);

            // Limit to requested number of results
            if (results.length >= numResults) {
              break;
            }
          } catch (itemError) {
            logger.warn(`Error processing search result item: ${(itemError as Error).message}`);
            // Continue processing other items
          }
        }
      } catch (searchError) {
        // Handle search library errors
        logger.error(
          `Python-${this.engineType} search API error: ${(searchError as Error).message}`
        );
        if (searchError instanceof Error && searchError.stack) {
          logger.error(`Python-${this.engineType} API stack trace: ${searchError.stack}`);
        }
        throw new Error(`Python-${this.engineType} API error: ${(searchError as Error).message}`);
      }

      logger.info(`Successfully processed ${results.length} Python-${this.engineType} results`);
      return results;
    } catch (error) {
      // Log full error details
      logger.error(`Python-${this.engineType} search error: ${(error as Error).message}`);
      if (error instanceof Error && error.stack) {
        logger.error(`Stack trace: ${error.stack}`);
      }

      // Rethrow to let caller handle
      throw error;
    }
  }

  /**
   * Clean up Python resources
   */
  async dispose(): Promise<void> {
    if (this.webSearch) {
      try {
        // Use any to bypass TypeScript checking for the dispose symbol
        await (this.webSearch as any)[Symbol.for('dispose')]();
        this.webSearch = null;
      } catch (error) {
        logger.warn(`Error disposing Python web search: ${(error as Error).message}`);
      }
    }

    if (this.pythonModule) {
      try {
        // Use any to bypass TypeScript checking for the dispose symbol
        await (this.pythonModule as any)[Symbol.for('dispose')]();
        this.pythonModule = null;
      } catch (error) {
        logger.warn(`Error disposing Python module: ${(error as Error).message}`);
      }
    }

    this.initialized = false;
  }
}
