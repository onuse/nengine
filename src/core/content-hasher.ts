/**
 * Content Hasher
 * Generates SHA-256 fingerprints of game content files for save compatibility checking
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Game save metadata structure
 */
export interface GameSaveMetadata {
  // Content identification
  contentHash: string;           // SHA-256 of content files
  gameVersion: string;            // From game.yaml version field
  gameId: string;                 // From game.yaml id/name

  // Save state
  lastCommit: string;             // Latest Git commit hash
  lastPlayed: string;             // ISO timestamp
  currentBranch: string;          // Git branch (default: "main")

  // Optional metadata
  playerName?: string;            // Player identifier
  playtime?: number;              // Total playtime in seconds
  turnCount?: number;             // Number of turns played

  // Compatibility
  engineVersion?: string;         // nengine version used
  createdAt?: string;             // When save was first created
}

/**
 * Content files to hash for each game
 */
const CONTENT_FILES = [
  'game.yaml',
  'content/world.yaml',
  'content/characters.yaml',
  'content/items.yaml'
];

/**
 * ContentHasher - Generates and verifies content hashes for game saves
 */
export class ContentHasher {
  /**
   * Generate SHA-256 hash of all game content files
   *
   * @param gamePath - Absolute path to game directory
   * @returns SHA-256 hex string
   */
  static generateContentHash(gamePath: string): string {
    const contentChunks: string[] = [];

    for (const file of CONTENT_FILES) {
      const filepath = path.join(gamePath, file);

      if (fs.existsSync(filepath)) {
        try {
          const content = fs.readFileSync(filepath, 'utf-8');
          contentChunks.push(`--- ${file} ---\n${content}`);
        } catch (error) {
          console.warn(`[ContentHasher] Failed to read ${file}:`, error);
          // Continue with other files
        }
      } else {
        // File doesn't exist - include marker for consistent hashing
        contentChunks.push(`--- ${file} ---\n[MISSING]`);
      }
    }

    const combined = contentChunks.join('\n');
    const hash = crypto.createHash('sha256').update(combined).digest('hex');

    console.log(`[ContentHasher] Generated content hash: ${hash.substring(0, 12)}... (${contentChunks.length} files)`);
    return hash;
  }

  /**
   * Compare two content hashes
   *
   * @param hash1 - First hash
   * @param hash2 - Second hash
   * @returns True if hashes match
   */
  static compareHashes(hash1: string, hash2: string): boolean {
    return hash1 === hash2;
  }

