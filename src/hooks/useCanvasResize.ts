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
import { getContentFrameAtTime } from '../utils/layerCompositing';

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
  const frames = useAnimationStore((s) => s.frames);
  const currentFrameIndex = useAnimationStore((s) => s.currentFrameIndex);
  const setFrameData = useAnimationStore((s) => s.setFrameData);
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

      // Flush the active layer's canvas buffer to the timeline store first,
      // so the snapshot captures the latest edits.
      const activeLayerId = tl.view.activeLayerId;
      if (activeLayerId) {
        const activeLayer = tl.layers.find((l) => l.id === activeLayerId);
        if (activeLayer) {
          const activeCf = getContentFrameAtTime(activeLayer, tl.view.currentFrame);
          if (activeCf) {
            tl.updateContentFrameData(activeLayer.id, activeCf.id, new Map(cells));
          }
        }
      }

      // Re-read after flush
      const tlFlushed = useTimelineStore.getState();

      // Snapshot previous layer data for undo (matches previousLayerSnapshots format)
      const previousLayerSnapshots = tlFlushed.layers.map((layer) => ({
        id: layer.id as string,
        contentFrames: layer.contentFrames.map((cf) => ({
          id: cf.id as string,
          data: new Map(cf.data),
        })),
        staticProperties: { ...layer.staticProperties },
        propertyTracks: layer.propertyTracks.map((t) => ({
          ...t,
          id: t.id as string,
          keyframes: t.keyframes.map((kf) => ({ ...kf, id: kf.id as string })),
        })),
      }));
      const previousGroupSnapshots = tlFlushed.layerGroups.map((g) => ({
        ...g,
        id: g.id as string,
        staticProperties: { ...g.staticProperties },
        propertyTracks: (g.propertyTracks ?? []).map((t) => ({
          ...t,
          id: t.id as string,
          keyframes: t.keyframes.map((kf) => ({ ...kf, id: kf.id as string })),
        })),
      }));

      // Shift every content frame in every layer
      for (const layer of tlFlushed.layers) {
        for (const cf of layer.contentFrames) {
          const shifted = shiftCellMap(cf.data, offsetX, offsetY);
          tl.updateContentFrameData(layer.id, cf.id, shifted);
        }
      }

      // Shift anchor points for ALL layers so rotation/scale centers track with
      // the shifted content. Position transforms must NOT be shifted — the cell
      // data shift already accounts for the visual offset, and shifting position
      // too would double it. Group properties also stay untouched because group
      // position is additive with layer position in compositing.
      for (const layer of tlFlushed.layers) {
        const oldAnchorX = layer.staticProperties['transform.anchorPoint.x'] ?? 0;
        const oldAnchorY = layer.staticProperties['transform.anchorPoint.y'] ?? 0;
        tl.setStaticProperty(layer.id, 'transform.anchorPoint.x', oldAnchorX + offsetX);
        tl.setStaticProperty(layer.id, 'transform.anchorPoint.y', oldAnchorY + offsetY);

        // Shift anchor point keyframes only (NOT position keyframes)
        for (const track of layer.propertyTracks) {
          if (track.propertyPath === 'transform.anchorPoint.x') {
            for (const kf of track.keyframes) {
              tl.updateKeyframe(layer.id, track.id, kf.id, {
                value: (kf.value as number) + offsetX,
              });
            }
          } else if (track.propertyPath === 'transform.anchorPoint.y') {
            for (const kf of track.keyframes) {
              tl.updateKeyframe(layer.id, track.id, kf.id, {
                value: (kf.value as number) + offsetY,
              });
            }
          }
        }
      }

      // Update canvas dimensions
      setCanvasSize(constrainedWidth, constrainedHeight);

      // Reload the active layer's current content frame into canvasStore
      const updatedTl = useTimelineStore.getState();
      const activeLayerAfterResize = updatedTl.layers.find((l) => l.id === updatedTl.view.activeLayerId);
      if (activeLayerAfterResize) {
        const activeCf = getContentFrameAtTime(activeLayerAfterResize, updatedTl.view.currentFrame);
        if (activeCf) {
          setCanvasData(new Map(activeCf.data));
        } else {
          setCanvasData(new Map());
        }
      }

      // Build new-state snapshot for redo
      const freshState = useTimelineStore.getState();
      const newLayerSnapshots = freshState.layers.map((layer) => ({
        id: layer.id as string,
        contentFrames: layer.contentFrames.map((cf) => ({
          id: cf.id as string,
          data: new Map(cf.data),
        })),
        staticProperties: { ...layer.staticProperties },
        propertyTracks: layer.propertyTracks.map((t) => ({
          ...t,
          id: t.id as string,
          keyframes: t.keyframes.map((kf) => ({ ...kf, id: kf.id as string })),
        })),
      }));
      const newGroupSnapshots = freshState.layerGroups.map((g) => ({
        ...g,
        id: g.id as string,
        staticProperties: { ...g.staticProperties },
        propertyTracks: (g.propertyTracks ?? []).map((t) => ({
          ...t,
          id: t.id as string,
          keyframes: t.keyframes.map((kf) => ({ ...kf, id: kf.id as string })),
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
          isCropOperation: true,
          previousLayerSnapshots,
          newLayerSnapshots,
          previousGroupSnapshots,
          newGroupSnapshots,
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
