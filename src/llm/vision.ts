import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { logger } from '../logging';
import { config } from '../config';
import { ChatMessage, CompletionOptions } from '../schema';
import { countTokensForString } from './token-counter';

// Promisify fs functions
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

/**
 * Content type for a message part
 */
export enum ContentType {
  TEXT = 'text',
  IMAGE_URL = 'image_url',
}

/**
 * Image detail level for vision models
 */
export enum ImageDetail {
  AUTO = 'auto',
  LOW = 'low',
  HIGH = 'high',
}

/**
 * Message content part
 */
export interface ContentPart {
  type: ContentType;
  text?: string;
  image_url?: {
    url: string;
    detail?: ImageDetail;
  };
}

/**
 * Multimodal message with structured content
 */
export interface MultimodalMessage {
  role: string;
  content: ContentPart[];
}

/**
 * Content type for base64 encoded images
 */
export enum ImageFormat {
  JPEG = 'jpeg',
  PNG = 'png',
  WEBP = 'webp',
  GIF = 'gif',
}

/**
 * Utility class for handling vision models
 */
export class VisionHandler {
  private static VISION_MODELS = [
    'gpt-4-vision-preview',
    'gpt-4o',
    'gpt-4o-mini',
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307',
  ];

  /**
   * Check if a model supports vision/image capabilities
   */
  static isVisionModel(model: string): boolean {
    return this.VISION_MODELS.some(m => model.toLowerCase().includes(m.toLowerCase()));
  }

  /**
   * Create a multimodal message from text and optional images
   */
  static createMultimodalMessage(
    role: string,
    text: string,
    imageUrls: string[] = [],
    detail: ImageDetail = ImageDetail.AUTO
  ): MultimodalMessage {
    const content: ContentPart[] = [];

    // Add text part if provided
    if (text) {
      content.push({
        type: ContentType.TEXT,
        text,
      });
    }

    // Add image parts if provided
    for (const url of imageUrls) {
      content.push({
        type: ContentType.IMAGE_URL,
        image_url: {
          url,
          detail,
        },
      });
    }

    return {
      role,
      content,
    };
  }

