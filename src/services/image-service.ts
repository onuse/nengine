/**
 * Image Service
 * Handles image generation, storage, and serving
 */

import * as fs from 'fs';
import * as path from 'path';
import { LLMProvider, ImageGenerationOptions, ImageGenerationResult } from '../llm/types';

export interface ImageMetadata {
  id: string;
  prompt: string;
  filename: string;
  entityId?: string; // Associated NPC or item ID
  sceneId?: string; // Associated room/scene ID
  timestamp: number;
  size: string;
  generator: string;
}

export class ImageService {
  private imageDir: string;
  private metadataPath: string;
  private metadata: Map<string, ImageMetadata> = new Map();
  private llmProvider: LLMProvider | null = null;

  constructor(baseDir: string = '.') {
    this.imageDir = path.join(baseDir, 'generated-images');
    this.metadataPath = path.join(this.imageDir, 'metadata.json');

    // Ensure image directory exists
    if (!fs.existsSync(this.imageDir)) {
      fs.mkdirSync(this.imageDir, { recursive: true });
      console.log(`[ImageService] Created image directory: ${this.imageDir}`);
    }

    // Load existing metadata
    this.loadMetadata();
  }

  /**
   * Set the LLM provider that supports image generation
   */
  setLLMProvider(provider: LLMProvider): void {
    if (!provider.generateImage) {
      console.warn('[ImageService] LLM provider does not support image generation');
    }
    this.llmProvider = provider;
  }

  /**
   * Generate an image for an entity (NPC, item, etc.)
   */
  async generateEntityImage(
    entityId: string,
    description: string,
    options: ImageGenerationOptions = {}
  ): Promise<string | null> {
    if (!this.llmProvider?.generateImage) {
      console.warn('[ImageService] Image generation not available - no provider or provider does not support images');
      return null;
    }

    // Check if image already exists
    const existing = this.findImageByEntity(entityId);
    if (existing) {
      console.log(`[ImageService] Using existing image for entity ${entityId}: ${existing.filename}`);
      return existing.id;
    }

    // Build prompt for entity portrait
    const prompt = this.buildEntityPrompt(description);

    try {
      const result = await this.llmProvider.generateImage(prompt, {
        size: '512x512',
        steps: 20,
        ...options
      });

      if (!result.success || !result.imageData) {
        console.error(`[ImageService] Failed to generate image for ${entityId}:`, result.error);
        return null;
      }

      // Save image and metadata
      const imageId = this.generateImageId(entityId, 'entity');
      const filename = `${imageId}.png`;
      const filepath = path.join(this.imageDir, filename);

      // Decode base64 and save
      const imageBuffer = Buffer.from(result.imageData, 'base64');
      fs.writeFileSync(filepath, imageBuffer);

      // Save metadata
      const metadata: ImageMetadata = {
        id: imageId,
        prompt: prompt,
        filename: filename,
        entityId: entityId,
        timestamp: Date.now(),
        size: result.metadata?.size || '512x512',
        generator: 'creative-server'
      };

      this.metadata.set(imageId, metadata);
      this.saveMetadata();

      console.log(`[ImageService] Generated image for entity ${entityId}: ${filename}`);
      return imageId;

    } catch (error: any) {
      console.error(`[ImageService] Error generating image for ${entityId}:`, error.message);
      return null;
    }
  }

