/**
 * Blur — Post Effect Registry Entry
 *
 * Supports multiple blur algorithms:
 * - Gaussian: Separable 2-pass Gaussian blur
 * - Box: Uniform-weight box blur
 * - Radial: Samples radiate outward from a center point
 * - Zoom: Samples along lines from center (motion zoom effect)
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
      { label: 'Zoom', value: 'zoom' },
    ],
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
    visibleWhen: { path: 'type', values: ['radial', 'zoom'] },
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
    visibleWhen: { path: 'type', values: ['radial', 'zoom'] },
  },
];

// Horizontal blur pass — handles gaussian and box
const horizontalBlurShader = buildFragmentShader(
  `uniform float u_radius;
uniform float u_type;
uniform float u_centerX;
uniform float u_centerY;`,
  `  vec2 texelSize = 1.0 / u_resolution;
  
  if (u_radius < 0.5) {
    fragColor = texture(u_texture, v_texCoord);
    return;
  }
  
  // Radial blur (type == 2) — rotational/spin blur around center
  if (u_type > 1.5 && u_type < 2.5) {
    vec2 center = vec2(u_centerX, u_centerY);
    vec2 dir = v_texCoord - center;
    float dist = length(dir);
    vec3 result = vec3(0.0);
    float totalWeight = 0.0;
    int samples = int(min(u_radius, 25.0));
    float angleStep = u_radius * 0.003;
    
    for (int i = -samples; i <= samples; i++) {
      float angle = float(i) * angleStep;
      float cosA = cos(angle);
      float sinA = sin(angle);
      // Rotate dir around center
      vec2 rotated = vec2(dir.x * cosA - dir.y * sinA, dir.x * sinA + dir.y * cosA);
      vec2 sampleUV = center + rotated;
      sampleUV = clamp(sampleUV, vec2(0.0), vec2(1.0));
      float weight = exp(-2.0 * float(i * i) / max(float(samples * samples), 1.0));
      result += texture(u_texture, sampleUV).rgb * weight;
      totalWeight += weight;
    }
    
    fragColor = vec4(result / totalWeight, texture(u_texture, v_texCoord).a);
    return;
  }
  
  // Zoom blur (type == 3) — single-pass, samples along radial lines
  if (u_type > 2.5) {
    vec2 center = vec2(u_centerX, u_centerY);
    vec2 dir = v_texCoord - center;
    vec3 result = vec3(0.0);
    int samples = int(min(u_radius * 2.0, 40.0));
    float strength = u_radius * 0.005;
    
    for (int i = 0; i < samples; i++) {
      float t = float(i) / float(max(samples - 1, 1));
      vec2 sampleUV = v_texCoord - dir * t * strength;
      sampleUV = clamp(sampleUV, vec2(0.0), vec2(1.0));
      result += texture(u_texture, sampleUV).rgb;
    }
    
    fragColor = vec4(result / float(samples), texture(u_texture, v_texCoord).a);
    return;
  }
  
  // Gaussian (type == 0) or Box (type == 1) — horizontal pass
  vec3 result = vec3(0.0);
  float totalWeight = 0.0;
  int samples = int(min(u_radius, 25.0));
  
  for (int i = -samples; i <= samples; i++) {
    float offset = float(i);
    float weight;
    if (u_type < 0.5) {
      // Gaussian
      float sigma = max(u_radius * 0.5, 1.0);
      weight = exp(-0.5 * (offset * offset) / (sigma * sigma));
    } else {
      // Box — uniform weight
      weight = 1.0;
    }
    vec2 sampleUV = v_texCoord + vec2(offset * texelSize.x, 0.0);
    result += texture(u_texture, sampleUV).rgb * weight;
    totalWeight += weight;
  }
  
  fragColor = vec4(result / totalWeight, texture(u_texture, v_texCoord).a);`,
);

// Vertical blur pass — handles gaussian and box (radial/zoom already complete)
const verticalBlurShader = buildFragmentShader(
  `uniform float u_radius;
uniform float u_type;
uniform float u_centerX;
uniform float u_centerY;`,
  `  vec2 texelSize = 1.0 / u_resolution;
  
  // Radial and Zoom are complete in pass 0 — just pass through
  if (u_type > 1.5 || u_radius < 0.5) {
    fragColor = texture(u_texture, v_texCoord);
    return;
  }
  
  // Gaussian (type == 0) or Box (type == 1) — vertical pass
  vec3 result = vec3(0.0);
  float totalWeight = 0.0;
  int samples = int(min(u_radius, 25.0));
  
  for (int i = -samples; i <= samples; i++) {
    float offset = float(i);
    float weight;
    if (u_type < 0.5) {
      float sigma = max(u_radius * 0.5, 1.0);
      weight = exp(-0.5 * (offset * offset) / (sigma * sigma));
    } else {
      weight = 1.0;
    }
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
  description: 'Apply gaussian, box, radial, or zoom blur',
  defaultSettings: { ...DEFAULT_BLUR_SETTINGS } as unknown as Record<string, unknown>,
  propertyDefinitions,
  fragmentShader: horizontalBlurShader,
  passes: 2,
  passShaders: [horizontalBlurShader, verticalBlurShader],
};
