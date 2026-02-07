import React, { useEffect, useCallback, useRef } from 'react';
import { useCanvasStore } from '../stores/canvasStore';
import { useAnimationStore } from '../stores/animationStore';
import { useTimelineStore } from '../stores/timelineStore';
import { useToolStore } from '../stores/toolStore';
import { useSelectionStore } from '../stores/selectionStore';
import { getContentFrameAtTime } from '../utils/layerCompositing';
import type { Cell } from '../types';

/**
 * Hook that manages synchronization between canvas state and animation frames
 * - Auto-saves canvas changes to current frame
 * - Auto-loads frame data when switching frames
 * - Handles frame switching with proper data persistence
 */
export const useFrameSynchronization = (
  moveStateParam?: { 
    originalData: Map<string, Cell>;
    originalPositions: Set<string>;
    startPos: { x: number; y: number };
    baseOffset: { x: number; y: number };
    currentOffset: { x: number; y: number };
  } | null,
  setMoveStateParam?: React.Dispatch<React.SetStateAction<{ 
    originalData: Map<string, Cell>;
    originalPositions: Set<string>;
    startPos: { x: number; y: number };
    baseOffset: { x: number; y: number };
    currentOffset: { x: number; y: number };
  } | null>>
) => {
  const { cells, setCanvasData, width, height } = useCanvasStore();
  const { 
    currentFrameIndex, 
    setFrameData: legacySetFrameData, 
    getFrameData: legacyGetFrameData, 
    getCurrentFrame,
    isPlaying,
    isDraggingFrame,
    isDeletingFrame,
    isImportingSession
  } = useAnimationStore();

  // Timeline store state for layer-aware sync
  const layers = useTimelineStore((s) => s.layers);
  const activeLayerId = useTimelineStore((s) => s.view.activeLayerId);
  const tlCurrentFrame = useTimelineStore((s) => s.view.currentFrame);
  const isLayerMode = layers.length > 0;

  // In layer mode, use the timeline store's currentFrame (the source of truth).
  // The original animationStore.currentFrameIndex is a separate Zustand store
  // that is NOT updated by timeline navigation, so it stays stuck at 0.
  const effectiveFrameIndex = isLayerMode ? tlCurrentFrame : currentFrameIndex;

  // Layer-aware save: write canvas cells into the correct content frame
  const setFrameData = useCallback((frameIndex: number, data: Map<string, Cell>) => {
    if (isLayerMode) {
      const tl = useTimelineStore.getState();
      const layer = tl.layers.find((l) => l.id === (activeLayerId ?? tl.view.activeLayerId));
      if (!layer) return;
      const cf = getContentFrameAtTime(layer, frameIndex);
      if (!cf) return;
      tl.updateContentFrameData(layer.id, cf.id, data);
    } else {
      legacySetFrameData(frameIndex, data);
    }
  }, [isLayerMode, activeLayerId, legacySetFrameData]);

  // Layer-aware load: read from the correct content frame
  const getFrameData = useCallback((frameIndex: number): Map<string, Cell> | undefined => {
    if (isLayerMode) {
      const tl = useTimelineStore.getState();
      const layer = tl.layers.find((l) => l.id === (activeLayerId ?? tl.view.activeLayerId));
      if (!layer) return undefined;
      const cf = getContentFrameAtTime(layer, frameIndex);
      return cf ? new Map(cf.data) : undefined;
    } else {
      return legacyGetFrameData(frameIndex);
    }
  }, [isLayerMode, activeLayerId, legacyGetFrameData]);
  
  // Get processing history state to prevent saves during undo/redo
  const { isProcessingHistory } = useToolStore();
  
  const lastFrameIndexRef = useRef<number>(effectiveFrameIndex);
  const lastCellsRef = useRef<Map<string, Cell>>(new Map());
  const isLoadingFrameRef = useRef<boolean>(false);
  const frameWasEmptyOnLoadRef = useRef<boolean>(false);
  const lastActiveLayerIdRef = useRef<string | null>(activeLayerId);

  // ── Layer-switch sync ──
  // When the active layer changes, flush canvas to the old layer's content frame
  // and load the new layer's content frame into canvasStore.
  useEffect(() => {
    if (!isLayerMode) return;
    const prevLayerId = lastActiveLayerIdRef.current;
    if (activeLayerId === prevLayerId) return;

    const tl = useTimelineStore.getState();
    const frame = tl.view.currentFrame;

    // Flush current canvas to the OLD layer's content frame
    if (prevLayerId && !isPlaying && !isLoadingFrameRef.current) {
      const oldLayer = tl.layers.find((l) => l.id === prevLayerId);
      if (oldLayer) {
        const oldCf = getContentFrameAtTime(oldLayer, frame);
        if (oldCf) {
          tl.updateContentFrameData(oldLayer.id, oldCf.id, new Map(cells));
        }
      }
    }

    // Load the NEW layer's content frame into canvasStore
    isLoadingFrameRef.current = true;
    const newLayer = tl.layers.find((l) => l.id === activeLayerId);
    if (newLayer) {
      const newCf = getContentFrameAtTime(newLayer, frame);
      if (newCf && newCf.data.size > 0) {
        setCanvasData(new Map(newCf.data));
        lastCellsRef.current = new Map(newCf.data);
      } else {
        setCanvasData(new Map());
        lastCellsRef.current = new Map();
      }
    } else {
      setCanvasData(new Map());
      lastCellsRef.current = new Map();
    }
    setTimeout(() => { isLoadingFrameRef.current = false; }, 0);

    lastActiveLayerIdRef.current = activeLayerId;
  }, [activeLayerId, isLayerMode, isPlaying, cells, setCanvasData]);

  // Auto-save current canvas to current frame whenever canvas changes
  const saveCurrentCanvasToFrame = useCallback(() => {
    if (isLoadingFrameRef.current || isPlaying || isDraggingFrame || isDeletingFrame || isImportingSession || isProcessingHistory) return; // Don't save during frame loading, playback, dragging, deletion, session import, or undo/redo
    
    // Add small delay to prevent race conditions during frame reordering
    setTimeout(() => {
      if (isLoadingFrameRef.current || isPlaying || isDraggingFrame || isDeletingFrame || isImportingSession || isProcessingHistory) return;
      
      const currentCells = new Map(cells);
      setFrameData(effectiveFrameIndex, currentCells);
      lastCellsRef.current = currentCells;
    }, 50);
  }, [cells, effectiveFrameIndex, setFrameData, isPlaying, isDraggingFrame, isDeletingFrame, isImportingSession, isProcessingHistory]);

  // Load frame data into canvas when frame changes
  const loadFrameToCanvas = useCallback((frameIndex: number) => {
    isLoadingFrameRef.current = true;
    
    const frameData = getFrameData(frameIndex);
    
    if (frameData && frameData.size > 0) {
      setCanvasData(frameData);
      // Update the reference to prevent false auto-save triggers
      lastCellsRef.current = new Map(frameData);
      frameWasEmptyOnLoadRef.current = false;
    } else {
      // If frame has no data, clear canvas
      setCanvasData(new Map());
      // Update the reference to reflect the empty canvas
      lastCellsRef.current = new Map();
      frameWasEmptyOnLoadRef.current = true;
    }
    
    // Small delay to ensure canvas update completes
    setTimeout(() => {
      isLoadingFrameRef.current = false;
    }, 0);
  }, [getFrameData, setCanvasData]);

  // Handle frame switching
  useEffect(() => {
    const previousFrameIndex = lastFrameIndexRef.current;
    
    if (effectiveFrameIndex !== previousFrameIndex) {
        // CRITICAL: Use the last known cells state, not current cells which may have already been updated
      let currentCellsToSave = new Map(lastCellsRef.current);
      
      // Commit any pending move operations to the original frame before clearing state
      if (moveStateParam && setMoveStateParam) {
        const totalOffset = {
          x: moveStateParam.baseOffset.x + moveStateParam.currentOffset.x,
          y: moveStateParam.baseOffset.y + moveStateParam.currentOffset.y
        };

        // Create a new canvas data map with the moved cells
        const newCells = new Map(cells);

        // Clear original positions
        const originalKeys = moveStateParam.originalPositions ?? new Set(moveStateParam.originalData.keys());
        originalKeys.forEach((key) => {
          newCells.delete(key);
        });

        // Place cells at new positions AND build updated selection mask
        const updatedSelectionMask = new Set<string>();
        moveStateParam.originalData.forEach((cell, key) => {
          const [origX, origY] = key.split(',').map(Number);
          const newX = origX + totalOffset.x;
          const newY = origY + totalOffset.y;
          
          // Only place if within bounds
          if (newX >= 0 && newX < width && newY >= 0 && newY < height) {
            newCells.set(`${newX},${newY}`, cell);
            updatedSelectionMask.add(`${newX},${newY}`);
          }
        });
        
        // Also add any selected cells that weren't in originalData (empty cells in selection)
        // We need to offset ALL selected cells, not just the ones with content
        const toolStore = useToolStore.getState();
        const activeSelection = toolStore.selection.active ? toolStore.selection.selectedCells 
          : (toolStore.lassoSelection.active ? toolStore.lassoSelection.selectedCells 
          : (toolStore.magicWandSelection.active ? toolStore.magicWandSelection.selectedCells : null));
        
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

        // Update the cells to save with the committed move
        currentCellsToSave = newCells;
        
        // Update canvas data with committed move
        setCanvasData(newCells);
        
        // Update selection positions to reflect the move
        // IMPORTANT: Clear ALL tool selections first, then set current tool's selection
        if (updatedSelectionMask.size > 0) {
          const { activeTool } = toolStore;
          
          // Clear all tool selections first
          toolStore.clearSelection();
          toolStore.clearLassoSelection();
          toolStore.clearMagicWandSelection();
          
          // Set the current tool's selection with updated positions
          if (activeTool === 'select' || activeTool === 'lasso' || activeTool === 'magicwand') {
            if (activeTool === 'select') {
              toolStore.setSelectionFromMask(updatedSelectionMask);
            } else if (activeTool === 'lasso') {
              toolStore.setLassoSelectionFromMask(updatedSelectionMask, []);
            } else if (activeTool === 'magicwand') {
              toolStore.setMagicWandSelectionFromMask(updatedSelectionMask);
            }
          } else {
            // If on a non-selection tool, default to rect selection
            toolStore.setSelectionFromMask(updatedSelectionMask);
          }
          
          // Update global selection store
          useSelectionStore.getState().setSelection(updatedSelectionMask);
        }
        
        // Clear move state after committing
        setMoveStateParam(null);
      }
      
      // PERSISTENT SELECTION: Selections now persist across frame changes
      // The selection coordinates remain the same - they represent a "region of interest"
      // that applies to whatever frame is currently active
      // NOTE: Move operations are committed above, but the selection itself persists
      // Users must explicitly deselect with Escape, Cmd+D, or click outside
      
      // Save current canvas (with committed moves) to the frame we're leaving
      if (!isPlaying && !isLoadingFrameRef.current && !isDraggingFrame && !isDeletingFrame && !isImportingSession && !isProcessingHistory) {
        // Only save if the canvas content has actually changed from what was last loaded
        const lastLoadedCells = lastCellsRef.current;
        const cellsChanged = JSON.stringify(Array.from(currentCellsToSave.entries()).sort()) !== 
                           JSON.stringify(Array.from(lastLoadedCells.entries()).sort());
        
        // Don't save to frames that were empty when loaded unless user actually added content
        const previousFrameData = getFrameData(previousFrameIndex);
        const previousFrameWasEmpty = !previousFrameData || previousFrameData.size === 0;
        const userAddedContentToEmptyFrame = previousFrameWasEmpty && currentCellsToSave.size > 0;
        
        if (cellsChanged && (!previousFrameWasEmpty || userAddedContentToEmptyFrame)) {
          setFrameData(previousFrameIndex, currentCellsToSave);
        }
      }
      
      // Load the new frame's data
      loadFrameToCanvas(effectiveFrameIndex);
      
      lastFrameIndexRef.current = effectiveFrameIndex;
    }
  }, [effectiveFrameIndex, cells, setFrameData, getFrameData, loadFrameToCanvas, isPlaying, isDraggingFrame, isDeletingFrame, isImportingSession, isProcessingHistory, moveStateParam, setMoveStateParam, width, height, setCanvasData]);

  // Auto-save canvas changes to current frame (debounced)
  useEffect(() => {
    if (isLoadingFrameRef.current || isPlaying || isDraggingFrame || isDeletingFrame || isImportingSession || isProcessingHistory) return;
    
    // Check if cells actually changed from the last known state to avoid unnecessary saves
    const currentCellsString = JSON.stringify(Array.from(cells.entries()).sort());
    const lastCellsString = JSON.stringify(Array.from(lastCellsRef.current.entries()).sort());
    
    if (currentCellsString !== lastCellsString) {
      // Only save if the canvas content doesn't match the current frame's stored content
      // This prevents saving when the canvas is loaded with frame data
      const timeoutId = setTimeout(() => {
        if (!isLoadingFrameRef.current && !isPlaying && !isDraggingFrame && !isDeletingFrame && !isImportingSession && !isProcessingHistory) {
          saveCurrentCanvasToFrame();
        }
      }, 150);
      
      return () => clearTimeout(timeoutId);
    }
  }, [cells, saveCurrentCanvasToFrame, isPlaying, isDraggingFrame, isDeletingFrame, isImportingSession, isProcessingHistory]);

  // Initialize first frame with current canvas data if empty (only on app startup)
  // CRITICAL: This useEffect was previously contaminating ALL empty frames when switching
  // See docs/FRAME_SYNCHRONIZATION_DEBUGGING_GUIDE.md for detailed analysis and prevention patterns
  // NOTE: Only applies in legacy (non-layer) mode — layer mode manages data through content frames
  useEffect(() => {
    if (isLayerMode) return; // Layers handle their own data
    const currentFrame = getCurrentFrame();
    // Only initialize if we're on frame 0 AND it's empty AND canvas has content
    // This prevents contaminating empty frames when switching between frames
    if (effectiveFrameIndex === 0 && currentFrame && currentFrame.data.size === 0 && cells.size > 0 && !isLoadingFrameRef.current) {
      setFrameData(effectiveFrameIndex, new Map(cells));
    }
  }, [getCurrentFrame, cells, effectiveFrameIndex, setFrameData, isLayerMode]);

  return {
    saveCurrentCanvasToFrame,
    loadFrameToCanvas,
    isLoadingFrame: isLoadingFrameRef.current
  };
};
