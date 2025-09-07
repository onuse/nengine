/**
 * World Content MCP Server
 * Provides static world data and manages dynamic space creation
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { BaseMCPServer } from './base-mcp-server';
import { MCPTool, EntityId, Position } from '../types/mcp-types';

export interface Room {
  id: string;
  name: string;
  description: string;
  exits: Record<string, string>;
  properties: Record<string, any>;
  mutations?: MutationClause;
  hiddenExits?: Record<string, {
    targetRoom: string;
    discoveryCondition: string;
  }>;
}

export interface MutationClause {
  shatterable?: boolean;
  combustible?: boolean;
  combines?: string[];
  creates?: string[];
  message?: string;
  preserve?: string[];
}

export interface Environment {
  temperature: number;
  hazards: string[];
  sounds: string[];
  smells: string[];
}

export class WorldContentMCP extends BaseMCPServer {
  private worldData: any = null;
  private rooms: Map<string, Room> = new Map();
  private dynamicRooms: Map<string, Room> = new Map();
  private gamePath: string;

  constructor(gamePath: string) {
    super('world-content-mcp', '1.0.0', ['world-queries', 'dynamic-spaces']);
    this.gamePath = gamePath;
  }

  async initialize(): Promise<void> {
    try {
      await this.loadWorldData();
      this.log('World Content MCP initialized', {
        staticRooms: this.rooms.size,
        dynamicRooms: this.dynamicRooms.size
      });
    } catch (error) {
      this.handleError('initialization failed', error);
    }
  }

  listTools(): MCPTool[] {
    return [
      this.createTool(
        'getRoom',
        'Get room data by ID',
        {
          type: 'object',
          properties: {
            roomId: { type: 'string', description: 'Room identifier' }
          },
          required: ['roomId']
        },
        {
          type: 'object',
          properties: {
            room: { type: 'object', description: 'Room data or null if not found' }
          }
        },
        [{
          description: 'Get the tavern main hall',
          parameters: { roomId: 'tavern_main_hall' },
          expectedResult: { room: { id: 'tavern_main_hall', name: 'Main Hall', /*...*/ } }
        }]
      ),

      this.createTool(
        'getRoomsInRegion',
        'Get all rooms in a specific region',
        {
          type: 'object',
          properties: {
            region: { type: 'string', description: 'Region name' }
          },
          required: ['region']
        },
        {
          type: 'array',
          items: { type: 'object', description: 'Room data' }
        }
      ),

      this.createTool(
        'getConnectedRooms',
        'Get rooms connected to a specific room',
        {
          type: 'object',
          properties: {
            roomId: { type: 'string', description: 'Room identifier' }
          },
          required: ['roomId']
        },
        {
          type: 'array',
          items: { type: 'string', description: 'Connected room IDs' }
        }
      ),

      this.createTool(
        'createDynamicRoom',
        'Create a new dynamic room',
        {
          type: 'object',
          properties: {
            parentRoom: { type: 'string', description: 'Parent room ID' },
            type: { type: 'string', enum: ['hidden', 'temporary', 'discovered'] },
            name: { type: 'string', description: 'Room name' },
            description: { type: 'string', description: 'Room description' },
            connections: { 
              type: 'object', 
              description: 'Exit connections',
              additionalProperties: { type: 'string' }
            }
          },
          required: ['parentRoom', 'type', 'name', 'description']
        },
        {
          type: 'object',
          properties: {
            entityId: { type: 'object', description: 'Generated entity ID' }
          }
        }
      ),

      this.createTool(
        'getItemsInRoom',
        'Get items currently in a room',
        {
          type: 'object',
          properties: {
            roomId: { type: 'string', description: 'Room identifier' }
          },
          required: ['roomId']
        },
        {
          type: 'array',
          items: { type: 'object', description: 'Entity IDs of items' }
        }
      ),

      this.createTool(
        'getNPCsInRoom',
        'Get NPCs currently in a room',
        {
          type: 'object',
          properties: {
            roomId: { type: 'string', description: 'Room identifier' }
          },
          required: ['roomId']
        },
        {
          type: 'array',
          items: { type: 'object', description: 'Entity IDs of NPCs' }
        }
      ),

      this.createTool(
        'getLighting',
        'Get lighting level in a room',
        {
          type: 'object',
          properties: {
            roomId: { type: 'string', description: 'Room identifier' }
          },
          required: ['roomId']
        },
        {
          type: 'string',
          enum: ['dark', 'dim', 'normal', 'bright']
        }
      ),

      this.createTool(
        'getEnvironment',
        'Get environmental conditions in a room',
        {
          type: 'object',
          properties: {
            roomId: { type: 'string', description: 'Room identifier' }
          },
          required: ['roomId']
        },
        {
          type: 'object',
          properties: {
            temperature: { type: 'number' },
            hazards: { type: 'array', items: { type: 'string' } },
            sounds: { type: 'array', items: { type: 'string' } },
            smells: { type: 'array', items: { type: 'string' } }
          }
        }
      )
    ];
  }

  protected async executeToolInternal(name: string, params: any): Promise<any> {
    const tool = this.validateTool(name);
    this.validateParams(params, tool);

    switch (name) {
      case 'getRoom':
        return { room: this.getRoom(params.roomId) };

      case 'getRoomsInRegion':
        return this.getRoomsInRegion(params.region);

      case 'getConnectedRooms':
        return this.getConnectedRooms(params.roomId);

      case 'createDynamicRoom':
        return { entityId: this.createDynamicRoom(params) };

      case 'getItemsInRoom':
        return this.getItemsInRoom(params.roomId);

      case 'getNPCsInRoom':
        return this.getNPCsInRoom(params.roomId);

      case 'getLighting':
        return this.getLighting(params.roomId);

      case 'getEnvironment':
        return this.getEnvironment(params.roomId);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  // World Content Interface Implementation
  getRoom(roomId: string): Room | null {
    // Check static rooms first
    if (this.rooms.has(roomId)) {
      return this.rooms.get(roomId)!;
    }
    
    // Check dynamic rooms
    if (this.dynamicRooms.has(roomId)) {
      return this.dynamicRooms.get(roomId)!;
    }
    
    this.log(`Room not found: ${roomId}`);
    return null;
  }

  getRoomsInRegion(region: string): Room[] {
    const roomsInRegion: Room[] = [];
    
    // Search static rooms
    for (const room of this.rooms.values()) {
      if (room.properties?.region === region) {
        roomsInRegion.push(room);
      }
    }
    
    // Search dynamic rooms
    for (const room of this.dynamicRooms.values()) {
      if (room.properties?.region === region) {
        roomsInRegion.push(room);
      }
    }
    
    return roomsInRegion;
  }

  getConnectedRooms(roomId: string): string[] {
    const room = this.getRoom(roomId);
    if (!room) {
      return [];
    }
    
    const connected = Object.values(room.exits);
    
    // Add hidden exits if they exist
    if (room.hiddenExits) {
      connected.push(...Object.values(room.hiddenExits).map(exit => exit.targetRoom));
    }
    
    return connected;
  }

  createDynamicRoom(params: {
    parentRoom: string;
    type: 'hidden' | 'temporary' | 'discovered';
    name: string;
    description: string;
    connections?: Record<string, string>;
  }): EntityId {
    const roomId = this.generateId(`dynamic_room_${params.type}`);
    
    const room: Room = {
      id: roomId,
      name: params.name,
      description: params.description,
      exits: params.connections || {},
      properties: {
        type: params.type,
        parentRoom: params.parentRoom,
        created: Date.now()
      }
    };
    
    this.dynamicRooms.set(roomId, room);
    
    this.log(`Created dynamic room: ${roomId}`, room);
    
    return {
      id: roomId,
      isStatic: false
    };
  }

  getItemsInRoom(roomId: string): EntityId[] {
    // This would typically query the state MCP server
    // For now, return empty array as placeholder
    return [];
  }

  getNPCsInRoom(roomId: string): EntityId[] {
    // This would typically query the state MCP server
    // For now, return empty array as placeholder
    return [];
  }

  getLighting(roomId: string): 'dark' | 'dim' | 'normal' | 'bright' {
    const room = this.getRoom(roomId);
    if (!room) {
      return 'normal';
    }
    
    return room.properties?.lighting || 'normal';
  }

  getEnvironment(roomId: string): Environment {
    const room = this.getRoom(roomId);
    if (!room) {
      return {
        temperature: 20,
        hazards: [],
        sounds: [],
        smells: []
      };
    }
    
    return {
      temperature: room.properties?.temperature || 20,
      hazards: room.properties?.hazards || [],
      sounds: room.properties?.sounds || [],
      smells: room.properties?.smells || []
    };
  }

  // Data Loading
  private async loadWorldData(): Promise<void> {
    const worldPath = path.join(this.gamePath, 'content', 'world.yaml');
    
    if (!fs.existsSync(worldPath)) {
      this.warn(`World data file not found: ${worldPath}`);
      return;
    }
    
    try {
      const content = fs.readFileSync(worldPath, 'utf-8');
      this.worldData = yaml.parse(content);
      
      this.log(`Parsed world data:`, this.worldData);
      this.log(`Type of rooms:`, typeof this.worldData?.rooms);
      this.log(`Is rooms array?:`, Array.isArray(this.worldData?.rooms));
      
      // Parse rooms
      if (this.worldData.rooms) {
        for (const roomData of this.worldData.rooms) {
          this.rooms.set(roomData.id, roomData);
        }
      }
      
      this.log(`Loaded world data: ${this.rooms.size} rooms`);
      
    } catch (error) {
      this.handleError('failed to load world data', error);
    }
  }

  // Debug Interface Implementation
  protected getCurrentState(): any {
    return {
      staticRooms: this.rooms.size,
      dynamicRooms: this.dynamicRooms.size,
      worldDataLoaded: this.worldData !== null
    };
  }

  protected getWarnings(): string[] {
    const warnings: string[] = [];
    
    if (this.rooms.size === 0) {
      warnings.push('No static rooms loaded');
    }
    
    if (this.dynamicRooms.size > 50) {
      warnings.push(`Large number of dynamic rooms: ${this.dynamicRooms.size}`);
    }
    
    return warnings;
  }
}