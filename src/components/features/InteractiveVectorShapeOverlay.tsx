/**
 * Interactive Vector Shape Overlay
 *
 * SVG overlay for creating and editing rectangle/ellipse shapes via bounding box controls.
 * Shares the bezier rendering pipeline (generateBezierPreview) for consistent fill rendering.
 *
 * Lifecycle:
 *  1. User drags on canvas → shape created via bezierStore.initializeShape()
 *  2. Shape shows bounding box with 8 handles (4 corners + 4 edges)
 *  3. User can resize, move, or shift-constrain the shape
 *  4. Enter commits, Escape cancels (same as bezier tool)
 */

import React, { useCallback, useRef, useMemo, useEffect, useState } from 'react';
import { useBezierStore } from '../../stores/bezierStore';
import { useCanvasContext } from '../../contexts/CanvasContext';
import { useToolStore } from '../../stores/toolStore';
import { useCanvasStore } from '../../stores/canvasStore';
import { useCharacterPaletteStore } from '../../stores/characterPaletteStore';
import { useAnimationStore } from '../../stores/animationStore';
import { usePaletteStore } from '../../stores/paletteStore';
import { transformCellMapToLocal } from '../../utils/layerTransformUtils';
import { generateBezierPreview } from '../../utils/bezierFillUtils';
import { BezierActionButtons } from './BezierActionButtons';
import type { BezierCommitHistoryAction } from '../../types';
import type { ShapeBounds } from '../../utils/vectorShapeGeometry';

type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

const HANDLE_RADIUS = 5;
const HANDLE_HIT_RADIUS = 8;

