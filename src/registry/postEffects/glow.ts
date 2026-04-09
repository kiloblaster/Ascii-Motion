/**
 * Glow (Bloom) — Post Effect Registry Entry
 *
 * Multi-pass bloom effect:
 * Pass 0: Extract bright pixels above threshold
 * Pass 1: Horizontal Gaussian blur on extracted pixels
 * Pass 2: Vertical Gaussian blur + composite with original scene
 *
 * Uses 3 passes with separate shaders per pass.
 * The final pass reads u_original (the pre-effect scene) from texture unit 1
 * and composites the blurred glow on top using the selected blend mode.
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
    step: 0.1,
  },
  {
    path: 'radius',
    displayName: 'Radius',
    category: 'Glow',
    valueType: 'number',
    defaultValue: DEFAULT_GLOW_SETTINGS.radius,
    interpolation: 'numeric',
    min: 1,
    max: 200,
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
    step: 0.1,
  },
  {
    path: 'blendMode',
    displayName: 'Blend Mode',
    category: 'Glow',
    valueType: 'select',
    defaultValue: DEFAULT_GLOW_SETTINGS.blendMode,
    interpolation: 'hold',
    options: [
      { label: 'Add', value: 'add' },
      { label: 'Screen', value: 'screen' },
      { label: 'Soft Light', value: 'softlight' },
      { label: 'Overlay', value: 'overlay' },
    ],
  },
  {
    path: 'colorShift',
    displayName: 'Color Shift',
    category: 'Glow',
    valueType: 'number',
    defaultValue: DEFAULT_GLOW_SETTINGS.colorShift,
    interpolation: 'numeric',
    min: 0,
    max: 1,
    step: 0.1,
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
    float sigma = max(u_radius * 0.5, 1.0);
    float weight = exp(-0.5 * (offset * offset) / (sigma * sigma));
    vec2 sampleUV = v_texCoord + vec2(offset * texelSize.x, 0.0);
    result += texture(u_texture, sampleUV).rgb * weight;
    totalWeight += weight;
  }
  
  fragColor = vec4(result / totalWeight, 1.0);`,
);

// Pass 2: Vertical Gaussian blur + composite with original
// u_texture = horizontally blurred glow (from pass 1)
// u_original = the pre-effect original scene (bound on texture unit 1)
const verticalBlurCompositeShader = buildFragmentShader(
  `uniform sampler2D u_original;
uniform float u_radius;
uniform float u_intensity;
uniform float u_blendMode;
uniform float u_colorShift;`,
  `  vec2 texelSize = 1.0 / u_resolution;
  vec3 result = vec3(0.0);
  float totalWeight = 0.0;
  
  int samples = int(min(u_radius, 25.0));
  
  for (int i = -samples; i <= samples; i++) {
    float offset = float(i);
    float sigma = max(u_radius * 0.5, 1.0);
    float weight = exp(-0.5 * (offset * offset) / (sigma * sigma));
    vec2 sampleUV = v_texCoord + vec2(0.0, offset * texelSize.y);
    
    vec3 sampleColor = texture(u_texture, sampleUV).rgb;
    
    // Color shift: push distant samples toward cooler (blue) tones
    if (u_colorShift > 0.0) {
      float dist = abs(offset) / max(float(samples), 1.0);
      float shift = dist * u_colorShift;
      sampleColor.r *= 1.0 - shift * 0.5;
      sampleColor.g *= 1.0 - shift * 0.2;
      sampleColor.b *= 1.0 + shift * 0.4;
    }
    
    result += sampleColor * weight;
    totalWeight += weight;
  }
  
  vec3 glow = (result / totalWeight) * u_intensity;
  
  // Read the original pre-effect scene
  vec4 original = texture(u_original, v_texCoord);
  vec3 base = original.rgb;
  
  // Blend glow onto original based on blend mode
  vec3 blended;
  if (u_blendMode < 0.5) {
    // Add (0)
    blended = base + glow;
  } else if (u_blendMode < 1.5) {
    // Screen (1)
    blended = 1.0 - (1.0 - base) * (1.0 - glow);
  } else if (u_blendMode < 2.5) {
    // Soft Light (2)
    blended = mix(
      2.0 * base * glow + base * base * (1.0 - 2.0 * glow),
      sqrt(base) * (2.0 * glow - 1.0) + 2.0 * base * (1.0 - glow),
      step(0.5, glow)
    );
  } else {
    // Overlay (3)
    blended = mix(
      2.0 * base * glow,
      1.0 - 2.0 * (1.0 - base) * (1.0 - glow),
      step(0.5, base)
    );
  }
  
  fragColor = vec4(clamp(blended, 0.0, 1.0), original.a);`,
);

export const glowEffect: PostEffectRegistryEntry = {
  type: 'glow',
  name: 'Glow',
  icon: Sparkles,
  category: 'glow',
  description: 'Add bloom glow to bright areas',
  defaultSettings: { ...DEFAULT_GLOW_SETTINGS } as unknown as Record<string, unknown>,
  propertyDefinitions,
  fragmentShader: thresholdShader,
  passes: 3,
  passShaders: [thresholdShader, horizontalBlurShader, verticalBlurCompositeShader],
};
