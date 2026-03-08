/**
 * Shape-Based ASCII Character Converter
 *
 * Implements the 6D shape-vector algorithm from:
 * https://alexharri.com/blog/ascii-rendering
 *
 * Instead of treating each cell as a single pixel and mapping brightness to a
 * character, this algorithm captures the *shape* of the image content within
 * each cell by sampling 6 sub-regions, then finds the ASCII character whose
 * pre-measured shape best matches.
 *
 * Features:
 * - 6D shape vector sampling from image data
 * - Global contrast enhancement (exponent on normalized vectors)
 * - Directional contrast enhancement (using neighboring cells)
 * - k-d tree for O(log n) character lookups
 */

import { KdTree } from './kdTree';
import {
  INTERNAL_CIRCLES,
  EXTERNAL_CIRCLES,
  AFFECTING_EXTERNAL_INDICES,
  getNormalizedAsciiVectors,
  getNormalizedBlockVectors,
  type CharacterShapeEntry,
} from '../constants/shapeVectors';

export type AutoModeCharacterSet = 'basic-ascii' | 'block-characters' | 'braille';

/** Mapping methods that control how RGB pixels are reduced to a scalar for shape analysis. */
export type ShapeMappingMethod = 'brightness' | 'luminance' | 'saturation' | 'red-channel' | 'green-channel' | 'blue-channel';

export interface ShapeConverterOptions {
  characterSet: AutoModeCharacterSet;
  globalContrastExponent: number;      // 1.0 = no enhancement, 2.0–4.0 = stronger
  directionalContrastExponent: number; // 1.0 = no enhancement, 2.0–4.0 = stronger
  mappingMethod: ShapeMappingMethod;   // Controls which channel/formula is sampled
}

/**
 * Sampling quality presets: pixels per cell in each dimension.
 * Higher values = more precise sub-region sampling but slower processing.
 */
export const SAMPLING_QUALITY_PRESETS = {
  low:    { cellPixelsX: 4,  cellPixelsY: 6  },
  medium: { cellPixelsX: 8,  cellPixelsY: 12 },
  high:   { cellPixelsX: 12, cellPixelsY: 18 },
} as const;

export type SamplingQuality = keyof typeof SAMPLING_QUALITY_PRESETS;

export class ShapeBasedConverter {
  private kdTree: KdTree<string>;
  private entries: CharacterShapeEntry[];
  private options: ShapeConverterOptions;

  constructor(options: ShapeConverterOptions) {
    this.options = options;

    // Braille mode uses direct 2×4 dot sampling — no k-d tree needed
    if (options.characterSet === 'braille') {
      this.entries = [];
      this.kdTree = new KdTree([]);
      return;
    }

    this.entries = options.characterSet === 'block-characters'
      ? getNormalizedBlockVectors()
      : getNormalizedAsciiVectors();

    // Build k-d tree from the precomputed shape vectors
    this.kdTree = new KdTree(
      this.entries.map(e => ({ point: [...e.vector], data: e.char }))
    );
  }

