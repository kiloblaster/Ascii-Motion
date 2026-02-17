import { useCallback } from 'react';
import { toast } from 'sonner';
import { useCanvasStore } from '../stores/canvasStore';
import { useToolStore } from '../stores/toolStore';
import { useAnimationStore } from '../stores/animationStore';
import { useTimelineStore } from '../stores/timelineStore';
import { cropAllFramesToSelection } from '../utils/cropUtils';
import { screenToLocalForLayer } from '../utils/layerTransformUtils';
import { getBoundsFromMask } from '../utils/selectionUtils';
import type { CanvasResizeHistoryAction, Cell } from '../types';
import type { LayerId, Layer, ContentFrame } from '../types/timeline';

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
   * Crop canvas to current selection across ALL layers
   */
  const cropToSelection = useCallback(() => {
    const selectedCells = getActiveSelection();
    
    if (!selectedCells || selectedCells.size === 0) {
      console.warn('No active selection to crop to');
      return;
    }

    // Get crop bounds from selection (screen space)
    const bounds = getBoundsFromMask(selectedCells);
    if (!bounds) {
      console.warn('Failed to calculate crop dimensions');
      return;
    }

    const { minX, minY, maxX, maxY } = bounds;
    const newWidth = maxX - minX + 1;
    const newHeight = maxY - minY + 1;

    // Validate new dimensions
    if (newWidth < 4 || newWidth > 200 || newHeight < 4 || newHeight > 100) {
      toast.error('Cannot execute crop: minimum canvas size is 4x4 characters.');
      return;
    }

    const tl = useTimelineStore.getState();
    const isLayerMode = tl.layers.length > 0;

    // Save previous state for undo
    const previousWidth = canvasWidth;
    const previousHeight = canvasHeight;
    const previousCells = new Map(cells);

    if (isLayerMode) {
      // ── LAYER MODE: Crop ALL layers' content frames ──
      // Snapshot all layers for undo
      const previousLayerSnapshots = tl.layers.map(l => ({
        id: l.id,
        contentFrames: l.contentFrames.map(cf => ({
          id: cf.id,
          data: new Map(cf.data),
        })),
        staticProperties: { ...l.staticProperties },
        propertyTracks: l.propertyTracks.map(t => ({ ...t })),
      }));
      const previousGroupSnapshots = tl.layerGroups.map(g => ({
        ...g,
        staticProperties: { ...g.staticProperties },
      }));

      // Crop each layer's content frames using that layer's specific transform
      for (const layer of tl.layers) {
        const layerScreenToLocal = (x: number, y: number) =>
          screenToLocalForLayer(layer.id as string, x, y);

        for (const cf of layer.contentFrames) {
          const croppedCells = new Map<string, Cell>();
          
          // For each position in the crop bounds, inverse-transform to find source cell
          for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
              const local = layerScreenToLocal(x, y);
              const localKey = `${local.x},${local.y}`;
              const cell = cf.data.get(localKey);
              if (cell) {
                croppedCells.set(`${x - minX},${y - minY}`, { ...cell });
              }
            }
          }

          tl.updateContentFrameData(layer.id, cf.id, croppedCells);
        }

        // Reset this layer's position transform
        tl.setStaticProperty(layer.id, 'transform.position.x', 0);
        tl.setStaticProperty(layer.id, 'transform.position.y', 0);
        tl.setStaticProperty(layer.id, 'transform.anchorPoint.x', Math.floor(newWidth / 2));
        tl.setStaticProperty(layer.id, 'transform.anchorPoint.y', Math.floor(newHeight / 2));
        // Remove keyframed position/anchor tracks
        for (const track of [...layer.propertyTracks]) {
          if (track.propertyPath === 'transform.position.x' || 
              track.propertyPath === 'transform.position.y' ||
              track.propertyPath === 'transform.anchorPoint.x' ||
              track.propertyPath === 'transform.anchorPoint.y') {
            tl.removePropertyTrack(layer.id, track.id);
          }
        }
      }

      // Reset group transforms too
      for (const group of tl.layerGroups) {
        tl.setStaticProperty(group.id as unknown as LayerId, 'transform.position.x', 0);
        tl.setStaticProperty(group.id as unknown as LayerId, 'transform.position.y', 0);
        tl.setStaticProperty(group.id as unknown as LayerId, 'transform.anchorPoint.x', Math.floor(newWidth / 2));
        tl.setStaticProperty(group.id as unknown as LayerId, 'transform.anchorPoint.y', Math.floor(newHeight / 2));
      }

      // Resize canvas and load active layer's cropped data
      setCanvasSize(newWidth, newHeight);
      const activeLayer = tl.layers.find(l => l.id === tl.view.activeLayerId);
      if (activeLayer) {
        const activeCf = activeLayer.contentFrames.find(cf =>
          tl.view.currentFrame >= cf.startFrame && tl.view.currentFrame < cf.startFrame + cf.durationFrames
        );
        // Read the UPDATED content frame data from the store
        const updatedLayer = useTimelineStore.getState().layers.find(l => l.id === tl.view.activeLayerId);
        const updatedCf = updatedLayer?.contentFrames.find(cf => cf.id === activeCf?.id);
        if (updatedCf) {
          setCanvasData(new Map(updatedCf.data));
        } else {
          setCanvasData(new Map());
        }
      }

      // Record history with layer snapshots
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
          isCropOperation: true,
          // Layer snapshots for multi-layer undo
          previousLayerSnapshots,
          previousGroupSnapshots,
        }
      };
      useToolStore.getState().pushToHistory(action);

    } else {
      // ── LEGACY MODE: Crop via adapter (single-layer) ──
      const previousAllFramesData = frames.map(frame => new Map(frame.data));
      const croppedFrames = cropAllFramesToSelection(frames, selectedCells);
      
      if (!croppedFrames) {
        console.warn('Failed to crop frames');
        return;
      }

      croppedFrames.forEach((croppedFrameData, index) => {
        setFrameData(index, croppedFrameData);
      });

      setCanvasSize(newWidth, newHeight);
      // Crop the current canvas cells
      const croppedCanvasCells = new Map<string, Cell>();
      selectedCells.forEach((key) => {
        const [sx, sy] = key.split(',').map(Number);
        const cell = cells.get(key);
        if (cell) {
          croppedCanvasCells.set(`${sx - minX},${sy - minY}`, { ...cell });
        }
      });
      setCanvasData(croppedCanvasCells);

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
          allFramesPreviousData: previousAllFramesData,
          allFramesNewData: croppedFrames,
          isCropOperation: true
        }
      };
      useToolStore.getState().pushToHistory(action);
    }

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
