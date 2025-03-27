import { BaseTool, formatToolResult, ToolParameter } from './base';
import { logger } from '../logging';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

// Promisify filesystem operations
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const access = promisify(fs.access);

/**
 * String Replace Editor Tool for making text replacements in files
 */
export class StrReplaceEditorTool extends BaseTool {
  name = 'str_replace_editor';
  description = 'Edit files by replacing strings or text regions';
  parameters: Record<string, ToolParameter> = {
    action: {
      type: 'string',
      description: 'Action to perform: replace, append, prepend, or insert',
      enum: ['replace', 'append', 'prepend', 'insert'],
      required: true,
    },
    file_path: {
      type: 'string',
      description: 'Path to the file to edit',
      required: true,
    },
    search_string: {
      type: 'string',
      description: 'String to search for when replacing (for replace action)',
      required: false,
    },
    replacement_string: {
      type: 'string',
      description:
        'String to replace with (for replace action) or content to append/prepend/insert',
      required: true,
    },
    start_line: {
      type: 'number',
      description: 'Starting line number for replace action (1-indexed)',
      required: false,
    },
    end_line: {
      type: 'number',
      description: 'Ending line number for replace action (1-indexed)',
      required: false,
    },
    line_number: {
      type: 'number',
      description: 'Line number for insert action (1-indexed)',
      required: false,
    },
    create_if_not_exists: {
      type: 'boolean',
      description: 'Create the file if it does not exist',
      required: false,
    },
    regex: {
      type: 'boolean',
      description: 'Interpret search_string as a regular expression',
      required: false,
    },
  };
  requiredParams = ['action', 'file_path', 'replacement_string'];

  /**
   * Execute the string replace editor tool
   * @param input Tool parameters
   * @returns Result of the operation
   */
  async execute(input: any): Promise<string | any> {
    const {
      action,
      file_path,
      search_string,
      replacement_string,
      start_line,
      end_line,
      line_number,
      create_if_not_exists = false,
      regex = false,
    } = input;

    try {
      // Validate input
      if (!action || !file_path || !replacement_string) {
        return formatToolResult(
          'Missing required parameters: action, file_path, and replacement_string are required'
        );
      }

      // Check if file exists
      let fileExists = true;
      try {
        await access(file_path, fs.constants.F_OK);
      } catch {
        fileExists = false;
        if (!create_if_not_exists) {
          return formatToolResult(`File does not exist: ${file_path}`);
        }
        // If we're creating the file and it's not an append action,
        // we need to create an empty file first
        if (action !== 'append') {
          await writeFile(file_path, '');
        }
      }

      // Read the file if it exists
      let content = '';
      if (fileExists) {
        content = await readFile(file_path, 'utf-8');
      }

      let updatedContent = '';
      let resultMessage = '';

      // Perform the requested action
      switch (action) {
        case 'replace':
          if (!search_string) {
            return formatToolResult('search_string is required for replace action');
          }

          if (start_line !== undefined && end_line !== undefined) {
            // Replace in specific line range
            updatedContent = await this.replaceInLines(
              content,
              search_string,
              replacement_string,
              start_line,
              end_line
            );
            resultMessage = `Replaced "${search_string}" with "${replacement_string}" in lines ${start_line}-${end_line}`;
          } else {
            // Replace all occurrences
            if (regex) {
              try {
                const searchRegex = new RegExp(search_string, 'g');
                updatedContent = content.replace(searchRegex, replacement_string);
              } catch (err) {
                return formatToolResult(`Invalid regular expression: ${(err as Error).message}`);
              }
            } else {
              updatedContent = content.replace(
                new RegExp(this.escapeRegExp(search_string), 'g'),
                replacement_string
              );
            }
            resultMessage = `Replaced all occurrences of "${search_string}" with "${replacement_string}"`;
          }
          break;

        case 'append':
          // Append to the end of the file
          updatedContent = content + replacement_string;
          resultMessage = `Appended text to ${file_path}`;
          break;

        case 'prepend':
          // Prepend to the beginning of the file
          updatedContent = replacement_string + content;
          resultMessage = `Prepended text to ${file_path}`;
          break;

        case 'insert':
          if (line_number === undefined) {
            return formatToolResult('line_number is required for insert action');
          }
          // Insert at specific line
          updatedContent = await this.insertAtLine(content, replacement_string, line_number);
          resultMessage = `Inserted text at line ${line_number}`;
          break;

        default:
          return formatToolResult(`Invalid action: ${action}`);
      }

      // Write the updated content
      await writeFile(file_path, updatedContent);
      logger.info(`${resultMessage} in ${file_path}`);
      return formatToolResult(`Successfully ${resultMessage} in ${file_path}`);
    } catch (error) {
      logger.error(`Error in string replace editor: ${(error as Error).message}`);
      return formatToolResult(`Error: ${(error as Error).message}`);
    }
  }

  /**
   * Replace text in a specific range of lines
   */
  private async replaceInLines(
    content: string,
    searchString: string,
    replacementString: string,
    startLine: number,
    endLine: number
  ): Promise<string> {
    // Convert 1-indexed line numbers to 0-indexed
    const zeroIndexedStart = Math.max(0, startLine - 1);
    const zeroIndexedEnd = Math.max(0, endLine - 1);

    // Split content into lines
    const lines = content.split('\n');

    // Validate line range
    if (zeroIndexedStart >= lines.length) {
      throw new Error(
        `Start line ${startLine} is beyond the end of the file (${lines.length} lines)`
      );
    }

    const effectiveEndLine = Math.min(zeroIndexedEnd, lines.length - 1);

    // Count occurrences for reporting
    let occurrences = 0;

    // Apply replacement only to the specified range
    for (let i = zeroIndexedStart; i <= effectiveEndLine; i++) {
      const originalLine = lines[i];
      lines[i] = lines[i].replace(
        new RegExp(this.escapeRegExp(searchString), 'g'),
        replacementString
      );

      // Count occurrences by comparing before and after
      if (originalLine !== lines[i]) {
        occurrences++;
      }
    }

    // Join lines back into content
    return lines.join('\n');
  }

  /**
   * Insert text at a specific line
   */
  private async insertAtLine(
    content: string,
    insertString: string,
    lineNumber: number
  ): Promise<string> {
    // Convert 1-indexed line number to 0-indexed
    const zeroIndexedLine = Math.max(0, lineNumber - 1);

    // Split content into lines
    const lines = content.split('\n');

    // Determine where to insert (at end if line number is beyond file length)
    const insertIndex = Math.min(zeroIndexedLine, lines.length);

    // Insert the new content
    lines.splice(insertIndex, 0, insertString);

    // Join lines back into content
    return lines.join('\n');
  }

  /**
   * Escape special characters in string for use in RegExp
   * @param string String to escape
   * @returns Escaped string
   */
  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

export default StrReplaceEditorTool;
