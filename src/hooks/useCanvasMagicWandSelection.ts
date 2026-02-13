import { useCallback, useRef } from 'react';
import { useCanvasContext, useCanvasDimensions } from '../contexts/CanvasContext';
import { useCanvasState } from './useCanvasState';
import { useCanvasStore } from '../stores/canvasStore';
import { useAnimationStore } from '../stores/animationStore';
import { useToolStore } from '../stores/toolStore';
import { useSelectionStore } from '../stores/selectionStore';
import { clearOtherToolSelections, clearAllSelections } from './useSelectionSync';
import { screenToLocal } from '../utils/layerTransformUtils';
import type { Cell } from '../types';
import { unionSelectionMasks, subtractSelectionMask } from '../utils/selectionUtils';

/**
 * Hook for handling magic wand selection tool behavior
 * Manages character/color-based selection creation, movement, and drag operations
 */
export const useCanvasMagicWandSelection = () => {
  const { canvasRef, mouseButtonDown, setMouseButtonDown, setSelectionPreview } = useCanvasContext();
  const { getGridCoordinates } = useCanvasDimensions();
  const {
    selectionMode,
    moveState,
    justCommittedMove,
    commitMove,
    setSelectionMode,
    setMoveState,
    setJustCommittedMove,
  } = useCanvasState();
  
  const currentFrameIndex = useAnimationStore((s) => s.currentFrameIndex);
  const { width, height, cells, getCell } = useCanvasStore();
  const { 
    magicWandSelection, 
    magicWandContiguous,
    startMagicWandSelection,
    clearMagicWandSelection,
    pushCanvasHistory,
    magicMatchChar,
    magicMatchColor,
    magicMatchBgColor,
    setMagicWandSelectionFromMask
  } = useToolStore();

  const selectionModifierRef = useRef<'replace' | 'add' | 'subtract'>('replace');
  const baseSelectionMaskRef = useRef<Set<string>>(new Set());
  const selectionGestureActiveRef = useRef(false);
  const baseTargetCellRef = useRef<Cell | null>(null);

  const clearSelectionPreview = useCallback(() => {
    setSelectionPreview({
      active: false,
      modifier: 'replace',
      tool: null,
      baseCells: [],
      gestureCells: []
    });
  }, [setSelectionPreview]);

  const resetSelectionGesture = useCallback(() => {
    selectionModifierRef.current = 'replace';
    baseSelectionMaskRef.current = new Set();
    selectionGestureActiveRef.current = false;
    baseTargetCellRef.current = null;
    clearSelectionPreview();
  }, [clearSelectionPreview]);

  const beginSelectionPreview = useCallback((modifier: 'replace' | 'add' | 'subtract') => {
    if (modifier === 'replace') {
      clearSelectionPreview();
      return;
    }

    setSelectionPreview({
      active: true,
      modifier,
      tool: 'magicwand',
      baseCells: Array.from(baseSelectionMaskRef.current),
      gestureCells: []
    });
  }, [setSelectionPreview, clearSelectionPreview]);

  const updateSelectionPreview = useCallback((gestureCells: Set<string>) => {
    if (!selectionGestureActiveRef.current) {
      return;
    }

    if (selectionModifierRef.current === 'replace') {
      clearSelectionPreview();
      return;
    }

    setSelectionPreview({
      active: true,
      modifier: selectionModifierRef.current,
      tool: 'magicwand',
      baseCells: Array.from(baseSelectionMaskRef.current),
      gestureCells: Array.from(gestureCells)
    });
  }, [setSelectionPreview, clearSelectionPreview]);

  const finalizeSelectionGesture = useCallback(() => {
    if (!selectionGestureActiveRef.current) {
      return;
    }

    const currentMask = magicWandSelection.active ? new Set(magicWandSelection.selectedCells) : new Set<string>();
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

    const finalTarget = selectionModifierRef.current === 'replace'
      ? magicWandSelection.targetCell
      : baseTargetCellRef.current ?? magicWandSelection.targetCell;

    setMagicWandSelectionFromMask(nextMask, finalTarget ?? undefined);
    resetSelectionGesture();
  }, [magicWandSelection, setMagicWandSelectionFromMask, resetSelectionGesture]);

  // Convert mouse coordinates to grid coordinates
  const getGridCoordinatesFromEvent = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX;
    const mouseY = event.clientY;

    return getGridCoordinates(mouseX, mouseY, rect, width, height);
  }, [getGridCoordinates, width, height, canvasRef]);

  // Check if a cell is empty (has no character or default character)
  const isCellEmpty = useCallback((cell: Cell | undefined) => {
    if (!cell) return true;
    return !cell.char || cell.char === '' || cell.char === ' ';
  }, []);

  // Check if two cells match according to enabled criteria (AND semantics)
  const cellsMatch = useCallback((cell1: Cell | undefined, cell2: Cell | undefined) => {
    // Both empty considered match only if character matching is enabled (so they represent same absence)
    if (isCellEmpty(cell1) && isCellEmpty(cell2)) {
      return magicMatchChar; // Only match empties if char criterion is on
    }
    if (isCellEmpty(cell1) || isCellEmpty(cell2)) return false;
    if (!cell1 || !cell2) return false;
    if (magicMatchChar && cell1.char !== cell2.char) return false;
    if (magicMatchColor && cell1.color !== cell2.color) return false;
    if (magicMatchBgColor && cell1.bgColor !== cell2.bgColor) return false;
    // If all enabled criteria passed
    return true;
  }, [isCellEmpty, magicMatchChar, magicMatchColor, magicMatchBgColor]);

  // Find all matching cells using flood fill (contiguous) or scan (non-contiguous)
  const findMatchingCells = useCallback((targetX: number, targetY: number, targetCell: Cell | undefined) => {
    // If no criteria enabled, do nothing
    if (!magicMatchChar && !magicMatchColor && !magicMatchBgColor) {
      return new Set<string>();
    }
    // If target is empty and char not part of criteria -> nothing
    if (isCellEmpty(targetCell) && !magicMatchChar) {
      return new Set<string>();
    }

    // Wrap getCell with inverse transform so screen-space coords map to local canvas data
    const getCellLocal = (sx: number, sy: number) => {
      const local = screenToLocal(sx, sy);
      return getCell(local.x, local.y);
    };

    const matchingCells = new Set<string>();

    if (magicWandContiguous) {
      // Contiguous selection using flood fill
      const visited = new Set<string>();
      const queue: { x: number; y: number }[] = [{ x: targetX, y: targetY }];

      while (queue.length > 0) {
        const { x, y } = queue.shift()!;
        const cellKey = `${x},${y}`;

        // Skip if out of bounds or already visited
        if (x < 0 || x >= width || y < 0 || y >= height || visited.has(cellKey)) {
          continue;
        }

        visited.add(cellKey);
        const currentCell = getCellLocal(x, y);

        // If this cell matches the target, add it and check neighbors
        if (cellsMatch(currentCell, targetCell)) {
          matchingCells.add(cellKey);

          // Add neighbors to queue
          queue.push(
            { x: x - 1, y }, // left
            { x: x + 1, y }, // right
            { x, y: y - 1 }, // up
            { x, y: y + 1 }  // down
          );
        }
      }
    } else {
      // Non-contiguous selection - scan entire canvas
      for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
          const currentCell = getCellLocal(x, y);
          if (cellsMatch(currentCell, targetCell)) {
            matchingCells.add(`${x},${y}`);
          }
        }
      }
    }

    return matchingCells;
  }, [width, height, getCell, cellsMatch, isCellEmpty, magicWandContiguous, magicMatchChar, magicMatchColor, magicMatchBgColor]);

  // Check if a point is inside the current selection (uses global selection for cross-tool support)
  const isPointInMagicWandSelection = useCallback((x: number, y: number) => {
    // Use global selection store for cross-tool selection support
    const globalSelection = useSelectionStore.getState();
    const activeSelectionCells = globalSelection.isActive 
      ? globalSelection.selectedCells 
      : (magicWandSelection.active ? magicWandSelection.selectedCells : new Set<string>());
    
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
  }, [magicWandSelection, moveState]);

  // Handle magic wand selection mouse down
  const handleMagicWandMouseDown = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getGridCoordinatesFromEvent(event);
    const modifier: 'replace' | 'add' | 'subtract' = event.altKey ? 'subtract' : (event.shiftKey ? 'add' : 'replace');
    selectionModifierRef.current = modifier;

    // Use global selection store for cross-tool selection support
    // This allows Shift/Alt to add/subtract from selections made with any selection tool
    const globalSelection = useSelectionStore.getState();
    const existingMask = globalSelection.isActive 
      ? new Set(globalSelection.selectedCells) 
      : (magicWandSelection.active ? new Set(magicWandSelection.selectedCells) : new Set<string>());
    baseTargetCellRef.current = magicWandSelection.active ? magicWandSelection.targetCell : null;

    // Save current state for undo
    pushCanvasHistory(new Map(cells), currentFrameIndex);
    
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
    const freshMagicWandSelection = freshToolStore.magicWandSelection;
    
    // Helper to check if point is in selection using FRESH state
    // After commitMove, moveState is null and selection positions are updated, so no offset needed
    const isPointInFreshSelection = (px: number, py: number): boolean => {
      const activeCells = freshGlobalSelection.isActive 
        ? freshGlobalSelection.selectedCells 
        : (freshMagicWandSelection.active ? freshMagicWandSelection.selectedCells : new Set<string>());
      
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

    if (moveState && freshMagicWandSelection.active && !isPointInFreshSelection(x, y) && modifier === 'replace') {
      commitMove();
      clearAllSelections();
      setJustCommittedMove(true);
      resetSelectionGesture();
      return;
    }

    // Check if clicking inside any active selection (including cross-tool selections) for move mode
    const hasActiveSelection = freshGlobalSelection.isActive || freshMagicWandSelection.active;
    
    if (hasActiveSelection && isPointInFreshSelection(x, y) && modifier === 'replace') {
      setSelectionMode('moving');

      if (moveState && !didCommitMove) {
        // Already have a moveState (continuing from arrow key movement) and didn't just commit
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
        
        // Use global selection cells for cross-tool selection support (fresh state after potential commitMove)
        const selectionCells = freshGlobalSelection.isActive 
          ? freshGlobalSelection.selectedCells 
          : freshMagicWandSelection.selectedCells;
        
        selectionCells.forEach((cellKey) => {
          originalPositions.add(cellKey);
          const [cx, cy] = cellKey.split(',').map(Number);
          const local = screenToLocal(cx, cy);
          const cell = getCell(local.x, local.y);
          if (cell && !isCellEmpty(cell)) {
            originalData.set(cellKey, cell);
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
      setMouseButtonDown(true);
      resetSelectionGesture();
      return;
    }

    setJustCommittedMove(false);

    const localTarget = screenToLocal(x, y);
    const targetCell = getCell(localTarget.x, localTarget.y);
    const matchingCells = findMatchingCells(x, y, targetCell);

    if (matchingCells.size === 0) {
      if (modifier === 'replace') {
        clearMagicWandSelection();
      }
      resetSelectionGesture();
      setMouseButtonDown(true);
      return;
    }

    baseSelectionMaskRef.current = existingMask;
    selectionGestureActiveRef.current = true;
    
    // When starting a fresh selection (not add/subtract), clear other tool selections
    if (modifier === 'replace') {
      clearOtherToolSelections('magicwand');
    }
    
    beginSelectionPreview(modifier);

    startMagicWandSelection(targetCell || null, matchingCells);
    setSelectionMode('none');
    updateSelectionPreview(matchingCells);
    setMouseButtonDown(true);
  }, [
    getGridCoordinatesFromEvent,
    magicWandSelection,
    pushCanvasHistory,
    cells,
    currentFrameIndex,
    moveState,
    isPointInMagicWandSelection,
    commitMove,
    clearMagicWandSelection,
    setJustCommittedMove,
    resetSelectionGesture,
    beginSelectionPreview,
    setSelectionMode,
    setMoveState,
    setMouseButtonDown,
    getCell,
    isCellEmpty,
    findMatchingCells,
    startMagicWandSelection,
    updateSelectionPreview
  ]);

  // Handle mouse move during magic wand selection
  const handleMagicWandMouseMove = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getGridCoordinatesFromEvent(event);

    // Handle move mode - only update position if mouse button is down (mouse-initiated move)
    // This prevents arrow key-initiated moves from jumping to follow mouse movement
    if (selectionMode === 'moving' && moveState && mouseButtonDown) {
      const newOffset = {
        x: x - moveState.startPos.x,
        y: y - moveState.startPos.y
      };
      
      setMoveState({
        ...moveState,
        currentOffset: newOffset
      });
    }
  }, [
    mouseButtonDown,
    getGridCoordinatesFromEvent,
    selectionMode,
    moveState,
    setMoveState
  ]);

  // Handle mouse up for magic wand selection
  const handleMagicWandMouseUp = useCallback(() => {
    if (!mouseButtonDown) return;

    setMouseButtonDown(false);

    // If we were in moving mode, that's the end of the move operation
    // The move will be committed when the user clicks elsewhere or presses Enter/Escape
    if (selectionMode === 'moving' && moveState) {
      // Move operation is complete, but not committed yet
      // User can continue adjusting or commit/cancel
    }

    // Reset just committed flag after a short delay to allow for proper click detection
    if (justCommittedMove) {
      setTimeout(() => setJustCommittedMove(false), 100);
    }

    if (selectionGestureActiveRef.current) {
      finalizeSelectionGesture();
    }
  }, [
    mouseButtonDown,
    setMouseButtonDown,
    selectionMode,
    moveState,
    justCommittedMove,
    setJustCommittedMove,
    finalizeSelectionGesture
  ]);

  return {
    handleMagicWandMouseDown,
    handleMagicWandMouseMove,
    handleMagicWandMouseUp,
    isPointInMagicWandSelection,
  };
};
