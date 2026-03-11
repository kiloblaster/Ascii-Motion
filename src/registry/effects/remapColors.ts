/**
 * Remap Colors Effect — Registry Entry
 */

import { RefreshCcw } from 'lucide-react';
import type { EffectRegistryEntry } from '../effectRegistry';
import type { EffectPropertyDefinition } from '../../types/effectBlock';
import type { RemapColorsEffectSettings } from '../../types/effects';
import { DEFAULT_REMAP_COLORS_SETTINGS } from '../../constants/effectsDefaults';
import { processRemapColorsEffect } from '../../utils/effectsProcessing';

const propertyDefinitions: EffectPropertyDefinition[] = [
  {
    path: 'colorMappings',
    displayName: 'Color Mappings',
    category: 'Mappings',
    valueType: 'mapping',
    defaultValue: {},
    interpolation: 'hold',
  },
];

export const remapColorsEffect: EffectRegistryEntry = {
  type: 'remap-colors',
  name: 'Remap Colors',
  icon: RefreshCcw,
  category: 'mapping',
  description: 'Replace colors with visual color picker',
  defaultSettings: { ...DEFAULT_REMAP_COLORS_SETTINGS } as unknown as Record<string, unknown>,
  propertyDefinitions,
  process: (cells, settings, options) => {
    const cellsToProcess = options?.selectionMask?.size
      ? new Map([...cells].filter(([key]) => options.selectionMask!.has(key)))
      : cells;
    const result = processRemapColorsEffect(cellsToProcess, settings as unknown as RemapColorsEffectSettings);
    if (options?.selectionMask?.size) {
      const merged = new Map(cells);
      result.processedCells.forEach((cell, key) => merged.set(key, cell));
      return { processedCells: merged, affectedCells: result.affectedCells };
    }
    return result;
  },
};
