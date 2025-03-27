import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import { BaseTool, formatToolResult, ToolParameter } from './base';
import { logger } from '../logging';
import { config } from '../config';

const writeFileAsync = promisify(fs.writeFile);
const mkdirAsync = promisify(fs.mkdir);
const readFileAsync = promisify(fs.readFile);
const statAsync = promisify(fs.stat);

/**
 * Tool for saving files with advanced features like versioning and binary support
 */
export class FileSaverTool extends BaseTool {
  name = 'file_saver';
  description = 'Save files with versioning and additional features';

  parameters: Record<string, ToolParameter> = {
    file_path: {
      type: 'string',
      description: 'Path to save the file (relative to workspace root)',
      required: true,
    },
    content: {
      type: 'string',
      description: 'Content to save (text or base64-encoded binary data)',
      required: true,
    },
    is_binary: {
      type: 'boolean',
      description: 'Whether the content is base64-encoded binary data',
      required: false,
    },
    create_backup: {
      type: 'boolean',
      description: 'Whether to create a backup of existing file',
      required: false,
    },
    versioned: {
      type: 'boolean',
      description: 'Whether to create a versioned copy',
      required: false,
    },
    encoding: {
      type: 'string',
      description: 'Encoding for text files (ignored for binary)',
      required: false,
    },
  };

  requiredParams = ['file_path', 'content'];

  async execute(input: Record<string, any>): Promise<string | any> {
    const {
      file_path,
      content,
      is_binary = false,
      create_backup = false,
      versioned = false,
      encoding = 'utf-8',
    } = input;

    try {
      // Normalize the path
      const fullPath = this.resolvePath(file_path);
      if (!fullPath) {
        return formatToolResult(`Invalid file path: ${file_path}`);
      }

      // Create directory if it doesn't exist
      const dirPath = path.dirname(fullPath);
      await this.ensureDirectoryExists(dirPath);

      // Handle backups if needed
      if ((create_backup || versioned) && fs.existsSync(fullPath)) {
        await this.createBackup(fullPath, versioned);
      }

      // Write the file
      if (is_binary) {
        // Handle base64-encoded binary data
        const binaryData = Buffer.from(content, 'base64');
        await writeFileAsync(fullPath, binaryData);
        logger.info(`Saved binary file: ${file_path} (${binaryData.length} bytes)`);
      } else {
        // Handle text data
        await writeFileAsync(fullPath, content, encoding);
        logger.info(`Saved text file: ${file_path} (${content.length} chars)`);
      }

      // Return success message
      return formatToolResult(`File saved successfully: ${file_path}`);
    } catch (error) {
      const message = (error as Error).message;
      logger.error(`Error saving file ${file_path}: ${message}`);
      return formatToolResult(`Error saving file: ${message}`);
    }
  }

  /**
   * Resolves a path relative to the workspace root
   */
  private resolvePath(filePath: string): string | null {
    // Get workspace root from config
    const workspaceRoot = config.get('WORKSPACE_ROOT') || process.cwd();

    if (path.isAbsolute(filePath)) {
      // Only allow files within the workspace root
      if (!filePath.startsWith(workspaceRoot)) {
        logger.error(`Attempted to save file outside workspace: ${filePath}`);
        return null;
      }
      return filePath;
    }

    // Resolve relative path
    return path.resolve(workspaceRoot, filePath);
  }

  /**
   * Ensure directory exists, creating it if needed
   */
  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await mkdirAsync(dirPath, { recursive: true });
    } catch (error) {
      // Ignore error if directory already exists
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * Create a backup of the specified file
   */
  private async createBackup(filePath: string, versioned: boolean): Promise<void> {
    try {
      // Read the existing file
      const content = await readFileAsync(filePath);

      // Generate backup path
      let backupPath: string;
      if (versioned) {
        // Create a versioned copy with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const ext = path.extname(filePath);
        const baseName = path.basename(filePath, ext);
        const dirName = path.dirname(filePath);

        const versionedDir = path.join(dirName, '.versions');
        await this.ensureDirectoryExists(versionedDir);

        backupPath = path.join(versionedDir, `${baseName}_${timestamp}${ext}`);
      } else {
        // Create a simple backup
        backupPath = `${filePath}.bak`;
      }

      // Write the backup file
      await writeFileAsync(backupPath, content);
      logger.info(`Created backup: ${backupPath}`);
    } catch (error) {
      logger.error(`Failed to create backup: ${(error as Error).message}`);
      throw new Error(`Failed to create backup: ${(error as Error).message}`);
    }
  }
}
