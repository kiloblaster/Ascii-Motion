/**
 * Effect Block — a selectable, draggable, resizable block on an effect track row.
 *
 * Displays an effect's time range on the timeline with in/out point handles.
 * Color-coded by effect category.
 */

import React, { useCallback } from 'react';
import { useTimelineStore } from '../../../stores/timelineStore';
import { useEffectBlockHistory } from '../../../hooks/useEffectBlockHistory';
import { cn } from '@/lib/utils';
import type { EffectTrack } from '../../../types/effectBlock';
import { getEffect } from '../../../registry/effectRegistry';

interface EffectBlockProps {
  track: EffectTrack;
  pxPerFrame: number;
}

const CATEGORY_COLORS: Record<string, { bg: string; border: string; selected: string }> = {
  adjustment: { bg: 'bg-blue-500/20', border: 'border-blue-500/50', selected: 'bg-blue-500/35 border-blue-500/70 ring-1 ring-blue-500/40' },
  mapping: { bg: 'bg-green-500/20', border: 'border-green-500/50', selected: 'bg-green-500/35 border-green-500/70 ring-1 ring-green-500/40' },
  filter: { bg: 'bg-orange-500/20', border: 'border-orange-500/50', selected: 'bg-orange-500/35 border-orange-500/70 ring-1 ring-orange-500/40' },
  distortion: { bg: 'bg-purple-500/20', border: 'border-purple-500/50', selected: 'bg-purple-500/35 border-purple-500/70 ring-1 ring-purple-500/40' },
};

const DEFAULT_COLORS = { bg: 'bg-muted-foreground/15', border: 'border-muted-foreground/30', selected: 'bg-muted-foreground/25 border-muted-foreground/50' };

export const EffectBlockComponent: React.FC<EffectBlockProps> = React.memo(function EffectBlockComponent({
  track,
  pxPerFrame,
}) {
  const block = track.effectBlock;
  const selectedEffectBlockId = useTimelineStore((s) => s.view.selectedEffectBlockId);
  const selectEffectBlock = useTimelineStore((s) => s.selectEffectBlock);
  const updateEffectBlockTiming = useTimelineStore((s) => s.updateEffectBlockTiming);
  const { recordUpdate } = useEffectBlockHistory();

  const isSelected = selectedEffectBlockId === block.id;
  const entry = getEffect(block.effectType);
  const category = entry?.category ?? 'filter';
  const colors = CATEGORY_COLORS[category] ?? DEFAULT_COLORS;

  const left = block.startFrame * pxPerFrame;
  const width = Math.max(block.durationFrames * pxPerFrame, 4);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    selectEffectBlock(block.id);
  }, [block.id, selectEffectBlock]);

  const handleResizeRight = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const origDuration = block.durationFrames;
    const beforeBlock = structuredClone(block);
    const onMouseMove = (me: MouseEvent) => {
      const newDuration = Math.max(1, origDuration + Math.round((me.clientX - startX) / pxPerFrame));
      updateEffectBlockTiming(block.id, block.startFrame, newDuration);
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (block.durationFrames !== origDuration) recordUpdate(block.id, beforeBlock);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [block, pxPerFrame, updateEffectBlockTiming, recordUpdate]);

  const handleResizeLeft = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const origStart = block.startFrame;
    const origDuration = block.durationFrames;
    const endFrame = origStart + origDuration;
    const beforeBlock = structuredClone(block);
    const onMouseMove = (me: MouseEvent) => {
      const newStart = Math.max(0, Math.min(endFrame - 1, origStart + Math.round((me.clientX - startX) / pxPerFrame)));
      const newDuration = endFrame - newStart;
      updateEffectBlockTiming(block.id, newStart, newDuration);
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (block.startFrame !== origStart) recordUpdate(block.id, beforeBlock);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [block, pxPerFrame, updateEffectBlockTiming, recordUpdate]);

  const handleDrag = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const origStart = block.startFrame;
    const beforeBlock = structuredClone(block);
    let didDrag = false;
    const onMouseMove = (me: MouseEvent) => {
      const dx = me.clientX - startX;
      if (!didDrag && Math.abs(dx) < 4) return;
      didDrag = true;
      const newStart = Math.max(0, origStart + Math.round(dx / pxPerFrame));
      updateEffectBlockTiming(block.id, newStart, block.durationFrames);
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (!didDrag) {
        selectEffectBlock(block.id);
      } else if (block.startFrame !== origStart) {
        recordUpdate(block.id, beforeBlock);
      }
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [block, pxPerFrame, updateEffectBlockTiming, selectEffectBlock, recordUpdate]);

  return (
    <div
      className={cn(
        'absolute top-0.5 h-[20px] rounded border cursor-move',
        !block.enabled && 'opacity-40',
        isSelected ? colors.selected : `${colors.bg} ${colors.border}`,
      )}
      style={{ left, width }}
      onMouseDown={handleDrag}
      onClick={handleClick}
    >
      {/* Left resize handle */}
      <div className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-white/20 rounded-l" onMouseDown={handleResizeLeft} />
      {/* Label */}
      {width > 40 && (
        <div className="px-2 text-[9px] truncate leading-[20px] text-foreground/70 pointer-events-none">
          {entry?.name ?? block.effectType}
        </div>
      )}
      {/* Right resize handle */}
      <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-white/20 rounded-r" onMouseDown={handleResizeRight} />
    </div>
  );
});
