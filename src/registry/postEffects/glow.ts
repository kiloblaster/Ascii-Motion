/**
 * Glow (Bloom) — Post Effect Registry Entry
 *
 * Multi-pass bloom effect:
 * Pass 0: Extract bright pixels above threshold
 * Pass 1: Horizontal Gaussian blur on extracted pixels
 * Pass 2: Vertical Gaussian blur + additive composite with original
 *
 * Uses 3 passes with separate shaders per pass.
 */

import { Sparkles } from 'lucide-react';
import type { PostEffectRegistryEntry } from '../postEffectRegistry';
import type { PostEffectPropertyDefinition } from '../../types/postEffect';
import { DEFAULT_GLOW_SETTINGS } from '../../constants/postEffectDefaults';
import { buildFragmentShader } from '../../utils/webgl/commonShaders';

const propertyDefinitions: PostEffectPropertyDefinition[] = [
  {
    path: 'intensity',
    displayName: 'Intensity',
    category: 'Glow',
    valueType: 'number',
    defaultValue: DEFAULT_GLOW_SETTINGS.intensity,
    interpolation: 'numeric',
    min: 0,
    max: 2,
    step: 0.05,
  },
  {
    path: 'radius',
    displayName: 'Radius',
    category: 'Glow',
    valueType: 'number',
    defaultValue: DEFAULT_GLOW_SETTINGS.radius,
    interpolation: 'numeric',
    min: 1,
    max: 50,
    step: 1,
    unit: 'px',
  },
  {
    path: 'threshold',
    displayName: 'Threshold',
    category: 'Glow',
    valueType: 'number',
    defaultValue: DEFAULT_GLOW_SETTINGS.threshold,
    interpolation: 'numeric',
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    path: 'color',
    displayName: 'Color',
    category: 'Glow',
    valueType: 'color',
    defaultValue: DEFAULT_GLOW_SETTINGS.color,
    interpolation: 'hold',
  },
];

// Pass 0: Threshold extraction — extract bright pixels
const thresholdShader = buildFragmentShader(
  `uniform float u_threshold;
uniform vec3 u_color;`,
  `  vec4 texel = texture(u_texture, v_texCoord);
  float lum = luminance(texel.rgb);
  
  // Soft threshold with smooth transition
  float brightness = smoothstep(u_threshold, u_threshold + 0.1, lum);
  
  // Tint with glow color
  vec3 glowColor = texel.rgb * brightness * u_color;
  
  fragColor = vec4(glowColor, texel.a * brightness);`,
);

// Pass 1: Horizontal Gaussian blur
const horizontalBlurShader = buildFragmentShader(
  `uniform float u_radius;`,
  `  vec2 texelSize = 1.0 / u_resolution;
  vec3 result = vec3(0.0);
  float totalWeight = 0.0;
  
  int samples = int(min(u_radius, 25.0));
  
  for (int i = -samples; i <= samples; i++) {
    float offset = float(i);
    float weight = exp(-0.5 * (offset * offset) / max(u_radius * 0.5, 1.0));
    vec2 sampleUV = v_texCoord + vec2(offset * texelSize.x, 0.0);
    result += texture(u_texture, sampleUV).rgb * weight;
    totalWeight += weight;
  }
  
  fragColor = vec4(result / totalWeight, 1.0);`,
);

// Pass 2: Vertical Gaussian blur + additive composite
// Note: u_texture here is the horizontally blurred glow.
// We need the original scene to composite with, but in a ping-pong setup
// we don't have direct access. Instead, we re-read the blurred glow and
// the pipeline will composite additively onto the original.
const verticalBlurCompositeShader = buildFragmentShader(
  `uniform float u_radius;
uniform float u_intensity;`,
  `  vec2 texelSize = 1.0 / u_resolution;
  vec3 result = vec3(0.0);
  float totalWeight = 0.0;
  
  int samples = int(min(u_radius, 25.0));
  
  for (int i = -samples; i <= samples; i++) {
    float offset = float(i);
    float weight = exp(-0.5 * (offset * offset) / max(u_radius * 0.5, 1.0));
    vec2 sampleUV = v_texCoord + vec2(0.0, offset * texelSize.y);
    result += texture(u_texture, sampleUV).rgb * weight;
    totalWeight += weight;
  }
  
  vec3 blurredGlow = result / totalWeight;
  
  // Output the blurred glow scaled by intensity
  // The pipeline will additively composite this with the original
  fragColor = vec4(blurredGlow * u_intensity, 1.0);`,
);

export const glowEffect: PostEffectRegistryEntry = {
  type: 'glow',
  name: 'Glow',
  icon: Sparkles,
  category: 'glow',
  description: 'Add bloom glow to bright areas',
  defaultSettings: { ...DEFAULT_GLOW_SETTINGS } as unknown as Record<string, unknown>,
  propertyDefinitions,
  fragmentShader: thresholdShader, // Default (not used when passShaders provided)
  passes: 3,
  passShaders: [thresholdShader, horizontalBlurShader, verticalBlurCompositeShader],
};
