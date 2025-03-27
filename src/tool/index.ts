// Import base tools
import { BaseTool, ToolCollection } from './base';
import { TerminalTool } from './terminal';
import { ReadFileTool, WriteFileTool, ListDirectoryTool } from './file-operations';
import { StrReplaceEditorTool } from './str-replace-editor';
import { BrowserTool } from './browser';
import { WebSearchTool } from './web-search';
import { PlanningTool } from './planning';
import { VectorDBTool } from './vector-db';
import { ImageGenerationTool } from './image-generation';
import { TerminateTool } from './terminate';
import { PythonREPLTool } from './python-repl';
import { NodeREPLTool } from './node-repl';
import { BashTool } from './bash';
import { FileSaverTool } from './file-saver';
import { ChatCompletionTool } from './chat-completion';

// Import sandboxed tools
import {
  SandboxReadFileTool,
  SandboxWriteFileTool,
  SandboxListDirectoryTool,
  SandboxDeleteFileTool,
  SandboxCreateDirectoryTool,
} from './sandboxed-file-operations';
import { SandboxNodeREPLTool } from './sandbox-node-repl';
import { SandboxBashTool } from './sandbox-bash';
import { SandboxFileSaverTool } from './sandbox-file-saver';

// Export base tool interfaces
export * from './base';

// Export regular tools
export { TerminalTool } from './terminal';
export { ReadFileTool, WriteFileTool, ListDirectoryTool } from './file-operations';
export { StrReplaceEditorTool } from './str-replace-editor';
export { BrowserTool } from './browser';
export { WebSearchTool } from './web-search';
export { PlanningTool } from './planning';
export { VectorDBTool } from './vector-db';
export { ImageGenerationTool } from './image-generation';
export { TerminateTool } from './terminate';
export { PythonREPLTool } from './python-repl';
export { NodeREPLTool } from './node-repl';
export { BashTool } from './bash';
export { FileSaverTool } from './file-saver';
export { ChatCompletionTool } from './chat-completion';

// Export sandboxed tools
export {
  SandboxReadFileTool,
  SandboxWriteFileTool,
  SandboxListDirectoryTool,
  SandboxDeleteFileTool,
  SandboxCreateDirectoryTool,
} from './sandboxed-file-operations';
export { SandboxNodeREPLTool } from './sandbox-node-repl';
export { SandboxBashTool } from './sandbox-bash';
export { SandboxFileSaverTool } from './sandbox-file-saver';

// Create a collection with all tools
export const createFullToolCollection = (): ToolCollection =>
  new ToolCollection([
    new TerminalTool(),
    new ReadFileTool(),
    new WriteFileTool(),
    new ListDirectoryTool(),
    new BrowserTool(),
    new PythonREPLTool(),
    new NodeREPLTool(),
    new StrReplaceEditorTool(),
    new WebSearchTool(),
    new PlanningTool(),
    new VectorDBTool(),
    new ImageGenerationTool(),
    new TerminateTool(),
    new BashTool(),
    new FileSaverTool(),
    new ChatCompletionTool(),
  ]);

// Create a collection with basic tools
export const createBasicToolCollection = (): ToolCollection =>
  new ToolCollection([
    new TerminalTool(),
    new ReadFileTool(),
    new WriteFileTool(),
    new ListDirectoryTool(),
    new TerminateTool(),
    new BashTool(),
  ]);

// Create a collection with sandboxed tools
export const createSandboxedToolCollection = (): ToolCollection =>
  new ToolCollection([
    new TerminalTool(),
    new SandboxReadFileTool(),
    new SandboxWriteFileTool(),
    new SandboxListDirectoryTool(),
    new SandboxDeleteFileTool(),
    new SandboxCreateDirectoryTool(),
    new SandboxNodeREPLTool(),
    new SandboxBashTool(),
    new SandboxFileSaverTool(),
    new StrReplaceEditorTool(),
    new WebSearchTool(),
    new PlanningTool(),
    new VectorDBTool(),
    new ImageGenerationTool(),
    new TerminateTool(),
    new ChatCompletionTool(),
  ]);
