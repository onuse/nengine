import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { GameUIConfig } from '../types/ui-config';

export interface GameManifest {
  game: {
    id: string;
    title: string;
    version: string;
    author?: string;
    description: string;
    startingRoom: string;
    maxPartySize?: number;
  };
  ui: GameUIConfig;
  mechanics: any;
  llm: any;
  content: {
    worldData: string;
    npcs: string;
    items: string;
    dialogues: string;
  };
  saves: {
    autoSave: boolean;
    autoSaveInterval: number;
    maxSaves: number;
    enableBranching: boolean;
  };
  development?: {
    debugMode: boolean;
    showEntityIds: boolean;
    enableConsoleCommands: boolean;
    hotReload: boolean;
  };
}

export class GameLoader {
  private gamesPath: string;
  private currentGame: string | null = null;
  private gameManifest: GameManifest | null = null;
  private gamePath: string | null = null;

  constructor(gamesPath: string = './games') {
    this.gamesPath = path.resolve(gamesPath);
  }

  /**
   * List all available games
   */
  listGames(): string[] {
    if (!fs.existsSync(this.gamesPath)) {
      return [];
    }

    return fs.readdirSync(this.gamesPath)
      .filter(dir => {
        const gamePath = path.join(this.gamesPath, dir);
        const manifestPath = path.join(gamePath, 'game.yaml');
        return fs.statSync(gamePath).isDirectory() && fs.existsSync(manifestPath);
      });
  }

  /**
   * Load a specific game
   */
  async loadGame(gameName: string): Promise<GameManifest> {
    this.gamePath = path.join(this.gamesPath, gameName);
    const manifestPath = path.join(this.gamePath, 'game.yaml');

    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Game "${gameName}" not found at ${manifestPath}`);
    }

    const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
    this.gameManifest = yaml.parse(manifestContent);
    
    // Add game ID if not present
    if (!this.gameManifest!.game.id) {
      this.gameManifest!.game.id = gameName;
    }

    // Resolve relative paths to absolute paths
    this.resolveContentPaths();
    
    this.currentGame = gameName;
    
    console.log(`Loaded game: ${this.gameManifest!.game.title} v${this.gameManifest!.game.version}`);
    
    return this.gameManifest!;
  }

  /**
   * Get current game manifest
   */
  getManifest(): GameManifest | null {
    return this.gameManifest;
  }

  /**
   * Get path to game directory
   */
  getGamePath(): string | null {
    return this.gamePath;
  }

  /**
   * Get path to game assets
   */
  getAssetsPath(): string | null {
    return this.gamePath ? path.join(this.gamePath, 'assets') : null;
  }

  /**
   * Get path to saves directory
   */
  getSavesPath(): string | null {
    return this.gamePath ? path.join(this.gamePath, 'saves') : null;
  }

  /**
   * Load game content file (world, npcs, items, etc.)
   */
  async loadContent(contentType: 'world' | 'npcs' | 'items'): Promise<any> {
    if (!this.gameManifest || !this.gamePath) {
      throw new Error('No game loaded');
    }

    const contentPath = path.join(this.gamePath, 'content', `${contentType}.yaml`);
    
    if (!fs.existsSync(contentPath)) {
      console.warn(`Content file not found: ${contentPath}`);
      return null;
    }

    const content = fs.readFileSync(contentPath, 'utf-8');
    return yaml.parse(content);
  }

  /**
   * Load custom CSS for the game
   */
  loadCustomCSS(): string | null {
    if (!this.gamePath) return null;
    
    const cssPath = path.join(this.gamePath, 'themes', 'custom.css');
    
    if (fs.existsSync(cssPath)) {
      return fs.readFileSync(cssPath, 'utf-8');
    }
    
    return null;
  }

  /**
   * Load custom theme JSON
   */
  loadCustomTheme(): any | null {
    if (!this.gamePath) return null;
    
    const themePath = path.join(this.gamePath, 'themes', 'theme.json');
    
    if (fs.existsSync(themePath)) {
      const content = fs.readFileSync(themePath, 'utf-8');
      return JSON.parse(content);
    }
    
    return null;
  }

  /**
   * Create a new save directory for a player
   */
  createPlayerSave(playerId: string): string {
    if (!this.gamePath) {
      throw new Error('No game loaded');
    }

    const savePath = path.join(this.gamePath, 'saves', playerId);
    
    if (!fs.existsSync(savePath)) {
      fs.mkdirSync(savePath, { recursive: true });
    }
    
    return savePath;
  }

  /**
   * Resolve content paths to be relative to game directory
   */
  private resolveContentPaths(): void {
    if (!this.gameManifest || !this.gamePath) return;
    
    const content = this.gameManifest.content;
    
    // Set default paths if not specified
    content.worldData = content.worldData || './content/world.yaml';
    content.npcs = content.npcs || './content/npcs.yaml';
    content.items = content.items || './content/items.yaml';
    content.dialogues = content.dialogues || './content/dialogues/';
  }

  /**
   * Validate game structure
   */
  validateGame(gameName: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const gamePath = path.join(this.gamesPath, gameName);
    
    // Check for required files and directories
    const required = [
      'game.yaml',
      'content',
      'assets',
      'themes'
    ];
    
    for (const item of required) {
      const itemPath = path.join(gamePath, item);
      if (!fs.existsSync(itemPath)) {
        errors.push(`Missing required ${item}`);
      }
    }
    
    // Try to parse game.yaml
    try {
      const manifestPath = path.join(gamePath, 'game.yaml');
      if (fs.existsSync(manifestPath)) {
        const content = fs.readFileSync(manifestPath, 'utf-8');
        const manifest = yaml.parse(content);
        
        // Check for required fields
        if (!manifest.game?.title) errors.push('Missing game.title');
        if (!manifest.game?.startingRoom) errors.push('Missing game.startingRoom');
        if (!manifest.ui) errors.push('Missing ui configuration');
      }
    } catch (e: any) {
      errors.push(`Invalid game.yaml: ${e.message}`);
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}