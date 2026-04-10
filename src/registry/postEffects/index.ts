/**
 * Post Effect Registrations — initializes all built-in post effects in the registry.
 *
 * Import this module once at app startup to populate the post effect registry.
 */

import { registerPostEffect } from '../postEffectRegistry';
import { chromaticAberrationEffect } from './chromaticAberration';
import { screenDistortionEffect } from './screenDistortion';
import { glowEffect } from './glow';
import { blurEffect } from './blur';
import { pixelateEffect } from './pixelate';

/**
 * Register all built-in post effects. Safe to call multiple times —
 * subsequent calls are no-ops if the registry is already populated.
 */
export function registerAllPostEffects(): void {
  const effects = [
    chromaticAberrationEffect,
    screenDistortionEffect,
    glowEffect,
    blurEffect,
    pixelateEffect,
  ];

  for (const effect of effects) {
    try {
      registerPostEffect(effect);
    } catch {
      // Already registered — skip
    }
  }
}
