/**
 * Keyframe Diamond — a clickable, draggable diamond marker on a property track.
 * 
 * Part of the Layer Timeline Refactor (Phase 3)
 * See: docs/LAYER_TIMELINE_REFACTOR_PLAN.md §3.9
 */

import React, { useCallback } from 'react';
import { useTimelineStore } from '../../../stores/timelineStore';
import { cn } from '@/lib/utils';
import type { Keyframe, LayerId, PropertyTrackId } from '../../../types/timeline';

interface KeyframeDiamondProps {
  layerId: LayerId;
  trackId: PropertyTrackId;
  keyframe: Keyframe;
  pxPerFrame: number;
  scrollX: number;
  isSelected: boolean;
}

export const KeyframeDiamond: React.FC<KeyframeDiamondProps> = ({
  layerId,
  trackId,
  keyframe,
  pxPerFrame,
  scrollX,
  isSelected,
}) => {
  const setEditingKeyframe = useTimelineStore((s) => s.setEditingKeyframe);
  const selectKeyframes = useTimelineStore((s) => s.selectKeyframes);
  const moveKeyframe = useTimelineStore((s) => s.moveKeyframe);

  const left = keyframe.frame * pxPerFrame;

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      selectKeyframes([keyframe.id]);
      setEditingKeyframe(keyframe.id);
    },
    [keyframe.id, selectKeyframes, setEditingKeyframe],
  );

  // Drag to move in time
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();

      const startX = e.clientX;
      const startFrame = keyframe.frame;

      const onMouseMove = (me: MouseEvent) => {
        const deltaX = me.clientX - startX;
        const newFrame = Math.max(0, startFrame + Math.round(deltaX / pxPerFrame));
        if (newFrame !== keyframe.frame) {
          moveKeyframe(layerId, trackId, keyframe.id, newFrame);
        }
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [keyframe, layerId, trackId, pxPerFrame, moveKeyframe],
  );

  return (
    <div
      className={cn(
        'absolute w-3 h-3 rotate-45 cursor-pointer z-20',
        'hover:scale-125 transition-transform',
        isSelected ? 'bg-yellow-400 ring-1 ring-yellow-300' : 'bg-yellow-600/80',
      )}
      style={{ left: left - 5, top: 5 }}
      onClick={handleClick}
      onMouseDown={handleDragStart}
      title={`Frame ${keyframe.frame}: ${keyframe.value}`}
    />
  );
};
