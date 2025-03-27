import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { exec, spawn, ExecOptions } from 'child_process';
import { getSandboxSettings, SandboxSettings } from './config';
import { logger } from '../logging';
import crypto from 'crypto';

// Promisify fs functions
const mkdir = promisify(fs.mkdir);
const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const stat = promisify(fs.stat);
const execAsync = promisify(exec);

/**
 * Sandbox client for managing the sandbox environment
 */
export class SandboxClient {
  private static instance: SandboxClient;
  private settings: SandboxSettings;
  private initialized: boolean = false;
  private sandboxId: string;

  /**
   * Create a new sandbox client
   * @param settings Sandbox settings
   */
  private constructor(settings?: Partial<SandboxSettings>) {
    this.settings = getSandboxSettings(settings);
    this.sandboxId = crypto.randomBytes(8).toString('hex');

    // Register cleanup handler
    if (this.settings.cleanupOnExit) {
      process.on('exit', () => {
        this.cleanup().catch(err => {
          logger.error(`Error cleaning up sandbox: ${err.message}`);
        });
      });
    }
  }

  /**
   * Get the sandbox client instance (singleton)
   */
  public static getInstance(settings?: Partial<SandboxSettings>): SandboxClient {
    if (!SandboxClient.instance) {
      SandboxClient.instance = new SandboxClient(settings);
    }
    return SandboxClient.instance;
  }

  /**
   * Initialize the sandbox environment
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Create sandbox root directory
      const sandboxDir = this.getSandboxDir();
      await mkdir(sandboxDir, { recursive: true });

      logger.info(`Sandbox initialized at ${sandboxDir}`);
      this.initialized = true;
    } catch (error) {
      logger.error(`Failed to initialize sandbox: ${(error as Error).message}`);
      throw new Error(`Sandbox initialization failed: ${(error as Error).message}`);
    }
  }

  /**
   * Get the sandbox directory path
   */
  public getSandboxDir(): string {
    return path.join(this.settings.rootDir, this.sandboxId);
  }

  /**
   * Convert a relative path to an absolute sandbox path
   */
  public resolveSandboxPath(filePath: string): string {
    // If path is already absolute and within sandbox, return it
    if (path.isAbsolute(filePath) && filePath.startsWith(this.getSandboxDir())) {
      return filePath;
    }

    // Otherwise resolve relative to sandbox directory
    return path.resolve(this.getSandboxDir(), filePath);
  }

  /**
   * Read a file from the sandbox
   * @param filePath Path to file (relative to sandbox root)
   */
  public async readFile(filePath: string): Promise<string> {
    await this.ensureInitialized();

    const resolvedPath = this.resolveSandboxPath(filePath);

    try {
      // Check if file exists and is a regular file
      const stats = await stat(resolvedPath);
      if (!stats.isFile()) {
        throw new Error(`Not a file: ${filePath}`);
      }

      const content = await readFile(resolvedPath, 'utf-8');
      return content;
    } catch (error) {
      logger.error(`Failed to read file in sandbox: ${(error as Error).message}`);
      throw new Error(`Failed to read file: ${(error as Error).message}`);
    }
  }

  /**
   * Write a file to the sandbox
   * @param filePath Path to file (relative to sandbox root)
   * @param content Content to write
   */
  public async writeFile(filePath: string, content: string): Promise<void> {
    await this.ensureInitialized();

    const resolvedPath = this.resolveSandboxPath(filePath);

    try {
      // Create parent directory if it doesn't exist
      const dir = path.dirname(resolvedPath);
      await mkdir(dir, { recursive: true });

      await writeFile(resolvedPath, content, 'utf-8');
    } catch (error) {
      logger.error(`Failed to write file in sandbox: ${(error as Error).message}`);
      throw new Error(`Failed to write file: ${(error as Error).message}`);
    }
  }

  /**
   * Run a command in the sandbox environment
   * @param command Command to run
   * @param timeout Timeout in milliseconds
   */
  public async runCommand(
    command: string,
    timeout?: number
  ): Promise<{ code: number; stdout: string; stderr: string }> {
    await this.ensureInitialized();

    const effectiveTimeout = timeout || this.settings.timeoutMs;

    try {
      // Prepare environment variables
      const env = { ...process.env };

      // Set up options for limiting resources
      const options: ExecOptions = {
        cwd: this.getSandboxDir(),
        env,
        timeout: effectiveTimeout,
      };

      // Execute command using exec for simplicity
      const { stdout, stderr } = await execAsync(command, options);

      return {
        code: 0,
        stdout,
        stderr,
      };
    } catch (error: any) {
      if (error.killed && error.signal === 'SIGTERM') {
        return {
          code: 124,
          stdout: '',
          stderr: `Command timed out after ${effectiveTimeout}ms`,
        };
      }

      return {
        code: error.code || 1,
        stdout: error.stdout || '',
        stderr: error.stderr || error.message,
      };
    }
  }

  /**
   * Execute Node.js code in the sandbox
   * @param code JavaScript/TypeScript code to execute
   * @param useTypeScript Whether to use TypeScript
   * @param timeout Timeout in milliseconds
   */
  public async executeNodeCode(
    code: string,
    useTypeScript: boolean = false,
    timeout?: number
  ): Promise<{ code: number; output: string; error: string }> {
    await this.ensureInitialized();

    const scriptId = crypto.randomBytes(8).toString('hex');
    const extension = useTypeScript ? 'ts' : 'js';
    const scriptPath = path.join(this.getSandboxDir(), `script_${scriptId}.${extension}`);

    try {
      // Write the code to a temporary file
      await this.writeFile(scriptPath, code);

      // Prepare command based on whether it's TypeScript or JavaScript
      const command = useTypeScript ? `npx ts-node ${scriptPath}` : `node ${scriptPath}`;

      // Run the command
      const result = await this.runCommand(command, timeout);

      return {
        code: result.code,
        output: result.stdout,
        error: result.stderr,
      };
    } catch (error) {
      return {
        code: 1,
        output: '',
        error: (error as Error).message,
      };
    } finally {
      // Clean up the temporary script file
      try {
        fs.unlinkSync(scriptPath);
      } catch (error) {
        logger.error(`Failed to delete temporary script: ${(error as Error).message}`);
      }
    }
  }

  /**
   * Check if a path exists in the sandbox
   * @param pathToCheck Path to check
   */
  public async pathExists(pathToCheck: string): Promise<boolean> {
    await this.ensureInitialized();

    const resolvedPath = this.resolveSandboxPath(pathToCheck);

    try {
      await stat(resolvedPath);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if a path is a directory in the sandbox
   * @param pathToCheck Path to check
   */
  public async isDirectory(pathToCheck: string): Promise<boolean> {
    await this.ensureInitialized();

    const resolvedPath = this.resolveSandboxPath(pathToCheck);

    try {
      const stats = await stat(resolvedPath);
      return stats.isDirectory();
    } catch (error) {
      return false;
    }
  }

  /**
   * Clean up the sandbox
   */
  public async cleanup(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    try {
      const sandboxDir = this.getSandboxDir();

      // Run rm -rf command to clean up sandbox directory
      await execAsync(`rm -rf ${sandboxDir}`);

      logger.info(`Sandbox cleaned up: ${sandboxDir}`);
      this.initialized = false;
    } catch (error) {
      logger.error(`Failed to clean up sandbox: ${(error as Error).message}`);
      throw new Error(`Failed to clean up sandbox: ${(error as Error).message}`);
    }
  }

  /**
   * Ensure the sandbox is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}

// Export a singleton instance
export const sandboxClient = SandboxClient.getInstance();
