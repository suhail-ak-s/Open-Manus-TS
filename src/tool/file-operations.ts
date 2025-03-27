import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { BaseTool, formatToolResult, ToolParameter } from './base';
import config from '../config';
import log from '../utils/logger';

// Promisify fs functions
const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);
const mkdirAsync = promisify(fs.mkdir);
const statAsync = promisify(fs.stat);
const readdirAsync = promisify(fs.readdir);
const unlinkAsync = promisify(fs.unlink);

/**
 * Tool for reading files
 */
export class ReadFileTool extends BaseTool {
  name = 'read_file';
  description = 'Read the contents of a file';
  parameters: Record<string, ToolParameter> = {
    file_path: {
      type: 'string',
      description: 'Path to the file, relative to the workspace root',
      required: true,
    },
  };
  requiredParams = ['file_path'];

  async execute(input: { file_path: string }): Promise<string | any> {
    const { file_path } = input;

    // Normalize and check the path
    const fullPath = this.resolvePath(file_path);
    if (!fullPath) {
      return formatToolResult(`Invalid file path: ${file_path}`);
    }

    try {
      // Check if file exists
      const stats = await statAsync(fullPath);
      if (!stats.isFile()) {
        return formatToolResult(`Not a file: ${file_path}`);
      }

      // Read file content
      const content = await readFileAsync(fullPath, 'utf-8');
      log.info(`Read file: ${file_path}`);
      return formatToolResult(content);
    } catch (error) {
      const message = (error as Error).message;
      log.error(`Error reading file ${file_path}: ${message}`);
      return formatToolResult(`Error reading file: ${message}`);
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
        log.warning(`Attempted to access file outside workspace: ${filePath}`);
        return null;
      }
      return filePath;
    }

    // Resolve relative path
    return path.resolve(workspaceRoot, filePath);
  }
}

/**
 * Tool for writing files
 */
export class WriteFileTool extends BaseTool {
  name = 'write_file';
  description = 'Write content to a file';
  parameters: Record<string, ToolParameter> = {
    file_path: {
      type: 'string',
      description: 'Path to the file, relative to the workspace root',
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

    // Normalize and check the path
    const fullPath = this.resolvePath(file_path);
    if (!fullPath) {
      return formatToolResult(`Invalid file path: ${file_path}`);
    }

    try {
      // Create parent directories if needed
      if (create_dirs) {
        const dirPath = path.dirname(fullPath);
        await mkdirAsync(dirPath, { recursive: true });
      }

      // Write file content
      await writeFileAsync(fullPath, content, 'utf-8');
      log.info(`Wrote file: ${file_path}`);
      return formatToolResult(`File written successfully: ${file_path}`);
    } catch (error) {
      const message = (error as Error).message;
      log.error(`Error writing file ${file_path}: ${message}`);
      return formatToolResult(`Error writing file: ${message}`);
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
        log.warning(`Attempted to write file outside workspace: ${filePath}`);
        return null;
      }
      return filePath;
    }

    // Resolve relative path
    return path.resolve(workspaceRoot, filePath);
  }
}

/**
 * Tool for listing directory contents
 */
export class ListDirectoryTool extends BaseTool {
  name = 'list_directory';
  description = 'List the contents of a directory';
  parameters: Record<string, ToolParameter> = {
    dir_path: {
      type: 'string',
      description: 'Path to the directory, relative to the workspace root',
      required: true,
    },
  };
  requiredParams = ['dir_path'];

  async execute(input: { dir_path: string }): Promise<string | any> {
    const { dir_path } = input;

    // Normalize and check the path
    const fullPath = this.resolvePath(dir_path);
    if (!fullPath) {
      return formatToolResult(`Invalid directory path: ${dir_path}`);
    }

    try {
      // Check if directory exists
      const stats = await statAsync(fullPath);
      if (!stats.isDirectory()) {
        return formatToolResult(`Not a directory: ${dir_path}`);
      }

      // Read directory contents
      const entries = await readdirAsync(fullPath);
      log.info(`Listed directory: ${dir_path}`);

      // Add file type information
      const entriesWithInfo = await Promise.all(
        entries.map(async (entry: string) => {
          const entryPath = path.join(fullPath, entry);
          try {
            const entryStat = await statAsync(entryPath);
            return {
              name: entry,
              type: entryStat.isDirectory() ? 'directory' : 'file',
              size: entryStat.size,
              modified: entryStat.mtime.toISOString(),
            };
          } catch (error) {
            return {
              name: entry,
              type: 'unknown',
              error: (error as Error).message,
            };
          }
        })
      );

      // Format the result
      const formattedEntries = entriesWithInfo.map(entry => {
        if (entry.type === 'directory') {
          return `📁 ${entry.name}/`;
        } else if (entry.type === 'file') {
          const fileSize =
            entry.size !== undefined ? this.formatFileSize(entry.size) : 'unknown size';
          return `📄 ${entry.name} (${fileSize})`;
        } else {
          return `❓ ${entry.name}`;
        }
      });

      return formatToolResult(`Contents of ${dir_path}:\n\n${formattedEntries.join('\n')}`);
    } catch (error) {
      const message = (error as Error).message;
      log.error(`Error listing directory ${dir_path}: ${message}`);
      return formatToolResult(`Error listing directory: ${message}`);
    }
  }

  /**
   * Resolves a path relative to the workspace root
   */
  private resolvePath(dirPath: string): string | null {
    // Get workspace root from config
    const workspaceRoot = config.get('WORKSPACE_ROOT') || process.cwd();

    if (path.isAbsolute(dirPath)) {
      // Only allow directories within the workspace root
      if (!dirPath.startsWith(workspaceRoot)) {
        log.warning(`Attempted to access directory outside workspace: ${dirPath}`);
        return null;
      }
      return dirPath;
    }

    // Resolve relative path
    return path.resolve(workspaceRoot, dirPath);
  }

  /**
   * Format file size in a human-readable format
   */
  private formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }
}