export const InteractiveVectorShapeOverlay: React.FC = () => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const prevToolRef = useRef<string>('');

  // Drag state
  const [dragMode, setDragMode] = useState<
    | { type: 'creating'; startGrid: { x: number; y: number } }
    | { type: 'handle'; handle: HandleId; startBounds: ShapeBounds; startGrid: { x: number; y: number } }
    | { type: 'move'; startBounds: ShapeBounds; startGrid: { x: number; y: number } }
    | null
  >(null);

  const [shiftKeyDown, setShiftKeyDown] = useState(false);

  const activeTool = useToolStore((s) => s.activeTool);
  const pushToHistory = useToolStore((s) => s.pushToHistory);
  const { cellWidth, cellHeight, zoom, panOffset } = useCanvasContext();

  const {
    anchorPoints,
    isClosed,
    isEditingShape,
    fillMode,
    autofillPaletteId,
    fillColorMode,
    strokeWidth,
    strokeTaperStart,
    strokeTaperEnd,
    lineArtEdgeThreshold,
    lineArtSdfBlur,
    lineArtInverseMatch,
    previewCells,
    shapeType,
    shapeBounds,
    shapeFilled,
    initializeShape,
    updateShapeBounds,
    updatePreview,
    captureState,
    commitShape,
    cancelShape,
    forceRemount,
  } = useBezierStore();

  const width = useCanvasStore((s) => s.width);
  const height = useCanvasStore((s) => s.height);
  const cells = useCanvasStore((s) => s.cells);
  const setCanvasData = useCanvasStore((s) => s.setCanvasData);

  const selectedChar = useToolStore((s) => s.selectedChar);
  const selectedColor = useToolStore((s) => s.selectedColor);
  const selectedBgColor = useToolStore((s) => s.selectedBgColor);

  const activePalette = useCharacterPaletteStore((s) => s.activePalette);
  const currentFrameIndex = useAnimationStore((s) => s.currentFrameIndex);
  const getActivePalette = usePaletteStore((s) => s.getActivePalette);
  const activePaletteId = usePaletteStore((s) => s.activePaletteId);

  const effectiveCellWidth = cellWidth * zoom;
  const effectiveCellHeight = cellHeight * zoom;

  const colorPalette = useMemo(() => {
    return getActivePalette();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getActivePalette, activePaletteId]);

  // Track shift key
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftKeyDown(true); };
    const up = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftKeyDown(false); };
    const blur = () => setShiftKeyDown(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  // ────────── Commit / Cancel ──────────

  const handleCommit = useCallback(() => {
    if (!previewCells || previewCells.size === 0) return;

    try {
      const bezierSnapshot = captureState();
      const originalCells = new Map(cells);
      const cellsToCommit = commitShape();

      const transformedCells = transformCellMapToLocal(cellsToCommit);
      const newCells = new Map(cells);
      transformedCells.forEach((cell, key) => {
        if (cell.char === ' ' && cell.color === '#FFFFFF' && cell.bgColor === 'transparent') {
          newCells.delete(key);
        } else {
          newCells.set(key, { ...cell });
        }
      });

      setCanvasData(newCells);

      const historyAction: BezierCommitHistoryAction = {
        type: 'bezier_commit',
        timestamp: Date.now(),
        description: `Commit ${shapeType} shape (${cellsToCommit.size} cells)`,
        data: {
          bezierState: {
            ...bezierSnapshot,
            selectedChar,
            selectedColor,
            selectedBgColor,
          },
          previousCanvasData: originalCells,
          newCanvasData: newCells,
          frameIndex: currentFrameIndex,
        },
      };

      pushToHistory(historyAction);
      forceRemount();
    } catch (error) {
      console.error('[VectorShape] Error committing shape:', error);
    }
  }, [
    previewCells, cells, shapeType, currentFrameIndex,
    captureState, commitShape, setCanvasData, pushToHistory,
    selectedChar, selectedColor, selectedBgColor, forceRemount,
  ]);

  const handleCancel = useCallback(() => {
    cancelShape();
    forceRemount();
  }, [cancelShape, forceRemount]);

  // ────────── Keyboard (Enter / Escape) ──────────

  useEffect(() => {
    if (activeTool !== 'rectangle' && activeTool !== 'ellipse') return;
    if (anchorPoints.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        handleCommit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        handleCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [activeTool, anchorPoints.length, handleCommit, handleCancel]);

  // ────────── Auto-commit on tool switch ──────────

  useEffect(() => {
    const prevTool = prevToolRef.current;
    const isVectorTool = prevTool === 'rectangle' || prevTool === 'ellipse';
    const { isProcessingHistory } = useToolStore.getState();

    if (isVectorTool && prevTool !== activeTool && !isProcessingHistory) {
      if (anchorPoints.length >= 2 && previewCells && previewCells.size > 0) {
        handleCommit();
      }
    }

    prevToolRef.current = activeTool;
  }, [activeTool, anchorPoints.length, previewCells, handleCommit]);

  // ────────── Preview generation ──────────

  useEffect(() => {
    if (anchorPoints.length < 2) {
      updatePreview(new Map(), 0);
      return;
    }

    const { previewCells, affectedCount } = generateBezierPreview(
      anchorPoints,
      isClosed,
      fillMode,
      width,
      height,
      effectiveCellWidth,
      effectiveCellHeight,
      zoom,
      panOffset,
      selectedChar,
      selectedColor,
      selectedBgColor,
      fillMode === 'palette' ? activePalette.characters : undefined,
      fillMode === 'autofill' ? autofillPaletteId : undefined,
      fillColorMode,
      colorPalette || undefined,
      strokeWidth,
      strokeTaperStart,
      strokeTaperEnd,
      lineArtEdgeThreshold,
      lineArtSdfBlur,
      lineArtInverseMatch,
      shapeFilled,
    );

    updatePreview(previewCells, affectedCount);
  }, [
    anchorPoints, isClosed, fillMode, width, height,
    effectiveCellWidth, effectiveCellHeight, zoom, panOffset,
    selectedChar, selectedColor, selectedBgColor,
    activePalette.characters, autofillPaletteId, fillColorMode,
    colorPalette, strokeWidth, strokeTaperStart, strokeTaperEnd,
    lineArtEdgeThreshold, lineArtSdfBlur, lineArtInverseMatch,
    shapeFilled, updatePreview,
  ]);

  // ────────── Coordinate conversion ──────────

  const pixelToGrid = useCallback(
    (pixelX: number, pixelY: number) => ({
      x: (pixelX - panOffset.x) / effectiveCellWidth - 0.5,
      y: (pixelY - panOffset.y) / effectiveCellHeight - 0.5,
    }),
    [effectiveCellWidth, effectiveCellHeight, panOffset],
  );

  const gridToPixel = useCallback(
    (gridX: number, gridY: number) => ({
      x: (gridX + 0.5) * effectiveCellWidth + panOffset.x,
      y: (gridY + 0.5) * effectiveCellHeight + panOffset.y,
    }),
    [effectiveCellWidth, effectiveCellHeight, panOffset],
  );

  // ────────── Shift-constrain helper ──────────

  const constrainBounds = useCallback(
    (bounds: ShapeBounds, shift: boolean): ShapeBounds => {
      if (!shift) return bounds;
      // Make visually square by accounting for cell aspect ratio
      const visualW = Math.abs(bounds.width) * effectiveCellWidth;
      const visualH = Math.abs(bounds.height) * effectiveCellHeight;
      const maxVisual = Math.max(visualW, visualH);
      const constrainedW = (maxVisual / effectiveCellWidth) * Math.sign(bounds.width || 1);
      const constrainedH = (maxVisual / effectiveCellHeight) * Math.sign(bounds.height || 1);
      return { ...bounds, width: constrainedW, height: constrainedH };
    },
    [effectiveCellWidth, effectiveCellHeight],
  );

  // ────────── Handle hit-testing ──────────

  const getHandlePositions = useCallback(
    (b: ShapeBounds): Record<HandleId, { x: number; y: number }> => ({
      nw: gridToPixel(b.x, b.y),
      n:  gridToPixel(b.x + b.width / 2, b.y),
      ne: gridToPixel(b.x + b.width, b.y),
      e:  gridToPixel(b.x + b.width, b.y + b.height / 2),
      se: gridToPixel(b.x + b.width, b.y + b.height),
      s:  gridToPixel(b.x + b.width / 2, b.y + b.height),
      sw: gridToPixel(b.x, b.y + b.height),
      w:  gridToPixel(b.x, b.y + b.height / 2),
    }),
    [gridToPixel],
  );

  const hitTestHandle = useCallback(
    (mouseX: number, mouseY: number): HandleId | null => {
      if (!shapeBounds) return null;
      const positions = getHandlePositions(shapeBounds);
      const ids: HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
      for (const id of ids) {
        const pos = positions[id];
        const dist = Math.sqrt((mouseX - pos.x) ** 2 + (mouseY - pos.y) ** 2);
        if (dist <= HANDLE_HIT_RADIUS) return id;
      }
      return null;
    },
    [shapeBounds, getHandlePositions],
  );

  const hitTestInterior = useCallback(
    (mouseX: number, mouseY: number): boolean => {
      if (!shapeBounds) return false;
      const tl = gridToPixel(shapeBounds.x, shapeBounds.y);
      const br = gridToPixel(
        shapeBounds.x + shapeBounds.width,
        shapeBounds.y + shapeBounds.height,
      );
      const minX = Math.min(tl.x, br.x);
      const maxX = Math.max(tl.x, br.x);
      const minY = Math.min(tl.y, br.y);
      const maxY = Math.max(tl.y, br.y);
      return mouseX >= minX && mouseX <= maxX && mouseY >= minY && mouseY <= maxY;
    },
    [shapeBounds, gridToPixel],
  );

  // ────────── Resize logic ──────────

  const resizeBounds = useCallback(
    (
      handle: HandleId,
      startBounds: ShapeBounds,
      startGrid: { x: number; y: number },
      currentGrid: { x: number; y: number },
      shift: boolean,
    ): ShapeBounds => {
      const dx = currentGrid.x - startGrid.x;
      const dy = currentGrid.y - startGrid.y;

      let { x, y, width: w, height: h } = startBounds;

      switch (handle) {
        case 'nw': x += dx; y += dy; w -= dx; h -= dy; break;
        case 'n':  y += dy; h -= dy; break;
        case 'ne': w += dx; y += dy; h -= dy; break;
        case 'e':  w += dx; break;
        case 'se': w += dx; h += dy; break;
        case 's':  h += dy; break;
        case 'sw': x += dx; w -= dx; h += dy; break;
        case 'w':  x += dx; w -= dx; break;
      }

      let newBounds = { x, y, width: w, height: h };
      if (shift) {
        // Keep the opposite corner fixed while constraining
        newBounds = constrainBounds(newBounds, true);
      }

      return newBounds;
    },
    [constrainBounds],
  );

  // ────────── Pointer handlers ──────────

  const getMousePos = useCallback(
    (e: React.PointerEvent<HTMLDivElement>): { px: number; py: number } => {
      const rect = overlayRef.current!.getBoundingClientRect();
      return { px: e.clientX - rect.left, py: e.clientY - rect.top };
    },
    [],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);

      const { px, py } = getMousePos(e);
      const gridPos = pixelToGrid(px, py);

      // If we're editing a shape, check handles first, then interior
      if (isEditingShape && shapeBounds) {
        const handle = hitTestHandle(px, py);
        if (handle) {
          setDragMode({
            type: 'handle',
            handle,
            startBounds: { ...shapeBounds },
            startGrid: gridPos,
          });
          return;
        }

        if (hitTestInterior(px, py)) {
          setDragMode({
            type: 'move',
            startBounds: { ...shapeBounds },
            startGrid: gridPos,
          });
          return;
        }

        // Click outside shape = commit and start new one
        handleCommit();
      }

      // Start creating a new shape
      const toolShapeType = activeTool === 'rectangle' ? 'rectangle' : 'ellipse';
      setDragMode({ type: 'creating', startGrid: gridPos });

      // Initialize with zero-size bounds (will grow on drag)
      const initialBounds: ShapeBounds = { x: gridPos.x, y: gridPos.y, width: 0, height: 0 };
      initializeShape(toolShapeType as 'rectangle' | 'ellipse', initialBounds);
    },
    [
      getMousePos, pixelToGrid, isEditingShape, shapeBounds,
      hitTestHandle, hitTestInterior, handleCommit, activeTool,
      initializeShape,
    ],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragMode) return;

      const { px, py } = getMousePos(e);
      const gridPos = pixelToGrid(px, py);

      if (dragMode.type === 'creating') {
        const rawW = gridPos.x - dragMode.startGrid.x;
        const rawH = gridPos.y - dragMode.startGrid.y;
        let newBounds: ShapeBounds = {
          x: dragMode.startGrid.x,
          y: dragMode.startGrid.y,
          width: rawW,
          height: rawH,
        };
        newBounds = constrainBounds(newBounds, shiftKeyDown);
        updateShapeBounds(newBounds);
      } else if (dragMode.type === 'handle') {
        const newBounds = resizeBounds(
          dragMode.handle,
          dragMode.startBounds,
          dragMode.startGrid,
          gridPos,
          shiftKeyDown,
        );
        updateShapeBounds(newBounds);
      } else if (dragMode.type === 'move') {
        const dx = gridPos.x - dragMode.startGrid.x;
        const dy = gridPos.y - dragMode.startGrid.y;
        const newBounds: ShapeBounds = {
          x: dragMode.startBounds.x + dx,
          y: dragMode.startBounds.y + dy,
          width: dragMode.startBounds.width,
          height: dragMode.startBounds.height,
        };
        updateShapeBounds(newBounds);
      }
    },
    [
      dragMode, getMousePos, pixelToGrid, shiftKeyDown,
      constrainBounds, resizeBounds, updateShapeBounds,
    ],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      setDragMode(null);
    },
    [],
  );

  // ────────── Cursor ──────────

  const getCursor = useCallback((): string => {
    if (dragMode) {
      if (dragMode.type === 'move') return 'cursor-grabbing';
      return 'cursor-crosshair';
    }
    return 'cursor-crosshair';
  }, [dragMode]);

  // ────────── SVG rendering ──────────

  const boundsPath = useMemo(() => {
    if (!shapeBounds || anchorPoints.length === 0) return null;

    const b = shapeBounds;
    const tl = gridToPixel(b.x, b.y);
    const br = gridToPixel(b.x + b.width, b.y + b.height);

    return (
      <rect
        x={Math.min(tl.x, br.x)}
        y={Math.min(tl.y, br.y)}
        width={Math.abs(br.x - tl.x)}
        height={Math.abs(br.y - tl.y)}
        fill="none"
        stroke="#3b82f6"
        strokeWidth={1.5}
        strokeDasharray="6 3"
        style={{ pointerEvents: 'none' }}
      />
    );
  }, [shapeBounds, anchorPoints, gridToPixel]);

  // Shape outline path (for ellipse, show actual curve; for rect, the bounding box itself is the shape)
  const shapeOutline = useMemo(() => {
    if (!shapeBounds || anchorPoints.length < 3 || shapeType !== 'ellipse') return null;

    // Build SVG ellipse path from anchor points
    let pathD = '';
    const first = anchorPoints[0];
    const firstPx = gridToPixel(first.position.x, first.position.y);
    pathD += `M ${firstPx.x} ${firstPx.y}`;

    for (let i = 1; i < anchorPoints.length; i++) {
      const prev = anchorPoints[i - 1];
      const curr = anchorPoints[i];
      const prevPx = gridToPixel(prev.position.x, prev.position.y);
      const currPx = gridToPixel(curr.position.x, curr.position.y);

      if (prev.hasHandles && prev.handleOut && curr.hasHandles && curr.handleIn) {
        const cp1 = {
          x: prevPx.x + prev.handleOut.x * effectiveCellWidth,
          y: prevPx.y + prev.handleOut.y * effectiveCellHeight,
        };
        const cp2 = {
          x: currPx.x + curr.handleIn.x * effectiveCellWidth,
          y: currPx.y + curr.handleIn.y * effectiveCellHeight,
        };
        pathD += ` C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${currPx.x} ${currPx.y}`;
      } else {
        pathD += ` L ${currPx.x} ${currPx.y}`;
      }
    }

    // Close the path
    if (isClosed && anchorPoints.length > 2) {
      const last = anchorPoints[anchorPoints.length - 1];
      const first = anchorPoints[0];
      const lastPx = gridToPixel(last.position.x, last.position.y);
      const firstPx = gridToPixel(first.position.x, first.position.y);

      if (last.hasHandles && last.handleOut && first.hasHandles && first.handleIn) {
        const cp1 = {
          x: lastPx.x + last.handleOut.x * effectiveCellWidth,
          y: lastPx.y + last.handleOut.y * effectiveCellHeight,
        };
        const cp2 = {
          x: firstPx.x + first.handleIn.x * effectiveCellWidth,
          y: firstPx.y + first.handleIn.y * effectiveCellHeight,
        };
        pathD += ` C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${firstPx.x} ${firstPx.y}`;
      }
      pathD += ' Z';
    }

    return (
      <path
        d={pathD}
        fill="none"
        stroke="#3b82f6"
        strokeWidth={1.5}
        style={{ pointerEvents: 'none' }}
      />
    );
  }, [shapeBounds, anchorPoints, shapeType, isClosed, gridToPixel, effectiveCellWidth, effectiveCellHeight]);

  const handleElements = useMemo(() => {
    if (!shapeBounds || !isEditingShape) return null;

    const positions = getHandlePositions(shapeBounds);
    const ids: HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

    return ids.map((id) => {
      const pos = positions[id];
      const isCorner = id.length === 2;

      return (
        <g key={id}>
          {/* White outer ring */}
          <circle
            cx={pos.x}
            cy={pos.y}
            r={HANDLE_RADIUS + 1}
            fill="none"
            stroke="#ffffff"
            strokeWidth={2}
            style={{ pointerEvents: 'none' }}
          />
          {/* Inner handle */}
          <circle
            cx={pos.x}
            cy={pos.y}
            r={HANDLE_RADIUS}
            fill={isCorner ? '#ffffff' : '#3b82f6'}
            stroke="#1f2937"
            strokeWidth={1.5}
            style={{ cursor: 'pointer' }}
          />
        </g>
      );
    });
  }, [shapeBounds, isEditingShape, getHandlePositions]);

  // ────────── Guard ──────────

  if (activeTool !== 'rectangle' && activeTool !== 'ellipse') {
    return null;
  }

  return (
    <>
      <div
        ref={overlayRef}
        className={`pointer-events-auto ${getCursor()}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          zIndex: 20,
          position: 'absolute',
          inset: 0,
        }}
      >
        <svg
          className="absolute inset-0 w-full h-full"
          style={{ pointerEvents: 'none', overflow: 'visible' }}
        >
          {shapeOutline}
          {boundsPath}
          {handleElements}
        </svg>
      </div>
      <BezierActionButtons onAccept={handleCommit} onCancel={handleCancel} />
    </>
  );
};
