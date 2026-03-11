/**
 * Motion Trails Effect — Registry Entry
 *
 * Creates trailing copies of animated content behind the current frame.
 * Operates in screen space so that keyframed layer transforms are trailed.
 * If canvas data doesn't change between frames, no trails are visible.
 */

import { Layers } from 'lucide-react';
import type { EffectRegistryEntry } from '../effectRegistry';
import type { EffectPropertyDefinition } from '../../types/effectBlock';
import type { Cell } from '../../types';

// Default trail colors: gradient from bright to dim
const DEFAULT_TRAIL_COLORS = [
  '#AAAAAA',
  '#999999',
  '#888888',
  '#777777',
  '#666666',
  '#555555',
  '#444444',
  '#333333',
  '#282828',
  '#222222',
];

/** Generate visibleWhen values for a trail color at a given index (1-based). */
function trailCountValuesForIndex(minCount: number): string[] {
  const values: string[] = [];
  for (let i = minCount; i <= 10; i++) {
    values.push(String(i));
  }
  return values;
}

const propertyDefinitions: EffectPropertyDefinition[] = [
  {
    path: 'trailCount',
    displayName: 'Trail Count',
    category: 'Motion Trails',
    valueType: 'number',
    defaultValue: 3,
    interpolation: 'numeric',
    min: 1,
    max: 10,
    step: 1,
  },
  {
    path: 'frameDelay',
    displayName: 'Frame Delay',
    category: 'Motion Trails',
    valueType: 'number',
    defaultValue: 2,
    interpolation: 'numeric',
    min: 1,
    max: 30,
    step: 1,
    unit: 'frames',
  },
  // Trail 1 is always visible (trailCount min is 1)
  {
    path: 'trailColor1',
    displayName: 'Trail 1 Color',
    category: 'Trail Colors',
    valueType: 'color',
    defaultValue: DEFAULT_TRAIL_COLORS[0],
    interpolation: 'hold',
  },
  {
    path: 'trailColor2',
    displayName: 'Trail 2 Color',
    category: 'Trail Colors',
    valueType: 'color',
    defaultValue: DEFAULT_TRAIL_COLORS[1],
    interpolation: 'hold',
    visibleWhen: { path: 'trailCount', values: trailCountValuesForIndex(2) },
  },
  {
    path: 'trailColor3',
    displayName: 'Trail 3 Color',
    category: 'Trail Colors',
    valueType: 'color',
    defaultValue: DEFAULT_TRAIL_COLORS[2],
    interpolation: 'hold',
    visibleWhen: { path: 'trailCount', values: trailCountValuesForIndex(3) },
  },
  {
    path: 'trailColor4',
    displayName: 'Trail 4 Color',
    category: 'Trail Colors',
    valueType: 'color',
    defaultValue: DEFAULT_TRAIL_COLORS[3],
    interpolation: 'hold',
    visibleWhen: { path: 'trailCount', values: trailCountValuesForIndex(4) },
  },
  {
    path: 'trailColor5',
    displayName: 'Trail 5 Color',
    category: 'Trail Colors',
    valueType: 'color',
    defaultValue: DEFAULT_TRAIL_COLORS[4],
    interpolation: 'hold',
    visibleWhen: { path: 'trailCount', values: trailCountValuesForIndex(5) },
  },
  {
    path: 'trailColor6',
    displayName: 'Trail 6 Color',
    category: 'Trail Colors',
    valueType: 'color',
    defaultValue: DEFAULT_TRAIL_COLORS[5],
    interpolation: 'hold',
    visibleWhen: { path: 'trailCount', values: trailCountValuesForIndex(6) },
  },
  {
    path: 'trailColor7',
    displayName: 'Trail 7 Color',
    category: 'Trail Colors',
    valueType: 'color',
    defaultValue: DEFAULT_TRAIL_COLORS[6],
    interpolation: 'hold',
    visibleWhen: { path: 'trailCount', values: trailCountValuesForIndex(7) },
  },
  {
    path: 'trailColor8',
    displayName: 'Trail 8 Color',
    category: 'Trail Colors',
    valueType: 'color',
    defaultValue: DEFAULT_TRAIL_COLORS[7],
    interpolation: 'hold',
    visibleWhen: { path: 'trailCount', values: trailCountValuesForIndex(8) },
  },
  {
    path: 'trailColor9',
    displayName: 'Trail 9 Color',
    category: 'Trail Colors',
    valueType: 'color',
    defaultValue: DEFAULT_TRAIL_COLORS[8],
    interpolation: 'hold',
    visibleWhen: { path: 'trailCount', values: trailCountValuesForIndex(9) },
  },
  {
    path: 'trailColor10',
    displayName: 'Trail 10 Color',
    category: 'Trail Colors',
    valueType: 'color',
    defaultValue: DEFAULT_TRAIL_COLORS[9],
    interpolation: 'hold',
    visibleWhen: { path: 'trailCount', values: trailCountValuesForIndex(10) },
  },
];

