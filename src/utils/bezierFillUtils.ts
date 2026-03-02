/**
 * Bezier Fill Utilities
 * 
 * Implements the three fill modes for bezier shapes:
 * 1. Constant Fill - Simple point-in-path test
 * 2. Palette Fill - Overlap percentage mapped to palette characters
 * 3. Autofill - 9-region detection with intelligent character selection
 * 
 * Also supports color palette mapping for fill color mode
 */

import type { Cell } from '../types';
import type { BezierAnchorPoint } from '../stores/bezierStore';
import type { ColorPalette } from '../types/palette';
import { createBezierPath, getIntegerBounds } from './bezierPathUtils';
import {
  getSharedCanvas,
  isCellInside,
  calculateCellOverlap,
  detectCellRegions,
} from './bezierAutofillUtils';
import { getCharacterForPattern } from '../constants/bezierAutofill';
import { generateStrokeOutline } from './bezierStrokeUtils';
import { LineArtConverter } from './lineArtConverter';

/**
 * Helper function to map overlap percentage to color from a palette
 * @param overlapPercentage - The percentage of cell overlap (0-100)
 * @param colorPalette - The color palette to map from
 * @returns The color hex value from the palette
 */
function mapOverlapToColor(overlapPercentage: number, colorPalette: ColorPalette): string {
  if (colorPalette.colors.length === 0) {
    return '#FFFFFF'; // Default to white if no colors
  }
  
  // Map percentage to palette index
  const paletteIndex = Math.min(
    Math.floor((overlapPercentage / 100) * colorPalette.colors.length),
    colorPalette.colors.length - 1
  );
  
  return colorPalette.colors[paletteIndex].value;
}

/**
 * Fill cells using constant fill mode
 * Any cell whose center is inside the bezier shape gets filled with the selected character
 * 
 * @param anchorPoints - Bezier anchor points defining the shape
 * @param isClosed - Whether the shape is closed
 * @param canvasWidth - Width of the canvas in cells
 * @param canvasHeight - Height of the canvas in cells
 * @param cellWidth - Width of a single cell in pixels
 * @param cellHeight - Height of a single cell in pixels
 * @param zoom - Current zoom level
 * @param panOffset - Pan offset in pixels
 * @param selectedChar - Character to fill with
 * @param selectedColor - Text color to apply (when fillColorMode is 'current')
 * @param selectedBgColor - Background color to apply
 * @param fillColorMode - Color fill mode ('current' or 'palette')
 * @param colorPalette - Color palette for palette mode (optional)
 * @returns Map of cell keys to Cell objects
 */
export function fillConstant(
  anchorPoints: BezierAnchorPoint[],
  isClosed: boolean,
  canvasWidth: number,
  canvasHeight: number,
  cellWidth: number,
  cellHeight: number,
  zoom: number,
  panOffset: { x: number; y: number },
  selectedChar: string,
  selectedColor: string,
  selectedBgColor: string,
  fillColorMode: 'current' | 'palette' = 'current',
  colorPalette?: ColorPalette
): Map<string, Cell> {
  const filledCells = new Map<string, Cell>();

  if (!isClosed || anchorPoints.length < 3) {
    return filledCells; // Need closed shape with at least 3 points
  }

  // Get bounding box to limit iterations
  const bounds = getIntegerBounds(anchorPoints, canvasWidth, canvasHeight);

  // Create Path2D for hit testing
  const path = createBezierPath(
    anchorPoints,
    isClosed,
    cellWidth,
    cellHeight,
    zoom,
    panOffset
  );

  // Get shared canvas for point-in-path testing
  const { ctx } = getSharedCanvas(canvasWidth * cellWidth, canvasHeight * cellHeight);

  // Test each cell in bounding box
  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      if (isCellInside(x, y, path, ctx, cellWidth, cellHeight, zoom, panOffset)) {
        // Determine color based on fill color mode
        let color = selectedColor;
        if (fillColorMode === 'palette' && colorPalette) {
          // For constant fill, cell is 100% inside
          color = mapOverlapToColor(100, colorPalette);
        }
        
        const key = `${x},${y}`;
        filledCells.set(key, {
          char: selectedChar,
          color,
          bgColor: selectedBgColor,
        });
      }
    }
  }

  return filledCells;
}

