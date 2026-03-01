/**
 * Line Art ASCII Converter
 *
 * Uses edge detection + character convolution to produce ASCII line art.
 * Inspired by: https://github.com/BrianMacIntosh/asciiart
 * Blog: https://www.brianmacintosh.com/blog/comments.php?post=91
 *
 * Pipeline:
 *  1. Greyscale the input
 *  2. Gaussian blur to reduce noise
 *  3. Sobel edge detection → edge magnitude image
 *  4. Threshold → binary edge mask
 *  5. Optional dilate/erode for noise reduction
 *  6. Blur the edge mask (helps matching when edges don't align to grid)
 *  7. For each cell, convolute each candidate character's bitmap against the
 *     edge mask. Best match (highest overlap, penalized for ink without edge) wins.
 */

export interface LineArtOptions {
  /** Pre-edge Gaussian blur radius in pixels. Reduces noise but can lose weak edges. */
  blurRadius: number;
  /** Sobel edge threshold (0–1). Higher = more characters in the output. */
  edgeThreshold: number;
  /** Dilate radius. Thickens the detected edges. */
  dilateRadius: number;
  /** Erode radius. Narrows edges. Combined with equivalent dilate, cleans up noise. */
  erodeRadius: number;
  /** SDF blur radius. Spreads edge values outward so characters match even when edges don't align perfectly to the grid. Higher = more characters. */
  sdfBlurRadius: number;
  /** Penalty applied to characters that don't fit the detected shape. Higher = fewer characters. */
  inverseMatchWeight: number;
}

export const DEFAULT_LINE_ART_OPTIONS: LineArtOptions = {
  blurRadius: 0,
  edgeThreshold: 0.1,
  dilateRadius: 2,
  erodeRadius: 0,
  sdfBlurRadius: 6,
  inverseMatchWeight: 9.5,
};

/**
 * Character weights for line art mode.
 * Higher weight = preferred for selection. 0 = excluded.
 */
const CHAR_WEIGHTS: Record<string, number> = {
  '\\': 2.0, '/': 2.0, '_': 2.0, '-': 2.0,
  '|': 1.8,
  '(': 1.4, ')': 1.4,
  '<': 1.3, '>': 1.3,
  '.': 1.0, "'": 1.0, '`': 1.0, ',': 0.7, ';': 0.7,
  ':': 0.8, '"': 0.8,
  '+': 1.2, '=': 0.8, '*': 0.8,
  '[': 0.6, ']': 0.6, '~': 0.6,
  '!': 0.2, '^': 0.8,
  // Uppercase letters get low weight (some have useful line shapes)
  'T': 0.6, 'L': 0.6, 'V': 0.6, 'Y': 0.6, 'X': 0.6,
  'I': 0.5, 'J': 0.5, 'C': 0.5,
};

// Characters that are completely excluded (weight = 0)
const EXCLUDED_CHARS = new Set('abcdefghijklmnopqrstuvwxyz0123456789{}&$@#%BDEFGHKMNOPQRSUWZAo'.split(''));

/** Candidate characters for line art, with their weights. */
interface CharCandidate {
  char: string;
  weight: number;
  /** Rendered bitmap as greyscale floats [0,1], dimensions = cellW × cellH */
  pixels: Float32Array;
  pixelCount: number; // number of "inked" pixels
}

export class LineArtConverter {
  private candidates: CharCandidate[] = [];
  private cellW = 0;
  private cellH = 0;

  /**
   * Initialize by rendering all candidate characters to bitmaps.
   * Must be called once before convertImage.
   */
  init(cellPixelWidth: number, cellPixelHeight: number, fontFamily = 'monospace') {
    this.cellW = cellPixelWidth;
    this.cellH = cellPixelHeight;
    this.candidates = [];

    if (typeof document === 'undefined') return;

    const canvas = document.createElement('canvas');
    canvas.width = cellPixelWidth;
    canvas.height = cellPixelHeight;
    const ctx = canvas.getContext('2d')!;

    // Build candidate list from printable ASCII (32–126)
    for (let code = 32; code <= 126; code++) {
      const char = String.fromCharCode(code);
      if (EXCLUDED_CHARS.has(char)) continue;

      const weight = CHAR_WEIGHTS[char] ?? (code >= 65 && code <= 90 ? 0.4 : 1.0);
      if (weight <= 0) continue;

      // Render character
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, cellPixelWidth, cellPixelHeight);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `${cellPixelHeight}px ${fontFamily}`;
      ctx.textBaseline = 'top';
      ctx.textAlign = 'center';
      ctx.fillText(char, cellPixelWidth / 2, 0);

      const imgData = ctx.getImageData(0, 0, cellPixelWidth, cellPixelHeight);
      const pixels = new Float32Array(cellPixelWidth * cellPixelHeight);
      let pixelCount = 0;
      for (let i = 0; i < pixels.length; i++) {
        const v = imgData.data[i * 4] / 255; // red channel
        pixels[i] = v;
        if (v > 0.5) pixelCount++;
      }

      this.candidates.push({ char, weight, pixels, pixelCount });
    }

