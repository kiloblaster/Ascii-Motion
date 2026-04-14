/**
 * Font Detection Utility
 * Detects which fonts are actually available on the user's system
 * Uses FontFace local() probing as the primary detection method,
 * with canvas measurement as a fallback for older browsers.
 */

import { isFontLoaded as isBundledFontLoaded } from '@/utils/fontLoader';

// Cache font availability results to avoid repeated checks
const fontAvailabilityCache = new Map<string, boolean>();
const detectedFontCache = new Map<string, string>();

// Cache for the actual font used by the browser
const actualUsedFontCache = new Map<string, string>();

/**
 * Probe whether a font is installed locally using the FontFace API.
 * Creates a temporary FontFace with a local() source and attempts to load it.
 * Resolves true if the font is found, false otherwise.
 */
async function probeLocalFont(fontName: string): Promise<boolean> {
  if (typeof FontFace === 'undefined') return false;

  try {
    const face = new FontFace('__probe__', `local("${fontName}")`);
    await face.load();
    return true;
  } catch {
    return false;
  }
}

/**
 * Canvas-based font detection fallback.
 * Compares glyph widths against baseline generic fonts.
 * Less reliable than FontFace local() — fonts whose metrics match
 * the baseline will produce false negatives.
 */
function canvasFontDetection(fontName: string): boolean {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) return false;

  const testStrings = ['mmmmmmmmmmlli', 'iIl1O0', 'WMwm@#'];
  const baselineFonts = ['monospace', 'sans-serif', 'serif'];
  const testSize = '72px';

  const baselines = new Map<string, number[]>();
  for (const baselineFont of baselineFonts) {
    const widths: number[] = [];
    for (const testString of testStrings) {
      context.font = `${testSize} ${baselineFont}`;
      widths.push(context.measureText(testString).width);
    }
    baselines.set(baselineFont, widths);
  }

  const fontVariations = [`"${fontName}"`, fontName];

  for (const fontVariation of fontVariations) {
    for (const baselineFont of baselineFonts) {
      const baselineWidths = baselines.get(baselineFont)!;

      for (let i = 0; i < testStrings.length; i++) {
        context.font = `${testSize} ${fontVariation}, ${baselineFont}`;
        const testWidth = context.measureText(testStrings[i]).width;

        if (testWidth !== baselineWidths[i]) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Check if a specific font is available on the system.
 * Uses FontFace local() probing (most reliable), falling back to
 * canvas measurement for environments without FontFace support.
 */
export async function isFontAvailable(fontName: string): Promise<boolean> {
  // Check cache first
  if (fontAvailabilityCache.has(fontName)) {
    return fontAvailabilityCache.get(fontName)!;
  }

  // For bundled fonts we loaded via @font-face, trust our own loader state
  if (isBundledFontLoaded(fontName)) {
    fontAvailabilityCache.set(fontName, true);
    return true;
  }

  // Primary: FontFace local() probing — directly asks the browser
  // whether the font is installed locally
  const localResult = await probeLocalFont(fontName);
  if (localResult) {
    fontAvailabilityCache.set(fontName, true);
    return true;
  }

  // Fallback: canvas measurement (for browsers where local() is restricted)
  const canvasResult = canvasFontDetection(fontName);
  fontAvailabilityCache.set(fontName, canvasResult);
  return canvasResult;
}

/**
 * Parse a font stack string into individual font names
 * Handles quoted font names and removes generic families
 */
function parseFontStack(fontStack: string): string[] {
  return fontStack
    .split(',')
    .map(font => font.trim())
    // Strip surrounding quotes (single or double) from font names
    .map(font => font.replace(/^["'](.*)["']$/, '$1'))
    .filter(font => 
      font !== 'monospace' && 
      font !== 'sans-serif' && 
      font !== 'serif' &&
      font !== 'ui-monospace' // Generic CSS keyword for system monospace
    );
}

/**
 * Get the actual font being used by the browser for a given font stack.
 * Tests each font in stack order and returns the first available one.
 */
async function getActualUsedFont(fontStack: string): Promise<string> {
  // Check cache first
  if (actualUsedFontCache.has(fontStack)) {
    return actualUsedFontCache.get(fontStack)!;
  }

  const fonts = parseFontStack(fontStack);

  // Test each font in order — the browser uses the first available one
  for (const font of fonts) {
    const isAvailable = await isFontAvailable(font);
    if (isAvailable) {
      actualUsedFontCache.set(fontStack, font);
      return font;
    }
  }
  
  // No named font in the stack was available, so the browser is using
  // the generic `monospace` fallback. Detect which concrete font that
  // maps to by comparing canvas metrics against known candidates.
  const resolvedMonospace = detectMonospaceDefault();
  actualUsedFontCache.set(fontStack, resolvedMonospace);
  return resolvedMonospace;
}

/**
 * Detect which concrete font the browser's generic `monospace` maps to.
 * Renders text with bare `monospace` and compares metrics against known
 * monospace fonts to find the match.
 */
function detectMonospaceDefault(): string {
  const candidates = [
    'Menlo', 'SF Mono', 'Monaco', 'Consolas',
    'Cascadia Code', 'Courier New', 'Courier'
  ];

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return 'monospace';

  const testStrings = ['mmmmmmmmmmlli', 'iIl1O0', 'WMwm@#'];
  const size = '72px';

  // Measure the baseline: bare `monospace`
  const baseWidths: number[] = [];
  for (const s of testStrings) {
    ctx.font = `${size} monospace`;
    baseWidths.push(ctx.measureText(s).width);
  }

  // Find the candidate whose metrics match the baseline
  for (const candidate of candidates) {
    let allMatch = true;
    for (let i = 0; i < testStrings.length; i++) {
      ctx.font = `${size} "${candidate}", monospace`;
      if (ctx.measureText(testStrings[i]).width !== baseWidths[i]) {
        allMatch = false;
        break;
      }
    }
    // If all test strings match, this font IS the monospace default
    // (its metrics are identical because the browser is already using it)
    if (allMatch) {
      return candidate;
    }
  }

  return 'monospace';
}

/**
 * Detect which font from a font stack is actually being used
 * Returns the actual font name being rendered by the browser
 */
export async function detectAvailableFont(fontStack: string): Promise<string> {
  // Check cache first
  if (detectedFontCache.has(fontStack)) {
    return detectedFontCache.get(fontStack)!;
  }

  // Get the actual font being used (await the promise)
  const actualFont = await getActualUsedFont(fontStack);
  
  // Cache the result
  detectedFontCache.set(fontStack, actualFont);
  
  return actualFont;
}

/**
 * Check if a font stack is using a fallback (requested font not available)
 */
export async function isFallbackActive(
  requestedFontName: string,
  fontStack: string
): Promise<boolean> {
  const actualFont = await detectAvailableFont(fontStack);
  return actualFont !== requestedFontName;
}

/**
 * Clear the font detection cache
 * Useful for testing or if fonts are installed during runtime
 */
export function clearFontCache(): void {
  fontAvailabilityCache.clear();
  detectedFontCache.clear();
  actualUsedFontCache.clear();
}

/**
 * Get a user-friendly message about font availability
 */
export function getFontFallbackMessage(
  requestedFont: string,
  actualFont: string
): string {
  if (requestedFont === actualFont) {
    return `Using ${actualFont}`;
  }

  // If actualFont is generic or empty, try to be more helpful
  if (!actualFont || actualFont === 'monospace') {
    return `${requestedFont} not available. Using system default monospace font.`;
  }

  // Provide OS-specific hints
  let hint = '';
  const userAgent = navigator.userAgent.toLowerCase();
  
  if (requestedFont === 'Consolas' && userAgent.includes('mac')) {
    hint = ' (Windows font)';
  } else if (requestedFont === 'SF Mono' && userAgent.includes('win')) {
    hint = ' (macOS font)';
  } else if (requestedFont === 'Cascadia Code') {
    hint = ' (install from Microsoft)';
  }

  return `${requestedFont} not available${hint}. Using ${actualFont}.`;
}
