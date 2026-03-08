/**
 * Remap Colors Effect — Registry Entry
 */

import { RefreshCcw } from 'lucide-react';
import type { EffectRegistryEntry } from '../effectRegistry';
import type { EffectPropertyDefinition } from '../../types/effectBlock';
import type { RemapColorsEffectSettings } from '../../types/effects';
import { DEFAULT_REMAP_COLORS_SETTINGS } from '../../constants/effectsDefaults';
import { processEffect } from '../../utils/effectsProcessing';

const propertyDefinitions: EffectPropertyDefinition[] = [
  {
    path: 'colorMappings',
    displayName: 'Color Mappings',
    category: 'Mappings',
    valueType: 'mapping',
    defaultValue: {},
    interpolation: 'hold',
  },
  {
    path: 'matchExact',
    displayName: 'Match Exact',
    category: 'Options',
    valueType: 'boolean',
    defaultValue: true,
    interpolation: 'hold',
  },
  {
    path: 'paletteMode',
    displayName: 'Palette Mode',
    category: 'Options',
    valueType: 'select',
    defaultValue: 'manual',
    interpolation: 'hold',
    options: [
      { label: 'Manual', value: 'manual' },
      { label: 'Palette', value: 'palette' },
    ],
  },
  {
    path: 'mappingAlgorithm',
    displayName: 'Mapping Algorithm',
    category: 'Options',
    valueType: 'select',
    defaultValue: 'closest',
    interpolation: 'hold',
    options: [
      { label: 'Closest Match', value: 'closest' },
      { label: 'By Index', value: 'by-index' },
    ],
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
  process: async (cells, settings, options) => {
    const result = await processEffect(
      'remap-colors',
      cells,
      settings as unknown as RemapColorsEffectSettings,
      options?.canvasBackgroundColor ?? '#000000',
      options?.selectionMask ? { selectionMask: options.selectionMask } : undefined,
    );
    return {
      processedCells: result.processedCells ?? new Map(cells),
      affectedCells: result.affectedCells,
    };
  },
};
