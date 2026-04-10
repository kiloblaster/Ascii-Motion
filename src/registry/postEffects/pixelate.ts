/**
 * Pixelate — Post Effect Registry Entry
 *
 * Applies a crisp nearest-neighbor mosaic effect by snapping UV
 * coordinates to a grid. Pixel size controls the grid cell size.
 */

import { Grid3X3 } from 'lucide-react';
import type { PostEffectRegistryEntry } from '../postEffectRegistry';
import type { PostEffectPropertyDefinition } from '../../types/postEffect';
import { DEFAULT_PIXELATE_SETTINGS } from '../../constants/postEffectDefaults';
import { buildFragmentShader } from '../../utils/webgl/commonShaders';

const propertyDefinitions: PostEffectPropertyDefinition[] = [
  {
    path: 'pixelSize',
    displayName: 'Pixel Size',
    category: 'Pixelate',
    valueType: 'number',
    defaultValue: DEFAULT_PIXELATE_SETTINGS.pixelSize,
    interpolation: 'numeric',
    min: 1,
    max: 100,
    step: 1,
    unit: 'px',
  },
];

const fragmentShader = buildFragmentShader(
  `uniform float u_pixelSize;`,
  `  // Compute grid cell size in UV space
  vec2 cellSize = vec2(u_pixelSize) / u_resolution;
  
  // Snap UV to the center of the nearest grid cell
  vec2 snapped = cellSize * floor(v_texCoord / cellSize) + cellSize * 0.5;
  
  fragColor = texture(u_texture, snapped);`,
);

export const pixelateEffect: PostEffectRegistryEntry = {
  type: 'pixelate',
  name: 'Pixelate',
  icon: Grid3X3,
  category: 'distortion',
  description: 'Crisp nearest-neighbor mosaic effect',
  defaultSettings: { ...DEFAULT_PIXELATE_SETTINGS } as unknown as Record<string, unknown>,
  propertyDefinitions,
  fragmentShader,
};
