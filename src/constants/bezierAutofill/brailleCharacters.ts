/**
 * Braille Characters Autofill Palette
 *
 * Uses Unicode Braille patterns (U+2800-U+28FF) for high-resolution sub-cell fills.
 * Unlike block/ANSI palettes, Braille characters are computed directly from a 2×4
 * dot sampling grid — no pattern table is needed. This palette entry provides metadata
 * only; character selection is handled computationally in the fill utilities.
 *
 * Braille dot layout per cell (2 columns × 4 rows = 8 dots = 256 possible characters):
 *   ┌───┬───┐
 *   │ 1 │ 4 │
 *   ├───┼───┤
 *   │ 2 │ 5 │
 *   ├───┼───┤
 *   │ 3 │ 6 │
 *   ├───┼───┤
 *   │ 7 │ 8 │
 *   └───┴───┘
 */

import type { AutofillPalette } from './types';

export const BRAILLE_CHARACTERS_PALETTE: AutofillPalette = {
  id: 'braille',
  name: 'Braille',
  description: 'Unicode Braille patterns for high-resolution sub-cell fills',
  patterns: [], // Braille characters are computed, not pattern-matched
};