/**
 * Fill cells using palette fill mode
 * Maps overlap percentage to character in the current palette
 * 
 * @param anchorPoints - Bezier anchor points defining the shape
 * @param isClosed - Whether the shape is closed
 * @param canvasWidth - Width of the canvas in cells
 * @param canvasHeight - Height of the canvas in cells
 * @param cellWidth - Width of a single cell in pixels
 * @param cellHeight - Height of a single cell in pixels
 * @param zoom - Current zoom level
 * @param panOffset - Pan offset in pixels
 * @param palette - Array of characters to use (ordered from empty to full)
 * @param selectedColor - Text color to apply (when fillColorMode is 'current')
 * @param selectedBgColor - Background color to apply
 * @param fillColorMode - Color fill mode ('current' or 'palette')
 * @param colorPalette - Color palette for palette mode (optional)
 * @returns Map of cell keys to Cell objects
 */
export function fillPalette(
  anchorPoints: BezierAnchorPoint[],
  isClosed: boolean,
  canvasWidth: number,
  canvasHeight: number,
  cellWidth: number,
  cellHeight: number,
  zoom: number,
  panOffset: { x: number; y: number },
  palette: string[],
  selectedColor: string,
  selectedBgColor: string,
  fillColorMode: 'current' | 'palette' = 'current',
  colorPalette?: ColorPalette
): Map<string, Cell> {
  const filledCells = new Map<string, Cell>();

  if (!isClosed || anchorPoints.length < 3) {
    return filledCells;
  }

  if (palette.length === 0) {
    console.warn('[bezierFill] Empty palette provided, no fill applied');
    return filledCells;
  }

  // Get bounding box
  const bounds = getIntegerBounds(anchorPoints, canvasWidth, canvasHeight);

  // Create Path2D
  const path = createBezierPath(
    anchorPoints,
    isClosed,
    cellWidth,
    cellHeight,
    zoom,
    panOffset
  );

  // Get shared canvas
  const { ctx } = getSharedCanvas(canvasWidth * cellWidth, canvasHeight * cellHeight);

  // Test each cell
  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const overlapPercentage = calculateCellOverlap(
        x,
        y,
        path,
        ctx,
        cellWidth,
        cellHeight,
        zoom,
        panOffset
      );

      if (overlapPercentage > 0) {
        // Map percentage to palette index
        const paletteIndex = Math.min(
          Math.floor((overlapPercentage / 100) * palette.length),
          palette.length - 1
        );

        // Determine color based on fill color mode
        let color = selectedColor;
        if (fillColorMode === 'palette' && colorPalette) {
          color = mapOverlapToColor(overlapPercentage, colorPalette);
        }

        const key = `${x},${y}`;
        filledCells.set(key, {
          char: palette[paletteIndex],
          color,
          bgColor: selectedBgColor,
        });
      }
    }
  }

  return filledCells;
}

/**
 * Fill cells using autofill mode
 * Intelligently selects characters based on 9-region overlap detection
 * 
 * @param anchorPoints - Bezier anchor points defining the shape
 * @param isClosed - Whether the shape is closed
 * @param canvasWidth - Width of the canvas in cells
 * @param canvasHeight - Height of the canvas in cells
 * @param cellWidth - Width of a single cell in pixels
 * @param cellHeight - Height of a single cell in pixels
 * @param zoom - Current zoom level
 * @param panOffset - Pan offset in pixels
 * @param paletteId - ID of the autofill palette to use ('block', 'ansi', etc.)
 * @param selectedColor - Text color to apply (when fillColorMode is 'current')
 * @param selectedBgColor - Background color to apply
 * @param fillColorMode - Color fill mode ('current' or 'palette')
 * @param colorPalette - Color palette for palette mode (optional)
 * @returns Map of cell keys to Cell objects
 */