  /**
   * Convert an entire image to ASCII characters using shape-based matching.
   *
   * @param imageData - High-resolution image data (multiple pixels per cell)
   * @param gridWidth - Number of character columns
   * @param gridHeight - Number of character rows
   * @returns Map of "x,y" → character
   */
  convertImage(
    imageData: ImageData,
    gridWidth: number,
    gridHeight: number
  ): Map<string, string> {
    // Braille uses a dedicated 2×4 dot sampling path
    if (this.options.characterSet === 'braille') {
      return this.convertImageBraille(imageData, gridWidth, gridHeight);
    }

    const { width: imgWidth, height: imgHeight, data } = imageData;
    const cellW = imgWidth / gridWidth;
    const cellH = imgHeight / gridHeight;

    // First pass: compute internal sampling vectors for all cells
    const samplingVectors: number[][] = new Array(gridWidth * gridHeight);
    for (let gy = 0; gy < gridHeight; gy++) {
      for (let gx = 0; gx < gridWidth; gx++) {
        samplingVectors[gy * gridWidth + gx] = this.computeSamplingVector(
          data, imgWidth, imgHeight, gx * cellW, gy * cellH, cellW, cellH
        );
      }
    }

    // Second pass: compute external sampling vectors and apply contrast enhancement
    const result = new Map<string, string>();

    for (let gy = 0; gy < gridHeight; gy++) {
      for (let gx = 0; gx < gridWidth; gx++) {
        let sv = [...samplingVectors[gy * gridWidth + gx]];

        // Apply directional contrast enhancement using neighbor data
        if (this.options.directionalContrastExponent > 1.0) {
          const externalVec = this.computeExternalSamplingVector(
            data, imgWidth, imgHeight, gx * cellW, gy * cellH, cellW, cellH
          );
          sv = this.applyDirectionalContrast(
            sv, externalVec, this.options.directionalContrastExponent
          );
        }

        // Apply global contrast enhancement
        if (this.options.globalContrastExponent > 1.0) {
          sv = this.applyGlobalContrast(sv, this.options.globalContrastExponent);
        }

        // Skip fully empty cells
        const maxVal = Math.max(...sv);
        if (maxVal < 0.01) {
          continue; // leave as empty (no character)
        }

        // Find best matching character
        const char = this.findBestCharacter(sv);
        if (char !== ' ') {
          result.set(`${gx},${gy}`, char);
        }
      }
    }

    return result;
  }

  /**
   * Braille dot positions within a cell (2 columns × 4 rows).
   * Each dot has a fractional (x, y) position and its Unicode bit index.
   *
   * Braille bit layout:
   *   Dot1 (bit0) | Dot4 (bit3)
   *   Dot2 (bit1) | Dot5 (bit4)
   *   Dot3 (bit2) | Dot6 (bit5)
   *   Dot7 (bit6) | Dot8 (bit7)
   */
  private static readonly BRAILLE_DOTS: Array<{ x: number; y: number; bit: number }> = [
    { x: 0.25, y: 0.125, bit: 0 },  // Dot 1
    { x: 0.25, y: 0.375, bit: 1 },  // Dot 2
    { x: 0.25, y: 0.625, bit: 2 },  // Dot 3
    { x: 0.75, y: 0.125, bit: 3 },  // Dot 4
    { x: 0.75, y: 0.375, bit: 4 },  // Dot 5
    { x: 0.75, y: 0.625, bit: 5 },  // Dot 6
    { x: 0.25, y: 0.875, bit: 6 },  // Dot 7
    { x: 0.75, y: 0.875, bit: 7 },  // Dot 8
  ];

