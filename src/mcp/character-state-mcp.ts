/**
 * Character State MCP Server
 * Manages player and party member stats, abilities, and progression
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { BaseMCPServer } from './base-mcp-server';
import { MCPTool, CharacterStats } from '../types/mcp-types';

export interface Character {
  id: string;
  name: string;
  stats: CharacterStats;
  health: HealthInfo;
  equipment: Equipment;
  abilities: string[];
  conditions: Condition[];
  experience: number;
  level: number;
}

export interface HealthInfo {
  current: number;
  maximum: number;
  temporary: number;
}

export interface Equipment {
  mainHand?: string;
  offHand?: string;
  armor?: string;
  accessories: string[];
  consumables: string[];
}

export interface Condition {
  name: string;
  duration: number;
  effects: Record<string, any>;
  source?: string;
}

export interface StatModification {
  stat: keyof CharacterStats;
  change: number;
  reason: string;
}

export class CharacterStateMCP extends BaseMCPServer {
  private characters: Map<string, Character> = new Map();
  private characterTemplates: Map<string, Partial<Character>> = new Map();
  private gamePath: string;

  constructor(gamePath: string) {
    super('character-state-mcp', '1.0.0', ['character-management', 'stats', 'equipment', 'progression']);
    this.gamePath = gamePath;
  }

  async initialize(): Promise<void> {
    try {
      await this.loadCharacterTemplates();
      this.log('Character State MCP initialized', {
        characters: this.characters.size,
        templates: this.characterTemplates.size
      });
    } catch (error) {
      this.handleError('initialization failed', error);
    }
  }

  listTools(): MCPTool[] {
    return [
      this.createTool(
        'getCharacterStats',
        'Get character statistics',
        {
          type: 'object',
          properties: {
            characterId: { type: 'string', description: 'Character ID' }
          },
          required: ['characterId']
        },
        {
          type: 'object',
          properties: {
            stats: { type: 'object', description: 'Character stats' }
          }
        }
      ),

      this.createTool(
        'modifyCharacterStats',
        'Modify character statistics',
        {
          type: 'object',
          properties: {
            characterId: { type: 'string', description: 'Character ID' },
            changes: { 
              type: 'object',
              description: 'Stat changes to apply',
              additionalProperties: { type: 'number' }
            }
          },
          required: ['characterId', 'changes']
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
        'Get character inventory',
        {
          type: 'object',
          properties: {
            characterId: { type: 'string', description: 'Character ID' }
          },
          required: ['characterId']
        },
        {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of item IDs'
        }
      ),

      this.createTool(
        'equipItem',
        'Equip item on character',
        {
          type: 'object',
          properties: {
            characterId: { type: 'string', description: 'Character ID' },
            itemId: { type: 'string', description: 'Item ID to equip' },
            slot: { 
              type: 'string',
              enum: ['mainHand', 'offHand', 'armor'],
              description: 'Equipment slot (optional - auto-detect if not specified)'
            }
          },
          required: ['characterId', 'itemId']
        },
        {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            unequipped: { type: 'string', description: 'Item that was unequipped (if any)' }
          }
        }
      ),

      this.createTool(
        'unequipItem',
        'Unequip item from character',
        {
          type: 'object',
          properties: {
            characterId: { type: 'string', description: 'Character ID' },
            slot: { 
              type: 'string',
              enum: ['mainHand', 'offHand', 'armor'],
              description: 'Equipment slot to clear'
            }
          },
          required: ['characterId', 'slot']
        },
        {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            itemId: { type: 'string', description: 'Item that was unequipped' }
          }
        }
      ),

      this.createTool(
        'getHealth',
        'Get character health information',
        {
          type: 'object',
          properties: {
            characterId: { type: 'string', description: 'Character ID' }
          },
          required: ['characterId']
        },
        {
          type: 'object',
          properties: {
            current: { type: 'number' },
            maximum: { type: 'number' },
            temporary: { type: 'number' }
          }
        }
      ),

      this.createTool(
        'modifyHealth',
        'Modify character health',
        {
          type: 'object',
          properties: {
            characterId: { type: 'string', description: 'Character ID' },
            amount: { type: 'number', description: 'Amount to add/subtract (negative for damage)' },
            type: { 
              type: 'string',
              enum: ['healing', 'damage', 'temporary'],
              description: 'Type of health modification'
            }
          },
          required: ['characterId', 'amount', 'type']
        },
        {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            newHealth: { type: 'object' },
            unconscious: { type: 'boolean' },
            dead: { type: 'boolean' }
          }
        }
      ),

      this.createTool(
        'addCondition',
        'Add condition to character',
        {
          type: 'object',
          properties: {
            characterId: { type: 'string', description: 'Character ID' },
            condition: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                duration: { type: 'number' },
                effects: { type: 'object' },
                source: { type: 'string' }
              },
              required: ['name', 'duration']
            }
          },
          required: ['characterId', 'condition']
        },
        {
          type: 'object',
          properties: {
            success: { type: 'boolean' }
          }
        }
      ),

      this.createTool(
        'removeCondition',
        'Remove condition from character',
        {
          type: 'object',
          properties: {
            characterId: { type: 'string', description: 'Character ID' },
            conditionName: { type: 'string', description: 'Name of condition to remove' }
          },
          required: ['characterId', 'conditionName']
        },
        {
          type: 'object',
          properties: {
            success: { type: 'boolean' }
          }
        }
      ),

      this.createTool(
        'getConditions',
        'Get character active conditions',
        {
          type: 'object',
          properties: {
            characterId: { type: 'string', description: 'Character ID' }
          },
          required: ['characterId']
        },
        {
          type: 'array',
          items: { type: 'object', description: 'Active conditions' }
        }
      ),

      this.createTool(
        'addExperience',
        'Add experience points to character',
        {
          type: 'object',
          properties: {
            characterId: { type: 'string', description: 'Character ID' },
            amount: { type: 'number', description: 'Experience points to add' },
            reason: { type: 'string', description: 'Reason for XP gain' }
          },
          required: ['characterId', 'amount']
        },
        {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            levelUp: { type: 'boolean' },
            newLevel: { type: 'number' }
          }
        }
      ),

      this.createTool(
        'levelUp',
        'Level up character',
        {
          type: 'object',
          properties: {
            characterId: { type: 'string', description: 'Character ID' },
            statIncreases: {
              type: 'object',
              description: 'Stat increases for level up',
              additionalProperties: { type: 'number' }
            }
          },
          required: ['characterId']
        },
        {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            newLevel: { type: 'number' },
            newStats: { type: 'object' }
          }
        }
      ),

      this.createTool(
        'createCharacter',
        'Create new character from template',
        {
          type: 'object',
          properties: {
            characterId: { type: 'string', description: 'Unique character ID' },
            name: { type: 'string', description: 'Character name' },
            template: { type: 'string', description: 'Character template ID (optional)' },
            customStats: { 
              type: 'object',
              description: 'Custom stat overrides',
              additionalProperties: { type: 'number' }
            }
          },
          required: ['characterId', 'name']
        },
        {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            character: { type: 'object' }
          }
        }
      ),

      this.createTool(
        'getCharacter',
        'Get complete character information',
        {
          type: 'object',
          properties: {
            characterId: { type: 'string', description: 'Character ID' }
          },
          required: ['characterId']
        },
        {
          type: 'object',
          properties: {
            character: { type: 'object', description: 'Complete character data' }
          }
        }
      ),

      this.createTool(
        'updateConditionDurations',
        'Update condition durations (called automatically during time passage)',
        {
          type: 'object',
          properties: {
            characterId: { type: 'string', description: 'Character ID' },
            timeUnits: { type: 'number', description: 'Time units passed' }
          },
          required: ['characterId', 'timeUnits']
        },
        {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            expiredConditions: { type: 'array', items: { type: 'string' } }
          }
        }
      )
    ];
  }

  protected async executeToolInternal(name: string, params: any): Promise<any> {
    const tool = this.validateTool(name);
    this.validateParams(params, tool);

    switch (name) {
      case 'getCharacterStats':
        return { stats: this.getCharacterStats(params.characterId) };

      case 'modifyCharacterStats':
        this.modifyCharacterStats(params.characterId, params.changes);
        return { success: true };

      case 'getInventory':
        return this.getInventory(params.characterId);

      case 'equipItem':
        return this.equipItem(params.characterId, params.itemId, params.slot);

      case 'unequipItem':
        return this.unequipItem(params.characterId, params.slot);

      case 'getHealth':
        return this.getHealth(params.characterId);

      case 'modifyHealth':
        return this.modifyHealth(params.characterId, params.amount, params.type);

      case 'addCondition':
        this.addCondition(params.characterId, params.condition);
        return { success: true };

      case 'removeCondition':
        this.removeCondition(params.characterId, params.conditionName);
        return { success: true };

      case 'getConditions':
        return this.getConditions(params.characterId);

      case 'addExperience':
        return this.addExperience(params.characterId, params.amount, params.reason);

      case 'levelUp':
        return this.levelUp(params.characterId, params.statIncreases);

      case 'createCharacter':
        return this.createCharacter(params.characterId, params.name, params.template, params.customStats);

      case 'getCharacter':
        return { character: this.getCharacter(params.characterId) };

      case 'updateConditionDurations':
        return this.updateConditionDurations(params.characterId, params.timeUnits);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  // Character Management
  createCharacter(
    characterId: string, 
    name: string, 
    templateId?: string, 
    customStats?: Partial<CharacterStats>
  ): { success: boolean; character: Character } {
    if (this.characters.has(characterId)) {
      throw new Error(`Character ${characterId} already exists`);
    }

    let template: Partial<Character> = {};
    if (templateId && this.characterTemplates.has(templateId)) {
      template = this.characterTemplates.get(templateId)!;
    }

    const defaultStats: CharacterStats = {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10
    };

    const character: Character = {
      id: characterId,
      name,
      stats: { ...defaultStats, ...template.stats, ...customStats },
      health: {
        current: 20,
        maximum: 20,
        temporary: 0
      },
      equipment: {
        accessories: [],
        consumables: []
      },
      abilities: template.abilities || [],
      conditions: [],
      experience: 0,
      level: 1
    };

    // Calculate health based on constitution
    character.health.maximum = 10 + character.stats.constitution;
    character.health.current = character.health.maximum;

    this.characters.set(characterId, character);
    this.log(`Created character ${characterId}: ${name}`);

    return { success: true, character };
  }

  getCharacter(characterId: string): Character {
    const character = this.characters.get(characterId);
    if (!character) {
      throw new Error(`Character ${characterId} not found`);
    }
    return { ...character }; // Return copy
  }

  // Stats Management
  getCharacterStats(characterId: string): CharacterStats {
    const character = this.getCharacter(characterId);
    return { ...character.stats };
  }

  modifyCharacterStats(characterId: string, changes: Partial<CharacterStats>): void {
    const character = this.characters.get(characterId);
    if (!character) {
      throw new Error(`Character ${characterId} not found`);
    }

    const oldStats = { ...character.stats };
    Object.assign(character.stats, changes);

    // Ensure stats don't go below 1 or above 30
    for (const [key, value] of Object.entries(character.stats)) {
      character.stats[key as keyof CharacterStats] = Math.min(30, Math.max(1, value));
    }

    // Update health maximum if constitution changed
    if (changes.constitution !== undefined) {
      const healthChange = character.stats.constitution - oldStats.constitution;
      character.health.maximum += healthChange;
      character.health.current = Math.min(character.health.current, character.health.maximum);
    }

    this.log(`Modified stats for ${characterId}`, changes);
  }

  // Health Management
  getHealth(characterId: string): HealthInfo {
    const character = this.getCharacter(characterId);
    return { ...character.health };
  }

  modifyHealth(
    characterId: string, 
    amount: number, 
    type: 'healing' | 'damage' | 'temporary'
  ): { success: boolean; newHealth: HealthInfo; unconscious: boolean; dead: boolean } {
    const character = this.characters.get(characterId);
    if (!character) {
      throw new Error(`Character ${characterId} not found`);
    }

    const oldHealth = character.health.current;

    switch (type) {
      case 'healing':
        character.health.current = Math.min(
          character.health.current + amount,
          character.health.maximum
        );
        break;
        
      case 'damage':
        // Remove temporary HP first
        if (character.health.temporary > 0) {
          const tempDamage = Math.min(Math.abs(amount), character.health.temporary);
          character.health.temporary -= tempDamage;
          amount += tempDamage; // Reduce remaining damage
        }
        
        character.health.current = Math.max(0, character.health.current + amount); // amount is negative for damage
        break;
        
      case 'temporary':
        character.health.temporary = Math.max(0, character.health.temporary + amount);
        break;
    }

    const unconscious = character.health.current === 0;
    const dead = character.health.current < -character.stats.constitution; // Death saves would be more complex

    this.log(`${type} ${Math.abs(amount)} for ${characterId}: ${oldHealth} -> ${character.health.current} HP`);

    return {
      success: true,
      newHealth: { ...character.health },
      unconscious,
      dead
    };
  }

  // Equipment Management
  getInventory(characterId: string): string[] {
    const character = this.getCharacter(characterId);
    return [...character.equipment.consumables]; // Return copy of consumables as inventory
  }

  equipItem(
    characterId: string, 
    itemId: string, 
    slot?: 'mainHand' | 'offHand' | 'armor'
  ): { success: boolean; unequipped?: string } {
    const character = this.characters.get(characterId);
    if (!character) {
      throw new Error(`Character ${characterId} not found`);
    }

    // Auto-detect slot if not provided (simplified logic)
    if (!slot) {
      if (itemId.includes('sword') || itemId.includes('axe')) {
        slot = 'mainHand';
      } else if (itemId.includes('armor') || itemId.includes('robe')) {
        slot = 'armor';
      } else {
        slot = 'mainHand'; // Default
      }
    }

    const unequipped = character.equipment[slot];
    character.equipment[slot] = itemId;

    // If something was unequipped, add it to consumables
    if (unequipped) {
      character.equipment.consumables.push(unequipped);
    }

    // Remove item from consumables if it was there
    const consumableIndex = character.equipment.consumables.indexOf(itemId);
    if (consumableIndex !== -1) {
      character.equipment.consumables.splice(consumableIndex, 1);
    }

    this.log(`Equipped ${itemId} in ${slot} slot for ${characterId}`);

    return { success: true, unequipped };
  }

  unequipItem(
    characterId: string, 
    slot: 'mainHand' | 'offHand' | 'armor'
  ): { success: boolean; itemId?: string } {
    const character = this.characters.get(characterId);
    if (!character) {
      throw new Error(`Character ${characterId} not found`);
    }

    const itemId = character.equipment[slot];
    if (!itemId) {
      return { success: false };
    }

    character.equipment[slot] = undefined;
    character.equipment.consumables.push(itemId);

    this.log(`Unequipped ${itemId} from ${slot} slot for ${characterId}`);

    return { success: true, itemId };
  }

  // Condition Management
  addCondition(characterId: string, condition: Condition): void {
    const character = this.characters.get(characterId);
    if (!character) {
      throw new Error(`Character ${characterId} not found`);
    }

    // Remove existing condition with same name
    this.removeCondition(characterId, condition.name);
    
    character.conditions.push({ ...condition });
    this.log(`Added condition ${condition.name} to ${characterId} (duration: ${condition.duration})`);
  }

  removeCondition(characterId: string, conditionName: string): void {
    const character = this.characters.get(characterId);
    if (!character) {
      throw new Error(`Character ${characterId} not found`);
    }

    const index = character.conditions.findIndex(c => c.name === conditionName);
    if (index !== -1) {
      character.conditions.splice(index, 1);
      this.log(`Removed condition ${conditionName} from ${characterId}`);
    }
  }

  getConditions(characterId: string): Condition[] {
    const character = this.getCharacter(characterId);
    return character.conditions.map(c => ({ ...c })); // Return copies
  }

  updateConditionDurations(
    characterId: string, 
    timeUnits: number
  ): { success: boolean; expiredConditions: string[] } {
    const character = this.characters.get(characterId);
    if (!character) {
      throw new Error(`Character ${characterId} not found`);
    }

    const expiredConditions: string[] = [];
    
    for (let i = character.conditions.length - 1; i >= 0; i--) {
      const condition = character.conditions[i];
      condition.duration -= timeUnits;
      
      if (condition.duration <= 0) {
        expiredConditions.push(condition.name);
        character.conditions.splice(i, 1);
      }
    }

    if (expiredConditions.length > 0) {
      this.log(`Expired conditions for ${characterId}:`, expiredConditions);
    }

    return { success: true, expiredConditions };
  }

  // Experience and Leveling
  addExperience(
    characterId: string, 
    amount: number, 
    reason?: string
  ): { success: boolean; levelUp: boolean; newLevel: number } {
    const character = this.characters.get(characterId);
    if (!character) {
      throw new Error(`Character ${characterId} not found`);
    }

    const oldLevel = character.level;
    character.experience += amount;

    // Simple level calculation: 100 XP per level
    const newLevel = Math.floor(character.experience / 100) + 1;
    const levelUp = newLevel > oldLevel;
    
    if (levelUp) {
      character.level = newLevel;
      this.log(`${characterId} gained ${amount} XP ${reason ? `(${reason})` : ''} and leveled up to ${newLevel}!`);
    } else {
      this.log(`${characterId} gained ${amount} XP ${reason ? `(${reason})` : ''}`);
    }

    return { success: true, levelUp, newLevel };
  }

  levelUp(
    characterId: string, 
    statIncreases?: Partial<CharacterStats>
  ): { success: boolean; newLevel: number; newStats: CharacterStats } {
    const character = this.characters.get(characterId);
    if (!character) {
      throw new Error(`Character ${characterId} not found`);
    }

    // Default stat increases if none provided
    if (!statIncreases) {
      statIncreases = {
        strength: 1,
        constitution: 1
      };
    }

    this.modifyCharacterStats(characterId, statIncreases);
    
    this.log(`${characterId} leveled up to ${character.level}!`, statIncreases);

    return {
      success: true,
      newLevel: character.level,
      newStats: { ...character.stats }
    };
  }

  // Data Loading
  private async loadCharacterTemplates(): Promise<void> {
    const templatesPath = path.join(this.gamePath, 'content', 'characters.yaml');
    
    if (!fs.existsSync(templatesPath)) {
      this.warn(`Character templates file not found: ${templatesPath}, using defaults`);
      this.loadDefaultTemplates();
      return;
    }

    try {
      const content = fs.readFileSync(templatesPath, 'utf-8');
      const templatesData = yaml.parse(content);
      
      if (templatesData.templates) {
        for (const template of templatesData.templates) {
          this.characterTemplates.set(template.id, template);
        }
      }
      
      const templateCount = this.characterTemplates.size;
      this.log(`Loaded character templates: ${templateCount} templates`);
      
    } catch (error) {
      this.warn('Failed to load character templates, using defaults');
      this.loadDefaultTemplates();
    }
  }

  private loadDefaultTemplates(): void {
    const defaultTemplates: Partial<Character>[] = [
      {
        id: 'warrior',
        stats: { strength: 15, dexterity: 12, constitution: 14, intelligence: 8, wisdom: 10, charisma: 10 },
        abilities: ['power_attack', 'cleave']
      },
      {
        id: 'rogue',
        stats: { strength: 10, dexterity: 16, constitution: 12, intelligence: 14, wisdom: 12, charisma: 8 },
        abilities: ['sneak_attack', 'lockpicking']
      },
      {
        id: 'mage',
        stats: { strength: 8, dexterity: 10, constitution: 10, intelligence: 16, wisdom: 14, charisma: 12 },
        abilities: ['fireball', 'magic_missile']
      }
    ];

    for (const template of defaultTemplates) {
      this.characterTemplates.set(template.id!, template);
    }
  }

  // Debug Interface Implementation
  protected getCurrentState(): any {
    return {
      characters: this.characters.size,
      templates: this.characterTemplates.size,
      characterList: Array.from(this.characters.keys()),
      templateList: Array.from(this.characterTemplates.keys())
    };
  }

  protected getWarnings(): string[] {
    const warnings: string[] = [];
    
    if (this.characters.size === 0) {
      warnings.push('No characters loaded');
    }
    
    if (this.characterTemplates.size === 0) {
      warnings.push('No character templates loaded');
    }
    
    // Check for characters with critical health
    for (const [id, character] of this.characters) {
      if (character.health.current === 0) {
        warnings.push(`Character ${id} is unconscious`);
      }
      if (character.health.current < 0) {
        warnings.push(`Character ${id} is dying`);
      }
    }
    
    return warnings;
  }
}