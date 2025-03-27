import { BaseTool, ToolResult } from './base';
import { config } from '../config';
import { logger } from '../logging';
import { chromium, Browser, Page, ElementHandle } from 'playwright';
import { WebSearchTool } from './web-search';

/**
 * Description for the browser tool actions
 */
const BROWSER_DESCRIPTION = `
Interact with a web browser to perform various actions:

Actions:
- 'go_to_url': Navigate to a specific URL
- 'take_screenshot': Capture the current page
- 'get_page_info': Get information about the current page
- 'wait': Wait for a specified number of seconds
- 'wait_for_selector': Wait for an element matching the given selector
- 'click': Click on an element matching the given selector
- 'type': Type text into an element matching the given selector
- 'select': Select an option from a dropdown
- 'check': Check a checkbox
- 'uncheck': Uncheck a checkbox
- 'execute_javascript': Execute custom JavaScript on the page
- 'get_element_text': Get text content of an element
- 'get_element_attribute': Get an attribute of an element
- 'back': Navigate back in history
- 'forward': Navigate forward in history
- 'refresh': Refresh the current page
- 'new_tab': Open a new tab
- 'close_tab': Close the current tab
- 'switch_tab': Switch to a different tab by index
- 'extract_content': Extract content based on a specified goal
- 'web_search': Search the web and navigate to the first result
`;

/**
 * Interface for browser tool parameters
 */
interface BrowserToolParams {
  action: string;
  url?: string;
  seconds?: number;
  selector?: string;
  text?: string;
  value?: string;
  attribute?: string;
  index?: number;
  javascript?: string;
  options?: string[];
  goal?: string;
  query?: string;
  num_results?: number;
}

/**
 * Browser Tool for interacting with a web browser.
 * This is a comprehensive implementation using Playwright directly.
 */
export class BrowserTool extends BaseTool {
  // BaseTool properties
  name: string = 'browser';
  description: string = BROWSER_DESCRIPTION;
  requiredParams: string[] = ['action'];

  // Private properties
  private browser: Browser | null = null;
  private page: Page | null = null;
  private pages: Page[] = [];
  private lock: Promise<any> | null = null;
  private webSearchTool: WebSearchTool;

  // Event handler for reporting browser events to the event stream
  eventHandler?: (event: any) => void;

  constructor(options: any = {}) {
    super();

    // Initialize web search tool
    this.webSearchTool = new WebSearchTool();

    // Set event handler if provided
    this.eventHandler = options?.eventHandler;

    // Initialize parameters
    this.parameters = {
      action: {
        type: 'string',
        description: 'The browser action to perform',
        required: true,
        enum: [
          'go_to_url',
          'take_screenshot',
          'get_page_info',
          'wait',
          'wait_for_selector',
          'click',
          'type',
          'select',
          'check',
          'uncheck',
          'execute_javascript',
          'get_element_text',
          'get_element_attribute',
          'back',
          'forward',
          'refresh',
          'new_tab',
          'close_tab',
          'switch_tab',
          'extract_content',
          'web_search',
        ],
      },
      url: {
        type: 'string',
        description: "URL for 'go_to_url' action",
        required: false,
      },
      seconds: {
        type: 'number',
        description: "Seconds to wait for 'wait' action",
        required: false,
      },
      selector: {
        type: 'string',
        description: 'CSS selector for element-based actions',
        required: false,
      },
      text: {
        type: 'string',
        description: 'Text to type or content to match',
        required: false,
      },
      value: {
        type: 'string',
        description: 'Value for input fields or attributes',
        required: false,
      },
      attribute: {
        type: 'string',
        description: "Attribute name for 'get_element_attribute' action",
        required: false,
      },
      index: {
        type: 'number',
        description: 'Index for tab switching or multi-element selection',
        required: false,
      },
      javascript: {
        type: 'string',
        description: 'JavaScript code to execute on the page',
        required: false,
      },
      options: {
        type: 'array',
        description: 'Options for select dropdowns',
        required: false,
        items: {
          type: 'string',
          description: 'Option value or label',
          required: false,
        },
      },
      goal: {
        type: 'string',
        description: "Extraction goal for 'extract_content' action",
        required: false,
      },
      query: {
        type: 'string',
        description: "Search query for 'web_search' action",
        required: false,
      },
      num_results: {
        type: 'number',
        description: "Number of results to return for 'web_search' action",
        required: false,
      },
    };
  }

  /**
   * Ensure the browser is initialized
   */
  private async ensureBrowserInitialized(): Promise<{ browser: Browser; page: Page }> {
    if (!this.browser) {
      try {
        logger.debug('Initializing browser...');
        // Launch a new browser with additional options for stability
        this.browser = await chromium.launch({
          headless: false,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-features=site-per-process', // Helps with iframe issues
            '--disable-web-security', // Helps with CORS issues
            '--disable-features=IsolateOrigins',
            '--disable-site-isolation-trials',
            '--ignore-certificate-errors', // Helps with HTTPS issues
            '--enable-features=NetworkServiceInProcess2',
            // New args to improve stability with HTTP/2
            '--disable-http2', // Disable HTTP/2 to avoid protocol errors
            '--disable-features=VizDisplayCompositor', // Reduce memory usage
            '--disable-gpu', // Disable GPU acceleration for more stability
            '--window-size=1920,1080', // Set consistent window size
          ],
          timeout: 90000, // Increase timeout to 90 seconds
        });
        logger.debug('Browser initialized successfully');

        // Get a random user agent
        const userAgent = this.getRandomUserAgent();
        logger.debug(`Using user agent: ${userAgent}`);

        // Create a new page with extended timeout
        const context = await this.browser.newContext({
          viewport: { width: 1280, height: 800 },
          userAgent,
          ignoreHTTPSErrors: true, // Helps with HTTPS issues
          bypassCSP: true, // Helps with content security policy issues
          javaScriptEnabled: true,
          extraHTTPHeaders: {
            'Accept-Language': 'en-US,en;q=0.9',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
          },
        });

        // Set default navigation and timeout after context creation
        context.setDefaultTimeout(60000);
        context.setDefaultNavigationTimeout(60000);

        // Handle dialog events automatically
        context.on('dialog', async dialog => {
          logger.info(`Dialog appeared: ${dialog.type()} - ${dialog.message()}`);
          await dialog.accept();
        });

        // Add error event handlers
        context.on('page', page => {
          page.on('console', msg => {
            if (msg.type() === 'error') {
              logger.error(`Page console error: ${msg.text()}`);
            }
          });
          page.on('pageerror', error => {
            logger.error(`Page JavaScript error: ${error.message}`);
          });
          page.on('requestfailed', request => {
            logger.warn(
              `Failed request: ${request.url()} - ${request.failure()?.errorText || 'unknown error'}`
            );
          });
        });

        this.page = await context.newPage();
        this.pages = [this.page];
        logger.debug('Browser page created successfully');
      } catch (error) {
        logger.error(
          `Failed to initialize browser: ${error instanceof Error ? error.message : String(error)}`
        );
        logger.error(`Stack trace: ${error instanceof Error ? error.stack : 'No stack trace'}`);
        throw error;
      }
    }

