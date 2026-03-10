/**
 * Remap Characters Effect — Registry Entry
 */

import { Type } from 'lucide-react';
import type { EffectRegistryEntry } from '../effectRegistry';
import type { EffectPropertyDefinition } from '../../types/effectBlock';
import type { RemapCharactersEffectSettings } from '../../types/effects';
import { DEFAULT_REMAP_CHARACTERS_SETTINGS } from '../../constants/effectsDefaults';
import { processRemapCharactersEffect } from '../../utils/effectsProcessing';

const propertyDefinitions: EffectPropertyDefinition[] = [
  {
    path: 'characterMappings',
    displayName: 'Character Mappings',
    category: 'Mappings',
    valueType: 'mapping',
    defaultValue: {},
    interpolation: 'hold',
  },
];

export const remapCharactersEffect: EffectRegistryEntry = {
  type: 'remap-characters',
  name: 'Remap Characters',
  icon: Type,
  category: 'mapping',
  description: 'Replace characters with visual character selector',
  defaultSettings: { ...DEFAULT_REMAP_CHARACTERS_SETTINGS } as unknown as Record<string, unknown>,
  propertyDefinitions,
  process: (cells, settings, options) => {
    const cellsToProcess = options?.selectionMask?.size
      ? new Map([...cells].filter(([key]) => options.selectionMask!.has(key)))
      : cells;
    const result = processRemapCharactersEffect(cellsToProcess, settings as unknown as RemapCharactersEffectSettings);
    if (options?.selectionMask?.size) {
      const merged = new Map(cells);
      result.processedCells.forEach((cell, key) => merged.set(key, cell));
      return { processedCells: merged, affectedCells: result.affectedCells };
    }
    return result;
  },
};