export const motionTrailsEffect: EffectRegistryEntry = {
  type: 'motion-trails',
  name: 'Motion Trails',
  icon: Layers,
  category: 'filter',
  description: 'Add trailing copies of animated content',
  perFrameBake: true,
  screenSpace: true,
  defaultSettings: {
    trailCount: 3,
    frameDelay: 2,
    trailColor1: DEFAULT_TRAIL_COLORS[0],
    trailColor2: DEFAULT_TRAIL_COLORS[1],
    trailColor3: DEFAULT_TRAIL_COLORS[2],
    trailColor4: DEFAULT_TRAIL_COLORS[3],
    trailColor5: DEFAULT_TRAIL_COLORS[4],
    trailColor6: DEFAULT_TRAIL_COLORS[5],
    trailColor7: DEFAULT_TRAIL_COLORS[6],
    trailColor8: DEFAULT_TRAIL_COLORS[7],
    trailColor9: DEFAULT_TRAIL_COLORS[8],
    trailColor10: DEFAULT_TRAIL_COLORS[9],
  },
  propertyDefinitions,
  process: (cells, settings, options) => {
    const trailCount = Math.round(
      Math.max(1, Math.min(10, (settings.trailCount as number) ?? 3)),
    );
    const frameDelay = Math.round(
      Math.max(1, Math.min(30, (settings.frameDelay as number) ?? 2)),
    );
    const currentFrame = options?.frame ?? 0;
    const getLayerComposite = options?.getLayerCompositeAtFrame;

    // Without temporal access we can't produce trails
    if (!getLayerComposite) {
      return { processedCells: new Map(cells), affectedCells: 0 };
    }

    const trailColors: string[] = [];
    for (let i = 1; i <= trailCount; i++) {
      trailColors.push((settings[`trailColor${i}`] as string) ?? DEFAULT_TRAIL_COLORS[i - 1]);
    }

    const processedCells = new Map<string, Cell>();

    // Render trails from oldest (farthest back) to newest (closest to current).
    // Trail index i: 1 = nearest to current, trailCount = oldest.
    // We render oldest first so newer trails overwrite older ones.
    for (let i = trailCount; i >= 1; i--) {
      const trailFrame = currentFrame - i * frameDelay;
      if (trailFrame < 0) continue;

      const trailCells = getLayerComposite(trailFrame);
      const trailColor = trailColors[i - 1];

      trailCells.forEach((cell, key) => {
        if (cell.char && cell.char !== ' ') {
          processedCells.set(key, { ...cell, color: trailColor });
        }
      });
    }

    // Current frame's cells on top — unmodified
    cells.forEach((cell, key) => {
      if (cell.char && cell.char !== ' ') {
        processedCells.set(key, cell);
      }
    });

    return { processedCells, affectedCells: processedCells.size };
  },
};