    // Always include space as fallback
    if (!this.candidates.find(c => c.char === ' ')) {
      this.candidates.push({
        char: ' ',
        weight: 1.0,
        pixels: new Float32Array(cellPixelWidth * cellPixelHeight),
        pixelCount: 0,
      });
    }
  }

  /**
   * Convert a high-resolution image to line art ASCII characters.
   *
   * @param imageData - Source image (higher res than grid)
   * @param gridWidth - Number of character columns
   * @param gridHeight - Number of character rows
   * @param options - Line art processing options
   * @returns Map of "x,y" → character
   */
  convertImage(
    imageData: ImageData,
    gridWidth: number,
    gridHeight: number,
    options: LineArtOptions
  ): Map<string, string> {
    const { width, height, data } = imageData;

    // 1. Greyscale
    const grey = new Float32Array(width * height);
    for (let i = 0; i < grey.length; i++) {
      const idx = i * 4;
      grey[i] = (0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2]) / 255;
    }

    // 2. Gaussian blur
    let blurred = grey;
    if (options.blurRadius > 0) {
      blurred = this.gaussianBlur(grey, width, height, options.blurRadius);
    }

    // 3. Sobel edge detection
    const edges = this.sobelEdgeDetect(blurred, width, height);

    // 4. Threshold
    const thresholded = new Float32Array(edges.length);
    for (let i = 0; i < edges.length; i++) {
      thresholded[i] = edges[i] > options.edgeThreshold ? 1.0 : 0.0;
    }

    // 5. Dilate (thicken edges)
    let processed = thresholded;
    if (options.dilateRadius > 0) {
      processed = this.morphDilate(processed, width, height, options.dilateRadius);
    }

    // 6. Erode (thin edges — combined with dilate, reduces noise)
    if (options.erodeRadius > 0) {
      processed = this.morphErode(processed, width, height, options.erodeRadius);
    }

    // 7. SDF Blur (spread edge values outward for better character matching)
    let edgeMask = processed;
    if (options.sdfBlurRadius > 0) {
      edgeMask = this.sdfBlur(processed, width, height, options.sdfBlurRadius);
    }

    // 8. Character matching
    const cellW = width / gridWidth;
    const cellH = height / gridHeight;
    const result = new Map<string, string>();

    for (let gy = 0; gy < gridHeight; gy++) {
      for (let gx = 0; gx < gridWidth; gx++) {
        const char = this.matchCharacter(
          edgeMask, width, height,
          Math.floor(gx * cellW), Math.floor(gy * cellH),
          Math.floor(cellW), Math.floor(cellH),
          options.inverseMatchWeight
        );
        if (char !== ' ') {
          result.set(`${gx},${gy}`, char);
        }
      }
    }

    return result;
  }

  /**
   * Find the best matching character for a given cell region of the edge mask.
   */
  private matchCharacter(
    edgeMask: Float32Array,
    imgWidth: number,
    imgHeight: number,
    cellX: number,
    cellY: number,
    cellW: number,
    cellH: number,
    inverseMatchWeight: number
  ): string {
    if (this.candidates.length === 0) return ' ';

    let bestRating = -Infinity;
    let bestChar = ' ';

    // Scale factors from candidate bitmap to actual cell size
    const scaleX = this.cellW / cellW;
    const scaleY = this.cellH / cellH;

    for (const cand of this.candidates) {
      if (cand.pixelCount === 0 && cand.char !== ' ') continue;

      let matchScore = 0;
      let inverseScore = 0;

      for (let y = 0; y < cellH; y++) {
        const imgRow = cellY + y;
        if (imgRow >= imgHeight) continue;

        for (let x = 0; x < cellW; x++) {
          const imgCol = cellX + x;
          if (imgCol >= imgWidth) continue;

          const maskVal = edgeMask[imgRow * imgWidth + imgCol];

          // Sample the candidate's bitmap at the corresponding position
          const bx = Math.min(Math.floor(x * scaleX), this.cellW - 1);
          const by = Math.min(Math.floor(y * scaleY), this.cellH - 1);
          const charVal = cand.pixels[by * this.cellW + bx];

          matchScore += charVal * maskVal;
          inverseScore += charVal * (1.0 - maskVal);
        }
      }

      const rating = (matchScore - inverseMatchWeight * inverseScore) * cand.weight;

      if (rating > bestRating) {
        bestRating = rating;
        bestChar = cand.char;
      }
    }

    // If the best rating is very low, the cell is mostly empty
    if (bestRating <= 0) return ' ';

    return bestChar;
  }

  /**
   * Sobel edge detection. Returns edge magnitude [0,1].
   */
  private sobelEdgeDetect(
    grey: Float32Array,
    width: number,
    height: number
  ): Float32Array {
    const edges = new Float32Array(width * height);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        // 3×3 neighborhood
        const tl = grey[(y - 1) * width + (x - 1)];
        const t  = grey[(y - 1) * width + x];
        const tr = grey[(y - 1) * width + (x + 1)];
        const l  = grey[y * width + (x - 1)];
        const r  = grey[y * width + (x + 1)];
        const bl = grey[(y + 1) * width + (x - 1)];
        const b  = grey[(y + 1) * width + x];
        const br = grey[(y + 1) * width + (x + 1)];

        const gx = -tl + tr - 2 * l + 2 * r - bl + br;
        const gy = -tl - 2 * t - tr + bl + 2 * b + br;

        edges[y * width + x] = Math.min(1.0, Math.sqrt(gx * gx + gy * gy));
      }
    }

    return edges;
  }

  /**
   * Simple box-approximated Gaussian blur.
   */
  private gaussianBlur(
    input: Float32Array,
    width: number,
    height: number,
    radius: number
  ): Float32Array {
    const r = Math.max(1, Math.round(radius));
    const output = new Float32Array(input.length);

    // Horizontal pass
    const temp = new Float32Array(input.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0, count = 0;
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx;
          if (nx >= 0 && nx < width) {
            sum += input[y * width + nx];
            count++;
          }
        }
        temp[y * width + x] = sum / count;
      }
    }

    // Vertical pass
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0, count = 0;
        for (let dy = -r; dy <= r; dy++) {
          const ny = y + dy;
          if (ny >= 0 && ny < height) {
            sum += temp[ny * width + x];
            count++;
          }
        }
        output[y * width + x] = sum / count;
      }
    }

    return output;
  }

  /**
   * Morphological dilate — takes the maximum value within a circular kernel.
   * Thickens edges.
   */
  private morphDilate(
    input: Float32Array,
    width: number,
    height: number,
    radius: number
  ): Float32Array {
    const r = Math.max(1, Math.round(radius));
    const output = new Float32Array(input.length);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let maxVal = 0;
        for (let dy = -r; dy <= r; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -r; dx <= r; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            if (dx * dx + dy * dy > r * r) continue; // circular kernel
            maxVal = Math.max(maxVal, input[ny * width + nx]);
          }
        }
        output[y * width + x] = maxVal;
      }
    }

    return output;
  }

  /**
   * Morphological erode — takes the minimum value within a circular kernel.
   * Narrows edges. When combined with equivalent dilation, cleans up noise.
   */
  private morphErode(
    input: Float32Array,
    width: number,
    height: number,
    radius: number
  ): Float32Array {
    const r = Math.max(1, Math.round(radius));
    const output = new Float32Array(input.length);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let minVal = 1;
        for (let dy = -r; dy <= r; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -r; dx <= r; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            if (dx * dx + dy * dy > r * r) continue;
            minVal = Math.min(minVal, input[ny * width + nx]);
          }
        }
        output[y * width + x] = minVal;
      }
    }

    return output;
  }

  /**
   * Fast SDF (Signed Distance Field) blur.
   * Spreads edge values outward with linear falloff using two-pass propagation.
   * Matches the reference implementation: each pixel's value spreads to neighbors,
   * decreasing by 1/radius per pixel distance.
   */
  private sdfBlur(
    input: Float32Array,
    width: number,
    height: number,
    radius: number
  ): Float32Array {
    const falloff = 1 / radius;
    const out = new Float32Array(input);

    // Right/down pass
    for (let y = 0; y < height - 1; y++) {
      for (let x = 0; x < width - 1; x++) {
        const val = out[y * width + x] - falloff;
        const rightIdx = y * width + (x + 1);
        const downIdx = (y + 1) * width + x;
        out[rightIdx] = Math.max(out[rightIdx], val);
        out[downIdx] = Math.max(out[downIdx], val);
      }
    }

    // Left/up pass
    for (let y = height - 1; y > 0; y--) {
      for (let x = width - 1; x > 0; x--) {
        const val = out[y * width + x] - falloff;
        const leftIdx = y * width + (x - 1);
        const upIdx = (y - 1) * width + x;
        out[leftIdx] = Math.max(out[leftIdx], val);
        out[upIdx] = Math.max(out[upIdx], val);
      }
    }

    return out;
  }
}
