/**
 * Effect Keyframe Interpolation
 *
 * Extends the existing keyframe interpolation system for effect properties.
 * - Numeric properties: reuse cubic bezier interpolation from easing.ts
 * - Hold properties (mappings, enums, booleans): snap to most recent keyframe
 */

import type { EffectKeyframe, EffectPropertyTrack, EffectPropertyDefinition } from '../types/effectBlock';
import { evaluateEasing } from '../types/easing';

/**
 * Interpolate a numeric value between two effect keyframes.
 */
function interpolateNumeric(kfA: EffectKeyframe, kfB: EffectKeyframe, frame: number): number {
  const valueA = kfA.value as number;
  const valueB = kfB.value as number;

  if (kfA.frame === kfB.frame) return valueA;

  const progress = (frame - kfA.frame) / (kfB.frame - kfA.frame);
  const easedProgress = evaluateEasing(progress, kfA.easing);

  return valueA + (valueB - valueA) * easedProgress;
}

/**
 * Get the most recent keyframe value at or before the given frame (hold interpolation).
 * Used for non-numeric properties: mappings, enums, booleans, strings.
 */
function holdInterpolate(
  sortedKeyframes: EffectKeyframe[],
  frame: number,
): EffectKeyframe['value'] {
  if (sortedKeyframes.length === 0) return 0;

  // Before first keyframe: hold first value
  if (frame <= sortedKeyframes[0].frame) return sortedKeyframes[0].value;

  // Find the most recent keyframe at or before frame
  for (let i = sortedKeyframes.length - 1; i >= 0; i--) {
    if (sortedKeyframes[i].frame <= frame) {
      return sortedKeyframes[i].value;
    }
  }

  return sortedKeyframes[0].value;
}

/**
 * Interpolate an effect property track at a given frame.
 *
 * @param track - The effect property track with keyframes
 * @param frame - Target frame number
 * @param definition - Property definition (determines interpolation mode)
 * @returns Interpolated value
 */
export function interpolateEffectProperty(
  track: EffectPropertyTrack,
  frame: number,
  definition: EffectPropertyDefinition,
): EffectKeyframe['value'] {
  const keyframes = track.keyframes;
  if (keyframes.length === 0) return definition.defaultValue;
  if (keyframes.length === 1) return keyframes[0].value;

  // Sort by frame (should already be sorted)
  const sorted = [...keyframes].sort((a, b) => a.frame - b.frame);

  // Handle looping
  const effectiveFrame = track.loopKeyframes
    ? wrapFrame(sorted, frame)
    : frame;

  // Hold interpolation for non-numeric types
  if (definition.interpolation === 'hold') {
    return holdInterpolate(sorted, effectiveFrame);
  }

  // Numeric interpolation
  return interpolateNumericTrack(sorted, effectiveFrame);
}

/**
 * Numeric interpolation through sorted keyframes.
 */
function interpolateNumericTrack(sorted: EffectKeyframe[], frame: number): number {
  const firstKf = sorted[0];
  const lastKf = sorted[sorted.length - 1];

  // Before first keyframe: hold
  if (frame <= firstKf.frame) return firstKf.value as number;

  // After last keyframe: hold
  if (frame >= lastKf.frame) return lastKf.value as number;

  // Find surrounding keyframes
  for (let i = 0; i < sorted.length - 1; i++) {
    if (frame >= sorted[i].frame && frame <= sorted[i + 1].frame) {
      return interpolateNumeric(sorted[i], sorted[i + 1], frame);
    }
  }

  return lastKf.value as number;
}

/**
 * Wrap a frame number into the keyframe loop range.
 */
function wrapFrame(sorted: EffectKeyframe[], frame: number): number {
  if (sorted.length < 2) return frame;
  const first = sorted[0].frame;
  const last = sorted[sorted.length - 1].frame;
  const duration = last - first;
  if (duration <= 0) return frame;
  return first + (((frame - first) % duration) + duration) % duration;
}
