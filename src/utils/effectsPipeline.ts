/**
 * Effects Pipeline
 *
 * Procedural evaluation engine for the non-destructive effects system.
 * Evaluates effect blocks at a given frame, resolves keyframed settings,
 * and applies effects in z-order.
 */

import type { Cell } from '../types';
import type {
  EffectBlock,
  EffectTrack,
  EffectPropertyDefinition,
} from '../types/effectBlock';
import type { ContentFrame } from '../types/timeline';
import { getEffect } from '../registry/effectRegistry';
import type { EffectProcessOptions } from '../registry/effectRegistry';
import { interpolateEffectProperty } from './effectKeyframeInterpolation';

// ============================================
// EFFECT BLOCK EVALUATION
// ============================================

/**
 * Evaluate an effect block at a given frame.
 * Resolves all keyframed property values via interpolation, falling back
 * to the block's static settings for un-keyframed properties.
 *
 * @param block - The effect block to evaluate
 * @param frame - The current frame number
 * @returns Fully resolved settings object for this frame
 */
export function evaluateEffectBlock(
  block: EffectBlock,
  frame: number,
): Record<string, unknown> {
  const entry = getEffect(block.effectType);
  if (!entry) return { ...block.settings };

  const resolved: Record<string, unknown> = { ...block.settings };

  // Build a lookup of property definitions by path
  const defsByPath = new Map<string, EffectPropertyDefinition>();
  for (const def of entry.propertyDefinitions) {
    defsByPath.set(def.path, def);
  }

  // Resolve each property track's value at the current frame
  for (const track of block.propertyTracks) {
    const def = defsByPath.get(track.propertyPath);
    if (!def) continue;

    // Evaluate relative to block's own timeline:
    // frame is absolute; effect block starts at block.startFrame
    const value = interpolateEffectProperty(track, frame, def);
    resolved[track.propertyPath] = value;
  }

  return resolved;
}

// ============================================
// LAYER EFFECTS APPLICATION
// ============================================

/**
 * Check if a frame falls within an effect block's active time range.
 */
function isFrameInRange(block: EffectBlock, frame: number): boolean {
  return frame >= block.startFrame && frame < block.startFrame + block.durationFrames;
}

/**
 * Apply all effect tracks on a layer to its cell data at a given frame.
 * Effects are applied in array order (z-order: first track = topmost in UI = applied first).
 * Only enabled blocks whose time range includes the current frame are applied.
 *
 * @param cells - The layer's cell data (local space)
 * @param effectTracks - The layer's effect tracks (z-ordered array)
 * @param frame - Current frame number
 * @param options - Additional processing context
 * @returns New cell Map with effects applied (original is never mutated)
 */
export async function applyEffectsToLayer(
  cells: Map<string, Cell>,
  effectTracks: EffectTrack[],
  frame: number,
  options?: EffectProcessOptions,
): Promise<Map<string, Cell>> {
  let currentCells = cells;

  for (const track of effectTracks) {
    const block = track.effectBlock;

    // Skip disabled or out-of-range blocks
    if (!block.enabled || !isFrameInRange(block, frame)) continue;

    const entry = getEffect(block.effectType);
    if (!entry) continue;

    // Resolve keyframed settings at this frame
    const resolvedSettings = evaluateEffectBlock(block, frame);

    // Apply the effect
    const result = await entry.process(currentCells, resolvedSettings, options);
    currentCells = result.processedCells;
  }

  return currentCells;
}

/**
 * Apply effects to a group's intermediate composite.
 * Identical to layer application — the difference is WHEN it's called in the pipeline
 * (after child layers are composited, before group transforms).
 *
 * @param cells - The group's intermediate composite cell data
 * @param effectTracks - The group's effect tracks
 * @param frame - Current frame number
 * @param options - Additional processing context
 * @returns New cell Map with effects applied
 */
export async function applyEffectsToGroup(
  cells: Map<string, Cell>,
  effectTracks: EffectTrack[],
  frame: number,
  options?: EffectProcessOptions,
): Promise<Map<string, Cell>> {
  return applyEffectsToLayer(cells, effectTracks, frame, options);
}

/**
 * Apply global effects to the fully composited output.
 *
 * @param cells - The fully composited cell data (screen space)
 * @param effectTracks - The global effect tracks
 * @param frame - Current frame number
 * @param options - Additional processing context
 * @returns New cell Map with global effects applied
 */
export async function applyGlobalEffects(
  cells: Map<string, Cell>,
  effectTracks: EffectTrack[],
  frame: number,
  options?: EffectProcessOptions,
): Promise<Map<string, Cell>> {
  return applyEffectsToLayer(cells, effectTracks, frame, options);
}

// ============================================
// BAKE EFFECT
// ============================================

/**
 * Destructively apply an effect block to content frames.
 * Evaluates the effect at each frame within the block's time range,
 * writing processed cells back into the content frame data.
 *
 * @param block - The effect block to bake
 * @param contentFrames - The content frames to modify
 * @param options - Additional processing context
 * @returns The modified content frames (mutated in place for efficiency — caller should clone if needed)
 */
export async function bakeEffectBlock(
  block: EffectBlock,
  contentFrames: ContentFrame[],
  options?: EffectProcessOptions,
): Promise<ContentFrame[]> {
  const entry = getEffect(block.effectType);
  if (!entry) return contentFrames;

  for (const cf of contentFrames) {
    // Check each frame within the content frame's range against the block's range
    const cfEnd = cf.startFrame + cf.durationFrames;
    const blockEnd = block.startFrame + block.durationFrames;

    // Skip content frames entirely outside the block's range
    if (cf.startFrame >= blockEnd || cfEnd <= block.startFrame) continue;

    // For each frame in the overlapping range, evaluate and apply
    // For content frames, cell data is shared across the duration.
    // Evaluate at the first overlapping frame for the resolved settings.
    const evalFrame = Math.max(cf.startFrame, block.startFrame);
    const resolvedSettings = evaluateEffectBlock(block, evalFrame);

    const result = await entry.process(cf.data, resolvedSettings, {
      ...options,
      frame: evalFrame,
    });
    cf.data = result.processedCells;
  }

  return contentFrames;
}

// ============================================
// UTILITY
// ============================================

/**
 * Check if a layer has any active (enabled, in-range) effects at a given frame.
 * Useful for compositing optimizations — skip effect processing when nothing applies.
 */
export function hasActiveEffectsAtFrame(
  effectTracks: EffectTrack[],
  frame: number,
): boolean {
  return effectTracks.some(
    (track) => track.effectBlock.enabled && isFrameInRange(track.effectBlock, frame),
  );
}
