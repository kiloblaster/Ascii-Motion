/**
 * Effect Registrations — initializes all built-in effects in the registry.
 *
 * Import this module once at app startup to populate the registry.
 */

import { registerEffect } from '../effectRegistry';
import { levelsEffect } from './levels';
import { hueSaturationEffect } from './hueSaturation';
import { remapColorsEffect } from './remapColors';
import { remapCharactersEffect } from './remapCharacters';
import { scatterEffect } from './scatter';
import { waveWarpEffect } from './waveWarp';
import { wiggleEffect } from './wiggle';

/**
 * Register all built-in effects. Safe to call multiple times —
 * subsequent calls are no-ops if the registry is already populated.
 */
export function registerAllEffects(): void {
  const effects = [
    levelsEffect,
    hueSaturationEffect,
    remapColorsEffect,
    remapCharactersEffect,
    scatterEffect,
    waveWarpEffect,
    wiggleEffect,
  ];

  for (const effect of effects) {
    try {
      registerEffect(effect);
    } catch {
      // Already registered — skip
    }
  }
}

export {
  levelsEffect,
  hueSaturationEffect,
  remapColorsEffect,
  remapCharactersEffect,
  scatterEffect,
  waveWarpEffect,
  wiggleEffect,
};
