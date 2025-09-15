import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';

interface Monster {
  name: string;
  type: string;
  subtype?: string;
  size: string;
  alignment: string;
  challenge_rating: string | number;
  experience: number;
  stats: {
    armor_class: number;
    hit_points: number;
    hit_dice: string;
    speed: Record<string, number | boolean>;
  };
  ability_scores: {
    strength: number;
    dexterity: number;
    constitution: number;
    intelligence: number;
    wisdom: number;
    charisma: number;
  };
  skills?: Record<string, number>;
  saving_throws?: Record<string, number>;
  damage_resistances?: string[];
  damage_immunities?: string[];
  condition_immunities?: string[];
  senses: Record<string, number>;
  languages: string[];
  traits?: Record<string, any>;
  actions: Record<string, any>;
  legendary_actions?: number;
  lair_actions?: boolean;
  habitat?: string[];
  tactics?: string;
  organization?: string;
  loot?: any[];
  legendary?: boolean;
}

interface EncounterQuery {
  partyLevel: number;
  partySize: number;
  difficulty: 'easy' | 'medium' | 'hard' | 'deadly';
  environment?: string;
  story_context?: string;
}

interface MonsterSearchQuery {
  challenge_rating?: string | number;
  creature_type?: string[];
  environment?: string[];
  tactics?: string;
  monster_role?: string;
  faction?: string;
  max_results?: number;
}

class MonsterContentMCP {
  private server: Server;
  private monsters: Map<string, Monster> = new Map();
  private encounterTables: any = null;
  private monstersPath: string;
  private encounterTablesPath: string;

