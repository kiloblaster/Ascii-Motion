import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useAsciiTypeTool } from './useAsciiTypeTool';
import { useToolStore } from '../stores/toolStore';
import { useCanvasContext } from '../contexts/CanvasContext';
import { useCanvasStore } from '../stores/canvasStore';
import { usePreviewStore } from '../stores/previewStore';
import type { Cell } from '../types';

interface PlacePreviewOptions {
  lockPlacement?: boolean;
}

/**
 * Coordinates the ASCII Type preview overlay with the main canvas.
 * - Follows the hovered cell while the preview hasn’t been placed yet
 * - Keeps the preview within canvas bounds when positioning
 * - Streams preview cells into the shared preview store for rendering
 */
export const useAsciiTypePlacement = () => {
  const activeTool = useToolStore((state) => state.activeTool);
  const { hoveredCellRef, registerHoveredCellRender } = useCanvasContext();
  const canvasWidth = useCanvasStore((state) => state.width);
  const canvasHeight = useCanvasStore((state) => state.height);
  const setPreviewData = usePreviewStore((state) => state.setPreviewData);
  const clearPreviewOverlay = usePreviewStore((state) => state.clearPreview);

  const {
    previewGrid,
    previewDimensions,
    previewOrigin,
    previewCanvasCells,
    isPreviewPlaced,
    setPreviewOrigin,
    setPreviewPlaced,
  } = useAsciiTypeTool();

  const hasPreviewContent = Boolean(previewGrid && previewDimensions);
  const clampOrigin = useCallback(
    (origin: { x: number; y: number }) => {
      if (!previewDimensions) {
        return origin;
      }

      const maxX = Math.max(0, canvasWidth - previewDimensions.width);
      const maxY = Math.max(0, canvasHeight - previewDimensions.height);

      return {
        x: Math.min(Math.max(origin.x, 0), maxX),
        y: Math.min(Math.max(origin.y, 0), maxY),
      };
    },
    [canvasWidth, canvasHeight, previewDimensions]
  );

  // Follow the hovered cell while the preview hasn’t been placed yet
  // Uses ref-based hoveredCell via callback registration (no React re-render)
  const followHoverRef = useRef<{
    activeTool: string;
    hasPreviewContent: boolean;
    isPreviewPlaced: boolean;
    clampOrigin: (o: { x: number; y: number }) => { x: number; y: number };
    previewOrigin: { x: number; y: number } | null;
    setPreviewOrigin: (o: { x: number; y: number }) => void;
  }>({ activeTool, hasPreviewContent, isPreviewPlaced, clampOrigin, previewOrigin, setPreviewOrigin });
  followHoverRef.current = { activeTool, hasPreviewContent, isPreviewPlaced, clampOrigin, previewOrigin, setPreviewOrigin };

  useEffect(() => {
    const cleanup = registerHoveredCellRender(() => {
      const { activeTool: at, hasPreviewContent: hpc, isPreviewPlaced: ipp, clampOrigin: co, previewOrigin: po, setPreviewOrigin: spo } = followHoverRef.current;
      if (at !== 'asciitype') return;
      if (!hpc) return;
      const hc = hoveredCellRef.current;
      if (!hc) return;
      if (ipp) return;
      const clamped = co(hc);
      if (!po || po.x !== clamped.x || po.y !== clamped.y) {
        spo(clamped);
      }
    });
    return cleanup;
  }, [registerHoveredCellRender, hoveredCellRef]);

  // Stream preview cells into the shared preview store so the renderer can draw them
  useEffect(() => {
    if (activeTool !== 'asciitype') {
      return;
    }

    if (!hasPreviewContent || !previewOrigin) {
      clearPreviewOverlay();
      return;
    }

    const previewCells = new Map<string, Cell>();
    previewCanvasCells.forEach(({ cell }, key) => {
      previewCells.set(key, cell);
    });

    setPreviewData(previewCells);
  }, [
    activeTool,
    hasPreviewContent,
    previewOrigin,
    previewCanvasCells,
    setPreviewData,
    clearPreviewOverlay,
  ]);

  // Clear the preview overlay when the tool is deactivated or the preview disappears
  useEffect(() => {
    if (activeTool !== 'asciitype') {
      clearPreviewOverlay();
      if (isPreviewPlaced) {
        setPreviewPlaced(false);
      }
    }
  }, [activeTool, clearPreviewOverlay, isPreviewPlaced, setPreviewPlaced]);

  useEffect(() => {
    if (activeTool === 'asciitype' && !hasPreviewContent) {
      clearPreviewOverlay();
      if (isPreviewPlaced) {
        setPreviewPlaced(false);
      }
    }
  }, [activeTool, hasPreviewContent, clearPreviewOverlay, isPreviewPlaced, setPreviewPlaced]);

  const placePreviewAt = useCallback(
    (origin: { x: number; y: number }, options?: PlacePreviewOptions) => {
      if (!hasPreviewContent) return;
      const clamped = clampOrigin(origin);

      if (!previewOrigin || previewOrigin.x !== clamped.x || previewOrigin.y !== clamped.y) {
        setPreviewOrigin(clamped);
      }

      if (!options?.lockPlacement) {
        setPreviewPlaced(true);
      }
    },
    [hasPreviewContent, clampOrigin, previewOrigin, setPreviewOrigin, setPreviewPlaced]
  );

  const resetPlacement = useCallback(() => {
    setPreviewPlaced(false);
  }, [setPreviewPlaced]);

  const currentBounds = useMemo(() => {
    if (!previewOrigin || !previewDimensions) return null;
    return {
      left: previewOrigin.x,
      top: previewOrigin.y,
      right: previewOrigin.x + previewDimensions.width - 1,
      bottom: previewOrigin.y + previewDimensions.height - 1,
    };
  }, [previewOrigin, previewDimensions]);

  return {
    hasPreviewContent,
    isPreviewPlaced,
    previewOrigin,
    previewDimensions,
    clampOrigin,
    placePreviewAt,
    resetPlacement,
    previewBounds: currentBounds,
  };
};
