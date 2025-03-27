import { BaseTool } from './base';
import axios from 'axios';
import { logger } from '../logging';
import { config } from '../config';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';

// Promisify fs functions
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

/**
 * Image generation providers
 */
export enum ImageProvider {
  OPENAI = 'openai',
  STABILITY = 'stability',
  DALLE = 'dalle',
  MIDJOURNEY = 'midjourney',
}

/**
 * Image generation model
 */
export enum ImageModel {
  DALLE_2 = 'dall-e-2',
  DALLE_3 = 'dall-e-3',
  STABILITY_XL = 'stability-xl',
  MIDJOURNEY_5 = 'midjourney-5',
}

/**
 * Image size options
 */
export enum ImageSize {
  SMALL = '256x256',
  MEDIUM = '512x512',
  LARGE = '1024x1024',
  WIDE = '1792x1024',
  TALL = '1024x1792',
}

/**
 * Image quality options
 */
export enum ImageQuality {
  STANDARD = 'standard',
  HD = 'hd',
}

/**
 * Image style options
 */
export enum ImageStyle {
  VIVID = 'vivid',
  NATURAL = 'natural',
  ABSTRACT = 'abstract',
  PHOTOGRAPHIC = 'photographic',
  DIGITAL_ART = 'digital-art',
  ANIME = 'anime',
}

/**
 * Image generation parameters
 */
export interface ImageGenerationParams {
  prompt: string;
  model?: ImageModel;
  size?: ImageSize;
  quality?: ImageQuality;
  style?: ImageStyle;
  n?: number;
  save?: boolean;
  outputDir?: string;
}

/**
 * Image generation result
 */
export interface ImageGenerationResult {
  images: string[];
  model: string;
  prompt: string;
  paths?: string[];
}

/**
 * Tool for generating images using AI models
 */
export class ImageGeneratorTool extends BaseTool {
  name = 'image_generator';
  description = 'Generate images using AI models based on text prompts';
  private apiKeys: Record<ImageProvider, string | undefined> = {
    [ImageProvider.OPENAI]: undefined,
    [ImageProvider.STABILITY]: undefined,
    [ImageProvider.DALLE]: undefined,
    [ImageProvider.MIDJOURNEY]: undefined,
  };
  private defaultOutputDir: string;

  constructor() {
    super();
    // Initialize API keys from config
    this.apiKeys[ImageProvider.OPENAI] = config.get('openai.api_key');
    this.apiKeys[ImageProvider.STABILITY] = config.get('stability.api_key');
    this.apiKeys[ImageProvider.DALLE] = config.get('openai.api_key'); // DALL-E uses OpenAI key
    this.apiKeys[ImageProvider.MIDJOURNEY] = config.get('midjourney.api_key');

    // Set default output directory
    this.defaultOutputDir = config.get('image_generator.output_dir') || './generated_images';
  }