export function fillAutofill(
  anchorPoints: BezierAnchorPoint[],
  isClosed: boolean,
  canvasWidth: number,
  canvasHeight: number,
  cellWidth: number,
  cellHeight: number,
  zoom: number,
  panOffset: { x: number; y: number },
  paletteId: string,
  selectedColor: string,
  selectedBgColor: string,
  fillColorMode: 'current' | 'palette' = 'current',
  colorPalette?: ColorPalette
): Map<string, Cell> {
  const filledCells = new Map<string, Cell>();

  if (!isClosed || anchorPoints.length < 3) {
    return filledCells;
  }

  // Get bounding box
  const bounds = getIntegerBounds(anchorPoints, canvasWidth, canvasHeight);

  // Create Path2D
  const path = createBezierPath(
    anchorPoints,
    isClosed,
    cellWidth,
    cellHeight,
    zoom,
    panOffset
  );

  // Get shared canvas
  const { ctx } = getSharedCanvas(canvasWidth * cellWidth, canvasHeight * cellHeight);

  // Test each cell with 9-region detection
  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const filledRegions = detectCellRegions(
        x,
        y,
        path,
        ctx,
        cellWidth,
        cellHeight,
        zoom,
        panOffset
      );

      // Only fill cells that have at least one region covered
      if (filledRegions.size > 0) {
        const character = getCharacterForPattern(paletteId, filledRegions);

        // Determine color based on fill color mode
        let color = selectedColor;
        if (fillColorMode === 'palette' && colorPalette) {
          // For autofill, use number of filled regions as approximation of overlap
          // 9 regions total, so percentage = (filled / 9) * 100
          const overlapPercentage = (filledRegions.size / 9) * 100;
          color = mapOverlapToColor(overlapPercentage, colorPalette);
        }

        const key = `${x},${y}`;
        filledCells.set(key, {
          char: character,
          color,
          bgColor: selectedBgColor,
        });
      }
    }
  }

  return filledCells;
}

/**
 * Generate preview cells based on current fill mode and settings
 * This is the main entry point called by the bezier overlay/tool manager
 * 
 * @param anchorPoints - Bezier anchor points
 * @param isClosed - Whether the shape is closed
 * @param fillMode - Fill mode ('constant', 'palette', 'autofill')
 * @param canvasWidth - Canvas width in cells
 * @param canvasHeight - Canvas height in cells
 * @param cellWidth - Cell width in pixels
 * @param cellHeight - Cell height in pixels
 * @param zoom - Zoom level
 * @param panOffset - Pan offset
 * @param selectedChar - Selected character for constant mode
 * @param selectedColor - Text color (when fillColorMode is 'current')
 * @param selectedBgColor - Background color
 * @param palette - Character palette for palette mode (optional)
 * @param autofillPaletteId - Palette ID for autofill mode (optional)
 * @param fillColorMode - Color fill mode ('current' or 'palette')
 * @param colorPalette - Color palette for palette color mode (optional)
 * @returns Object with preview cells and affected cell count
 */
