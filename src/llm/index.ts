import { OpenAI, APIError, RateLimitError } from 'openai';
import { Message, ToolCall, ToolDefinition, ToolChoiceType } from '../schema';
import config from '../config';
import log from '../utils/logger';

// Define custom error classes
export class TokenLimitExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenLimitExceededError';
  }
}

export class LLMAuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LLMAuthenticationError';
  }
}

export class LLMRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LLMRateLimitError';
  }
}

export class LLMAPIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LLMAPIError';
  }
}

interface LLMOptions {
  model?: string;
  base_url?: string;
  api_key?: string;
  max_tokens?: number;
  temperature?: number;
  retries?: number;
}

interface LLMResponse {
  content: string | null;
  tool_calls?: ToolCall[];
}

export class LLM {
  private client: OpenAI;
  private model: string;
  private max_tokens: number;
  private temperature: number;
  private maxRetries: number;

  constructor(options: LLMOptions = {}) {
    const llmConfig = config.llm;

    this.model = options.model || llmConfig.model;
    this.max_tokens = options.max_tokens || llmConfig.max_tokens;
    this.temperature = options.temperature || llmConfig.temperature;
    this.maxRetries = options.retries || 3;

    // Initialize OpenAI client
    this.client = new OpenAI({
      apiKey: options.api_key || llmConfig.api_key,
      baseURL: options.base_url || llmConfig.base_url,
    });
  }

  /**
   * Send a conversation to the LLM and get a response
   */
  async ask(messages: Message[], systemMsgs?: Message[]): Promise<string> {
    const allMessages = [...(systemMsgs || []), ...messages];

    try {
      log.info(`Sending ${allMessages.length} messages to ${this.model}`);

      const response = await this.retryWithExponentialBackoff(async () => {
        const response = await this.client.chat.completions.create({
          model: this.model,
          messages: allMessages as any,
          max_tokens: this.max_tokens,
          temperature: this.temperature,
        });

        return response.choices[0]?.message?.content || '';
      });

      // Log the complete response content
      log.thought(response);

      return response;
    } catch (error) {
      this.handleLLMError(error);
      throw error; // This will only execute if handleLLMError doesn't throw
    }
  }

  /**
   * Send a conversation to the LLM with tools and get a response with potential tool calls
   */
  async askTool(
    messages: Message[],
    systemMsgs?: Message[],
    tools?: ToolDefinition[],
    tool_choice?: ToolChoiceType
  ): Promise<LLMResponse> {
    // Add an explicit instruction to provide reasoning
    const enhancedSystemMsgs = systemMsgs || [];

    // Add reasoning instruction only if not already present
    const hasReasoningInstruction = enhancedSystemMsgs.some(
      msg => msg.content && msg.content.includes('THINKING PROCESS')
    );

    if (!hasReasoningInstruction) {
      enhancedSystemMsgs.push({
        role: 'system' as const,
        content:
          'IMPORTANT: ALWAYS provide your reasoning process before selecting tools. Explain why you are selecting a particular tool and what information you hope to gain.',
      });
    }

    const allMessages = [...enhancedSystemMsgs, ...messages];

    try {
      log.info(
        `Sending ${allMessages.length} messages to ${this.model} with ${tools?.length || 0} tools`
      );

      const response = await this.retryWithExponentialBackoff(async () => {
        const response = await this.client.chat.completions.create({
          model: this.model,
          messages: allMessages as any,
          max_tokens: this.max_tokens,
          temperature: this.temperature,
          tools: tools as any,
          tool_choice: tool_choice as any,
        });

        // Debug: Log the full raw response to see what we're getting
        console.log('========= RAW RESPONSE FROM OPENAI =========');
        console.log(
          JSON.stringify(
            {
              content: response.choices[0]?.message?.content,
              tool_calls: response.choices[0]?.message?.tool_calls,
            },
            null,
            2
          )
        );
        console.log('===========================================');

        return {
          content: response.choices[0]?.message?.content || null,
          tool_calls: (response.choices[0]?.message?.tool_calls as ToolCall[]) || [],
        };
      });

      // Log the response content
      if (response.content) {
        log.thought(`CONTENT: ${response.content}`);
      }

      // Log the tool calls
      if (response.tool_calls && response.tool_calls.length > 0) {
        const toolCallsFormatted = response.tool_calls
          .map(tc => {
            return `TOOL CALL: ${tc.function.name}\nARGS: ${tc.function.arguments}`;
          })
          .join('\n\n');

        log.thought(`TOOL CALLS:\n${toolCallsFormatted}`);
      }

      return response;
    } catch (error) {
      this.handleLLMError(error);
      throw error; // This will only execute if handleLLMError doesn't throw
    }
  }

  /**
   * Send a conversation to the LLM with an image
   */
  async askWithImage(
    messages: Message[],
    image_url: string,
    systemMsgs?: Message[]
  ): Promise<string> {
    // Use vision model if specified
    const visionConfig = config.vision || config.llm;
    const visionModel = visionConfig.model;

    const messagesWithImage = [
      ...(systemMsgs || []),
      ...messages.slice(0, -1),
      {
        role: messages[messages.length - 1].role,
        content: [
          { type: 'text', text: messages[messages.length - 1].content },
          { type: 'image_url', image_url: { url: image_url } },
        ],
      },
    ];

    try {
      log.info(`Sending message with image to ${visionModel}`);

      const response = await this.client.chat.completions.create({
        model: visionModel,
        messages: messagesWithImage as any,
        max_tokens: this.max_tokens,
        temperature: this.temperature,
      });

      return response.choices[0]?.message?.content || '';
    } catch (error) {
      log.error(`Error calling vision LLM: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Helper function to handle different types of LLM errors
   */
  private handleLLMError(error: any): never {
    if (error instanceof RateLimitError) {
      log.error(`Rate limit exceeded: ${error.message}`);
      throw new LLMRateLimitError(`Rate limit exceeded: ${error.message}`);
    }

    if (error instanceof APIError) {
      if (error.status === 401) {
        log.error(`Authentication error: ${error.message}`);
        throw new LLMAuthenticationError(`Authentication error: ${error.message}`);
      }

      if (error.message.includes('token') && error.message.includes('limit')) {
        log.error(`Token limit exceeded: ${error.message}`);
        throw new TokenLimitExceededError(`Token limit exceeded: ${error.message}`);
      }

      log.error(`API error: ${error.message}`);
      throw new LLMAPIError(`API error: ${error.message}`);
    }

    log.error(`Unknown LLM error: ${error.message || 'No error message'}`);
    throw error;
  }

  /**
   * Retry a function with exponential backoff
   */
  private async retryWithExponentialBackoff<T>(fn: () => Promise<T>): Promise<T> {
    let retryCount = 0;
    let lastError: any;

    while (retryCount < this.maxRetries) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;

        // Don't retry for authentication errors or token limit errors
        if (
          error.status === 401 ||
          (error.message && error.message.includes('token') && error.message.includes('limit'))
        ) {
          throw error;
        }

        // Calculate backoff time - exponential with jitter
        const backoffMs =
          Math.min(1000 * Math.pow(2, retryCount), 10000) * (0.5 + Math.random() * 0.5);

        log.warning(
          `LLM request failed, retrying in ${backoffMs}ms (${retryCount + 1}/${this.maxRetries}): ${error.message}`
        );

        // Wait for backoff time
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        retryCount++;
      }
    }

    log.error(`All ${this.maxRetries} retry attempts failed.`);
    throw lastError;
  }
}

export default LLM;
