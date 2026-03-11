/**
 * Effect Registry Tests
 *
 * Tests for src/registry/effectRegistry.ts and built-in effect registrations.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerEffect,
  getEffect,
  getAllEffects,
  getEffectsByCategory,
  isEffectRegistered,
  clearEffectRegistry,
} from '../registry/effectRegistry';
import { registerAllEffects } from '../registry/effects';
import type { EffectRegistryEntry } from '../registry/effectRegistry';
import { BarChart3 } from 'lucide-react';

describe('effectRegistry', () => {
  beforeEach(() => {
    clearEffectRegistry();
  });

  describe('registerEffect', () => {
    it('registers a new effect', () => {
      const entry: EffectRegistryEntry = {
        type: 'test-effect',
        name: 'Test Effect',
        icon: BarChart3,
        category: 'filter',
        description: 'A test effect',
        defaultSettings: { strength: 50 },
        propertyDefinitions: [],
        process: (cells) => ({ processedCells: new Map(cells), affectedCells: 0 }),
      };
      registerEffect(entry);
      expect(isEffectRegistered('test-effect')).toBe(true);
    });

    it('throws on duplicate registration', () => {
      const entry: EffectRegistryEntry = {
        type: 'dup',
        name: 'Dup',
        icon: BarChart3,
        category: 'filter',
        description: '',
        defaultSettings: {},
        propertyDefinitions: [],
        process: (cells) => ({ processedCells: new Map(cells), affectedCells: 0 }),
      };
      registerEffect(entry);
      expect(() => registerEffect(entry)).toThrow('already registered');
    });
  });

  describe('getEffect', () => {
    it('returns undefined for unregistered type', () => {
      expect(getEffect('nonexistent')).toBeUndefined();
    });

    it('returns the entry for a registered type', () => {
      const entry: EffectRegistryEntry = {
        type: 'my-fx',
        name: 'My FX',
        icon: BarChart3,
        category: 'adjustment',
        description: '',
        defaultSettings: { val: 1 },
        propertyDefinitions: [],
        process: (cells) => ({ processedCells: new Map(cells), affectedCells: 0 }),
      };
      registerEffect(entry);
      const result = getEffect('my-fx');
      expect(result).toBeDefined();
      expect(result!.name).toBe('My FX');
      expect(result!.defaultSettings).toEqual({ val: 1 });
    });
  });

  describe('getAllEffects', () => {
    it('returns empty array when registry is empty', () => {
      expect(getAllEffects()).toHaveLength(0);
    });
  });

  describe('getEffectsByCategory', () => {
    it('filters by category', () => {
      registerEffect({
        type: 'a1', name: 'A1', icon: BarChart3, category: 'adjustment', description: '',
        defaultSettings: {}, propertyDefinitions: [],
        process: (cells) => ({ processedCells: new Map(cells), affectedCells: 0 }),
      });
      registerEffect({
        type: 'f1', name: 'F1', icon: BarChart3, category: 'filter', description: '',
        defaultSettings: {}, propertyDefinitions: [],
        process: (cells) => ({ processedCells: new Map(cells), affectedCells: 0 }),
      });
      expect(getEffectsByCategory('adjustment')).toHaveLength(1);
      expect(getEffectsByCategory('filter')).toHaveLength(1);
      expect(getEffectsByCategory('mapping')).toHaveLength(0);
    });
  });

  describe('registerAllEffects', () => {
    it('registers all 7 built-in effects', () => {
      registerAllEffects();
      const all = getAllEffects();
      expect(all).toHaveLength(7);
    });

    it('includes expected effect types', () => {
      registerAllEffects();
      expect(isEffectRegistered('levels')).toBe(true);
      expect(isEffectRegistered('hue-saturation')).toBe(true);
      expect(isEffectRegistered('remap-colors')).toBe(true);
      expect(isEffectRegistered('remap-characters')).toBe(true);
      expect(isEffectRegistered('scatter')).toBe(true);
      expect(isEffectRegistered('wave-warp')).toBe(true);
      expect(isEffectRegistered('wiggle')).toBe(true);
    });

    it('is idempotent (safe to call multiple times)', () => {
      registerAllEffects();
      registerAllEffects();
      expect(getAllEffects()).toHaveLength(7);
    });

    it('each effect has property definitions', () => {
      registerAllEffects();
      for (const effect of getAllEffects()) {
        expect(effect.propertyDefinitions.length).toBeGreaterThan(0);
      }
    });

    it('each effect has a process function', () => {
      registerAllEffects();
      for (const effect of getAllEffects()) {
        expect(typeof effect.process).toBe('function');
      }
    });
  });
});
