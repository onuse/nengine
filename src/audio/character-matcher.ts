/**
 * Character Matcher
 *
 * Manages character voice configurations and provides lookup methods.
 * Resolves character IDs and aliases to voice settings.
 */

import { CharacterVoiceConfig, VoiceConfig } from './types';

export class CharacterMatcher {
  private characters: Map<string, CharacterVoiceConfig>;
  private aliasMap: Map<string, string>; // alias -> character ID

  constructor(characters: CharacterVoiceConfig[]) {
    this.characters = new Map();
    this.aliasMap = new Map();

    // Build character and alias maps
    for (const char of characters) {
      this.characters.set(char.id, char);

      // Add character name as alias (case-insensitive)
      this.aliasMap.set(char.name.toLowerCase(), char.id);

      // Add all aliases (case-insensitive)
      if (char.aliases) {
        for (const alias of char.aliases) {
          this.aliasMap.set(alias.toLowerCase(), char.id);
        }
      }
    }

    console.log(`[CharacterMatcher] Initialized with ${this.characters.size} characters and ${this.aliasMap.size} aliases`);
  }

  /**
   * Get character by ID
   */
  public getCharacter(id: string): CharacterVoiceConfig | undefined {
    return this.characters.get(id);
  }

  /**
   * Get character voice config by ID
   */
  public getVoiceConfig(id: string): VoiceConfig | undefined {
    const character = this.characters.get(id);
    return character?.audio;
  }

  /**
   * Resolve character ID from name or alias
   */
  public resolveCharacterId(nameOrAlias: string): string | undefined {
    return this.aliasMap.get(nameOrAlias.toLowerCase());
  }

  /**
   * Get all characters as array
   */
  public getAllCharacters(): CharacterVoiceConfig[] {
    return Array.from(this.characters.values());
  }

  /**
   * Get character IDs
   */
  public getCharacterIds(): string[] {
    return Array.from(this.characters.keys());
  }

  /**
   * Check if character exists
   */
  public hasCharacter(id: string): boolean {
    return this.characters.has(id);
  }

  /**
   * Get characters by room (if they have room info)
   * For now, returns all characters - can be extended later
   */
  public getCharactersInRoom(roomId: string): CharacterVoiceConfig[] {
    // TODO: Integrate with MCP state to get actual room presence
    return this.getAllCharacters();
  }

  /**
   * Add or update a character dynamically
   */
  public addCharacter(character: CharacterVoiceConfig): void {
    this.characters.set(character.id, character);

    // Update alias map
    this.aliasMap.set(character.name.toLowerCase(), character.id);
    if (character.aliases) {
      for (const alias of character.aliases) {
        this.aliasMap.set(alias.toLowerCase(), character.id);
      }
    }

    console.log(`[CharacterMatcher] Added/updated character: ${character.id} (${character.name})`);
  }

  /**
   * Remove a character
   */
  public removeCharacter(id: string): boolean {
    const character = this.characters.get(id);
    if (!character) {
      return false;
    }

    // Remove from character map
    this.characters.delete(id);

    // Remove from alias map
    this.aliasMap.delete(character.name.toLowerCase());
    if (character.aliases) {
      for (const alias of character.aliases) {
        this.aliasMap.delete(alias.toLowerCase());
      }
    }

    console.log(`[CharacterMatcher] Removed character: ${id} (${character.name})`);
    return true;
  }

  /**
   * Get character count
   */
  public size(): number {
    return this.characters.size;
  }

  /**
   * Clear all characters
   */
  public clear(): void {
    this.characters.clear();
    this.aliasMap.clear();
    console.log('[CharacterMatcher] Cleared all characters');
  }

  /**
   * Get debug info
   */
  public getDebugInfo(): object {
    return {
      characterCount: this.characters.size,
      aliasCount: this.aliasMap.size,
      characters: Array.from(this.characters.keys()),
      aliases: Array.from(this.aliasMap.entries()),
    };
  }
}
