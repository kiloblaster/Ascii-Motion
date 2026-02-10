import { useCallback } from 'react';
import { useCanvasStore } from '../stores/canvasStore';
import { useToolStore } from '../stores/toolStore';
import { useAnimationStore } from '../stores/animationStore';
import { useTimelineStore } from '../stores/timelineStore';
import {
  calculateAnchorOffset,
  resizeAllFramesWithAnchor,
  type AnchorPosition,
} from '../utils/canvasResizeUtils';
import type { CanvasResizeHistoryAction } from '../types';
import type { Cell } from '../types';

/**
 * Shift all cell coordinates in a map by an offset.
 * Unlike resizeFrameWithAnchor, this does NOT clip to bounds
 * (unbounded canvas — content outside viewport is preserved).
 */
function shiftCellMap(
  data: Map<string, Cell>,
  offsetX: number,
  offsetY: number,
): Map<string, Cell> {
  if (offsetX === 0 && offsetY === 0) return new Map(data);
  const result = new Map<string, Cell>();
  data.forEach((cell, key) => {
    const [x, y] = key.split(',').map(Number);
    result.set(`${x + offsetX},${y + offsetY}`, { ...cell });
  });
  return result;
}

/**
 * Hook for canvas resize operations with anchor positioning
 * Supports resizing across all frames with undo/redo history.
 * Layer-aware: when layers exist, resizes all content frames in all layers.
 */
export function useCanvasResize() {
  const { width: canvasWidth, height: canvasHeight, cells, setCanvasSize, setCanvasData } = useCanvasStore();
  const { frames, currentFrameIndex, setFrameData } = useAnimationStore();
  const layers = useTimelineStore((s) => s.layers);

  /**
   * Resize the canvas with anchor-based positioning
   * Applies the resize to all frames and records in history
   */
  const resizeCanvas = useCallback((
    newWidth: number,
    newHeight: number,
    anchor: AnchorPosition
  ) => {
    const constrainedWidth = Math.max(4, Math.min(200, newWidth));
    const constrainedHeight = Math.max(4, Math.min(100, newHeight));

    if (constrainedWidth === canvasWidth && constrainedHeight === canvasHeight) {
      return;
    }

    const previousWidth = canvasWidth;
    const previousHeight = canvasHeight;
    const previousCells = new Map(cells);

    // ── Layer mode ──────────────────────────────────────────
    if (layers.length > 0) {
      const { offsetX, offsetY } = calculateAnchorOffset(
        previousWidth, previousHeight,
        constrainedWidth, constrainedHeight,
        anchor,
      );

      const tl = useTimelineStore.getState();

      // Snapshot previous layer data for undo
      const previousLayersSnapshot = tl.layers.map((layer) => ({
        layerId: layer.id,
        contentFrames: layer.contentFrames.map((cf) => ({
          frameId: cf.id,
          data: new Map(cf.data),
        })),
      }));

      // Shift every content frame in every layer
      for (const layer of tl.layers) {
        for (const cf of layer.contentFrames) {
          const shifted = shiftCellMap(cf.data, offsetX, offsetY);
          tl.updateContentFrameData(layer.id, cf.id, shifted);
        }
      }

      // Update canvas dimensions
      setCanvasSize(constrainedWidth, constrainedHeight);

      // Reload the active layer's current content frame into canvasStore
      const activeLayerId = tl.view.activeLayerId;
      if (activeLayerId) {
        const activeLayer = tl.layers.find((l) => l.id === activeLayerId);
        if (activeLayer) {
          const currentFrame = tl.view.currentFrame;
          const activeCf = activeLayer.contentFrames.find(
            (cf) => currentFrame >= cf.startFrame && currentFrame < cf.startFrame + cf.durationFrames,
          );
          if (activeCf) {
            // Re-read after mutation
            const freshLayer = useTimelineStore.getState().layers.find((l) => l.id === activeLayerId);
            const freshCf = freshLayer?.contentFrames.find((cf) => cf.id === activeCf.id);
            if (freshCf) {
              setCanvasData(new Map(freshCf.data));
            }
          }
        }
      }

      // Build new-state snapshot for undo
      const newLayersSnapshot = useTimelineStore.getState().layers.map((layer) => ({
        layerId: layer.id,
        contentFrames: layer.contentFrames.map((cf) => ({
          frameId: cf.id,
          data: new Map(cf.data),
        })),
      }));

      const action: CanvasResizeHistoryAction = {
        type: 'canvas_resize' as const,
        timestamp: Date.now(),
        description: `Resize canvas from ${previousWidth}×${previousHeight} to ${constrainedWidth}×${constrainedHeight} (anchor: ${anchor})`,
        data: {
          previousWidth,
          previousHeight,
          newWidth: constrainedWidth,
          newHeight: constrainedHeight,
          previousCanvasData: previousCells,
          frameIndex: 0,
          allFramesPreviousData: previousLayersSnapshot.flatMap((l) => l.contentFrames.map((cf) => cf.data)),
          allFramesNewData: newLayersSnapshot.flatMap((l) => l.contentFrames.map((cf) => cf.data)),
          isCropOperation: true,
        },
      };
      useToolStore.getState().pushToHistory(action);

      console.log(`Canvas resized (layers) from ${previousWidth}×${previousHeight} to ${constrainedWidth}×${constrainedHeight} with anchor: ${anchor}`);
      return;
    }

    // ── Legacy (no layers) mode ─────────────────────────────
    const previousAllFramesData = frames.map((frame) => new Map(frame.data));

    const resizedFrames = resizeAllFramesWithAnchor(
      frames,
      previousWidth,
      previousHeight,
      constrainedWidth,
      constrainedHeight,
      anchor
    );

    resizedFrames.forEach((resizedFrameData, index) => {
      setFrameData(index, resizedFrameData);
    });

    setCanvasSize(constrainedWidth, constrainedHeight);

    const resizedCurrentFrameData = resizedFrames[currentFrameIndex];
    if (resizedCurrentFrameData) {
      setCanvasData(resizedCurrentFrameData);
    }

    const action: CanvasResizeHistoryAction = {
      type: 'canvas_resize' as const,
      timestamp: Date.now(),
      description: `Resize canvas from ${previousWidth}×${previousHeight} to ${constrainedWidth}×${constrainedHeight} (anchor: ${anchor})`,
      data: {
        previousWidth,
        previousHeight,
        newWidth: constrainedWidth,
        newHeight: constrainedHeight,
        previousCanvasData: previousCells,
        frameIndex: currentFrameIndex,
        allFramesPreviousData: previousAllFramesData,
        allFramesNewData: resizedFrames,
        isCropOperation: true,
      }
    };

    useToolStore.getState().pushToHistory(action);
    console.log(`Canvas resized from ${previousWidth}×${previousHeight} to ${constrainedWidth}×${constrainedHeight} with anchor: ${anchor}`);
  }, [
    canvasWidth,
    canvasHeight,
    cells,
    frames,
    currentFrameIndex,
    layers,
    setCanvasSize,
    setCanvasData,
    setFrameData
  ]);

  return {
    resizeCanvas,
    currentWidth: canvasWidth,
    currentHeight: canvasHeight
  };
}
