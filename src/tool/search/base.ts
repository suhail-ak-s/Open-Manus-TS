import { logger } from '../../logging';

/**
 * Interface for search result
 */
export interface SearchResult {
  /**
   * Title of the search result
   */
  title: string;

  /**
   * URL of the search result
   */
  link: string;

  /**
   * Snippet/description of the search result
   */
  snippet: string;
}

/**
 * Abstract base class for web search engines
 */
export abstract class WebSearchEngine {
  /**
   * Perform a search query and return results
   * @param query Search query string
   * @param numResults Number of results to return
   */
  abstract performSearch(query: string, numResults: number): Promise<Array<SearchResult>>;

  /**
   * Get the name of the search engine
   */
  abstract get name(): string;

  /**
   * Log search attempt
   * @param query The search query
   */
  protected logSearchAttempt(query: string): void {
    logger.info(
      `🔎 Attempting search with ${this.name.charAt(0).toUpperCase() + this.name.slice(1)}...`
    );
  }
}
