/**
 * State Management MCP Server
 * Tracks current game state with Git versioning
 */

import * as fs from 'fs';
import * as path from 'path';
import { BaseMCPServer } from './base-mcp-server';
import { MCPTool, EntityId, Position } from '../types/mcp-types';
import { GitManager, Commit } from '../core/git-manager';
import { GameSaveMetadata } from '../core/content-hasher';

export interface WorldState {
  currentRoom: string;
  party: string[];
  worldTime: GameTime;
  flags: Record<string, any>;
  dynamicEntities: EntityId[];
}

export interface GameTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export interface StateDiff {
  positions?: Record<string, Position>;
  inventory?: Record<string, string[]>;
  health?: Record<string, number>;
  flags?: Record<string, any>;
  time?: GameTime;
  created?: EntityId[];
  destroyed?: string[];
}

export class StateMCP extends BaseMCPServer {
  private gitManager: GitManager;
  private currentState: WorldState;
  private entityPositions: Map<string, Position> = new Map();
  private inventories: Map<string, string[]> = new Map();
  private entityStates: Map<string, Record<string, any>> = new Map();
  private roomStates: Map<string, Record<string, any>> = new Map();
  private startingRoom: string;
  private gameMetadata: GameSaveMetadata | null = null;
  private turnCount: number = 0;

  constructor(gitRepoPath: string = './game-state', startingRoom: string = 'start') {
    super('state-mcp', '1.0.0', ['state-management', 'git-versioning', 'branching']);
    this.gitManager = new GitManager(gitRepoPath);
    this.startingRoom = startingRoom;
    this.currentState = this.initializeDefaultState();
  }

  /**
   * Set game metadata for content hash tracking
   * Should be called before first save
   */
  setGameMetadata(metadata: GameSaveMetadata): void {
    this.gameMetadata = metadata;

    // Restore turn count if resuming from existing save
    if (metadata.turnCount !== undefined) {
      this.turnCount = metadata.turnCount;
    }

    this.log(`Game metadata set for ${metadata.gameId} (Turn ${this.turnCount})`);
  }

  async initialize(): Promise<void> {
    try {
      // Load latest state if available
      const latestState = await this.gitManager.loadState();
      if (latestState) {
        this.loadStateFromData(latestState);
      }

      let currentBranch = 'main';
      try {
        currentBranch = await this.gitManager.getCurrentBranch();
      } catch (error) {
        this.warn('Could not get current branch, defaulting to main', error);
      }

      this.log('State MCP initialized', {
        currentBranch,
        entities: this.entityPositions.size,
        inventories: this.inventories.size
      });
    } catch (error) {
      this.handleError('initialization failed', error);
    }
  }

  listTools(): MCPTool[] {
    return [
      this.createTool(
        'getCurrentBranch',
        'Get current Git branch',
        {
          type: 'object',
          properties: {}
        },
        {
          type: 'string',
          description: 'Current branch name'
        }
      ),

      this.createTool(
        'getBranches',
        'List all Git branches',
        {
          type: 'object',
          properties: {}
        },
        {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of branch names'
        }
      ),

      this.createTool(
        'switchBranch',
        'Switch to different branch',
        {
          type: 'object',
          properties: {
            branch: { type: 'string', description: 'Branch name to switch to' }
          },
          required: ['branch']
        },
        {
          type: 'object',
          properties: {
            success: { type: 'boolean' }
          }
        }
      ),

      this.createTool(
        'createBranch',
        'Create new branch from current state',
        {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'New branch name' },
            fromCommit: { type: 'string', description: 'Commit hash to branch from (optional)' }
          },
          required: ['name']
        },
        {
          type: 'object',
          properties: {
            success: { type: 'boolean' }
          }
        }
      ),

      this.createTool(
        'cherryPick',
        'Cherry-pick commits from other branches',
        {
          type: 'object',
          properties: {
            commits: { 
              type: 'array', 
              items: { type: 'string' },
              description: 'Array of commit hashes to cherry-pick'
            }
          },
          required: ['commits']
        },
        {
          type: 'object',
          properties: {
            success: { type: 'boolean' }
          }
        }
      ),

