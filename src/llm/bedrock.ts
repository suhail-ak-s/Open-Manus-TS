import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { ChatMessage, CompletionOptions } from '../schema';
import { logger } from '../logging';
import { config } from '../config';

/**
 * AWS Bedrock model providers
 */
export enum BedrockProvider {
  ANTHROPIC = 'anthropic',
  AMAZON = 'amazon',
  AI21 = 'ai21',
  COHERE = 'cohere',
  META = 'meta',
}

/**
 * Map of provider to model IDs
 */
export const BEDROCK_MODELS: Record<BedrockProvider, string[]> = {
  [BedrockProvider.ANTHROPIC]: [
    'anthropic.claude-v2',
    'anthropic.claude-v2:1',
    'anthropic.claude-instant-v1',
    'anthropic.claude-3-sonnet-20240229-v1:0',
    'anthropic.claude-3-haiku-20240307-v1:0',
    'anthropic.claude-3-opus-20240229-v1:0',
  ],
  [BedrockProvider.AMAZON]: [
    'amazon.titan-text-express-v1',
    'amazon.titan-text-lite-v1',
    'amazon.titan-embed-text-v1',
    'amazon.titan-embed-image-v1',
  ],
  [BedrockProvider.AI21]: ['ai21.j2-grande-instruct', 'ai21.j2-jumbo-instruct', 'ai21.j2-mid'],
  [BedrockProvider.COHERE]: [
    'cohere.command-text-v14',
    'cohere.command-light-text-v14',
    'cohere.embed-english-v3',
    'cohere.embed-multilingual-v3',
  ],
  [BedrockProvider.META]: ['meta.llama2-13b-chat-v1', 'meta.llama2-70b-chat-v1'],
};

/**
 * Get the provider from a model ID
 */
export function getProviderFromModel(modelId: string): BedrockProvider | null {
  for (const [provider, models] of Object.entries(BEDROCK_MODELS)) {
    if (models.includes(modelId)) {
      return provider as BedrockProvider;
    }

    // Check if it starts with the provider name
    for (const model of models) {
      if (modelId.startsWith(model.split('.')[0])) {
        return provider as BedrockProvider;
      }
    }
  }
  return null;
}

/**
 * AWS Bedrock Client for making LLM API calls to AWS Bedrock
 */
export class BedrockClient {
  private client: BedrockRuntimeClient;
  private region: string;

  constructor(region: string = 'us-west-2') {
    this.region = region;
    this.client = new BedrockRuntimeClient({ region });
  }

  /**
   * Generate a completion using AWS Bedrock
   */
  async generateCompletion(options: CompletionOptions): Promise<string> {
    const { model, messages, maxTokens = 1024, temperature = 0.7 } = options;

    if (!model) {
      throw new Error('Model ID is required for Bedrock completions');
    }

    const provider = getProviderFromModel(model);
    if (!provider) {
      throw new Error(`Unknown model provider for ${model}`);
    }

    try {
      switch (provider) {
        case BedrockProvider.ANTHROPIC:
          return this.generateAnthropicCompletion(model, messages, maxTokens, temperature);
        case BedrockProvider.AMAZON:
          return this.generateAmazonCompletion(model, messages, maxTokens, temperature);
        case BedrockProvider.AI21:
          return this.generateAI21Completion(model, messages, maxTokens, temperature);
        case BedrockProvider.COHERE:
          return this.generateCohereCompletion(model, messages, maxTokens, temperature);
        case BedrockProvider.META:
          return this.generateMetaCompletion(model, messages, maxTokens, temperature);
        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }
    } catch (error) {
      logger.error(`Bedrock error: ${(error as Error).message}`);
      throw new Error(`Bedrock error: ${(error as Error).message}`);
    }
  }

