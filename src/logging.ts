import pino from 'pino';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { parse as parseToml } from 'toml';

// Load environment variables
dotenv.config();

/**
 * Available log levels
 */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/**
 * Try to load logging config from config.toml
 */
function loadLoggingConfig(): {
  level: LogLevel;
  pretty: boolean;
  file: boolean;
  filePath: string;
} {
  const defaultConfig = {
    level: (process.env.LOG_LEVEL as LogLevel) || 'info',
    pretty: true,
    file: false,
    filePath: './logs/openmanus.log',
  };

  try {
    const configPath = path.join(process.cwd(), 'config', 'config.toml');
    if (fs.existsSync(configPath)) {
      const configContent = fs.readFileSync(configPath, 'utf8');
      const parsedConfig = parseToml(configContent);

      if (parsedConfig.logging) {
        return {
          level: (parsedConfig.logging.level as LogLevel) || defaultConfig.level,
          pretty:
            parsedConfig.logging.pretty !== undefined
              ? parsedConfig.logging.pretty
              : defaultConfig.pretty,
          file:
            parsedConfig.logging.file !== undefined
              ? parsedConfig.logging.file
              : defaultConfig.file,
          filePath: parsedConfig.logging.file_path || defaultConfig.filePath,
        };
      }
    }
  } catch (error) {
    console.error(`Error loading logging config: ${(error as Error).message}`);
  }

  return defaultConfig;
}

// Load config
const loggingConfig = loadLoggingConfig();

/**
 * Configuration for the logger
 */
const loggerConfig = {
  level: loggingConfig.level,
  transport: loggingConfig.pretty
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
};

/**
 * Create the logger instance
 */
export const logger = pino(loggerConfig);

// Set up file logging if enabled
if (loggingConfig.file) {
  const logDir = path.dirname(loggingConfig.filePath);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  // Set up a separate logger configuration for file output
  const fileLogger = pino({
    level: loggingConfig.level,
    transport: {
      target: 'pino/file',
      options: { destination: loggingConfig.filePath },
    },
  });

  // Wrap the logger to write to both
  const methods = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
  methods.forEach(method => {
    const originalMethod = logger[method];
    logger[method] = function (...args: any[]) {
      fileLogger[method](...args);
      return originalMethod.apply(logger, args);
    };
  });

  // Keep file logger level in sync
  logger.on('level-change', function (lvl) {
    fileLogger.level = lvl;
  });
}

logger.info(
  `Logging initialized at level: ${loggingConfig.level}${loggingConfig.file ? `, writing to ${loggingConfig.filePath}` : ''}`
);

/**
 * Logger configuration interface
 */
export interface LoggerConfig {
  /**
   * Log level
   */
  level?: LogLevel;

  /**
   * Whether to pretty-print logs
   */
  pretty?: boolean;

  /**
   * Whether to enable file logging
   */
  file?: boolean;

  /**
   * Path to log file
   */
  filePath?: string;
}

/**
 * Configure the logger with custom settings
 * @param config Logger configuration
 */
export function configureLogger(config: LoggerConfig): void {
  if (config.level) {
    logger.level = config.level;
  }

  // File logging could be implemented here
  if (config.file && config.filePath) {
    logger.info(`File logging to ${config.filePath} enabled`);
  }
}

/**
 * Simple wrapper for console.log for code that doesn't need the full logger
 * @param message Message to log
 * @param args Additional arguments
 */
export function log(message: string, ...args: any[]): void {
  console.log(message, ...args);
}

export default {
  logger,
  configureLogger,
  log,
};
