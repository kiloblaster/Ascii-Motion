/**
 * Content Frame Block — a draggable, resizable block representing a content frame
 * on the timeline.
 * 
 * Part of the Layer Timeline Refactor (Phase 3)
 * See: docs/LAYER_TIMELINE_REFACTOR_PLAN.md §3.8
 */

import React, { useCallback, useRef } from 'react';
import { useTimelineStore } from '../../../stores/timelineStore';
import { cn } from '@/lib/utils';
import type { ContentFrame, LayerId } from '../../../types/timeline';

interface ContentFrameBlockProps {
  layerId: LayerId;
  contentFrame: ContentFrame;
  pxPerFrame: number;
  scrollX: number;
}

export const ContentFrameBlock: React.FC<ContentFrameBlockProps> = ({
  layerId,
  contentFrame,
  pxPerFrame,
  scrollX,
}) => {
  const updateContentFrameTiming = useTimelineStore((s) => s.updateContentFrameTiming);
  const activeLayerId = useTimelineStore((s) => s.view.activeLayerId);
  const isActive = layerId === activeLayerId;

  const left = contentFrame.startFrame * pxPerFrame;
  const width = Math.max(contentFrame.durationFrames * pxPerFrame, 4); // Min 4px visible

  const blockRef = useRef<HTMLDivElement>(null);

  // Drag to move
  const handleDragMove = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();

      const startX = e.clientX;
      const startFrame = contentFrame.startFrame;

      const onMouseMove = (me: MouseEvent) => {
        const deltaX = me.clientX - startX;
        const deltaFrames = Math.round(deltaX / pxPerFrame);
        const newStart = Math.max(0, startFrame + deltaFrames);
        if (newStart !== contentFrame.startFrame) {
          updateContentFrameTiming(layerId, contentFrame.id, newStart, contentFrame.durationFrames);
        }
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [contentFrame, layerId, pxPerFrame, updateContentFrameTiming],
  );

  // Drag right edge to resize duration
  const handleResizeRight = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();

      const startX = e.clientX;
      const startDuration = contentFrame.durationFrames;

      const onMouseMove = (me: MouseEvent) => {
        const deltaX = me.clientX - startX;
        const deltaFrames = Math.round(deltaX / pxPerFrame);
        const newDuration = Math.max(1, startDuration + deltaFrames);
        if (newDuration !== contentFrame.durationFrames) {
          updateContentFrameTiming(layerId, contentFrame.id, contentFrame.startFrame, newDuration);
        }
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [contentFrame, layerId, pxPerFrame, updateContentFrameTiming],
  );

  // Drag left edge to resize (adjusts start + duration)
  const handleResizeLeft = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();

      const startX = e.clientX;
      const startFrame = contentFrame.startFrame;
      const startDuration = contentFrame.durationFrames;
      const endFrame = startFrame + startDuration;

      const onMouseMove = (me: MouseEvent) => {
        const deltaX = me.clientX - startX;
        const deltaFrames = Math.round(deltaX / pxPerFrame);
        const newStart = Math.max(0, Math.min(endFrame - 1, startFrame + deltaFrames));
        const newDuration = endFrame - newStart;
        if (newStart !== contentFrame.startFrame || newDuration !== contentFrame.durationFrames) {
          updateContentFrameTiming(layerId, contentFrame.id, newStart, newDuration);
        }
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [contentFrame, layerId, pxPerFrame, updateContentFrameTiming],
  );

  // Cell count for display
  const cellCount = contentFrame.data.size;

  return (
    <div
      ref={blockRef}
      className={cn(
        'absolute top-1 h-[24px] rounded border cursor-move',
        isActive
          ? 'bg-primary/30 border-primary/60'
          : 'bg-muted-foreground/15 border-muted-foreground/30',
      )}
      style={{ left, width }}
      onMouseDown={handleDragMove}
    >
      {/* Left resize handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-primary/30 rounded-l"
        onMouseDown={handleResizeLeft}
      />

      {/* Content label */}
      {width > 30 && (
        <div className="px-2 text-[10px] truncate leading-[24px] text-foreground/70 pointer-events-none">
          {contentFrame.name}
          {cellCount > 0 && (
            <span className="ml-1 text-muted-foreground">({cellCount})</span>
          )}
        </div>
      )}

      {/* Right resize handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-primary/30 rounded-r"
        onMouseDown={handleResizeRight}
      />
    </div>
  );
};
