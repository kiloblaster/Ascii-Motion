/**
 * Post Effect Types
 *
 * GPU-accelerated post-processing effects applied as a final render pass
 * via WebGL shaders. These operate on pixels (not cells), making them
 * fundamentally different from the cell-based effects system.
 *
 * Post effects have their own timeline section, stacking order determines
 * render order, and they support full keyframe animation.
 */

import type { EasingCurve, KeyframeId } from './timeline';

// ============================================
// BRANDED ID TYPES
// ============================================

declare const __brand: unique symbol;
type Brand<T, B> = T & { [__brand]: B };

export type PostEffectBlockId = Brand<string, 'PostEffectBlockId'>;
export type PostEffectTrackId = Brand<string, 'PostEffectTrackId'>;
export type PostEffectPropertyTrackId = Brand<string, 'PostEffectPropertyTrackId'>;

// ============================================
// ID GENERATION HELPERS
// ============================================

let postEffectBlockCounter = 0;
let postEffectTrackCounter = 0;
let postEffectPropertyTrackCounter = 0;

export function generatePostEffectBlockId(): PostEffectBlockId {
  return `peb-${++postEffectBlockCounter}-${Date.now().toString(36)}` as PostEffectBlockId;
}

export function generatePostEffectTrackId(): PostEffectTrackId {
  return `pet-${++postEffectTrackCounter}-${Date.now().toString(36)}` as PostEffectTrackId;
}

export function generatePostEffectPropertyTrackId(): PostEffectPropertyTrackId {
  return `pept-${++postEffectPropertyTrackCounter}-${Date.now().toString(36)}` as PostEffectPropertyTrackId;
}

/**
 * Reset post effect ID counters — used in tests and when creating new projects.
 */
export function resetPostEffectIdCounters(): void {
  postEffectBlockCounter = 0;
  postEffectTrackCounter = 0;
  postEffectPropertyTrackCounter = 0;
}

// ============================================
// POST EFFECT KEYFRAME
// ============================================

/**
 * A keyframe on a post effect property track.
 * Reuses the same easing system as layer and effect keyframes.
 */
export interface PostEffectKeyframe {
  id: KeyframeId;
  frame: number;
  value: number | boolean | string;
  easing: EasingCurve;
}

// ============================================
// POST EFFECT PROPERTY TRACK
// ============================================

/**
 * A property track within a post effect block.
 * Stores keyframes for a single animatable shader uniform.
 */
export interface PostEffectPropertyTrack {
  id: PostEffectPropertyTrackId;
  propertyPath: string;
  keyframes: PostEffectKeyframe[];
  loopKeyframes: boolean;
}

// ============================================
// POST EFFECT BLOCK
// ============================================

/**
 * A post effect block on the timeline.
 * Represents a single GPU shader effect instance with a time range
 * and keyframeable properties that map to shader uniforms.
 */
export interface PostEffectBlock {
  id: PostEffectBlockId;
  postEffectType: string;

  // Timeline placement
  startFrame: number;
  durationFrames: number;

  // State
  enabled: boolean;

  // Shader uniform values (used when no keyframe track exists for a property)
  settings: Record<string, unknown>;

  // Per-property animation tracks within this post effect block
  propertyTracks: PostEffectPropertyTrack[];
}

// ============================================
// POST EFFECT TRACK
// ============================================

/**
 * A container for a post effect block on the global post-processing timeline.
 * Post effects are always global (no per-layer ownership).
 * Stacking order (array order) determines render order.
 */
export interface PostEffectTrack {
  id: PostEffectTrackId;

  /** The post effect block on this track */
  effectBlock: PostEffectBlock;

  /** Whether this track is collapsed in the timeline UI */
  collapsed: boolean;
}

// ============================================
// POST EFFECT PROPERTY DEFINITION
// ============================================

/**
 * Interpolation mode for post effect properties.
 * - 'numeric': standard cubic bezier interpolation between values
 * - 'hold': snap to the most recent keyframe value (for enums, booleans)
 */
export type PostEffectInterpolationMode = 'numeric' | 'hold';

/**
 * Metadata for a single animatable property (shader uniform) of a post effect.
 * Used by the UI to render controls and by the pipeline to interpolate values.
 */
export interface PostEffectPropertyDefinition {
  /** Property path / uniform name (e.g., 'intensity', 'radius') */
  path: string;

  /** Display name in the UI (e.g., 'Intensity', 'Blur Radius') */
  displayName: string;

  /** Category for UI grouping */
  category: string;

  /** Value type determines the UI control rendered */
  valueType: 'number' | 'boolean' | 'string' | 'color' | 'select';

  /** Default value when the effect is first created */
  defaultValue: number | boolean | string;

  /** Interpolation mode */
  interpolation: PostEffectInterpolationMode;

  // Numeric constraints
  min?: number;
  max?: number;
  step?: number;
  unit?: string;

  // Select options (for valueType: 'select')
  options?: Array<{ label: string; value: string }>;

  /** Conditional visibility — only show when another property matches one of the given values */
  visibleWhen?: { path: string; values: string[] };
}

// ============================================
// SERIALIZATION TYPES
// ============================================

/**
 * Serialized post effect keyframe for session files.
 */
export interface SessionPostEffectKeyframeV2 {
  id: string;
  frame: number;
  value: number | boolean | string;
  easing: EasingCurve;
}

/**
 * Serialized post effect property track for session files.
 */
export interface SessionPostEffectPropertyTrackV2 {
  id: string;
  propertyPath: string;
  keyframes: SessionPostEffectKeyframeV2[];
  loopKeyframes: boolean;
}

/**
 * Serialized post effect block for session files.
 */
export interface SessionPostEffectBlockV2 {
  id: string;
  postEffectType: string;
  startFrame: number;
  durationFrames: number;
  enabled: boolean;
  settings: Record<string, unknown>;
  propertyTracks: SessionPostEffectPropertyTrackV2[];
}

/**
 * Serialized post effect track for session files.
 */
export interface SessionPostEffectTrackV2 {
  id: string;
  effectBlock: SessionPostEffectBlockV2;
  collapsed: boolean;
}
