import { MultiAgentOrchestrator } from './agent';
import config from './config';
import minimist from 'minimist';
import chalk from 'chalk';

// Define command line options interface
interface CommandLineOptions {
  _: string[];
  steps?: number;
  [key: string]: any;
}

/**
 * Main function to run the multi-agent test
 */
async function main() {
  // Parse command line arguments
  const argv = minimist(process.argv.slice(2)) as CommandLineOptions;

  // Extract the user query (the rest of the arguments joined into a string)
  const query = argv._.join(' ');

  if (!query) {
    console.log(chalk.red('Error: No query provided'));
    console.log(chalk.yellow('Usage: npm run dev -- --multi "your query here"'));
    process.exit(1);
  }

  console.log(chalk.green('🤖 Starting OpenManus Multi-Agent System...'));
  console.log(chalk.blue(`Query: ${query}`));

  try {
    // Initialize the multi-agent orchestrator
    const multiAgent = new MultiAgentOrchestrator({
      maxSteps: argv.steps || 20,
    });

    console.log(chalk.green('🧠 Multi-Agent system initialized with the following agents:'));
    console.log(chalk.blue('- Orchestrator (coordination)'));
    console.log(chalk.blue('- Planning Agent (task planning)'));
    console.log(chalk.blue('- SWE Agent (software engineering)'));
    console.log(chalk.blue('- Browser Agent (web browsing & search)'));
    console.log(chalk.blue('- Terminal Agent (command execution)'));

    // Execute the query
    console.log(chalk.green('\n🚀 Executing query through multi-agent system...'));
    const result = await multiAgent.run(query);

    // Display the result
    console.log(chalk.green('\n✅ Multi-Agent execution complete!'));
    console.log(chalk.white('Result:'));
    console.log(result);
  } catch (error) {
    console.error(chalk.red(`Error in multi-agent execution: ${(error as Error).message}`));
    console.error(chalk.red((error as Error).stack));
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error(chalk.red(`Unhandled error: ${error.message}`));
  console.error(chalk.red(error.stack));
  process.exit(1);
});