      this.createTool(
        'saveState',
        'Save current state with Git commit',
        {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'Commit message' }
          },
          required: ['message']
        },
        {
          type: 'string',
          description: 'Commit hash'
        }
      ),

      this.createTool(
        'loadState',
        'Load state from specific commit',
        {
          type: 'object',
          properties: {
            commitOrBranch: { type: 'string', description: 'Commit hash or branch name' }
          },
          required: ['commitOrBranch']
        },
        {
          type: 'object',
          properties: {
            success: { type: 'boolean' }
          }
        }
      ),

      this.createTool(
        'getHistory',
        'Get commit history',
        {
          type: 'object',
          properties: {
            branch: { type: 'string', description: 'Branch name (optional)' },
            limit: { type: 'number', description: 'Maximum commits to return' }
          }
        },
        {
          type: 'array',
          items: { type: 'object', description: 'Commit objects' }
        }
      ),

      this.createTool(
        'getEntityPosition',
        'Get entity position',
        {
          type: 'object',
          properties: {
            entityId: { type: 'string', description: 'Entity ID' }
          },
          required: ['entityId']
        },
        {
          type: 'object',
          properties: {
            room: { type: 'string' },
            container: { type: 'string' },
            worn: { type: 'string' },
            coordinates: { type: 'object' }
          }
        }
      ),

      this.createTool(
        'moveEntity',
        'Move entity to new position',
        {
          type: 'object',
          properties: {
            entityId: { type: 'string', description: 'Entity ID' },
            to: { 
              type: 'object',
              properties: {
                room: { type: 'string' },
                container: { type: 'string' },
                worn: { type: 'string' },
                coordinates: { type: 'object' }
              },
              required: ['room']
            }
          },
          required: ['entityId', 'to']
        },
        {
          type: 'object',
          properties: {
            success: { type: 'boolean' }
          }
        }
      ),

      this.createTool(
        'getInventory',
        'Get entity inventory',
        {
          type: 'object',
          properties: {
            entityId: { type: 'string', description: 'Entity ID' }
          },
          required: ['entityId']
        },
        {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of item IDs'
        }
      ),

      this.createTool(
        'transferItem',
        'Transfer item between entities',
        {
          type: 'object',
          properties: {
            itemId: { type: 'string', description: 'Item ID' },
            from: { type: 'string', description: 'Source entity ID' },
            to: { type: 'string', description: 'Target entity ID' }
          },
          required: ['itemId', 'from', 'to']
        },
        {
          type: 'object',
          properties: {
            success: { type: 'boolean' }
          }
        }
      ),

      this.createTool(
        'modifyRoomState',
        'Modify room state properties',
        {
          type: 'object',
          properties: {
            roomId: { type: 'string', description: 'Room ID' },
            changes: { 
              type: 'object',
              description: 'State changes to apply',
              additionalProperties: true
            }
          },
          required: ['roomId', 'changes']
        },
        {
          type: 'object',
          properties: {
            success: { type: 'boolean' }
          }
        }
      ),

      this.createTool(
        'modifyEntityState',
        'Modify entity state properties',
        {
          type: 'object',
          properties: {
            entityId: { type: 'string', description: 'Entity ID' },
            changes: { 
              type: 'object',
              description: 'State changes to apply',
              additionalProperties: true
            }
          },
          required: ['entityId', 'changes']
        },
        {
          type: 'object',
          properties: {
            success: { type: 'boolean' }
          }
        }
      ),

      this.createTool(
        'getWorldState',
        'Get complete world state',
        {
          type: 'object',
          properties: {}
        },
        {
          type: 'object',
          properties: {
            currentRoom: { type: 'string' },
            party: { type: 'array', items: { type: 'string' } },
            worldTime: { type: 'object' },
            flags: { type: 'object' },
            dynamicEntities: { type: 'array' }
          }
        }
      ),

      this.createTool(
        'getDiff',
        'Get difference between two commits',
        {
          type: 'object',
          properties: {
            from: { type: 'string', description: 'From commit hash' },
            to: { type: 'string', description: 'To commit hash' }
          },
          required: ['from', 'to']
        },
        {
          type: 'object',
          properties: {
            from: { type: 'string' },
            to: { type: 'string' },
            fromMessage: { type: 'string' },
            toMessage: { type: 'string' }
          }
        }
      )
    ];
  }

  protected async executeToolInternal(name: string, params: any): Promise<any> {
    const tool = this.validateTool(name);
    this.validateParams(params, tool);

    switch (name) {
      case 'getCurrentBranch':
        return await this.gitManager.getCurrentBranch();

      case 'getBranches':
        return await this.gitManager.getBranches();

      case 'switchBranch':
        await this.gitManager.switchBranch(params.branch);
        await this.loadLatestState();
        return { success: true };

      case 'createBranch':
        await this.gitManager.createBranch(params.name, params.fromCommit);
        return { success: true };

      case 'cherryPick':
        await this.gitManager.cherryPick(params.commits);
        await this.loadLatestState();
        return { success: true };

      case 'saveState':
        return await this.saveState(params.message);

      case 'loadState':
        await this.gitManager.loadState(params.commitOrBranch);
        await this.loadLatestState();
        return { success: true };

      case 'getHistory':
        return await this.gitManager.getHistory(params.branch, params.limit);

      case 'getEntityPosition':
        return this.getEntityPosition(params.entityId);

      case 'moveEntity':
        this.moveEntity(params.entityId, params.to);
        return { success: true };

      case 'getInventory':
        return this.getInventory(params.entityId);

      case 'transferItem':
        this.transferItem(params.itemId, params.from, params.to);
        return { success: true };

      case 'modifyRoomState':
        this.modifyRoomState(params.roomId, params.changes);
        return { success: true };

      case 'modifyEntityState':
        this.modifyEntityState(params.entityId, params.changes);
        return { success: true };

      case 'getWorldState':
        return this.getWorldState();

      case 'getDiff':
        return await this.gitManager.getDiff(params.from, params.to);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  // Git Operations
  async saveState(message: string): Promise<string> {
    const stateData = this.serializeState();

    // Increment turn count
    this.turnCount++;

    // Update metadata if set
    if (this.gameMetadata) {
      this.gameMetadata.turnCount = this.turnCount;
      this.gameMetadata.lastPlayed = new Date().toISOString();
      // lastCommit will be updated by GitManager after commit
    }

    const commitHash = await this.gitManager.saveState(message, stateData, this.gameMetadata || undefined);

    this.log(`State saved: ${message} (${commitHash.substring(0, 8)}) [Turn ${this.turnCount}]`);
    return commitHash;
  }

  private async loadLatestState(): Promise<void> {
    const stateData = await this.gitManager.loadState();
    if (stateData) {
      this.loadStateFromData(stateData);
      this.log('State loaded from Git');
    }
  }

  // Position Tracking
  getEntityPosition(entityId: string): Position {
    return this.entityPositions.get(entityId) || { room: 'unknown' };
  }

  moveEntity(entityId: string, to: Position): void {
    const oldPosition = this.entityPositions.get(entityId);
    this.entityPositions.set(entityId, to);
    
    this.log(`Moved ${entityId} from ${JSON.stringify(oldPosition)} to ${JSON.stringify(to)}`);
  }

  // Inventory Management
  getInventory(entityId: string): string[] {
    return this.inventories.get(entityId) || [];
  }

  transferItem(itemId: string, from: string, to: string): void {
    const fromInventory = this.inventories.get(from) || [];
    const toInventory = this.inventories.get(to) || [];
    
    const itemIndex = fromInventory.indexOf(itemId);
    if (itemIndex === -1) {
      throw new Error(`Item ${itemId} not found in ${from} inventory`);
    }
    
    // Remove from source
    fromInventory.splice(itemIndex, 1);
    this.inventories.set(from, fromInventory);
    
    // Add to target
    toInventory.push(itemId);
    this.inventories.set(to, toInventory);
    
    this.log(`Transferred ${itemId} from ${from} to ${to}`);
  }

  // State Modification
  modifyRoomState(roomId: string, changes: Record<string, any>): void {
    const roomState = this.roomStates.get(roomId) || {};
    Object.assign(roomState, changes);
    this.roomStates.set(roomId, roomState);
    
    this.log(`Modified room ${roomId} state`, changes);
  }

  modifyEntityState(entityId: string, changes: Record<string, any>): void {
    const entityState = this.entityStates.get(entityId) || {};
    Object.assign(entityState, changes);
    this.entityStates.set(entityId, entityState);
    
    this.log(`Modified entity ${entityId} state`, changes);
  }

  // World State Access
  getWorldState(): WorldState {
    return { ...this.currentState };
  }

  // State Serialization
  private serializeState(): any {
    return {
      worldState: this.currentState,
      entityPositions: Array.from(this.entityPositions.entries()),
      inventories: Array.from(this.inventories.entries()),
      entityStates: Array.from(this.entityStates.entries()),
      roomStates: Array.from(this.roomStates.entries()),
      timestamp: Date.now()
    };
  }

  private loadStateFromData(data: any): void {
    if (data.worldState) {
      this.currentState = data.worldState;
    }
    
    if (data.entityPositions) {
      this.entityPositions = new Map(data.entityPositions);
    }
    
    if (data.inventories) {
      this.inventories = new Map(data.inventories);
    }
    
    if (data.entityStates) {
      this.entityStates = new Map(data.entityStates);
    }
    
    if (data.roomStates) {
      this.roomStates = new Map(data.roomStates);
    }
  }

  private initializeDefaultState(): WorldState {
    return {
      currentRoom: this.startingRoom,
      party: ['player'],
      worldTime: {
        year: 1423,
        month: 3,
        day: 15,
        hour: 14,
        minute: 30
      },
      flags: {},
      dynamicEntities: []
    };
  }

  // Time Management
  advanceTime(minutes: number): void {
    const time = this.currentState.worldTime;
    time.minute += minutes;
    
    // Handle time overflow
    if (time.minute >= 60) {
      time.hour += Math.floor(time.minute / 60);
      time.minute = time.minute % 60;
    }
    
    if (time.hour >= 24) {
      time.day += Math.floor(time.hour / 24);
      time.hour = time.hour % 24;
    }
    
    // Simplified month/year handling
    if (time.day > 30) {
      time.month += Math.floor(time.day / 30);
      time.day = ((time.day - 1) % 30) + 1;
    }
    
    if (time.month > 12) {
      time.year += Math.floor((time.month - 1) / 12);
      time.month = ((time.month - 1) % 12) + 1;
    }
    
    this.log(`Advanced time by ${minutes} minutes to ${time.year}-${time.month}-${time.day} ${time.hour}:${time.minute.toString().padStart(2, '0')}`);
  }

  // Party Management
  addToParty(entityId: string): void {
    if (!this.currentState.party.includes(entityId)) {
      this.currentState.party.push(entityId);
      this.log(`Added ${entityId} to party`);
    }
  }

  removeFromParty(entityId: string): void {
    const index = this.currentState.party.indexOf(entityId);
    if (index !== -1) {
      this.currentState.party.splice(index, 1);
      this.log(`Removed ${entityId} from party`);
    }
  }

  // Flag Management
  setFlag(flag: string, value: any): void {
    this.currentState.flags[flag] = value;
    this.log(`Set flag ${flag} = ${JSON.stringify(value)}`);
  }

  getFlag(flag: string): any {
    return this.currentState.flags[flag];
  }

  // Room Management
  setCurrentRoom(roomId: string): void {
    const oldRoom = this.currentState.currentRoom;
    this.currentState.currentRoom = roomId;
    
    // Move all party members
    for (const partyMember of this.currentState.party) {
      this.moveEntity(partyMember, { room: roomId });
    }
    
    this.log(`Changed current room from ${oldRoom} to ${roomId}`);
  }

  // Debug Interface Implementation
  protected getCurrentState(): any {
    return {
      currentRoom: this.currentState.currentRoom,
      partySize: this.currentState.party.length,
      worldTime: this.currentState.worldTime,
      flags: Object.keys(this.currentState.flags).length,
      dynamicEntities: this.currentState.dynamicEntities.length,
      trackedPositions: this.entityPositions.size,
      managedInventories: this.inventories.size
    };
  }

  protected getWarnings(): string[] {
    const warnings: string[] = [];
    
    if (this.currentState.party.length === 0) {
      warnings.push('No party members');
    }
    
    if (this.currentState.currentRoom === 'unknown') {
      warnings.push('Current room is unknown');
    }
    
    if (this.entityPositions.size > 1000) {
      warnings.push(`Large number of tracked entities: ${this.entityPositions.size}`);
    }
    
    return warnings;
  }

  // Cleanup
  destroy(): void {
    super.destroy();
    // Git manager cleanup would go here if needed
  }
}