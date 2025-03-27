import { BaseTool, ToolParameter, formatToolResult } from './base';
import { logger } from '../logging';
import { WebSearchEngine, SearchResult } from './search';
import { GoogleSearchEngine } from './search/google-search';
import { BingSearchEngine } from './search/bing-search';
import { DuckDuckGoSearchEngine } from './search/duckduckgo-search';
import { PythonSearchEngine } from './search/python-search';
import config from '../config';

/**
 * Tool to perform web searches with multiple engine support, fallback mechanism, and retry logic
 */
export class WebSearchTool extends BaseTool {
  name = 'web_search';
  description = `Perform a web search and return a list of relevant links.
This function attempts to use the primary search engine API to get up-to-date results.
If an error occurs, it falls back to an alternative search engine.`;

  parameters: Record<string, ToolParameter> = {
    query: {
      type: 'string',
      description: '(required) The search query to submit to the search engine.',
      required: true,
    },
    num_results: {
      type: 'number',
      description: '(optional) The number of search results to return. Default is 5.',
      required: false,
    },
  };

  requiredParams = ['query'];

  // Search engine instances
  private searchEngines: Record<string, WebSearchEngine> = {};

  // Configuration
  private preferredEngine: string = 'python-google';
  private fallbackEngines: string[] = ['python-duckduckgo', 'google', 'bing', 'duckduckgo'];
  private maxRetries: number = 3;
  private retryDelay: number = 60; // seconds

  constructor(
    options: {
      preferredEngine?: string;
      fallbackEngines?: string[];
      maxRetries?: number;
      retryDelay?: number;
    } = {}
  ) {
    super();

    // Initialize search engines
    this.searchEngines = {
      google: new GoogleSearchEngine(),
      bing: new BingSearchEngine(),
      duckduckgo: new DuckDuckGoSearchEngine(),
      'python-google': new PythonSearchEngine('google'),
      'python-duckduckgo': new PythonSearchEngine('duckduckgo'),
    };

    // Set configuration from options or config file
    this.loadConfig(options);
  }

  /**
   * Load configuration from options or config file
   */
  private loadConfig(options: any): void {
    // Try to get config from config file first
    const searchConfig = config.get('search') || {};
    if (searchConfig) {
      this.preferredEngine = searchConfig.engine || this.preferredEngine;
      this.fallbackEngines = searchConfig.fallbackEngines || this.fallbackEngines;
      this.maxRetries = searchConfig.maxRetries || this.maxRetries;
      this.retryDelay = searchConfig.retryDelay || this.retryDelay;
    }

    // Override with options if provided
    if (options.preferredEngine) {
      this.preferredEngine = options.preferredEngine;
    }
    if (options.fallbackEngines) {
      this.fallbackEngines = options.fallbackEngines;
    }
    if (options.maxRetries !== undefined) {
      this.maxRetries = options.maxRetries;
    }
    if (options.retryDelay !== undefined) {
      this.retryDelay = options.retryDelay;
    }
  }

  /**
   * Execute the web search with fallback and retry
   * @param input Search parameters
   * @returns Search results as formatted text
   */
  async execute(input: { query: string; num_results?: number }): Promise<string> {
    const { query, num_results = 5 } = input;
    logger.info(`Performing web search for: ${query}`);

    if (!query || typeof query !== 'string' || query.trim() === '') {
      return 'Error: Search query is required and cannot be empty';
    }

    let results: SearchResult[] = [];
    let errorMessages: string[] = [];
    let detailedDiagnostics: string[] = [];

    // MODIFIED: Reduce retry attempts to avoid getting stuck
    const maxRetries = 1; // Reduced from 3 to 1
    const retryDelay = 30; // Reduced from 60 to 30 seconds

    // Try for maxRetries
    for (let retryCount = 0; retryCount <= maxRetries; retryCount++) {
      if (retryCount > 0) {
        logger.warn(
          `All search engines failed. Waiting ${retryDelay} seconds before retry ${retryCount}/${maxRetries}...`
        );
        await this.delay(retryDelay * 1000);
      }

      try {
        // Add diagnostics flag to capture detailed information
        [results, errorMessages, detailedDiagnostics] = await this.tryAllEngines(
          query,
          num_results
        );
        if (results.length > 0) {
          break;
        }
      } catch (error) {
        const errorMessage = `Unexpected error in tryAllEngines: ${(error as Error).message}`;
        logger.error(errorMessage);
        if (error instanceof Error && error.stack) {
          logger.error(`Stack trace: ${error.stack}`);
        }
        errorMessages.push(errorMessage);
        detailedDiagnostics.push(`Uncaught error: ${JSON.stringify(error)}`);
      }
    }

    // If we got results, format them properly
    if (results && results.length > 0) {
      return this.formatResults(results, query);
    }

    // If no results after retries, show the detailed error diagnostics
    return this.generateDetailedErrorReport(query, errorMessages, detailedDiagnostics);
  }

