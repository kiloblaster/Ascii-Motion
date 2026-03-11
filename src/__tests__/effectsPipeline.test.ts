/**
 * Effects Pipeline Tests
 *
 * Tests for src/utils/effectsPipeline.ts — evaluation, z-order, time gating,
 * keyframe interpolation, and bake.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  evaluateEffectBlock,
  applyEffectsToLayer,
  hasActiveEffectsAtFrame,
  bakeEffectIntoFrames,
} from '../utils/effectsPipeline';
import { clearEffectRegistry, registerEffect } from '../registry/effectRegistry';
import type { EffectRegistryEntry } from '../registry/effectRegistry';
import type { EffectBlock, EffectTrack } from '../types/effectBlock';
import type { ContentFrame } from '../types/timeline';
import type { Cell } from '../types';
import { BarChart3 } from 'lucide-react';
import { defaultEasing } from '../types/easing';

// ============================================
// Test helpers
// ============================================

function makeCell(char: string, color = '#ffffff', bgColor = '#000000'): Cell {
  return { char, color, bgColor };
}

function makeCells(entries: [string, Cell][]): Map<string, Cell> {
  return new Map(entries);
}

function makeBlock(overrides: Partial<EffectBlock> = {}): EffectBlock {
  return {
    id: 'eb-test' as EffectBlock['id'],
    effectType: 'test-invert',
    startFrame: 0,
    durationFrames: 10,
    enabled: true,
    settings: {},
    propertyTracks: [],
    ...overrides,
  };
}

function makeTrack(blockOverrides: Partial<EffectBlock> = {}, trackOverrides: Partial<EffectTrack> = {}): EffectTrack {
  return {
    id: 'et-test' as EffectTrack['id'],
    ownerId: null,
    effectBlock: makeBlock(blockOverrides),
    collapsed: true,
    ...trackOverrides,
  };
}

/** A simple test effect that inverts colors */
const testInvertEffect: EffectRegistryEntry = {
  type: 'test-invert',
  name: 'Test Invert',
  icon: BarChart3,
  category: 'adjustment',
  description: 'Inverts colors for testing',
  defaultSettings: { amount: 1.0 },
  propertyDefinitions: [
    { path: 'amount', displayName: 'Amount', category: 'Test', valueType: 'number', defaultValue: 1.0, interpolation: 'numeric', min: 0, max: 1, step: 0.1 },
  ],
  process: (cells, settings) => {
    const amount = (settings.amount as number) ?? 1.0;
    const processedCells = new Map<string, Cell>();
    let affectedCells = 0;
    cells.forEach((cell, key) => {
      if (amount > 0) {
        processedCells.set(key, { ...cell, color: '#inverted' });
        affectedCells++;
      } else {
        processedCells.set(key, cell);
      }
    });
    return { processedCells, affectedCells };
  },
};

/** A second test effect that uppercases characters */
const testUppercaseEffect: EffectRegistryEntry = {
  type: 'test-uppercase',
  name: 'Test Uppercase',
  icon: BarChart3,
  category: 'filter',
  description: 'Uppercases chars for testing',
  defaultSettings: {},
  propertyDefinitions: [],
  process: (cells) => {
    const processedCells = new Map<string, Cell>();
    let affectedCells = 0;
    cells.forEach((cell, key) => {
      processedCells.set(key, { ...cell, char: cell.char.toUpperCase() });
      if (cell.char !== cell.char.toUpperCase()) affectedCells++;
    });
    return { processedCells, affectedCells };
  },
};

