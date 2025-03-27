import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { sandboxClient } from './client';
import { logger } from '../logging';

// Promisify fs functions
const readdir = promisify(fs.readdir);

/**
 * Sandboxed file operator for secure file operations
 */
export class SandboxFileOperator {
  private static instance: SandboxFileOperator;

  /**
   * Create a new sandboxed file operator
   */
  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get the sandboxed file operator instance (singleton)
   */
  public static getInstance(): SandboxFileOperator {
    if (!SandboxFileOperator.instance) {
      SandboxFileOperator.instance = new SandboxFileOperator();
    }
    return SandboxFileOperator.instance;
  }

  /**
   * Read a file from the sandbox
   * @param filePath Path to file (relative to sandbox root)
   */
  public async readFile(filePath: string): Promise<string> {
    try {
      return await sandboxClient.readFile(filePath);
    } catch (error) {
      logger.error(`Failed to read file: ${(error as Error).message}`);
      throw new Error(`Failed to read file: ${(error as Error).message}`);
    }
  }

  /**
   * Write a file to the sandbox
   * @param filePath Path to file (relative to sandbox root)
   * @param content Content to write
   */
  public async writeFile(filePath: string, content: string): Promise<void> {
    try {
      await sandboxClient.writeFile(filePath, content);
    } catch (error) {
      logger.error(`Failed to write file: ${(error as Error).message}`);
      throw new Error(`Failed to write file: ${(error as Error).message}`);
    }
  }

  /**
   * List the contents of a directory in the sandbox
   * @param directoryPath Path to directory (relative to sandbox root)
   */
  public async listDirectory(directoryPath: string): Promise<string[]> {
    try {
      const resolvedPath = sandboxClient.resolveSandboxPath(directoryPath);

      // Check if the path exists and is a directory
      const isDir = await sandboxClient.isDirectory(directoryPath);
      if (!isDir) {
        throw new Error(`Not a directory: ${directoryPath}`);
      }

      const entries = await readdir(resolvedPath);
      return entries;
    } catch (error) {
      logger.error(`Failed to list directory: ${(error as Error).message}`);
      throw new Error(`Failed to list directory: ${(error as Error).message}`);
    }
  }

  /**
   * Delete a file in the sandbox
   * @param filePath Path to file (relative to sandbox root)
   */
  public async deleteFile(filePath: string): Promise<void> {
    try {
      const resolvedPath = sandboxClient.resolveSandboxPath(filePath);

      // Check if the path exists and is a file
      const isDir = await sandboxClient.isDirectory(filePath);
      if (isDir) {
        throw new Error(`Not a file: ${filePath}`);
      }

      const pathExists = await sandboxClient.pathExists(filePath);
      if (!pathExists) {
        throw new Error(`File does not exist: ${filePath}`);
      }

      await promisify(fs.unlink)(resolvedPath);
    } catch (error) {
      logger.error(`Failed to delete file: ${(error as Error).message}`);
      throw new Error(`Failed to delete file: ${(error as Error).message}`);
    }
  }

  /**
   * Create a directory in the sandbox
   * @param directoryPath Path to directory (relative to sandbox root)
   */
  public async createDirectory(directoryPath: string): Promise<void> {
    try {
      const resolvedPath = sandboxClient.resolveSandboxPath(directoryPath);
      await promisify(fs.mkdir)(resolvedPath, { recursive: true });
    } catch (error) {
      logger.error(`Failed to create directory: ${(error as Error).message}`);
      throw new Error(`Failed to create directory: ${(error as Error).message}`);
    }
  }

  /**
   * Delete a directory in the sandbox
   * @param directoryPath Path to directory (relative to sandbox root)
   */
  public async deleteDirectory(directoryPath: string): Promise<void> {
    try {
      const resolvedPath = sandboxClient.resolveSandboxPath(directoryPath);

      // Check if the path exists and is a directory
      const isDir = await sandboxClient.isDirectory(directoryPath);
      if (!isDir) {
        throw new Error(`Not a directory: ${directoryPath}`);
      }

      // Recursively delete the directory
      await promisify(fs.rm)(resolvedPath, { recursive: true, force: true });
    } catch (error) {
      logger.error(`Failed to delete directory: ${(error as Error).message}`);
      throw new Error(`Failed to delete directory: ${(error as Error).message}`);
    }
  }
}

// Export a singleton instance
export const sandboxFileOperator = SandboxFileOperator.getInstance();
