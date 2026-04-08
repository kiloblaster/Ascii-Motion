/**
 * Post Effects Defaults — Default settings for all post effect types
 */

// ============================================
// CHROMATIC ABERRATION
// ============================================

export interface ChromaticAberrationSettings {
  /** Pixel offset amount for channel separation (0–50) */
  intensity: number;
  /** Direction angle of the aberration in degrees (0–360) */
  angle: number;
  /** Radial falloff from center (0 = uniform, 1 = edges only) */
  falloff: number;
}

export const DEFAULT_CHROMATIC_ABERRATION_SETTINGS: ChromaticAberrationSettings = {
  intensity: 5,
  angle: 0,
  falloff: 0.5,
};

// ============================================
// SCREEN DISTORTION
// ============================================

export interface ScreenDistortionSettings {
  /** Distortion strength (0–1) */
  amount: number;
  /** Distortion type */
  type: 'barrel' | 'pincushion' | 'wave';
  /** Wave frequency — only used when type is 'wave' (0.1–10) */
  frequency: number;
  /** Whether to animate the distortion over time */
  animate: boolean;
}

export const DEFAULT_SCREEN_DISTORTION_SETTINGS: ScreenDistortionSettings = {
  amount: 0.3,
  type: 'barrel',
  frequency: 1.0,
  animate: false,
};

// ============================================
// GLOW (BLOOM)
// ============================================

export interface GlowSettings {
  /** Glow brightness multiplier (0–2) */
  intensity: number;
  /** Glow spread radius in pixels (1–50) */
  radius: number;
  /** Brightness threshold for glow extraction (0–1) */
  threshold: number;
  /** Tint color for the glow */
  color: string;
}

export const DEFAULT_GLOW_SETTINGS: GlowSettings = {
  intensity: 0.5,
  radius: 10,
  threshold: 0.5,
  color: '#ffffff',
};

// ============================================
// BLUR
// ============================================

export interface BlurSettings {
  /** Blur radius in pixels (0–50) */
  radius: number;
  /** Blur algorithm type */
  type: 'gaussian' | 'box' | 'radial';
  /** Direction angle for directional blur in degrees (0–360) */
  direction: number;
  /** Center point for radial blur (normalized 0–1) */
  centerX: number;
  centerY: number;
}

export const DEFAULT_BLUR_SETTINGS: BlurSettings = {
  radius: 5,
  type: 'gaussian',
  direction: 0,
  centerX: 0.5,
  centerY: 0.5,
};

// ============================================
// POST EFFECT UI DEFINITIONS
// ============================================

export interface PostEffectDefinition {
  id: string;
  name: string;
  icon: string;
  description: string;
  category: 'distortion' | 'blur' | 'glow' | 'color';
}

export const POST_EFFECT_DEFINITIONS: PostEffectDefinition[] = [
  {
    id: 'chromatic-aberration',
    name: 'Chromatic Aberration',
    icon: 'Prism',
    description: 'Separate RGB channels for a lens distortion look',
    category: 'color',
  },
  {
    id: 'screen-distortion',
    name: 'Screen Distortion',
    icon: 'MonitorOff',
    description: 'Apply barrel, pincushion, or wave distortion',
    category: 'distortion',
  },
  {
    id: 'glow',
    name: 'Glow',
    icon: 'Sparkles',
    description: 'Add bloom glow to bright areas',
    category: 'glow',
  },
  {
    id: 'blur',
    name: 'Blur',
    icon: 'Focus',
    description: 'Apply gaussian, box, or radial blur',
    category: 'blur',
  },
];

// ============================================
// POST EFFECT LIMITS
// ============================================

export const POST_EFFECT_LIMITS = {
  /** Maximum number of stacked post effects */
  MAX_POST_EFFECTS: 16,
  /** Maximum blur/glow radius (pixels) */
  MAX_RADIUS: 50,
  /** Maximum chromatic aberration offset (pixels) */
  MAX_CA_INTENSITY: 50,
} as const;
