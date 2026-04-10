/**
 * Post Effect Registry
 *
 * Plugin-like registry for GPU-accelerated post-processing effects.
 * New post effects can be registered without modifying core timeline
 * or rendering logic. The pipeline is effect-type-agnostic — it only
 * deals with PostEffectBlocks and their shader programs.
 */

import type { PostEffectPropertyDefinition } from '../types/postEffect';
import type { LucideIcon } from 'lucide-react';

// ============================================
// REGISTRY ENTRY
// ============================================

/**
 * A registered post effect type in the system.
 * Defines metadata, shader source, property definitions, and uniform mappings.
 */
export interface PostEffectRegistryEntry {
  /** Unique post effect type identifier (e.g., 'chromatic-aberration', 'blur') */
  type: string;

  /** Display name (e.g., 'Chromatic Aberration', 'Gaussian Blur') */
  name: string;

  /** Lucide icon component for UI */
  icon: LucideIcon;

  /** Effect category for UI grouping */
  category: 'distortion' | 'blur' | 'glow' | 'color';

  /** Description for tooltips */
  description: string;

  /** Default settings when the effect is first created */
  defaultSettings: Record<string, unknown>;

  /** Property definitions for all animatable properties (shader uniforms) */
  propertyDefinitions: PostEffectPropertyDefinition[];

  /**
   * GLSL fragment shader source code.
   *
   * Standard uniforms provided automatically:
   * - uniform sampler2D u_texture;   // Input texture from previous pass
   * - uniform vec2 u_resolution;     // Canvas dimensions in pixels
   * - uniform float u_time;          // Current time in seconds
   * - uniform float u_frame;         // Current frame number
   *
   * Per-effect property uniforms are auto-bound from settings using the
   * property path as the uniform name (prefixed with u_).
   * E.g., property path 'intensity' → uniform float u_intensity;
   *
   * Input/output:
   * - in vec2 v_texCoord;            // UV coordinates (0-1)
   * - out vec4 fragColor;            // Output color
   */
  fragmentShader: string;

  /**
   * Number of render passes for this effect.
   * Default: 1 (single pass).
   * Multi-pass effects (e.g., separable blur) use ping-pong framebuffers.
   */
  passes?: number;

  /**
   * Per-pass fragment shader overrides.
   * If provided, pass N uses passShaders[N] instead of fragmentShader.
   * Length must equal `passes`. Used for multi-pass effects where each
   * pass has a different shader (e.g., horizontal blur then vertical blur).
   */
  passShaders?: string[];

  /**
   * Per-pass uniform overrides.
   * Allows setting different uniform values per pass (e.g., blur direction).
   * Key: uniform name (without u_ prefix), Value: value for that pass.
   */
  passUniforms?: Array<Record<string, unknown>>;
}

// ============================================
// REGISTRY
// ============================================

const registry = new Map<string, PostEffectRegistryEntry>();

/**
 * Register a new post effect type.
 * Throws if a post effect with the same type is already registered.
 */
export function registerPostEffect(entry: PostEffectRegistryEntry): void {
  if (registry.has(entry.type)) {
    throw new Error(`Post effect type "${entry.type}" is already registered.`);
  }
  registry.set(entry.type, entry);
}

/**
 * Get a registered post effect by type.
 * Returns undefined if not found.
 */
export function getPostEffect(type: string): PostEffectRegistryEntry | undefined {
  return registry.get(type);
}

/**
 * Get all registered post effects.
 */
export function getAllPostEffects(): PostEffectRegistryEntry[] {
  return Array.from(registry.values());
}

/**
 * Get all registered post effects in a specific category.
 */
export function getPostEffectsByCategory(
  category: PostEffectRegistryEntry['category'],
): PostEffectRegistryEntry[] {
  return getAllPostEffects().filter((e) => e.category === category);
}

/**
 * Check if a post effect type is registered.
 */
export function isPostEffectRegistered(type: string): boolean {
  return registry.has(type);
}

/**
 * Clear the registry — used in tests.
 */
export function clearPostEffectRegistry(): void {
  registry.clear();
}
