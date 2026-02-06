/**
 * Easing Curve Utilities
 * 
 * Provides cubic bezier interpolation, Newton-Raphson solving,
 * and LUT caching for preset easing curves.
 * 
 * Part of the Layer Timeline Refactor (v2.0.0)
 * See: docs/LAYER_TIMELINE_REFACTOR_PLAN.md §4.1
 */

import type { EasingCurve, EasingPreset, Keyframe } from './timeline';
import { EASING_PRESETS } from './timeline';

// ============================================
// CUBIC BEZIER SOLVER
// ============================================

/**
 * Newton-Raphson iteration limit to prevent infinite loops.
 */
const NEWTON_ITERATIONS = 8;

/**
 * Precision threshold for Newton-Raphson convergence.
 */
const NEWTON_EPSILON = 1e-7;

/**
 * Subdivision precision for fallback bisection method.
 */
const SUBDIVISION_PRECISION = 1e-7;
const SUBDIVISION_MAX_ITERATIONS = 10;

/**
 * Evaluate cubic bezier at parameter t.
 * B(t) = 3*(1-t)^2*t*p1 + 3*(1-t)*t^2*p2 + t^3
 */
function cubicBezier(t: number, p1: number, p2: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  const mt = 1 - t;
  const mt2 = mt * mt;
  return 3 * mt2 * t * p1 + 3 * mt * t2 * p2 + t3;
}

/**
 * Derivative of cubic bezier at parameter t.
 * B'(t) = 3*(1-t)^2*p1 + 6*(1-t)*t*(p2-p1) + 3*t^2*(1-p2)
 */
function cubicBezierDerivative(t: number, p1: number, p2: number): number {
  const mt = 1 - t;
  return 3 * mt * mt * p1 + 6 * mt * t * (p2 - p1) + 3 * t * t * (1 - p2);
}

/**
 * Find parameter t for a given x value using Newton-Raphson method.
 * Falls back to bisection if Newton-Raphson fails to converge.
 */
function solveCubicBezierX(x: number, x1: number, x2: number): number {
  // Edge cases
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  // Newton-Raphson iteration
  let t = x; // Initial guess: t ≈ x for most curves
  for (let i = 0; i < NEWTON_ITERATIONS; i++) {
    const currentX = cubicBezier(t, x1, x2) - x;
    if (Math.abs(currentX) < NEWTON_EPSILON) {
      return t;
    }
    const derivative = cubicBezierDerivative(t, x1, x2);
    if (Math.abs(derivative) < 1e-12) {
      break; // Derivative too small, fall through to bisection
    }
    t -= currentX / derivative;
  }

  // Fallback: bisection method
  let a = 0;
  let b = 1;
  t = x;
  for (let i = 0; i < SUBDIVISION_MAX_ITERATIONS; i++) {
    const currentX = cubicBezier(t, x1, x2) - x;
    if (Math.abs(currentX) < SUBDIVISION_PRECISION) {
      return t;
    }
    if (currentX > 0) {
      b = t;
    } else {
      a = t;
    }
    t = (a + b) / 2;
  }

  return t;
}

// ============================================
// LUT CACHE FOR PRESETS
// ============================================

/**
 * Lookup table size for preset easing curves.
 * 256 entries gives sub-pixel precision at 60fps.
 */
const LUT_SIZE = 256;

/**
 * Cached lookup tables for preset easing curves.
 * Key: preset name, Value: pre-computed Y values for evenly-spaced X inputs.
 */
const presetLUTs = new Map<EasingPreset, Float64Array>();

/**
 * Build a lookup table for a preset easing curve.
 */
function buildLUT(x1: number, y1: number, x2: number, y2: number): Float64Array {
  const lut = new Float64Array(LUT_SIZE + 1);
  for (let i = 0; i <= LUT_SIZE; i++) {
    const x = i / LUT_SIZE;
    const t = solveCubicBezierX(x, x1, x2);
    lut[i] = cubicBezier(t, y1, y2);
  }
  return lut;
}

/**
 * Get Y value from a LUT for a given X.
 * Uses linear interpolation between LUT entries.
 */
function lookupLUT(lut: Float64Array, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  const pos = x * LUT_SIZE;
  const index = Math.floor(pos);
  const frac = pos - index;

  if (index >= LUT_SIZE) return lut[LUT_SIZE];

  // Linear interpolation between LUT entries
  return lut[index] + frac * (lut[index + 1] - lut[index]);
}

/**
 * Get or create a LUT for a preset easing curve.
 */
