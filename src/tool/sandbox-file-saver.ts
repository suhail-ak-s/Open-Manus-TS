import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { BaseTool, formatToolResult, ToolParameter } from './base';
import { logger } from '../logging';
import { sandboxFileOperator } from '../sandbox/file-operator';
import { sandboxClient } from '../sandbox/client';

/**
 * Tool for saving files in a sandboxed environment with advanced features
 */
export class SandboxFileSaverTool extends BaseTool {
  name = 'sandbox_file_saver';
  description = 'Save files in a sandbox with versioning and additional features';

  parameters: Record<string, ToolParameter> = {
    file_path: {
      type: 'string',
      description: 'Path to save the file (relative to sandbox root)',
      required: true,
    },
    content: {
      type: 'string',
      description: 'Content to save (text data only in sandbox)',
      required: true,
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
  };

  requiredParams = ['file_path', 'content'];

  async execute(input: Record<string, any>): Promise<string | any> {
    const { file_path, content, create_backup = false, versioned = false } = input;

    try {
      // Initialize sandbox if needed
      await sandboxClient.initialize();

      // Validate content
      if (typeof content !== 'string') {
        return formatToolResult('Error: Content must be a string');
      }

      // Create directory if it doesn't exist
      const dirPath = path.dirname(file_path);
      if (dirPath !== '.') {
        await sandboxFileOperator.createDirectory(dirPath);
      }

      // Handle backups if needed
      if ((create_backup || versioned) && (await sandboxClient.pathExists(file_path))) {
        await this.createBackup(file_path, versioned);
      }

      // Write the file
      await sandboxFileOperator.writeFile(file_path, content);
      logger.info(`Saved file in sandbox: ${file_path} (${content.length} chars)`);

      // Return success message
      return formatToolResult(`File saved successfully in sandbox: ${file_path}`);
    } catch (error) {
      const message = (error as Error).message;
      logger.error(`Error saving file in sandbox ${file_path}: ${message}`);
      return formatToolResult(`Error saving file in sandbox: ${message}`);
    }
  }

  /**
   * Create a backup of the specified file
   */
  private async createBackup(filePath: string, versioned: boolean): Promise<void> {
    try {
      // Read the existing file
      const content = await sandboxFileOperator.readFile(filePath);

      // Generate backup path
      let backupPath: string;
      if (versioned) {
        // Create a versioned copy with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const ext = path.extname(filePath);
        const baseName = path.basename(filePath, ext);
        const dirName = path.dirname(filePath);

        const versionedDir = path.join(dirName, '.versions');
        await sandboxFileOperator.createDirectory(versionedDir);

        backupPath = path.join(versionedDir, `${baseName}_${timestamp}${ext}`);
      } else {
        // Create a simple backup
        backupPath = `${filePath}.bak`;
      }

      // Write the backup file
      await sandboxFileOperator.writeFile(backupPath, content);
      logger.info(`Created backup in sandbox: ${backupPath}`);
    } catch (error) {
      logger.error(`Failed to create backup in sandbox: ${(error as Error).message}`);
      throw new Error(`Failed to create backup in sandbox: ${(error as Error).message}`);
    }
  }
}
