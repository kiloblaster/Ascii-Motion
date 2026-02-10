/**
 * LayerTransformOverlay — visual overlay for the Layer Transform tool.
 *
 * Renders:
 *  - Bounding box quad (dashed lines around the forward-transformed content)
 *  - Corner handles (filled squares at each corner)
 *  - Anchor point crosshair (yellow, matching AnchorPointOverlay style)
 *  - Motion path dots (position at each frame)
 *
 * The overlay is pointer-events-auto and captures all mouse interactions
 * for the transform tool, including areas outside the canvas element bounds.
 * This is necessary because the canvas element is sized to the grid dimensions,
 * but bounding boxes/corners/anchors can extend beyond those bounds.
 *
 * Part of the Layer Timeline Refactor (Phase 4)
 * See: docs/LAYER_TIMELINE_REFACTOR_PLAN.md §4.10
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { useTimelineStore } from '../../stores/timelineStore';
import { useToolStore } from '../../stores/toolStore';
import { useCanvasContext } from '../../contexts/CanvasContext';
import { getPropertyValueAtFrame } from '../../utils/layerCompositing';
import { useLayerTransformTool } from '../../hooks/useLayerTransformTool';
import { usePlaybackOnlySnapshot } from '../../hooks/usePlaybackOnlySnapshot';
import { cn } from '@/lib/utils';

export const LayerTransformOverlay: React.FC = () => {
  const activeTool = useToolStore((s) => s.activeTool);
  const durationFrames = useTimelineStore((s) => s.config.durationFrames);
  const currentFrame = useTimelineStore((s) => s.view.currentFrame);

  const { canvasRef, cellWidth, cellHeight, zoom, panOffset } = useCanvasContext();
  const playbackSnapshot = usePlaybackOnlySnapshot();
  const {
    boundingBox,
    dragState,
    anchorScreenPos,
    isLocked,
    activeLayer,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    cursorZone,
  } = useLayerTransformTool();

  const isDraggingRef = useRef(false);

  const effectiveCellWidth = cellWidth * zoom;
  const effectiveCellHeight = cellHeight * zoom;

  // Convert pixel coordinates (relative to the canvas element's position)
  // to cell coordinates. Uses the canvas element's bounding rect so this
  // works even for events originating on the overlay (outside canvas bounds).
  const pixelToCell = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const adjustedX = clientX - rect.left - panOffset.x;
      const adjustedY = clientY - rect.top - panOffset.y;
      return {
        x: Math.floor(adjustedX / effectiveCellWidth),
        y: Math.floor(adjustedY / effectiveCellHeight),
      };
    },
    [canvasRef, panOffset, effectiveCellWidth, effectiveCellHeight],
  );

  // Global mousemove/mouseup during drag — allows dragging beyond overlay bounds
  useEffect(() => {
    if (!isDraggingRef.current) return;

    const onGlobalMouseMove = (e: MouseEvent) => {
      const cell = pixelToCell(e.clientX, e.clientY);
      handleMouseMove(cell.x, cell.y);
    };
    const onGlobalMouseUp = () => {
      handleMouseUp();
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', onGlobalMouseMove);
      window.removeEventListener('mouseup', onGlobalMouseUp);
    };

    window.addEventListener('mousemove', onGlobalMouseMove);
    window.addEventListener('mouseup', onGlobalMouseUp);

    return () => {
      window.removeEventListener('mousemove', onGlobalMouseMove);
      window.removeEventListener('mouseup', onGlobalMouseUp);
    };
  }, [dragState, pixelToCell, handleMouseMove, handleMouseUp]);

  const onOverlayMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Only handle left mouse button
      if (e.button !== 0) return;
      const cell = pixelToCell(e.clientX, e.clientY);
      handleMouseDown(cell.x, cell.y);
      isDraggingRef.current = true;
      // Prevent default to avoid text selection during drag
      e.preventDefault();
    },
    [pixelToCell, handleMouseDown],
  );

  const onOverlayMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // When not dragging, just update cursor zone via the hook
      if (!isDraggingRef.current) {
        const cell = pixelToCell(e.clientX, e.clientY);
        handleMouseMove(cell.x, cell.y);
      }
      // During drag, global listeners handle this
    },
    [pixelToCell, handleMouseMove],
  );

  // Hide during playback
  if (activeTool !== 'layertransform') return null;
  if (!activeLayer) return null;
  if (playbackSnapshot.isActive) return null;

  const toPixelX = (cellX: number) => cellX * effectiveCellWidth + panOffset.x;
  const toPixelY = (cellY: number) => cellY * effectiveCellHeight + panOffset.y;

  const anchorPixelX = toPixelX(anchorScreenPos.x);
  const anchorPixelY = toPixelY(anchorScreenPos.y);

  // Motion path dots (same as AnchorPointOverlay)
  const motionPath = (() => {
    if (!activeLayer) return [];
    const hasTransformData =
      activeLayer.propertyTracks.some(
        (t) => t.propertyPath.startsWith('transform.') && t.keyframes.length > 0,
      ) ||
      (activeLayer.staticProperties &&
        Object.keys(activeLayer.staticProperties).some((k) => k.startsWith('transform.')));
    if (!hasTransformData) return [];

    const points: { x: number; y: number; frame: number }[] = [];
    for (let f = 0; f < durationFrames; f++) {
      const px = getPropertyValueAtFrame(activeLayer, 'transform.position.x', f);
      const py = getPropertyValueAtFrame(activeLayer, 'transform.position.y', f);
      const ax = getPropertyValueAtFrame(activeLayer, 'transform.anchorPoint.x', f);
      const ay = getPropertyValueAtFrame(activeLayer, 'transform.anchorPoint.y', f);
      points.push({ x: px + ax, y: py + ay, frame: f });
    }
    return points;
  })();

  // Bounding box lines as SVG path
  const boxPath = boundingBox
    ? boundingBox.corners
        .map((c, i) => {
          const px = toPixelX(c.x);
          const py = toPixelY(c.y);
          return `${i === 0 ? 'M' : 'L'} ${px} ${py}`;
        })
        .join(' ') + ' Z'
    : null;

  const boxColor = isLocked ? 'rgba(128, 128, 128, 0.5)' : 'rgba(147, 130, 255, 0.8)';
  const handleColor = isLocked ? 'rgba(128, 128, 128, 0.6)' : 'rgba(147, 130, 255, 1)';
  const handleSize = 8; // pixels

  // Cursor based on current zone (CSS cursor values, not Tailwind classes)
  const cursorMap: Record<string, string> = {
    move: 'move',
    scale: 'nwse-resize',
    rotate: 'crosshair',
    anchor: 'crosshair',
    none: 'default',
  };
  const cursorStyle = isLocked ? 'not-allowed' : (cursorMap[cursorZone] || 'default');

  return (
    <div
      className="absolute inset-0 pointer-events-auto"
      style={{ zIndex: 15, cursor: cursorStyle, overflow: 'visible' }}
      onMouseDown={onOverlayMouseDown}
      onMouseMove={onOverlayMouseMove}
    >
      {/* Motion path dots */}
      {motionPath.length > 1 &&
        motionPath.map((point, idx) => {
          const px = toPixelX(point.x);
          const py = toPixelY(point.y);
          const isCurrent = point.frame === currentFrame;

          return (
            <div
              key={idx}
              className={cn(
                'absolute rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none',
                isCurrent
                  ? 'w-2.5 h-2.5 bg-yellow-400 border border-yellow-600'
                  : 'w-1 h-1 bg-yellow-500/50',
              )}
              style={{ left: px, top: py }}
            />
          );
        })}

      {/* Bounding box + corner handles (SVG overlay) */}
      {boundingBox && boxPath && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ overflow: 'visible' }}
        >
          {/* Bounding box outline */}
          <path
            d={boxPath}
            fill="none"
            stroke={boxColor}
            strokeWidth={1.5}
            strokeDasharray="6 3"
          />

          {/* Corner handles */}
          {boundingBox.corners.map((corner, i) => {
            const px = toPixelX(corner.x);
            const py = toPixelY(corner.y);
            return (
              <rect
                key={i}
                x={px - handleSize / 2}
                y={py - handleSize / 2}
                width={handleSize}
                height={handleSize}
                fill={handleColor}
                stroke={isLocked ? 'rgba(100, 100, 100, 0.8)' : 'rgba(255, 255, 255, 0.9)'}
                strokeWidth={1}
                rx={1}
              />
            );
          })}
        </svg>
      )}

      {/* Anchor point crosshair */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: anchorPixelX,
          top: anchorPixelY,
          transform: 'translate(-50%, -50%)',
        }}
      >
        {/* Vertical line */}
        <div className="absolute w-[1px] h-5 bg-yellow-400/80 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        {/* Horizontal line */}
        <div className="absolute w-5 h-[1px] bg-yellow-400/80 top-1/2 -translate-y-1/2 -translate-x-1/2" />
        {/* Center dot */}
        <div className="absolute w-2 h-2 rounded-full bg-yellow-400 border border-yellow-600 -translate-x-1/2 -translate-y-1/2" />
      </div>
    </div>
  );
};
