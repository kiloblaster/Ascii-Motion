import type { Cell } from '../types';

/**
 * Anchor positions for canvas resize operations
 * Matches Photoshop-style 9-point anchor grid
 */
export type AnchorPosition = 
  | 'top-left' 
  | 'top-center' 
  | 'top-right'
  | 'middle-left' 
  | 'middle-center' 
  | 'middle-right'
  | 'bottom-left' 
  | 'bottom-center' 
  | 'bottom-right';

/**
 * Anchor position data for UI display
 */
export interface AnchorPositionData {
  position: AnchorPosition;
  label: string;
  row: number;
  col: number;
}

/**
 * All anchor positions with their display data
 */
export const ANCHOR_POSITIONS: AnchorPositionData[] = [
  { position: 'top-left', label: '↖', row: 0, col: 0 },
  { position: 'top-center', label: '↑', row: 0, col: 1 },
  { position: 'top-right', label: '↗', row: 0, col: 2 },
  { position: 'middle-left', label: '←', row: 1, col: 0 },
  { position: 'middle-center', label: '●', row: 1, col: 1 },
  { position: 'middle-right', label: '→', row: 1, col: 2 },
  { position: 'bottom-left', label: '↙', row: 2, col: 0 },
  { position: 'bottom-center', label: '↓', row: 2, col: 1 },
  { position: 'bottom-right', label: '↘', row: 2, col: 2 },
];

/**
 * Calculate the offset to apply to cells based on anchor position
 * 
 * @param oldWidth - Current canvas width
 * @param oldHeight - Current canvas height  
 * @param newWidth - Target canvas width
 * @param newHeight - Target canvas height
 * @param anchor - Anchor position determining where content stays
 * @returns Object with x and y offsets to apply to each cell
 */
export function calculateAnchorOffset(
  oldWidth: number,
  oldHeight: number,
  newWidth: number,
  newHeight: number,
  anchor: AnchorPosition
): { offsetX: number; offsetY: number } {
  const deltaWidth = newWidth - oldWidth;
  const deltaHeight = newHeight - oldHeight;

  let offsetX = 0;
  let offsetY = 0;

  // Calculate horizontal offset based on anchor column
  switch (anchor) {
    case 'top-left':
    case 'middle-left':
    case 'bottom-left':
      // Content stays at left, space added to right
      offsetX = 0;
      break;
    case 'top-center':
    case 'middle-center':
    case 'bottom-center':
      // Content centered, space added equally to both sides
      offsetX = Math.floor(deltaWidth / 2);
      break;
    case 'top-right':
    case 'middle-right':
    case 'bottom-right':
      // Content moves right, space added to left
      offsetX = deltaWidth;
      break;
  }

  // Calculate vertical offset based on anchor row
  switch (anchor) {
    case 'top-left':
    case 'top-center':
    case 'top-right':
      // Content stays at top, space added to bottom
      offsetY = 0;
      break;
    case 'middle-left':
    case 'middle-center':
    case 'middle-right':
      // Content centered, space added equally to top and bottom
      offsetY = Math.floor(deltaHeight / 2);
      break;
    case 'bottom-left':
    case 'bottom-center':
    case 'bottom-right':
      // Content moves down, space added to top
      offsetY = deltaHeight;
      break;
  }

  return { offsetX, offsetY };
}

/**
 * Resize a single frame's data with anchor-based positioning
 * 
 * @param frameData - Current frame cell data
 * @param oldWidth - Current canvas width
 * @param oldHeight - Current canvas height
 * @param newWidth - Target canvas width
 * @param newHeight - Target canvas height
 * @param anchor - Anchor position determining where content stays
 * @returns New Map with repositioned cells
 */
export function resizeFrameWithAnchor(
  frameData: Map<string, Cell>,
  oldWidth: number,
  oldHeight: number,
  newWidth: number,
  newHeight: number,
  anchor: AnchorPosition
): Map<string, Cell> {
  const { offsetX, offsetY } = calculateAnchorOffset(
    oldWidth,
    oldHeight,
    newWidth,
    newHeight,
    anchor
  );

  const newCells = new Map<string, Cell>();

  frameData.forEach((cell, key) => {
    const [x, y] = key.split(',').map(Number);
    
    // Calculate new position with offset
    const newX = x + offsetX;
    const newY = y + offsetY;

    // Only keep cells that fall within the new bounds
    if (newX >= 0 && newX < newWidth && newY >= 0 && newY < newHeight) {
      const newKey = `${newX},${newY}`;
      newCells.set(newKey, { ...cell });
    }
  });

  return newCells;
}

/**
 * Resize all frames in an animation with anchor-based positioning
 * 
 * @param frames - Array of frame objects with data property
 * @param oldWidth - Current canvas width
 * @param oldHeight - Current canvas height
 * @param newWidth - Target canvas width
 * @param newHeight - Target canvas height
 * @param anchor - Anchor position determining where content stays
 * @returns Array of new Maps with repositioned cells for each frame
 */
export function resizeAllFramesWithAnchor(
  frames: Array<{ data: Map<string, Cell> }>,
  oldWidth: number,
  oldHeight: number,
  newWidth: number,
  newHeight: number,
  anchor: AnchorPosition
): Map<string, Cell>[] {
  return frames.map((frame) =>
    resizeFrameWithAnchor(
      frame.data,
      oldWidth,
      oldHeight,
      newWidth,
      newHeight,
      anchor
    )
  );
}

/**
 * Get a human-readable description of the anchor position
 */
export function getAnchorDescription(anchor: AnchorPosition): string {
  const descriptions: Record<AnchorPosition, string> = {
    'top-left': 'Top Left',
    'top-center': 'Top Center',
    'top-right': 'Top Right',
    'middle-left': 'Middle Left',
    'middle-center': 'Center',
    'middle-right': 'Middle Right',
    'bottom-left': 'Bottom Left',
    'bottom-center': 'Bottom Center',
    'bottom-right': 'Bottom Right',
  };
  return descriptions[anchor];
}