  /**
   * Convert an image to Braille characters using 2×4 dot sampling per cell.
   *
   * For each cell, samples 8 dot positions. Each dot's brightness is compared
   * against a threshold to determine if it's "on". The 8 bits map directly to
   * a Unicode Braille character (U+2800 + bitmask).
   */
  private convertImageBraille(
    imageData: ImageData,
    gridWidth: number,
    gridHeight: number
  ): Map<string, string> {
    const { width: imgWidth, height: imgHeight, data } = imageData;
    const cellW = imgWidth / gridWidth;
    const cellH = imgHeight / gridHeight;
    const result = new Map<string, string>();

    // Sampling radius as fraction of cell size for averaging around each dot
    const sampleRadius = Math.max(1, Math.floor(Math.min(cellW, cellH) * 0.1));

    for (let gy = 0; gy < gridHeight; gy++) {
      for (let gx = 0; gx < gridWidth; gx++) {
        const cellX = gx * cellW;
        const cellY = gy * cellH;

        // Sample brightness at each of the 8 dot positions
        const dotValues: number[] = new Array(8);
        for (const dot of ShapeBasedConverter.BRAILLE_DOTS) {
          const px = Math.floor(cellX + dot.x * cellW);
          const py = Math.floor(cellY + dot.y * cellH);

          // Average brightness in a small region around the dot center
          let total = 0;
          let count = 0;
          for (let dy = -sampleRadius; dy <= sampleRadius; dy++) {
            for (let dx = -sampleRadius; dx <= sampleRadius; dx++) {
              const sx = Math.max(0, Math.min(imgWidth - 1, px + dx));
              const sy = Math.max(0, Math.min(imgHeight - 1, py + dy));
              const idx = (sy * imgWidth + sx) * 4;
              total += this.pixelToScalar(data[idx], data[idx + 1], data[idx + 2]);
              count++;
            }
          }
          dotValues[dot.bit] = count > 0 ? total / count : 0;
        }

        // Apply contrast enhancement to dot values
        if (this.options.globalContrastExponent > 1.0) {
          const maxVal = Math.max(...dotValues);
          if (maxVal > 0.001) {
            for (let i = 0; i < 8; i++) {
              const normalized = dotValues[i] / maxVal;
              dotValues[i] = Math.pow(normalized, this.options.globalContrastExponent) * maxVal;
            }
          }
        }

        // Compute threshold from cell mean (adaptive thresholding)
        const mean = dotValues.reduce((a, b) => a + b, 0) / 8;

        // Build bitmask: dot is "on" if its brightness exceeds the threshold
        let bits = 0;
        for (let i = 0; i < 8; i++) {
          if (dotValues[i] > mean * 0.5 && dotValues[i] > 0.05) {
            bits |= (1 << i);
          }
        }

        // Skip empty cells (blank braille = U+2800)
        if (bits === 0) continue;

        const char = String.fromCharCode(0x2800 + bits);
        result.set(`${gx},${gy}`, char);
      }
    }

    return result;
  }

  /**
   * Compute the 6D internal sampling vector for a cell.
   * Each dimension samples the average lightness within a sampling circle.
   */
  computeSamplingVector(
    data: Uint8ClampedArray,
    imgWidth: number,
    imgHeight: number,
    cellX: number,
    cellY: number,
    cellW: number,
    cellH: number
  ): number[] {
    const vector = new Array(6).fill(0);

    for (let ci = 0; ci < INTERNAL_CIRCLES.length; ci++) {
      vector[ci] = this.sampleCircle(
        data, imgWidth, imgHeight,
        cellX, cellY, cellW, cellH,
        INTERNAL_CIRCLES[ci]
      );
    }

    return vector;
  }

  /**
   * Compute the 10D external sampling vector for directional contrast.
   * External circles reach into neighboring cells.
   */
  private computeExternalSamplingVector(
    data: Uint8ClampedArray,
    imgWidth: number,
    imgHeight: number,
    cellX: number,
    cellY: number,
    cellW: number,
    cellH: number
  ): number[] {
    const vector = new Array(EXTERNAL_CIRCLES.length).fill(0);

    for (let ci = 0; ci < EXTERNAL_CIRCLES.length; ci++) {
      vector[ci] = this.sampleCircle(
        data, imgWidth, imgHeight,
        cellX, cellY, cellW, cellH,
        EXTERNAL_CIRCLES[ci]
      );
    }

    return vector;
  }

