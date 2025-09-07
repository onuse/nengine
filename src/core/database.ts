import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

export class DatabaseManager {
  private db: Database.Database;
  private dataDir: string;

  constructor(dataDir: string = './data') {
    this.dataDir = dataDir;
    
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const dbPath = path.join(dataDir, 'nengine.db');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initializeTables();
  }

  private initializeTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        exits TEXT,
        properties TEXT,
        mutations TEXT,
        hidden_exits TEXT,
        is_static BOOLEAN DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS npcs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        personality TEXT,
        stats TEXT,
        knowledge TEXT,
        schedule TEXT,
        mutations TEXT,
        dialogue_style TEXT,
        is_static BOOLEAN DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        type TEXT,
        properties TEXT,
        mutations TEXT,
        weight REAL,
        value INTEGER,
        is_static BOOLEAN DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        npc_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        type TEXT,
        content TEXT,
        importance INTEGER,
        emotional_valence REAL,
        associations TEXT,
        FOREIGN KEY (npc_id) REFERENCES npcs(id)
      );

      CREATE TABLE IF NOT EXISTS relationships (
        npc_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        trust INTEGER DEFAULT 0,
        affection INTEGER DEFAULT 0,
        respect INTEGER DEFAULT 0,
        fear INTEGER DEFAULT 0,
        history TEXT,
        last_interaction INTEGER,
        PRIMARY KEY (npc_id, target_id),
        FOREIGN KEY (npc_id) REFERENCES npcs(id)
      );

      CREATE TABLE IF NOT EXISTS game_state (
        id INTEGER PRIMARY KEY,
        current_room TEXT,
        party TEXT,
        world_time TEXT,
        flags TEXT,
        dynamic_entities TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS entity_positions (
        entity_id TEXT PRIMARY KEY,
        room TEXT,
        container TEXT,
        worn TEXT,
        coordinates TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS quest_states (
        quest_id TEXT PRIMARY KEY,
        name TEXT,
        description TEXT,
        objectives TEXT,
        rewards TEXT,
        status TEXT DEFAULT 'available',
        progress TEXT,
        time_limit INTEGER,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        participants TEXT,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS dialogue_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT,
        speaker TEXT,
        text TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id)
      );

      CREATE TABLE IF NOT EXISTS story_flags (
        flag TEXT PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS scheduled_events (
        id TEXT PRIMARY KEY,
        time TEXT,
        type TEXT,
        data TEXT,
        recurring TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_memories_npc ON memories(npc_id);
      CREATE INDEX IF NOT EXISTS idx_dialogue_conversation ON dialogue_history(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_positions_room ON entity_positions(room);
    `);
  }

  get database(): Database.Database {
    return this.db;
  }

  close(): void {
    this.db.close();
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  prepare(sql: string): Database.Statement {
    return this.db.prepare(sql);
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }
}