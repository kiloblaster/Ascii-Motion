import { useCallback } from 'react';
import { useCanvasContext } from '../contexts/CanvasContext';
import { useCanvasStore } from '../stores/canvasStore';
import { useToolStore } from '../stores/toolStore';
import { useSelectionStore } from '../stores/selectionStore';
import { useTimelineStore } from '../stores/timelineStore';
import { screenToLocal, getComposedTransformForLayer } from '../utils/layerTransformUtils';
import { getContentFrameAtTime, inverseTransformPoint } from '../utils/layerCompositing';

/**
 * Custom hook that provides canvas state management functionality
 * Combines local canvas context with global store actions
 */
export const useCanvasState = () => {
  const canvasContext = useCanvasContext();
  // PERF FIX: Targeted selectors instead of broad useCanvasStore()/useToolStore().
  // This hook is consumed by 9 call sites in the CanvasGrid tree — broad subscriptions
  // here caused ALL of them to re-render on every cell edit and every tool state change.
  const width = useCanvasStore((s) => s.width);
  const height = useCanvasStore((s) => s.height);
  const cells = useCanvasStore((s) => s.cells);
  const setCanvasData = useCanvasStore((s) => s.setCanvasData);
  const selection = useToolStore((s) => s.selection);
  const lassoSelection = useToolStore((s) => s.lassoSelection);
  const magicWandSelection = useToolStore((s) => s.magicWandSelection);
  const activeTool = useToolStore((s) => s.activeTool);
  const setSelectionFromMask = useToolStore((s) => s.setSelectionFromMask);
  const setLassoSelectionFromMask = useToolStore((s) => s.setLassoSelectionFromMask);
  const setMagicWandSelectionFromMask = useToolStore((s) => s.setMagicWandSelectionFromMask);

  const {
    cellSize,
    cellWidth,
    cellHeight,
    zoom,
    panOffset,
    selectionMode,
    moveState,
    pendingSelectionStart,
    justCommittedMove,
    setMoveState,
    setSelectionMode,
    setPendingSelectionStart,
    setJustCommittedMove,
  } = canvasContext;

  // Calculate total offset for move operations
  const getTotalOffset = useCallback((state: typeof moveState) => {
    if (!state) return { x: 0, y: 0 };
    return {
      x: state.baseOffset.x + state.currentOffset.x,
      y: state.baseOffset.y + state.currentOffset.y,
    };
  }, []);

  // Get effective selection bounds (accounting for move offset)
  const getEffectiveSelectionBounds = useCallback(() => {
    if (!selection.active) return null;
    
    let startX = Math.min(selection.start.x, selection.end.x);
    let startY = Math.min(selection.start.y, selection.end.y);
    let endX = Math.max(selection.start.x, selection.end.x);
    let endY = Math.max(selection.start.y, selection.end.y);

    // If there's a move state, adjust bounds by the total offset
    if (moveState) {
      const totalOffset = getTotalOffset(moveState);
      startX += totalOffset.x;
      startY += totalOffset.y;
      endX += totalOffset.x;
      endY += totalOffset.y;
    }

    return { startX, startY, endX, endY };
  }, [selection, moveState, getTotalOffset]);

  // Check if a point is inside the effective selection (uses global selection for cross-tool support)
  const isPointInEffectiveSelection = useCallback((x: number, y: number) => {
    // Use global selection store for cross-tool selection support
    const globalSelection = useSelectionStore.getState();
    const activeSelectionCells = globalSelection.isActive 
      ? globalSelection.selectedCells 
      : (selection.active ? selection.selectedCells : new Set<string>());
    
    if (activeSelectionCells.size === 0) {
      return false;
    }

    let checkX = x;
    let checkY = y;

    if (moveState) {
      const totalOffset = getTotalOffset(moveState);
      checkX -= totalOffset.x;
      checkY -= totalOffset.y;
    }

    return activeSelectionCells.has(`${checkX},${checkY}`);
  }, [selection, moveState, getTotalOffset]);

    // Commit move operation to canvas
  const commitMove = useCallback(() => {
    if (!moveState) {
      return;
    }

    const totalOffset = {
      x: moveState.baseOffset.x + moveState.currentOffset.x,
      y: moveState.baseOffset.y + moveState.currentOffset.y
    };

    // Create a new canvas data map with the moved cells
    const newCells = new Map(cells);
    const { selectionAffectsAllLayers } = useToolStore.getState();

    // Clear original positions (inverse-transform to local space)
      const originalKeys = moveState.originalPositions ?? new Set(moveState.originalData.keys());
      originalKeys.forEach((key) => {
        const [ox, oy] = key.split(',').map(Number);
        const local = screenToLocal(ox, oy);
        newCells.delete(`${local.x},${local.y}`);
    });

    // Determine which cells to place on the active layer
    // When "All Layers" is on, originalData contains composited cells from ALL layers.
    // We should only place the active layer's own cells here — other layers are handled
    // by the multi-layer commit below.
    let activeLayerCells: Map<string, Cell>;
    if (selectionAffectsAllLayers) {
      // Filter to only cells that exist on the active layer (before the move)
      activeLayerCells = new Map<string, Cell>();
      originalKeys.forEach((key) => {
        const [ox, oy] = key.split(',').map(Number);
        const local = screenToLocal(ox, oy);
        const activeCell = cells.get(`${local.x},${local.y}`);
        if (activeCell && activeCell.char && activeCell.char !== ' ') {
          activeLayerCells.set(key, activeCell);
        }
      });
    } else {
      activeLayerCells = moveState.originalData;
    }

    // Place cells at new positions AND build updated selection mask
    const updatedSelectionMask = new Set<string>();
    activeLayerCells.forEach((cell, key) => {
      const [origX, origY] = key.split(',').map(Number);
      const newX = origX + totalOffset.x;
      const newY = origY + totalOffset.y;
      
      // Only place if within bounds
      if (newX >= 0 && newX < width && newY >= 0 && newY < height) {
        const local = screenToLocal(newX, newY);
        newCells.set(`${local.x},${local.y}`, cell);
        updatedSelectionMask.add(`${newX},${newY}`);
      }
    });
    
    // Also add any selected cells that weren't in originalData (empty cells in selection)
    // We need to offset ALL selected cells, not just the ones with content
    const activeSelection = selection.active ? selection.selectedCells 
      : (lassoSelection.active ? lassoSelection.selectedCells 
      : (magicWandSelection.active ? magicWandSelection.selectedCells : null));
    
    if (activeSelection) {
      activeSelection.forEach((key) => {
        const [origX, origY] = key.split(',').map(Number);
        const newX = origX + totalOffset.x;
        const newY = origY + totalOffset.y;
        if (newX >= 0 && newX < width && newY >= 0 && newY < height) {
          updatedSelectionMask.add(`${newX},${newY}`);
        }
      });
    }

    // Update canvas data
    setCanvasData(newCells);
    
    // If multi-layer mode is on, also move cells on other visible/unlocked layers
    if (selectionAffectsAllLayers && (totalOffset.x !== 0 || totalOffset.y !== 0)) {
      const tl = useTimelineStore.getState();
      const currentFrame = tl.view.currentFrame;
      const { pushToHistory } = useToolStore.getState();
      // Use the selection mask as the set of positions to move (screen-space)
      const selectionPositions = moveState.originalPositions ?? new Set(moveState.originalData.keys());
      
      for (const layer of tl.layers) {
        if (layer.id === tl.view.activeLayerId) continue;
        if (!layer.visible || layer.locked) continue;
        const cf = getContentFrameAtTime(layer, currentFrame);
        if (!cf) continue;
        
        const previousData = new Map(cf.data);
        const layerNewCells = new Map(cf.data);
        let changed = false;
        
        // Get this layer's composed transform (including group) to convert screen-space selection positions to local space
        const layerTransform = getComposedTransformForLayer(layer, currentFrame, tl.layerGroups);
        
        // Collect cells at original selection positions (converted to layer-local space)
        const cellsToMove = new Map<string, { localKey: string; cell: Cell }>();
        selectionPositions.forEach((screenKey: string) => {
          const [sx, sy] = screenKey.split(',').map(Number);
          // Convert screen-space selection position to this layer's local space
          const local = inverseTransformPoint(sx, sy, layerTransform);
          const localKey = `${local.x},${local.y}`;
          const cell = layerNewCells.get(localKey);
          if (cell) {
            cellsToMove.set(screenKey, { localKey, cell });
            layerNewCells.delete(localKey);
            changed = true;
          }
        });
        
        // Place at new positions (convert offset screen positions to local space)
        cellsToMove.forEach(({ cell }, screenKey) => {
          const [origSX, origSY] = screenKey.split(',').map(Number);
          const newSX = origSX + totalOffset.x;
          const newSY = origSY + totalOffset.y;
          // Convert new screen position to local space
          const newLocal = inverseTransformPoint(newSX, newSY, layerTransform);
          layerNewCells.set(`${newLocal.x},${newLocal.y}`, cell);
        });
        
        if (changed) {
          // Use setState to trigger proper re-render (not in-place mutation)
          // so useCompositedCanvas picks up the changes immediately
          useTimelineStore.setState((state) => ({
            layers: state.layers.map(l => {
              if (l.id !== layer.id) return l;
              return {
                ...l,
                contentFrames: l.contentFrames.map(frame =>
                  frame.id === cf.id ? { ...frame, data: layerNewCells } : frame
                ),
              };
            }),
          }));
          pushToHistory({
            type: 'content_frame_data',
            timestamp: Date.now(),
            description: `Move selection on ${layer.name}`,
            data: {
              layerId: layer.id as string,
              frameId: cf.id as string,
              previousData,
              newData: new Map(layerNewCells),
            },
          } as import('../types').ContentFrameDataHistoryAction);
        }
      }
    }
    
    // Update selection positions to reflect the move
    // IMPORTANT: Clear ALL tool selections first to avoid stale positions,
    // then set the current tool's selection with updated positions
    const toolStore = useToolStore.getState();
    
    if (updatedSelectionMask.size > 0) {
      // Clear all tool selections first
      toolStore.clearSelection();
      toolStore.clearLassoSelection();
      toolStore.clearMagicWandSelection();
      
      // Then set the current tool's selection with updated positions
      if (activeTool === 'select') {
        setSelectionFromMask(updatedSelectionMask);
      } else if (activeTool === 'lasso') {
        setLassoSelectionFromMask(updatedSelectionMask, []);
      } else if (activeTool === 'magicwand') {
        setMagicWandSelectionFromMask(updatedSelectionMask, magicWandSelection.targetCell ?? undefined);
      } else {
        // If not a selection tool, just set the rect selection as default
        setSelectionFromMask(updatedSelectionMask);
      }
      
      // Update global selection store
      useSelectionStore.getState().setSelection(updatedSelectionMask);
    } else {
      // No selection after move (all cells moved out of bounds)
      toolStore.clearSelection();
      toolStore.clearLassoSelection();
      toolStore.clearMagicWandSelection();
      useSelectionStore.getState().clearSelection();
    }

    // Clear move state
    setMoveState(null);
    setJustCommittedMove(true);
  }, [moveState, cells, width, height, setCanvasData, setMoveState, setJustCommittedMove, selection, lassoSelection, magicWandSelection, activeTool, setSelectionFromMask, setLassoSelectionFromMask, setMagicWandSelectionFromMask]);

  // Cancel move operation without committing changes
  const cancelMove = useCallback(() => {
    if (!moveState) return;

    // Simply clear the move state without making any changes to the canvas
    setMoveState(null);
    setJustCommittedMove(false);
  }, [moveState, setMoveState, setJustCommittedMove]);

  // Reset selection-related state when tool changes
  const resetSelectionState = useCallback(() => {
    if (moveState) {
      commitMove();
    }
    setSelectionMode('none');
    setPendingSelectionStart(null);
    setMoveState(null);
  }, [moveState, commitMove, setSelectionMode, setPendingSelectionStart, setMoveState]);

  // Get status message for UI display
  const getStatusMessage = useCallback(() => {
    if ((activeTool === 'select' || activeTool === 'lasso') && selectionMode === 'moving') {
      return 'Moving selection - release to place';
    }
    if (activeTool === 'select' && moveState && selection.active) {
      return 'Content moved - press Escape or click outside to commit';
    }
    if (activeTool === 'lasso' && moveState && lassoSelection.active) {
      return 'Content moved - press Escape or click outside to commit';
    }
    if (activeTool === 'select' && pendingSelectionStart) {
      return 'Shift adds, Alt removes from selection';
    }
    if (activeTool === 'select' && selection.active && selectionMode === 'none') {
      return 'Selection ready - copy/paste/move available';
    }
    if (activeTool === 'lasso' && lassoSelection.active && selectionMode === 'none') {
      return 'Lasso selection ready - copy/paste/move available';
    }
    return `Font: ${cellSize}px | Cell: ${cellWidth.toFixed(1)}×${cellHeight.toFixed(1)}`;
  }, [activeTool, selectionMode, moveState, selection.active, lassoSelection.active, pendingSelectionStart, cellSize, cellWidth, cellHeight]);

  return {
    // State
    cellSize,
    cellWidth,
    cellHeight,
    zoom,
    panOffset,
    selectionMode,
    moveState,
    pendingSelectionStart,
    justCommittedMove,
    
    // Canvas dimensions (with zoom applied)
    canvasWidth: width * cellWidth * zoom,
    canvasHeight: height * cellHeight * zoom,
    
    // Effective cell dimensions for rendering  
    effectiveCellWidth: cellWidth * zoom,
    effectiveCellHeight: cellHeight * zoom,
    
    // Computed values
    effectiveSelectionBounds: getEffectiveSelectionBounds(),
    statusMessage: getStatusMessage(),
    
    // Helper functions
    getTotalOffset,
    getEffectiveSelectionBounds,
    isPointInEffectiveSelection,
    commitMove,
    cancelMove,
    resetSelectionState,
    
    // State setters (from context)
    setSelectionMode,
    setMoveState,
    setPendingSelectionStart,
    setJustCommittedMove,
  };
};