  /**
   * Sample the average value within a circle positioned relative to a cell.
   * The scalar extracted from each pixel depends on the configured mappingMethod.
   */
  private sampleCircle(
    data: Uint8ClampedArray,
    imgWidth: number,
    imgHeight: number,
    cellX: number,
    cellY: number,
    cellW: number,
    cellH: number,
    circle: [number, number, number]
  ): number {
    const [cx, cy, cr] = circle;
    const centerPx = cellX + cx * cellW;
    const centerPy = cellY + cy * cellH;
    const radiusPx = cr * Math.min(cellW, cellH);
    const radiusSq = radiusPx * radiusPx;

    // Use 3×3 grid sampling within the circle (9 samples) for speed
    let totalValue = 0;
    let sampleCount = 0;

    const step = radiusPx / 1.5; // ~3 samples across diameter
    for (let sy = centerPy - radiusPx; sy <= centerPy + radiusPx; sy += step) {
      for (let sx = centerPx - radiusPx; sx <= centerPx + radiusPx; sx += step) {
        const dx = sx - centerPx;
        const dy = sy - centerPy;
        if (dx * dx + dy * dy > radiusSq) continue;

        // Clamp to image bounds
        const px = Math.max(0, Math.min(imgWidth - 1, Math.floor(sx)));
        const py = Math.max(0, Math.min(imgHeight - 1, Math.floor(sy)));

        const idx = (py * imgWidth + px) * 4;
        totalValue += this.pixelToScalar(data[idx], data[idx + 1], data[idx + 2]);
        sampleCount++;
      }
    }

    return sampleCount > 0 ? totalValue / sampleCount : 0;
  }

  /**
   * Convert an RGB pixel to a scalar [0,1] using the configured mapping method.
   * This determines what "quality" of the source image the shape analysis sees.
   */
  private pixelToScalar(r: number, g: number, b: number): number {
    switch (this.options.mappingMethod) {
      case 'luminance': {
        // Gamma-corrected perceptual luminance
        return Math.pow(
          0.299 * Math.pow(r / 255, 2.2) +
          0.587 * Math.pow(g / 255, 2.2) +
          0.114 * Math.pow(b / 255, 2.2),
          1 / 2.2
        );
      }
      case 'red-channel':
        return r / 255;
      case 'green-channel':
        return g / 255;
      case 'blue-channel':
        return b / 255;
      case 'saturation': {
        const rN = r / 255, gN = g / 255, bN = b / 255;
        const max = Math.max(rN, gN, bN);
        const min = Math.min(rN, gN, bN);
        return max === 0 ? 0 : (max - min) / max;
      }
      case 'brightness':
      default:
        // Rec. 709 luminance (standard brightness)
        return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    }
  }

  /**
   * Apply global contrast enhancement to a sampling vector.
   *
   * Normalizes the vector to [0,1] range, applies an exponent to crunch
   * darker values, then denormalizes back. This exaggerates the shape of
   * the vector without affecting uniform regions.
   */
  applyGlobalContrast(vector: number[], exponent: number): number[] {
    const maxValue = Math.max(...vector);
    if (maxValue < 0.001) return vector;

    return vector.map(v => {
      const normalized = v / maxValue;
      const enhanced = Math.pow(normalized, exponent);
      return enhanced * maxValue;
    });
  }

  /**
   * Apply directional contrast enhancement using external sampling vectors.
   *
   * For each internal component, finds the max value among its affecting
   * external components, uses that as the normalization basis, then applies
   * the exponent. This sharpens edges at cell boundaries by darkening
   * internal regions where neighbors are brighter.
   */
  applyDirectionalContrast(
    internalVec: number[],
    externalVec: number[],
    exponent: number
  ): number[] {
    return internalVec.map((value, i) => {
      // Find max among affecting external circles
      let maxExternal = value;
      for (const extIdx of AFFECTING_EXTERNAL_INDICES[i]) {
        if (extIdx < externalVec.length) {
          maxExternal = Math.max(maxExternal, externalVec[extIdx]);
        }
      }

      if (maxExternal < 0.001) return value;

      const normalized = value / maxExternal;
      const enhanced = Math.pow(normalized, exponent);
      return enhanced * maxExternal;
    });
  }

  /**
   * Find the character whose shape vector best matches the input vector.
   */
  findBestCharacter(samplingVector: number[]): string {
    const result = this.kdTree.findNearest(samplingVector);
    return result ? result.data : ' ';
  }
}