  constructor() {
    this.server = new Server(
      {
        name: 'monster-content-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.monstersPath = process.env.MONSTERS_PATH || './content/monsters.yaml';
    this.encounterTablesPath = process.env.ENCOUNTER_TABLES_PATH || './content/encounter-tables.yaml';
    
    this.setupToolHandlers();
    this.loadContent();
  }

  private async loadContent(): Promise<void> {
    try {
      // Load monsters
      if (fs.existsSync(this.monstersPath)) {
        const monstersContent = fs.readFileSync(this.monstersPath, 'utf8');
        const monstersData = yaml.load(monstersContent) as any;
        
        if (monstersData.monsters) {
          for (const [key, monster] of Object.entries(monstersData.monsters)) {
            this.monsters.set(key, monster as Monster);
          }
        }
        
        console.log(`Loaded ${this.monsters.size} monsters from ${this.monstersPath}`);
      }

      // Load encounter tables
      if (fs.existsSync(this.encounterTablesPath)) {
        const tablesContent = fs.readFileSync(this.encounterTablesPath, 'utf8');
        this.encounterTables = yaml.load(tablesContent);
        console.log(`Loaded encounter tables from ${this.encounterTablesPath}`);
      }
    } catch (error) {
      console.error('Error loading monster content:', error);
    }
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'find_encounters',
          description: 'Find appropriate monsters for an encounter based on party level, size, and difficulty',
          inputSchema: {
            type: 'object',
            properties: {
              partyLevel: { type: 'number', description: 'Average party level' },
              partySize: { type: 'number', description: 'Number of characters in party' },
              difficulty: { 
                type: 'string', 
                enum: ['easy', 'medium', 'hard', 'deadly'],
                description: 'Desired encounter difficulty'
              },
              environment: { type: 'string', description: 'Environment type (forest, dungeon, etc.)' },
              story_context: { type: 'string', description: 'Narrative context (ambush, investigation, etc.)' }
            },
            required: ['partyLevel', 'partySize', 'difficulty']
          }
        },
        {
          name: 'search_monsters',
          description: 'Search for monsters by various criteria',
          inputSchema: {
            type: 'object',
            properties: {
              challenge_rating: { type: ['string', 'number'], description: 'Challenge rating (e.g., "1/4", 5)' },
              creature_type: { 
                type: 'array', 
                items: { type: 'string' },
                description: 'Creature types (humanoid, dragon, undead, etc.)'
              },
              environment: {
                type: 'array',
                items: { type: 'string' },
                description: 'Environments (forest, underdark, urban, etc.)'
              },
              tactics: { type: 'string', description: 'Combat tactics (ambush, artillery, brute_force, etc.)' },
              monster_role: { 
                type: 'string',
                enum: ['minion', 'soldier', 'brute', 'artillery', 'controller', 'leader', 'solo'],
                description: 'Monster role in combat'
              },
              faction: { type: 'string', description: 'Associated faction' },
              max_results: { type: 'number', description: 'Maximum number of results' }
            }
          }
        },
        {
          name: 'get_monster',
          description: 'Get complete details for a specific monster',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Monster name' }
            },
            required: ['name']
          }
        },
        {
          name: 'build_encounter',
          description: 'Build a complete encounter from a template',
          inputSchema: {
            type: 'object',
            properties: {
              template: { type: 'string', description: 'Encounter template name' },
              partyLevel: { type: 'number', description: 'Party level for scaling' },
              partySize: { type: 'number', description: 'Party size for scaling' },
              modifications: {
                type: 'array',
                items: { type: 'object' },
                description: 'Encounter modifications'
              }
            },
            required: ['template', 'partyLevel', 'partySize']
          }
        },
        {
          name: 'get_monster_tactics',
          description: 'Get tactical information and combat strategies for monsters',
          inputSchema: {
            type: 'object',
            properties: {
              monsters: {
                type: 'array',
                items: { type: 'string' },
                description: 'List of monster names'
              },
              encounter_type: { type: 'string', description: 'Type of encounter' }
            },
            required: ['monsters']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'find_encounters':
            return await this.findEncounters(args as EncounterQuery);
          
          case 'search_monsters':
            return await this.searchMonsters(args as MonsterSearchQuery);
          
          case 'get_monster':
            return await this.getMonster(args.name as string);
          
          case 'build_encounter':
            return await this.buildEncounter(args);
          
          case 'get_monster_tactics':
            return await this.getMonsterTactics(args);

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Error in ${name}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });
  }

  private async findEncounters(query: EncounterQuery): Promise<any> {
    const { partyLevel, partySize, difficulty, environment, story_context } = query;
    
    // Get appropriate CR range for this party level and difficulty
    const crRange = this.getCRRangeForEncounter(partyLevel, difficulty);
    
    // Filter monsters by CR and environment
    const candidates = Array.from(this.monsters.entries())
      .filter(([_, monster]) => {
        // Check CR
        const cr = this.normalizeCR(monster.challenge_rating);
        if (!crRange.includes(cr)) return false;
        
        // Check environment
        if (environment && monster.habitat) {
          if (!monster.habitat.includes(environment)) return false;
        }
        
        return true;
      })
      .map(([key, monster]) => ({ key, monster }));

    // Score and rank candidates
    const scoredCandidates = candidates.map(({ key, monster }) => ({
      key,
      monster,
      score: this.scoreMonsterForEncounter(monster, query)
    }));

    scoredCandidates.sort((a, b) => b.score - a.score);

    // Return top candidates with encounter suggestions
    const results = scoredCandidates.slice(0, 5).map(({ key, monster }) => ({
      name: key,
      challenge_rating: monster.challenge_rating,
      type: monster.type,
      size: monster.size,
      tactics: monster.tactics,
      habitat: monster.habitat,
      encounter_notes: this.generateEncounterNotes(monster, query)
    }));

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          query: query,
          recommendations: results,
          notes: `Found ${results.length} suitable encounters for level ${partyLevel} party`
        }, null, 2)
      }]
    };
  }

  private async searchMonsters(query: MonsterSearchQuery): Promise<any> {
    let results = Array.from(this.monsters.entries());

    // Apply filters
    if (query.challenge_rating !== undefined) {
      const targetCR = this.normalizeCR(query.challenge_rating);
      results = results.filter(([_, monster]) => 
        this.normalizeCR(monster.challenge_rating) === targetCR
      );
    }

    if (query.creature_type) {
      results = results.filter(([_, monster]) =>
        query.creature_type!.includes(monster.type)
      );
    }

    if (query.environment) {
      results = results.filter(([_, monster]) =>
        monster.habitat && query.environment!.some(env =>
          monster.habitat!.includes(env)
        )
      );
    }

    if (query.faction) {
      results = results.filter(([_, monster]) =>
        monster.organization === query.faction
      );
    }

    // Limit results
    const maxResults = query.max_results || 10;
    const limitedResults = results.slice(0, maxResults);

    const searchResults = limitedResults.map(([key, monster]) => ({
      name: key,
      display_name: monster.name,
      challenge_rating: monster.challenge_rating,
      type: monster.type,
      size: monster.size,
      alignment: monster.alignment,
      habitat: monster.habitat,
      tactics: monster.tactics
    }));

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          query: query,
          count: searchResults.length,
          results: searchResults
        }, null, 2)
      }]
    };
  }

  private async getMonster(name: string): Promise<any> {
    const monster = this.monsters.get(name);
    if (!monster) {
      throw new McpError(ErrorCode.InvalidRequest, `Monster '${name}' not found`);
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          name: name,
          monster: monster
        }, null, 2)
      }]
    };
  }

  private async buildEncounter(args: any): Promise<any> {
    const { template, partyLevel, partySize } = args;
    
    if (!this.encounterTables?.encounter_templates?.[template]) {
      throw new McpError(ErrorCode.InvalidRequest, `Encounter template '${template}' not found`);
    }

    const encounterTemplate = this.encounterTables.encounter_templates[template];
    
    // Scale encounter for party
    const scaledEncounter = {
      ...encounterTemplate,
      scaled_for: {
        party_level: partyLevel,
        party_size: partySize
      },
      monsters: encounterTemplate.monsters.map((monsterEntry: any) => ({
        ...monsterEntry,
        quantity: this.scaleQuantity(monsterEntry.quantity, partySize)
      }))
    };

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(scaledEncounter, null, 2)
      }]
    };
  }

  private async getMonsterTactics(args: any): Promise<any> {
    const { monsters, encounter_type } = args;
    
    const tacticsInfo = monsters.map((monsterName: string) => {
      const monster = this.monsters.get(monsterName);
      if (!monster) return null;

      return {
        name: monsterName,
        tactics: monster.tactics,
        preferred_range: this.getPreferredRange(monster),
        special_abilities: this.extractSpecialAbilities(monster),
        weaknesses: this.identifyWeaknesses(monster),
        synergies: this.findSynergies(monster, monsters)
      };
    }).filter(Boolean);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          encounter_type: encounter_type,
          monster_tactics: tacticsInfo,
          overall_strategy: this.generateOverallStrategy(tacticsInfo)
        }, null, 2)
      }]
    };
  }

  // Helper methods
  private getCRRangeForEncounter(partyLevel: number, difficulty: string): string[] {
    const levelRanges = this.encounterTables?.level_appropriate_encounters;
    if (!levelRanges) return [];

    let levelKey = 'level_1';
    if (partyLevel >= 2 && partyLevel <= 3) levelKey = 'level_2-3';
    else if (partyLevel >= 4 && partyLevel <= 5) levelKey = 'level_4-5';
    else if (partyLevel >= 6 && partyLevel <= 10) levelKey = 'level_6-10';
    else if (partyLevel >= 11 && partyLevel <= 15) levelKey = 'level_11-15';
    else if (partyLevel >= 16) levelKey = 'level_16-20';

    return levelRanges[levelKey]?.[difficulty] || [];
  }

  private normalizeCR(cr: string | number): string {
    if (typeof cr === 'number') return cr.toString();
    return cr.toString();
  }

  private scoreMonsterForEncounter(monster: Monster, query: EncounterQuery): number {
    let score = 100;

    // Environment match bonus
    if (query.environment && monster.habitat?.includes(query.environment)) {
      score += 20;
    }

    // Story context match
    if (query.story_context && monster.tactics?.includes(query.story_context)) {
      score += 15;
    }

    // Variety bonus (prefer less common creature types)
    if (monster.type !== 'humanoid') {
      score += 10;
    }

    return score;
  }

  private generateEncounterNotes(monster: Monster, query: EncounterQuery): string {
    const notes = [];
    
    if (monster.tactics) {
      notes.push(`Tactics: ${monster.tactics}`);
    }
    
    if (monster.legendary) {
      notes.push('Legendary creature - suitable as solo boss');
    }
    
    if (monster.lair_actions) {
      notes.push('Has lair actions when fought in its lair');
    }

    return notes.join('. ');
  }

  private scaleQuantity(quantity: string, partySize: number): string {
    // Simple scaling logic - could be more sophisticated
    if (partySize > 4) {
      return quantity.replace(/(\d+)d(\d+)(\+\d+)?/, (match, dice, sides, mod) => {
        const newDice = Math.ceil(parseInt(dice) * (partySize / 4));
        return `${newDice}d${sides}${mod || ''}`;
      });
    }
    return quantity;
  }

  private getPreferredRange(monster: Monster): string {
    if (monster.actions?.bite || monster.actions?.claw) return 'melee';
    if (monster.actions?.longbow || monster.actions?.crossbow) return 'ranged';
    return 'flexible';
  }

  private extractSpecialAbilities(monster: Monster): string[] {
    const abilities = [];
    if (monster.traits) {
      abilities.push(...Object.keys(monster.traits));
    }
    return abilities;
  }

  private identifyWeaknesses(monster: Monster): string[] {
    const weaknesses = [];
    
    if (!monster.damage_resistances?.includes('fire')) {
      weaknesses.push('vulnerable to fire');
    }
    
    if (monster.senses?.darkvision && !monster.senses?.blindsight) {
      weaknesses.push('relies on sight');
    }
    
    return weaknesses;
  }

  private findSynergies(monster: Monster, allMonsters: string[]): string[] {
    // Simple synergy detection
    const synergies = [];
    
    if (monster.traits?.pack_tactics) {
      synergies.push('benefits from pack tactics with other monsters');
    }
    
    return synergies;
  }

  private generateOverallStrategy(tacticsInfo: any[]): string {
    if (tacticsInfo.length === 1) {
      return 'Single creature encounter - use environment and positioning';
    }
    
    const hasRanged = tacticsInfo.some(t => t.preferred_range === 'ranged');
    const hasMelee = tacticsInfo.some(t => t.preferred_range === 'melee');
    
    if (hasRanged && hasMelee) {
      return 'Mixed tactics - ranged creatures provide cover while melee advances';
    }
    
    return 'Coordinate attacks and use special abilities for maximum effect';
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log('Monster Content MCP server running on stdio');
  }
}

const server = new MonsterContentMCP();
server.run().catch(console.error);