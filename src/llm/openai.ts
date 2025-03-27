import OpenAI from 'openai';
import { BaseLLMClient, LLMOptions, ChatMessage } from '../schema';
import { logger } from '../logging';

export interface OpenAIClientOptions extends LLMOptions {
  model: string;
  apiKey: string;
  temperature?: number;
  maxTokens?: number;
  organization?: string;
}

export class OpenAIClient implements BaseLLMClient {
  private client: OpenAI;
  private model: string;
  private temperature: number;
  private maxTokens: number;

  constructor(options: OpenAIClientOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      organization: options.organization,
    });
    this.model = options.model;
    this.temperature = options.temperature || 0.7;
    this.maxTokens = options.maxTokens || 2048;
  }

  async chat(
    messages: ChatMessage[],
    tools?: any[],
    toolChoice?: 'auto' | 'none' | any
  ): Promise<ChatMessage> {
    try {
      logger.debug(`OpenAI chat with ${messages.length} messages and ${tools?.length || 0} tools`);

      const apiMessages: any[] = messages.map(m => ({
        role: m.role.toLowerCase(),
        content: m.content.toString(),
        name: m.name,
        tool_calls: m.tool_calls,
      }));

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: apiMessages,
        temperature: this.temperature,
        max_tokens: this.maxTokens,
        tools: tools,
        tool_choice: toolChoice,
      });

      if (!response.choices || response.choices.length === 0) {
        throw new Error('No response choices returned from OpenAI');
      }

      const choice = response.choices[0];
      const message = choice.message;

      return {
        role: message.role as any,
        content: message.content || '',
        tool_calls: message.tool_calls,
      };
    } catch (error) {
      logger.error('Error in OpenAI chat:', error);
      throw error;
    }
  }

  async complete(prompt: string): Promise<string> {
    try {
      logger.debug(`OpenAI complete with prompt length ${prompt.length}`);

      const response = await this.client.completions.create({
        model: this.model.includes('gpt-3.5') ? 'text-davinci-003' : this.model,
        prompt,
        temperature: this.temperature,
        max_tokens: this.maxTokens,
      });

      if (!response.choices || response.choices.length === 0) {
        throw new Error('No response choices returned from OpenAI');
      }

      return response.choices[0].text || '';
    } catch (error) {
      logger.error('Error in OpenAI complete:', error);
      throw error;
    }
  }

  async embedding(text: string): Promise<number[]> {
    try {
      logger.debug(`OpenAI embedding with text length ${text.length}`);

      const response = await this.client.embeddings.create({
        model: 'text-embedding-ada-002',
        input: text,
      });

      if (!response.data || response.data.length === 0) {
        throw new Error('No embedding data returned from OpenAI');
      }

      return response.data[0].embedding;
    } catch (error) {
      logger.error('Error in OpenAI embedding:', error);
      throw error;
    }
  }
}
