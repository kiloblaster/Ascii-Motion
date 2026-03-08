/**
 * Hue & Saturation Effect — Registry Entry
 */

import { Palette } from 'lucide-react';
import type { EffectRegistryEntry } from '../effectRegistry';
import type { EffectPropertyDefinition } from '../../types/effectBlock';
import type { HueSaturationEffectSettings } from '../../types/effects';
import { DEFAULT_HUE_SATURATION_SETTINGS } from '../../constants/effectsDefaults';
import { processEffect } from '../../utils/effectsProcessing';

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
  {
    path: 'preserveLuminance',
    displayName: 'Preserve Luminance',
    category: 'Advanced',
    valueType: 'boolean',
    defaultValue: false,
    interpolation: 'hold',
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
  process: async (cells, settings, options) => {
    const result = await processEffect(
      'hue-saturation',
      cells,
      settings as unknown as HueSaturationEffectSettings,
      options?.canvasBackgroundColor ?? '#000000',
      options?.selectionMask ? { selectionMask: options.selectionMask } : undefined,
    );
    return {
      processedCells: result.processedCells ?? new Map(cells),
      affectedCells: result.affectedCells,
    };
  },
};