  /**
   * Generate an image for a scene/location
   * For slash commands, sceneId is the unique image ID and we always generate a new image
   */
  async generateSceneImage(
    sceneId: string,
    description: string,
    options: ImageGenerationOptions = {}
  ): Promise<string | null> {
    if (!this.llmProvider?.generateImage) {
      console.warn('[ImageService] Image generation not available');
      return null;
    }

    // For slash command images (starting with 'scene_'), always generate new
    // For room-based images, check if exists
    const isSlashCommand = sceneId.startsWith('scene_');
    if (!isSlashCommand) {
      const existing = this.findImageByScene(sceneId);
      if (existing) {
        console.log(`[ImageService] Using existing image for scene ${sceneId}: ${existing.filename}`);
        return existing.id;
      }
    }

    // Use the description directly as prompt (LLM already created detailed prompt)
    const prompt = isSlashCommand ? description : this.buildScenePrompt(description);

    console.log(`[ImageService] Generating image with prompt: ${prompt.substring(0, 100)}...`);

    try {
      const result = await this.llmProvider.generateImage(prompt, {
        size: '768x768', // Wider format for scenes
        steps: 20,
        ...options
      });

      if (!result.success || !result.imageData) {
        console.error(`[ImageService] Failed to generate image for scene ${sceneId}:`, result.error);
        return null;
      }

      // Use the provided sceneId as imageId for slash commands
      const imageId = isSlashCommand ? sceneId : this.generateImageId(sceneId, 'scene');
      const filename = `${imageId}.png`;
      const filepath = path.join(this.imageDir, filename);

      // Decode base64 and save
      const imageBuffer = Buffer.from(result.imageData, 'base64');
      fs.writeFileSync(filepath, imageBuffer);

      // Save metadata
      const metadata: ImageMetadata = {
        id: imageId,
        prompt: prompt,
        filename: filename,
        sceneId: isSlashCommand ? undefined : sceneId, // Don't set sceneId for slash commands
        timestamp: Date.now(),
        size: result.metadata?.size || '768x768',
        generator: 'creative-server'
      };

      this.metadata.set(imageId, metadata);
      this.saveMetadata();

      console.log(`[ImageService] Generated image ${imageId}: ${filename}`);
      return imageId;

    } catch (error: any) {
      console.error(`[ImageService] Error generating image for scene ${sceneId}:`, error.message);
      return null;
    }
  }

  /**
   * Get image path by ID
   */
  getImagePath(imageId: string): string | null {
    const metadata = this.metadata.get(imageId);
    if (!metadata) {
      return null;
    }

    const filepath = path.join(this.imageDir, metadata.filename);
    if (fs.existsSync(filepath)) {
      return filepath;
    }

    return null;
  }

  /**
   * Get image metadata by ID
   */
  getImageMetadata(imageId: string): ImageMetadata | null {
    return this.metadata.get(imageId) || null;
  }

  /**
   * Get all images for an entity
   */
  findImageByEntity(entityId: string): ImageMetadata | null {
    for (const metadata of this.metadata.values()) {
      if (metadata.entityId === entityId) {
        return metadata;
      }
    }
    return null;
  }

  /**
   * Get all images for a scene
   */
  findImageByScene(sceneId: string): ImageMetadata | null {
    for (const metadata of this.metadata.values()) {
      if (metadata.sceneId === sceneId) {
        return metadata;
      }
    }
    return null;
  }

  /**
   * Delete an image
   */
  deleteImage(imageId: string): boolean {
    const metadata = this.metadata.get(imageId);
    if (!metadata) {
      return false;
    }

    const filepath = path.join(this.imageDir, metadata.filename);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }

    this.metadata.delete(imageId);
    this.saveMetadata();

    console.log(`[ImageService] Deleted image: ${imageId}`);
    return true;
  }

  /**
   * List all images
   */
  listAllImages(): ImageMetadata[] {
    return Array.from(this.metadata.values());
  }

  // Private helper methods

  private buildEntityPrompt(description: string): string {
    // Enhance the description for better image generation
    return `character portrait, ${description}, fantasy art style, detailed, high quality, professional illustration`;
  }

  private buildScenePrompt(description: string): string {
    // Enhance the scene description for better image generation
    return `scene artwork, ${description}, fantasy art style, atmospheric, detailed environment, high quality`;
  }

  private generateImageId(baseId: string, type: string): string {
    const timestamp = Date.now();
    const sanitized = baseId.replace(/[^a-zA-Z0-9-_]/g, '_');
    return `${type}_${sanitized}_${timestamp}`;
  }

  private loadMetadata(): void {
    if (fs.existsSync(this.metadataPath)) {
      try {
        const data = fs.readFileSync(this.metadataPath, 'utf-8');
        const parsed = JSON.parse(data);

        this.metadata = new Map(Object.entries(parsed));
        console.log(`[ImageService] Loaded ${this.metadata.size} image metadata entries`);
      } catch (error) {
        console.error('[ImageService] Failed to load metadata:', error);
      }
    }
  }

  private saveMetadata(): void {
    try {
      const data = Object.fromEntries(this.metadata);
      fs.writeFileSync(this.metadataPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[ImageService] Failed to save metadata:', error);
    }
  }
}
