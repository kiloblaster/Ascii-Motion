/**
 * Effect Track Row — renders as a label in the left panel of the timeline.
 *
 * Shows: eye toggle (bypass), effect icon + name, expand arrow for keyframe sub-tracks.
 * Supports drag-and-drop reorder via parent.
 */

import React, { useCallback } from 'react';
import { useTimelineStore } from '../../../stores/timelineStore';
import { cn } from '@/lib/utils';
import { Eye, EyeOff, ChevronRight, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../ui/tooltip';
import type { EffectTrack } from '../../../types/effectBlock';
import { getEffect } from '../../../registry/effectRegistry';

interface EffectTrackRowProps {
  track: EffectTrack;
  isExpanded: boolean;
}

export const EffectTrackRow: React.FC<EffectTrackRowProps> = React.memo(function EffectTrackRow({
  track,
  isExpanded,
}) {
  const toggleEffectBlockEnabled = useTimelineStore((s) => s.toggleEffectBlockEnabled);
  const toggleEffectTrackExpanded = useTimelineStore((s) => s.toggleEffectTrackExpanded);
  const removeEffectBlock = useTimelineStore((s) => s.removeEffectBlock);
  const selectEffectBlock = useTimelineStore((s) => s.selectEffectBlock);
  const selectedEffectBlockId = useTimelineStore((s) => s.view.selectedEffectBlockId);

  const block = track.effectBlock;
  const entry = getEffect(block.effectType);
  const isSelected = selectedEffectBlockId === block.id;
  const Icon = entry?.icon;

  const handleToggleEnabled = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    toggleEffectBlockEnabled(block.id);
  }, [block.id, toggleEffectBlockEnabled]);

  const handleToggleExpanded = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    toggleEffectTrackExpanded(block.id);
  }, [block.id, toggleEffectTrackExpanded]);

  const handleRemove = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    removeEffectBlock(track.ownerId, block.id);
  }, [track.ownerId, block.id, removeEffectBlock]);

  const handleSelect = useCallback(() => {
    selectEffectBlock(block.id);
  }, [block.id, selectEffectBlock]);

  return (
    <div
      className={cn(
        'flex items-center pl-4 pr-1.5 min-h-[24px] border-b border-border/30 text-[10px] cursor-pointer',
        'hover:bg-muted/30',
        isSelected && 'bg-accent/30',
        !block.enabled && 'opacity-50',
      )}
      onClick={handleSelect}
    >
      {/* Expand arrow */}
      <button
        className="w-3 h-3 flex items-center justify-center text-muted-foreground hover:text-foreground mr-0.5 shrink-0"
        onClick={handleToggleExpanded}
      >
        <ChevronRight className={cn('w-2.5 h-2.5 transition-transform', isExpanded && 'rotate-90')} />
      </button>

      {/* Eye toggle */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="w-4 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
              onClick={handleToggleEnabled}
            >
              {block.enabled
                ? <Eye className="w-3 h-3" />
                : <EyeOff className="w-3 h-3 text-muted-foreground/50" />
              }
            </button>
          </TooltipTrigger>
          <TooltipContent side="top"><p>{block.enabled ? 'Disable effect' : 'Enable effect'}</p></TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Icon + name */}
      <div className="flex items-center gap-1 ml-1 flex-1 min-w-0">
        {Icon && <Icon className="w-3 h-3 text-muted-foreground shrink-0" />}
        <span className="truncate text-foreground/80">
          {entry?.name ?? block.effectType}
        </span>
      </div>

      {/* Delete */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="w-3 h-3 flex items-center justify-center text-muted-foreground/50 hover:text-destructive shrink-0 ml-1"
              onClick={handleRemove}
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top"><p>Remove effect</p></TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
});
