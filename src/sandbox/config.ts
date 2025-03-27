import path from 'path';
import os from 'os';
import { logger } from '../logging';

/**
 * Sandbox configuration settings
 */
export interface SandboxSettings {
  /**
   * Base directory for sandbox operations
   */
  rootDir: string;

  /**
   * Whether to clean up sandbox on exit
   */
  cleanupOnExit: boolean;

  /**
   * Maximum memory limit in MB for sandboxed processes
   */
  memoryLimitMB?: number;

  /**
   * Timeout for operations in milliseconds
   */
  timeoutMs: number;

  /**
   * Whether to allow network access
   */
  allowNetwork: boolean;

  /**
   * Max CPU usage percentage
   */
  maxCpuPercent?: number;
}

/**
 * Default sandbox settings
 */
export const DEFAULT_SANDBOX_SETTINGS: SandboxSettings = {
  rootDir: path.join(os.tmpdir(), 'openmanus-sandbox'),
  cleanupOnExit: true,
  timeoutMs: 30000, // 30 seconds
  allowNetwork: false,
};

/**
 * Get sandbox settings with defaults applied
 */
export function getSandboxSettings(options?: Partial<SandboxSettings>): SandboxSettings {
  const settings = {
    ...DEFAULT_SANDBOX_SETTINGS,
    ...options,
  };

  logger.debug(`Sandbox settings: ${JSON.stringify(settings)}`);
  return settings;
}
