import googleIt from 'google-it';
import { WebSearchEngine, SearchResult } from './base';
import { logger } from '../../logging';

/**
 * Bing search engine implementation using google-it as fallback
 *
 * Note: There's no dedicated npm package for Bing search, so we're using google-it
 * as a temporary solution. In production, you might want to implement a proper Bing
 * scraper or use the Bing Search API.
 */
export class BingSearchEngine extends WebSearchEngine {
  // List of User-Agents to rotate through
  private userAgents: string[] = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:90.0) Gecko/20100101 Firefox/90.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 11.5; rv:90.0) Gecko/20100101 Firefox/90.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 11_5_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 Edg/91.0.864.59',
  ];

  /**
   * Get the name of the search engine
   */
  get name(): string {
    return 'bing';
  }

  /**
   * Select a random user agent from the list
   * @returns A random user agent string
   */
  private getRandomUserAgent(): string {
    const randomIndex = Math.floor(Math.random() * this.userAgents.length);
    return this.userAgents[randomIndex];
  }

  /**
   * Perform a search using google-it as a fallback
   * @param query Search query
   * @param numResults Number of results to return
   * @returns Promise with array of search results
   */
  async performSearch(query: string, numResults: number): Promise<Array<SearchResult>> {
    this.logSearchAttempt(query);

    try {
      // Log request details
      logger.info(`Bing (google-it) search request: query="${query}", max_results=${numResults}`);

      // Get a random user agent
      const userAgent = this.getRandomUserAgent();
      logger.info(`Using user agent: ${userAgent.substring(0, 30)}...`);

      // Execute the search with wrapped error handling
      let rawResults;
      try {
        // Note: This actually uses Google search, not Bing
        // In a production environment, you should implement a proper Bing search
        rawResults = await googleIt({
          query: query,
          limit: numResults,
          disableConsole: true,
          userAgent: userAgent,
        });

        logger.info(`Bing (google-it) response type: ${typeof rawResults}`);
        logger.info(`Bing (google-it) results count: ${rawResults?.length || 0}`);
      } catch (searchError) {
        // Handle search library errors
        logger.error(`Bing (google-it) search API error: ${(searchError as Error).message}`);
        if (searchError instanceof Error && searchError.stack) {
          logger.error(`Bing (google-it) API stack trace: ${searchError.stack}`);
        }
        throw new Error(`Bing (google-it) API error: ${(searchError as Error).message}`);
      }

      // Validate response
      if (!rawResults) {
        logger.warn('Bing (google-it) returned null or undefined results');
        return [];
      }

      // Check if results is an array
      if (!Array.isArray(rawResults)) {
        logger.warn(`Bing (google-it) returned non-array results of type: ${typeof rawResults}`);
        return [];
      }

      if (rawResults.length === 0) {
        logger.info('Bing (google-it) returned 0 results');
        return [];
      }

      // Map results to standardized format with error handling for each item
      const results: SearchResult[] = [];
      for (const item of rawResults) {
        try {
          if (!item || typeof item !== 'object') {
            logger.warn(`Skipping invalid result item: ${JSON.stringify(item)}`);
            continue;
          }

          results.push({
            title: item.title || 'No Title',
            link: item.link || '',
            snippet: item.snippet || '',
          });

          // Limit to requested number of results
          if (results.length >= numResults) {
            break;
          }
        } catch (itemError) {
          logger.warn(`Error processing search result item: ${(itemError as Error).message}`);
          // Continue processing other items
        }
      }

      logger.info(`Successfully processed ${results.length} Bing (google-it) results`);
      return results;
    } catch (error) {
      // Log full error details
      logger.error(`Bing (google-it) search error: ${(error as Error).message}`);
      if (error instanceof Error && error.stack) {
        logger.error(`Stack trace: ${error.stack}`);
      }

      // Rethrow to let caller handle
      throw error;
    }
  }
}
