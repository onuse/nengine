/**
 * MCP Server Manager
 * Orchestrates all MCP servers and provides unified access
 */

import { BaseMCPServer } from './base-mcp-server';
import { WorldContentMCP } from './world-content-mcp';
import { EntityContentMCP } from './entity-content-mcp';
import { MechanicsContentMCP } from './mechanics-content-mcp';
import { StateMCP } from './state-mcp';
import { CharacterStateMCP } from './character-state-mcp';
import { NarrativeHistoryMCP } from './narrative-history-mcp';
import { MCPServer, MCPTool, DebugInfo, PerformanceMetrics } from '../types/mcp-types';

export interface MCPRegistry {
  [serverName: string]: MCPServer;
}

export interface BatchQuery {
  server: string;
  tool: string;
  params: any;
}

export interface BatchResult {
  results: any[];
  errors: string[];
  duration: number;
}

export class MCPServerManager {
  private servers: MCPRegistry = {};
  private initialized: boolean = false;
  private gamePath: string;
  private stateRepoPath: string;
  private debugMode: boolean = false;
  private startingRoom: string;

  constructor(gamePath: string, stateRepoPath?: string, startingRoom: string = 'start') {
    this.gamePath = gamePath;
    this.stateRepoPath = stateRepoPath || './game-state';
    this.startingRoom = startingRoom;
    this.debugMode = process.env.DEBUG_MODE === 'true';
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      console.log('[MCPServerManager] Initializing MCP servers...');
      
      // Initialize Content Servers (read-only)
      await this.initializeContentServers();
      
      // Initialize Runtime Servers (stateful) - placeholder for now
      await this.initializeRuntimeServers();
      
      this.initialized = true;
      
      console.log('[MCPServerManager] All MCP servers initialized:', {
        serverCount: Object.keys(this.servers).length,
        servers: Object.keys(this.servers)
      });
      
    } catch (error) {
      console.error('[MCPServerManager] Initialization failed:', error);
      throw error;
    }
  }

  private async initializeContentServers(): Promise<void> {
    // World Content MCP
    const worldMCP = new WorldContentMCP(this.gamePath);
    await worldMCP.initialize();
    this.servers['world-content'] = worldMCP;
    
    // Entity Content MCP
    const entityMCP = new EntityContentMCP(this.gamePath);
    await entityMCP.initialize();
    this.servers['entity-content'] = entityMCP;
    
    console.log('[MCPServerManager] Content servers initialized');
  }

  private async initializeRuntimeServers(): Promise<void> {
    // Mechanics Content MCP (Game rules and dice rolling)
    const mechanicsMCP = new MechanicsContentMCP(this.gamePath);
    await mechanicsMCP.initialize();
    this.servers['mechanics-content'] = mechanicsMCP;

    // State MCP (Git-based state management)
    const stateMCP = new StateMCP(this.stateRepoPath, this.startingRoom);
    await stateMCP.initialize();
    this.servers['state'] = stateMCP;

    // Character State MCP (Player and party stats)
    const characterMCP = new CharacterStateMCP(this.gamePath);
    await characterMCP.initialize();
    this.servers['character-state'] = characterMCP;

    // Narrative History MCP (Clean Slate Context system)
    const narrativeHistoryMCP = new NarrativeHistoryMCP(this.gamePath);
    await narrativeHistoryMCP.initialize();
    this.servers['narrative-history'] = narrativeHistoryMCP;
    
    // Future servers to be implemented in later phases:
    // - memory-mcp (NPC memories and relationships)
    // - narrative-mcp (Quest and story progression)
    // - time-mcp (Game time and scheduling)
    
    console.log('[MCPServerManager] Runtime servers initialized');
  }

  // Server Access
  getServer(name: string): MCPServer | null {
    if (!this.initialized) {
      throw new Error('MCPServerManager not initialized');
    }
    
    return this.servers[name] || null;
  }

  listServers(): string[] {
    return Object.keys(this.servers);
  }

  // Unified Tool Access
  async executeTool(serverName: string, toolName: string, params: any): Promise<any> {
    const server = this.getServer(serverName);
    if (!server) {
      throw new Error(`Server '${serverName}' not found`);
    }
    
    return await server.executeTool(toolName, params);
  }

  // Get all available tools across all servers
  getAllTools(): { [serverName: string]: MCPTool[] } {
    const allTools: { [serverName: string]: MCPTool[] } = {};
    
    for (const [serverName, server] of Object.entries(this.servers)) {
      allTools[serverName] = server.listTools();
    }
    
    return allTools;
  }

  // Batch Operations
  async executeBatch(queries: BatchQuery[]): Promise<BatchResult> {
    const startTime = Date.now();
    const results: any[] = [];
    const errors: string[] = [];
    
    for (const query of queries) {
      try {
        const result = await this.executeTool(query.server, query.tool, query.params);
        results.push(result);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`${query.server}.${query.tool}: ${errorMsg}`);
        results.push(null);
      }
    }
    
    const duration = Date.now() - startTime;
    
    if (this.debugMode) {
      console.log(`[MCPServerManager] Batch operation completed: ${queries.length} queries in ${duration}ms`);
      if (errors.length > 0) {
        console.warn('[MCPServerManager] Batch errors:', errors);
      }
    }
    
    return {
      results,
      errors,
      duration
    };
  }

  // Context Assembly for LLM
  async assembleContext(contextType: 'room' | 'combat' | 'dialogue' | 'full', params: any = {}): Promise<any> {
    const context: any = {
      timestamp: Date.now(),
      contextType,
      data: {}
    };
    
    try {
      switch (contextType) {
        case 'room':
          context.data = await this.assembleRoomContext(params.roomId);
          break;
          
        case 'combat':
          context.data = await this.assembleCombatContext(params.participants);
          break;
          
        case 'dialogue':
          context.data = await this.assembleDialogueContext(params.participants);
          break;
          
        case 'full':
          context.data = await this.assembleFullContext();
          break;
          
        default:
          throw new Error(`Unknown context type: ${contextType}`);
      }
      
    } catch (error) {
      console.error(`[MCPServerManager] Context assembly failed for ${contextType}:`, error);
      throw error;
    }
    
    return context;
  }

  private async assembleRoomContext(roomId: string): Promise<any> {
    const queries: BatchQuery[] = [
      { server: 'world-content', tool: 'getRoom', params: { roomId } },
      { server: 'world-content', tool: 'getConnectedRooms', params: { roomId } },
      { server: 'world-content', tool: 'getEnvironment', params: { roomId } },
      { server: 'world-content', tool: 'getItemsInRoom', params: { roomId } },
      { server: 'world-content', tool: 'getNPCsInRoom', params: { roomId } }
    ];
    
    const batchResult = await this.executeBatch(queries);
    
    return {
      room: batchResult.results[0]?.room,
      connectedRooms: batchResult.results[1] || [],
      environment: batchResult.results[2] || {},
      items: batchResult.results[3] || [],
      npcs: batchResult.results[4] || [],
      errors: batchResult.errors
    };
  }

  private async assembleCombatContext(participants: string[]): Promise<any> {
    // Placeholder - would involve multiple server queries
    return {
      participants,
      initiative: [],
      environment: {},
      availableActions: []
    };
  }

  private async assembleDialogueContext(participants: string[]): Promise<any> {
    // Placeholder - would query memory and narrative servers
    return {
      participants,
      relationships: {},
      recentHistory: [],
      mood: 'neutral'
    };
  }

  private async assembleFullContext(): Promise<any> {
    // Placeholder - comprehensive world state
    return {
      worldState: {},
      activeQuests: [],
      partyStatus: {},
      gameTime: {},
      flags: {}
    };
  }

  // Clean Slate Context (purge after turn)
  async purgeContext(): Promise<void> {
    // This would clear any temporary context data
    // For now, just log the action
    if (this.debugMode) {
      console.log('[MCPServerManager] Context purged for clean slate');
    }
  }

  // Debug and Monitoring
  async getSystemStatus(): Promise<{
    initialized: boolean;
    servers: { [name: string]: any };
    performance: { [name: string]: PerformanceMetrics };
  }> {
    const status: any = {
      initialized: this.initialized,
      servers: {},
      performance: {}
    };
    
    for (const [name, server] of Object.entries(this.servers)) {
      status.servers[name] = server.getServerInfo();
      
      if ('getPerformanceMetrics' in server) {
        status.performance[name] = (server as any).getPerformanceMetrics();
      }
    }
    
    return status;
  }

  async getDebugInfo(): Promise<{ [serverName: string]: DebugInfo }> {
    const debugInfo: { [serverName: string]: DebugInfo } = {};
    
    for (const [name, server] of Object.entries(this.servers)) {
      if ('getDebugInfo' in server) {
        debugInfo[name] = (server as any).getDebugInfo();
      }
    }
    
    return debugInfo;
  }

  // Transaction Support (for Git-based operations)
  async beginTransaction(): Promise<string> {
    // Placeholder for transaction management
    const transactionId = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    if (this.debugMode) {
      console.log(`[MCPServerManager] Transaction started: ${transactionId}`);
    }
    
    return transactionId;
  }

  async commitTransaction(transactionId: string, message: string): Promise<void> {
    // Placeholder - would commit all changes across servers
    if (this.debugMode) {
      console.log(`[MCPServerManager] Transaction committed: ${transactionId} - ${message}`);
    }
  }

  async rollbackTransaction(transactionId: string): Promise<void> {
    // Placeholder - would rollback all changes
    if (this.debugMode) {
      console.log(`[MCPServerManager] Transaction rolled back: ${transactionId}`);
    }
  }

  // Cleanup
  async shutdown(): Promise<void> {
    console.log('[MCPServerManager] Shutting down MCP servers...');
    
    for (const [name, server] of Object.entries(this.servers)) {
      try {
        if ('destroy' in server) {
          (server as any).destroy();
        }
        console.log(`[MCPServerManager] ${name} server shut down`);
      } catch (error) {
        console.error(`[MCPServerManager] Error shutting down ${name}:`, error);
      }
    }
    
    this.servers = {};
    this.initialized = false;
  }

  // Health Check
  async healthCheck(): Promise<{ healthy: boolean; issues: string[] }> {
    const issues: string[] = [];
    
    if (!this.initialized) {
      issues.push('Manager not initialized');
    }
    
    const serverCount = Object.keys(this.servers).length;
    if (serverCount === 0) {
      issues.push('No servers registered');
    }
    
    // Check each server
    for (const [name, server] of Object.entries(this.servers)) {
      try {
        const info = server.getServerInfo();
        if (!info.name) {
          issues.push(`Server ${name} has invalid info`);
        }
      } catch (error) {
        issues.push(`Server ${name} health check failed: ${error}`);
      }
    }
    
    return {
      healthy: issues.length === 0,
      issues
    };
  }
}