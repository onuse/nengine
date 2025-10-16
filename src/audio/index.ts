/**
 * Audio Module
 *
 * Exports all audio-related services and types for the Narrative Engine.
 */

// Types
export * from './types';

// Services
export { AudioAssembler, AudioAssemblerOptions } from './audio-assembler';
export { CharacterMatcher } from './character-matcher';
export { TextAnalyzer, TextAnalyzerContext } from './text-analyzer';
export { TTSService } from './tts-service';