  /**
   * Try all search engines in order
   * @param query Search query
   * @param numResults Number of results to return
   * @returns Tuple of [results, errorMessages, diagnostics]
   */
  private async tryAllEngines(
    query: string,
    numResults: number
  ): Promise<[SearchResult[], string[], string[]]> {
    const engineOrder = this.getEngineOrder();
    const failedEngines: string[] = [];
    const errorMessages: string[] = [];
    const diagnostics: string[] = [];

    for (const engineName of engineOrder) {
      const engine = this.searchEngines[engineName];

      if (!engine) {
        const msg = `Search engine ${engineName} not available`;
        logger.warn(msg);
        errorMessages.push(msg);
        continue;
      }

      try {
        logger.info(
          `🔎 Attempting search with ${engineName.charAt(0).toUpperCase() + engineName.slice(1)}...`
        );

        // Track raw response for diagnostics
        let rawResponse: any;
        try {
          // Execute search and capture raw response if possible
          rawResponse = await engine.performSearch(query, numResults);

          // Log the raw response for diagnostics
          diagnostics.push(`${engineName} raw response: ${JSON.stringify(rawResponse, null, 2)}`);

          // Check response type
          diagnostics.push(`${engineName} response type: ${typeof rawResponse}`);
          if (rawResponse === null) {
            diagnostics.push(`${engineName} returned null`);
          } else if (typeof rawResponse === 'undefined') {
            diagnostics.push(`${engineName} returned undefined`);
          } else if (Array.isArray(rawResponse)) {
            diagnostics.push(`${engineName} returned array of length ${rawResponse.length}`);
          } else if (typeof rawResponse === 'object') {
            diagnostics.push(
              `${engineName} returned object with keys: ${Object.keys(rawResponse).join(', ')}`
            );
          }

          // Process results according to expected type
          let results: SearchResult[] = [];
          if (Array.isArray(rawResponse)) {
            results = rawResponse;
          } else if (typeof rawResponse === 'object' && rawResponse !== null) {
            // Try to extract results if it's an object with a nested results array
            if ('results' in rawResponse && Array.isArray(rawResponse.results)) {
              results = rawResponse.results;
            } else if ('items' in rawResponse && Array.isArray(rawResponse.items)) {
              results = rawResponse.items;
            }
          }

          if (results && Array.isArray(results) && results.length > 0) {
            logger.info(`✅ Retrieved ${results.length} results from ${engineName}`);
            return [results, errorMessages, diagnostics];
          } else {
            const msg = `${engineName} returned no usable results`;
            logger.warn(msg);
            errorMessages.push(msg);
          }
        } catch (innerError) {
          const msg = `${engineName} search processing error: ${(innerError as Error).message}`;
          logger.error(msg);
          if (innerError instanceof Error && innerError.stack) {
            diagnostics.push(`${engineName} stack trace: ${innerError.stack}`);
          }
          errorMessages.push(msg);
          diagnostics.push(
            `${engineName} raw response caused error: ${JSON.stringify(rawResponse)}`
          );
        }
      } catch (error) {
        failedEngines.push(engineName);
        const errorMessage = `${engineName} search failed: ${(error as Error).message}`;
        errorMessages.push(errorMessage);
        logger.error(`⚠️ ${errorMessage}`);

        // Add stack trace if available
        if (error instanceof Error && error.stack) {
          diagnostics.push(`${engineName} stack trace: ${error.stack}`);
        }

        // Add additional error info if available
        if (error instanceof Error) {
          const errorObj: any = error;
          const errorInfo = Object.keys(errorObj)
            .filter(key => key !== 'message' && key !== 'stack')
            .map(key => `${key}: ${JSON.stringify(errorObj[key])}`)
            .join(', ');

          if (errorInfo) {
            diagnostics.push(`${engineName} error details: ${errorInfo}`);
          }
        }
      }
    }

    if (failedEngines.length > 0) {
      const message = `All search engines failed: ${failedEngines.join(', ')}`;
      logger.error(message);
      errorMessages.push(message);
    }

    return [[], errorMessages, diagnostics];
  }

