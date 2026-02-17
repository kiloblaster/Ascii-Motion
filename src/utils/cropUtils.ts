import type { Cell } from '../types';
import { getBoundsFromMask } from './selectionUtils';

/**
 * Crop all frames in an animation to match selection bounds.
 * Used in legacy (non-layer) mode as a fallback.
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
