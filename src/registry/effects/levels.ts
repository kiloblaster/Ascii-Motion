/**
 * Levels Effect — Registry Entry
 *
 * Wraps the existing processLevelsEffect processor for the procedural effects pipeline.
 */

import { BarChart3 } from 'lucide-react';
import type { EffectRegistryEntry } from '../effectRegistry';
import type { EffectPropertyDefinition } from '../../types/effectBlock';
import type { LevelsEffectSettings } from '../../types/effects';
import { DEFAULT_LEVELS_SETTINGS } from '../../constants/effectsDefaults';
import { processLevelsEffect } from '../../utils/effectsProcessing';

const propertyDefinitions: EffectPropertyDefinition[] = [
  {
    path: 'shadowsInput',
    displayName: 'Shadows',
    category: 'Input Levels',
    valueType: 'number',
    defaultValue: 0,
    interpolation: 'numeric',
    min: 0,
    max: 255,
    step: 1,
  },
  {
    path: 'midtonesInput',
    displayName: 'Midtones',
    category: 'Input Levels',
    valueType: 'number',
    defaultValue: 50,
    interpolation: 'numeric',
    min: 0,
    max: 100,
    step: 1,
  },
  {
    path: 'highlightsInput',
    displayName: 'Highlights',
    category: 'Input Levels',
    valueType: 'number',
    defaultValue: 255,
    interpolation: 'numeric',
    min: 0,
    max: 255,
    step: 1,
  },
  {
    path: 'outputMin',
    displayName: 'Output Min',
    category: 'Output Levels',
    valueType: 'number',
    defaultValue: 0,
    interpolation: 'numeric',
    min: 0,
    max: 255,
    step: 1,
  },
  {
    path: 'outputMax',
    displayName: 'Output Max',
    category: 'Output Levels',
    valueType: 'number',
    defaultValue: 255,
    interpolation: 'numeric',
    min: 0,
    max: 255,
    step: 1,
  },

];

export const levelsEffect: EffectRegistryEntry = {
  type: 'levels',
  name: 'Levels',
  icon: BarChart3,
  category: 'adjustment',
  description: 'Adjust brightness, contrast, and color ranges',
  defaultSettings: { ...DEFAULT_LEVELS_SETTINGS } as unknown as Record<string, unknown>,
  propertyDefinitions,
  process: (cells, settings, options) => {
    const cellsToProcess = options?.selectionMask?.size
      ? new Map([...cells].filter(([key]) => options.selectionMask!.has(key)))
      : cells;
    const result = processLevelsEffect(cellsToProcess, settings as unknown as LevelsEffectSettings);
    if (options?.selectionMask?.size) {
      const merged = new Map(cells);
      result.processedCells.forEach((cell, key) => merged.set(key, cell));
      return { processedCells: merged, affectedCells: result.affectedCells };
    }
    return result;
  },
};
