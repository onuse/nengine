/**
 * Base MCP Server Implementation
 * Provides common functionality for all MCP servers
 */

import { 
  MCPServer, 
  MCPTool, 
  ServerInfo, 
  DebugCapable, 
  DebugInfo, 
  Operation, 
  PerformanceMetrics 
} from '../types/mcp-types';

export abstract class BaseMCPServer implements MCPServer, DebugCapable {
  protected name: string;
  protected version: string;
  protected capabilities: string[];
  protected debugMode: boolean = false;
  protected verboseLogging: boolean = false;
  protected operations: Operation[] = [];
  protected maxOperationHistory: number = 100;

  constructor(name: string, version: string = '1.0.0', capabilities: string[] = []) {
    this.name = name;
    this.version = version;
    this.capabilities = capabilities;
    this.debugMode = process.env.DEBUG_MODE === 'true';
  }

  // Abstract methods that subclasses must implement
  abstract listTools(): MCPTool[];
  protected abstract executeToolInternal(name: string, params: any): Promise<any>;

  // MCP Server Interface
  async executeTool(name: string, params: any): Promise<any> {
    const startTime = Date.now();
    
    try {
      this.log(`Executing tool: ${name}`, params);
      
      const result = await this.executeToolInternal(name, params);
      const duration = Date.now() - startTime;
      
      // Record operation for debug purposes
      this.recordOperation({
        timestamp: startTime,
        method: name,
        params,
        result,
        duration
      });
      
      this.log(`Tool ${name} completed in ${duration}ms`, result);
      return result;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorResult = { error: error instanceof Error ? error.message : String(error) };
      
      this.recordOperation({
        timestamp: startTime,
        method: name,
        params,
        result: errorResult,
        duration
      });
      
      this.log(`Tool ${name} failed after ${duration}ms:`, error);
      throw error;
    }
  }

  getServerInfo(): ServerInfo {
    return {
      name: this.name,
      version: this.version,
      capabilities: this.capabilities
    };
  }

  // Debug Interface
  getDebugInfo(): DebugInfo {
    return {
      serverName: this.name,
      lastOperations: this.operations.slice(-10), // Last 10 operations
      currentState: this.getCurrentState(),
      warnings: this.getWarnings()
    };
  }

  enableVerboseLogging(enabled: boolean): void {
    this.verboseLogging = enabled;
    this.log(`Verbose logging ${enabled ? 'enabled' : 'disabled'}`);
  }

  getPerformanceMetrics(): PerformanceMetrics {
    const totalOps = this.operations.length;
    const avgResponseTime = totalOps > 0 
      ? this.operations.reduce((sum, op) => sum + op.duration, 0) / totalOps 
      : 0;

    return {
      totalOperations: totalOps,
      averageResponseTime: Math.round(avgResponseTime * 100) / 100,
      memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024 // MB
    };
  }

  // Utility Methods
  protected log(message: string, data?: any): void {
    if (this.debugMode || this.verboseLogging) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [${this.name}] ${message}`);
      if (data && this.verboseLogging) {
        console.log(JSON.stringify(data, null, 2));
      }
    }
  }

  protected warn(message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}] [${this.name}] WARNING: ${message}`);
    if (data) {
      console.warn(data);
    }
  }

  protected error(message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [${this.name}] ERROR: ${message}`);
    if (data) {
      console.error(data);
    }
  }

  private recordOperation(operation: Operation): void {
    this.operations.push(operation);
    
    // Keep only the most recent operations
    if (this.operations.length > this.maxOperationHistory) {
      this.operations.shift();
    }
  }

  // Abstract methods for debug info
  protected abstract getCurrentState(): any;
  protected abstract getWarnings(): string[];

  // Tool validation helper
  protected validateTool(name: string): MCPTool {
    const tools = this.listTools();
    const tool = tools.find(t => t.name === name);
    
    if (!tool) {
      throw new Error(`Tool '${name}' not found. Available tools: ${tools.map(t => t.name).join(', ')}`);
    }
    
    return tool;
  }

  // Parameter validation helper
  protected validateParams(params: any, tool: MCPTool): void {
    // Basic validation - in a full implementation, this would use JSON Schema
    if (!params && tool.parameters.required?.length > 0) {
      throw new Error(`Missing required parameters for tool '${tool.name}'`);
    }
  }

  // Create standard tool definition helper
  protected createTool(
    name: string,
    description: string,
    parameters: any,
    returns: any,
    examples: any[] = []
  ): MCPTool {
    return {
      name,
      description,
      parameters,
      returns,
      examples
    };
  }

  // Standard error handling
  protected handleError(context: string, error: unknown): never {
    const message = error instanceof Error ? error.message : String(error);
    this.error(`${context}: ${message}`);
    throw new Error(`${this.name} ${context}: ${message}`);
  }

  // Generate unique IDs for dynamic entities
  protected generateId(prefix: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `${prefix}_${timestamp}_${random}`;
  }

  // Cleanup method
  destroy(): void {
    this.log('MCP server shutting down');
    this.operations = [];
  }
}