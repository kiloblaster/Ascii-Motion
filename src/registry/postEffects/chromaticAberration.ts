/**
 * Chromatic Aberration — Post Effect Registry Entry
 *
 * Separates RGB channels with configurable offset direction and
 * radial falloff for a classic lens distortion look.
 */

import { Aperture } from 'lucide-react';
import type { PostEffectRegistryEntry } from '../postEffectRegistry';
import type { PostEffectPropertyDefinition } from '../../types/postEffect';
import { DEFAULT_CHROMATIC_ABERRATION_SETTINGS } from '../../constants/postEffectDefaults';
import { buildFragmentShader } from '../../utils/webgl/commonShaders';

const propertyDefinitions: PostEffectPropertyDefinition[] = [
  {
    path: 'intensity',
    displayName: 'Intensity',
    category: 'Chromatic Aberration',
    valueType: 'number',
    defaultValue: DEFAULT_CHROMATIC_ABERRATION_SETTINGS.intensity,
    interpolation: 'numeric',
    min: 0,
    max: 50,
    step: 0.5,
    unit: 'px',
  },
  {
    path: 'angle',
    displayName: 'Angle',
    category: 'Chromatic Aberration',
    valueType: 'number',
    defaultValue: DEFAULT_CHROMATIC_ABERRATION_SETTINGS.angle,
    interpolation: 'numeric',
    min: 0,
    max: 360,
    step: 1,
    unit: '°',
  },
  {
    path: 'falloff',
    displayName: 'Falloff',
    category: 'Chromatic Aberration',
    valueType: 'number',
    defaultValue: DEFAULT_CHROMATIC_ABERRATION_SETTINGS.falloff,
    interpolation: 'numeric',
    min: 0,
    max: 1,
    step: 0.01,
  },
];

const fragmentShader = buildFragmentShader(
  `uniform float u_intensity;
uniform float u_angle;
uniform float u_falloff;`,
  `  vec2 uv = v_texCoord;
  vec2 center = vec2(0.5);
  
  // Distance from center for radial falloff
  float dist = length(uv - center);
  float falloffMask = mix(1.0, dist * 2.0, u_falloff);
  
  // Offset direction from angle
  float rad = radians(u_angle);
  vec2 dir = vec2(cos(rad), sin(rad));
  
  // Pixel offset scaled by intensity and falloff
  vec2 offset = dir * (u_intensity / u_resolution) * falloffMask;
  
  // Sample each channel with offset
  float r = texture(u_texture, uv + offset).r;
  float g = texture(u_texture, uv).g;
  float b = texture(u_texture, uv - offset).b;
  float a = texture(u_texture, uv).a;
  
  fragColor = vec4(r, g, b, a);`,
);

export const chromaticAberrationEffect: PostEffectRegistryEntry = {
  type: 'chromatic-aberration',
  name: 'Chromatic Aberration',
  icon: Aperture,
  category: 'color',
  description: 'Separate RGB channels for a lens distortion look',
  defaultSettings: { ...DEFAULT_CHROMATIC_ABERRATION_SETTINGS } as unknown as Record<string, unknown>,
  propertyDefinitions,
  fragmentShader,
};
