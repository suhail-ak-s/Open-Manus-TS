import { BaseTool, formatToolResult, ToolParameter } from './base';
import { logger } from '../logging';
import { config } from '../config';
import { LLMProvider, LLMProviderType } from '../llm/provider';
import { ChatMessage, Role } from '../schema';

/**
 * Tool for generating completions from LLM models
 */
export class ChatCompletionTool extends BaseTool {
  name = 'chat_completion';
  description = 'Generate text completions using various LLM providers';

  parameters: Record<string, ToolParameter> = {
    prompt: {
      type: 'string',
      description: 'The prompt to send to the LLM',
      required: true,
    },
    model: {
      type: 'string',
      description: 'Model to use (defaults to system-configured model)',
      required: false,
    },
    provider: {
      type: 'string',
      description: 'LLM provider to use: openai, anthropic, or local',
      enum: ['openai', 'anthropic', 'local'],
      required: false,
    },
    messages: {
      type: 'array',
      description: 'Optional conversation history as an array of {role, content} objects',
      required: false,
    },
    max_tokens: {
      type: 'number',
      description: 'Maximum tokens to generate',
      required: false,
    },
    temperature: {
      type: 'number',
      description: 'Temperature for sampling (0.0-2.0)',
      required: false,
    },
    stop_sequences: {
      type: 'array',
      description: 'Optional sequences where the API will stop generating',
      required: false,
    },
  };

  requiredParams = ['prompt'];

  // Default provider selection based on configured API keys
  private defaultProvider = 'openai';

  // Default models for each provider
  private defaultModels: Record<string, string> = {
    openai: 'gpt-4o',
    anthropic: 'claude-3-opus-20240229',
    local: 'orca-mini-7b',
  };

  async execute(input: Record<string, any>): Promise<string | any> {
    const {
      prompt,
      model,
      provider = this.defaultProvider,
      messages = [],
      max_tokens = 1024,
      temperature = 0.7,
      stop_sequences = [],
    } = input;

    // Validate prompt
    if (typeof prompt !== 'string' || prompt.trim() === '') {
      return formatToolResult('Error: Prompt parameter is empty or invalid');
    }

    try {
      // Determine provider type
      let providerType: LLMProviderType;
      switch (provider.toLowerCase()) {
        case 'openai':
          providerType = LLMProviderType.OPENAI;
          break;
        case 'anthropic':
          providerType = LLMProviderType.ANTHROPIC;
          break;
        case 'local':
          providerType = LLMProviderType.LOCAL;
          break;
        default:
          providerType = LLMProviderType.OPENAI;
      }

      // Create provider instance
      const llmProvider = new LLMProvider(providerType);

      // Determine the model to use
      const modelName = model || this.defaultModels[provider] || this.defaultModels['openai'];

      // Format messages for the provider
      let chatMessages: ChatMessage[] = [];

      // Add history messages if provided
      if (Array.isArray(messages) && messages.length > 0) {
        chatMessages = messages.map(msg => {
          return {
            role: this.mapRole(msg.role),
            content: msg.content,
          };
        });
      }

      // Add the current prompt as a user message if not in history
      if (chatMessages.length === 0 || chatMessages[chatMessages.length - 1].role !== Role.USER) {
        chatMessages.push({
          role: Role.USER,
          content: prompt,
        });
      }

      logger.info(`Generating completion with ${provider} provider using model ${modelName}`);

      // Generate completion
      const completion = await llmProvider.generateCompletion({
        messages: chatMessages,
        model: modelName,
        maxTokens: max_tokens,
        temperature: temperature,
        stopSequences: stop_sequences,
      });

      // Return the result
      return formatToolResult(completion);
    } catch (error) {
      const message = (error as Error).message;
      logger.error(`Chat completion error: ${message}`);
      return formatToolResult(`Error generating completion: ${message}`);
    }
  }

  /**
   * Map string roles to schema Role enum
   */
  private mapRole(role: string): Role {
    const lowerRole = (role || '').toLowerCase();
    switch (lowerRole) {
      case 'system':
        return Role.SYSTEM;
      case 'assistant':
        return Role.ASSISTANT;
      case 'user':
      default:
        return Role.USER;
    }
  }
}
