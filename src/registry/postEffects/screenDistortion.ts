/**
 * Screen Distortion — Post Effect Registry Entry
 *
 * Applies barrel, pincushion, or wave distortion to the rendered output.
 * Supports animated wave mode for dynamic visual effects.
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
    step: 0.01,
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
  {
    path: 'animate',
    displayName: 'Animate',
    category: 'Screen Distortion',
    valueType: 'boolean',
    defaultValue: DEFAULT_SCREEN_DISTORTION_SETTINGS.animate,
    interpolation: 'hold',
  },
];

// The shader uses u_type as a float (0=barrel, 1=pincushion, 2=wave)
// Type mapping is handled in the pipeline when setting uniforms.
const fragmentShader = buildFragmentShader(
  `uniform float u_amount;
uniform float u_frequency;
uniform float u_animate;`,
  `  vec2 uv = v_texCoord;
  vec2 center = vec2(0.5);
  vec2 delta = uv - center;
  float dist = length(delta);
  
  // Read type from u_frame context — we encode type as a separate approach
  // For simplicity, we use the amount sign convention:
  // The JS pipeline sets u_amount positive for barrel, negative for pincushion
  // Wave mode is handled via u_frequency > 0 check
  
  vec2 distorted = uv;
  
  if (u_frequency > 0.05) {
    // Wave distortion
    float timeOffset = u_animate > 0.5 ? u_time * 2.0 : 0.0;
    float waveX = sin(uv.y * u_frequency * 6.28318 + timeOffset) * u_amount * 0.1;
    float waveY = cos(uv.x * u_frequency * 6.28318 + timeOffset) * u_amount * 0.1;
    distorted = uv + vec2(waveX, waveY);
  } else {
    // Barrel / Pincushion distortion
    float r2 = dist * dist;
    float distortionFactor = 1.0 + u_amount * r2;
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
