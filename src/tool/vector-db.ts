import * as fs from 'fs';
import * as path from 'path';
import { BaseTool, formatToolResult } from './base';
import { logger } from '../logging';

// Simple vector type
interface Vector {
  dimensions: number;
  values: number[];
}

// Document interface
interface Document {
  id: string;
  text: string;
  metadata?: Record<string, any>;
}

// Vector DB interface
interface VectorDB {
  search(query: string, topK?: number): Promise<Array<{ document: Document; score: number }>>;
  addDocument(document: Document): Promise<void>;
  deleteDocument(id: string): boolean;
  clear(): void;
}

// Mock in-memory vector database for demonstration
class InMemoryVectorDB implements VectorDB {
  private documents: Document[] = [];

  async search(
    query: string,
    topK: number = 5
  ): Promise<Array<{ document: Document; score: number }>> {
    // In a real implementation, this would compute embeddings and do similarity search
    // For now, just do simple keyword matching
    const results = this.documents
      .map(doc => ({
        document: doc,
        score: this.computeSimpleScore(query, doc.text),
      }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return results;
  }

  async addDocument(document: Document): Promise<void> {
    // Remove any existing document with the same ID
    this.documents = this.documents.filter(doc => doc.id !== document.id);
    this.documents.push(document);
  }

  deleteDocument(id: string): boolean {
    const initialLength = this.documents.length;
    this.documents = this.documents.filter(doc => doc.id !== id);
    return initialLength > this.documents.length;
  }

  clear(): void {
    this.documents = [];
  }

  private computeSimpleScore(query: string, text: string): number {
    // Very simple scoring function based on term frequency
    const queryTerms = query.toLowerCase().split(/\s+/);
    const textLower = text.toLowerCase();

    let score = 0;
    for (const term of queryTerms) {
      if (term.length < 3) continue; // Skip very short terms

      const regex = new RegExp(term, 'g');
      const matches = textLower.match(regex);
      if (matches) {
        score += matches.length;
      }
    }

    return score;
  }
}

/**
 * Vector database tool for storing and retrieving documents
 */
export class VectorDBTool extends BaseTool {
  name = 'vector_db';
  description = 'Store and retrieve documents from a vector database for semantic search';
  private db: VectorDB;

  constructor() {
    super();

    // Set up parameters
    this.parameters = {
      action: {
        type: 'string',
        description: 'The action to perform: query, add, add_file, delete, clear',
        required: true,
        enum: ['query', 'add', 'add_file', 'delete', 'clear'],
      },
      query: {
        type: 'string',
        description: 'The query text for semantic search (required for "query" action)',
        required: false,
      },
      text: {
        type: 'string',
        description: 'The document text to add (required for "add" action)',
        required: false,
      },
      file_path: {
        type: 'string',
        description: 'Path to a file to add to the database (required for "add_file" action)',
        required: false,
      },
      id: {
        type: 'string',
        description: 'Document ID (optional for add/add_file, required for delete)',
        required: false,
      },
      metadata: {
        type: 'object',
        description: 'Optional metadata to store with the document',
        required: false,
      },
      top_k: {
        type: 'number',
        description: 'Number of results to return for query (default: 5)',
        required: false,
      },
    };

    this.requiredParams = ['action'];

    // Initialize with a simple in-memory database
    this.db = new InMemoryVectorDB();
  }

  async execute(input: Record<string, any>): Promise<string | any> {
    const { action } = input;

    switch (action) {
      case 'query':
        return this.handleQuery(input);
      case 'add':
        return this.handleAdd(input);
      case 'add_file':
        return this.handleAddFile(input);
      case 'delete':
        return this.handleDelete(input);
      case 'clear':
        return this.handleClear();
      default:
        const errorMsg = `Unknown action: ${action}. Valid actions are: query, add, add_file, delete, clear`;
        return formatToolResult(errorMsg);
    }
  }

  private async handleQuery(parameters: Record<string, any>): Promise<string | any> {
    const { query, top_k = 5 } = parameters;

    if (!query) {
      return formatToolResult('query parameter is required for "query" action');
    }

    try {
      const results = await this.db.search(query, top_k);

      // Format results
      const formattedResults = results.map(({ document, score }) => ({
        id: document.id,
        text: document.text.slice(0, 200) + (document.text.length > 200 ? '...' : ''),
        metadata: document.metadata,
        score: score.toFixed(4),
      }));

      const resultText = `Found ${results.length} relevant documents`;

      // Serialize the results as JSON and encode in base64
      const base64Data =
        formattedResults.length > 0
          ? Buffer.from(JSON.stringify({ documents: formattedResults })).toString('base64')
          : undefined;

      return formatToolResult(resultText, base64Data);
    } catch (error) {
      const errorMsg = `Error querying vector DB: ${(error as Error).message}`;
      logger.error(errorMsg);
      return formatToolResult(errorMsg);
    }
  }

  private async handleAdd(parameters: Record<string, any>): Promise<string | any> {
    const { text, id = this.generateId(), metadata = {} } = parameters;

    if (!text) {
      return formatToolResult('text parameter is required for "add" action');
    }

    try {
      await this.db.addDocument({ id, text, metadata });
      const resultText = `Document added with ID: ${id}`;

      // Store ID in base64_image as a hack
      const base64Data = Buffer.from(JSON.stringify({ id })).toString('base64');

      return formatToolResult(resultText, base64Data);
    } catch (error) {
      const errorMsg = `Error adding document to vector DB: ${(error as Error).message}`;
      logger.error(errorMsg);
      return formatToolResult(errorMsg);
    }
  }

  private async handleAddFile(parameters: Record<string, any>): Promise<string | any> {
    const { file_path, id = this.generateId(), metadata = {} } = parameters;

    if (!file_path) {
      return formatToolResult('file_path parameter is required for "add_file" action');
    }

    try {
      if (!fs.existsSync(file_path)) {
        const errorMsg = `File not found: ${file_path}`;
        return formatToolResult(errorMsg);
      }

      const text = fs.readFileSync(file_path, 'utf-8');

      // Add additional metadata about the file
      const enhancedMetadata = {
        ...metadata,
        file_path,
        file_name: path.basename(file_path),
        created_at: new Date().toISOString(),
      };

      await this.db.addDocument({ id, text, metadata: enhancedMetadata });
      const resultText = `File content added with ID: ${id}`;

      // Store ID in base64_image as a hack
      const base64Data = Buffer.from(JSON.stringify({ id })).toString('base64');

      return formatToolResult(resultText, base64Data);
    } catch (error) {
      const errorMsg = `Error adding file to vector DB: ${(error as Error).message}`;
      logger.error(errorMsg);
      return formatToolResult(errorMsg);
    }
  }

  private handleDelete(parameters: Record<string, any>): string | any {
    const { id } = parameters;

    if (!id) {
      return formatToolResult('id parameter is required for "delete" action');
    }

    const success = this.db.deleteDocument(id);
    const resultText = success
      ? `Document with ID ${id} deleted`
      : `Document with ID ${id} not found`;

    return formatToolResult(resultText);
  }

  private handleClear(): string | any {
    this.db.clear();
    const resultText = 'Vector database cleared';
    return formatToolResult(resultText);
  }

  private generateId(): string {
    // Generate a random ID
    return (
      Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    );
  }
}
