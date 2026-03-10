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
import { generateContentFrameId } from '../types/timeline';
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
export function applyEffectsToLayer(
  cells: Map<string, Cell>,
  effectTracks: EffectTrack[],
  frame: number,
  options?: EffectProcessOptions,
): Map<string, Cell> {
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
    const result = entry.process(currentCells, resolvedSettings, options);
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
export function applyEffectsToGroup(
  cells: Map<string, Cell>,
  effectTracks: EffectTrack[],
  frame: number,
  options?: EffectProcessOptions,
): Map<string, Cell> {
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
export function applyGlobalEffects(
  cells: Map<string, Cell>,
  effectTracks: EffectTrack[],
  frame: number,
  options?: EffectProcessOptions,
): Map<string, Cell> {
  return applyEffectsToLayer(cells, effectTracks, frame, options);
}

// ============================================
// BAKE EFFECT
// ============================================

/**
 * Bake an effect block into content frames, properly handling:
 * - Splitting frames at effect in/out boundaries
 * - Per-frame evaluation for keyframed effects
 * - Creating individual frames when effect properties change over time
 *
 * @returns New array of content frames with effect baked in
 */
export function bakeEffectIntoFrames(
  block: EffectBlock,
  contentFrames: ContentFrame[],
  options?: EffectProcessOptions,
): ContentFrame[] {
  const entry = getEffect(block.effectType);
  if (!entry) return contentFrames;

  const blockStart = block.startFrame;
  const blockEnd = block.startFrame + block.durationFrames;

  // Check if the effect has keyframed properties (needs per-frame evaluation)
  const hasKeyframes = block.propertyTracks.some((pt) => pt.keyframes.length > 1);

  const result: ContentFrame[] = [];

  for (const cf of contentFrames) {
    const cfEnd = cf.startFrame + cf.durationFrames;

    // Completely outside effect range — keep as-is
    if (cf.startFrame >= blockEnd || cfEnd <= blockStart) {
      result.push(cf);
      continue;
    }

    // Split at effect boundaries if needed
    // Part before effect starts
    if (cf.startFrame < blockStart) {
      result.push({
        ...cf,
        id: generateContentFrameId(),
        name: cf.name,
        startFrame: cf.startFrame,
        durationFrames: blockStart - cf.startFrame,
        data: new Map(cf.data),
      });
    }

    // The overlapping region
    const overlapStart = Math.max(cf.startFrame, blockStart);
    const overlapEnd = Math.min(cfEnd, blockEnd);

    if (hasKeyframes) {
      // Per-frame processing for keyframed effects
      for (let frame = overlapStart; frame < overlapEnd; frame++) {
        const resolvedSettings = evaluateEffectBlock(block, frame);
        const processed = entry.process(new Map(cf.data), resolvedSettings, {
          ...options,
          frame,
        });
        result.push({
          ...cf,
          id: generateContentFrameId(),
          name: `${cf.name} (f${frame})`,
          startFrame: frame,
          durationFrames: 1,
          data: processed.processedCells,
        });
      }
    } else {
      // Static effect — apply once to the whole overlap region
      const resolvedSettings = evaluateEffectBlock(block, overlapStart);
      const processed = entry.process(new Map(cf.data), resolvedSettings, {
        ...options,
        frame: overlapStart,
      });
      result.push({
        ...cf,
        id: generateContentFrameId(),
        name: cf.name,
        startFrame: overlapStart,
        durationFrames: overlapEnd - overlapStart,
        data: processed.processedCells,
      });
    }

    // Part after effect ends
    if (cfEnd > blockEnd) {
      result.push({
        ...cf,
        id: generateContentFrameId(),
        name: cf.name,
        startFrame: blockEnd,
        durationFrames: cfEnd - blockEnd,
        data: new Map(cf.data),
      });
    }
  }

  return result;
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
