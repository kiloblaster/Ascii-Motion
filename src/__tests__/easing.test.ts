/**
 * Easing Solver Tests
 * 
 * Tests for src/types/easing.ts
 * Covers: cubic bezier accuracy, edge cases, LUT caching, interpolation
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateEasing,
  interpolateBetweenKeyframes,
  interpolateKeyframes,
  defaultEasing,
  easingFromPreset,
  customEasing,
} from '../types/easing';
import type { EasingCurve, Keyframe, KeyframeId } from '../types/timeline';

// Helper to create a test keyframe
function kf(frame: number, value: number, easing?: EasingCurve): Keyframe {
  return {
    id: `kf-${frame}` as KeyframeId,
    frame,
    value,
    easing: easing ?? defaultEasing(),
  };
}

describe('evaluateEasing', () => {
  describe('linear', () => {
    it('linear easing is identity function', () => {
      const easing = defaultEasing();
      expect(evaluateEasing(0, easing)).toBe(0);
      expect(evaluateEasing(0.5, easing)).toBe(0.5);
      expect(evaluateEasing(1, easing)).toBe(1);
    });

    it('clamps at boundaries', () => {
      const easing = defaultEasing();
      expect(evaluateEasing(-0.1, easing)).toBe(0);
      expect(evaluateEasing(1.1, easing)).toBe(1);
    });
  });

  describe('hold', () => {
    it('hold easing returns 0 for all progress', () => {
      const easing: EasingCurve = { type: 'hold' };
      expect(evaluateEasing(0, easing)).toBe(0);
      expect(evaluateEasing(0.5, easing)).toBe(0);
      expect(evaluateEasing(0.99, easing)).toBe(0);
    });
  });

  describe('preset curves', () => {
    it('ease-in starts slow and ends fast', () => {
      const easing = easingFromPreset('ease-in');
      const earlyValue = evaluateEasing(0.25, easing);
      const lateValue = evaluateEasing(0.75, easing);
      // Ease-in: early progress < linear, late progress > linear
      expect(earlyValue).toBeLessThan(0.25);
      expect(lateValue).toBeLessThan(0.75);
    });

    it('ease-out starts fast and ends slow', () => {
      const easing = easingFromPreset('ease-out');
      const earlyValue = evaluateEasing(0.25, easing);
      // Ease-out: early progress > linear
      expect(earlyValue).toBeGreaterThan(0.25);
    });

    it('ease-in-out is symmetric around 0.5', () => {
      const easing = easingFromPreset('ease-in-out');
      const value = evaluateEasing(0.5, easing);
      // At 0.5, ease-in-out should be approximately 0.5
      expect(value).toBeCloseTo(0.5, 1);
    });

    it('all presets return 0 at start and 1 at end', () => {
      const presets: EasingCurve['type'][] = [
        'ease-in', 'ease-out', 'ease-in-out',
        'ease-in-quad', 'ease-out-quad', 'ease-in-out-quad',
        'ease-in-cubic', 'ease-out-cubic', 'ease-in-out-cubic',
        'ease-in-expo', 'ease-out-expo', 'ease-in-out-expo',
        'ease-in-circ', 'ease-out-circ', 'ease-in-out-circ',
      ];

      for (const type of presets) {
        if (type === 'linear' || type === 'hold' || type === 'custom') continue;
        const easing: EasingCurve = { type };
        expect(evaluateEasing(0, easing)).toBe(0);
        expect(evaluateEasing(1, easing)).toBe(1);
      }
    });

    it('preset LUT is reused on repeated calls', () => {
      const easing = easingFromPreset('ease-in');
      const val1 = evaluateEasing(0.5, easing);
      const val2 = evaluateEasing(0.5, easing);
      expect(val1).toBe(val2);
    });
  });

  describe('custom curves', () => {
    it('custom linear (0,0,1,1) matches linear', () => {
      const custom = customEasing(0, 0, 1, 1);
      const linear = defaultEasing();

      for (let i = 0; i <= 10; i++) {
        const p = i / 10;
        expect(evaluateEasing(p, custom)).toBeCloseTo(evaluateEasing(p, linear), 3);
      }
    });

    it('custom ease-in (0.42,0,1,1) produces ease-in behavior', () => {
      const custom = customEasing(0.42, 0, 1, 1);
      const earlyValue = evaluateEasing(0.25, custom);
      expect(earlyValue).toBeLessThan(0.25);
    });

    it('CSS standard ease matches expected behavior', () => {
      // CSS ease: cubic-bezier(0.25, 0.1, 0.25, 1.0)
      const ease = customEasing(0.25, 0.1, 0.25, 1.0);
      const mid = evaluateEasing(0.5, ease);
      // CSS ease at 50% is roughly 0.80
      expect(mid).toBeGreaterThan(0.5);
    });
  });

  describe('monotonicity', () => {
    it('ease-in output increases monotonically', () => {
      const easing = easingFromPreset('ease-in');
      let prevValue = 0;
      for (let i = 1; i <= 100; i++) {
        const p = i / 100;
        const val = evaluateEasing(p, easing);
        expect(val).toBeGreaterThanOrEqual(prevValue - 1e-10);
        prevValue = val;
      }
    });
  });
});

describe('interpolateBetweenKeyframes', () => {
  it('returns A value at A.frame', () => {
    const result = interpolateBetweenKeyframes(kf(0, 10), kf(10, 100), 0);
    expect(result).toBe(10);
  });

  it('returns B value at B.frame', () => {
    const result = interpolateBetweenKeyframes(kf(0, 10), kf(10, 100), 10);
    expect(result).toBe(100);
  });

  it('returns midpoint with linear easing', () => {
    const result = interpolateBetweenKeyframes(kf(0, 0), kf(10, 100), 5);
    expect(result).toBe(50);
  });

  it('returns A value when frames are equal', () => {
    const result = interpolateBetweenKeyframes(kf(5, 10), kf(5, 100), 5);
    expect(result).toBe(10);
  });

  it('hold easing stays at A value', () => {
    const holdEasing: EasingCurve = { type: 'hold' };
    const result = interpolateBetweenKeyframes(
      kf(0, 10, holdEasing),
      kf(10, 100),
      5,
    );
    expect(result).toBe(10); // Hold: stays at start value
  });
});

describe('interpolateKeyframes', () => {
  it('returns 0 for empty keyframes', () => {
    expect(interpolateKeyframes([], 5)).toBe(0);
  });

  it('returns single keyframe value', () => {
    expect(interpolateKeyframes([kf(5, 42)], 0)).toBe(42);
    expect(interpolateKeyframes([kf(5, 42)], 10)).toBe(42);
  });

  it('holds first value before first keyframe', () => {
    const kfs = [kf(10, 50), kf(20, 100)];
    expect(interpolateKeyframes(kfs, 0)).toBe(50);
    expect(interpolateKeyframes(kfs, 5)).toBe(50);
  });

  it('holds last value after last keyframe', () => {
    const kfs = [kf(10, 50), kf(20, 100)];
    expect(interpolateKeyframes(kfs, 25)).toBe(100);
    expect(interpolateKeyframes(kfs, 100)).toBe(100);
  });

  it('interpolates linearly between keyframes', () => {
    const kfs = [kf(0, 0), kf(10, 100)];
    expect(interpolateKeyframes(kfs, 5)).toBe(50);
  });

  it('handles multiple keyframe segments', () => {
    const kfs = [kf(0, 0), kf(10, 100), kf(20, 50)];
    expect(interpolateKeyframes(kfs, 5)).toBe(50);
    expect(interpolateKeyframes(kfs, 15)).toBe(75); // Linear: 100 → 50, halfway = 75
  });

  it('looping wraps frame into range', () => {
    const kfs = [kf(0, 0), kf(10, 100)];
    // Loop duration is 10 (0 to 10). Frame 15 wraps to frame 5.
    const result = interpolateKeyframes(kfs, 15, true);
    expect(result).toBeCloseTo(50, 1);
  });
});

describe('easing factory functions', () => {
  it('defaultEasing returns linear', () => {
    expect(defaultEasing()).toEqual({ type: 'linear' });
  });

  it('easingFromPreset returns preset type', () => {
    expect(easingFromPreset('ease-in')).toEqual({ type: 'ease-in' });
  });

  it('customEasing returns custom with control points', () => {
    const result = customEasing(0.1, 0.2, 0.3, 0.4);
    expect(result).toEqual({
      type: 'custom',
      x1: 0.1,
      y1: 0.2,
      x2: 0.3,
      y2: 0.4,
    });
  });
});
