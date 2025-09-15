import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { MCPServerManager } from './mcp-manager';

export interface MCPServerDefinition {
  name: string;
  description: string;
  config: Record<string, any>;
  condition?: string;
  required?: boolean;
}

export interface GameMCPConfig {
  version: string;
  game_system: string;
  description: string;
  required_servers: MCPServerDefinition[];
  optional_servers?: MCPServerDefinition[];
  startup_order: Record<number, string[]>;
  performance?: {
    lazy_loading?: boolean;
    cache_frequently_used?: boolean;
    batch_queries?: boolean;
  };
  memory_limits?: Record<string, number>;
  game_type_detection?: Record<string, any>;
  communication?: {
    batching_rules?: any[];
    shared_context?: Record<string, string>;
  };
  error_handling?: Record<string, any>;
  debug?: Record<string, any>;
}

export interface GameContext {
  partyComposition: string[];
  partyLevel: number;
  currentLocation: string;
  activeQuests: string[];
  gameFeatures: string[];
  playerChoices: string[];
}

export class GameMCPDiscovery {
  private mcpManager: MCPServerManager;
  private loadedServers: Set<string> = new Set();
  private gameConfig: GameMCPConfig | null = null;
  private gameContext: GameContext;

  constructor(mcpManager: MCPServerManager) {
    this.mcpManager = mcpManager;
    this.gameContext = {
      partyComposition: [],
      partyLevel: 1,
      currentLocation: '',
      activeQuests: [],
      gameFeatures: [],
      playerChoices: []
    };
  }

  /**
   * Auto-discover and load MCP servers for a given game
   */
  async discoverAndLoadMCPServers(gamePath: string): Promise<void> {
    const mcpConfigPath = path.join(gamePath, 'mcp-config.yaml');
    
    if (!fs.existsSync(mcpConfigPath)) {
      console.log(`No MCP config found at ${mcpConfigPath}, using default servers`);
      await this.loadDefaultServers();
      return;
    }

    try {
      const configContent = fs.readFileSync(mcpConfigPath, 'utf8');
      this.gameConfig = yaml.load(configContent) as GameMCPConfig;
      
      console.log(`Discovered MCP config for ${this.gameConfig.game_system}`);
      await this.loadConfiguredServers(gamePath);
    } catch (error) {
      console.error(`Error loading MCP config: ${error}`);
      await this.loadDefaultServers();
    }
  }

  /**
   * Load servers based on the discovered configuration
   */
  private async loadConfiguredServers(gamePath: string): Promise<void> {
    if (!this.gameConfig) return;

    // Load servers in dependency order
    const startupOrder = this.gameConfig.startup_order;
    const orderedStages = Object.keys(startupOrder)
      .map(k => parseInt(k))
      .sort((a, b) => a - b);

    for (const stage of orderedStages) {
      const serverNames = startupOrder[stage];
      
      // Load required servers in parallel within each stage
      const requiredInStage = serverNames.filter(name =>
        this.gameConfig!.required_servers.some(s => s.name === name)
      );
      
      await Promise.all(requiredInStage.map(name => 
        this.loadServer(name, gamePath, true)
      ));

      // Load optional servers if conditions are met
      const optionalInStage = serverNames.filter(name =>
        this.gameConfig!.optional_servers?.some(s => s.name === name)
      );

      await Promise.all(optionalInStage.map(name =>
        this.loadServerIfConditionMet(name, gamePath)
      ));
    }

    console.log(`Loaded ${this.loadedServers.size} MCP servers for ${this.gameConfig.game_system}`);
  }

  /**
   * Load a specific server
   */
  private async loadServer(serverName: string, gamePath: string, required: boolean): Promise<void> {
    const serverDef = this.findServerDefinition(serverName);
    if (!serverDef) {
      if (required) {
        throw new Error(`Required server ${serverName} not found in configuration`);
      }
      console.warn(`Optional server ${serverName} not found, skipping`);
      return;
    }

    try {
      // Register the server with the MCP manager
      const serverPath = this.resolveServerPath(serverName);
      const config = this.buildServerConfig(serverDef, gamePath);

      this.mcpManager.registerServer({
        name: serverName,
        path: serverPath,
        args: config.args || [],
        env: config.env || {}
      });

      await this.mcpManager.startServer(serverName);
      this.loadedServers.add(serverName);
      
      console.log(`✓ Loaded ${serverName}: ${serverDef.description}`);
    } catch (error) {
      if (required) {
        throw new Error(`Failed to load required server ${serverName}: ${error}`);
      }
      console.warn(`Failed to load optional server ${serverName}: ${error}`);
    }
  }

  /**
   * Load server only if its condition is met
   */
  private async loadServerIfConditionMet(serverName: string, gamePath: string): Promise<void> {
    const serverDef = this.gameConfig?.optional_servers?.find(s => s.name === serverName);
    if (!serverDef) return;

    if (serverDef.condition && !this.evaluateCondition(serverDef.condition)) {
      console.log(`Skipping ${serverName} - condition '${serverDef.condition}' not met`);
      return;
    }

    await this.loadServer(serverName, gamePath, false);
  }

