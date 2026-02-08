/**
 * AnchorPointOverlay — visual overlay showing the anchor point crosshair
 * and motion path for the active layer when editing transform keyframes.
 *
 * Renders:
 *  - Crosshair at the current anchor point position
 *  - Small dots along the motion path (position at each frame)
 *  - Dot density reflects easing (clustered = slow, spread = fast)
 *
 * Only visible when a transform-related keyframe is being edited.
 *
 * Part of the Layer Timeline Refactor (Phase 4)
 * See: docs/LAYER_TIMELINE_REFACTOR_PLAN.md §4.4
 */

import React, { useMemo } from 'react';
import { useTimelineStore } from '../../stores/timelineStore';
import { useCanvasContext } from '../../contexts/CanvasContext';
import { getPropertyValueAtFrame } from '../../utils/layerCompositing';
import { cn } from '@/lib/utils';

export const AnchorPointOverlay: React.FC = () => {
  const editingKeyframeId = useTimelineStore((s) => s.view.editingKeyframeId);
  const showLayerProperties = useTimelineStore((s) => s.view.showLayerProperties);
  const activeLayerId = useTimelineStore((s) => s.view.activeLayerId);
  const layers = useTimelineStore((s) => s.layers);
  const currentFrame = useTimelineStore((s) => s.view.currentFrame);
  const durationFrames = useTimelineStore((s) => s.config.durationFrames);

  const { cellWidth, cellHeight, zoom, panOffset } = useCanvasContext();

  const activeLayer = useMemo(
    () => layers.find((l) => l.id === activeLayerId) ?? null,
    [layers, activeLayerId],
  );

  // Check if we're editing a transform property
  const isEditingTransform = useMemo(() => {
    if (!editingKeyframeId || !activeLayer) return false;
    for (const track of activeLayer.propertyTracks) {
      if (track.keyframes.some((k) => k.id === editingKeyframeId)) {
        return track.propertyPath.startsWith('transform.');
      }
    }
    return false;
  }, [editingKeyframeId, activeLayer]);

  // Also show when the active layer has any transform tracks or static transforms
  const hasTransformTracks = useMemo(() => {
    if (!activeLayer) return false;
    // Check keyframed tracks
    const hasKeyframedTracks = activeLayer.propertyTracks.some(
      (t) => t.propertyPath.startsWith('transform.') && t.keyframes.length > 0,
    );
    // Check static properties for any non-default transform values
    const hasStaticTransform = activeLayer.staticProperties &&
      Object.keys(activeLayer.staticProperties).some((k) => k.startsWith('transform.'));
    return hasKeyframedTracks || !!hasStaticTransform;
  }, [activeLayer]);

  // Show when: editing a keyframe, layer properties panel is open, or layer has transforms
  const shouldShow = isEditingTransform || showLayerProperties || hasTransformTracks;

  // Calculate motion path points
  const motionPath = useMemo(() => {
    if (!activeLayer || !shouldShow) return [];

    const points: { x: number; y: number; frame: number }[] = [];
    for (let f = 0; f < durationFrames; f++) {
      const posX = getPropertyValueAtFrame(activeLayer, 'transform.position.x', f);
      const posY = getPropertyValueAtFrame(activeLayer, 'transform.position.y', f);
      const anchorX = getPropertyValueAtFrame(activeLayer, 'transform.anchorPoint.x', f);
      const anchorY = getPropertyValueAtFrame(activeLayer, 'transform.anchorPoint.y', f);
      points.push({ x: posX + anchorX, y: posY + anchorY, frame: f });
    }
    return points;
  }, [activeLayer, shouldShow, durationFrames]);

  // Current values
  const currentAnchor = useMemo(() => {
    if (!activeLayer) return { x: 0, y: 0 };
    return {
      x: getPropertyValueAtFrame(activeLayer, 'transform.anchorPoint.x', currentFrame),
      y: getPropertyValueAtFrame(activeLayer, 'transform.anchorPoint.y', currentFrame),
    };
  }, [activeLayer, currentFrame]);

  const currentPos = useMemo(() => {
    if (!activeLayer) return { x: 0, y: 0 };
    return {
      x: getPropertyValueAtFrame(activeLayer, 'transform.position.x', currentFrame),
      y: getPropertyValueAtFrame(activeLayer, 'transform.position.y', currentFrame),
    };
  }, [activeLayer, currentFrame]);

  if (!shouldShow || !activeLayer) return null;

  const effectiveCellWidth = cellWidth * zoom;
  const effectiveCellHeight = cellHeight * zoom;

  // Convert cell coordinates to pixel positions
  const toPixelX = (cellX: number) => cellX * effectiveCellWidth + panOffset.x;
  const toPixelY = (cellY: number) => cellY * effectiveCellHeight + panOffset.y;

  const anchorPixelX = toPixelX(currentAnchor.x + currentPos.x);
  const anchorPixelY = toPixelY(currentAnchor.y + currentPos.y);

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 15 }}>
      {/* Motion path dots */}
      {motionPath.length > 1 && motionPath.map((point, idx) => {
        const px = toPixelX(point.x);
        const py = toPixelY(point.y);
        const isCurrent = point.frame === currentFrame;

        return (
          <div
            key={idx}
            className={cn(
              'absolute rounded-full -translate-x-1/2 -translate-y-1/2',
              isCurrent
                ? 'w-2.5 h-2.5 bg-yellow-400 border border-yellow-600'
                : 'w-1 h-1 bg-yellow-500/50',
            )}
            style={{ left: px, top: py }}
          />
        );
      })}

      {/* Crosshair at current anchor point */}
      <div
        className="absolute"
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
