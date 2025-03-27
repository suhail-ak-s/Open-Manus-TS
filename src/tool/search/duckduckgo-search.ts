import * as DDG from 'duck-duck-scrape';
import { WebSearchEngine, SearchResult } from './base';
import { logger } from '../../logging';

/**
 * DuckDuckGo search engine implementation using duck-duck-scrape package (no API key required)
 */
export class DuckDuckGoSearchEngine extends WebSearchEngine {
  /**
   * Get the name of the search engine
   */
  get name(): string {
    return 'duckduckgo';
  }

  /**
   * Perform a search using DuckDuckGo
   * @param query Search query
   * @param numResults Number of results to return
   * @returns Promise with array of search results
   */
  async performSearch(query: string, numResults: number): Promise<Array<SearchResult>> {
    this.logSearchAttempt(query);

    try {
      // Log request details
      logger.info(`DuckDuckGo search request: query="${query}", max_results=${numResults}`);

      // Execute the search with wrapped error handling
      let rawResponse;
      try {
        // Use duck-duck-scrape's search function
        rawResponse = await DDG.search(query, {
          safeSearch: DDG.SafeSearchType.MODERATE,
        });

        logger.info(`DuckDuckGo raw response type: ${typeof rawResponse}`);

        // Only log a subset of the response to avoid overly large logs
        const responseSummary = {
          noResults: rawResponse.noResults,
          vqd: rawResponse.vqd,
          resultCount: rawResponse.results?.length || 0,
        };
        logger.info(`DuckDuckGo response summary: ${JSON.stringify(responseSummary)}`);
      } catch (searchError) {
        // Handle search library errors
        logger.error(`DuckDuckGo search API error: ${(searchError as Error).message}`);
        if (searchError instanceof Error && searchError.stack) {
          logger.error(`DuckDuckGo API stack trace: ${searchError.stack}`);
        }
        throw new Error(`DuckDuckGo API error: ${(searchError as Error).message}`);
      }

      // Validate response
      if (!rawResponse) {
        logger.warn('DuckDuckGo returned null or undefined results');
        return [];
      }

      // Check if we got any results
      if (rawResponse.noResults || !rawResponse.results || !Array.isArray(rawResponse.results)) {
        logger.warn(`DuckDuckGo found no results or invalid results format`);
        return [];
      }

      if (rawResponse.results.length === 0) {
        logger.info('DuckDuckGo returned 0 results');
        return [];
      }

      // Map results to standardized format with error handling for each item
      const results: SearchResult[] = [];
      for (const item of rawResponse.results) {
        try {
          if (!item || typeof item !== 'object') {
            logger.warn(`Skipping invalid result item: ${JSON.stringify(item)}`);
            continue;
          }

          results.push({
            title: item.title || 'No Title',
            link: item.url || '',
            snippet: item.description || '',
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

      logger.info(`Successfully processed ${results.length} DuckDuckGo results`);
      return results;
    } catch (error) {
      // Log full error details
      logger.error(`DuckDuckGo search error: ${(error as Error).message}`);
      if (error instanceof Error && error.stack) {
        logger.error(`Stack trace: ${error.stack}`);
      }

      // Rethrow to let caller handle
      throw error;
    }
  }
}
