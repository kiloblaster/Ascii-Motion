/**
 * Hue & Saturation Effect — Registry Entry
 */

import { Palette } from 'lucide-react';
import type { EffectRegistryEntry } from '../effectRegistry';
import type { EffectPropertyDefinition } from '../../types/effectBlock';
import type { HueSaturationEffectSettings } from '../../types/effects';
import { DEFAULT_HUE_SATURATION_SETTINGS } from '../../constants/effectsDefaults';
import { processHueSaturationEffect } from '../../utils/effectsProcessing';

const propertyDefinitions: EffectPropertyDefinition[] = [
  {
    path: 'hue',
    displayName: 'Hue',
    category: 'Adjustments',
    valueType: 'number',
    defaultValue: 0,
    interpolation: 'numeric',
    min: -180,
    max: 180,
    step: 1,
    unit: '°',
  },
  {
    path: 'saturation',
    displayName: 'Saturation',
    category: 'Adjustments',
    valueType: 'number',
    defaultValue: 0,
    interpolation: 'numeric',
    min: -100,
    max: 100,
    step: 1,
  },
  {
    path: 'lightness',
    displayName: 'Lightness',
    category: 'Adjustments',
    valueType: 'number',
    defaultValue: 0,
    interpolation: 'numeric',
    min: -100,
    max: 100,
    step: 1,
  },
];

export const hueSaturationEffect: EffectRegistryEntry = {
  type: 'hue-saturation',
  name: 'Hue & Saturation',
  icon: Palette,
  category: 'adjustment',
  description: 'Modify hue, saturation, and lightness',
  defaultSettings: { ...DEFAULT_HUE_SATURATION_SETTINGS } as unknown as Record<string, unknown>,
  propertyDefinitions,
  process: (cells, settings, options) => {
    const cellsToProcess = options?.selectionMask?.size
      ? new Map([...cells].filter(([key]) => options.selectionMask!.has(key)))
      : cells;
    const result = processHueSaturationEffect(cellsToProcess, settings as unknown as HueSaturationEffectSettings);
    if (options?.selectionMask?.size) {
      const merged = new Map(cells);
      result.processedCells.forEach((cell, key) => merged.set(key, cell));
      return { processedCells: merged, affectedCells: result.affectedCells };
    }
    return result;
  },
};
