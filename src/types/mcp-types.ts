/**
 * Core MCP (Model Context Protocol) Types
 * Shared interfaces for all MCP servers
 */

export interface EntityId {
  id: string;           // "tavern_main" or "generated_shard_001"
  isStatic: boolean;    // Designer-created vs dynamically generated
}

export interface MutationClause {
  shatterable?: boolean;
  combustible?: boolean;
  combines?: string[];        // Can combine with these items
  creates?: string[];         // Templates for created items
  message?: string;          // Explanation if mutation blocked
  preserve?: string[];       // Properties that must persist through mutation
}

export interface Position {
  room: string;
  container?: string;  // Inside another object
  worn?: string;      // Equipped on body part
  coordinates?: {x: number, y: number, z: number}; // For precise positioning
}

export interface GitContext {
  branch: string;
  commit: string;
  message: string;
}

// MCP Tool Definition
export interface MCPTool {
  name: string;
  description: string;
  parameters: any; // JSON Schema
  returns: any;    // JSON Schema
  examples: Example[];
}

export interface Example {
  description: string;
  parameters: any;
  expectedResult: any;
}

// Base MCP Server Interface
export interface MCPServer {
  listTools(): MCPTool[];
  executeTool(name: string, params: any): Promise<any>;
  getServerInfo(): ServerInfo;
}

export interface ServerInfo {
  name: string;
  version: string;
  capabilities: string[];
}

// Debug Support
export interface DebugCapable {
  getDebugInfo(): DebugInfo;
  enableVerboseLogging(enabled: boolean): void;
  getPerformanceMetrics(): PerformanceMetrics;
}

export interface DebugInfo {
  serverName: string;
  lastOperations: Operation[];
  currentState: any;
  warnings: string[];
  generatedEntities?: EntityId[];  // For entity server
  gitBranch?: string;              // For state server
  contextSize?: number;            // For narrative history
}

export interface Operation {
  timestamp: number;
  method: string;
  params: any;
  result: any;
  duration: number;
}

export interface PerformanceMetrics {
  totalOperations: number;
  averageResponseTime: number;
  cacheHitRate?: number;
  memoryUsage: number;
}

// Game Time
export interface GameTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

// Character & NPC Types
export interface PersonalityTraits {
  traits: string[];
  goals: string[];
  fears: string[];
  values: string[];
  secrets?: string[];
}

export interface CharacterStats {
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
}

export interface KnowledgeDomain {
  topic: string;
  expertise: number; // 0-100
  facts: string[];
}

export interface NPCSchedule {
  entries: ScheduleEntry[];
}

export interface ScheduleEntry {
  time: GameTime | 'daily' | 'weekly';
  location: string;
  activity: string;
  priority: number;
}

// Dice & Combat
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
  critical: boolean;
  effects: string[];
  message: string;
}

export interface DamageResult {
  actualDamage: number;
  newHealth: number;
  effects: string[];
  deceased: boolean;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  alternatives?: string[];
}

// Quests & Narrative
export interface Quest {
  id: string;
  name: string;
  description: string;
  objectives: Objective[];
  rewards: Reward[];
  status: 'available' | 'active' | 'completed' | 'failed';
  timeLimit?: number;
}

export interface Objective {
  id: string;
  description: string;
  completed: boolean;
  progress?: number;
  maxProgress?: number;
}

export interface Reward {
  type: 'item' | 'experience' | 'money' | 'reputation';
  amount: number;
  data?: any;
}

export interface NarrativeContext {
  currentTension: number;  // 0-10
  recentEvents: string[];
  activeThreats: string[];
  opportunities: string[];
  mood: string;
}

export interface Scene {
  id: string;
  name: string;
  description: string;
  participants: string[];
  location: string;
  mood: string;
}

export interface Dialogue {
  timestamp: number;
  speaker: string;
  text: string;
  emotion?: string;
  actions?: string[];
}

// Memory & Relationships
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
  trust: number;        // -100 to 100
  affection: number;    // -100 to 100  
  respect: number;      // -100 to 100
  fear: number;         // 0 to 100
  history: string[];    // Key events
  lastInteraction: number;
}

export interface Knowledge {
  fact: string;
  source: string;
  confidence: number; // 0-100
  timestamp: number;
}

export interface SocialGraph {
  center: string;
  connections: SocialConnection[];
}

export interface SocialConnection {
  target: string;
  relationship: Relationship;
  distance: number; // Degrees of separation
}

// Time & Events
export interface TimeRange {
  start: GameTime;
  end: GameTime;
}

export interface ScheduledEvent {
  id: string;
  time: GameTime;
  type: string;
  data: any;
  recurring?: RecurrenceRule;
}

export interface RecurrenceRule {
  pattern: 'daily' | 'weekly' | 'monthly';
  interval?: number;
  until?: GameTime;
}

export interface TimeAdvanceResult {
  events: ScheduledEvent[];
  npcMovements: NPCMovement[];
  environmentChanges: Record<string, any>;
}

export interface NPCMovement {
  npc: string;
  from: Position;
  to: Position;
  reason: string;
}

export interface Weather {
  condition: 'clear' | 'cloudy' | 'rain' | 'storm' | 'snow';
  temperature: number;
  windSpeed: number;
  visibility: number;
}

// State Management
export interface WorldState {
  currentRoom: string;
  party: string[];
  worldTime: GameTime;
  flags: Record<string, any>;
  dynamicEntities: EntityId[];
}

export interface Commit {
  hash: string;
  branch: string;
  message: string;
  timestamp: number;
  changes: StateDiff;
}

export interface StateDiff {
  added: Record<string, any>;
  modified: Record<string, any>;
  removed: string[];
}

// Trigger System
export interface TriggerContext {
  location: string;
  participants: string[];
  recentActions: string[];
  worldState: Record<string, any>;
}

export interface Trigger {
  id: string;
  condition: string;
  action: string;
  priority: number;
  oneTime: boolean;
}