  /**
   * Execute the image generation tool
   */
  async execute(input: Record<string, any>): Promise<string> {
    const params: ImageGenerationParams = {
      prompt: input.prompt,
      model: input.model || ImageModel.DALLE_3,
      size: input.size || ImageSize.LARGE,
      quality: input.quality || ImageQuality.STANDARD,
      style: input.style || ImageStyle.VIVID,
      n: input.n || 1,
      save: input.save !== undefined ? input.save : true,
      outputDir: input.output_dir || this.defaultOutputDir,
    };

    try {
      // Validate input
      if (!params.prompt) {
        return JSON.stringify({
          success: false,
          error: 'Prompt is required for image generation',
        });
      }

      // Generate images
      const result = await this.generateImage(params);

      return JSON.stringify({
        success: true,
        result,
      });
    } catch (error) {
      logger.error(`Image generation error: ${(error as Error).message}`);
      return JSON.stringify({
        success: false,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Generate images based on parameters
   */
  private async generateImage(params: ImageGenerationParams): Promise<ImageGenerationResult> {
    const { prompt, model, size, quality, style, n, save, outputDir } = params;

    // Determine which provider to use based on the model
    let provider: ImageProvider;
    if (model?.startsWith('dall-e')) {
      provider = ImageProvider.DALLE;
    } else if (model?.startsWith('stability')) {
      provider = ImageProvider.STABILITY;
    } else if (model?.startsWith('midjourney')) {
      provider = ImageProvider.MIDJOURNEY;
    } else {
      provider = ImageProvider.OPENAI;
    }

    // Check if API key is available
    if (!this.apiKeys[provider]) {
      throw new Error(`No API key found for provider: ${provider}`);
    }

    // Generate images using the appropriate provider
    switch (provider) {
      case ImageProvider.OPENAI:
      case ImageProvider.DALLE:
        return this.generateWithOpenAI(
          prompt,
          model!,
          size!,
          quality!,
          style!,
          n!,
          save!,
          outputDir!
        );
      case ImageProvider.STABILITY:
        return this.generateWithStability(prompt, model!, size!, n!, save!, outputDir!);
      case ImageProvider.MIDJOURNEY:
        return this.generateWithMidjourney(prompt, size!, style!, n!, save!, outputDir!);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Generate images using OpenAI's DALL-E
   */
  private async generateWithOpenAI(
    prompt: string,
    model: ImageModel,
    size: ImageSize,
    quality: ImageQuality,
    style: ImageStyle,
    n: number,
    save: boolean,
    outputDir: string
  ): Promise<ImageGenerationResult> {
    try {
      const response = await axios.post(
        'https://api.openai.com/v1/images/generations',
        {
          model,
          prompt,
          n,
          size,
          quality,
          style,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKeys[ImageProvider.OPENAI]}`,
          },
        }
      );

      const images = response.data.data.map((item: any) => item.url);

      // Save images if requested
      let paths: string[] = [];
      if (save) {
        paths = await this.saveImages(images, prompt, outputDir);
      }

      return {
        images,
        model,
        prompt,
        paths: save ? paths : undefined,
      };
    } catch (error) {
      logger.error(`OpenAI image generation error: ${(error as Error).message}`);
      if (axios.isAxiosError(error) && error.response) {
        throw new Error(`OpenAI error: ${error.response.data.error.message}`);
      }
      throw error;
    }
  }

  /**
   * Generate images using Stability AI
   */
  private async generateWithStability(
    prompt: string,
    model: ImageModel,
    size: ImageSize,
    n: number,
    save: boolean,
    outputDir: string
  ): Promise<ImageGenerationResult> {
    try {
      // Convert size to width and height
      const [width, height] = size.split('x').map(dim => parseInt(dim));

      const response = await axios.post(
        'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1/text-to-image',
        {
          text_prompts: [
            {
              text: prompt,
              weight: 1,
            },
          ],
          cfg_scale: 7,
          clip_guidance_preset: 'FAST_BLUE',
          height,
          width,
          samples: n,
          steps: 30,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${this.apiKeys[ImageProvider.STABILITY]}`,
          },
        }
      );

      // Extract base64 images
      const images = response.data.artifacts.map(
        (artifact: any) => `data:image/png;base64,${artifact.base64}`
      );

      // Save images if requested
      let paths: string[] = [];
      if (save) {
        paths = await this.saveImages(images, prompt, outputDir);
      }

      return {
        images,
        model,
        prompt,
        paths: save ? paths : undefined,
      };
    } catch (error) {
      logger.error(`Stability AI image generation error: ${(error as Error).message}`);
      if (axios.isAxiosError(error) && error.response) {
        throw new Error(`Stability AI error: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  /**
   * Generate images using Midjourney (via third-party API)
   */
  private async generateWithMidjourney(
    prompt: string,
    size: ImageSize,
    style: ImageStyle,
    n: number,
    save: boolean,
    outputDir: string
  ): Promise<ImageGenerationResult> {
    throw new Error('Midjourney integration not implemented yet');
  }

  /**
   * Save images to disk
   */
  private async saveImages(images: string[], prompt: string, outputDir: string): Promise<string[]> {
    try {
      // Create output directory if it doesn't exist
      await mkdir(outputDir, { recursive: true });

      const paths: string[] = [];
      const timestamp = Date.now();

      // Process each image
      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        let imageBuffer: Buffer;

        // Handle data URLs (base64)
        if (image.startsWith('data:image')) {
          const base64Data = image.split(',')[1];
          imageBuffer = Buffer.from(base64Data, 'base64');
        } else {
          // Download image from URL
          const response = await axios.get(image, { responseType: 'arraybuffer' });
          imageBuffer = Buffer.from(response.data, 'binary');
        }

        // Generate filename based on prompt
        const promptSlug = prompt
          .toLowerCase()
          .replace(/[^a-z0-9]/gi, '_')
          .substring(0, 30);
        const uniqueId = uuidv4().substring(0, 8);
        const filename = `${promptSlug}_${timestamp}_${i}_${uniqueId}.png`;
        const filePath = path.join(outputDir, filename);

        // Write image to file
        await writeFile(filePath, imageBuffer);
        paths.push(filePath);
      }

      return paths;
    } catch (error) {
      logger.error(`Error saving images: ${(error as Error).message}`);
      throw new Error(`Failed to save images: ${(error as Error).message}`);
    }
  }
}