describe('effectsPipeline', () => {
  beforeEach(() => {
    clearEffectRegistry();
    registerEffect(testInvertEffect);
    registerEffect(testUppercaseEffect);
  });

  describe('evaluateEffectBlock', () => {
    it('returns static settings when no property tracks exist', () => {
      const block = makeBlock({ settings: { amount: 0.5 } });
      const result = evaluateEffectBlock(block, 5);
      expect(result.amount).toBe(0.5);
    });

    it('interpolates keyframed properties', () => {
      const block = makeBlock({
        settings: { amount: 0 },
        propertyTracks: [{
          id: 'ept-1' as import('../types/effectBlock').EffectPropertyTrackId,
          propertyPath: 'amount',
          keyframes: [
            { id: 'kf-1' as import('../types/timeline').KeyframeId, frame: 0, value: 0, easing: defaultEasing() },
            { id: 'kf-2' as import('../types/timeline').KeyframeId, frame: 10, value: 1.0, easing: defaultEasing() },
          ],
          loopKeyframes: false,
        }],
      });
      const at0 = evaluateEffectBlock(block, 0);
      expect(at0.amount).toBe(0);
      const at10 = evaluateEffectBlock(block, 10);
      expect(at10.amount).toBe(1.0);
      const at5 = evaluateEffectBlock(block, 5);
      expect(at5.amount).toBeCloseTo(0.5, 1);
    });
  });

  describe('hasActiveEffectsAtFrame', () => {
    it('returns false for empty tracks', () => {
      expect(hasActiveEffectsAtFrame([], 0)).toBe(false);
    });

    it('returns true when frame is in range of enabled block', () => {
      const tracks = [makeTrack({ startFrame: 5, durationFrames: 10 })];
      expect(hasActiveEffectsAtFrame(tracks, 7)).toBe(true);
    });

    it('returns false when frame is outside block range', () => {
      const tracks = [makeTrack({ startFrame: 5, durationFrames: 10 })];
      expect(hasActiveEffectsAtFrame(tracks, 20)).toBe(false);
    });

    it('returns false when block is disabled', () => {
      const tracks = [makeTrack({ startFrame: 0, durationFrames: 10, enabled: false })];
      expect(hasActiveEffectsAtFrame(tracks, 5)).toBe(false);
    });
  });

  describe('applyEffectsToLayer', () => {
    it('returns original cells when no tracks match', () => {
      const cells = makeCells([['0,0', makeCell('a')]]);
      const result = applyEffectsToLayer(cells, [], 0);
      expect(result.get('0,0')?.char).toBe('a');
    });

    it('applies enabled effect in time range', () => {
      const cells = makeCells([['0,0', makeCell('a')]]);
      const tracks = [makeTrack({ startFrame: 0, durationFrames: 10 })];
      const result = applyEffectsToLayer(cells, tracks, 5);
      expect(result.get('0,0')?.color).toBe('#inverted');
    });

    it('skips disabled effects', () => {
      const cells = makeCells([['0,0', makeCell('a')]]);
      const tracks = [makeTrack({ startFrame: 0, durationFrames: 10, enabled: false })];
      const result = applyEffectsToLayer(cells, tracks, 5);
      expect(result.get('0,0')?.color).toBe('#ffffff');
    });

    it('skips effects outside time range', () => {
      const cells = makeCells([['0,0', makeCell('a')]]);
      const tracks = [makeTrack({ startFrame: 20, durationFrames: 10 })];
      const result = applyEffectsToLayer(cells, tracks, 5);
      expect(result.get('0,0')?.color).toBe('#ffffff');
    });

    it('applies effects in z-order (first track applied first)', () => {
      const cells = makeCells([['0,0', makeCell('a')]]);
      const tracks = [
        makeTrack({ effectType: 'test-uppercase' }, { id: 'et-1' as EffectTrack['id'] }),
        makeTrack({ effectType: 'test-invert' }, { id: 'et-2' as EffectTrack['id'] }),
      ];
      const result = applyEffectsToLayer(cells, tracks, 5);
      // First uppercase, then invert — char should be 'A', color should be '#inverted'
      expect(result.get('0,0')?.char).toBe('A');
      expect(result.get('0,0')?.color).toBe('#inverted');
    });
  });

  describe('bakeEffectIntoFrames', () => {
    it('modifies content frame data within block range', () => {
      const cells = makeCells([['0,0', makeCell('a')]]);
      const contentFrames: ContentFrame[] = [{
        id: 'cf-1' as import('../types/timeline').ContentFrameId,
        name: 'Frame 1',
        startFrame: 0,
        durationFrames: 10,
        data: cells,
      }];
      const block = makeBlock({ startFrame: 0, durationFrames: 10, settings: { amount: 1.0 } });
      const result = bakeEffectIntoFrames(block, contentFrames);
      expect(result[0].data.get('0,0')?.color).toBe('#inverted');
    });

    it('skips content frames outside block range', () => {
      const cells = makeCells([['0,0', makeCell('a')]]);
      const contentFrames: ContentFrame[] = [{
        id: 'cf-1' as import('../types/timeline').ContentFrameId,
        name: 'Frame 1',
        startFrame: 20,
        durationFrames: 5,
        data: cells,
      }];
      const block = makeBlock({ startFrame: 0, durationFrames: 10 });
      const result = bakeEffectIntoFrames(block, contentFrames);
      expect(result[0].data.get('0,0')?.color).toBe('#ffffff');
    });
  });
});