    if (!this.page) {
      throw new Error('Browser page not available');
    }

    return {
      browser: this.browser,
      page: this.page,
    };
  }

  /**
   * Execute the browser action with serialized locking to prevent concurrent operations
   */
  private async executeLocked<T>(fn: () => Promise<T>): Promise<T> {
    // Create a promise chain to ensure sequential execution
    const execute = async () => {
      try {
        return await fn();
      } catch (error) {
        logger.error('Error in browser operation:', error);
        throw error;
      }
    };

    // Chain this execution to the previous one
    this.lock = this.lock ? this.lock.then(() => execute()) : execute();
    return this.lock;
  }

  /**
   * Take a screenshot of the current page
   */
  private async takeScreenshot(): Promise<string | null> {
    try {
      if (!this.page) {
        throw new Error('Browser page not available');
      }

      // Take screenshot directly to buffer instead of file system
      logger.debug('Taking screenshot...');
      const buffer = await this.page.screenshot({
        fullPage: false, // Use partial page screenshot for reliability
        type: 'png',
      });

      // Convert to base64 directly from buffer
      const base64String = buffer.toString('base64');
      logger.debug('Screenshot captured successfully');
      return base64String;
    } catch (error) {
      logger.error(
        `Error taking screenshot: ${error instanceof Error ? error.message : String(error)}`
      );
      logger.error(`Stack trace: ${error instanceof Error ? error.stack : 'No stack trace'}`);
      return null;
    }
  }

  /**
   * Get information about the current page
   */
  private async getPageInfo(): Promise<{
    url: string;
    title: string;
    content: string;
    base64?: string;
  }> {
    try {
      if (!this.page) {
        throw new Error('Browser page not available');
      }

      // Get basic page information
      const url = this.page.url();
      const title = await this.page.title();

      // Get page content in a more structured format
      const content = await this.page.evaluate(() => {
        // Extract important page content
        const extractElements = (elements: NodeListOf<Element>): string => {
          return Array.from(elements)
            .map(el => el.textContent?.trim())
            .filter(text => text && text.length > 0)
            .join('\n');
        };

        // Extract headings for page structure
        const headings = extractElements(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));

        // Extract paragraphs for content
        const paragraphs = extractElements(document.querySelectorAll('p'));

        // Extract lists for structured data
        const lists = extractElements(document.querySelectorAll('li'));

        // Main content elements
        const mainContent = extractElements(
          document.querySelectorAll('main, article, .content, #content')
        );

        // Combine all content with section markers
        return [
          headings ? `HEADINGS:\n${headings}\n` : '',
          paragraphs ? `MAIN TEXT:\n${paragraphs}\n` : '',
          lists ? `LISTS:\n${lists}\n` : '',
          mainContent ? `MAIN CONTENT:\n${mainContent}\n` : '',
        ]
          .filter(section => section.length > 0)
          .join('\n\n');
      });

      // Take a screenshot
      const base64 = await this.takeScreenshot();

      return {
        url,
        title,
        content: content || 'No content extracted',
        base64: base64 || undefined,
      };
    } catch (error) {
      logger.error('Error getting page info:', error);
      return {
        url: 'unknown',
        title: 'unknown',
        content: `Error getting page info: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Clean up browser resources
   */
  async dispose(): Promise<void> {
    if (this.browser) {
      try {
        await this.browser.close();
        this.browser = null;
        this.page = null;
        this.pages = [];
        logger.debug('Browser closed');
      } catch (error) {
        logger.error('Error closing browser:', error);
      }
    }
  }

  /**
   * Create a new tab and switch to it
   */
  private async createNewTab(): Promise<Page> {
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    const context = this.browser.contexts()[0];
    const newPage = await context.newPage();
    this.pages.push(newPage);
    this.page = newPage;
    return newPage;
  }

  /**
   * Switch to a tab by index
   */
  private async switchTab(index: number): Promise<Page> {
    if (index < 0 || index >= this.pages.length) {
      throw new Error(`Invalid tab index: ${index}. Available tabs: ${this.pages.length}`);
    }

    this.page = this.pages[index];
    return this.page;
  }

  /**
   * Close the current tab
   */
  private async closeCurrentTab(): Promise<Page | null> {
    if (!this.page) {
      return null;
    }

    const currentIndex = this.pages.indexOf(this.page);
    await this.page.close();
    this.pages = this.pages.filter(p => p !== this.page);

    if (this.pages.length === 0) {
      this.page = null;
      return null;
    }

    // Switch to previous tab or first available
    const newIndex = Math.max(0, currentIndex - 1);
    this.page = this.pages[newIndex];
    return this.page;
  }

  /**
   * Extract content from current page using content-based patterns rather than selectors
   * This is a fallback for when selectors fail due to dynamic content
   */
  private async extractPageContentByType(contentType: string): Promise<Record<string, string>> {
    try {
      if (!this.page) {
        throw new Error('Browser page not available');
      }

      return await this.page.evaluate(type => {
        const data: Record<string, string> = {};

        // Helper function to clean text
        const cleanText = (text: string | null | undefined): string => {
          if (!text) return '';
          return text.replace(/\s+/g, ' ').trim();
        };

        // Extract main content by type
        switch (type) {
          case 'weather':
            // Temperature (look for numbers with degree symbol)
            const tempElements = Array.from(document.querySelectorAll('span, div')).filter(el => {
              const text = el.textContent?.trim() || '';
              return /\d+°[CF]?/.test(text) && text.length < 10;
            });

            if (tempElements.length > 0) {
              data.temperature = cleanText(tempElements[0].textContent);
            }

            // Weather conditions
            const weatherKeywords = ['Cloudy', 'Sunny', 'Rain', 'Snow', 'Clear', 'Fog', 'Storm'];
            const conditionElements = Array.from(document.querySelectorAll('div, span, p')).filter(
              el => {
                const text = el.textContent?.trim() || '';
                return weatherKeywords.some(keyword => text.includes(keyword)) && text.length < 50;
              }
            );

            if (conditionElements.length > 0) {
              data.condition = cleanText(conditionElements[0].textContent);
            }

            // Weather details (humidity, wind, etc.)
            ['Humidity', 'Wind', 'Precipitation', 'Visibility', 'Pressure'].forEach(detail => {
              const detailElements = Array.from(document.querySelectorAll('div, span, p')).filter(
                el => {
                  const text = el.textContent?.trim() || '';
                  return text.includes(detail) && text.length < 100;
                }
              );

              if (detailElements.length > 0) {
                data[detail.toLowerCase()] = cleanText(detailElements[0].textContent);
              }
            });
            break;

          case 'news':
            // Find main headline
            const headlineElements = Array.from(document.querySelectorAll('h1, h2')).filter(el => {
              const text = el.textContent?.trim() || '';
              return text.length > 20 && text.length < 200;
            });

            if (headlineElements.length > 0) {
              data.headline = cleanText(headlineElements[0].textContent);
            }

            // Find article content
            const articleElements = Array.from(
              document.querySelectorAll('article, [role="article"], .article, main')
            );
            if (articleElements.length > 0) {
              const paragraphs = Array.from(articleElements[0].querySelectorAll('p'))
                .map(p => cleanText(p.textContent))
                .filter(text => text.length > 0)
                .slice(0, 5); // First 5 paragraphs

              data.content = paragraphs.join('\n\n');
            }

            // Find publication date
            const dateElements = Array.from(
              document.querySelectorAll('time, [datetime], .date, .time')
            ).filter(el => {
              const text = el.textContent?.trim() || '';
              return text.length > 0 && text.length < 50;
            });

            if (dateElements.length > 0) {
              data.date = cleanText(dateElements[0].textContent);
            }
            break;

          case 'search_results':
            // Find search result links
            const resultLinks = Array.from(document.querySelectorAll('a'))
              .filter(a => {
                // Filter out navigation links
                const href = a.getAttribute('href');
                const text = a.textContent?.trim() || '';
                const parent = a.parentElement;

                return (
                  href &&
                  !href.startsWith('#') &&
                  text.length > 15 &&
                  parent &&
                  !['nav', 'header', 'footer'].includes(parent.tagName.toLowerCase())
                );
              })
              .slice(0, 10); // Top 10 results

            data.results = resultLinks
              .map((link, i) => {
                const title = cleanText(link.textContent);
                const url = link.getAttribute('href') || '';
                return `${i + 1}. ${title} - ${url}`;
              })
              .join('\n');
            break;

          default:
            // Generic content extraction
            // Main heading
            const mainHeading = document.querySelector('h1');
            if (mainHeading) {
              data.title = cleanText(mainHeading.textContent);
            }

            // Main content
            const mainContent = document.querySelector('main, article, #content, .content');
            if (mainContent) {
              const paragraphs = Array.from(mainContent.querySelectorAll('p'))
                .map(p => cleanText(p.textContent))
                .filter(text => text.length > 0)
                .slice(0, 5);

              data.content = paragraphs.join('\n\n');
            }

            // Important details
            const listItems = Array.from(document.querySelectorAll('ul li, ol li'))
              .map(li => cleanText(li.textContent))
              .filter(text => text.length > 10 && text.length < 100)
              .slice(0, 7);

            if (listItems.length > 0) {
              data.details = listItems.join('\n');
            }
        }

        return data;
      }, contentType);
    } catch (error) {
      logger.error(
        `Error extracting page content by type: ${error instanceof Error ? error.message : String(error)}`
      );
      return {};
    }
  }

  /**
   * Get current page or create a new one if it doesn't exist
   */
  private async getPage(): Promise<Page> {
    await this.ensureBrowserInitialized();
    if (!this.page) {
      const context = await this.browser!.newContext();
      this.page = await context.newPage();
      this.pages = [this.page];
    }
    return this.page;
  }

  /**
   * Navigate to a URL with enhanced retry logic and fallbacks
   */
  private async navigateToUrl(url: string): Promise<string> {
    const page = await this.getPage();

    // Basic URL validation and correction
    let targetUrl = url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      targetUrl = `https://${url}`;
      logger.debug(`URL corrected to: ${targetUrl}`);
    }

    // Define various wait options to try
    const waitOptions = ['domcontentloaded', 'load', 'networkidle', 'commit'];

    // Check if this is a travel website that might need special handling
    const isTravelWebsite = this.isTravelWebsite(targetUrl);
    if (isTravelWebsite) {
      logger.info(`Travel website detected: ${targetUrl} - Using enhanced navigation strategy`);
    }

    // Track errors for reporting
    const errors = [];

    // MODIFIED: Reduce retry attempts - only try twice max
    const maxAttempts = 2; // Reduced from 3 to 2
    const maxOptionsPerAttempt = 2; // Only try the first 2 wait options

    // Retry loop - try up to maxAttempts times with different strategies
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // For travel sites or on retry attempts, use enhanced anti-detection
      if (isTravelWebsite || attempt > 0) {
        await this.applyAntiDetectionMeasures(page);
      }

      // MODIFIED: Only try a subset of wait options to reduce loops
      for (let i = 0; i < Math.min(waitOptions.length, maxOptionsPerAttempt); i++) {
        try {
          logger.debug(
            `Navigation attempt ${attempt + 1}.${i + 1} to ${targetUrl} with wait until: ${waitOptions[i]}`
          );

          // Add random delay between attempts to appear more human-like
          if (attempt > 0 || i > 0) {
            const delay = 2000 + Math.random() * 3000;
            logger.debug(`Adding delay of ${Math.round(delay)}ms before next attempt`);
            await page.waitForTimeout(delay);
          }

          // Set up abort and timeout handlers
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Navigation timeout')), 30000); // Reduced timeout from 45s to 30s
          });

          // Navigation promise with current strategy
          const navigationPromise = page.goto(targetUrl, {
            waitUntil: waitOptions[i] as any,
            timeout: 30000, // Reduced timeout
          });

          // Race between timeout and navigation
          await Promise.race([navigationPromise, timeoutPromise]);

          // If successful, wait for additional page stabilization
          await page.waitForTimeout(2000);

          // Check if page has actual content
          const hasContent = await page.evaluate(() => {
            const body = document.body;
            return Boolean(body && body.textContent && body.textContent.trim().length > 100);
          });

          // Check for bot detection challenges
          const hasBotDetection = await this.checkForBotDetection(page);
          if (hasBotDetection) {
            logger.warn(`Bot detection detected on ${targetUrl}. Trying alternative approach.`);

            // Emit bot detection event
            this.emitBrowserErrorEvent('Bot detection encountered', {
              url: targetUrl,
              action: 'navigate',
              botDetection: true,
            });

            // MODIFIED: If this is already the last attempt, exit with error instead of continuing
            if (attempt === maxAttempts - 1) {
              return `Navigation to ${targetUrl} failed: Bot detection system blocked access. Try searching for this information instead.`;
            }

            continue; // Skip to next wait option
          }

          if (hasContent) {
            logger.debug(`Successfully navigated to ${targetUrl} with option: ${waitOptions[i]}`);

            // MODIFIED: Extract page content automatically after successful navigation
            try {
              // Take screenshot
              const screenshot = await this.takeScreenshot();

              // Get page title
              const pageTitle = await page.title();

              // Extract page content
              const pageContent = await page.evaluate(() => {
                // Get the most important content from the page
                // First try to get main content
                const mainContent =
                  document.querySelector('main') ||
                  document.querySelector('article') ||
                  document.querySelector('#content') ||
                  document.querySelector('.content');

                if (mainContent) {
                  return mainContent.innerText;
                }

                // Fall back to body text
                return document.body.innerText;
              });

              // Emit content extraction event
              this.emitBrowserEvent('browser_content', {
                url: targetUrl,
                title: pageTitle,
                content: pageContent.substring(0, 1000) + (pageContent.length > 1000 ? '...' : ''),
                contentExtracted: true,
              });

              // Include page content in navigation result
              return `Successfully navigated to ${targetUrl}\n\nPage Title: ${pageTitle}\n\nPAGE CONTENT:\n${pageContent.substring(0, 2000)}${pageContent.length > 2000 ? '...' : ''}`;
            } catch (extractError) {
              logger.warn(
                `Successfully navigated to ${targetUrl} but failed to extract content: ${extractError}`
              );
              return `Successfully navigated to ${targetUrl} but could not extract full content: ${extractError}`;
            }
          } else {
            logger.warn(
              `Navigation to ${targetUrl} succeeded but page has little content. Trying next option.`
            );
          }
        } catch (error: any) {
          const errorMsg = error.message || String(error);
          logger.warn(
            `Navigation attempt ${attempt + 1}.${i + 1} to ${targetUrl} failed: ${errorMsg}`
          );
          errors.push(errorMsg);

          // Emit navigation attempt failure event
          this.emitBrowserErrorEvent('Navigation attempt failed', {
            url: targetUrl,
            attempt: attempt + 1,
            waitOption: waitOptions[i],
            error: errorMsg,
          });

          // MODIFIED: If we've reached the maximum attempts, exit with error
          if (
            attempt === maxAttempts - 1 &&
            i === Math.min(waitOptions.length, maxOptionsPerAttempt) - 1
          ) {
            // Final error event for all attempts failed
            this.emitBrowserErrorEvent('All navigation attempts failed', {
              url: targetUrl,
              totalAttempts: maxAttempts * maxOptionsPerAttempt,
              errors: errors.slice(0, 3),
            });

            return `Navigation to ${targetUrl} failed after ${attempt + 1} attempts. Please try a different website or use web_search instead.`;
          }

          // Handle HTTP/2 specific errors - but only create one new page max
          if (
            (errorMsg.includes('net::ERR_HTTP2_PROTOCOL_ERROR') ||
              errorMsg.includes('net::ERR_SPDY_PROTOCOL_ERROR')) &&
            attempt === 0
          ) {
            // Only try HTTP/1.1 fallback once

            logger.info('HTTP/2 protocol error detected. Switching to HTTP/1.1 for next attempt.');

            // Emit HTTP/2 error event
            this.emitBrowserErrorEvent('HTTP/2 protocol error', {
              url: targetUrl,
              protocol: 'HTTP/2',
              error: errorMsg,
              action: 'Creating new page with HTTP/2 disabled',
            });

            // Try to recover by creating a new page with HTTP/2 disabled
            try {
              if (this.browser) {
                logger.debug('Creating new page with HTTP/2 disabled');
                const context = await this.browser.newContext({
                  userAgent: this.getRandomUserAgent(),
                  ignoreHTTPSErrors: true,
                  extraHTTPHeaders: {
                    Connection: 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                  },
                });

                const newPage = await context.newPage();
                // Replace current page with this one
                if (this.page) {
                  try {
                    await this.page.close();
                  } catch (e) {
                    logger.warn('Error closing old page:', e);
                  }
                }
                this.page = newPage;
                this.pages[0] = newPage;

                // Break out of inner loop to retry with new page in the next iteration
                break;
              }
            } catch (e) {
              logger.error('Error creating new page:', e);
            }
          }
        }
      }
    }

    // Final error event for all attempts failed
    this.emitBrowserErrorEvent('All navigation attempts failed', {
      url: targetUrl,
      totalAttempts: maxAttempts * maxOptionsPerAttempt,
      errors: errors.slice(0, 3),
    });

    // If all else fails, provide a detailed error message
    return `Navigation to ${targetUrl} failed. Please try a different website or use web_search to gather information instead.`;
  }

  /**
   * Execute the tool based on the provided parameters
   */
  async execute(params: BrowserToolParams): Promise<ToolResult> {
    try {
      // Initialize the browser if needed
      const { browser, page } = await this.ensureBrowserInitialized();
      this.browser = browser;
      this.page = page;

      // Process based on action
      switch (params.action) {
        case 'go_to_url':
          if (!params.url) {
            // Emit error event for missing URL parameter
            this.emitBrowserErrorEvent('Missing URL parameter', {
              action: params.action,
              error: 'URL parameter is required for go_to_url action',
            });

            return {
              content: '',
              error: 'URL parameter is required for go_to_url action',
            };
          }

          // Emit browser navigation event
          this.emitBrowserEvent('browser_navigate', {
            url: params.url,
            action: 'navigate',
          });

          try {
            // Use our enhanced navigation method
            const navigationResult = await this.navigateToUrl(params.url);

            // MODIFIED: Take a screenshot since we've successfully navigated
            const screenshot = await this.takeScreenshot();

            // Emit screenshot event with the image data
            if (screenshot) {
              this.emitBrowserEvent('browser_screenshot', {
                imageData: screenshot,
                url: params.url,
              });
            }

            return {
              content: navigationResult,
              base64_image: screenshot,
            };
          } catch (navError) {
            // Emit navigation error event
            this.emitBrowserErrorEvent('Navigation failed', {
              action: params.action,
              url: params.url,
              error: navError instanceof Error ? navError.message : String(navError),
            });

            throw navError;
          }

        case 'web_search':
          if (!params.query) {
            return {
              content: '',
              error: 'Query parameter is required for web_search action',
            };
          }

          // Emit browser search event
          this.emitBrowserEvent('browser_search', {
            query: params.query,
            action: 'search',
          });

          // Handle the search
          const searchResult = await this.executeLocked(async () => {
            try {
              return await this.handleAction(params);
            } catch (error: any) {
              logger.error(`Error in browser tool: ${error.message || String(error)}`);
              return {
                content: '',
                error: `Error in browser tool: ${error.message || String(error)}`,
              };
            }
          });

          // Emit search results event if successful
          if (searchResult && !searchResult.error && searchResult.content) {
            this.emitBrowserEvent('browser_search_results', {
              query: params.query,
              result: searchResult.content,
            });
          }

          return searchResult;

        case 'take_screenshot':
          // Emit screenshot event
          this.emitBrowserEvent('browser_action', {
            action: 'take_screenshot',
          });

          const screenshotResult = await this.executeLocked(async () => {
            try {
              const result = await this.handleAction(params);

              // Emit screenshot data if successful
              if (result.base64_image) {
                this.emitBrowserEvent('browser_screenshot', {
                  imageData: result.base64_image,
                  url: this.page ? await this.page.url() : 'unknown',
                });
              }

              return result;
            } catch (error: any) {
              logger.error(`Error in browser tool: ${error.message || String(error)}`);
              return {
                content: '',
                error: `Error in browser tool: ${error.message || String(error)}`,
              };
            }
          });

          return screenshotResult;

        case 'extract_content':
          // Emit content extraction event
          this.emitBrowserEvent('browser_action', {
            action: 'extract_content',
            goal: params.goal,
          });

          const extractResult = await this.executeLocked(async () => {
            try {
              const result = await this.handleAction(params);

              // Emit extracted content if successful
              if (result.content) {
                this.emitBrowserEvent('browser_content', {
                  url: this.page ? await this.page.url() : 'unknown',
                  content:
                    result.content.substring(0, 500) + (result.content.length > 500 ? '...' : ''),
                });
              }

              return result;
            } catch (error: any) {
              logger.error(`Error in browser tool: ${error.message || String(error)}`);
              return {
                content: '',
                error: `Error in browser tool: ${error.message || String(error)}`,
              };
            }
          });

          return extractResult;

        default:
          // For all other actions, emit a generic browser action event
          this.emitBrowserEvent('browser_action', {
            action: params.action,
            params: this.sanitizeParams(params),
          });

          // For all other actions, use the existing implementation
          return this.executeLocked(async () => {
            try {
              // Handle the action with the existing code
              const result = await this.handleAction(params);

              // Emit result event for significant actions
              if (result.content && ['click', 'type', 'get_page_info'].includes(params.action)) {
                this.emitBrowserEvent('browser_action_result', {
                  action: params.action,
                  result:
                    result.content.substring(0, 300) + (result.content.length > 300 ? '...' : ''),
                });
              }

              // Emit error event if the action failed
              if (result.error) {
                this.emitBrowserErrorEvent(`${params.action} action failed`, {
                  action: params.action,
                  error: result.error,
                });
              }

              return result;
            } catch (error: any) {
              // Emit error event for action failure
              this.emitBrowserErrorEvent(`${params.action} action failed with exception`, {
                action: params.action,
                error: error instanceof Error ? error.message : String(error),
              });

              logger.error(`Error in browser tool: ${error.message || String(error)}`);
              return {
                content: '',
                error: `Error in browser tool: ${error.message || String(error)}`,
              };
            }
          });
      }
    } catch (error: any) {
      // Emit error event for browser initialization failure
      this.emitBrowserErrorEvent('Browser initialization failed', {
        error: error instanceof Error ? error.message : String(error),
      });

      logger.error(`Error initializing browser: ${error.message || String(error)}`);
      return {
        content: '',
        error: `Error initializing browser: ${error.message || String(error)}`,
      };
    }
  }

  /**
   * Handle browser actions with improved error handling
   */
  private async handleAction(params: BrowserToolParams): Promise<ToolResult> {
    try {
      if (!this.page) {
        throw new Error('Browser page not available');
      }

      switch (params.action) {
        case 'wait':
          const seconds = params.seconds || 5;
          const maxWait = 60; // Maximum wait time in seconds
          const actualWait = Math.min(seconds, maxWait);
          logger.debug(`Waiting for ${actualWait} seconds`);
          await this.page.waitForTimeout(actualWait * 1000);
          return { content: `Waited for ${actualWait} seconds` };

        case 'wait_for_selector': {
          if (!params.selector) {
            return {
              content: '',
              error: 'Selector parameter is required for wait_for_selector action',
            };
          }

          try {
            logger.debug(`Waiting for selector: ${params.selector}`);
            // Try with a reasonable timeout
            await this.page.waitForSelector(params.selector, { timeout: 15000 });
            return { content: `Found element with selector: ${params.selector}` };
          } catch (error) {
            // If selector doesn't appear, try to find similar elements to help
            const similarElements = await this.findSimilarSelectors(params.selector);
            return {
              content: '',
              error: `Could not find element with selector: ${params.selector}. ${similarElements ? `\nSimilar elements found: ${similarElements}` : ''}`,
            };
          }
        }

        case 'click': {
          if (!params.selector) {
            return { content: '', error: 'Selector parameter is required for click action' };
          }

          try {
            logger.debug(`Attempting to click selector: ${params.selector}`);

            // First try normal click
            try {
              await this.page.click(params.selector, { timeout: 10000 });
              logger.debug('Click succeeded with standard method');
              await this.page.waitForTimeout(2000); // Wait for any navigation/changes
              return { content: `Clicked element with selector: ${params.selector}` };
            } catch (standardClickError) {
              logger.debug(
                `Standard click failed: ${standardClickError instanceof Error ? standardClickError.message : String(standardClickError)}`
              );

              // Try finding the element first
              const element = await this.page.$(params.selector);
              if (!element) {
                throw new Error(`Element with selector ${params.selector} not found`);
              }

              // Try with JS click as fallback
              await this.page.evaluate(selector => {
                const el = document.querySelector(selector);
                if (el) {
                  // Use optional chaining and type casting for safer access
                  const clickableEl = el as HTMLElement;
                  if (typeof clickableEl.click === 'function') {
                    clickableEl.click();
                    return true;
                  }
                }
                return false;
              }, params.selector);

              logger.debug('Click succeeded with JS method');
              await this.page.waitForTimeout(2000);
              return {
                content: `Clicked element with selector: ${params.selector} (using JS fallback)`,
              };
            }
          } catch (error) {
            const similarElements = await this.findSimilarSelectors(params.selector);
            return {
              content: '',
              error: `Failed to click element with selector: ${params.selector}. ${similarElements ? `\nSimilar elements found: ${similarElements}` : ''}`,
            };
          }
        }

        case 'extract_content': {
          if (!params.goal) {
            return { content: '', error: 'Goal parameter is required for extract_content action' };
          }

          const content = await this.extractContentFromPage(params.goal);
          const screenshot = await this.takeScreenshot();

          return {
            content: content,
            base64_image: screenshot || undefined,
          };
        }

        case 'web_search': {
          // First perform a web search
          const webSearchTool = new WebSearchTool();
          const result = await webSearchTool.execute({
            query: params.query,
            num_results: params.num_results || 5,
          });

          // Extract structured results if available
          try {
            // Convert result to string if it's not already
            const resultContent =
              typeof result === 'string'
                ? result
                : (result as any).content || JSON.stringify(result);

            // Find the JSON part of the string
            const jsonMatch = resultContent.match(
              /Search results for "[^"]+":[\s\n]+({\s*"query":[\s\S]+)/
            );
            if (jsonMatch && jsonMatch[1]) {
              const searchResultsJson = jsonMatch[1];
              const parsedResults = JSON.parse(searchResultsJson);

              // Find first URL in results
              if (parsedResults.results && parsedResults.results.length > 0) {
                const firstResult = parsedResults.results[0];
                if (firstResult.url) {
                  // Navigate to the first result
                  try {
                    // Pass the structured search results first
                    this.emitBrowserEvent('browser_search_results', {
                      query: params.query,
                      results: parsedResults.results,
                    });

                    // Then navigate to the first URL
                    const navigationResult = await this.navigateToUrl(firstResult.url);
                    return {
                      content: `Search query: "${params.query}"\n\nSearch results: ${searchResultsJson}\n\nNavigation result:\n${navigationResult}`,
                      base64_image: await this.takeScreenshot(),
                      // Extract any search results from the text if possible
                      search_results: this.extractSearchResultsFromText(resultContent),
                    };
                  } catch (navError) {
                    return {
                      content: `Search query: "${params.query}"\n\nSearch results: ${searchResultsJson}\n\nCould not navigate to the first result.`,
                      search_results: parsedResults.results,
                    };
                  }
                }
              }

              // Return structured results even if we don't navigate
              return {
                content: `Search query: "${params.query}"\n\nSearch results: ${searchResultsJson}\n\nNo clickable URLs found in the results.`,
                search_results: parsedResults.results,
              };
            }
          } catch (parseError: any) {
            logger.warn(`Failed to parse search results JSON: ${parseError.message}`);
            // Fall back to regex-based URL extraction
          }

          // Get result content as string
          const resultContent =
            typeof result === 'string' ? result : (result as any).content || JSON.stringify(result);

          // Fall back to the old regex-based extraction if JSON parsing fails
          const urlMatch = resultContent.match(/URL: (https?:\/\/[^\s]+)/);
          if (urlMatch && urlMatch[1]) {
            const url = urlMatch[1].replace(/[.,;]$/, ''); // Clean up URL
            logger.debug(`Found URL in search results: ${url}`);

            // Navigate to the first result
            try {
              const navigationResult = await this.navigateToUrl(url);
              return {
                content: `Search query: "${params.query}"\n\nSearch results:\n${resultContent}\n\nNavigation result:\n${navigationResult}`,
                base64_image: await this.takeScreenshot(),
                // Extract any search results from the text if possible
                search_results: this.extractSearchResultsFromText(resultContent),
              };
            } catch (navError) {
              return {
                content: `Search query: "${params.query}"\n\nSearch results:\n${resultContent}\n\nCould not navigate to the first result.`,
              };
            }
          }

          return {
            content: `Search query: "${params.query}"\n\nSearch results:\n${resultContent}\n\nNo clickable URLs found in the results.`,
          };
        }

        case 'take_screenshot': {
          const screenshot = await this.takeScreenshot();
          return {
            content: 'Screenshot captured',
            base64_image: screenshot || undefined,
          };
        }

        case 'get_page_info': {
          const pageInfo = await this.getPageInfo();
          return {
            content: `Current page: ${pageInfo.url}\nTitle: ${pageInfo.title}\n\nContent:\n${pageInfo.content}`,
            base64_image: pageInfo.base64,
          };
        }

        case 'type': {
          if (!params.selector || params.text === undefined) {
            return {
              content: '',
              error: 'Selector and text parameters are required for type action',
            };
          }

          try {
            // First clear any existing content
            await this.page.evaluate(selector => {
              const element = document.querySelector(selector);
              if (element && 'value' in element) {
                (element as HTMLInputElement).value = '';
              }
            }, params.selector);

            // Then type the new text
            await this.page.type(params.selector, params.text, { delay: 50 });
            return {
              content: `Typed "${params.text}" into element with selector: ${params.selector}`,
            };
          } catch (error) {
            // Try with JavaScript as fallback
            try {
              // Fix: Use a single callback function that takes both parameters
              await this.page.evaluate(
                params => {
                  const element = document.querySelector(params.selector);
                  if (element && 'value' in element) {
                    (element as HTMLInputElement).value = params.text;
                    // Fire input and change events
                    element.dispatchEvent(new Event('input', { bubbles: true }));
                    element.dispatchEvent(new Event('change', { bubbles: true }));
                    return true;
                  }
                  return false;
                },
                { selector: params.selector, text: params.text }
              );

              return {
                content: `Typed "${params.text}" into element with selector: ${params.selector} (using JS fallback)`,
              };
            } catch (jsError) {
              return {
                content: '',
                error: `Failed to type text: ${error instanceof Error ? error.message : String(error)}`,
              };
            }
          }
        }

        // Add other actions with similar error handling...

        default:
          return { content: '', error: `Unsupported action: ${params.action}` };
      }
    } catch (error) {
      logger.error(
        `Error in browser action ${params.action}: ${error instanceof Error ? error.message : String(error)}`
      );
      return {
        content: '',
        error: `Error in browser action ${params.action}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Find similar selectors when a specified selector doesn't work
   */
  private async findSimilarSelectors(originalSelector: string): Promise<string | null> {
    try {
      if (!this.page) return null;

      // Extract tag name, class, or ID from original selector
      const match = originalSelector.match(/([a-z0-9]+)(\.[a-z0-9_-]+)?(\#[a-z0-9_-]+)?/i);
      if (!match) return null;

      const tag = match[1];
      const className = match[2]?.substring(1); // Remove the dot
      const id = match[3]?.substring(1); // Remove the hash

      // Find similar elements
      return await this.page.evaluate(
        ({ tag, className, id }) => {
          let selectors = [];

          // Find by tag
          if (tag) {
            const tagElements = document.querySelectorAll(tag);
            if (tagElements.length > 0 && tagElements.length < 10) {
              selectors.push(`${tag} (${tagElements.length} found)`);
            }
          }

          // Find by class
          if (className) {
            // Look for elements with similar class names
            const allElements = document.querySelectorAll('*');
            const similarClasses = new Set();

            allElements.forEach(el => {
              if (el.className && typeof el.className === 'string') {
                el.className.split(' ').forEach(cls => {
                  if (cls.includes(className) || className.includes(cls)) {
                    similarClasses.add(cls);
                  }
                });
              }
            });

            if (similarClasses.size > 0) {
              selectors.push(
                `Similar classes: ${Array.from(similarClasses).slice(0, 5).join(', ')}`
              );
            }
          }

          // Find by similar ID
          if (id) {
            const allElements = document.querySelectorAll('*');
            const similarIds = new Set();

            allElements.forEach(el => {
              if (el.id && (el.id.includes(id) || id.includes(el.id))) {
                similarIds.add(el.id);
              }
            });

            if (similarIds.size > 0) {
              selectors.push(`Similar IDs: ${Array.from(similarIds).slice(0, 5).join(', ')}`);
            }
          }

          return selectors.length > 0 ? selectors.join('; ') : null;
        },
        { tag, className, id }
      );
    } catch (error) {
      logger.error(
        `Error finding similar selectors: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }

  /**
   * Enhanced extraction method that works even when selectors fail
   */
  private async extractContentFromPage(goal: string): Promise<string> {
    if (!this.page) {
      return 'No active browser page.';
    }

    try {
      logger.debug(`Extracting content with goal: ${goal}`);

      // First try to get structured content based on goal type
      const contentTypeMap: Record<string, string> = {
        weather: 'weather',
        forecast: 'weather',
        temperature: 'weather',
        news: 'news',
        article: 'news',
        search: 'search_results',
        results: 'search_results',
        shopping: 'products',
        products: 'products',
        prices: 'products',
        schedule: 'schedule',
        timing: 'schedule',
        bus: 'schedule',
        train: 'schedule',
        flight: 'schedule',
      };

      // Determine content type from goal
      const contentType = Object.keys(contentTypeMap).find(key =>
        goal.toLowerCase().includes(key.toLowerCase())
      );

      const extractedContent = contentType
        ? await this.extractPageContentByType(contentTypeMap[contentType])
        : {};

      // If we got meaningful structured content, format and return it
      if (Object.keys(extractedContent).length > 0) {
        const formattedContent = Object.entries(extractedContent)
          .map(([key, value]) => `${key.toUpperCase()}: ${value}`)
          .join('\n\n');

        if (formattedContent.length > 100) {
          return formattedContent;
        }
      }

      // Fallback: Extract general page content
      const pageInfo = await this.getPageInfo();
      const generalContent = pageInfo.content;

      // If we have general content, use that
      if (generalContent && generalContent.length > 100) {
        return `EXTRACTED CONTENT:\n\n${generalContent}`;
      }

      // Last resort: Get all visible text
      const allText = await this.page.evaluate(() => {
        // Function to get visible text from an element
        function getVisibleText(element: Element): string {
          if (!element) return '';

          // Check if element is visible
          const style = window.getComputedStyle(element);
          if (style.display === 'none' || style.visibility === 'hidden') return '';

          // Get text content
          let text = element.textContent || '';

          // Clean up text
          return text.replace(/\s+/g, ' ').trim();
        }

        // Get text from all paragraphs, headings, and divs
        // Using a more compatible selector syntax
        const textElements = Array.from(document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, div'))
          .filter(el => el.children.length === 0) // Filter elements without children
          .map(el => getVisibleText(el))
          .filter(text => text.length > 0);

        return textElements.join('\n');
      });

      if (allText && allText.length > 0) {
        return `EXTRACTED TEXT:\n\n${allText}`;
      }

      return 'Could not extract meaningful content from the page.';
    } catch (error) {
      logger.error(
        `Error extracting content: ${error instanceof Error ? error.message : String(error)}`
      );
      return 'Error extracting content from page.';
    }
  }

  /**
   * Alias for dispose to match BaseTool interface
   */
  async cleanup(): Promise<void> {
    return this.dispose();
  }

  /**
   * Handle a failed navigation gracefully with enhanced recovery options
   */
  private async handleFailedNavigation(url: string, errorMessage: string): Promise<ToolResult> {
    logger.debug(`Handling failed navigation to ${url}`);

    try {
      // For travel websites, provide a specialized fallback
      if (this.isTravelWebsite(url)) {
        logger.info(`Travel website detected: ${url} - Using specialized fallback`);

        // Extract the site name for search
        let siteName = '';
        try {
          const hostname = new URL(url).hostname;
          siteName = hostname.split('.')[0];
        } catch (e) {
          siteName = url.split('/')[0];
        }

        // Return helpful message for travel sites
        return {
          content:
            `Unable to access travel website: ${url}\n\n` +
            `Many travel websites have strict anti-bot measures that block automated access. ` +
            `Consider these alternatives:\n\n` +
            `1. Try using the web_search tool to find information about "${siteName}"\n` +
            `2. Look for an alternative travel site that might have similar information\n` +
            `3. For specific travel information, try searching for "[destination] travel guide" or "[destination] booking options"`,
          warning: `Travel website access blocked: ${errorMessage}`,
        };
      }

      // Check if we can get any information about the current state
      const currentUrl = await this.page!.url();
      const title = await this.page!.title();

      // If we're actually on the target URL despite errors, try to extract some content
      if (currentUrl.includes(new URL(url).hostname)) {
        logger.debug(`Partial navigation success: we are on ${currentUrl}`);
        try {
          const pageInfo = await this.getPageInfo();
          const contentSummary = pageInfo.content.split('\n').slice(0, 10).join('\n');

          return {
            content: `Partial navigation to: ${url}\n\nTitle: ${pageInfo.title}\n\nContent Summary (may be incomplete):\n${contentSummary}`,
            base64_image: pageInfo.base64,
            warning: `Navigation encountered errors: ${errorMessage}`,
          };
        } catch (extractError) {
          logger.error(
            `Failed to extract content after partial navigation: ${extractError instanceof Error ? extractError.message : String(extractError)}`
          );
        }
      }

      return {
        content: '',
        error: `Failed to navigate to ${url}: ${errorMessage}. Current page: ${currentUrl} (${title})`,
      };
    } catch (infoError) {
      // Completely failed - return generic error
      return {
        content: '',
        error: `Failed to navigate to ${url}: ${errorMessage}. Browser may be in an inconsistent state.`,
      };
    }
  }

  /**
   * Get a random user agent to help avoid bot detection
   */
  private getRandomUserAgent(): string {
    const userAgents = [
      // Chrome on Windows
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.4638.69 Safari/537.36',
      // Chrome on Mac
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.55 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.4638.54 Safari/537.36',
      // Firefox on Windows
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:94.0) Gecko/20100101 Firefox/94.0',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:93.0) Gecko/20100101 Firefox/93.0',
      // Firefox on Mac
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:94.0) Gecko/20100101 Firefox/94.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:93.0) Gecko/20100101 Firefox/93.0',
      // Edge
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.55 Safari/537.36 Edg/96.0.1054.34',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.55 Safari/537.36 Edg/96.0.1054.34',
    ];

    // Select a random user agent
    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }

  /**
   * Check if a URL is for a travel website that might need special handling
   */
  private isTravelWebsite(url: string): boolean {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      const travelDomains = [
        'makemytrip',
        'redbus',
        'booking.com',
        'expedia',
        'kayak',
        'hotels.com',
        'airbnb',
        'tripadvisor',
        'goibibo',
        'cleartrip',
        'yatra',
        'easemytrip',
        'agoda',
        'ixigo',
        'trivago',
      ];

      return travelDomains.some(domain => hostname.includes(domain));
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if the current page has bot detection mechanisms
   */
  private async checkForBotDetection(page: Page): Promise<boolean> {
    try {
      // Common bot detection indicators in page content
      const botDetectionIndicators = [
        'captcha',
        'robot',
        'automated',
        'bot detection',
        'security check',
        'verify you are human',
        'cloudflare',
        'ddos protection',
        'blocked',
        'access denied',
        'suspicious activity',
      ];

      // Check for these indicators in the page
      const hasBotDetection = await page.evaluate(indicators => {
        const pageText = document.body.innerText.toLowerCase();
        return indicators.some(indicator => pageText.includes(indicator.toLowerCase()));
      }, botDetectionIndicators);

      // Also check for captcha images
      const hasCaptchaImage = await page.evaluate(() => {
        const images = document.querySelectorAll('img');
        for (const img of Array.from(images)) {
          const src = img.src.toLowerCase();
          const alt = (img.alt || '').toLowerCase();
          if (src.includes('captcha') || alt.includes('captcha')) {
            return true;
          }
        }
        return false;
      });

      return hasBotDetection || hasCaptchaImage;
    } catch (error) {
      logger.warn('Error checking for bot detection:', error);
      return false; // Assume no bot detection on error
    }
  }

  /**
   * Apply various anti-detection measures to avoid being blocked
   */
  private async applyAntiDetectionMeasures(page: Page): Promise<void> {
    try {
      // 1. Randomize viewport size slightly
      const width = 1280 + Math.floor(Math.random() * 100);
      const height = 800 + Math.floor(Math.random() * 100);
      await page.setViewportSize({ width, height });

      // 2. Emulate human-like scrolling behavior
      await page.evaluate(() => {
        if (document.body) {
          // Add random scroll positions
          const scrollPoints = [
            Math.random() * 100,
            100 + Math.random() * 200,
            300 + Math.random() * 400,
          ];

          // Scroll to each point with delay
          scrollPoints.forEach((point, index) => {
            setTimeout(
              () => {
                window.scrollTo(0, point);
              },
              index * (500 + Math.random() * 1000)
            );
          });
        }
      });

      // 3. Add random mouse movements (only in headful mode - not available in headless)
      // This is more for demonstration since we're in headless mode

      // 4. Set additional browser fingerprinting protections
      await page.evaluate(() => {
        // Override common fingerprinting methods
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false,
        });

        // Hide that we're using Playwright/automation
        Object.defineProperty(navigator, 'plugins', {
          get: () => {
            return {
              length: 3,
              item: () => null,
              namedItem: () => null,
              refresh: () => {},
            };
          },
        });
      });
    } catch (error) {
      logger.warn('Error applying anti-detection measures:', error);
    }
  }

  /**
   * Emit a browser event to the event handler if available
   */
  private emitBrowserEvent(type: string, details: any): void {
    if (this.eventHandler) {
      try {
        this.eventHandler({
          type,
          agent: 'browser',
          state: 'running',
          message: `Browser ${details.action || type}`,
          details,
        });
        logger.debug(`Emitted browser event: ${type}`);
      } catch (error) {
        logger.error(
          `Error emitting browser event: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  /**
   * Emit a browser error event to the event handler if available
   */
  private emitBrowserErrorEvent(message: string, details: any): void {
    if (this.eventHandler) {
      try {
        this.eventHandler({
          type: 'browser_error',
          agent: 'browser',
          state: 'error',
          message: `Browser error: ${message}`,
          details: {
            errorMessage: message,
            timestamp: Date.now(),
            ...details,
          },
        });
        logger.debug(`Emitted browser error event: ${message}`);
      } catch (error) {
        logger.error(
          `Error emitting browser error event: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  /**
   * Sanitize parameters to avoid sending sensitive information in events
   */
  private sanitizeParams(params: BrowserToolParams): any {
    // Make a clone to avoid modifying the original
    const sanitized = { ...params };

    // Remove potentially large or sensitive fields
    delete sanitized.javascript;

    // Truncate text fields
    if (sanitized.text && sanitized.text.length > 100) {
      sanitized.text = sanitized.text.substring(0, 100) + '...';
    }

    return sanitized;
  }

  /**
   * Extract search results from text
   */
  private extractSearchResultsFromText(text: string): any[] {
    // Try to find JSON results in HTML comment format
    try {
      const jsonMatch = text.match(/<!-- JSON_RESULTS: (.*?) -->/);
      if (jsonMatch && jsonMatch[1]) {
        const parsedData = JSON.parse(jsonMatch[1]);
        if (parsedData.results && Array.isArray(parsedData.results)) {
          return parsedData.results;
        }
      }
    } catch (e) {
      // If JSON parsing fails, try the old format
      try {
        const jsonMatch = text.match(/Search results for "[^"]+":[\s\n]+({\s*"query":[\s\S]+)/);
        if (jsonMatch && jsonMatch[1]) {
          const parsedData = JSON.parse(jsonMatch[1]);
          if (parsedData.results && Array.isArray(parsedData.results)) {
            return parsedData.results;
          }
        }
      } catch (e2) {
        // If all JSON parsing fails, we'll return empty array
        logger.warn(
          `Error extracting search results: ${e2 instanceof Error ? e2.message : String(e2)}`
        );
      }
    }
    return [];
  }
}
