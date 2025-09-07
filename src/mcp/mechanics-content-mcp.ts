/**
 * Mechanics Content MCP Server
 * Handles game rules, dice rolls, and action resolution
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { BaseMCPServer } from './base-mcp-server';
import { MCPTool } from '../types/mcp-types';

export interface DiceResult {
  rolls: number[];
  modifier: number;
  total: number;
  critical?: boolean;
  fumble?: boolean;
}

export interface SkillCheckResult {
  success: boolean;
  degree: 'critical_failure' | 'failure' | 'success' | 'critical_success';
  roll: DiceResult;
  difficulty: number;
  margin: number;
}

export interface CombatResult {
  hit: boolean;
  damage: number;
  critical?: boolean;
  effects?: string[];
  message: string;
}

export interface DamageResult {
  damageTaken: number;
  remainingHealth: number;
  effects?: string[];
  unconscious?: boolean;
  dead?: boolean;
}

export interface ValidationResult {
  allowed: boolean;
  reason?: string;
  requirements?: string[];
}

export interface RuleDefinition {
  category: string;
  name: string;
  description: string;
  mechanics: Record<string, any>;
}

export interface SkillDefinition {
  name: string;
  attribute: string;
  description: string;
  difficulty: {
    trivial: number;
    easy: number;
    medium: number;
    hard: number;
    extreme: number;
  };
}

export class MechanicsContentMCP extends BaseMCPServer {
  private rules: Map<string, RuleDefinition[]> = new Map();
  private skills: Map<string, SkillDefinition> = new Map();
  private gamePath: string;

  constructor(gamePath: string) {
    super('mechanics-content-mcp', '1.0.0', ['dice-rolling', 'skill-checks', 'combat', 'rule-validation']);
    this.gamePath = gamePath;
  }

  async initialize(): Promise<void> {
    try {
      await this.loadRules();
      await this.loadSkills();
      this.log('Mechanics Content MCP initialized', {
        ruleCategories: this.rules.size,
        skills: this.skills.size
      });
    } catch (error) {
      this.handleError('initialization failed', error);
    }
  }

  listTools(): MCPTool[] {
    return [
      this.createTool(
        'roll',
        'Roll dice with standard notation',
        {
          type: 'object',
          properties: {
            dice: { 
              type: 'string', 
              description: 'Dice notation (e.g. "3d6+2", "1d20", "2d8-1")',
              pattern: '^\\d*d\\d+([-+]\\d+)?$'
            }
          },
          required: ['dice']
        },
        {
          type: 'object',
          properties: {
            rolls: { type: 'array', items: { type: 'number' } },
            modifier: { type: 'number' },
            total: { type: 'number' },
            critical: { type: 'boolean' },
            fumble: { type: 'boolean' }
          }
        },
        [{
          description: 'Roll 3d6+2',
          parameters: { dice: '3d6+2' },
          expectedResult: { rolls: [4, 2, 5], modifier: 2, total: 13 }
        }]
      ),

      this.createTool(
        'rollWithAdvantage',
        'Roll dice with advantage or disadvantage',
        {
          type: 'object',
          properties: {
            dice: { type: 'string', description: 'Dice notation' },
            type: { 
              type: 'string', 
              enum: ['advantage', 'disadvantage'],
              description: 'Advantage type'
            }
          },
          required: ['dice', 'type']
        },
        {
          type: 'object',
          properties: {
            rolls: { type: 'array', items: { type: 'number' } },
            modifier: { type: 'number' },
            total: { type: 'number' },
            advantageRolls: { type: 'array', items: { type: 'number' } }
          }
        }
      ),

      this.createTool(
        'performSkillCheck',
        'Perform a skill check against difficulty',
        {
          type: 'object',
          properties: {
            character: { type: 'string', description: 'Character ID' },
            skill: { type: 'string', description: 'Skill name' },
            difficulty: { type: 'number', description: 'Difficulty class' },
            modifiers: { 
              type: 'object', 
              description: 'Additional modifiers',
              additionalProperties: { type: 'number' }
            }
          },
          required: ['character', 'skill', 'difficulty']
        },
        {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            degree: { type: 'string', enum: ['critical_failure', 'failure', 'success', 'critical_success'] },
            roll: { type: 'object' },
            difficulty: { type: 'number' },
            margin: { type: 'number' }
          }
        }
      ),

      this.createTool(
        'resolveAttack',
        'Resolve combat attack',
        {
          type: 'object',
          properties: {
            attacker: { type: 'string', description: 'Attacker ID' },
            defender: { type: 'string', description: 'Defender ID' },
            weapon: { type: 'string', description: 'Weapon ID (optional)' },
            type: { 
              type: 'string', 
              enum: ['melee', 'ranged', 'spell'],
              description: 'Attack type'
            }
          },
          required: ['attacker', 'defender', 'type']
        },
        {
          type: 'object',
          properties: {
            hit: { type: 'boolean' },
            damage: { type: 'number' },
            critical: { type: 'boolean' },
            effects: { type: 'array', items: { type: 'string' } },
            message: { type: 'string' }
          }
        }
      ),

      this.createTool(
        'applyDamage',
        'Apply damage to target',
        {
          type: 'object',
          properties: {
            target: { type: 'string', description: 'Target character ID' },
            amount: { type: 'number', description: 'Damage amount' },
            type: { type: 'string', description: 'Damage type (slashing, piercing, etc.)' },
            source: { type: 'string', description: 'Damage source (optional)' }
          },
          required: ['target', 'amount', 'type']
        },
        {
          type: 'object',
          properties: {
            damageTaken: { type: 'number' },
            remainingHealth: { type: 'number' },
            effects: { type: 'array', items: { type: 'string' } },
            unconscious: { type: 'boolean' },
            dead: { type: 'boolean' }
          }
        }
      ),

      this.createTool(
        'canPerformAction',
        'Check if character can perform action',
        {
          type: 'object',
          properties: {
            actor: { type: 'string', description: 'Actor character ID' },
            action: { type: 'string', description: 'Action name' },
            target: { type: 'string', description: 'Target (optional)' },
            context: { 
              type: 'object', 
              description: 'Action context',
              additionalProperties: true
            }
          },
          required: ['actor', 'action']
        },
        {
          type: 'object',
          properties: {
            allowed: { type: 'boolean' },
            reason: { type: 'string' },
            requirements: { type: 'array', items: { type: 'string' } }
          }
        }
      ),

      this.createTool(
        'getRuleSet',
        'Get rules for a category',
        {
          type: 'object',
          properties: {
            category: { type: 'string', description: 'Rule category' }
          },
          required: ['category']
        },
        {
          type: 'array',
          items: { type: 'object', description: 'Rule definitions' }
        }
      ),

      this.createTool(
        'getSkillDefinition',
        'Get skill definition',
        {
          type: 'object',
          properties: {
            skill: { type: 'string', description: 'Skill name' }
          },
          required: ['skill']
        },
        {
          type: 'object',
          properties: {
            name: { type: 'string' },
            attribute: { type: 'string' },
            description: { type: 'string' },
            difficulty: { type: 'object' }
          }
        }
      )
    ];
  }

  protected async executeToolInternal(name: string, params: any): Promise<any> {
    const tool = this.validateTool(name);
    this.validateParams(params, tool);

    switch (name) {
      case 'roll':
        return this.roll(params.dice);

      case 'rollWithAdvantage':
        return this.rollWithAdvantage(params.dice, params.type);

      case 'performSkillCheck':
        return this.performSkillCheck(params);

      case 'resolveAttack':
        return this.resolveAttack(params);

      case 'applyDamage':
        return this.applyDamage(params);

      case 'canPerformAction':
        return this.canPerformAction(params);

      case 'getRuleSet':
        return this.getRuleSet(params.category);

      case 'getSkillDefinition':
        return { skill: this.getSkillDefinition(params.skill) };

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  // Dice Operations
  roll(dice: string): DiceResult {
    const dicePattern = /^(\d*)d(\d+)([-+]\d+)?$/;
    const match = dice.match(dicePattern);
    
    if (!match) {
      throw new Error(`Invalid dice notation: ${dice}`);
    }

    const count = parseInt(match[1]) || 1;
    const sides = parseInt(match[2]);
    const modifier = parseInt(match[3]) || 0;

    if (count > 100) {
      throw new Error('Too many dice (max 100)');
    }
    if (sides < 2 || sides > 100) {
      throw new Error('Invalid die size (must be 2-100)');
    }

    const rolls: number[] = [];
    for (let i = 0; i < count; i++) {
      rolls.push(Math.floor(Math.random() * sides) + 1);
    }

    const rollSum = rolls.reduce((sum, roll) => sum + roll, 0);
    const total = rollSum + modifier;

    // Detect criticals and fumbles for d20 systems
    const critical = sides === 20 && rolls.some(r => r === 20);
    const fumble = sides === 20 && rolls.some(r => r === 1) && rolls.length === 1;

    const rollsStr = rolls.join(', ');
    this.log(`Rolled ${dice}: [${rollsStr}] + ${modifier} = ${total}${critical ? ' (CRITICAL!)' : ''}${fumble ? ' (FUMBLE!)' : ''}`);

    return {
      rolls,
      modifier,
      total,
      critical,
      fumble
    };
  }

  rollWithAdvantage(dice: string, type: 'advantage' | 'disadvantage'): DiceResult {
    const firstRoll = this.roll(dice);
    const secondRoll = this.roll(dice);

    let advantageRolls = [firstRoll.total, secondRoll.total];
    let selectedRoll: DiceResult;

    if (type === 'advantage') {
      selectedRoll = firstRoll.total >= secondRoll.total ? firstRoll : secondRoll;
    } else {
      selectedRoll = firstRoll.total <= secondRoll.total ? firstRoll : secondRoll;
    }

    this.log(`Rolled ${dice} with ${type}: [${firstRoll.total}, ${secondRoll.total}] -> ${selectedRoll.total}`);

    return {
      ...selectedRoll,
      advantageRolls
    } as DiceResult & { advantageRolls: number[] };
  }

  // Skill Checks
  performSkillCheck(params: {
    character: string;
    skill: string;
    difficulty: number;
    modifiers?: Record<string, number>;
  }): SkillCheckResult {
    const skillDef = this.getSkillDefinition(params.skill);
    if (!skillDef) {
      throw new Error(`Unknown skill: ${params.skill}`);
    }

    // Calculate total modifier
    let totalModifier = 0;
    if (params.modifiers) {
      totalModifier = Object.values(params.modifiers).reduce((sum, mod) => sum + mod, 0);
    }

    // Roll d20 + modifiers
    const baseRoll = this.roll('1d20');
    const modifiedTotal = baseRoll.total + totalModifier;
    
    const success = modifiedTotal >= params.difficulty;
    const margin = modifiedTotal - params.difficulty;
    
    let degree: SkillCheckResult['degree'];
    if (baseRoll.fumble) {
      degree = 'critical_failure';
    } else if (baseRoll.critical && success) {
      degree = 'critical_success';
    } else if (success) {
      degree = 'success';
    } else {
      degree = 'failure';
    }

    this.log(`Skill check ${params.skill} for ${params.character}: ${modifiedTotal} vs DC ${params.difficulty} (${degree})`);

    return {
      success,
      degree,
      roll: { ...baseRoll, total: modifiedTotal },
      difficulty: params.difficulty,
      margin
    };
  }

  // Combat Resolution
  resolveAttack(params: {
    attacker: string;
    defender: string;
    weapon?: string;
    type: 'melee' | 'ranged' | 'spell';
  }): CombatResult {
    // Simplified combat resolution - would integrate with character stats in full implementation
    const attackRoll = this.roll('1d20');
    const hit = attackRoll.total >= 12; // Simple AC 12 for demo
    
    let damage = 0;
    let effects: string[] = [];
    
    if (hit) {
      // Simple damage based on attack type
      switch (params.type) {
        case 'melee':
          damage = this.roll('1d6+2').total;
          break;
        case 'ranged':
          damage = this.roll('1d6+1').total;
          break;
        case 'spell':
          damage = this.roll('1d8+3').total;
          effects.push('magical');
          break;
      }
    }

    const message = hit 
      ? `${params.attacker} hits ${params.defender} for ${damage} damage!`
      : `${params.attacker} misses ${params.defender}!`;

    this.log(`Combat: ${message}`);

    return {
      hit,
      damage,
      critical: attackRoll.critical,
      effects,
      message
    };
  }

  applyDamage(params: {
    target: string;
    amount: number;
    type: string;
    source?: string;
  }): DamageResult {
    // Simplified damage application - would integrate with character state in full implementation
    const damageTaken = Math.max(0, params.amount);
    
    // For demo, assume characters start with 20 HP
    const currentHealth = 20; // Would get from character state
    const remainingHealth = Math.max(0, currentHealth - damageTaken);
    
    const unconscious = remainingHealth === 0;
    const dead = false; // Would implement death saves

    this.log(`Applied ${damageTaken} ${params.type} damage to ${params.target}. Remaining HP: ${remainingHealth}`);

    return {
      damageTaken,
      remainingHealth,
      unconscious,
      dead
    };
  }

  // Action Validation
  canPerformAction(params: {
    actor: string;
    action: string;
    target?: string;
    context?: Record<string, any>;
  }): ValidationResult {
    // Basic action validation - would be much more complex in full implementation
    const forbiddenActions = ['cheat', 'break_game', 'admin'];
    
    if (forbiddenActions.includes(params.action)) {
      return {
        allowed: false,
        reason: 'Action not permitted'
      };
    }

    // Check basic requirements
    const requirements: string[] = [];
    
    switch (params.action) {
      case 'cast_spell':
        requirements.push('Must have spell prepared');
        requirements.push('Must have spell components');
        break;
      case 'sneak_attack':
        requirements.push('Must be hidden or have advantage');
        break;
      case 'drink_potion':
        requirements.push('Must have potion in inventory');
        break;
    }

    return {
      allowed: true,
      requirements
    };
  }

  // Rule and Skill Management
  getRuleSet(category: string): RuleDefinition[] {
    return this.rules.get(category) || [];
  }

  getSkillDefinition(skill: string): SkillDefinition | null {
    return this.skills.get(skill) || null;
  }

  // Data Loading
  private async loadRules(): Promise<void> {
    const rulesPath = path.join(this.gamePath, 'content', 'rules.yaml');
    
    if (!fs.existsSync(rulesPath)) {
      this.warn(`Rules file not found: ${rulesPath}, using defaults`);
      this.loadDefaultRules();
      return;
    }

    try {
      const content = fs.readFileSync(rulesPath, 'utf-8');
      const rulesData = yaml.parse(content);
      
      if (rulesData.rules) {
        for (const rule of rulesData.rules) {
          if (!this.rules.has(rule.category)) {
            this.rules.set(rule.category, []);
          }
          this.rules.get(rule.category)!.push(rule);
        }
      }
      
      const ruleCount = this.rules.size;
      this.log(`Loaded rules: ${ruleCount} categories`);
      
    } catch (error) {
      this.warn('Failed to load rules, using defaults');
      this.loadDefaultRules();
    }
  }

  private async loadSkills(): Promise<void> {
    const skillsPath = path.join(this.gamePath, 'content', 'skills.yaml');
    
    if (!fs.existsSync(skillsPath)) {
      this.warn(`Skills file not found: ${skillsPath}, using defaults`);
      this.loadDefaultSkills();
      return;
    }

    try {
      const content = fs.readFileSync(skillsPath, 'utf-8');
      const skillsData = yaml.parse(content);
      
      if (skillsData.skills) {
        for (const skill of skillsData.skills) {
          this.skills.set(skill.name, skill);
        }
      }
      
      const skillCount = this.skills.size;
      this.log(`Loaded skills: ${skillCount} skills`);
      
    } catch (error) {
      this.warn('Failed to load skills, using defaults');
      this.loadDefaultSkills();
    }
  }

  private loadDefaultRules(): void {
    const defaultRules: RuleDefinition[] = [
      {
        category: 'combat',
        name: 'attack_roll',
        description: 'Standard attack roll mechanics',
        mechanics: {
          die: 'd20',
          target: 'armor_class',
          modifiers: ['attribute', 'proficiency', 'situational']
        }
      },
      {
        category: 'skill_checks',
        name: 'ability_check',
        description: 'Standard ability check mechanics',
        mechanics: {
          die: 'd20',
          target: 'difficulty_class',
          modifiers: ['attribute', 'proficiency', 'situational']
        }
      }
    ];

    for (const rule of defaultRules) {
      if (!this.rules.has(rule.category)) {
        this.rules.set(rule.category, []);
      }
      this.rules.get(rule.category)!.push(rule);
    }
  }

  private loadDefaultSkills(): void {
    const defaultSkills: SkillDefinition[] = [
      {
        name: 'stealth',
        attribute: 'dexterity',
        description: 'Move quietly and remain hidden',
        difficulty: { trivial: 5, easy: 10, medium: 15, hard: 20, extreme: 25 }
      },
      {
        name: 'persuasion',
        attribute: 'charisma',
        description: 'Convince others through reason and charm',
        difficulty: { trivial: 5, easy: 10, medium: 15, hard: 20, extreme: 25 }
      },
      {
        name: 'perception',
        attribute: 'wisdom',
        description: 'Notice details in your environment',
        difficulty: { trivial: 5, easy: 10, medium: 15, hard: 20, extreme: 25 }
      },
      {
        name: 'investigation',
        attribute: 'intelligence',
        description: 'Search for clues and analyze evidence',
        difficulty: { trivial: 5, easy: 10, medium: 15, hard: 20, extreme: 25 }
      }
    ];

    for (const skill of defaultSkills) {
      this.skills.set(skill.name, skill);
    }
  }

  // Debug Interface Implementation
  protected getCurrentState(): any {
    return {
      ruleCategories: this.rules.size,
      skills: this.skills.size,
      loadedRules: Array.from(this.rules.keys()),
      loadedSkills: Array.from(this.skills.keys())
    };
  }

  protected getWarnings(): string[] {
    const warnings: string[] = [];
    
    if (this.rules.size === 0) {
      warnings.push('No game rules loaded');
    }
    
    if (this.skills.size === 0) {
      warnings.push('No skills loaded');
    }
    
    return warnings;
  }
}