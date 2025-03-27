import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { BaseTool, ToolParameters, formatToolResult } from './base';
import { logger } from '../logging';
import { config } from '../config';

/**
 * Tool for generating images using OpenAI DALL-E or other image generation models
 */
export class ImageGenerationTool extends BaseTool {
  name = 'image_generation';
  description = 'Generates images based on a text prompt';

  parameters: ToolParameters = {
    prompt: {
      type: 'string',
      description: 'Text description of the image to generate',
      required: true,
    },
    model: {
      type: 'string',
      description: 'Model to use for image generation',
      required: false,
    },
    size: {
      type: 'string',
      description: 'Size of the image to generate (e.g. 1024x1024)',
      required: false,
    },
    quality: {
      type: 'string',
      description: 'Quality of the image to generate (standard or hd)',
      required: false,
    },
    outputPath: {
      type: 'string',
      description: 'Path where to save the generated image',
      required: false,
    },
  };

  private apiKey: string;
  private baseUrl: string;
  private outputDir: string;

  constructor() {
    super();
    // Get API key from config or environment
    this.apiKey = config.get('OPENAI_API_KEY') || process.env.OPENAI_API_KEY || '';
    this.baseUrl =
      config.get('OPENAI_BASE_URL') || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    this.outputDir = config.get('IMAGE_OUTPUT_DIR') || process.env.IMAGE_OUTPUT_DIR || './images';

    // Ensure the output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    this.requiredParams = ['prompt'];
  }

  async execute(input: Record<string, any>): Promise<string | any> {
    const {
      prompt,
      model = 'dall-e-3',
      size = '1024x1024',
      quality = 'standard',
      outputPath,
    } = input;

    if (!prompt) {
      return formatToolResult('Prompt is required');
    }

    if (!this.apiKey) {
      return formatToolResult(
        'OpenAI API key is required. Set OPENAI_API_KEY in your config or environment.'
      );
    }

    try {
      logger.info(`Generating image with prompt: ${prompt}`);

      // Make API request to OpenAI
      const response = await axios.post(
        `${this.baseUrl}/images/generations`,
        {
          model,
          prompt,
          n: 1,
          size,
          quality,
          response_format: 'url',
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      // Get image URL from response
      const imageUrl = response.data.data[0].url;

      // Generate a filename if not provided
      const finalOutputPath =
        outputPath || path.join(this.outputDir, `image_${uuidv4().slice(0, 8)}.png`);

      // Download the image
      const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
      fs.writeFileSync(finalOutputPath, Buffer.from(imageResponse.data, 'binary'));

      logger.info(`Image generated and saved to: ${finalOutputPath}`);

      // Return result with path and prompt info
      const resultText = `Image generated successfully and saved to: ${finalOutputPath}`;

      // Try to read the image as base64
      let base64Image: string | undefined;
      try {
        const imageBuffer = fs.readFileSync(finalOutputPath);
        base64Image = `data:image/png;base64,${imageBuffer.toString('base64')}`;
      } catch (err) {
        logger.warn(`Could not read generated image as base64: ${err}`);
      }

      return formatToolResult(resultText, base64Image);
    } catch (error) {
      logger.error(`Error generating image: ${(error as Error).message}`);
      return formatToolResult(`Failed to generate image: ${(error as Error).message}`);
    }
  }
}
