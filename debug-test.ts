import { OpenAI } from 'openai';
import dotenv from 'dotenv';
import chalk from 'chalk';

// Load environment variables from .env file
dotenv.config();

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

async function main() {
    try {
        console.log(chalk.green('Testing agent thinking process...'));

        const SYSTEM_PROMPT = `
You are Manus, a versatile AI assistant that can help with various tasks.
You have access to tools for terminal commands, file operations, web browsing, and more.

CRITICAL INSTRUCTION: For questions about current information like weather, news, or events, you MUST use the web_search tool.
DO NOT try to answer questions about current data from your internal knowledge, as it may be outdated.

THINKING PROCESS: Always explain your reasoning process BEFORE selecting tools. For each step:
1. First analyze what information you need and why
2. Explain which tool would be most appropriate to get this information
3. Only THEN use the tool`;

        const NEXT_STEP_PROMPT = `
Analyze the current situation and decide on the next steps.

First, THINK THROUGH what you've learned so far and what you still need to know.
Then, explain your REASONING for choosing the next action. Consider:
- What information do you need?
- What tools would be most appropriate?
- What is your plan for obtaining the required information?`;

        const TOOL_DEFINITIONS = [
            {
                type: "function",
                function: {
                    name: "web_search",
                    description: "Search the web for information",
                    parameters: {
                        type: "object",
                        properties: {
                            query: {
                                type: "string",
                                description: "The search query"
                            }
                        },
                        required: ["query"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "browser",
                    description: "Browse the web or interact with a webpage",
                    parameters: {
                        type: "object",
                        properties: {
                            action: {
                                type: "string",
                                enum: ["go_to_url", "get_page_info", "get_element_text"],
                                description: "The browser action to perform"
                            },
                            url: {
                                type: "string",
                                description: "URL to navigate to"
                            },
                            selector: {
                                type: "string",
                                description: "CSS selector for element interactions"
                            }
                        },
                        required: ["action"]
                    }
                }
            }
        ];

        // Create messages array with system and user messages
        const messages = [
            { role: "system" as const, content: SYSTEM_PROMPT },
            { role: "user" as const, content: "What is the weather in New York?" },
            { role: "user" as const, content: NEXT_STEP_PROMPT }
        ];

        console.log(chalk.blue('Sending request to OpenAI...'));

        // Call OpenAI API
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: messages,
            tools: TOOL_DEFINITIONS as any,
            tool_choice: "auto" as const,  // Using auto like Python version
            temperature: 0.0,
        });

        console.log(chalk.green('\nRaw OpenAI Response:'));
        console.log(JSON.stringify({
            content: response.choices[0]?.message?.content,
            tool_calls: response.choices[0]?.message?.tool_calls
        }, null, 2));

        // Log the content if it exists
        const content = response.choices[0]?.message?.content;
        if (content) {
            console.log(chalk.yellow('\nTHOUGHT CONTENT:'));
            console.log(content);
        } else {
            console.log(chalk.red('\nNo content returned!'));
        }

        // Log tool calls if they exist
        const toolCalls = response.choices[0]?.message?.tool_calls;
        if (toolCalls && toolCalls.length > 0) {
            console.log(chalk.magenta('\nTOOL CALLS:'));
            toolCalls.forEach(tool => {
                console.log(`Tool: ${tool.function?.name}`);
                console.log(`Arguments: ${tool.function?.arguments}`);
            });
        } else {
            console.log(chalk.red('\nNo tool calls returned!'));
        }

    } catch (error) {
        console.error(chalk.red('Error:'), error);
    }
}

main();