export function generateBezierPreview(
  anchorPoints: BezierAnchorPoint[],
  isClosed: boolean,
  fillMode: 'constant' | 'palette' | 'autofill' | 'lineart',
  canvasWidth: number,
  canvasHeight: number,
  cellWidth: number,
  cellHeight: number,
  zoom: number,
  panOffset: { x: number; y: number },
  selectedChar: string,
  selectedColor: string,
  selectedBgColor: string,
  palette?: string[],
  autofillPaletteId?: string,
  fillColorMode: 'current' | 'palette' = 'current',
  colorPalette?: ColorPalette,
  strokeWidth: number = 1.0,
  strokeTaperStart: number = 0.0,
  strokeTaperEnd: number = 0.0,
  lineArtEdgeThreshold: number = 0.15,
  lineArtSdfBlur: number = 3,
  lineArtInverseMatch: number = 8
): { previewCells: Map<string, Cell>; affectedCount: number } {
  console.log(`[bezierPreview] fillMode=${fillMode}, points=${anchorPoints.length}, isClosed=${isClosed}`);
  // If path is open and has stroke, convert stroke to closed polygon for filling
  // (skip for lineart mode which renders the path directly)
  let effectiveAnchorPoints = anchorPoints;
  let effectiveIsClosed = isClosed;

  if (fillMode !== 'lineart' && !isClosed && strokeWidth > 0 && anchorPoints.length >= 2) {
    // Generate stroke outline as a closed polygon
    const strokeOutline = generateStrokeOutline(
      anchorPoints,
      strokeWidth,
      strokeTaperStart,
      strokeTaperEnd,
      32 // segments per curve for smooth stroke
    );

    // Convert outline points back to anchor points format for filling
    effectiveAnchorPoints = strokeOutline.map((point, index) => ({
      id: `stroke_${index}`,
      position: point,
      handleIn: index > 0 ? strokeOutline[index - 1] : point,
      handleOut: index < strokeOutline.length - 1 ? strokeOutline[index + 1] : point,
      hasHandles: false,
      handleSymmetric: false,
      selected: false,
    }));
    effectiveIsClosed = true; // Stroke outline is always closed
  }

  let previewCells: Map<string, Cell>;

  switch (fillMode) {
    case 'constant':
      previewCells = fillConstant(
        effectiveAnchorPoints,
        effectiveIsClosed,
        canvasWidth,
        canvasHeight,
        cellWidth,
        cellHeight,
        zoom,
        panOffset,
        selectedChar,
        selectedColor,
        selectedBgColor,
        fillColorMode,
        colorPalette
      );
      break;

    case 'palette':
      if (!palette || palette.length === 0) {
        console.warn('[bezierFill] Palette mode selected but no palette provided');
        previewCells = new Map();
      } else {
        previewCells = fillPalette(
          effectiveAnchorPoints,
          effectiveIsClosed,
          canvasWidth,
          canvasHeight,
          cellWidth,
          cellHeight,
          zoom,
          panOffset,
          palette,
          selectedColor,
          selectedBgColor,
          fillColorMode,
          colorPalette
        );
      }
      break;

    case 'autofill': {
      const paletteIdToUse = autofillPaletteId || 'block';
      previewCells = fillAutofill(
        effectiveAnchorPoints,
        effectiveIsClosed,
        canvasWidth,
        canvasHeight,
        cellWidth,
        cellHeight,
        zoom,
        panOffset,
        paletteIdToUse,
        selectedColor,
        selectedBgColor,
        fillColorMode,
        colorPalette
      );
      break;
    }

    case 'lineart':
      previewCells = fillLineArt(
        anchorPoints,   // Use original path, not stroke-converted polygon
        isClosed,
        canvasWidth,
        canvasHeight,
        cellWidth,
        cellHeight,
        zoom,
        panOffset,
        selectedColor,
        selectedBgColor,
        strokeWidth,
        lineArtEdgeThreshold,
        lineArtSdfBlur,
        lineArtInverseMatch,
        strokeTaperStart,
        strokeTaperEnd
      );
      break;

    default:
      console.warn(`[bezierFill] Unknown fill mode: ${fillMode}`);
      previewCells = new Map();
  }

  return {
    previewCells,
    affectedCount: previewCells.size,
  };
}

/**
 * Line Art fill mode.
 * Renders the bezier path to a high-res offscreen canvas, then runs the
 * LineArtConverter to pick line-drawing ASCII characters for each cell.
 */
