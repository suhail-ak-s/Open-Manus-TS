import fs from 'fs';
import path from 'path';
import { parse as parseToml } from 'toml';
import dotenv from 'dotenv';
import { z } from 'zod';
import { EventEmitter } from 'events';
import { logger } from '../logging';

// Load environment variables
dotenv.config();

// Define the root path based on the project structure
const ROOT_PATH = path.resolve(__dirname, '../..');
const CONFIG_PATH = path.join(ROOT_PATH, 'config');
const WORKSPACE_PATH = path.join(ROOT_PATH, 'workspace');
const LOGS_PATH = path.join(ROOT_PATH, 'logs');

// Ensure critical directories exist
for (const dir of [WORKSPACE_PATH, LOGS_PATH, CONFIG_PATH]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logger.info(`Created directory: ${dir}`);
  }
}

// Define configuration schema with Zod
const LLMConfigSchema = z.object({
  model: z.string().default('gpt-4o'),
  base_url: z.string().default('https://api.openai.com/v1'),
  api_key: z.string().default(process.env.OPENAI_API_KEY || ''),
  max_tokens: z.number().int().positive().default(4096),
  temperature: z.number().min(0).max(2).default(0.0),
  stream: z.boolean().default(false),
  timeout: z.number().int().positive().default(60000), // 1 minute timeout
  retries: z.number().int().min(0).default(3),
});

const LoggingConfigSchema = z.object({
  level: z.enum(['debug', 'info', 'warning', 'error']).default('info'),
  file_logging: z.boolean().default(true),
  log_path: z.string().default(LOGS_PATH),
  max_files: z.number().int().positive().default(5),
  max_size: z
    .number()
    .int()
    .positive()
    .default(10 * 1024 * 1024), // 10MB
});

const AgentConfigSchema = z.object({
  max_steps: z.number().int().positive().default(20),
  max_observe: z.number().int().positive().default(10000),
  duplicate_threshold: z.number().int().min(1).default(2),
});

const SandboxConfigSchema = z.object({
  enabled: z.boolean().default(true),
  timeout: z.number().int().positive().default(30000), // 30 seconds
  memory_limit: z.number().int().positive().default(512), // MB
  prevent_network: z.boolean().default(true),
});

const ConfigSchema = z.object({
  llm: LLMConfigSchema,
  vision: LLMConfigSchema.partial().optional(),
  agent: AgentConfigSchema.optional(),
  logging: LoggingConfigSchema.optional(),
  sandbox: SandboxConfigSchema.optional(),
});

export type LLMConfig = z.infer<typeof LLMConfigSchema>;
export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type SandboxConfig = z.infer<typeof SandboxConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;

// Default configuration
const defaultConfig: Config = {
  llm: {
    model: process.env.MODEL || 'gpt-4o',
    base_url: process.env.BASE_URL || 'https://api.openai.com/v1',
    api_key: process.env.OPENAI_API_KEY || '',
    max_tokens: 4096,
    temperature: 0.0,
    stream: false,
    timeout: 60000,
    retries: 3,
  },
  agent: {
    max_steps: 20,
    max_observe: 10000,
    duplicate_threshold: 2,
  },
  logging: {
    level: 'info',
    file_logging: true,
    log_path: LOGS_PATH,
    max_files: 5,
    max_size: 10 * 1024 * 1024,
  },
  sandbox: {
    enabled: true,
    timeout: 30000,
    memory_limit: 512,
    prevent_network: true,
  },
};

// Create event emitter for config changes
class ConfigManager extends EventEmitter {
  private configCache: Config;
  private configPath: string;
  private watcher: fs.FSWatcher | null = null;
  private envCache: Record<string, string> = {};

  constructor() {
    super();
    this.configPath = path.join(CONFIG_PATH, 'config.toml');
    this.configCache = this.loadConfig();
    this.setupEnvCache();
    this.watchConfig();
  }

  /**
   * Set up environment variable cache
   */
  private setupEnvCache(): void {
    Object.keys(process.env).forEach(key => {
      if (
        key.startsWith('OPENAI_') ||
        key.startsWith('ANTHROPIC_') ||
        key.startsWith('MANUS_') ||
        key.startsWith('MCP_')
      ) {
        this.envCache[key] = process.env[key] as string;
      }
    });
  }

