/**
 * PostEffectBlock — Visual block for a post effect on the timeline.
 *
 * Renders as a draggable/resizable block with a distinct purple/magenta color scheme.
 * Follows the same interaction patterns as the standard EffectBlock component.
 */

import React, { useCallback, useRef } from 'react';
import { useTimelineStore } from '../../../stores/timelineStore';
import { getPostEffect } from '../../../registry/postEffectRegistry';
import { usePostEffectBlockHistory } from '../../../hooks/usePostEffectBlockHistory';
import type { PostEffectTrack } from '../../../types/postEffect';
import { cn } from '@/lib/utils';

// Category colors for post effect blocks
const CATEGORY_COLORS: Record<string, { bg: string; border: string; selected: string }> = {
  distortion: { bg: 'bg-purple-500/20', border: 'border-purple-500/50', selected: 'bg-purple-500/40 border-purple-400' },
  blur: { bg: 'bg-fuchsia-500/20', border: 'border-fuchsia-500/50', selected: 'bg-fuchsia-500/40 border-fuchsia-400' },
  glow: { bg: 'bg-pink-500/20', border: 'border-pink-500/50', selected: 'bg-pink-500/40 border-pink-400' },
  color: { bg: 'bg-violet-500/20', border: 'border-violet-500/50', selected: 'bg-violet-500/40 border-violet-400' },
};

const DEFAULT_COLORS = { bg: 'bg-purple-500/20', border: 'border-purple-500/50', selected: 'bg-purple-500/40 border-purple-400' };

export interface PostEffectBlockProps {
  track: PostEffectTrack;
  pxPerFrame: number;
}

export const PostEffectBlockComponent: React.FC<PostEffectBlockProps> = React.memo(
  function PostEffectBlockComponent({ track, pxPerFrame }) {
    const block = track.effectBlock;
    const selectedPostEffectBlockId = useTimelineStore((s) => s.view.selectedPostEffectBlockId);
    const selectPostEffectBlock = useTimelineStore((s) => s.selectPostEffectBlock);
    const updatePostEffectBlockTiming = useTimelineStore((s) => s.updatePostEffectBlockTiming);
    const { recordUpdate } = usePostEffectBlockHistory();

    const isSelected = selectedPostEffectBlockId === block.id;
    const entry = getPostEffect(block.postEffectType);
    const colors = CATEGORY_COLORS[entry?.category ?? 'distortion'] ?? DEFAULT_COLORS;

    const left = block.startFrame * pxPerFrame;
    const width = Math.max(block.durationFrames * pxPerFrame, 4);

    // Drag state refs
    const dragRef = useRef<{
      startX: number;
      originalStart: number;
      originalDuration: number;
      mode: 'move' | 'resize-left' | 'resize-right';
    } | null>(null);

    const handleMouseDown = useCallback(
      (e: React.MouseEvent, mode: 'move' | 'resize-left' | 'resize-right') => {
        e.stopPropagation();
        e.preventDefault();

        const beforeBlock = structuredClone(block);

        dragRef.current = {
          startX: e.clientX,
          originalStart: block.startFrame,
          originalDuration: block.durationFrames,
          mode,
        };

        const handleMouseMove = (me: MouseEvent) => {
          if (!dragRef.current) return;
          const dx = me.clientX - dragRef.current.startX;
          const frameDelta = Math.round(dx / pxPerFrame);

          switch (dragRef.current.mode) {
            case 'move': {
              const newStart = Math.max(0, dragRef.current.originalStart + frameDelta);
              updatePostEffectBlockTiming(block.id, newStart, dragRef.current.originalDuration);
              break;
            }
            case 'resize-left': {
              const newStart = Math.max(0, dragRef.current.originalStart + frameDelta);
              const newDuration = Math.max(1, dragRef.current.originalDuration - frameDelta);
              updatePostEffectBlockTiming(block.id, newStart, newDuration);
              break;
            }
            case 'resize-right': {
              const newDuration = Math.max(1, dragRef.current.originalDuration + frameDelta);
              updatePostEffectBlockTiming(block.id, dragRef.current.originalStart, newDuration);
              break;
            }
          }
        };

        const handleMouseUp = () => {
          const changed = dragRef.current &&
            (dragRef.current.originalStart !== block.startFrame ||
             dragRef.current.originalDuration !== block.durationFrames);
          dragRef.current = null;
          window.removeEventListener('mousemove', handleMouseMove);
          window.removeEventListener('mouseup', handleMouseUp);
          if (changed) {
            recordUpdate(block.id, beforeBlock);
          }
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
      },
      [block, pxPerFrame, updatePostEffectBlockTiming, recordUpdate],
    );

    return (
      <div
        className={cn(
          'absolute top-0.5 h-[20px] rounded border cursor-move',
          block.enabled ? '' : 'opacity-40',
          isSelected ? colors.selected : `${colors.bg} ${colors.border}`,
        )}
        style={{ left, width }}
        onMouseDown={(e) => {
          selectPostEffectBlock(block.id);
          handleMouseDown(e, 'move');
        }}
        onClick={(e) => {
          e.stopPropagation();
          selectPostEffectBlock(block.id);
        }}
      >
        {/* Left resize handle */}
        <div
          className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-purple-400/40 rounded-l"
          onMouseDown={(e) => handleMouseDown(e, 'resize-left')}
        />

        {/* Label */}
        {width > 40 && (
          <span className="text-[9px] text-foreground/60 px-1.5 truncate block leading-[20px] pointer-events-none">
            {entry?.name ?? block.postEffectType}
          </span>
        )}

        {/* Right resize handle */}
        <div
          className="absolute right-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-purple-400/40 rounded-r"
          onMouseDown={(e) => handleMouseDown(e, 'resize-right')}
        />
      </div>
    );
  },
);