function fillLineArt(
  anchorPoints: BezierAnchorPoint[],
  isClosed: boolean,
  canvasWidth: number,
  canvasHeight: number,
  _cellWidth: number,
  _cellHeight: number,
  _zoom: number,
  _panOffset: { x: number; y: number },
  selectedColor: string,
  selectedBgColor: string,
  strokeWidth: number,
  lineArtEdgeThreshold: number = 0.01,
  lineArtSdfBlur: number = 0,
  lineArtInverseMatch: number = 20,
  strokeTaperStart: number = 0,
  strokeTaperEnd: number = 0
): Map<string, Cell> {
  console.log(`[fillLineArt] ENTERED, points=${anchorPoints.length}, strokeWidth=${strokeWidth}, threshold=${lineArtEdgeThreshold}, sdf=${lineArtSdfBlur}, inverse=${lineArtInverseMatch}`);
  const filledCells = new Map<string, Cell>();
  if (anchorPoints.length < 2) { console.log('[fillLineArt] early return: < 2 points'); return filledCells; }

  // Determine grid bounds from the path
  const bounds = getIntegerBounds(anchorPoints, canvasWidth, canvasHeight);
  console.log(`[fillLineArt] bounds: minX=${bounds.minX}, maxX=${bounds.maxX}, minY=${bounds.minY}, maxY=${bounds.maxY}`);
  const gridW = (Math.ceil(bounds.maxX - bounds.minX + 1)) | 0;
  const gridH = (Math.ceil(bounds.maxY - bounds.minY + 1)) | 0;
  if (gridW <= 0 || gridH <= 0 || !isFinite(gridW) || !isFinite(gridH)) { console.log('[fillLineArt] early return: invalid grid'); return filledCells; }

  // Render the bezier path to a high-res offscreen canvas (6px per cell)
  const ppc = 6;
  const renderW = (gridW * ppc) | 0;
  const renderH = (gridH * ppc) | 0;
  if (renderW <= 0 || renderH <= 0) return filledCells;
  const offscreen = document.createElement('canvas');
  offscreen.width = renderW;
  offscreen.height = renderH;
  const ctx = offscreen.getContext('2d')!;

  // Black background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, renderW, renderH);

  // Build the bezier path directly in offscreen pixel coordinates
  // Grid position (x, y) → offscreen pixel ((x - bounds.minX) * ppc + ppc/2, (y - bounds.minY) * ppc + ppc/2)
  const toOffscreen = (gridPos: { x: number; y: number }) => ({
    x: (gridPos.x - bounds.minX) * ppc + ppc / 2,
    y: (gridPos.y - bounds.minY) * ppc + ppc / 2,
  });

  const path = new Path2D();
  const first = toOffscreen(anchorPoints[0].position);
  path.moveTo(first.x, first.y);

  for (let i = 1; i < anchorPoints.length; i++) {
    const prev = anchorPoints[i - 1];
    const curr = anchorPoints[i];
    const prevPx = toOffscreen(prev.position);
    const currPx = toOffscreen(curr.position);

    const prevHasHandle = prev.hasHandles && prev.handleOut;
    const currHasHandle = curr.hasHandles && curr.handleIn;

    if (prevHasHandle && currHasHandle) {
      const cp1 = { x: prevPx.x + prev.handleOut!.x * ppc, y: prevPx.y + prev.handleOut!.y * ppc };
      const cp2 = { x: currPx.x + curr.handleIn!.x * ppc, y: currPx.y + curr.handleIn!.y * ppc };
      path.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, currPx.x, currPx.y);
    } else if (prevHasHandle) {
      const cp = { x: prevPx.x + prev.handleOut!.x * ppc, y: prevPx.y + prev.handleOut!.y * ppc };
      path.quadraticCurveTo(cp.x, cp.y, currPx.x, currPx.y);
    } else if (currHasHandle) {
      const cp = { x: currPx.x + curr.handleIn!.x * ppc, y: currPx.y + curr.handleIn!.y * ppc };
      path.quadraticCurveTo(cp.x, cp.y, currPx.x, currPx.y);
    } else {
      path.lineTo(currPx.x, currPx.y);
    }
  }

  // Close if needed
  if (isClosed && anchorPoints.length > 2) {
    const last = anchorPoints[anchorPoints.length - 1];
    const firstPt = anchorPoints[0];
    const lastPx = toOffscreen(last.position);
    const firstPx = toOffscreen(firstPt.position);

    const lastHas = last.hasHandles && last.handleOut;
    const firstHas = firstPt.hasHandles && firstPt.handleIn;

    if (lastHas && firstHas) {
      const cp1 = { x: lastPx.x + last.handleOut!.x * ppc, y: lastPx.y + last.handleOut!.y * ppc };
      const cp2 = { x: firstPx.x + firstPt.handleIn!.x * ppc, y: firstPx.y + firstPt.handleIn!.y * ppc };
      path.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, firstPx.x, firstPx.y);
    } else if (lastHas) {
      const cp = { x: lastPx.x + last.handleOut!.x * ppc, y: lastPx.y + last.handleOut!.y * ppc };
      path.quadraticCurveTo(cp.x, cp.y, firstPx.x, firstPx.y);
    } else if (firstHas) {
      const cp = { x: firstPx.x + firstPt.handleIn!.x * ppc, y: firstPx.y + firstPt.handleIn!.y * ppc };
      path.quadraticCurveTo(cp.x, cp.y, firstPx.x, firstPx.y);
    } else {
      path.lineTo(firstPx.x, firstPx.y);
    }
    path.closePath();
  }

  // Render the stroke — use tapered polygon when taper is active, plain stroke otherwise
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const hasTaper = !isClosed && (strokeTaperStart > 0 || strokeTaperEnd > 0);

  if (hasTaper) {
    // Generate tapered stroke outline in grid coords, then fill as polygon
    const outlinePoints = generateStrokeOutline(
      anchorPoints, strokeWidth, strokeTaperStart, strokeTaperEnd, 32
    );
    if (outlinePoints.length > 2) {
      const outlinePath = new Path2D();
      const firstOff = toOffscreen(outlinePoints[0]);
      outlinePath.moveTo(firstOff.x, firstOff.y);
      for (let i = 1; i < outlinePoints.length; i++) {
        const pt = toOffscreen(outlinePoints[i]);
        outlinePath.lineTo(pt.x, pt.y);
      }
      outlinePath.closePath();
      ctx.fill(outlinePath);
    }
  } else if (isClosed) {
    // For closed shapes, stroke the outline
    ctx.lineWidth = Math.max(1.5, strokeWidth * ppc * 0.3);
    ctx.stroke(path);
  } else {
    // Open path, no taper — uniform stroke
    ctx.lineWidth = Math.max(1.5, strokeWidth * ppc * 0.3);
    ctx.stroke(path);
  }

  // Get image data
  const imageData = ctx.getImageData(0, 0, renderW, renderH);

  // Debug: check if any white pixels were rendered
  let whitePixels = 0;
  for (let i = 0; i < imageData.data.length; i += 4) {
    if (imageData.data[i] > 128) whitePixels++;
  }
  console.log(`[LineArt] grid=${gridW}x${gridH}, render=${renderW}x${renderH}, whitePixels=${whitePixels}, threshold=${lineArtEdgeThreshold}, sdf=${lineArtSdfBlur}, inverse=${lineArtInverseMatch}`);

  if (whitePixels === 0) {
    console.warn('[LineArt] No white pixels rendered — path may be outside canvas bounds');
    return filledCells;
  }

  const converter = new LineArtConverter();
  converter.init(ppc, ppc);

  const dilate = Math.max(0, Math.round(strokeWidth) - 1);
  const charMap = converter.convertImage(imageData, gridW, gridH, {
    blurRadius: 0,
    edgeThreshold: lineArtEdgeThreshold,
    dilateRadius: dilate,
    erodeRadius: 0,
    sdfBlurRadius: lineArtSdfBlur,
    inverseMatchWeight: lineArtInverseMatch,
  });

  console.log(`[LineArt] charMap size=${charMap.size}`);

  // Map results back to canvas coordinates
  for (const [key, char] of charMap) {
    const [localX, localY] = key.split(',').map(Number);
    const canvasX = localX + bounds.minX;
    const canvasY = localY + bounds.minY;

    if (canvasX >= 0 && canvasX < canvasWidth && canvasY >= 0 && canvasY < canvasHeight) {
      filledCells.set(`${canvasX},${canvasY}`, {
        char,
        color: selectedColor,
        bgColor: selectedBgColor,
      });
    }
  }

  return filledCells;
}