  /**
   * Get the order in which to try search engines
   * @returns Ordered list of engine names
   */
  private getEngineOrder(): string[] {
    const engineOrder: string[] = [];

    // Add preferred engine first if available
    if (this.preferredEngine && this.searchEngines[this.preferredEngine]) {
      engineOrder.push(this.preferredEngine);
    }

    // Add fallback engines in order
    for (const fallback of this.fallbackEngines) {
      if (fallback && this.searchEngines[fallback] && !engineOrder.includes(fallback)) {
        engineOrder.push(fallback);
      }
    }

    // Add any remaining engines not already included
    for (const engine of Object.keys(this.searchEngines)) {
      if (!engineOrder.includes(engine)) {
        engineOrder.push(engine);
      }
    }

    return engineOrder;
  }

  /**
   * Format search results into a readable string
   * @param results Search results
   * @param query Original query
   * @returns Formatted results string
   */
  private formatResults(results: SearchResult[], query: string): string {
    // Create a structured JSON result with all search results
    const jsonResults = {
      query,
      timestamp: new Date().toISOString(),
      results: results.map((result, index) => ({
        index: index + 1,
        title: result.title,
        url: result.link,
        snippet: result.snippet?.replace(/\n/g, ' ') || '',
        favicon: `https://www.google.com/s2/favicons?domain=${new URL(result.link).hostname}`,
      })),
    };

    // Create the traditional text format for LLM (without changing the format)
    let textResults = `Search results for "${query}":\n\n`;
    results.forEach((result, index) => {
      textResults += `[${index + 1}] ${result.title}\n`;
      textResults += `    URL: ${result.link}\n`;
      textResults += `    ${result.snippet?.replace(/\n/g, ' ') || ''}\n\n`;
    });
    textResults += `Retrieved at: ${new Date().toISOString()}`;

    // Append the JSON as metadata that won't affect the LLM but will be available for the UI
    return `${textResults}\n\n<!-- JSON_RESULTS: ${JSON.stringify(jsonResults)} -->`;
  }

  /**
   * Generate detailed error report
   * @param query Original search query
   * @param errorMessages List of error messages
   * @param diagnostics Detailed diagnostics
   * @returns Formatted error report
   */
  private generateDetailedErrorReport(
    query: string,
    errorMessages: string[],
    diagnostics: string[]
  ): string {
    let response = `DETAILED ERROR REPORT: Web search failed for "${query}"\n\n`;

    // Error summary
    response += 'ERROR SUMMARY:\n';
    const uniqueErrors = Array.from(new Set(errorMessages));
    uniqueErrors.forEach(error => {
      response += `- ${error}\n`;
    });

    // Technical diagnostics section
    response += '\nTECHNICAL DIAGNOSTICS:\n';
    diagnostics.forEach(diag => {
      response += `${diag}\n`;
    });

    response +=
      '\nThis is a technical error report to help debug search engine integration issues.';

    return response;
  }

