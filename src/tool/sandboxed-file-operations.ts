import path from 'path';
import { BaseTool, formatToolResult, ToolParameter } from './base';
import { logger } from '../logging';
import { sandboxFileOperator } from '../sandbox/file-operator';

/**
 * Sandboxed tool for reading files in an isolated environment
 */
export class SandboxReadFileTool extends BaseTool {
  name = 'sandbox_read_file';
  description = 'Read the contents of a file in a sandboxed environment';
  parameters: Record<string, ToolParameter> = {
    file_path: {
      type: 'string',
      description: 'Path to the file, relative to the sandbox root',
      required: true,
    },
  };
  requiredParams = ['file_path'];

  async execute(input: { file_path: string }): Promise<string | any> {
    const { file_path } = input;

    try {
      // Read file content
      const content = await sandboxFileOperator.readFile(file_path);
      logger.info(`Read file in sandbox: ${file_path}`);
      return formatToolResult(content);
    } catch (error) {
      const message = (error as Error).message;
      logger.error(`Error reading file in sandbox ${file_path}: ${message}`);
      return formatToolResult(`Error reading file in sandbox: ${message}`);
    }
  }
}

/**
 * Sandboxed tool for writing files in an isolated environment
 */
export class SandboxWriteFileTool extends BaseTool {
  name = 'sandbox_write_file';
  description = 'Write content to a file in a sandboxed environment';
  parameters: Record<string, ToolParameter> = {
    file_path: {
      type: 'string',
      description: 'Path to the file, relative to the sandbox root',
      required: true,
    },
    content: {
      type: 'string',
      description: 'Content to write to the file',
      required: true,
    },
    create_dirs: {
      type: 'boolean',
      description: "Whether to create parent directories if they don't exist",
      required: false,
    },
  };
  requiredParams = ['file_path', 'content'];

  async execute(input: {
    file_path: string;
    content: string;
    create_dirs?: boolean;
  }): Promise<string | any> {
    const { file_path, content, create_dirs = false } = input;

    try {
      // Create parent directories if needed
      if (create_dirs) {
        const dirPath = path.dirname(file_path);
        await sandboxFileOperator.createDirectory(dirPath);
      }

      // Write file content
      await sandboxFileOperator.writeFile(file_path, content);
      logger.info(`Wrote file in sandbox: ${file_path}`);
      return formatToolResult(`File written successfully in sandbox: ${file_path}`);
    } catch (error) {
      const message = (error as Error).message;
      logger.error(`Error writing file in sandbox ${file_path}: ${message}`);
      return formatToolResult(`Error writing file in sandbox: ${message}`);
    }
  }
}

/**
 * Sandboxed tool for listing directory contents in an isolated environment
 */
export class SandboxListDirectoryTool extends BaseTool {
  name = 'sandbox_list_directory';
  description = 'List the contents of a directory in a sandboxed environment';
  parameters: Record<string, ToolParameter> = {
    dir_path: {
      type: 'string',
      description: 'Path to the directory, relative to the sandbox root',
      required: true,
    },
  };
  requiredParams = ['dir_path'];

  async execute(input: { dir_path: string }): Promise<string | any> {
    const { dir_path } = input;

    try {
      // List directory contents
      const entries = await sandboxFileOperator.listDirectory(dir_path);
      logger.info(`Listed directory in sandbox: ${dir_path}`);

      // Format the result
      const formattedEntries = entries.map(entry => {
        return `- ${entry}`;
      });

      return formatToolResult(
        `Contents of sandbox directory ${dir_path}:\n\n${formattedEntries.join('\n')}`
      );
    } catch (error) {
      const message = (error as Error).message;
      logger.error(`Error listing directory in sandbox ${dir_path}: ${message}`);
      return formatToolResult(`Error listing directory in sandbox: ${message}`);
    }
  }
}

/**
 * Sandboxed tool for deleting files in an isolated environment
 */
export class SandboxDeleteFileTool extends BaseTool {
  name = 'sandbox_delete_file';
  description = 'Delete a file in a sandboxed environment';
  parameters: Record<string, ToolParameter> = {
    file_path: {
      type: 'string',
      description: 'Path to the file, relative to the sandbox root',
      required: true,
    },
  };
  requiredParams = ['file_path'];

  async execute(input: { file_path: string }): Promise<string | any> {
    const { file_path } = input;

    try {
      // Delete file
      await sandboxFileOperator.deleteFile(file_path);
      logger.info(`Deleted file in sandbox: ${file_path}`);
      return formatToolResult(`File deleted successfully in sandbox: ${file_path}`);
    } catch (error) {
      const message = (error as Error).message;
      logger.error(`Error deleting file in sandbox ${file_path}: ${message}`);
      return formatToolResult(`Error deleting file in sandbox: ${message}`);
    }
  }
}

/**
 * Sandboxed tool for creating directories in an isolated environment
 */
export class SandboxCreateDirectoryTool extends BaseTool {
  name = 'sandbox_create_directory';
  description = 'Create a directory in a sandboxed environment';
  parameters: Record<string, ToolParameter> = {
    dir_path: {
      type: 'string',
      description: 'Path to the directory, relative to the sandbox root',
      required: true,
    },
  };
  requiredParams = ['dir_path'];

  async execute(input: { dir_path: string }): Promise<string | any> {
    const { dir_path } = input;

    try {
      // Create directory
      await sandboxFileOperator.createDirectory(dir_path);
      logger.info(`Created directory in sandbox: ${dir_path}`);
      return formatToolResult(`Directory created successfully in sandbox: ${dir_path}`);
    } catch (error) {
      const message = (error as Error).message;
      logger.error(`Error creating directory in sandbox ${dir_path}: ${message}`);
      return formatToolResult(`Error creating directory in sandbox: ${message}`);
    }
  }
}
