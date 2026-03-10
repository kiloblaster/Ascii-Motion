/**
 * Effect Registry
 *
 * Plugin-like registry for effect types. New effects can be registered
 * without modifying core timeline or compositing logic.
 * The timeline system is effect-type-agnostic — it only deals with
 * EffectBlocks and their property tracks.
 *
 * Part of the Procedural Effects Refactor
 */

import type { Cell } from '../types/index';
import type { EffectPropertyDefinition } from '../types/effectBlock';
import type { LucideIcon } from 'lucide-react';

// ============================================
// REGISTRY ENTRY
// ============================================

/**
 * Options passed to an effect processor.
 */
export interface EffectProcessOptions {
  /** Canvas background color (used by some effects for blending) */
  canvasBackgroundColor?: string;
  /** Selection mask — only process cells within this set of "x,y" keys */
  selectionMask?: Set<string>;
  /** Current frame number (for time-dependent effects) */
  frame?: number;
  /** Project frame rate (for time-dependent effects) */
  frameRate?: number;
  /** Canvas width in cells (for bounds-aware effects like wave warp) */
  canvasWidth?: number;
  /** Canvas height in cells (for bounds-aware effects like wave warp) */
  canvasHeight?: number;
}

/**
 * Result returned by an effect processor.
 */
export interface EffectProcessResult {
  /** The processed cells (new Map — original is never mutated) */
  processedCells: Map<string, Cell>;
  /** Number of cells that were modified */
  affectedCells: number;
}

/**
 * A registered effect type in the system.
 * Defines metadata, default settings, property definitions, and the processor function.
 */
export interface EffectRegistryEntry {
  /** Unique effect type identifier (e.g., 'levels', 'scatter', 'wave-warp') */
  type: string;

  /** Display name (e.g., 'Levels', 'Scatter') */
  name: string;

  /** Lucide icon component for UI */
  icon: LucideIcon;

  /** Effect category for UI grouping */
  category: 'adjustment' | 'mapping' | 'filter' | 'distortion';

  /** Description for tooltips */
  description: string;

  /** Default settings when the effect is first created */
  defaultSettings: Record<string, unknown>;

  /** Property definitions for all animatable properties of this effect */
  propertyDefinitions: EffectPropertyDefinition[];

  /**
   * Process function — applies the effect to a set of cells.
   * Must return a NEW Map (never mutate the input).
   * Synchronous for compositing pipeline compatibility.
   *
   * @param cells - Input cell data
   * @param settings - Resolved settings (after keyframe interpolation)
   * @param options - Additional context (background color, selection mask, frame)
   * @returns Processed cells and affected count
   */
  process: (
    cells: Map<string, Cell>,
    settings: Record<string, unknown>,
    options?: EffectProcessOptions,
  ) => EffectProcessResult;
}

// ============================================
// REGISTRY
// ============================================

const registry = new Map<string, EffectRegistryEntry>();

/**
 * Register a new effect type.
 * Throws if an effect with the same type is already registered.
 */
export function registerEffect(entry: EffectRegistryEntry): void {
  if (registry.has(entry.type)) {
    throw new Error(`Effect type "${entry.type}" is already registered.`);
  }
  registry.set(entry.type, entry);
}

/**
 * Get a registered effect by type.
 * Returns undefined if not found.
 */
export function getEffect(type: string): EffectRegistryEntry | undefined {
  return registry.get(type);
}

/**
 * Get all registered effects.
 */
export function getAllEffects(): EffectRegistryEntry[] {
  return Array.from(registry.values());
}

/**
 * Get all registered effects in a specific category.
 */
export function getEffectsByCategory(category: EffectRegistryEntry['category']): EffectRegistryEntry[] {
  return getAllEffects().filter(e => e.category === category);
}

/**
 * Check if an effect type is registered.
 */
export function isEffectRegistered(type: string): boolean {
  return registry.has(type);
}

/**
 * Clear the registry — used in tests.
 */
export function clearEffectRegistry(): void {
  registry.clear();
}
