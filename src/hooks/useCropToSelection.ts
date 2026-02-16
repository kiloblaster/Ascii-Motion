import { useCallback } from 'react';
import { toast } from 'sonner';
import { useCanvasStore } from '../stores/canvasStore';
import { useToolStore } from '../stores/toolStore';
import { useAnimationStore } from '../stores/animationStore';
import { useTimelineStore } from '../stores/timelineStore';
import { cropCanvasToSelection, cropAllFramesToSelection } from '../utils/cropUtils';
import { screenToLocal } from '../utils/layerTransformUtils';
import type { CanvasResizeHistoryAction } from '../types';
import type { LayerId } from '../types/timeline';

/**
 * Hook for cropping canvas to selection across all frames
 * Supports rectangular, lasso, and magic wand selections
 */
export function useCropToSelection() {
  // PERF FIX: Targeted selectors instead of broad useCanvasStore()/useToolStore().
  // Previously: `const { width, height, cells, ... } = useCanvasStore();`
  // Broad subscriptions caused re-renders on every cell edit, cascading through
  // ToolOptionsPanel (~700 lines) even though crop only needs callback access.
  const canvasWidth = useCanvasStore((s) => s.width);
  const canvasHeight = useCanvasStore((s) => s.height);
  const cells = useCanvasStore((s) => s.cells);
  const setCanvasSize = useCanvasStore((s) => s.setCanvasSize);
  const setCanvasData = useCanvasStore((s) => s.setCanvasData);
  const selection = useToolStore((s) => s.selection);
  const lassoSelection = useToolStore((s) => s.lassoSelection);
  const magicWandSelection = useToolStore((s) => s.magicWandSelection);
  const activeTool = useToolStore((s) => s.activeTool);
  const clearSelection = useToolStore((s) => s.clearSelection);
  const clearLassoSelection = useToolStore((s) => s.clearLassoSelection);
  const clearMagicWandSelection = useToolStore((s) => s.clearMagicWandSelection);
  const frames = useAnimationStore((s) => s.frames);
  const currentFrameIndex = useAnimationStore((s) => s.currentFrameIndex);
  const setFrameData = useAnimationStore((s) => s.setFrameData);

  /**
   * Get the current active selection's cells based on active tool
   */
  const getActiveSelection = useCallback((): Set<string> | null => {
    // Check which selection tool is active and has a selection
    if (activeTool === 'select' && selection.active && selection.selectedCells.size > 0) {
      return selection.selectedCells;
    } else if (activeTool === 'lasso' && lassoSelection.active && lassoSelection.selectedCells.size > 0) {
      return lassoSelection.selectedCells;
    } else if (activeTool === 'magicwand' && magicWandSelection.active && magicWandSelection.selectedCells.size > 0) {
      return magicWandSelection.selectedCells;
    }
    
    return null;
  }, [activeTool, selection, lassoSelection, magicWandSelection]);

  /**
   * Check if crop is available (has active selection)
   */
  const canCrop = useCallback((): boolean => {
    const activeSelection = getActiveSelection();
    return activeSelection !== null && activeSelection.size > 0;
  }, [getActiveSelection]);

  /**
   * Crop canvas to current selection across all frames
   */
  const cropToSelection = useCallback(() => {
    const selectedCells = getActiveSelection();
    
    if (!selectedCells || selectedCells.size === 0) {
      console.warn('No active selection to crop to');
      return;
    }

    // Crop current frame to get new dimensions
    const cropResult = cropCanvasToSelection(cells, selectedCells, screenToLocal);
    
    if (!cropResult) {
      console.warn('Failed to calculate crop dimensions');
      return;
    }

    const { newWidth, newHeight, croppedCells } = cropResult;

    // Validate new dimensions
    if (newWidth < 4 || newWidth > 200 || newHeight < 4 || newHeight > 100) {
      toast.error('Cannot execute crop: minimum canvas size is 4x4 characters.');
      return;
    }

    // Save previous state for undo - including ALL frames
    const previousWidth = canvasWidth;
    const previousHeight = canvasHeight;
    const previousCells = new Map(cells);
    const previousAllFramesData = frames.map(frame => new Map(frame.data));

    // Crop all frames
    const croppedFrames = cropAllFramesToSelection(frames, selectedCells, screenToLocal);
    
    if (!croppedFrames) {
      console.warn('Failed to crop frames');
      return;
    }

    // Apply crop to all frames
    croppedFrames.forEach((croppedFrameData, index) => {
      setFrameData(index, croppedFrameData);
    });

    // Apply crop to current canvas
    setCanvasSize(newWidth, newHeight);
    setCanvasData(croppedCells);

    // Reset the active layer's position transform so cropped content renders at origin
    const tl = useTimelineStore.getState();
    const activeLayerId = tl.view.activeLayerId;
    if (activeLayerId) {
      // Reset position to (0,0) — content is now positioned relative to new canvas origin
      tl.setStaticProperty(activeLayerId, 'transform.position.x', 0);
      tl.setStaticProperty(activeLayerId, 'transform.position.y', 0);
      // Reset anchor point to center of new canvas
      tl.setStaticProperty(activeLayerId, 'transform.anchorPoint.x', Math.floor(newWidth / 2));
      tl.setStaticProperty(activeLayerId, 'transform.anchorPoint.y', Math.floor(newHeight / 2));
      // Remove any keyframed position/anchor tracks (they'd be wrong after crop)
      const layer = tl.layers.find(l => l.id === activeLayerId);
      if (layer) {
        for (const track of [...layer.propertyTracks]) {
          if (track.propertyPath === 'transform.position.x' || 
              track.propertyPath === 'transform.position.y' ||
              track.propertyPath === 'transform.anchorPoint.x' ||
              track.propertyPath === 'transform.anchorPoint.y') {
            tl.removePropertyTrack(activeLayerId, track.id);
          }
        }
      }
      // If in a group, reset group position too
      const group = tl.layerGroups.find(g => g.childLayerIds.includes(activeLayerId));
      if (group) {
        tl.setStaticProperty(group.id as unknown as LayerId, 'transform.position.x', 0);
        tl.setStaticProperty(group.id as unknown as LayerId, 'transform.position.y', 0);
      }
    }

    // Add to history - we'll use a custom approach to store all frames
    // We'll create a canvas_resize action but extend it with all frames data
    const action: CanvasResizeHistoryAction = {
      type: 'canvas_resize' as const,
      timestamp: Date.now(),
      description: `Crop canvas from ${previousWidth}×${previousHeight} to ${newWidth}×${newHeight}`,
      data: {
        previousWidth,
        previousHeight,
        newWidth,
        newHeight,
        previousCanvasData: previousCells,
        frameIndex: currentFrameIndex,
        // Store all frames' previous data for crop operations
        allFramesPreviousData: previousAllFramesData,
        allFramesNewData: croppedFrames,
        isCropOperation: true
      }
    };
    
    // Push to history using the internal method
    useToolStore.getState().pushToHistory(action);

    // Clear the selection after crop
    if (activeTool === 'select') {
      clearSelection();
    } else if (activeTool === 'lasso') {
      clearLassoSelection();
    } else if (activeTool === 'magicwand') {
      clearMagicWandSelection();
    }

    console.log(`Canvas cropped from ${previousWidth}×${previousHeight} to ${newWidth}×${newHeight}`);
  }, [
    getActiveSelection,
    cells,
    canvasWidth,
    canvasHeight,
    frames,
    currentFrameIndex,
    activeTool,
    setCanvasSize,
    setCanvasData,
    setFrameData,
    clearSelection,
    clearLassoSelection,
    clearMagicWandSelection
  ]);

  return {
    canCrop,
    cropToSelection
  };
}
