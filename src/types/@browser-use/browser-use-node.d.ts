declare module '@browser-use/browser-use-node' {
  export interface ProxySettings {
    server: string;
    bypass?: string;
    username?: string;
    password?: string;
  }

  export interface BrowserConfig {
    /**
     * Whether to run browser in headless mode
     * @default false
     */
    headless?: boolean;

    /**
     * Disable browser security features
     * @default true
     */
    disableSecurity?: boolean;

    /**
     * Extra arguments to pass to the browser
     * @default []
     */
    extraChromiumArgs?: string[];

    /**
     * Path to a Chrome instance to use to connect to your normal browser
     */
    chromeInstancePath?: string;

    /**
     * Connect to a browser instance via WebSocket
     */
    wssUrl?: string;

    /**
     * Proxy settings
     */
    proxy?: ProxySettings;
  }

  export interface BrowserContextConfig {
    // Add any context configuration options here
  }

  export interface ToolResult {
    output?: string;
    error?: string;
    base64_image?: string;
  }

  export type BrowserAction =
    | 'go_to_url'
    | 'click_element'
    | 'input_text'
    | 'scroll_down'
    | 'scroll_up'
    | 'scroll_to_text'
    | 'send_keys'
    | 'get_dropdown_options'
    | 'select_dropdown_option'
    | 'go_back'
    | 'wait'
    | 'screenshot'
    | 'switch_tab'
    | 'open_tab'
    | 'close_tab';

  export interface BrowserActionParams {
    url?: string;
    index?: number;
    text?: string;
    scroll_amount?: number;
    tab_id?: number;
    query?: string;
    keys?: string;
    seconds?: number;
  }

  export class Browser {
    constructor(config?: BrowserConfig);

    /**
     * Create a new browser context
     */
    newContext(config?: BrowserContextConfig): Promise<BrowserContext>;

    /**
     * Close the browser and release resources
     */
    close(): Promise<void>;

    /**
     * Get the configuration
     */
    getConfig(): Promise<BrowserConfig>;

    /**
     * Clean up resources
     */
    cleanup(): Promise<void>;
  }

  export class BrowserContext {
    /**
     * Execute a browser action
     * @param action The browser action to perform
     * @param options Parameters for the action
     * @returns Result of the browser action
     */
    execute(
      action: BrowserAction | string,
      options: BrowserActionParams | Record<string, any>
    ): Promise<ToolResult>;

    /**
     * Close the browser context
     */
    close(): Promise<void>;

    /**
     * Go back in the browser history
     */
    goBack(): Promise<void>;

    /**
     * Refresh the current page
     */
    refreshPage(): Promise<void>;

    /**
     * Execute JavaScript in the browser
     * @param code JavaScript code to execute
     * @returns Result of the JavaScript execution
     */
    executeJavaScript<T = any>(code: string): Promise<T>;

    /**
     * Get the current page state including DOM structure, visible text, and form elements
     * @returns Current page state object
     */
    getState(): Promise<{
      url: string;
      title: string;
      pageText: string;
      formElements: Array<{
        type: string;
        id?: string;
        name?: string;
        tag: string;
        value?: string;
        placeholder?: string;
        index: number;
      }>;
      links: Array<{
        text: string;
        url: string;
        index: number;
      }>;
      buttons: Array<{
        text: string;
        id?: string;
        name?: string;
        index: number;
      }>;
      images: Array<{
        src: string;
        alt?: string;
        index: number;
      }>;
      dropdowns: Array<{
        id?: string;
        name?: string;
        options: Array<{
          text: string;
          value: string;
          selected: boolean;
        }>;
        index: number;
      }>;
    }>;
  }
}
