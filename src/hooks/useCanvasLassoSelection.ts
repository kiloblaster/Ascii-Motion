import { useCallback, useRef } from 'react';
import { useCanvasContext, useCanvasDimensions } from '../contexts/CanvasContext';
import { useCanvasState } from './useCanvasState';
import { useCanvasStore } from '../stores/canvasStore';
import { useToolStore } from '../stores/toolStore';
import { useSelectionStore } from '../stores/selectionStore';
import { useTimelineStore } from '../stores/timelineStore';
import { clearOtherToolSelections, clearAllSelections } from './useSelectionSync';
import { screenToLocal } from '../utils/layerTransformUtils';
import { compositeLayersAtFrame } from '../utils/layerCompositing';
import { getCellsInPolygon, smoothPolygonPath } from '../utils/polygon';
import { unionSelectionMasks, subtractSelectionMask } from '../utils/selectionUtils';
import type { Cell } from '../types';

/**
 * Hook for handling lasso selection tool behavior
 * Manages freeform selection creation, movement, and drag operations
 */
export const useCanvasLassoSelection = () => {
  const { canvasRef, mouseButtonDown, setMouseButtonDown, setSelectionPreview } = useCanvasContext();
  const { getGridCoordinates, getGridCoordinatesWithCenter } = useCanvasDimensions();
  const {
    selectionMode,
    moveState,
    commitMove,
    setSelectionMode,
    setMoveState,
    setJustCommittedMove,
  } = useCanvasState();
  
  // PERF FIX: Targeted selectors instead of broad useCanvasStore()/useToolStore().
  const width = useCanvasStore((s) => s.width);
  const height = useCanvasStore((s) => s.height);
  const cells = useCanvasStore((s) => s.cells);
  const getCell = useCanvasStore((s) => s.getCell);
  const currentFrameIndex = useTimelineStore((s) => s.view.currentFrame);
  const lassoSelection = useToolStore((s) => s.lassoSelection);
  const startLassoSelection = useToolStore((s) => s.startLassoSelection);
  const addLassoPoint = useToolStore((s) => s.addLassoPoint);
  const updateLassoSelectedCells = useToolStore((s) => s.updateLassoSelectedCells);
  const finalizeLassoSelection = useToolStore((s) => s.finalizeLassoSelection);
  const clearLassoSelection = useToolStore((s) => s.clearLassoSelection);
  const pushCanvasHistory = useToolStore((s) => s.pushCanvasHistory);
  const setLassoSelectionFromMask = useToolStore((s) => s.setLassoSelectionFromMask);

  const selectionModifierRef = useRef<'replace' | 'add' | 'subtract'>('replace');
  const baseSelectionMaskRef = useRef<Set<string>>(new Set());
  const selectionGestureActiveRef = useRef(false);

  const resetSelectionGesture = useCallback(() => {
    selectionModifierRef.current = 'replace';
    baseSelectionMaskRef.current = new Set();
    selectionGestureActiveRef.current = false;
    setSelectionPreview({
      active: false,
      modifier: 'replace',
      tool: null,
      baseCells: [],
      gestureCells: []
    });
  }, [setSelectionPreview]);

  const beginSelectionPreview = useCallback((modifier: 'replace' | 'add' | 'subtract') => {
    if (modifier === 'replace') {
      setSelectionPreview({
        active: false,
        modifier: 'replace',
        tool: null,
        baseCells: [],
        gestureCells: []
      });
      return;
    }

    setSelectionPreview({
      active: true,
      modifier,
      tool: 'lasso',
      baseCells: Array.from(baseSelectionMaskRef.current),
      gestureCells: []
    });
  }, [setSelectionPreview]);

  const updateSelectionPreview = useCallback((gestureCells: Set<string>) => {
    if (!selectionGestureActiveRef.current) {
      return;
    }

    if (selectionModifierRef.current === 'replace') {
      setSelectionPreview({
        active: false,
        modifier: 'replace',
        tool: null,
        baseCells: [],
        gestureCells: []
      });
      return;
    }

    setSelectionPreview({
      active: true,
      modifier: selectionModifierRef.current,
      tool: 'lasso',
      baseCells: Array.from(baseSelectionMaskRef.current),
      gestureCells: Array.from(gestureCells)
    });
  }, [setSelectionPreview]);

  const finalizeSelectionGesture = useCallback(() => {
    if (!selectionGestureActiveRef.current) {
      return;
    }

    const currentMask = lassoSelection.active ? new Set(lassoSelection.selectedCells) : new Set<string>();
    let nextMask: Set<string>;

    switch (selectionModifierRef.current) {
      case 'add':
        nextMask = unionSelectionMasks(baseSelectionMaskRef.current, currentMask);
        break;
      case 'subtract':
        nextMask = subtractSelectionMask(baseSelectionMaskRef.current, currentMask);
        break;
      default:
        nextMask = currentMask;
        break;
    }

    const finalPath = selectionModifierRef.current === 'replace' ? lassoSelection.path : [];
    setLassoSelectionFromMask(nextMask, finalPath);
    resetSelectionGesture();
  }, [lassoSelection, setLassoSelectionFromMask, resetSelectionGesture]);

  // Convert mouse coordinates to grid coordinates (with center snapping for lasso)
  const getGridCoordinatesFromEvent = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX;
    const mouseY = event.clientY;

    return getGridCoordinates(mouseX, mouseY, rect, width, height);
  }, [getGridCoordinates, width, height, canvasRef]);

  // Convert mouse coordinates to grid coordinates with center snapping for lasso path
  const getGridCoordinatesWithCenterFromEvent = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0.5, y: 0.5 };

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX;
    const mouseY = event.clientY;

    return getGridCoordinatesWithCenter(mouseX, mouseY, rect, width, height);
  }, [getGridCoordinatesWithCenter, width, height, canvasRef]);

  // Check if a point is inside the current selection (uses global selection for cross-tool support)
  const isPointInLassoSelection = useCallback((x: number, y: number) => {
    // Use global selection store for cross-tool selection support
    const globalSelection = useSelectionStore.getState();
    const activeSelectionCells = globalSelection.isActive 
      ? globalSelection.selectedCells 
      : (lassoSelection.active ? lassoSelection.selectedCells : new Set<string>());
    
    if (activeSelectionCells.size === 0) return false;
    
    // If there's a move state, we need to check against the original (non-offset) coordinates
    // because the selectedCells are stored in original coordinates
    if (moveState) {
      const totalOffset = {
        x: moveState.baseOffset.x + moveState.currentOffset.x,
        y: moveState.baseOffset.y + moveState.currentOffset.y
      };
      
      // Convert the click point back to original coordinates
      const originalX = x - totalOffset.x;
      const originalY = y - totalOffset.y;
      return activeSelectionCells.has(`${originalX},${originalY}`);
    }
    
    // No move state, check directly
    return activeSelectionCells.has(`${x},${y}`);
  }, [lassoSelection, moveState]);

  // Handle lasso selection mouse down
  const handleLassoMouseDown = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getGridCoordinatesFromEvent(event);
    const modifier: 'replace' | 'add' | 'subtract' = event.altKey ? 'subtract' : (event.shiftKey ? 'add' : 'replace');
    selectionModifierRef.current = modifier;

    // Use global selection store for cross-tool selection support
    // This allows Shift/Alt to add/subtract from selections made with any selection tool
    const globalSelection = useSelectionStore.getState();
    const existingMask = globalSelection.isActive 
      ? new Set(globalSelection.selectedCells) 
      : (lassoSelection.active ? new Set(lassoSelection.selectedCells) : new Set<string>());
    
    // Save current state for undo
    pushCanvasHistory(new Map(cells), currentFrameIndex, 'Lasso selection action');
    
    // Track if we committed a move - affects how we check point-in-selection
    let didCommitMove = false;
    
    // If there's a pending move from ANY selection tool, commit it before proceeding
    // This ensures selection positions are updated to reflect moved content
    if (moveState && modifier === 'replace') {
      commitMove();
      didCommitMove = true;
    }

    // Re-read fresh state after potential commitMove - React subscriptions don't update mid-handler
    const freshGlobalSelection = useSelectionStore.getState();
    const freshToolStore = useToolStore.getState();
    const freshLassoSelection = freshToolStore.lassoSelection;
    
    // Helper to check if point is in selection using FRESH state
    // After commitMove, moveState is null and selection positions are updated, so no offset needed
    const isPointInFreshSelection = (px: number, py: number): boolean => {
      const activeCells = freshGlobalSelection.isActive 
        ? freshGlobalSelection.selectedCells 
        : (freshLassoSelection.active ? freshLassoSelection.selectedCells : new Set<string>());
      
      if (activeCells.size === 0) return false;
      
      // If we just committed a move, selection positions are already updated - check directly
      // If we didn't commit, we still have a moveState with offset to account for
      if (!didCommitMove && moveState) {
        const totalOffsetX = moveState.baseOffset.x + moveState.currentOffset.x;
        const totalOffsetY = moveState.baseOffset.y + moveState.currentOffset.y;
        return activeCells.has(`${px - totalOffsetX},${py - totalOffsetY}`);
      }
      
      return activeCells.has(`${px},${py}`);
    };

    // If there's an uncommitted move and clicking outside selection, commit it first
    if (!didCommitMove && moveState && freshLassoSelection.active && !isPointInFreshSelection(x, y) && modifier === 'replace') {
      commitMove();
      didCommitMove = true;
      clearAllSelections();
      setJustCommittedMove(true);
      resetSelectionGesture();
      return;
    }

    // Check if clicking inside any active selection (including cross-tool selections) for move mode
    // This check MUST come before justCommittedMove check to allow multiple sequential moves
    const hasActiveSelection = freshGlobalSelection.isActive || freshLassoSelection.active;
    
    if (hasActiveSelection && isPointInFreshSelection(x, y) && !freshLassoSelection.isDrawing && modifier === 'replace') {
      // Click inside existing selection - enter move mode
      setJustCommittedMove(false);
      if (moveState && !didCommitMove) {
        // Already have a moveState (continuing from arrow key movement) and didn't just commit
        // Adjust startPos to account for existing currentOffset so position doesn't jump
        const adjustedStartPos = {
          x: x - moveState.currentOffset.x,
          y: y - moveState.currentOffset.y
        };
        setMoveState({
          ...moveState,
          startPos: adjustedStartPos
        });
      } else {
        // First time moving - create new moveState using GLOBAL selection for cross-tool support
        const originalData = new Map<string, Cell>();
        const originalPositions = new Set<string>();
        
        const selectionCells = freshGlobalSelection.isActive 
          ? freshGlobalSelection.selectedCells 
          : freshLassoSelection.selectedCells;
        
        // When "All Layers" is on, read from composited view for correct move preview
        const { selectionAffectsAllLayers: allLayers } = useToolStore.getState();
        let compositedForMove: Map<string, Cell> | null = null;
        if (allLayers) {
          const tl = useTimelineStore.getState();
          if (tl.layers.length > 0) {
            const w = useCanvasStore.getState().width;
            const h = useCanvasStore.getState().height;
            compositedForMove = compositeLayersAtFrame(
              tl.layers, tl.view.currentFrame,
              w, h, undefined, false, tl.layerGroups,
            );
          }
        }
        
        selectionCells.forEach((cellKey) => {
          const [cx, cy] = cellKey.split(',').map(Number);
          let cell: Cell | undefined;
          if (compositedForMove) {
            cell = compositedForMove.get(cellKey);
          } else {
            const local = screenToLocal(cx, cy);
            cell = getCell(local.x, local.y);
          }
          if (cell && cell.char !== ' ') {
            originalData.set(cellKey, cell);
            originalPositions.add(cellKey);
          } else if (compositedForMove) {
            originalPositions.add(cellKey);
          }
        });
        
        setMoveState({
          originalData,
          originalPositions,
          startPos: { x, y },
          baseOffset: { x: 0, y: 0 },
          currentOffset: { x: 0, y: 0 }
        });
      }
      setSelectionMode('moving');
      setMouseButtonDown(true);
      resetSelectionGesture();
      return;
    }

    if (hasActiveSelection && !isPointInFreshSelection(x, y) && !freshLassoSelection.isDrawing && modifier === 'replace') {
      // Click outside existing selection without modifiers - clear ALL selections (cross-tool support)
      setJustCommittedMove(false);
      clearAllSelections();
      resetSelectionGesture();
      return;
    }

    setJustCommittedMove(false);
    baseSelectionMaskRef.current = existingMask;
    selectionGestureActiveRef.current = true;
    
    // When starting a fresh selection (not add/subtract), clear other tool selections
    if (modifier === 'replace') {
      clearOtherToolSelections('lasso');
    }
    
    beginSelectionPreview(modifier);
    startLassoSelection();
    // Use center coordinates for lasso path
    const centerCoords = getGridCoordinatesWithCenterFromEvent(event);
    addLassoPoint(centerCoords.x, centerCoords.y);
    setMouseButtonDown(true);
    setSelectionMode('dragging');
  }, [
    getGridCoordinatesFromEvent,
    getGridCoordinatesWithCenterFromEvent,
    lassoSelection,
    pushCanvasHistory,
    cells,
    currentFrameIndex,
    moveState,
    commitMove,
    setJustCommittedMove,
  resetSelectionGesture,
  beginSelectionPreview,
    startLassoSelection,
    addLassoPoint,
    setMouseButtonDown,
    setSelectionMode,
    setMoveState,
    getCell
  ]);

    // Handle lasso selection mouse move
  const handleLassoMouseMove = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getGridCoordinatesFromEvent(event);

    if (selectionMode === 'moving' && moveState && mouseButtonDown) {
      // Only update move position if mouse button is down (mouse-initiated move)
      // This prevents arrow key-initiated moves from jumping to follow mouse movement
      const currentDragOffset = {
        x: x - moveState.startPos.x,
        y: y - moveState.startPos.y
      };
      
      // Update the current offset for preview
      setMoveState({
        ...moveState,
        currentOffset: currentDragOffset
      });
      // Note: Canvas modification happens in renderGrid for preview, actual move on mouse release
    } else if (mouseButtonDown && lassoSelection.isDrawing && selectionMode === 'dragging') {
      // Add point to lasso path using center coordinates
      const centerCoords = getGridCoordinatesWithCenterFromEvent(event);
      addLassoPoint(centerCoords.x, centerCoords.y);
      
      // Calculate selected cells from current path for real-time feedback
      if (lassoSelection.path.length >= 2) {
        // Create a closed path by connecting to the first point for preview
        const previewPath = [...lassoSelection.path, lassoSelection.path[0]];
        // Use minimal smoothing for precision
        const smoothedPath = smoothPolygonPath(previewPath, 0.2);
        const selectedCells = getCellsInPolygon(smoothedPath, width, height);
        updateLassoSelectedCells(selectedCells);
        updateSelectionPreview(selectedCells);
      }
    }
  }, [
    getGridCoordinatesFromEvent, getGridCoordinatesWithCenterFromEvent, selectionMode, moveState, setMoveState, 
    mouseButtonDown, lassoSelection, addLassoPoint, updateLassoSelectedCells,
    width, height, updateSelectionPreview
  ]);

  // Handle lasso selection mouse up
  const handleLassoMouseUp = useCallback(() => {
    if (selectionMode === 'moving' && moveState) {
      // Move drag completed - persist the current offset into base offset for continued editing
      setMoveState({
        ...moveState,
        baseOffset: {
          x: moveState.baseOffset.x + moveState.currentOffset.x,
          y: moveState.baseOffset.y + moveState.currentOffset.y
        },
        currentOffset: { x: 0, y: 0 }
      });
      setSelectionMode('none');
      setMouseButtonDown(false);
    } else if (selectionMode === 'dragging' && lassoSelection.isDrawing) {
      // Lasso drawing completed - finalize the selection
      if (lassoSelection.path.length >= 3) {
        // Close the polygon and smooth it minimally
        const smoothedPath = smoothPolygonPath(lassoSelection.path, 0.2);
        const selectedCells = getCellsInPolygon(smoothedPath, width, height);
        updateLassoSelectedCells(selectedCells);
        updateSelectionPreview(selectedCells);
        finalizeLassoSelection();
      } else {
        // Not enough points for a valid lasso, clear it
        clearLassoSelection();
        resetSelectionGesture();
      }
      setSelectionMode('none');
      setMouseButtonDown(false);
    } else {
      // Single click completed - clear mouse button state
      setMouseButtonDown(false);
    }

    if (selectionGestureActiveRef.current) {
      finalizeSelectionGesture();
    }
  }, [
    selectionMode, moveState, setMoveState, setSelectionMode, setMouseButtonDown,
    lassoSelection, updateLassoSelectedCells, finalizeLassoSelection, 
    clearLassoSelection, width, height, finalizeSelectionGesture, resetSelectionGesture,
    updateSelectionPreview
  ]);

  // Get effective lasso selection bounds for rendering
  const getLassoSelectionBounds = useCallback(() => {
    if (!lassoSelection.active || lassoSelection.selectedCells.size === 0) return null;
    
    const cellCoords = Array.from(lassoSelection.selectedCells).map(key => {
      const [x, y] = key.split(',').map(Number);
      return { x, y };
    });
    
    const minX = Math.min(...cellCoords.map(c => c.x));
    const maxX = Math.max(...cellCoords.map(c => c.x));
    const minY = Math.min(...cellCoords.map(c => c.y));
    const maxY = Math.max(...cellCoords.map(c => c.y));

    // If there's a move state, adjust bounds by the total offset
    if (moveState) {
      const totalOffset = {
        x: moveState.baseOffset.x + moveState.currentOffset.x,
        y: moveState.baseOffset.y + moveState.currentOffset.y
      };
      
      return {
        minX: minX + totalOffset.x,
        maxX: maxX + totalOffset.x,
        minY: minY + totalOffset.y,
        maxY: maxY + totalOffset.y
      };
    }

    return { minX, maxX, minY, maxY };
  }, [lassoSelection, moveState]);

  return {
    handleLassoMouseDown,
    handleLassoMouseMove,
    handleLassoMouseUp,
    isPointInLassoSelection,
    getLassoSelectionBounds,
  };
};
