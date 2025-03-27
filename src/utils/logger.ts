import pino from 'pino';
import chalk from 'chalk';

// Configure pino logger with pretty printing
const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  },
  level: process.env.LOG_LEVEL || 'info',
});

// Enhanced logger with color-coded methods
export const log = {
  info: (message: string) => logger.info(message),
  warning: (message: string) => logger.warn(chalk.yellow(message)),
  error: (message: string) => logger.error(chalk.red(message)),
  success: (message: string) => logger.info(chalk.green(message)),
  debug: (message: string) => logger.debug(message),
  trace: (message: string) => logger.trace(message),

  // Enhanced specialized log methods for agent interactions
  tool: (message: string) => logger.info(chalk.blue(`🛠️ ${message}`)),
  agent: (name: string, message: string) => logger.info(chalk.cyan(`🤖 ${name}: ${message}`)),
  thinking: (message: string) => logger.info(chalk.magenta(`💭 ${message}`)),

  // New specialized log methods for more detailed output
  plan: (message: string) => logger.info(chalk.greenBright(`📝 PLAN: ${message}`)),
  thought: (message: string) => {
    // Split into multiple log lines if the content is long
    const maxLineLength = 120;
    const heading = chalk.magentaBright('🧠 THOUGHT:');

    if (message.length > 500) {
      logger.info(`${heading}\n${'='.repeat(80)}`);

      // Split by newlines first to maintain format
      const lines = message.split('\n');

      for (const line of lines) {
        // Further split long lines
        if (line.length > maxLineLength) {
          let currentLine = '';
          const words = line.split(' ');

          for (const word of words) {
            if ((currentLine + ' ' + word).length > maxLineLength) {
              logger.info(chalk.magentaBright(currentLine));
              currentLine = word;
            } else {
              currentLine = currentLine ? `${currentLine} ${word}` : word;
            }
          }

          if (currentLine) {
            logger.info(chalk.magentaBright(currentLine));
          }
        } else {
          logger.info(chalk.magentaBright(line));
        }
      }

      logger.info(`${'='.repeat(80)}`);
    } else {
      // For shorter content, keep it simple
      logger.info(`${heading} ${message}`);
    }
  },
  toolSelect: (tool: string, args: string) =>
    logger.info(chalk.blueBright(`🔧 TOOL SELECTED: ${tool}\n   ARGS: ${args}`)),
  toolResult: (tool: string, result: string) =>
    logger.info(chalk.yellowBright(`📊 TOOL RESULT (${tool}):\n${result}`)),
  step: (current: number, max: number, message: string) =>
    logger.info(chalk.cyanBright(`⏭️ STEP ${current}/${max}: ${message}`)),
};

export default log;
