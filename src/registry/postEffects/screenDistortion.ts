/**
 * Screen Distortion — Post Effect Registry Entry
 *
 * Applies barrel, pincushion, or wave distortion to the rendered output.
 */

import { MonitorOff } from 'lucide-react';
import type { PostEffectRegistryEntry } from '../postEffectRegistry';
import type { PostEffectPropertyDefinition } from '../../types/postEffect';
import { DEFAULT_SCREEN_DISTORTION_SETTINGS } from '../../constants/postEffectDefaults';
import { buildFragmentShader } from '../../utils/webgl/commonShaders';

const propertyDefinitions: PostEffectPropertyDefinition[] = [
  {
    path: 'amount',
    displayName: 'Amount',
    category: 'Screen Distortion',
    valueType: 'number',
    defaultValue: DEFAULT_SCREEN_DISTORTION_SETTINGS.amount,
    interpolation: 'numeric',
    min: 0,
    max: 1,
    step: 0.1,
  },
  {
    path: 'type',
    displayName: 'Type',
    category: 'Screen Distortion',
    valueType: 'select',
    defaultValue: DEFAULT_SCREEN_DISTORTION_SETTINGS.type,
    interpolation: 'hold',
    options: [
      { label: 'Barrel', value: 'barrel' },
      { label: 'Pincushion', value: 'pincushion' },
      { label: 'Wave', value: 'wave' },
    ],
  },
  {
    path: 'frequency',
    displayName: 'Frequency',
    category: 'Screen Distortion',
    valueType: 'number',
    defaultValue: DEFAULT_SCREEN_DISTORTION_SETTINGS.frequency,
    interpolation: 'numeric',
    min: 0.1,
    max: 10,
    step: 0.1,
    visibleWhen: { path: 'type', values: ['wave'] },
  },
];

// u_type: 0.0 = barrel, 1.0 = pincushion, 2.0 = wave
const fragmentShader = buildFragmentShader(
  `uniform float u_amount;
uniform float u_type;
uniform float u_frequency;`,
  `  vec2 uv = v_texCoord;
  vec2 center = vec2(0.5);
  vec2 delta = uv - center;
  float dist = length(delta);
  
  vec2 distorted = uv;
  
  if (u_type > 1.5) {
    // Wave distortion (type == 2)
    float waveX = sin(uv.y * u_frequency * 6.28318 + u_time * 2.0) * u_amount * 0.1;
    float waveY = cos(uv.x * u_frequency * 6.28318 + u_time * 2.0) * u_amount * 0.1;
    distorted = uv + vec2(waveX, waveY);
  } else {
    // Barrel (type == 0) or Pincushion (type == 1)
    float sign = u_type > 0.5 ? -1.0 : 1.0;
    float r2 = dist * dist;
    float distortionFactor = 1.0 + sign * u_amount * r2;
    distorted = center + delta * distortionFactor;
  }
  
  // Clamp to valid UV range
  distorted = clamp(distorted, vec2(0.0), vec2(1.0));
  
  fragColor = texture(u_texture, distorted);`,
);

export const screenDistortionEffect: PostEffectRegistryEntry = {
  type: 'screen-distortion',
  name: 'Screen Distortion',
  icon: MonitorOff,
  category: 'distortion',
  description: 'Apply barrel, pincushion, or wave distortion',
  defaultSettings: { ...DEFAULT_SCREEN_DISTORTION_SETTINGS } as unknown as Record<string, unknown>,
  propertyDefinitions,
  fragmentShader,
};
