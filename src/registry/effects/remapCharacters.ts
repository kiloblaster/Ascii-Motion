/**
 * Remap Characters Effect — Registry Entry
 */

import { Type } from 'lucide-react';
import type { EffectRegistryEntry } from '../effectRegistry';
import type { EffectPropertyDefinition } from '../../types/effectBlock';
import type { RemapCharactersEffectSettings } from '../../types/effects';
import { DEFAULT_REMAP_CHARACTERS_SETTINGS } from '../../constants/effectsDefaults';
import { processEffect } from '../../utils/effectsProcessing';

const propertyDefinitions: EffectPropertyDefinition[] = [
  {
    path: 'characterMappings',
    displayName: 'Character Mappings',
    category: 'Mappings',
    valueType: 'mapping',
    defaultValue: {},
    interpolation: 'hold',
  },
  {
    path: 'preserveSpacing',
    displayName: 'Preserve Spacing',
    category: 'Options',
    valueType: 'boolean',
    defaultValue: true,
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
  process: async (cells, settings, options) => {
    const result = await processEffect(
      'remap-characters',
      cells,
      settings as unknown as RemapCharactersEffectSettings,
      options?.canvasBackgroundColor ?? '#000000',
      options?.selectionMask ? { selectionMask: options.selectionMask } : undefined,
    );
    return {
      processedCells: result.processedCells ?? new Map(cells),
      affectedCells: result.affectedCells,
    };
  },
};