  /**
   * Utility method to create a delay
   * @param ms Milliseconds to delay
   * @returns Promise that resolves after the delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate mock search results based on query keywords
   * @param query The search query
   * @param numResults Number of results to generate
   * @returns Array of mock search results
   */
  private generateMockSearchResults(query: string, numResults: number): SearchResult[] {
    const results: SearchResult[] = [];
    const lowercaseQuery = query.toLowerCase();

    // Weather-related mock results
    if (lowercaseQuery.includes('weather')) {
      const location = this.extractLocation(lowercaseQuery) || 'the requested location';

      results.push({
        title: `Weather.com: ${location} Weather Forecast and Conditions`,
        link: 'https://weather.com/weather/today',
        snippet: `Current weather in ${location}: Partly cloudy with temperatures ranging from 65°F to 78°F. Humidity around 45%. Check the hourly forecast for more details.`,
      });

      results.push({
        title: `AccuWeather - ${location} Weather Forecast`,
        link: 'https://www.accuweather.com/en/search-locations',
        snippet: `Today's weather forecast for ${location}. Today: Mostly sunny with a high near 75°F. Tonight: Partly cloudy with a low around 60°F. Tomorrow: Chance of showers, especially in the afternoon.`,
      });

      results.push({
        title: `National Weather Service - ${location}`,
        link: 'https://www.weather.gov',
        snippet: `Get the forecast for ${location}. Current conditions, radar, and regional forecasts. Weather Alerts and warnings available.`,
      });
    }
    // News-related mock results
    else if (lowercaseQuery.includes('news')) {
      results.push({
        title: 'CNN - Breaking News, Latest News and Videos',
        link: 'https://www.cnn.com',
        snippet:
          'View the latest news and breaking news today for U.S., world, weather, entertainment, politics and health at CNN.com.',
      });

      results.push({
        title: 'BBC News - Home',
        link: 'https://www.bbc.com/news',
        snippet:
          'Visit BBC News for up-to-the-minute news, breaking news, video, audio and feature stories. BBC News provides trusted World and UK news.',
      });

      results.push({
        title: 'Reuters - World News | Breaking International News',
        link: 'https://www.reuters.com',
        snippet:
          'Reuters.com brings you the latest news from around the world, covering breaking news in business, politics, technology, and more.',
      });
    }
    // Generic results for other queries
    else {
      results.push({
        title: `${query} - Wikipedia`,
        link: 'https://en.wikipedia.org/wiki/Main_Page',
        snippet: `Find information about ${query} including history, definitions, and related topics on Wikipedia, the free encyclopedia.`,
      });

      results.push({
        title: `${query} | Official Website`,
        link: 'https://example.com',
        snippet: `Official website for ${query}. Find the latest information, resources, and updates about ${query}.`,
      });

      results.push({
        title: `Everything You Need to Know About ${query}`,
        link: 'https://example.org/guide',
        snippet: `A comprehensive guide to understanding ${query}. Learn about the history, applications, and future developments.`,
      });
    }

    // Add more generic results if needed to reach numResults
    while (results.length < numResults) {
      results.push({
        title: `Additional Information on ${query} - Result ${results.length + 1}`,
        link: `https://example.com/result-${results.length + 1}`,
        snippet: `This page contains additional information about ${query} that might be relevant to your search.`,
      });
    }

    return results.slice(0, numResults);
  }

  /**
   * Extract location from a weather query
   * @param query The weather-related query
   * @returns The extracted location or null if not found
   */
  private extractLocation(query: string): string | null {
    // Try to extract location from "weather in X", "X weather", etc.
    const inMatch = query.match(/weather in ([a-z\s]+)/i);
    if (inMatch && inMatch[1]) return this.capitalizeWords(inMatch[1].trim());

    const prefixMatch = query.match(/([a-z\s]+) weather/i);
    if (prefixMatch && prefixMatch[1]) return this.capitalizeWords(prefixMatch[1].trim());

    // Check for common city names
    const cities = [
      'New York',
      'London',
      'Tokyo',
      'Paris',
      'Berlin',
      'Sydney',
      'Los Angeles',
      'Chicago',
      'Toronto',
      'Beijing',
      'Mumbai',
      'Cairo',
      'Rio',
      'Moscow',
      'Dubai',
    ];

    for (const city of cities) {
      if (query.toLowerCase().includes(city.toLowerCase())) {
        return city;
      }
    }

    return null;
  }

  /**
   * Capitalize first letter of each word
   * @param str String to capitalize
   * @returns Capitalized string
   */
  private capitalizeWords(str: string): string {
    return str.replace(/\b\w/g, char => char.toUpperCase());
  }
}

export default WebSearchTool;
