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
import { processEffect } from '../../utils/effectsProcessing';

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
    displayName: 'Midtones (Gamma)',
    category: 'Input Levels',
    valueType: 'number',
    defaultValue: 1.0,
    interpolation: 'numeric',
    min: 0.1,
    max: 3.0,
    step: 0.01,
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
  {
    path: 'gamma',
    displayName: 'Gamma',
    category: 'Advanced',
    valueType: 'number',
    defaultValue: 1.0,
    interpolation: 'numeric',
    min: 0.1,
    max: 3.0,
    step: 0.01,
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
  process: async (cells, settings, options) => {
    const result = await processEffect(
      'levels',
      cells,
      settings as unknown as LevelsEffectSettings,
      options?.canvasBackgroundColor ?? '#000000',
      options?.selectionMask ? { selectionMask: options.selectionMask } : undefined,
    );
    return {
      processedCells: result.processedCells ?? new Map(cells),
      affectedCells: result.affectedCells,
    };
  },
};