  /**
   * Load metadata from .meta.json file
   *
   * @param savePath - Path to save directory (e.g., games/lovebug/saves)
   * @returns Metadata object or null if not found
   */
  static loadMetadata(savePath: string): GameSaveMetadata | null {
    const metaPath = path.join(savePath, '.meta.json');

    if (!fs.existsSync(metaPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(metaPath, 'utf-8');
      const metadata = JSON.parse(content) as GameSaveMetadata;
      console.log(`[ContentHasher] Loaded metadata for ${metadata.gameId} (${metadata.contentHash.substring(0, 12)}...)`);
      return metadata;
    } catch (error) {
      console.error('[ContentHasher] Failed to load metadata:', error);
      return null;
    }
  }

  /**
   * Save metadata to .meta.json file
   *
   * @param savePath - Path to save directory
   * @param metadata - Metadata to save
   */
  static saveMetadata(savePath: string, metadata: GameSaveMetadata): void {
    const metaPath = path.join(savePath, '.meta.json');

    try {
      // Ensure save directory exists
      if (!fs.existsSync(savePath)) {
        fs.mkdirSync(savePath, { recursive: true });
      }

      fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf-8');
      console.log(`[ContentHasher] Saved metadata for ${metadata.gameId} (${metadata.contentHash.substring(0, 12)}...)`);
    } catch (error) {
      console.error('[ContentHasher] Failed to save metadata:', error);
      throw error;
    }
  }

  /**
   * Check if a save is compatible with current game content
   *
   * @param gamePath - Path to game directory
   * @param savePath - Path to save directory
   * @returns Compatibility check result
   */
  static checkCompatibility(gamePath: string, savePath: string): {
    compatible: boolean;
    currentHash: string;
    savedHash: string | null;
    reason: string;
  } {
    const currentHash = ContentHasher.generateContentHash(gamePath);
    const metadata = ContentHasher.loadMetadata(savePath);

    if (!metadata) {
      return {
        compatible: false,
        currentHash,
        savedHash: null,
        reason: 'no_save_metadata'
      };
    }

    const savedHash = metadata.contentHash;
    const compatible = ContentHasher.compareHashes(currentHash, savedHash);

    return {
      compatible,
      currentHash,
      savedHash,
      reason: compatible ? 'content_match' : 'content_changed'
    };
  }

  /**
   * Migrate old save without metadata to include content hash
   * Assumes current content hash is correct for old save
   *
   * @param gamePath - Path to game directory
   * @param savePath - Path to save directory
   * @param gameId - Game ID
   * @param gameVersion - Game version
   * @param lastCommit - Last Git commit hash
   */
  static migrateOldSave(
    gamePath: string,
    savePath: string,
    gameId: string,
    gameVersion: string,
    lastCommit: string = ''
  ): void {
    const metadata = ContentHasher.loadMetadata(savePath);

    if (metadata) {
      console.log('[ContentHasher] Save already has metadata, skipping migration');
      return;
    }

    const currentHash = ContentHasher.generateContentHash(gamePath);

    const newMetadata: GameSaveMetadata = {
      contentHash: currentHash,
      gameVersion,
      gameId,
      lastCommit,
      lastPlayed: new Date().toISOString(),
      currentBranch: 'main',
      createdAt: new Date().toISOString()
    };

    ContentHasher.saveMetadata(savePath, newMetadata);
    console.log(`[ContentHasher] Migrated old save for ${gameId}`);
  }

  /**
   * Get file modification times for cache invalidation
   *
   * @param gamePath - Path to game directory
   * @returns Map of file paths to modification timestamps
   */
  static getContentFileStats(gamePath: string): Map<string, number> {
    const stats = new Map<string, number>();

    for (const file of CONTENT_FILES) {
      const filepath = path.join(gamePath, file);

      if (fs.existsSync(filepath)) {
        try {
          const stat = fs.statSync(filepath);
          stats.set(file, stat.mtimeMs);
        } catch (error) {
          console.warn(`[ContentHasher] Failed to stat ${file}:`, error);
        }
      }
    }

    return stats;
  }
}

/**
 * Cached content hasher - only recomputes hash if files changed
 */
export class CachedContentHasher {
  private cache: Map<string, { hash: string; stats: Map<string, number> }> = new Map();

  /**
   * Get content hash with caching
   * Only recomputes if files have been modified
   *
   * @param gamePath - Path to game directory
   * @returns Cached or newly computed hash
   */
  getContentHash(gamePath: string): string {
    const currentStats = ContentHasher.getContentFileStats(gamePath);
    const cached = this.cache.get(gamePath);

    if (cached) {
      // Check if any files changed
      let filesChanged = false;

      for (const [file, mtime] of currentStats.entries()) {
        if (cached.stats.get(file) !== mtime) {
          filesChanged = true;
          break;
        }
      }

      // Also check if number of files changed
      if (cached.stats.size !== currentStats.size) {
        filesChanged = true;
      }

      if (!filesChanged) {
        console.log(`[CachedContentHasher] Using cached hash for ${path.basename(gamePath)}`);
        return cached.hash;
      }
    }

    // Recompute hash
    const hash = ContentHasher.generateContentHash(gamePath);
    this.cache.set(gamePath, { hash, stats: currentStats });
    return hash;
  }

  /**
   * Clear cache for specific game or all games
   *
   * @param gamePath - Optional path to clear (clears all if not specified)
   */
  clearCache(gamePath?: string): void {
    if (gamePath) {
      this.cache.delete(gamePath);
      console.log(`[CachedContentHasher] Cleared cache for ${path.basename(gamePath)}`);
    } else {
      this.cache.clear();
      console.log('[CachedContentHasher] Cleared all cache');
    }
  }
}
