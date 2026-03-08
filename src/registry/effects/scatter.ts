/**
 * Scatter Effect — Registry Entry
 */

import { ScatterChart } from 'lucide-react';
import type { EffectRegistryEntry } from '../effectRegistry';
import type { EffectPropertyDefinition } from '../../types/effectBlock';
import type { ScatterEffectSettings } from '../../types/effects';
import { DEFAULT_SCATTER_SETTINGS } from '../../constants/effectsDefaults';
import { processScatterEffect } from '../../utils/effectsProcessing';

const propertyDefinitions: EffectPropertyDefinition[] = [
  {
    path: 'strength',
    displayName: 'Strength',
    category: 'Scatter',
    valueType: 'number',
    defaultValue: 50,
    interpolation: 'numeric',
    min: 0,
    max: 100,
    step: 1,
    unit: '%',
  },
  {
    path: 'scatterType',
    displayName: 'Pattern',
    category: 'Scatter',
    valueType: 'select',
    defaultValue: 'noise',
    interpolation: 'hold',
    options: [
      { label: 'Noise', value: 'noise' },
      { label: 'Bayer 2×2', value: 'bayer-2x2' },
      { label: 'Bayer 4×4', value: 'bayer-4x4' },
      { label: 'Gaussian', value: 'gaussian' },
    ],
  },
  {
    path: 'seed',
    displayName: 'Seed',
    category: 'Scatter',
    valueType: 'number',
    defaultValue: 0,
    interpolation: 'numeric',
    min: 0,
    max: 9999,
    step: 1,
  },
  {
    path: 'blendColors',
    displayName: 'Blend Colors',
    category: 'Scatter',
    valueType: 'boolean',
    defaultValue: false,
    interpolation: 'hold',
  },
];

export const scatterEffect: EffectRegistryEntry = {
  type: 'scatter',
  name: 'Scatter',
  icon: ScatterChart,
  category: 'filter',
  description: 'Randomly scatter characters with customizable patterns',
  defaultSettings: { ...DEFAULT_SCATTER_SETTINGS } as unknown as Record<string, unknown>,
  propertyDefinitions,
  process: (cells, settings, options) => {
    const cellsToProcess = options?.selectionMask?.size
      ? new Map([...cells].filter(([key]) => options.selectionMask!.has(key)))
      : cells;
    const result = processScatterEffect(cellsToProcess, settings as unknown as ScatterEffectSettings, options?.canvasBackgroundColor ?? '#000000');
    if (options?.selectionMask?.size) {
      const merged = new Map(cells);
      result.processedCells.forEach((cell, key) => merged.set(key, cell));
      return { processedCells: merged, affectedCells: result.affectedCells };
    }
    return result;
  },
};