  /**
   * Watch config file for changes and reload
   */
  private watchConfig(): void {
    if (!fs.existsSync(this.configPath)) {
      return;
    }

    try {
      this.watcher = fs.watch(this.configPath, () => {
        logger.info('Configuration file changed, reloading...');
        this.configCache = this.loadConfig();
        this.emit('configChanged', this.configCache);
      });
    } catch (error) {
      logger.error(`Error watching config file: ${(error as Error).message}`);
    }
  }

  /**
   * Load configuration from TOML file and merge with defaults
   */
  private loadConfig(): Config {
    try {
      if (fs.existsSync(this.configPath)) {
        const configContent = fs.readFileSync(this.configPath, 'utf8');
        const parsedConfig = parseToml(configContent);

        // Merge with defaults and validate
        const mergedConfig = ConfigSchema.parse({
          ...defaultConfig,
          ...parsedConfig,
        });

        // Override with environment variables when available
        if (process.env.OPENAI_API_KEY) {
          mergedConfig.llm.api_key = process.env.OPENAI_API_KEY;
          if (mergedConfig.vision) {
            mergedConfig.vision.api_key = process.env.OPENAI_API_KEY;
          }
        }

        logger.debug('Configuration loaded successfully');
        return mergedConfig;
      }
    } catch (error) {
      logger.error(`Error loading configuration: ${(error as Error).message}`);
    }

    // Use environment variables for API keys even with default config
    if (process.env.OPENAI_API_KEY) {
      defaultConfig.llm.api_key = process.env.OPENAI_API_KEY;
      if (defaultConfig.vision) {
        defaultConfig.vision.api_key = process.env.OPENAI_API_KEY;
      }
    }

    return defaultConfig;
  }

  /**
   * Get a configuration value by key
   * @param key Key path (dot notation supported)
   * @param defaultValue Default value if not found
   */
  get(key: string, defaultValue?: any): any {
    // Check environment variables first (with priority)
    if (process.env[key]) {
      return process.env[key];
    }

    // Check the env cache
    if (this.envCache[key]) {
      return this.envCache[key];
    }

    // Handle nested keys with dot notation
    if (key.includes('.')) {
      const parts = key.split('.');
      let current: any = this.configCache;

      for (const part of parts) {
        if (current && typeof current === 'object' && part in current) {
          current = current[part];
        } else {
          return defaultValue;
        }
      }

      return current;
    }

    // Handle top-level keys
    if (key in this.configCache) {
      return (this.configCache as any)[key];
    }

    return defaultValue;
  }

  /**
   * Set a configuration value
   * @param key Key to set
   * @param value Value to set
   * @param persist Whether to save to config file
   */
  set(key: string, value: any, persist: boolean = false): void {
    if (key.includes('.')) {
      const parts = key.split('.');
      let current: any = this.configCache;

      // Navigate to the nested property
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!(part in current)) {
          current[part] = {};
        }
        current = current[part];
      }

      // Set the value
      current[parts[parts.length - 1]] = value;
    } else {
      (this.configCache as any)[key] = value;
    }

    // Emit change event
    this.emit('configChanged', this.configCache);

    // Persist if requested
    if (persist) {
      this.saveConfig();
    }
  }

  /**
   * Save current configuration to file
   */
  private saveConfig(): void {
    try {
      // Convert to TOML format (would need a TOML stringifier)
      // For now, just save as JSON
      const configJson = JSON.stringify(this.configCache, null, 2);
      fs.writeFileSync(path.join(CONFIG_PATH, 'config.json'), configJson, 'utf8');
      logger.info('Configuration saved to file');
    } catch (error) {
      logger.error(`Error saving configuration: ${(error as Error).message}`);
    }
  }

  /**
   * Register a callback for configuration changes
   * @param callback Function to call when config changes
   */
  onConfigChanged(callback: (config: Config) => void): void {
    this.on('configChanged', callback);
  }

  /**
   * Get the full configuration object
   */
  getFullConfig(): Config {
    return { ...this.configCache };
  }

  /**
   * Get paths used by the configuration
   */
  getPaths() {
    return {
      rootPath: ROOT_PATH,
      configPath: CONFIG_PATH,
      workspaceRoot: WORKSPACE_PATH,
      logsPath: LOGS_PATH,
    };
  }
}

// Export singleton configuration manager
export const configManager = new ConfigManager();

// Export configuration with get method
export const config = {
  ...configManager.getPaths(),
  ...configManager.getFullConfig(),
  get: configManager.get.bind(configManager),
  set: configManager.set.bind(configManager),
  onConfigChanged: configManager.onConfigChanged.bind(configManager),
};

export default config;
