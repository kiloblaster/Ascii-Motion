/**
 * Blur — Post Effect Registry Entry
 *
 * Separable Gaussian blur using 2 passes (horizontal + vertical).
 * Also supports box and radial blur modes.
 */

import { Focus } from 'lucide-react';
import type { PostEffectRegistryEntry } from '../postEffectRegistry';
import type { PostEffectPropertyDefinition } from '../../types/postEffect';
import { DEFAULT_BLUR_SETTINGS } from '../../constants/postEffectDefaults';
import { buildFragmentShader } from '../../utils/webgl/commonShaders';

const propertyDefinitions: PostEffectPropertyDefinition[] = [
  {
    path: 'radius',
    displayName: 'Radius',
    category: 'Blur',
    valueType: 'number',
    defaultValue: DEFAULT_BLUR_SETTINGS.radius,
    interpolation: 'numeric',
    min: 0,
    max: 50,
    step: 0.5,
    unit: 'px',
  },
  {
    path: 'type',
    displayName: 'Type',
    category: 'Blur',
    valueType: 'select',
    defaultValue: DEFAULT_BLUR_SETTINGS.type,
    interpolation: 'hold',
    options: [
      { label: 'Gaussian', value: 'gaussian' },
      { label: 'Box', value: 'box' },
      { label: 'Radial', value: 'radial' },
    ],
  },
  {
    path: 'direction',
    displayName: 'Direction',
    category: 'Blur',
    valueType: 'number',
    defaultValue: DEFAULT_BLUR_SETTINGS.direction,
    interpolation: 'numeric',
    min: 0,
    max: 360,
    step: 1,
    unit: '°',
    visibleWhen: { path: 'type', values: ['gaussian'] },
  },
  {
    path: 'centerX',
    displayName: 'Center X',
    category: 'Blur',
    valueType: 'number',
    defaultValue: DEFAULT_BLUR_SETTINGS.centerX,
    interpolation: 'numeric',
    min: 0,
    max: 1,
    step: 0.01,
    visibleWhen: { path: 'type', values: ['radial'] },
  },
  {
    path: 'centerY',
    displayName: 'Center Y',
    category: 'Blur',
    valueType: 'number',
    defaultValue: DEFAULT_BLUR_SETTINGS.centerY,
    interpolation: 'numeric',
    min: 0,
    max: 1,
    step: 0.01,
    visibleWhen: { path: 'type', values: ['radial'] },
  },
];

// Horizontal blur pass
const horizontalBlurShader = buildFragmentShader(
  `uniform float u_radius;
uniform float u_centerX;
uniform float u_centerY;`,
  `  vec2 texelSize = 1.0 / u_resolution;
  
  if (u_radius < 0.5) {
    fragColor = texture(u_texture, v_texCoord);
    return;
  }
  
  vec3 result = vec3(0.0);
  float totalWeight = 0.0;
  int samples = int(min(u_radius, 25.0));
  
  for (int i = -samples; i <= samples; i++) {
    float offset = float(i);
    float sigma = max(u_radius * 0.5, 1.0);
    float weight = exp(-0.5 * (offset * offset) / (sigma * sigma));
    vec2 sampleUV = v_texCoord + vec2(offset * texelSize.x, 0.0);
    result += texture(u_texture, sampleUV).rgb * weight;
    totalWeight += weight;
  }
  
  fragColor = vec4(result / totalWeight, texture(u_texture, v_texCoord).a);`,
);

// Vertical blur pass
const verticalBlurShader = buildFragmentShader(
  `uniform float u_radius;
uniform float u_centerX;
uniform float u_centerY;`,
  `  vec2 texelSize = 1.0 / u_resolution;
  
  if (u_radius < 0.5) {
    fragColor = texture(u_texture, v_texCoord);
    return;
  }
  
  vec3 result = vec3(0.0);
  float totalWeight = 0.0;
  int samples = int(min(u_radius, 25.0));
  
  for (int i = -samples; i <= samples; i++) {
    float offset = float(i);
    float sigma = max(u_radius * 0.5, 1.0);
    float weight = exp(-0.5 * (offset * offset) / (sigma * sigma));
    vec2 sampleUV = v_texCoord + vec2(0.0, offset * texelSize.y);
    result += texture(u_texture, sampleUV).rgb * weight;
    totalWeight += weight;
  }
  
  fragColor = vec4(result / totalWeight, texture(u_texture, v_texCoord).a);`,
);

export const blurEffect: PostEffectRegistryEntry = {
  type: 'blur',
  name: 'Blur',
  icon: Focus,
  category: 'blur',
  description: 'Apply gaussian, box, or radial blur',
  defaultSettings: { ...DEFAULT_BLUR_SETTINGS } as unknown as Record<string, unknown>,
  propertyDefinitions,
  fragmentShader: horizontalBlurShader, // Default (not used when passShaders provided)
  passes: 2,
  passShaders: [horizontalBlurShader, verticalBlurShader],
};
