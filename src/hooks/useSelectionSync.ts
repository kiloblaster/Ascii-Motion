/**
 * Selection Sync Hook
 * 
 * Bridges the legacy tool store selection states (rect, lasso, wand)
 * to the unified global selection store.
 * 
 * This hook should be called once in the app (e.g., in CanvasProvider)
 * to ensure the global selection store stays in sync with tool store changes.
 * 
 * @see docs/PERSISTENT_SELECTION_IMPLEMENTATION_PLAN.md
 */

import { useEffect } from 'react';
import { useToolStore } from '../stores/toolStore';
import { useSelectionStore } from '../stores/selectionStore';

/**
 * Syncs the legacy tool store selections to the global selection store
 */
export function useSelectionSync() {
  const selection = useToolStore((state) => state.selection);
  const lassoSelection = useToolStore((state) => state.lassoSelection);
  const magicWandSelection = useToolStore((state) => state.magicWandSelection);
  const activeTool = useToolStore((state) => state.activeTool);
  
  const setSelection = useSelectionStore((state) => state.setSelection);
  const globalIsActive = useSelectionStore((state) => state.isActive);
  
  // Sync tool store selections to global store
  useEffect(() => {
    // Determine which selection is currently active based on tool and state
    let activeSelection: Set<string> | null = null;
    
    // Priority: Check which selection is active
    // Note: With persistent selections, multiple can be active,
    // but we use the one from the currently active tool
    if (activeTool === 'select' && selection.active) {
      activeSelection = selection.selectedCells;
    } else if (activeTool === 'lasso' && lassoSelection.active) {
      activeSelection = lassoSelection.selectedCells;
    } else if (activeTool === 'magicwand' && magicWandSelection.active) {
      activeSelection = magicWandSelection.selectedCells;
    } else {
      // If current tool isn't a selection tool, find any active selection
      if (selection.active) {
        activeSelection = selection.selectedCells;
      } else if (lassoSelection.active) {
        activeSelection = lassoSelection.selectedCells;
      } else if (magicWandSelection.active) {
        activeSelection = magicWandSelection.selectedCells;
      }
    }
    
    // Update global store
    if (activeSelection && activeSelection.size > 0) {
      setSelection(activeSelection);
    } else if (globalIsActive) {
      // Only clear if global store thinks there's a selection
      // but none of the tool selections are active
      if (!selection.active && !lassoSelection.active && !magicWandSelection.active) {
        setSelection(new Set());
      }
    }
  }, [
    selection.active,
    selection.selectedCells,
    lassoSelection.active,
    lassoSelection.selectedCells,
    magicWandSelection.active,
    magicWandSelection.selectedCells,
    activeTool,
    setSelection,
    globalIsActive
  ]);
}

/**
 * Clears all selections (both tool store and global store)
 * Call this when user explicitly deselects (Escape, Cmd+D, click outside)
 */
export function clearAllSelections() {
  const toolStore = useToolStore.getState();
  const selectionStore = useSelectionStore.getState();
  
  // Clear tool store selections
  toolStore.clearSelection();
  toolStore.clearLassoSelection();
  toolStore.clearMagicWandSelection();
  
  // Clear global selection store
  selectionStore.clearSelection();
}

/**
 * Get the currently active selection type
 * Returns which tool's selection is currently active
 */
export function getActiveSelectionType(): 'rect' | 'lasso' | 'magicwand' | null {
  const { selection, lassoSelection, magicWandSelection, activeTool } = useToolStore.getState();
  
  // Priority based on current tool
  if (activeTool === 'select' && selection.active) return 'rect';
  if (activeTool === 'lasso' && lassoSelection.active) return 'lasso';
  if (activeTool === 'magicwand' && magicWandSelection.active) return 'magicwand';
  
  // Fallback: check any active
  if (selection.active) return 'rect';
  if (lassoSelection.active) return 'lasso';
  if (magicWandSelection.active) return 'magicwand';
  
  return null;
}

/**
 * Check if any selection is active (legacy or global)
 */
export function hasAnySelection(): boolean {
  const { selection, lassoSelection, magicWandSelection } = useToolStore.getState();
  const { isActive } = useSelectionStore.getState();
  
  return isActive || selection.active || lassoSelection.active || magicWandSelection.active;
}
