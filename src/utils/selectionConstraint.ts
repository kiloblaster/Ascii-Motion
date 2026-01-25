/**
 * Selection Constraint Utilities
 * 
 * Provides functions for constraining drawing and fill operations
 * to the active selection bounds.
 * 
 * @see docs/PERSISTENT_SELECTION_IMPLEMENTATION_PLAN.md
 */

import { useSelectionStore } from '../stores/selectionStore';
import type { Cell } from '../types';

/**
 * Check if a cell is drawable (within selection or no selection active)
 * 
 * @param x - Cell X coordinate
 * @param y - Cell Y coordinate
 * @returns true if the cell can be modified, false if blocked by selection
 */
export function isCellDrawable(x: number, y: number): boolean {
  const { isActive, isCellSelected } = useSelectionStore.getState();
  
  // If no selection, all cells are drawable
  if (!isActive) return true;
  
  // If selection exists, only selected cells are drawable
  return isCellSelected(x, y);
}

/**
 * Check if a cell is drawable using a pre-fetched selection state
 * (More efficient when checking many cells in a loop)
 * 
 * @param x - Cell X coordinate
 * @param y - Cell Y coordinate
 * @param isSelectionActive - Whether selection is currently active
 * @param selectedCells - Set of selected cell keys
 * @returns true if the cell can be modified, false if blocked by selection
 */
export function isCellDrawableWithState(
  x: number,
  y: number,
  isSelectionActive: boolean,
  selectedCells: Set<string>
): boolean {
  if (!isSelectionActive) return true;
  return selectedCells.has(`${x},${y}`);
}

/**
 * Filter an array of cell coordinates to only those within the active selection
 * 
 * @param cells - Array of cell coordinates
 * @returns Filtered array containing only drawable cells
 */
export function constrainCellsToSelection(
  cells: Array<{ x: number; y: number }>
): Array<{ x: number; y: number }> {
  const { isActive, selectedCells } = useSelectionStore.getState();
  
  if (!isActive) return cells;
  
  return cells.filter(({ x, y }) => selectedCells.has(`${x},${y}`));
}

/**
 * Filter an array of cell coordinates using pre-fetched selection state
 * (More efficient for batch operations)
 * 
 * @param cells - Array of cell coordinates
 * @param isSelectionActive - Whether selection is currently active
 * @param selectedCells - Set of selected cell keys
 * @returns Filtered array containing only drawable cells
 */
export function constrainCellsToSelectionWithState(
  cells: Array<{ x: number; y: number }>,
  isSelectionActive: boolean,
  selectedCells: Set<string>
): Array<{ x: number; y: number }> {
  if (!isSelectionActive) return cells;
  
  return cells.filter(({ x, y }) => selectedCells.has(`${x},${y}`));
}

/**
 * Filter a Map of cells to only those within the active selection
 * 
 * @param cells - Map of cell key to Cell data
 * @returns Filtered map containing only cells within selection
 */
export function constrainCellMapToSelection(
  cells: Map<string, Cell>
): Map<string, Cell> {
  const { isActive, selectedCells } = useSelectionStore.getState();
  
  if (!isActive) return cells;
  
  const constrained = new Map<string, Cell>();
  cells.forEach((cell, key) => {
    if (selectedCells.has(key)) {
      constrained.set(key, cell);
    }
  });
  return constrained;
}

/**
 * Filter a Map of cells using a specific selection mask
 * (Useful for effects that need to preserve the mask across frames)
 * 
 * @param cells - Map of cell key to Cell data
 * @param selectionMask - Set of cell keys to include
 * @returns Filtered map containing only cells within the mask
 */
export function constrainCellMapToMask(
  cells: Map<string, Cell>,
  selectionMask: Set<string>
): Map<string, Cell> {
  const constrained = new Map<string, Cell>();
  cells.forEach((cell, key) => {
    if (selectionMask.has(key)) {
      constrained.set(key, cell);
    }
  });
  return constrained;
}

/**
 * Get the current selection state for batch operations
 * Call this once at the start of a drawing operation to avoid
 * multiple store accesses.
 * 
 * @returns Object with isActive and selectedCells
 */
export function getSelectionState(): {
  isActive: boolean;
  selectedCells: Set<string>;
} {
  const { isActive, selectedCells } = useSelectionStore.getState();
  return { isActive, selectedCells };
}

/**
 * Check if selection is currently active
 * 
 * @returns true if a selection exists
 */
export function hasActiveSelection(): boolean {
  return useSelectionStore.getState().isActive;
}

/**
 * Get the selection bounds for quick rejection tests
 * 
 * @returns Selection bounds or null if no selection
 */
export function getSelectionBounds(): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} | null {
  return useSelectionStore.getState().bounds;
}

/**
 * Quick check if a point is potentially within selection bounds
 * (For performance: use this for fast rejection before detailed check)
 * 
 * @param x - X coordinate to check
 * @param y - Y coordinate to check
 * @returns true if point could be in selection, false if definitely outside
 */
export function isPointInSelectionBounds(x: number, y: number): boolean {
  const bounds = useSelectionStore.getState().bounds;
  
  if (!bounds) return false;
  
  return x >= bounds.minX && x <= bounds.maxX && 
         y >= bounds.minY && y <= bounds.maxY;
}

/**
 * For fill operations: check if a cell should be filled
 * Returns false if selection is active and cell is not selected
 * 
 * @param cellKey - Cell key in "x,y" format
 * @returns true if the cell can be filled
 */
export function canFillCell(cellKey: string): boolean {
  const { isActive, selectedCells } = useSelectionStore.getState();
  
  if (!isActive) return true;
  
  return selectedCells.has(cellKey);
}

/**
 * For fill operations with pre-fetched state
 * 
 * @param cellKey - Cell key in "x,y" format
 * @param isSelectionActive - Whether selection is active
 * @param selectedCells - Set of selected cell keys
 * @returns true if the cell can be filled
 */
export function canFillCellWithState(
  cellKey: string,
  isSelectionActive: boolean,
  selectedCells: Set<string>
): boolean {
  if (!isSelectionActive) return true;
  return selectedCells.has(cellKey);
}
