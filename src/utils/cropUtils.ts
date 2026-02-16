import type { Cell } from '../types';
import { getBoundsFromMask } from './selectionUtils';

/**
 * Crop canvas data to the bounds of a selection.
 * 
 * Selection cells are in SCREEN space. Canvas cells are in LOCAL (layer) space.
 * We use the provided screenToLocalFn to convert selection coordinates before
 * looking up cell data.
 */
export interface CropResult {
  newWidth: number;
  newHeight: number;
  croppedCells: Map<string, Cell>;
}

export function cropCanvasToSelection(
  cells: Map<string, Cell>,
  selectedCells: Set<string>,
  screenToLocalFn?: (x: number, y: number) => { x: number; y: number }
): CropResult | null {
  // Get bounds from selection (screen space)
  const bounds = getBoundsFromMask(selectedCells);
  
  if (!bounds) {
    return null;
  }

  const { minX, minY, maxX, maxY } = bounds;
  
  // Calculate new canvas dimensions (based on screen-space selection bounds)
  const newWidth = maxX - minX + 1;
  const newHeight = maxY - minY + 1;
  
  // Create new cell map with repositioned cells
  const croppedCells = new Map<string, Cell>();
  
  // For each selected cell (screen space), convert to local space to look up data
  selectedCells.forEach((key) => {
    const [screenX, screenY] = key.split(',').map(Number);
    
    // Convert screen coords to local space for cell lookup
    const local = screenToLocalFn ? screenToLocalFn(screenX, screenY) : { x: screenX, y: screenY };
    const localKey = `${local.x},${local.y}`;
    const cell = cells.get(localKey);
    
    if (cell) {
      // Reposition cell relative to new origin (using screen-space offsets)
      const newX = screenX - minX;
      const newY = screenY - minY;
      croppedCells.set(`${newX},${newY}`, { ...cell });
    }
  });
  
  return {
    newWidth,
    newHeight,
    croppedCells
  };
}

/**
 * Crop all frames in an animation to match selection bounds.
 * 
 * Frame data is in LOCAL space. Selection bounds are in SCREEN space.
 * We use the provided screenToLocalFn to convert selection coordinates.
 */
export function cropAllFramesToSelection(
  frames: Array<{ data: Map<string, Cell> }>,
  selectedCells: Set<string>,
  screenToLocalFn?: (x: number, y: number) => { x: number; y: number }
): Array<Map<string, Cell>> | null {
  const bounds = getBoundsFromMask(selectedCells);
  
  if (!bounds) {
    return null;
  }

  const { minX, minY, maxX, maxY } = bounds;
  
  // Pre-compute the local-space coordinates for each screen-space position in the crop bounds
  const screenToLocalMap = new Map<string, string>();
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const screenKey = `${x},${y}`;
      const local = screenToLocalFn ? screenToLocalFn(x, y) : { x, y };
      screenToLocalMap.set(screenKey, `${local.x},${local.y}`);
    }
  }
  
  return frames.map((frame) => {
    const croppedCells = new Map<string, Cell>();
    
    // For each cell position in the crop bounds, look up in local space
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const screenKey = `${x},${y}`;
        const localKey = screenToLocalMap.get(screenKey) || screenKey;
        const cell = frame.data.get(localKey);
        
        if (cell) {
          const newX = x - minX;
          const newY = y - minY;
          croppedCells.set(`${newX},${newY}`, { ...cell });
        }
      }
    }
    
    return croppedCells;
  });
}
