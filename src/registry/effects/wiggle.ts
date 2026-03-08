/**
 * Wiggle Effect — Registry Entry
 *
 * Extracted from the time effects system into the procedural effects pipeline.
 * Applies global displacement to all cells based on wave or noise functions.
 */

import { Vibrate } from 'lucide-react';
import type { EffectRegistryEntry } from '../effectRegistry';
import type { EffectPropertyDefinition } from '../../types/effectBlock';
import type { Cell } from '../../types';
import type { WiggleSettings } from '../../types/timeEffects';
import { applyWiggleToFrame } from '../../utils/timeEffectsProcessing';

const propertyDefinitions: EffectPropertyDefinition[] = [
  {
    path: 'mode',
    displayName: 'Mode',
    category: 'Wiggle',
    valueType: 'select',
    defaultValue: 'horizontal-wave',
    interpolation: 'hold',
    options: [
      { label: 'Horizontal Wave', value: 'horizontal-wave' },
      { label: 'Vertical Wave', value: 'vertical-wave' },
      { label: 'Noise', value: 'noise' },
    ],
  },
  {
    path: 'waveFrequency',
    displayName: 'Wave Frequency',
    category: 'Wave',
    valueType: 'number',
    defaultValue: 1.0,
    interpolation: 'numeric',
    min: 0.1,
    max: 5.0,
    step: 0.1,
  },
  {
    path: 'waveAmplitude',
    displayName: 'Wave Amplitude',
    category: 'Wave',
    valueType: 'number',
    defaultValue: 3,
    interpolation: 'numeric',
    min: 1,
    max: 20,
    step: 1,
    unit: 'cells',
  },
  {
    path: 'waveSpeed',
    displayName: 'Wave Speed',
    category: 'Wave',
    valueType: 'number',
    defaultValue: 100,
    interpolation: 'numeric',
    min: 10,
    max: 500,
    step: 10,
    unit: 'px/s',
  },
  {
    path: 'noiseOctaves',
    displayName: 'Noise Octaves',
    category: 'Noise',
    valueType: 'number',
    defaultValue: 3,
    interpolation: 'numeric',
    min: 1,
    max: 8,
    step: 1,
  },
  {
    path: 'noiseFrequency',
    displayName: 'Noise Frequency',
    category: 'Noise',
    valueType: 'number',
    defaultValue: 0.01,
    interpolation: 'numeric',
    min: 0.001,
    max: 0.1,
    step: 0.001,
  },
  {
    path: 'noiseAmplitude',
    displayName: 'Noise Amplitude',
    category: 'Noise',
    valueType: 'number',
    defaultValue: 10,
    interpolation: 'numeric',
    min: 1,
    max: 50,
    step: 1,
    unit: 'cells',
  },
  {
    path: 'noiseSeed',
    displayName: 'Noise Seed',
    category: 'Noise',
    valueType: 'number',
    defaultValue: 0,
    interpolation: 'numeric',
    min: 0,
    max: 9999,
    step: 1,
  },
];

export const wiggleEffect: EffectRegistryEntry = {
  type: 'wiggle',
  name: 'Wiggle',
  icon: Vibrate,
  category: 'distortion',
  description: 'Apply global displacement via wave or noise functions',
  defaultSettings: {
    mode: 'horizontal-wave' as const,
    waveFrequency: 1.0,
    waveAmplitude: 3,
    waveSpeed: 100,
    noiseOctaves: 3,
    noiseFrequency: 0.01,
    noiseAmplitude: 10,
    noiseSeed: 0,
  },
  propertyDefinitions,
  process: (cells, settings, options) => {
    const frame = options?.frame ?? 0;
    const frameRate = options?.frameRate ?? 12;

    // Calculate accumulated time from frame number and frame rate
    const accumulatedTime = (frame / frameRate) * 1000;

    // Derive canvas bounds from cell positions
    const { width, height } = deriveCanvasBounds(cells);

    const processedCells = applyWiggleToFrame(
      cells,
      width,
      height,
      settings as unknown as WiggleSettings,
      accumulatedTime,
    );

    let affectedCells = 0;
    cells.forEach((_, key) => {
      if (!processedCells.has(key) || processedCells.get(key) !== cells.get(key)) {
        affectedCells++;
      }
    });

    return { processedCells, affectedCells };
  },
};

/** Derive canvas width/height from cell positions in the map. */
function deriveCanvasBounds(cells: Map<string, Cell>): { width: number; height: number } {
  let maxX = 0;
  let maxY = 0;
  cells.forEach((_, key) => {
    const [x, y] = key.split(',').map(Number);
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  });
  return { width: maxX + 1, height: maxY + 1 };
}
