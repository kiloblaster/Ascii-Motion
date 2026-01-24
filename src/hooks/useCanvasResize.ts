import { useCallback } from 'react';
import { useCanvasStore } from '../stores/canvasStore';
import { useToolStore } from '../stores/toolStore';
import { useAnimationStore } from '../stores/animationStore';
import { resizeAllFramesWithAnchor, type AnchorPosition } from '../utils/canvasResizeUtils';
import type { CanvasResizeHistoryAction } from '../types';

/**
 * Hook for canvas resize operations with anchor positioning
 * Supports resizing across all frames with undo/redo history
 */
export function useCanvasResize() {
  const { width: canvasWidth, height: canvasHeight, cells, setCanvasSize, setCanvasData } = useCanvasStore();
  const { frames, currentFrameIndex, setFrameData } = useAnimationStore();

  /**
   * Resize the canvas with anchor-based positioning
   * Applies the resize to all frames and records in history
   * 
   * @param newWidth - Target canvas width in characters
   * @param newHeight - Target canvas height in characters
   * @param anchor - Anchor position determining where content stays
   */
  const resizeCanvas = useCallback((
    newWidth: number,
    newHeight: number,
    anchor: AnchorPosition
  ) => {
    // Validate dimensions
    const constrainedWidth = Math.max(4, Math.min(200, newWidth));
    const constrainedHeight = Math.max(4, Math.min(100, newHeight));

    // If dimensions haven't changed, do nothing
    if (constrainedWidth === canvasWidth && constrainedHeight === canvasHeight) {
      return;
    }

    // Save previous state for undo - including ALL frames
    const previousWidth = canvasWidth;
    const previousHeight = canvasHeight;
    const previousCells = new Map(cells);
    const previousAllFramesData = frames.map(frame => new Map(frame.data));

    // Resize all frames with anchor positioning
    const resizedFrames = resizeAllFramesWithAnchor(
      frames,
      previousWidth,
      previousHeight,
      constrainedWidth,
      constrainedHeight,
      anchor
    );

    // Apply resized data to all frames
    resizedFrames.forEach((resizedFrameData, index) => {
      setFrameData(index, resizedFrameData);
    });

    // Update canvas size
    setCanvasSize(constrainedWidth, constrainedHeight);

    // Update current canvas display with resized current frame data
    const resizedCurrentFrameData = resizedFrames[currentFrameIndex];
    if (resizedCurrentFrameData) {
      setCanvasData(resizedCurrentFrameData);
    }

    // Create history action with all frames data for proper undo/redo
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
        // Store all frames' data for full undo/redo support
        allFramesPreviousData: previousAllFramesData,
        allFramesNewData: resizedFrames,
        isCropOperation: true, // Reuse the crop operation handling in history processor
      }
    };

    // Push to history
    useToolStore.getState().pushToHistory(action);

    console.log(`Canvas resized from ${previousWidth}×${previousHeight} to ${constrainedWidth}×${constrainedHeight} with anchor: ${anchor}`);
  }, [
    canvasWidth,
    canvasHeight,
    cells,
    frames,
    currentFrameIndex,
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
