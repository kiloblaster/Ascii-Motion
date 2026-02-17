import { useCallback } from 'react';
import { toast } from 'sonner';
import { useCanvasStore } from '../stores/canvasStore';
import { useToolStore } from '../stores/toolStore';
import { useAnimationStore } from '../stores/animationStore';
import { useTimelineStore } from '../stores/timelineStore';
import { cropAllFramesToSelection } from '../utils/cropUtils';
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
      // Snapshot all layers for undo (deep copy keyframes for proper restore)
      const previousLayerSnapshots = tl.layers.map(l => ({
        id: l.id,
        contentFrames: l.contentFrames.map(cf => ({
          id: cf.id,
          data: new Map(cf.data),
        })),
        staticProperties: { ...l.staticProperties },
        propertyTracks: l.propertyTracks.map(t => ({
          ...t,
          keyframes: t.keyframes.map(kf => ({ ...kf })),
        })),
      }));
      const previousGroupSnapshots = tl.layerGroups.map(g => ({
        ...g,
        staticProperties: { ...g.staticProperties },
        propertyTracks: (g.propertyTracks ?? []).map(t => ({
          ...t,
          keyframes: t.keyframes.map(kf => ({ ...kf })),
        })),
      }));

      // Crop offset: after crop, the canvas origin shifts by (minX, minY) in screen space.
      // We shift position values by (-minX, -minY) to account for this.
      // Content data stays in local space (NOT re-keyed) — this correctly preserves
      // animation at all frames, not just the current one. Content outside the new
      // canvas bounds simply won't render (unbounded canvas clips at export).
      //
      // CRITICAL: For grouped layers, only shift the GROUP's position (not the
      // child layer's position). In compositing, group position and layer position
      // are additive, so shifting both would double the offset.
      const posXOffset = -minX;
      const posYOffset = -minY;

      // Collect group IDs for quick lookup
      const groupChildIds = new Set<string>();
      for (const group of tl.layerGroups) {
        for (const childId of group.childLayerIds) {
          groupChildIds.add(childId as string);
        }
      }

      // Shift each UNGROUPED layer's position (grouped layers get shifted via their group)
      for (const layer of tl.layers) {
        if (groupChildIds.has(layer.id as string)) continue; // Skip grouped layers
        
        const oldPosX = layer.staticProperties['transform.position.x'] ?? 0;
        const oldPosY = layer.staticProperties['transform.position.y'] ?? 0;
        
        tl.setStaticProperty(layer.id, 'transform.position.x', oldPosX + posXOffset);
        tl.setStaticProperty(layer.id, 'transform.position.y', oldPosY + posYOffset);

        // Shift position keyframes by the same offset
        for (const track of layer.propertyTracks) {
          if (track.propertyPath === 'transform.position.x') {
            for (const kf of track.keyframes) {
              tl.updateKeyframe(layer.id, track.id, kf.id, {
                value: (kf.value as number) + posXOffset,
              });
            }
          } else if (track.propertyPath === 'transform.position.y') {
            for (const kf of track.keyframes) {
              tl.updateKeyframe(layer.id, track.id, kf.id, {
                value: (kf.value as number) + posYOffset,
              });
            }
          }
        }
      }

      // Shift group positions the same way
      for (const group of tl.layerGroups) {
        const groupId = group.id as unknown as LayerId;
        const oldGPosX = group.staticProperties?.['transform.position.x'] ?? 0;
        const oldGPosY = group.staticProperties?.['transform.position.y'] ?? 0;

        tl.setStaticProperty(groupId, 'transform.position.x', oldGPosX + posXOffset);
        tl.setStaticProperty(groupId, 'transform.position.y', oldGPosY + posYOffset);

        for (const track of (group.propertyTracks ?? [])) {
          if (track.propertyPath === 'transform.position.x') {
            for (const kf of track.keyframes) {
              tl.updateKeyframe(groupId, track.id, kf.id, {
                value: (kf.value as number) + posXOffset,
              });
            }
          } else if (track.propertyPath === 'transform.position.y') {
            for (const kf of track.keyframes) {
              tl.updateKeyframe(groupId, track.id, kf.id, {
                value: (kf.value as number) + posYOffset,
              });
            }
          }
        }
      }

      // Resize canvas and load active layer's content
      setCanvasSize(newWidth, newHeight);
      // Force canvas refresh from the active layer
      const updatedTl = useTimelineStore.getState();
      const activeLayer = updatedTl.layers.find(l => l.id === updatedTl.view.activeLayerId);
      if (activeLayer) {
        // Trigger a layer-switch to reload canvas from the layer's content frame
        useTimelineStore.getState().setActiveLayer(null as unknown as LayerId);
        setTimeout(() => {
          useTimelineStore.getState().setActiveLayer(activeLayer.id);
        }, 0);
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
