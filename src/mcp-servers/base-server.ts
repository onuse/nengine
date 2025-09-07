import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

export interface MCPTool {
  name: string;
  description: string;
  parameters: any;
  handler: (params: any) => Promise<any>;
}

export abstract class BaseMCPServer {
  protected server: Server;
  protected tools: Map<string, MCPTool> = new Map();
  protected serverName: string;
  protected version: string = '1.0.0';
  protected debugMode: boolean = false;

  constructor(serverName: string) {
    this.serverName = serverName;
    this.server = new Server({
      name: serverName,
      version: this.version,
    }, {
      capabilities: {
        tools: {}
      }
    });

    this.debugMode = process.env.DEBUG_MODE === 'true';
  }

  protected registerTool(tool: MCPTool): void {
    this.tools.set(tool.name, tool);
  }

  protected abstract setupTools(): void;

  async start(): Promise<void> {
    this.setupTools();

    this.server.setRequestHandler('tools/list', async () => ({
      tools: Array.from(this.tools.values()).map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: {
          type: 'object',
          properties: tool.parameters,
          required: Object.keys(tool.parameters)
        }
      }))
    }));

    this.server.setRequestHandler('tools/call', async (request) => {
      const { name, arguments: args } = request.params as any;
      const tool = this.tools.get(name);
      
      if (!tool) {
        throw new Error(`Tool ${name} not found`);
      }

      try {
        const result = await tool.handler(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        if (this.debugMode) {
          console.error(`Error in tool ${name}:`, error);
        }
        throw error;
      }
    });

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    if (this.debugMode) {
      console.error(`${this.serverName} started in debug mode`);
    }
  }

  protected log(...args: any[]): void {
    if (this.debugMode) {
      console.error(`[${this.serverName}]`, ...args);
    }
  }
}