  /**
   * Generate a completion using Anthropic models (Claude)
   */
  private async generateAnthropicCompletion(
    model: string,
    messages: ChatMessage[],
    maxTokens: number,
    temperature: number
  ): Promise<string> {
    // Convert messages to Anthropic format
    const formattedMessages = messages.map(msg => ({
      role: this.mapRoleToAnthropic(msg.role),
      content: msg.content,
    }));

    const input = {
      modelId: model,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: maxTokens,
        temperature: temperature,
        messages: formattedMessages,
      }),
    };

    const command = new InvokeModelCommand(input);
    const response = await this.client.send(command);

    // Parse response
    if (!response.body) {
      throw new Error('Empty response from Bedrock');
    }

    const responseBody = new TextDecoder().decode(response.body);
    const parsedResponse = JSON.parse(responseBody);

    if (!parsedResponse.content || !parsedResponse.content[0] || !parsedResponse.content[0].text) {
      throw new Error('Invalid response format from Bedrock Anthropic');
    }

    return parsedResponse.content[0].text;
  }

  /**
   * Generate a completion using Amazon models (Titan)
   */
  private async generateAmazonCompletion(
    model: string,
    messages: ChatMessage[],
    maxTokens: number,
    temperature: number
  ): Promise<string> {
    // Convert messages to a single prompt for Amazon's models
    const prompt = this.convertMessagesToPrompt(messages);

    const input = {
      modelId: model,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        inputText: prompt,
        textGenerationConfig: {
          maxTokenCount: maxTokens,
          temperature: temperature,
          topP: 0.9,
        },
      }),
    };

    const command = new InvokeModelCommand(input);
    const response = await this.client.send(command);

    // Parse response
    if (!response.body) {
      throw new Error('Empty response from Bedrock');
    }

    const responseBody = new TextDecoder().decode(response.body);
    const parsedResponse = JSON.parse(responseBody);

    if (
      !parsedResponse.results ||
      !parsedResponse.results[0] ||
      !parsedResponse.results[0].outputText
    ) {
      throw new Error('Invalid response format from Bedrock Amazon');
    }

    return parsedResponse.results[0].outputText;
  }

  /**
   * Generate a completion using AI21 models (Jurassic)
   */
  private async generateAI21Completion(
    model: string,
    messages: ChatMessage[],
    maxTokens: number,
    temperature: number
  ): Promise<string> {
    // Convert messages to a single prompt for AI21's models
    const prompt = this.convertMessagesToPrompt(messages);

    const input = {
      modelId: model,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        prompt: prompt,
        maxTokens: maxTokens,
        temperature: temperature,
        topP: 0.9,
      }),
    };

    const command = new InvokeModelCommand(input);
    const response = await this.client.send(command);

    // Parse response
    if (!response.body) {
      throw new Error('Empty response from Bedrock');
    }

    const responseBody = new TextDecoder().decode(response.body);
    const parsedResponse = JSON.parse(responseBody);

    if (
      !parsedResponse.completions ||
      !parsedResponse.completions[0] ||
      !parsedResponse.completions[0].data ||
      !parsedResponse.completions[0].data.text
    ) {
      throw new Error('Invalid response format from Bedrock AI21');
    }

    return parsedResponse.completions[0].data.text;
  }

  /**
   * Generate a completion using Cohere models
   */
  private async generateCohereCompletion(
    model: string,
    messages: ChatMessage[],
    maxTokens: number,
    temperature: number
  ): Promise<string> {
    // Convert messages to a single prompt for Cohere's models
    const prompt = this.convertMessagesToPrompt(messages);

    const input = {
      modelId: model,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        prompt: prompt,
        max_tokens: maxTokens,
        temperature: temperature,
        p: 0.9,
        k: 0,
        num_generations: 1,
        return_likelihoods: 'NONE',
      }),
    };

    const command = new InvokeModelCommand(input);
    const response = await this.client.send(command);

    // Parse response
    if (!response.body) {
      throw new Error('Empty response from Bedrock');
    }

    const responseBody = new TextDecoder().decode(response.body);
    const parsedResponse = JSON.parse(responseBody);

    if (
      !parsedResponse.generations ||
      !parsedResponse.generations[0] ||
      !parsedResponse.generations[0].text
    ) {
      throw new Error('Invalid response format from Bedrock Cohere');
    }

    return parsedResponse.generations[0].text;
  }

  /**
   * Generate a completion using Meta models (Llama)
   */
  private async generateMetaCompletion(
    model: string,
    messages: ChatMessage[],
    maxTokens: number,
    temperature: number
  ): Promise<string> {
    // Convert messages to Llama chat format
    const prompt = this.convertMessagesToLlamaPrompt(messages);

    const input = {
      modelId: model,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        prompt: prompt,
        max_gen_len: maxTokens,
        temperature: temperature,
        top_p: 0.9,
      }),
    };

    const command = new InvokeModelCommand(input);
    const response = await this.client.send(command);

    // Parse response
    if (!response.body) {
      throw new Error('Empty response from Bedrock');
    }

    const responseBody = new TextDecoder().decode(response.body);
    const parsedResponse = JSON.parse(responseBody);

    if (!parsedResponse.generation) {
      throw new Error('Invalid response format from Bedrock Meta');
    }

    return parsedResponse.generation;
  }

  /**
   * Convert messages to a simple prompt format
   */
  private convertMessagesToPrompt(messages: ChatMessage[]): string {
    let prompt = '';

    for (const message of messages) {
      const role = message.role.toLowerCase();
      const content = message.content;

      if (role === 'system') {
        prompt += `Instructions: ${content}\n\n`;
      } else if (role === 'user') {
        prompt += `User: ${content}\n\n`;
      } else if (role === 'assistant') {
        prompt += `Assistant: ${content}\n\n`;
      }
    }

    prompt += 'Assistant: ';
    return prompt;
  }

  /**
   * Convert messages to Llama chat format
   */
  private convertMessagesToLlamaPrompt(messages: ChatMessage[]): string {
    let prompt = '';

    for (const message of messages) {
      const role = message.role.toLowerCase();
      const content = message.content;

      if (role === 'system') {
        prompt += `<s>[INST] <<SYS>>\n${content}\n<</SYS>>\n\n`;
      } else if (role === 'user') {
        if (prompt === '') {
          prompt += `<s>[INST] ${content} [/INST]`;
        } else {
          prompt += `</s><s>[INST] ${content} [/INST]`;
        }
      } else if (role === 'assistant') {
        prompt += ` ${content} `;
      }
    }

    return prompt;
  }

  /**
   * Map internal role to Anthropic's role format
   */
  private mapRoleToAnthropic(role: string): string {
    switch (role.toLowerCase()) {
      case 'assistant':
        return 'assistant';
      case 'system':
        // Claude on Bedrock accepts system role in newer models
        return 'system';
      case 'user':
      default:
        return 'user';
    }
  }
}