  /**
   * Evaluate whether a condition is met based on game context
   */
  private evaluateCondition(condition: string): boolean {
    const detectionRules = this.gameConfig?.game_type_detection || {};
    
    // Check if condition matches any detection rule
    if (detectionRules[condition]) {
      const triggers = detectionRules[condition].trigger;
      if (Array.isArray(triggers)) {
        return triggers.some(trigger =>
          this.gameContext.partyComposition.includes(trigger) ||
          this.gameContext.gameFeatures.includes(trigger) ||
          this.gameContext.playerChoices.includes(trigger)
        );
      }
    }

    // Simple condition evaluation
    switch (condition) {
      case 'has_spellcasters':
        return this.gameContext.partyComposition.some(cls =>
          ['wizard', 'sorcerer', 'cleric', 'druid', 'bard', 'warlock', 'paladin', 'ranger'].includes(cls)
        );
      
      case 'has_clerics_or_paladins':
        return this.gameContext.partyComposition.some(cls =>
          ['cleric', 'paladin'].includes(cls)
        );
      
      case 'political_intrigue':
        return this.gameContext.gameFeatures.includes('political') ||
               this.gameContext.currentLocation.includes('waterdeep') ||
               this.gameContext.currentLocation.includes('baldurs_gate');
      
      case 'outdoor_exploration':
        return this.gameContext.gameFeatures.includes('wilderness') ||
               this.gameContext.partyComposition.includes('ranger') ||
               this.gameContext.partyComposition.includes('druid');
      
      case 'combat_enabled':
        return !this.gameContext.gameFeatures.includes('pacifist');
      
      case 'exploration_focus':
        return this.gameContext.gameFeatures.includes('exploration');
      
      case 'forensics_focus':
        return this.gameContext.gameFeatures.includes('forensics');
      
      case 'crime_focus':
        return this.gameContext.gameFeatures.includes('crime');
      
      default:
        console.warn(`Unknown condition: ${condition}`);
        return false;
    }
  }

  /**
   * Update game context to trigger conditional server loading
   */
  async updateGameContext(updates: Partial<GameContext>): Promise<void> {
    const oldContext = { ...this.gameContext };
    this.gameContext = { ...this.gameContext, ...updates };

    // Check if any new conditions are now met
    if (this.gameConfig?.optional_servers) {
      for (const serverDef of this.gameConfig.optional_servers) {
        if (serverDef.condition && 
            !this.loadedServers.has(serverDef.name) &&
            this.evaluateCondition(serverDef.condition)) {
          
          console.log(`Condition '${serverDef.condition}' now met, loading ${serverDef.name}`);
          await this.loadServerIfConditionMet(serverDef.name, ''); // TODO: track game path
        }
      }
    }
  }

  /**
   * Find server definition in config
   */
  private findServerDefinition(serverName: string): MCPServerDefinition | undefined {
    return this.gameConfig?.required_servers.find(s => s.name === serverName) ||
           this.gameConfig?.optional_servers?.find(s => s.name === serverName);
  }

  /**
   * Resolve the actual path to the server implementation
   */
  private resolveServerPath(serverName: string): string {
    // Convert server name to file path
    // e.g., "monster-content-mcp" -> "src/mcp/monster-content-mcp.ts"
    return path.join(__dirname, '..', 'mcp', `${serverName}.ts`);
  }

  /**
   * Build server configuration from definition and game path
   */
  private buildServerConfig(serverDef: MCPServerDefinition, gamePath: string): {
    args: string[];
    env: Record<string, string>;
  } {
    const config = serverDef.config || {};
    const env: Record<string, string> = {};
    const args: string[] = [];

    // Resolve paths relative to game directory
    for (const [key, value] of Object.entries(config)) {
      if (typeof value === 'string' && value.startsWith('./')) {
        env[key.toUpperCase()] = path.join(gamePath, value);
      } else {
        env[key.toUpperCase()] = String(value);
      }
    }

    return { args, env };
  }

  /**
   * Load minimal default servers if no config found
   */
  private async loadDefaultServers(): Promise<void> {
    const defaultServers = [
      'world-content-mcp',
      'entity-content-mcp',
      'state-mcp'
    ];

    for (const serverName of defaultServers) {
      try {
        const serverPath = this.resolveServerPath(serverName);
        
        this.mcpManager.registerServer({
          name: serverName,
          path: serverPath,
          args: [],
          env: {}
        });

        await this.mcpManager.startServer(serverName);
        this.loadedServers.add(serverName);
        
        console.log(`✓ Loaded default server: ${serverName}`);
      } catch (error) {
        console.warn(`Failed to load default server ${serverName}: ${error}`);
      }
    }
  }

  /**
   * Get information about currently loaded servers
   */
  getLoadedServers(): {
    name: string;
    description: string;
    type: 'required' | 'optional' | 'default';
  }[] {
    const result: any[] = [];
    
    for (const serverName of this.loadedServers) {
      const serverDef = this.findServerDefinition(serverName);
      const isRequired = this.gameConfig?.required_servers.some(s => s.name === serverName);
      
      result.push({
        name: serverName,
        description: serverDef?.description || 'Default server',
        type: isRequired ? 'required' : (serverDef ? 'optional' : 'default')
      });
    }
    
    return result;
  }

  /**
   * Get game system information
   */
  getGameSystemInfo(): {
    system: string;
    description: string;
    serverCount: number;
    features: string[];
  } | null {
    if (!this.gameConfig) return null;

    return {
      system: this.gameConfig.game_system,
      description: this.gameConfig.description,
      serverCount: this.loadedServers.size,
      features: this.gameContext.gameFeatures
    };
  }
}