function getPresetLUT(preset: EasingPreset): Float64Array {
  let lut = presetLUTs.get(preset);
  if (!lut) {
    const [x1, y1, x2, y2] = EASING_PRESETS[preset];
    lut = buildLUT(x1, y1, x2, y2);
    presetLUTs.set(preset, lut);
  }
  return lut;
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Evaluate an easing curve at a given progress (0-1).
 * Uses LUT for presets (fast), Newton-Raphson for custom curves.
 * 
 * @param progress - Input progress value (0 to 1, representing time)
 * @param easing - The easing curve definition
 * @returns Output progress value (0 to 1, representing value interpolation)
 */
export function evaluateEasing(progress: number, easing: EasingCurve): number {
  // Clamp input
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;

  // Hold: no interpolation
  if (easing.type === 'hold') {
    return 0; // Stay at start value until next keyframe
  }

  // Linear: identity
  if (easing.type === 'linear') {
    return progress;
  }

  // Preset: use cached LUT
  if (easing.type !== 'custom') {
    const lut = getPresetLUT(easing.type);
    return lookupLUT(lut, progress);
  }

  // Custom: use Newton-Raphson
  const x1 = easing.x1 ?? 0;
  const y1 = easing.y1 ?? 0;
  const x2 = easing.x2 ?? 1;
  const y2 = easing.y2 ?? 1;

  const t = solveCubicBezierX(progress, x1, x2);
  return cubicBezier(t, y1, y2);
}

/**
 * Interpolate between two keyframes at a given frame.
 * Returns the interpolated value.
 * 
 * @param kfA - The keyframe before (or at) the target frame
 * @param kfB - The keyframe after the target frame
 * @param frame - The target frame to interpolate at
 * @returns Interpolated value
 */
export function interpolateBetweenKeyframes(
  kfA: Keyframe,
  kfB: Keyframe,
  frame: number,
): number {
  const valueA = kfA.value as number;
  const valueB = kfB.value as number;

  // Same frame: return first keyframe value
  if (kfA.frame === kfB.frame) return valueA;

  // Calculate progress through the keyframe range
  const progress = (frame - kfA.frame) / (kfB.frame - kfA.frame);

  // Apply easing from keyframe A (easing controls interpolation TO next keyframe)
  const easedProgress = evaluateEasing(progress, kfA.easing);

  // Linear interpolation with eased progress
  return valueA + (valueB - valueA) * easedProgress;
}

/**
 * Get the interpolated value of a property track at a given frame.
 * Handles edge cases: no keyframes, single keyframe, looping, etc.
 * 
 * @param keyframes - Sorted array of keyframes on the track
 * @param frame - Target frame number
 * @param loopKeyframes - Whether keyframes should loop
 * @returns Interpolated value
 */
export function interpolateKeyframes(
  keyframes: Keyframe[],
  frame: number,
  loopKeyframes: boolean = false,
): number {
  if (keyframes.length === 0) return 0;
  if (keyframes.length === 1) return keyframes[0].value as number;

  // Sort by frame (should already be sorted, but ensure)
  const sorted = [...keyframes].sort((a, b) => a.frame - b.frame);

  const firstKf = sorted[0];
  const lastKf = sorted[sorted.length - 1];

  // Handle looping
  if (loopKeyframes && lastKf.frame > firstKf.frame) {
    const loopDuration = lastKf.frame - firstKf.frame;
    // Wrap frame into the keyframe range
    const wrappedFrame = firstKf.frame + ((frame - firstKf.frame) % loopDuration + loopDuration) % loopDuration;
    return interpolateKeyframesNonLooping(sorted, wrappedFrame);
  }

  return interpolateKeyframesNonLooping(sorted, frame);
}

/**
 * Internal: interpolate without loop wrapping.
 */
function interpolateKeyframesNonLooping(sorted: Keyframe[], frame: number): number {
  const firstKf = sorted[0];
  const lastKf = sorted[sorted.length - 1];

  // Before first keyframe: hold first value
  if (frame <= firstKf.frame) return firstKf.value as number;

  // After last keyframe: hold last value
  if (frame >= lastKf.frame) return lastKf.value as number;

  // Find surrounding keyframes
  for (let i = 0; i < sorted.length - 1; i++) {
    const kfA = sorted[i];
    const kfB = sorted[i + 1];
    if (frame >= kfA.frame && frame <= kfB.frame) {
      return interpolateBetweenKeyframes(kfA, kfB, frame);
    }
  }

  // Fallback (should not reach here)
  return lastKf.value as number;
}

/**
 * Get the default easing curve (linear).
 */
export function defaultEasing(): EasingCurve {
  return { type: 'linear' };
}

/**
 * Create an easing curve from a preset name.
 */
export function easingFromPreset(preset: EasingPreset): EasingCurve {
  return { type: preset };
}

/**
 * Create a custom cubic bezier easing curve.
 */
export function customEasing(x1: number, y1: number, x2: number, y2: number): EasingCurve {
  return { type: 'custom', x1, y1, x2, y2 };
}