  /**
   * Convert standard chat message to multimodal format
   * Detects and extracts image URLs from the message content
   */
  static convertToMultimodalFormat(message: ChatMessage): MultimodalMessage {
    const { role, content } = message;

    if (!content) {
      return { role, content: [] };
    }

    // Check if content has image markdown links or URLs
    const imageUrlRegex =
      /!\[.*?\]\((.*?)\)|<img.*?src=["'](.*?)["'].*?>|https?:\/\/.*?\.(?:png|jpg|jpeg|gif|webp)(?:\?.*?)?(?:\s|$)/gi;
    const matches = [...content.matchAll(imageUrlRegex)];

    if (matches.length === 0) {
      // No images, just return text
      return {
        role,
        content: [
          {
            type: ContentType.TEXT,
            text: content,
          },
        ],
      };
    }

    // Extract image URLs and replace them in the text
    const imageUrls: string[] = [];
    let modifiedText = content;
    let offset = 0;

    for (const match of matches) {
      const fullMatch = match[0];
      const imageUrl = match[1] || match[2] || fullMatch;
      const startIndex = match.index! - offset;
      const endIndex = startIndex + fullMatch.length;

      // Replace the image reference with a placeholder
      modifiedText =
        modifiedText.substring(0, startIndex) +
        `[Image ${imageUrls.length + 1}]` +
        modifiedText.substring(endIndex);

      // Adjust offset for future replacements
      offset += fullMatch.length - `[Image ${imageUrls.length + 1}]`.length;

      imageUrls.push(imageUrl);
    }

    // Create content parts array
    const multimodalContent: ContentPart[] = [
      {
        type: ContentType.TEXT,
        text: modifiedText,
      },
    ];

    // Add image parts
    for (const url of imageUrls) {
      multimodalContent.push({
        type: ContentType.IMAGE_URL,
        image_url: {
          url,
          detail: ImageDetail.AUTO,
        },
      });
    }

    return {
      role,
      content: multimodalContent,
    };
  }

  /**
   * Process an image file to base64 format for direct use
   */
  static async processImageToBase64(
    imagePath: string,
    format: ImageFormat = ImageFormat.PNG
  ): Promise<string> {
    try {
      // Read the image file
      const imageBuffer = await readFile(imagePath);

      // Convert to base64
      const base64Image = imageBuffer.toString('base64');

      // Return with data URI format
      return `data:image/${format};base64,${base64Image}`;
    } catch (error) {
      logger.error(`Error processing image: ${(error as Error).message}`);
      throw new Error(`Failed to process image: ${(error as Error).message}`);
    }
  }

  /**
   * Download an image from URL and return as base64
   */
  static async downloadImageAsBase64(
    imageUrl: string,
    format: ImageFormat = ImageFormat.PNG
  ): Promise<string> {
    try {
      // Check if it's already a data URL
      if (imageUrl.startsWith('data:image/')) {
        return imageUrl;
      }

      // Download the image
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
      });

      // Get content type or use default
      const contentType = response.headers['content-type'] || `image/${format}`;

      // Convert to base64
      const base64Image = Buffer.from(response.data).toString('base64');

      // Return with data URI format
      return `data:${contentType};base64,${base64Image}`;
    } catch (error) {
      logger.error(`Error downloading image: ${(error as Error).message}`);
      throw new Error(`Failed to download image: ${(error as Error).message}`);
    }
  }

  /**
   * Count tokens for a multimodal message
   */
  static countMultimodalTokens(message: MultimodalMessage, model: string): number {
    let totalTokens = 0;

    // Process each content part
    for (const part of message.content) {
      if (part.type === ContentType.TEXT && part.text) {
        // Count tokens for text
        totalTokens += countTokensForString(part.text, model);
      } else if (part.type === ContentType.IMAGE_URL && part.image_url) {
        // Add token count for image
        // This is a rough approximation based on OpenAI's documentation
        const detail = part.image_url.detail || ImageDetail.AUTO;

        if (detail === ImageDetail.LOW) {
          totalTokens += 85; // Low detail ~85 tokens
        } else if (detail === ImageDetail.HIGH) {
          totalTokens += 665; // High detail ~665 tokens
        } else {
          // Auto detail depends on image size, assume medium
          totalTokens += 300; // Medium detail ~300 tokens
        }
      }
    }

    // Add role and formatting tokens
    totalTokens += 5; // ~5 tokens for role and formatting

    return totalTokens;
  }

  /**
   * Convert multimodal messages to appropriate format for OpenAI
   */
  static convertToOpenAIFormat(messages: (ChatMessage | MultimodalMessage)[]): any[] {
    return messages.map(msg => {
      if ('content' in msg && Array.isArray(msg.content)) {
        // Already in multimodal format
        return {
          role: msg.role,
          content: msg.content,
        };
      } else {
        // Convert standard message to multimodal
        const multimodalMsg = this.convertToMultimodalFormat(msg as ChatMessage);
        return {
          role: multimodalMsg.role,
          content: multimodalMsg.content,
        };
      }
    });
  }

  /**
   * Convert multimodal messages to appropriate format for Anthropic
   */
  static convertToAnthropicFormat(messages: (ChatMessage | MultimodalMessage)[]): any[] {
    return messages.map(msg => {
      if ('content' in msg && Array.isArray(msg.content)) {
        // Already in multimodal format, convert to Anthropic's format
        return {
          role: msg.role,
          content: msg.content.map(part => {
            if (part.type === ContentType.TEXT) {
              return {
                type: 'text',
                text: part.text,
              };
            } else if (part.type === ContentType.IMAGE_URL) {
              return {
                type: 'image',
                source: {
                  type: 'url',
                  url: part.image_url?.url,
                },
              };
            }
            return part;
          }),
        };
      } else {
        // Convert standard message to Anthropic's multimodal format
        const { role, content } = msg as ChatMessage;
        return {
          role,
          content: [
            {
              type: 'text',
              text: content,
            },
          ],
        };
      }
    });
  }
}
