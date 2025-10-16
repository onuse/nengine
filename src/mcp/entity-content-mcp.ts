/**
 * Entity Content MCP Server
 * Manages NPC and item templates, creates dynamic entities
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { BaseMCPServer } from './base-mcp-server';
import { 
  MCPTool, 
  EntityId, 
  Position, 
  PersonalityTraits, 
  CharacterStats, 
  KnowledgeDomain,
  NPCSchedule
} from '../types/mcp-types';

export interface NPCTemplate {
  id: string;
  name: string;
  personality: PersonalityTraits;
  stats: CharacterStats;
  knowledge: KnowledgeDomain[];
  schedule?: NPCSchedule;
  mutations?: MutationClause;
  dialogueStyle?: {
    formality: 'casual' | 'formal' | 'archaic';
    verbosity: 'terse' | 'normal' | 'verbose';
    quirks: string[];
  };
}

export interface ItemTemplate {
  id: string;
  name: string;
  description: string;
  type: 'weapon' | 'tool' | 'consumable' | 'container' | 'misc';
  properties: Record<string, any>;
  mutations?: MutationClause;
  weight?: number;
  value?: number;
}

export interface MutationClause {
  shatterable?: boolean;
  combustible?: boolean;
  combines?: string[];
  creates?: string[];
  message?: string;
  preserve?: string[];
}

export interface MutationResult {
  success: boolean;
  created: EntityId[];
  consumed?: string[];
  message: string;
}

export class EntityContentMCP extends BaseMCPServer {
  private npcTemplates: Map<string, NPCTemplate> = new Map();
  private itemTemplates: Map<string, ItemTemplate> = new Map();
  private dynamicEntities: Map<string, any> = new Map();
  private gamePath: string;
  private imageService: any | null = null;

  constructor(gamePath: string) {
    super('entity-content-mcp', '1.0.0', ['npc-templates', 'item-templates', 'entity-generation', 'mutations']);
    this.gamePath = gamePath;
  }

  async initialize(): Promise<void> {
    try {
      await this.loadNPCTemplates();
      await this.loadItemTemplates();
      this.log('Entity Content MCP initialized', {
        npcTemplates: this.npcTemplates.size,
        itemTemplates: this.itemTemplates.size,
        dynamicEntities: this.dynamicEntities.size
      });
    } catch (error) {
      this.handleError('initialization failed', error);
    }
  }

  /**
   * Set image service for automatic entity image generation
   */
  setImageService(imageService: any): void {
    this.imageService = imageService;
    this.log('Image service connected to Entity Content MCP');
  }

  listTools(): MCPTool[] {
    return [
      this.createTool(
        'getNPCTemplate',
        'Get NPC template by ID',
        {
          type: 'object',
          properties: {
            npcId: { type: 'string', description: 'NPC template identifier' }
          },
          required: ['npcId']
        },
        {
          type: 'object',
          properties: {
            template: { type: 'object', description: 'NPC template or null if not found' }
          }
        }
      ),

      this.createTool(
        'getAllNPCs',
        'Get all NPC templates',
        {
          type: 'object',
          properties: {}
        },
        {
          type: 'array',
          items: { type: 'object', description: 'NPC template data' }
        }
      ),

      this.createTool(
        'createDynamicNPC',
        'Create a new dynamic NPC',
        {
          type: 'object',
          properties: {
            baseTemplate: { type: 'string', description: 'Base template ID (optional)' },
            name: { type: 'string', description: 'NPC name' },
            personality: { type: 'object', description: 'Personality traits' },
            role: { type: 'string', description: 'NPC role' },
            spawn: { type: 'object', description: 'Spawn position' }
          },
          required: ['name', 'personality', 'role', 'spawn']
        },
        {
          type: 'object',
          properties: {
            entityId: { type: 'object', description: 'Generated entity ID' }
          }
        }
      ),

      this.createTool(
        'getItemTemplate',
        'Get item template by ID',
        {
          type: 'object',
          properties: {
            itemId: { type: 'string', description: 'Item template identifier' }
          },
          required: ['itemId']
        },
        {
          type: 'object',
          properties: {
            template: { type: 'object', description: 'Item template or null if not found' }
          }
        }
      ),

      this.createTool(
        'createDynamicItem',
        'Create a new dynamic item',
        {
          type: 'object',
          properties: {
            baseTemplate: { type: 'string', description: 'Base template ID (optional)' },
            name: { type: 'string', description: 'Item name' },
            properties: { type: 'object', description: 'Item properties' },
            position: { type: 'object', description: 'Item position' }
          },
          required: ['name', 'properties', 'position']
        },
        {
          type: 'object',
          properties: {
            entityId: { type: 'object', description: 'Generated entity ID' }
          }
        }
      ),

      this.createTool(
        'shatterItem',
        'Attempt to shatter an item',
        {
          type: 'object',
          properties: {
            itemId: { type: 'string', description: 'Item ID to shatter' }
          },
          required: ['itemId']
        },
        {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            created: { type: 'array', items: { type: 'object' } },
            message: { type: 'string' }
          }
        }
      ),

      this.createTool(
        'combineItems',
        'Attempt to combine multiple items',
        {
          type: 'object',
          properties: {
            itemIds: { 
              type: 'array', 
              items: { type: 'string' },
              description: 'Array of item IDs to combine'
            }
          },
          required: ['itemIds']
        },
        {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            created: { type: 'object' },
            consumed: { type: 'array', items: { type: 'string' } },
            message: { type: 'string' }
          }
        }
      ),

      this.createTool(
        'searchItems',
        'Search for items matching criteria',
        {
          type: 'object',
          properties: {
            filter: {
              type: 'object',
              properties: {
                type: { type: 'string', description: 'Item type filter' },
                properties: { type: 'object', description: 'Property filters' },
                name: { type: 'string', description: 'Name pattern (regex)' }
              }
            }
          },
          required: ['filter']
        },
        {
          type: 'array',
          items: { type: 'object', description: 'Matching item templates' }
        }
      )
    ];
  }

  protected async executeToolInternal(name: string, params: any): Promise<any> {
    const tool = this.validateTool(name);
    this.validateParams(params, tool);

    switch (name) {
      case 'getNPCTemplate':
        return { template: this.getNPCTemplate(params.npcId) };

      case 'getAllNPCs':
        return Array.from(this.npcTemplates.values());

      case 'createDynamicNPC':
        return { entityId: this.createDynamicNPC(params) };

      case 'getItemTemplate':
        return { template: this.getItemTemplate(params.itemId) };

      case 'createDynamicItem':
        return { entityId: this.createDynamicItem(params) };

      case 'shatterItem':
        return this.shatterItem(params.itemId);

      case 'combineItems':
        return this.combineItems(params.itemIds);

      case 'searchItems':
        return this.searchItems(params.filter);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  // NPC Operations
  getNPCTemplate(npcId: string): NPCTemplate | null {
    if (this.npcTemplates.has(npcId)) {
      return this.npcTemplates.get(npcId)!;
    }
    
    this.log(`NPC template not found: ${npcId}`);
    return null;
  }

  createDynamicNPC(params: {
    baseTemplate?: string;
    name: string;
    personality: PersonalityTraits;
    role: string;
    spawn: Position;
  }): EntityId {
    const npcId = this.generateId('dynamic_npc');
    
    let baseTemplate: NPCTemplate | null = null;
    if (params.baseTemplate) {
      baseTemplate = this.getNPCTemplate(params.baseTemplate);
      if (!baseTemplate) {
        throw new Error(`Base template not found: ${params.baseTemplate}`);
      }
    }
    
    const npc: NPCTemplate = {
      id: npcId,
      name: params.name,
      personality: params.personality,
      stats: baseTemplate?.stats || this.generateDefaultStats(),
      knowledge: baseTemplate?.knowledge || [],
      mutations: baseTemplate?.mutations,
      dialogueStyle: baseTemplate?.dialogueStyle || {
        formality: 'casual',
        verbosity: 'normal',
        quirks: []
      }
    };
    
    this.dynamicEntities.set(npcId, {
      type: 'npc',
      template: npc,
      position: params.spawn,
      role: params.role,
      created: Date.now()
    });
    
    this.log(`Created dynamic NPC: ${npcId}`, npc);
    
    // Auto-generate portrait if image service is available
    if (this.imageService) {
      this.generateNPCPortrait(npcId, npc).catch(err => {
        this.warn(`Failed to generate portrait for ${npcId}: ${err.message}`);
      });
    }
    
    return {
      id: npcId,
      isStatic: false
    };
  }

  // Item Operations
  getItemTemplate(itemId: string): ItemTemplate | null {
    if (this.itemTemplates.has(itemId)) {
      return this.itemTemplates.get(itemId)!;
    }
    
    this.log(`Item template not found: ${itemId}`);
    return null;
  }

  createDynamicItem(params: {
    baseTemplate?: string;
    name: string;
    properties: Record<string, any>;
    position: Position;
  }): EntityId {
    const itemId = this.generateId('dynamic_item');
    
    let baseTemplate: ItemTemplate | null = null;
    if (params.baseTemplate) {
      baseTemplate = this.getItemTemplate(params.baseTemplate);
      if (!baseTemplate) {
        throw new Error(`Base template not found: ${params.baseTemplate}`);
      }
    }
    
    const item: ItemTemplate = {
      id: itemId,
      name: params.name,
      description: baseTemplate?.description || `A ${params.name}`,
      type: baseTemplate?.type || 'misc',
      properties: { ...baseTemplate?.properties, ...params.properties },
      mutations: baseTemplate?.mutations,
      weight: baseTemplate?.weight || 1,
      value: baseTemplate?.value || 0
    };
    
    this.dynamicEntities.set(itemId, {
      type: 'item',
      template: item,
      position: params.position,
      created: Date.now()
    });
    
    this.log(`Created dynamic item: ${itemId}`, item);
    
    return {
      id: itemId,
      isStatic: false
    };
  }

  // Item Mutations
  shatterItem(itemId: string): MutationResult {
    const template = this.getItemTemplate(itemId);
    if (!template) {
      return {
        success: false,
        created: [],
        message: `Item ${itemId} not found`
      };
    }
    
    if (!template.mutations?.shatterable) {
      return {
        success: false,
        created: [],
        message: template.mutations?.message || 'This item cannot be shattered'
      };
    }
    
    const created: EntityId[] = [];
    const fragments = template.mutations.creates || [`${itemId}_shard`];
    
    for (const fragmentTemplate of fragments) {
      const fragmentId = this.createDynamicItem({
        baseTemplate: fragmentTemplate,
        name: `${template.name} fragment`,
        properties: {
          fragmentOf: itemId,
          sharp: true
        },
        position: { room: 'current' } // Would need proper position from state
      });
      created.push(fragmentId);
    }
    
    this.log(`Shattered item ${itemId} into ${created.length} fragments`);
    
    return {
      success: true,
      created,
      message: `The ${template.name} shatters into pieces`
    };
  }

  combineItems(itemIds: string[]): MutationResult {
    if (itemIds.length < 2) {
      return {
        success: false,
        created: [],
        consumed: [],
        message: 'Need at least 2 items to combine'
      };
    }
    
    const templates = itemIds.map(id => this.getItemTemplate(id)).filter(t => t !== null);
    if (templates.length !== itemIds.length) {
      return {
        success: false,
        created: [],
        consumed: [],
        message: 'One or more items not found'
      };
    }
    
    // Check if combination is possible
    const firstTemplate = templates[0];
    const canCombine = firstTemplate.mutations?.combines?.some(pattern => 
      itemIds.every(id => new RegExp(pattern).test(id))
    );
    
    if (!canCombine) {
      return {
        success: false,
        created: [],
        consumed: [],
        message: 'These items cannot be combined'
      };
    }
    
    // Create combined item
    const resultTemplate = firstTemplate.mutations?.creates?.[0] || 'combined_item';
    const combinedId = this.createDynamicItem({
      baseTemplate: resultTemplate,
      name: `Combined ${templates.map(t => t.name).join(' and ')}`,
      properties: {
        combinedFrom: itemIds,
        ...this.mergeProperties(templates)
      },
      position: { room: 'current' }
    });
    
    this.log(`Combined items ${itemIds.join(', ')} into ${combinedId.id}`);
    
    return {
      success: true,
      created: [combinedId],
      consumed: itemIds,
      message: `The items combine into a ${resultTemplate}`
    };
  }

  searchItems(filter: {
    type?: string;
    properties?: Record<string, any>;
    name?: string;
  }): ItemTemplate[] {
    const results: ItemTemplate[] = [];
    
    for (const template of this.itemTemplates.values()) {
      let matches = true;
      
      if (filter.type && template.type !== filter.type) {
        matches = false;
      }
      
      if (filter.name) {
        const namePattern = new RegExp(filter.name, 'i');
        if (!namePattern.test(template.name)) {
          matches = false;
        }
      }
      
      if (filter.properties) {
        for (const [key, value] of Object.entries(filter.properties)) {
          if (template.properties[key] !== value) {
            matches = false;
            break;
          }
        }
      }
      
      if (matches) {
        results.push(template);
      }
    }
    
    return results;
  }

  // Data Loading
  private async loadNPCTemplates(): Promise<void> {
    // Load NPC data from characters.yaml (standard location)
    const charactersPath = path.join(this.gamePath, 'content', 'characters.yaml');

    if (!fs.existsSync(charactersPath)) {
      this.warn(`Characters file not found: ${charactersPath}`);
      return;
    }
    
    try {
      const content = fs.readFileSync(charactersPath, 'utf-8');
      const charactersData = yaml.parse(content);

      if (charactersData.npcs) {
        for (const npcData of charactersData.npcs) {
          this.npcTemplates.set(npcData.id, npcData);
        }
      }

      this.log(`Loaded NPC templates: ${this.npcTemplates.size} NPCs`);

    } catch (error) {
      this.handleError('failed to load NPC templates', error);
    }
  }

  private async loadItemTemplates(): Promise<void> {
    const itemsPath = path.join(this.gamePath, 'content', 'items.yaml');
    
    if (!fs.existsSync(itemsPath)) {
      this.warn(`Items file not found: ${itemsPath}`);
      return;
    }
    
    try {
      const content = fs.readFileSync(itemsPath, 'utf-8');
      const itemsData = yaml.parse(content);
      
      if (itemsData.items) {
        for (const itemData of itemsData.items) {
          this.itemTemplates.set(itemData.id, itemData);
        }
      }
      
      this.log(`Loaded item templates: ${this.itemTemplates.size} items`);
      
    } catch (error) {
      this.handleError('failed to load item templates', error);
    }
  }

  // Helper Methods
  private generateDefaultStats(): CharacterStats {
    return {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10
    };
  }

  private async generateNPCPortrait(npcId: string, npc: NPCTemplate): Promise<void> {
    if (!this.imageService) {
      return;
    }

    try {
      // Build description for image generation
      let description = npc.name;
      
      if (npc.personality?.traits) {
        description += `, ${npc.personality.traits.slice(0, 3).join(', ')}`;
      }
      
      // Add any appearance details from personality or knowledge
      const visualTraits = [];
      if (npc.personality?.appearance) {
        visualTraits.push(npc.personality.appearance);
      }
      
      if (visualTraits.length > 0) {
        description += `, ${visualTraits.join(', ')}`;
      }

      this.log(`Generating portrait for ${npcId}: ${description}`);
      
      await this.imageService.generateEntityImage(npcId, description, {
        size: '512x512',
        steps: 20
      });
      
      this.log(`Portrait generated for ${npcId}`);
    } catch (error: any) {
      this.warn(`Portrait generation failed for ${npcId}: ${error.message}`);
    }
  }

  private mergeProperties(templates: ItemTemplate[]): Record<string, any> {
    const merged: Record<string, any> = {};
    
    for (const template of templates) {
      Object.assign(merged, template.properties);
    }
    
    return merged;
  }

  // Debug Interface Implementation
  protected getCurrentState(): any {
    return {
      npcTemplates: this.npcTemplates.size,
      itemTemplates: this.itemTemplates.size,
      dynamicEntities: this.dynamicEntities.size,
      entityTypes: Array.from(this.dynamicEntities.values())
        .reduce((acc, entity) => {
          acc[entity.type] = (acc[entity.type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
    };
  }

  protected getWarnings(): string[] {
    const warnings: string[] = [];
    
    if (this.npcTemplates.size === 0) {
      warnings.push('No NPC templates loaded');
    }
    
    if (this.itemTemplates.size === 0) {
      warnings.push('No item templates loaded');
    }
    
    if (this.dynamicEntities.size > 100) {
      warnings.push(`Large number of dynamic entities: ${this.dynamicEntities.size}`);
    }
    
    return warnings;
  }
}