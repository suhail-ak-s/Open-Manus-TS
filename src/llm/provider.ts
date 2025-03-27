import axios from 'axios';
import { ChatMessage, CompletionOptions } from '../schema';
import { logger } from '../logging';
import { config } from '../config';

/**
 * Enum for different types of LLM providers
 */
export enum LLMProviderType {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  LOCAL = 'local',
}

/**
 * Class for handling different LLM providers
 */
export class LLMProvider {
  private providerType: LLMProviderType;

  constructor(providerType: LLMProviderType) {
    this.providerType = providerType;
  }

  /**
   * Generate a completion using the configured provider
   */
  async generateCompletion(options: CompletionOptions): Promise<string> {
    switch (this.providerType) {
      case LLMProviderType.OPENAI:
        return this.generateOpenAICompletion(options);
      case LLMProviderType.ANTHROPIC:
        return this.generateAnthropicCompletion(options);
      case LLMProviderType.LOCAL:
        return this.generateLocalCompletion(options);
      default:
        throw new Error(`Unsupported provider type: ${this.providerType}`);
    }
  }

  /**
   * Generate a completion using OpenAI's API
   */
  private async generateOpenAICompletion(options: CompletionOptions): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY || config.get('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OpenAI API key not found. Set OPENAI_API_KEY env variable or in config.');
    }

    const baseUrl = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1';
    const url = `${baseUrl}/chat/completions`;

    try {
      logger.debug(`Sending request to OpenAI API with model: ${options.model}`);

      // Format messages for OpenAI
      const openaiMessages = options.messages.map((msg: ChatMessage) => ({
        role: this.mapRoleToOpenAI(msg.role),
        content: msg.content,
      }));

      const response = await axios.post(
        url,
        {
          model: options.model || 'gpt-4o',
          messages: openaiMessages,
          max_tokens: options.maxTokens || 1024,
          temperature: options.temperature || 0.7,
          stop: options.stopSequences || null,
          stream: false,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          timeout: 120000, // 2 minutes timeout
        }
      );

      if (response.data && response.data.choices && response.data.choices.length > 0) {
        return response.data.choices[0].message.content.trim();
      } else {
        throw new Error('No completion received from OpenAI');
      }
    } catch (error: any) {
      if (error.response) {
        throw new Error(
          `OpenAI API error: ${error.response.status} - ${error.response.data.error?.message || JSON.stringify(error.response.data)}`
        );
      } else if (error.request) {
        throw new Error(`OpenAI API request error: ${error.message}`);
      } else {
        throw new Error(`OpenAI API error: ${error.message}`);
      }
    }
  }

  /**
   * Generate a completion using Anthropic's API
   */
  private async generateAnthropicCompletion(options: CompletionOptions): Promise<string> {
    const apiKey = process.env.ANTHROPIC_API_KEY || config.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      throw new Error(
        'Anthropic API key not found. Set ANTHROPIC_API_KEY env variable or in config.'
      );
    }

    const url = 'https://api.anthropic.com/v1/messages';

    try {
      logger.debug(`Sending request to Anthropic API with model: ${options.model}`);

      // Format messages for Anthropic
      const formattedMessages = options.messages.map((msg: ChatMessage) => ({
        role: this.mapRoleToAnthropic(msg.role),
        content: msg.content,
      }));

      const response = await axios.post(
        url,
        {
          model: options.model || 'claude-3-opus-20240229',
          messages: formattedMessages,
          max_tokens: options.maxTokens || 1024,
          temperature: options.temperature || 0.7,
          stop_sequences: options.stopSequences || null,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          timeout: 120000, // 2 minutes timeout
        }
      );

      if (response.data && response.data.content && response.data.content.length > 0) {
        return response.data.content[0].text.trim();
      } else {
        throw new Error('No completion received from Anthropic');
      }
    } catch (error: any) {
      if (error.response) {
        throw new Error(
          `Anthropic API error: ${error.response.status} - ${error.response.data.error?.message || JSON.stringify(error.response.data)}`
        );
      } else if (error.request) {
        throw new Error(`Anthropic API request error: ${error.message}`);
      } else {
        throw new Error(`Anthropic API error: ${error.message}`);
      }
    }
  }

  /**
   * Generate a completion using local models (currently just a mock implementation)
   */
  private async generateLocalCompletion(options: CompletionOptions): Promise<string> {
    logger.debug(`Mock local LLM request with model: ${options.model}`);

    return (
      `This is a mock response from a local model (${options.model || 'default'}).\n` +
      `The system does not yet have a fully implemented local LLM provider.\n` +
      `Your prompt was: ${options.messages[options.messages.length - 1].content.substring(0, 100)}...`
    );
  }

  /**
   * Map internal role to OpenAI's role format
   */
  private mapRoleToOpenAI(role: string): string {
    switch (role) {
      case 'system':
      case 'user':
      case 'assistant':
        return role;
      default:
        return 'user';
    }
  }

  /**
   * Map internal role to Anthropic's role format
   */
  private mapRoleToAnthropic(role: string): string {
    switch (role) {
      case 'assistant':
        return 'assistant';
      case 'system':
        // Anthropic doesn't have a system role, so we'll use the user role
        return 'user';
      case 'user':
      default:
        return 'user';
    }
  }
}
