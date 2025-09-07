export interface EntityId {
  id: string;
  isStatic: boolean;
}

export interface MutationClause {
  shatterable?: boolean;
  combustible?: boolean;
  combines?: string[];
  creates?: string[];
  message?: string;
  preserve?: string[];
}

export interface Position {
  room: string;
  container?: string;
  worn?: string;
  coordinates?: { x: number; y: number; z: number };
}

export interface GitContext {
  branch: string;
  commit: string;
  message: string;
}

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

export interface PersonalityTraits {
  traits: string[];
  goals: string[];
  fears: string[];
  values: string[];
  secrets?: string[];
}

export interface CharacterStats {
  health: number;
  maxHealth: number;
  strength?: number;
  dexterity?: number;
  intelligence?: number;
  wisdom?: number;
  charisma?: number;
  [key: string]: number | undefined;
}

export interface KnowledgeDomain {
  topic: string;
  expertise: number;
  facts: string[];
}

export interface NPCSchedule {
  [time: string]: {
    location: string;
    activity: string;
  };
}

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

export interface GameTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export interface Memory {
  id: string;
  timestamp: number;
  type: string;
  content: any;
  importance: number;
  emotionalValence?: number;
  associations: string[];
}

export interface Relationship {
  trust: number;
  affection: number;
  respect: number;
  fear: number;
  history: string[];
  lastInteraction: number;
}